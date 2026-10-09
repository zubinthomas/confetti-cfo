<#
.SYNOPSIS
Dumps Tally's raw Trial Balance response and its tag shape.

Sends the exact request the agent's new standing check sends
(build_trial_balance_request: TYPE=Data, ID="Trial Balance", no
EXPLODEFLAG, no date range) and saves the raw response, so a mismatch
between what agent.log reports and what agent/README.md documents as the
confirmed shape can be seen directly, without a rebuild. Read-only:
TALLYREQUEST is always Export.

.EXAMPLE
.\check_trial_balance_raw.ps1 -Company "CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)"
#>
param(
    [Parameter(Mandatory = $true)][string]$Company,
    [string]$Url = "http://localhost:9001",
    [string]$OutPath = (Join-Path (Get-Location) "trial_balance_response.xml")
)

$ErrorActionPreference = "Stop"
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$CompanyXml = [System.Security.SecurityElement]::Escape($Company)

$Body = @'
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

$raw = Send-Export $Body
Set-Content -Path $OutPath -Value $raw -Encoding UTF8
Write-Host "saved raw response to $OutPath ($($raw.Length) chars)"

if ($raw -match 'LINEERROR') {
    Write-Host ""
    Write-Host "*** response contains a LINEERROR - likely a bad SVCURRENTCOMPANY or report ID, not a shape problem:"
    [regex]::Matches($raw, '<LINEERROR>.*?</LINEERROR>') | ForEach-Object { Write-Host "  $($_.Value)" }
}

try {
    $doc = [xml]$raw
} catch {
    Write-Host ""
    Write-Host "response is not valid XML even after stripping invalid char refs: $($_.Exception.Message)"
    Write-Host "(raw response is still saved at $OutPath for inspection)"
    exit 1
}

$root = $doc.DocumentElement
Write-Host ""
Write-Host "root element: $($root.Name)"
Write-Host "direct children of root, first 20 names in order:"
$root.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] } | Select-Object -First 20 -ExpandProperty Name |
    ForEach-Object { Write-Host "  $_" }

$dspAccName = $doc.SelectNodes('//DSPACCNAME')
$dspAccInfo = $doc.SelectNodes('//DSPACCINFO')
Write-Host ""
Write-Host "DSPACCNAME anywhere in the document: $($dspAccName.Count)"
Write-Host "DSPACCINFO anywhere in the document: $($dspAccInfo.Count)"

Write-Host ""
Write-Host "tag shape of the response (count, path):"
Get-TagPaths $root '' |
    Group-Object |
    Sort-Object Count -Descending |
    Select-Object -First 40 |
    ForEach-Object { Write-Host ("{0,6}  {1}" -f $_.Count, $_.Name) }
