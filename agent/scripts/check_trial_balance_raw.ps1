<#
.SYNOPSIS
Reconciles Tally's own Trial Balance report against the raw ledger-balances
Collection, group by primary group - not just as a single grand total.

Background (2026-10-09): a plain "do both grand totals net to zero" check
doesn't work. Tally won't save an unbalanced voucher, so its own Trial
Balance report nets to ~0 almost by construction - that's not actually
testing anything. And a naive sum of every ledger's raw CLOSINGBALANCE
doesn't match it either, but not because of a data bug: the single
RESERVEDNAME="Profit & Loss A/c" ledger holds the company's accumulated
retained earnings from prior years, while Trial Balance's own "Profit &
Loss A/c" line is a figure Tally computes on the fly for display (the
current, not-yet-closed year's running profit) - the two are legitimately
different numbers, confirmed against a real capture from this client.

So instead this script does what the agent's standing check is being
rebuilt to do: pull Tally's Group collection (every group's immediate
PARENT, so a ledger's chain can be walked up to its primary group), roll
up every ledger's raw CLOSINGBALANCE by primary group, and compare each
rolled-up total against Trial Balance's own per-group figure - skipping
only "Profit & Loss A/c" for the reason above. If every other primary
group's raw rollup matches Trial Balance's own total for that group, the
agent's ledger-balances pull and its sign convention are confirmed correct
against Tally's own authoritative report, group by group - a real
diagnostic, not a tautology. Read-only: TALLYREQUEST is always Export.

.EXAMPLE
.\check_trial_balance_raw.ps1 -Company "CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)"
#>
param(
    [Parameter(Mandatory = $true)][string]$Company,
    [string]$Url = "http://localhost:9001",
    [string]$TrialBalanceOutPath = (Join-Path (Get-Location) "trial_balance_response.xml"),
    [string]$LedgerBalancesOutPath = (Join-Path (Get-Location) "ledger_balances_response.xml"),
    [string]$GroupHierarchyOutPath = (Join-Path (Get-Location) "group_hierarchy_response.xml")
)

$ErrorActionPreference = "Stop"
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$CompanyXml = [System.Security.SecurityElement]::Escape($Company)
$Tolerance = 1.0
# Tally computes this one on the fly for display (current-year running
# profit), not a literal rollup of its reserved ledger's own balance - see
# the header comment above. Excluded from the per-group comparison below.
$SkipGroups = @('Profit & Loss A/c')

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

# UNVERIFIED shape - built by analogy with the two Ledger collections above
# (same NATIVEMETHOD pattern, TYPE=Group instead of TYPE=Ledger). This
# script's own dump of the raw response and group count is what confirms or
# corrects that assumption.
$GroupHierarchyBody = @'
<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>ConfettiGroupHierarchy</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVCURRENTCOMPANY>__COMPANY__</SVCURRENTCOMPANY>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="ConfettiGroupHierarchy" ISMODIFY="No">
      <TYPE>Group</TYPE>
      <NATIVEMETHOD>Name</NATIVEMETHOD>
      <NATIVEMETHOD>Parent</NATIVEMETHOD>
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

$tbByGroup = @{}
$tbTotal = 0.0
if ($null -ne $tbDoc) {
    $groups = $tbDoc.SelectNodes('/ENVELOPE/DSPACCNAME')
    Write-Host "Trial Balance groups found: $($groups.Count)"
    foreach ($g in $groups) {
        $nameNode = $g.SelectSingleNode('DSPDISPNAME')
        $name = if ($nameNode) { $nameNode.InnerText.Trim() } else { '' }
        if ($name -eq '') { continue }
        $info = $g.NextSibling
        while ($null -ne $info -and $info -isnot [System.Xml.XmlElement]) { $info = $info.NextSibling }
        if ($null -eq $info -or $info.Name -ne 'DSPACCINFO') { continue }
        $drNode = $info.SelectSingleNode('DSPCLDRAMT/DSPCLDRAMTA')
        $crNode = $info.SelectSingleNode('DSPCLCRAMT/DSPCLCRAMTA')
        $dr = if ($null -ne $drNode) { Get-Amount $drNode.InnerText } else { $null }
        $cr = if ($null -ne $crNode) { Get-Amount $crNode.InnerText } else { $null }
        $net = (0.0 + $dr) + (0.0 + $cr)
        $tbByGroup[$name] = $net
        $tbTotal += $net
    }
    Write-Host ("Trial Balance grand total (expected ~0 - Tally won't save an unbalanced voucher): {0:N2}" -f $tbTotal)
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

$ledgers = @()  # [pscustomobject]@{ Name; Parent; Amount }
if ($null -ne $lbDoc) {
    $ledgerNodes = $lbDoc.SelectNodes('//LEDGER')
    Write-Host "LEDGER rows found: $($ledgerNodes.Count)"
    $byName = @{}
    $emptyCount = 0
    foreach ($node in $ledgerNodes) {
        $name = $node.GetAttribute('NAME')
        if (-not $name) { continue }
        $parentNode = $node.SelectSingleNode('PARENT')
        $parent = if ($null -ne $parentNode) { $parentNode.InnerText.Trim() } else { '' }
        $clNode = $node.SelectSingleNode('CLOSINGBALANCE')
        $amt = if ($null -ne $clNode) { Get-Amount $clNode.InnerText } else { $null }
        if ($null -eq $amt) { $emptyCount++; continue }
        $ledgers += [pscustomobject]@{ Name = $name; Parent = $parent; Amount = $amt }
        if ($byName.ContainsKey($name)) { $byName[$name] += @($amt) } else { $byName[$name] = @($amt) }
    }
    Write-Host "rows skipped (no parseable CLOSINGBALANCE, matching the agent's own behavior): $emptyCount"
    $lbTotal = ($ledgers | Measure-Object -Property Amount -Sum).Sum
    Write-Host ("ledger balances grand total: {0:N2}" -f $lbTotal)

    Write-Host ""
    $dupes = @($byName.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 })
    Write-Host "ledger NAMEs appearing more than once (each would be double-counted by a naive sum): $($dupes.Count)"
    foreach ($d in ($dupes | Select-Object -First 30)) {
        $sum = ($d.Value | Measure-Object -Sum).Sum
        Write-Host ("  '{0}': {1} occurrences, values [{2}], sum if all counted {3:N2}" -f $d.Key, $d.Value.Count, ($d.Value -join ', '), $sum)
    }
}

# ── Group hierarchy Collection ──────────────────────────────────────────────
Write-Host ""
$ghRaw = Send-Export $GroupHierarchyBody
Set-Content -Path $GroupHierarchyOutPath -Value $ghRaw -Encoding UTF8
Write-Host "saved group hierarchy response to $GroupHierarchyOutPath ($($ghRaw.Length) chars)"

if ($ghRaw -match 'LINEERROR') {
    Write-Host ""
    Write-Host "*** group hierarchy response contains a LINEERROR - the TYPE=Group Collection shape may be wrong:"
    [regex]::Matches($ghRaw, '<LINEERROR>.*?</LINEERROR>') | ForEach-Object { Write-Host "  $($_.Value)" }
}

$ghDoc = $null
try { $ghDoc = [xml]$ghRaw } catch {
    Write-Host "group hierarchy response is not valid XML: $($_.Exception.Message)"
}

$parentOf = @{}  # group name -> immediate parent name (empty/missing = primary)
if ($null -ne $ghDoc) {
    $groupNodes = $ghDoc.SelectNodes('//GROUP')
    Write-Host "GROUP rows found: $($groupNodes.Count)"
    foreach ($node in $groupNodes) {
        $name = $node.GetAttribute('NAME')
        if (-not $name) { continue }
        $parentNode = $node.SelectSingleNode('PARENT')
        $parent = if ($null -ne $parentNode) { $parentNode.InnerText.Trim() } else { '' }
        $parentOf[$name] = $parent
    }
}

# ── Roll up ledger balances to primary group, walking the parent chain ─────
function Get-PrimaryGroup([string]$StartGroup, [hashtable]$ParentOf) {
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $current = $StartGroup
    while ($true) {
        if (-not $seen.Add($current)) { return $current }  # cycle guard
        if ($seen.Count -gt 50) { return $current }  # depth guard
        if (-not $ParentOf.ContainsKey($current)) { return $current }  # not a known group - treat as its own root
        $parent = $ParentOf[$current]
        # Tally's root sentinel: the reserved Profit & Loss A/c ledger came
        # back with PARENT="Primary" literally (not empty) in the real
        # capture - treat either convention as "reached a primary group",
        # not as another name to recurse into.
        if ($parent -eq '' -or $parent -eq 'Primary') { return $current }
        $current = $parent
    }
}

if ($ledgers.Count -gt 0 -and $parentOf.Count -gt 0) {
    Write-Host ""
    Write-Host "── reconciling raw ledger rollup against Trial Balance, per primary group ──"
    $rollup = @{}
    foreach ($l in $ledgers) {
        if ($l.Parent -eq '') { continue }
        $primary = Get-PrimaryGroup $l.Parent $parentOf
        if ($rollup.ContainsKey($primary)) { $rollup[$primary] += $l.Amount } else { $rollup[$primary] = $l.Amount }
    }

    $allGroupNames = @($rollup.Keys) + @($tbByGroup.Keys) | Select-Object -Unique
    $mismatches = 0
    foreach ($name in ($allGroupNames | Sort-Object)) {
        if ($SkipGroups -contains $name) {
            $rawVal = if ($rollup.ContainsKey($name)) { $rollup[$name] } else { 0.0 }
            $tbVal = if ($tbByGroup.ContainsKey($name)) { $tbByGroup[$name] } else { 0.0 }
            Write-Host ("  {0,-30} SKIPPED (see header comment) - raw rollup {1,15:N2}  Trial Balance {2,15:N2}" -f $name, $rawVal, $tbVal)
            continue
        }
        $rawVal = if ($rollup.ContainsKey($name)) { $rollup[$name] } else { $null }
        $tbVal = if ($tbByGroup.ContainsKey($name)) { $tbByGroup[$name] } else { $null }
        $rawNum = 0.0 + $rawVal
        $tbNum = 0.0 + $tbVal
        $diff = $rawNum - $tbNum
        $flag = ''
        if ([Math]::Abs($diff) -gt $Tolerance) {
            $flag = '  <-- MISMATCH'
            $mismatches++
        }
        $rawStr = if ($null -eq $rawVal) { '(none)' } else { "{0:N2}" -f $rawVal }
        $tbStr = if ($null -eq $tbVal) { '(none)' } else { "{0:N2}" -f $tbVal }
        Write-Host ("  {0,-30} raw rollup {1,15}  Trial Balance {2,15}  diff {3,15:N2}{4}" -f $name, $rawStr, $tbStr, $diff, $flag)
    }
    Write-Host ""
    $skippedPresent = @($SkipGroups | Where-Object { $allGroupNames -contains $_ })
    Write-Host "primary groups compared: $($allGroupNames.Count - $skippedPresent.Count), mismatches beyond $Tolerance tolerance: $mismatches"
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
