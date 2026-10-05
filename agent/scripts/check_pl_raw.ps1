<#
.SYNOPSIS
Checks Tally's P&L report against the raw ledger balances for a date range.

Sends the same two requests the agent sends (a ledger range Collection and the
period report) and reconciles them the way the agent does. Read-only: every
request is TALLYREQUEST=Export.

.EXAMPLE
.\check_pl_raw.ps1 -Company "CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)"

From defaults to the 1st of this month and To to today, matching the agent's month-to-date pull.

Both raw responses are written to tally_response.xml in the current folder
(overwritten on each run), wrapped in one root element.
#>
param(
    [Parameter(Mandatory = $true)][string]$Company,
    [string]$From = (Get-Date -Day 1).ToString('yyyyMMdd'),
    [string]$To = (Get-Date).ToString('yyyyMMdd'),
    [string]$Url = "http://localhost:9001",
    [string]$Report = "Profit and Loss",
    [string]$OutPath = (Join-Path (Get-Location) "tally_response.xml")
)

$ErrorActionPreference = "Stop"
$Tolerance = 0.01
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$CompanyXml = [System.Security.SecurityElement]::Escape($Company)
$ReportXml = [System.Security.SecurityElement]::Escape($Report)

$RangeBody = @'
<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>ConfettiLedgerRange</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVFROMDATE TYPE="Date">__FROM__</SVFROMDATE>
    <SVTODATE TYPE="Date">__TO__</SVTODATE>
    <SVCURRENTCOMPANY>__COMPANY__</SVCURRENTCOMPANY>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="ConfettiLedgerRange" ISMODIFY="No">
      <TYPE>Ledger</TYPE>
      <NATIVEMETHOD>Name</NATIVEMETHOD>
      <NATIVEMETHOD>Parent</NATIVEMETHOD>
      <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
      <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>
'@

$PeriodBody = @'
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>__REPORT__</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <EXPLODEFLAG>Yes</EXPLODEFLAG>
    <SVFROMDATE TYPE="Date">__FROM__</SVFROMDATE>
    <SVTODATE TYPE="Date">__TO__</SVTODATE>
    <SVCURRENTCOMPANY>__COMPANY__</SVCURRENTCOMPANY>
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>
'@

function Set-Placeholders([string]$Template) {
    return $Template.Replace('__FROM__', $From).Replace('__TO__', $To).Replace('__COMPANY__', $CompanyXml).Replace('__REPORT__', $ReportXml)
}

# Tally writes some control characters as numeric references (e.g. &#4;), which
# XML 1.0 forbids. Drop the references that aren't legal XML characters.
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

function Get-Amount($Text) {
    if ($null -eq $Text) { return 0.0 }
    $trimmed = ([string]$Text).Trim()
    if ($trimmed -eq "") { return 0.0 }
    $clean = -join ($trimmed.ToCharArray() | Where-Object { $_ -match '[0-9.\-]' })
    return [double]::Parse($clean, $Inv)
}

function Read-Range([xml]$Doc) {
    $rows = @{}
    foreach ($node in $Doc.SelectNodes('//LEDGER')) {
        $name = $node.GetAttribute('NAME')
        if (-not $name) { continue }
        $op = $node.SelectSingleNode('OPENINGBALANCE')
        $cl = $node.SelectSingleNode('CLOSINGBALANCE')
        if ($null -eq $op -or $null -eq $cl) {
            throw "ledger '$name' is missing OPENINGBALANCE or CLOSINGBALANCE"
        }
        $parent = ''
        $parentNode = $node.SelectSingleNode('PARENT')
        if ($null -ne $parentNode) { $parent = $parentNode.InnerText }
        $rows[$name] = [pscustomobject]@{
            Name    = $name
            Parent  = $parent
            Opening = (Get-Amount $op.InnerText)
            Closing = (Get-Amount $cl.InnerText)
        }
    }
    return $rows
}

# The P&L response is flat: a group heading (DSPACCNAME, then PLAMT) followed by
# ledger rows (BSNAME, then BSAMT). Only ledger rows are read; the signed amount is BSSUBAMT.
function Read-Period([xml]$Doc) {
    $rows = @{}
    foreach ($node in $Doc.DocumentElement.ChildNodes) {
        if ($node -isnot [System.Xml.XmlElement] -or $node.Name -ne 'BSNAME') { continue }
        $display = $node.SelectSingleNode('DSPACCNAME/DSPDISPNAME')
        if ($null -eq $display) { continue }
        $name = $display.InnerText.Trim()
        if ($name -eq '') { continue }
        $amountNode = $node.NextSibling
        while ($null -ne $amountNode -and $amountNode -isnot [System.Xml.XmlElement]) {
            $amountNode = $amountNode.NextSibling
        }
        if ($null -eq $amountNode -or $amountNode.Name -ne 'BSAMT') {
            throw "ledger row '$name' is not followed by a BSAMT element"
        }
        $sub = $amountNode.SelectSingleNode('BSSUBAMT')
        $net = 0.0
        if ($null -ne $sub) { $net = Get-Amount $sub.InnerText }
        if ($rows.ContainsKey($name)) { $net = $rows[$name] + $net }
        $rows[$name] = $net
    }
    return [pscustomobject]@{ Rows = $rows }
}

function Get-TagPaths($Element, [string]$Path) {
    $current = $Element.Name
    if ($Path -ne '') { $current = "$Path/$($Element.Name)" }
    $current
    foreach ($child in $Element.ChildNodes) {
        if ($child -is [System.Xml.XmlElement]) { Get-TagPaths $child $current }
    }
}

# Save first, so the raw responses are kept even if parsing fails.
$rangeXml = Send-Export (Set-Placeholders $RangeBody)
$periodXml = Send-Export (Set-Placeholders $PeriodBody)
function Remove-XmlDeclaration([string]$Text) { return ($Text -replace '^\s*<\?xml[^>]*\?>', '') }
$combined = "<TALLY_CHECK>`n<PERIOD_RESPONSE>`n" + (Remove-XmlDeclaration $periodXml) + "`n</PERIOD_RESPONSE>`n<RANGE_RESPONSE>`n" + (Remove-XmlDeclaration $rangeXml) + "`n</RANGE_RESPONSE>`n</TALLY_CHECK>"
Set-Content -Path $OutPath -Value $combined -Encoding UTF8
Write-Host "saved both raw responses to $OutPath"

try {
    $rangeDoc = [xml]$rangeXml
    $periodDoc = [xml]$periodXml
} catch {
    throw "a response was not valid XML (both are saved in $OutPath): $($_.Exception.Message)"
}

$range = Read-Range $rangeDoc
$period = Read-Period $periodDoc
$totalClosing = 0.0
foreach ($r in $range.Values) { $totalClosing += $r.Closing }

Write-Host ""
Write-Host "ledger range rows: $($range.Count)"
Write-Host ("books check (sum of all closing balances, should be about 0): {0:N2}" -f $totalClosing)
Write-Host "period report: $($period.Rows.Count) ledger rows (group headings skipped)"

$problems = @()
foreach ($name in $period.Rows.Keys) {
    $rawNet = 0.0
    if ($range.ContainsKey($name)) { $rawNet = $range[$name].Closing - $range[$name].Opening }
    $reportNet = $period.Rows[$name]
    if ([Math]::Abs($reportNet - $rawNet) -gt $Tolerance) {
        $problems += [pscustomobject]@{ Name = $name; Report = $reportNet; Raw = $rawNet }
    }
}

$onlyInRaw = @()
foreach ($r in $range.Values) {
    $net = $r.Closing - $r.Opening
    if (-not $period.Rows.ContainsKey($r.Name) -and [Math]::Abs($net) -gt $Tolerance) {
        $onlyInRaw += [pscustomobject]@{ Name = $r.Name; Raw = $net }
    }
}

Write-Host ""
Write-Host "rows that disagree (report vs raw closing minus opening): $($problems.Count)"
foreach ($p in ($problems | Select-Object -First 50)) {
    Write-Host ("  '{0}': report {1:N2}  raw {2:N2}" -f $p.Name, $p.Report, $p.Raw)
}
Write-Host "raw ledgers with movement that the report does not name: $($onlyInRaw.Count)"
foreach ($o in ($onlyInRaw | Select-Object -First 20)) {
    Write-Host ("  '{0}': raw {1:N2}" -f $o.Name, $o.Raw)
}

Write-Host ""
Write-Host "tag shape of the period response (count, path):"
Get-TagPaths $periodDoc.DocumentElement '' |
    Group-Object |
    Sort-Object Count -Descending |
    Select-Object -First 40 |
    ForEach-Object { Write-Host ("{0,6}  {1}" -f $_.Count, $_.Name) }

if ($problems.Count -gt 0 -or $onlyInRaw.Count -gt 0) { exit 1 }
