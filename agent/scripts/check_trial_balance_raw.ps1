<#
.SYNOPSIS
Dumps Tally's raw Trial Balance response alongside the raw ledger-balances
Collection, and cross-checks their grand totals.

Sends two of the agent's exact requests (build_trial_balance_request and
build_ledger_balances_request: TYPE=Data ID="Trial Balance", and the
ConfettiLedgerBalances Collection) and compares their totals. These two
MUST sum to the same figure - Trial Balance is nothing but a grouped
rollup of the same ledger closing balances the Collection returns - so any
difference points at a parsing bug (most likely a duplicate ledger NAME
being double-counted, or a sign/number parsing miss on one row), not a
real client-books problem. Read-only: TALLYREQUEST is always Export.

.EXAMPLE
.\check_trial_balance_raw.ps1 -Company "CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)"
#>
param(
    [Parameter(Mandatory = $true)][string]$Company,
    [string]$Url = "http://localhost:9001",
    [string]$TrialBalanceOutPath = (Join-Path (Get-Location) "trial_balance_response.xml"),
    [string]$LedgerBalancesOutPath = (Join-Path (Get-Location) "ledger_balances_response.xml")
)

$ErrorActionPreference = "Stop"
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$CompanyXml = [System.Security.SecurityElement]::Escape($Company)

$TrialBalanceBody = @'
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>Trial Balance</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVCURRENTCOMPANY>__COMPANY__</SVCURRENTCOMPANY>
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>
'@.Replace('__COMPANY__', $CompanyXml)

$LedgerBalancesBody = @'
<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>ConfettiLedgerBalances</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVCURRENTCOMPANY>__COMPANY__</SVCURRENTCOMPANY>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="ConfettiLedgerBalances" ISMODIFY="No">
      <TYPE>Ledger</TYPE>
      <NATIVEMETHOD>Name</NATIVEMETHOD>
      <NATIVEMETHOD>Parent</NATIVEMETHOD>
      <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>
'@.Replace('__COMPANY__', $CompanyXml)

# Tally writes some control characters as numeric references (e.g. &#4;), which
# XML 1.0 forbids. Drop the references that aren't legal XML characters - same
# fix as strip_invalid_char_refs in tally_client.rs and check_pl_raw.ps1.
function Test-XmlChar([int]$Code) {
    return ($Code -eq 9) -or ($Code -eq 10) -or ($Code -eq 13) -or
        ($Code -ge 32 -and $Code -le 55295) -or ($Code -ge 57344 -and $Code -le 65533) -or
        ($Code -ge 65536 -and $Code -le 1114111)
}

function Remove-InvalidCharRefs([string]$Text) {
    $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
        param($m)
        $body = $m.Groups[1].Value
        if ($body[0] -eq 'x' -or $body[0] -eq 'X') {
            $code = [Convert]::ToInt32($body.Substring(1), 16)
        } else {
            $code = [int]$body
        }
        if (Test-XmlChar $code) { return $m.Value }
        return ''
    }
    return [regex]::Replace($Text, '&#([xX][0-9a-fA-F]+|[0-9]+);', $evaluator)
}

function Send-Export([string]$Body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $resp = Invoke-WebRequest -Uri $Url -Method Post -Body $bytes -ContentType "text/xml" -UseBasicParsing
    $content = $resp.Content
    if ($content -is [byte[]]) { $content = [System.Text.Encoding]::UTF8.GetString($content) }
    return (Remove-InvalidCharRefs ([string]$content))
}

function Get-TagPaths($Element, [string]$Path) {
    $current = $Element.Name
    if ($Path -ne '') { $current = "$Path/$($Element.Name)" }
    $current
    foreach ($child in $Element.ChildNodes) {
        if ($child -is [System.Xml.XmlElement]) { Get-TagPaths $child $current }
    }
}

function Get-Amount($Text) {
    if ($null -eq $Text) { return $null }
    $trimmed = ([string]$Text).Trim()
    if ($trimmed -eq "") { return $null }
    $clean = -join ($trimmed.ToCharArray() | Where-Object { $_ -match '[0-9.\-]' })
    if ($clean -eq "") { return $null }
    return [double]::Parse($clean, $Inv)
}

# ── Trial Balance ───────────────────────────────────────────────────────────
$tbRaw = Send-Export $TrialBalanceBody
Set-Content -Path $TrialBalanceOutPath -Value $tbRaw -Encoding UTF8
Write-Host "saved Trial Balance response to $TrialBalanceOutPath ($($tbRaw.Length) chars)"

if ($tbRaw -match 'LINEERROR') {
    Write-Host ""
    Write-Host "*** Trial Balance response contains a LINEERROR:"
    [regex]::Matches($tbRaw, '<LINEERROR>.*?</LINEERROR>') | ForEach-Object { Write-Host "  $($_.Value)" }
}

$tbDoc = $null
try { $tbDoc = [xml]$tbRaw } catch {
    Write-Host "Trial Balance response is not valid XML: $($_.Exception.Message)"
}

$tbTotal = 0.0
if ($null -ne $tbDoc) {
    $groups = $tbDoc.SelectNodes('/ENVELOPE/DSPACCNAME')
    Write-Host "Trial Balance groups found: $($groups.Count)"
    foreach ($g in $groups) {
        $nameNode = $g.SelectSingleNode('DSPDISPNAME')
        $name = if ($nameNode) { $nameNode.InnerText.Trim() } else { '' }
        $info = $g.NextSibling
        while ($null -ne $info -and $info -isnot [System.Xml.XmlElement]) { $info = $info.NextSibling }
        if ($null -eq $info -or $info.Name -ne 'DSPACCINFO') { continue }
        $drNode = $info.SelectSingleNode('DSPCLDRAMT/DSPCLDRAMTA')
        $crNode = $info.SelectSingleNode('DSPCLCRAMT/DSPCLCRAMTA')
        $dr = if ($null -ne $drNode) { Get-Amount $drNode.InnerText } else { $null }
        $cr = if ($null -ne $crNode) { Get-Amount $crNode.InnerText } else { $null }
        $net = (0.0 + $dr) + (0.0 + $cr)
        $tbTotal += $net
    }
    Write-Host ("Trial Balance grand total (should be ~0): {0:N2}" -f $tbTotal)
}

# ── Ledger balances Collection (what fetch_ledger_balances / the live agent uses) ──
Write-Host ""
$lbRaw = Send-Export $LedgerBalancesBody
Set-Content -Path $LedgerBalancesOutPath -Value $lbRaw -Encoding UTF8
Write-Host "saved ledger balances response to $LedgerBalancesOutPath ($($lbRaw.Length) chars)"

$lbDoc = $null
try { $lbDoc = [xml]$lbRaw } catch {
    Write-Host "ledger balances response is not valid XML: $($_.Exception.Message)"
}

if ($null -ne $lbDoc) {
    $ledgerNodes = $lbDoc.SelectNodes('//LEDGER')
    Write-Host "LEDGER rows found: $($ledgerNodes.Count)"
    $byName = @{}
    $lbTotal = 0.0
    $emptyCount = 0
    foreach ($node in $ledgerNodes) {
        $name = $node.GetAttribute('NAME')
        if (-not $name) { continue }
        $clNode = $node.SelectSingleNode('CLOSINGBALANCE')
        $amt = if ($null -ne $clNode) { Get-Amount $clNode.InnerText } else { $null }
        if ($null -eq $amt) { $emptyCount++; continue }
        $lbTotal += $amt
        if ($byName.ContainsKey($name)) {
            $byName[$name] += @($amt)
        } else {
            $byName[$name] = @($amt)
        }
    }
    Write-Host "rows skipped (no parseable CLOSINGBALANCE, matching the agent's own behavior): $emptyCount"
    Write-Host ("ledger balances grand total (should match Trial Balance above): {0:N2}" -f $lbTotal)

    Write-Host ""
    $dupes = @($byName.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 })
    Write-Host "ledger NAMEs appearing more than once (each would be double-counted by a naive sum): $($dupes.Count)"
    foreach ($d in ($dupes | Select-Object -First 30)) {
        $sum = ($d.Value | Measure-Object -Sum).Sum
        Write-Host ("  '{0}': {1} occurrences, values [{2}], sum if all counted {3:N2}" -f $d.Key, $d.Value.Count, ($d.Value -join ', '), $sum)
    }

    Write-Host ""
    Write-Host ("difference, Trial Balance total minus ledger balances total: {0:N2}" -f ($tbTotal - $lbTotal))
}

Write-Host ""
Write-Host "tag shape of the Trial Balance response (count, path):"
if ($null -ne $tbDoc) {
    Get-TagPaths $tbDoc.DocumentElement '' |
        Group-Object |
        Sort-Object Count -Descending |
        Select-Object -First 40 |
        ForEach-Object { Write-Host ("{0,6}  {1}" -f $_.Count, $_.Name) }
}
