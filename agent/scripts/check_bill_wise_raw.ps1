<#
.SYNOPSIS
Tests the bill-wise theory from tally-trial-balance-gap-report.md: do any of the
Current Assets ledgers with an empty CLOSINGBALANCE actually carry a real, open
bill that Tally's own Outstandings reports already know about?

.DESCRIPTION
Background: the standing Trial Balance check (check_trial_balance_raw.ps1) found
Current Assets short by a stable 1,422,622.01 against Tally's own Trial Balance
report, with 439 of its 728 ledgers reporting an empty CLOSINGBALANCE (259 of them
under Sundry Debtors). The working theory is that some of these use Tally's
bill-by-bill tracking, where a plain ClosingBalance NATIVEMETHOD doesn't resolve a
real balance - but Current Liabilities has even more empty-balance ledgers (674 of
1,112, under Sundry Creditors) and still reconciles exactly, so this is not
confirmed. This script tests it directly instead of assuming it.

Read-only: every request is TALLYREQUEST=Export, same convention as
check_trial_balance_raw.ps1 and check_pl_raw.ps1.

Method:
1. Re-pull the existing ConfettiLedgerBalances Collection (unchanged shape) to get
   the live ledger list with PARENT/CLOSINGBALANCE.
2. Filter for ledgers under the Current-Assets sub-groups named in the gap report
   (Sundry Debtors, Advance to Staff, Adv. to Outsider, Advance to Supplier, Loans
   & Advances (Asset)) whose CLOSINGBALANCE is empty - the receivables-side
   candidates - and print counts per group to sanity-check against the gap
   report's own breakdown (259 / 63 / 44 / 20 / 23).
3. Request Tally's own built-in "Bills Receivable" report (TYPE=Data, same
   report-export shape already confirmed working for "Profit and Loss" and
   "Trial Balance" against this install - EXPLODEFLAG=Yes for ledger-level rows).
   The request shape and report ID are confirmed working (captured 2026-10-16,
   no LINEERROR, real bill-wise data returned) - see Read-BillsReport's own
   comment for the confirmed response shape. Note: neither "Bills Receivable"
   nor "Bills Payable" turned out to be cleanly scoped by receivable/payable
   nature - both returned a mix of Sundry Debtors, Sundry Creditors, and Fixed
   Assets ledgers (any ledger with bill-by-bill tracking enabled, company-wide).
4. Cross-reference: how many of the empty-balance candidate ledgers from step 2
   appear in the Bills Receivable export with a real nonzero amount. Confirmed
   2026-10-16: zero of 409 did - every ledger that showed up in the bill-wise
   report already had a working plain CLOSINGBALANCE too, so this disproves the
   bill-wise theory for the Current Assets gap specifically (see
   tally-trial-balance-gap-report.md for that separate, still-open question).
5. Control group: run the identical check for Sundry Creditors against a "Bills
   Payable" report. Confirmed 2026-10-16: same result, zero of 674 - consistent
   with Current Liabilities already reconciling exactly.

.EXAMPLE
.\check_bill_wise_raw.ps1 -Company "CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)"
#>
param(
    [Parameter(Mandatory = $true)][string]$Company,
    [string]$Url = "http://localhost:9001",
    [string]$LedgerBalancesOutPath = (Join-Path (Get-Location) "bw_ledger_balances_response.xml"),
    [string]$BillsReceivableOutPath = (Join-Path (Get-Location) "bw_bills_receivable_response.xml"),
    [string]$BillsPayableOutPath = (Join-Path (Get-Location) "bw_bills_payable_response.xml")
)

$ErrorActionPreference = "Stop"
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$CompanyXml = [System.Security.SecurityElement]::Escape($Company)

# Current-Assets sub-groups named in tally-trial-balance-gap-report.md's own
# breakdown of the 439 empty-balance ledgers - the receivables-side candidates.
$ReceivableCandidateGroups = @(
    "Sundry Debtors",
    "Advance to Staff",
    "Adv. to Outsider",
    "Advance to Supplier",
    "Loans & Advances (Asset)"
)

# Control group: Sundry Creditors already reconciles exactly in the standing
# check despite having even more empty-balance ledgers (674 of 1,112) - used
# here as a sanity check, not expected to turn up much.
$PayableCandidateGroups = @("Sundry Creditors")

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

# Confirmed working against this install 2026-10-16 (no LINEERROR, real
# bill-wise data returned) - originally built by analogy with the
# already-confirmed "Profit and Loss"/"Trial Balance" TYPE=Data requests.
# "Bills Receivable"/"Bills Payable" are the standard reports under Tally's own
# Display > Statements of Accounts > Outstandings menu - see
# Read-BillsReport's own comment for the confirmed response shape, and its
# caller's summary for the caveat that these report IDs aren't cleanly scoped
# by receivable/payable nature on this install.
function Get-BillsReportBody([string]$ReportId) {
    $ReportXml = [System.Security.SecurityElement]::Escape($ReportId)
    return @"
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>$ReportXml</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>
    <EXPLODEFLAG>Yes</EXPLODEFLAG>
    <SVCURRENTCOMPANY>$CompanyXml</SVCURRENTCOMPANY>
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>
"@
}

# Tally writes some control characters as numeric references (e.g. &#4;), which
# XML 1.0 forbids. Drop the references that aren't legal XML characters - same
# fix as strip_invalid_char_refs in tally_client.rs and the other two scripts.
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

function Show-RawDiagnostics([string]$Label, [string]$Raw, [string]$OutPath) {
    Set-Content -Path $OutPath -Value $Raw -Encoding UTF8
    Write-Host "saved $Label response to $OutPath ($($Raw.Length) chars)"
    if ($Raw -match 'LINEERROR') {
        Write-Host "*** $Label response contains a LINEERROR - the report ID or shape is probably wrong:"
        [regex]::Matches($Raw, '<LINEERROR>.*?</LINEERROR>') | ForEach-Object { Write-Host "  $($_.Value)" }
    }
}

# ── Step 1: re-pull the ledger balances Collection ──────────────────────────
Write-Host "── pulling ConfettiLedgerBalances ──"
$lbRaw = Send-Export $LedgerBalancesBody
Show-RawDiagnostics "ledger balances" $lbRaw $LedgerBalancesOutPath

$lbDoc = $null
try { $lbDoc = [xml]$lbRaw } catch {
    throw "ledger balances response is not valid XML: $($_.Exception.Message)"
}

$allLedgers = @()  # [pscustomobject]@{ Name; Parent; HasBalance }
foreach ($node in $lbDoc.SelectNodes('//LEDGER')) {
    $name = $node.GetAttribute('NAME')
    if (-not $name) { continue }
    $parentNode = $node.SelectSingleNode('PARENT')
    $parent = if ($null -ne $parentNode) { $parentNode.InnerText.Trim() } else { '' }
    $clNode = $node.SelectSingleNode('CLOSINGBALANCE')
    $amt = if ($null -ne $clNode) { Get-Amount $clNode.InnerText } else { $null }
    $allLedgers += [pscustomobject]@{ Name = $name; Parent = $parent; HasBalance = ($null -ne $amt) }
}
Write-Host "LEDGER rows found: $($allLedgers.Count)"

# ── Step 2: filter empty-balance candidates per group, both sides ──────────
function Get-EmptyBalanceCandidates([string[]]$Groups) {
    $result = @{}
    foreach ($g in $Groups) {
        $emptyLedgers = @($allLedgers | Where-Object { $_.Parent -eq $g -and -not $_.HasBalance } | ForEach-Object { $_.Name })
        $result[$g] = $emptyLedgers
        Write-Host ("  {0,-30} empty-balance ledgers: {1}" -f $g, $emptyLedgers.Count)
    }
    return $result
}

Write-Host ""
Write-Host "── receivables-side candidates (empty CLOSINGBALANCE, by group) ──"
$receivableCandidates = Get-EmptyBalanceCandidates $ReceivableCandidateGroups
$allReceivableCandidates = @($receivableCandidates.Values | ForEach-Object { $_ })

Write-Host ""
Write-Host "── payables-side control group (empty CLOSINGBALANCE, by group) ──"
$payableCandidates = Get-EmptyBalanceCandidates $PayableCandidateGroups
$allPayableCandidates = @($payableCandidates.Values | ForEach-Object { $_ })

# ── Step 3: pull Tally's own Bills Receivable / Bills Payable reports ──────
function Read-BillsReport([string]$ReportId, [string]$Label, [string]$OutPath) {
    Write-Host ""
    Write-Host "── pulling '$ReportId' ──"
    $raw = Send-Export (Get-BillsReportBody $ReportId)
    Show-RawDiagnostics $Label $raw $OutPath

    $doc = $null
    try { $doc = [xml]$raw } catch {
        Write-Host "$Label response is not valid XML - cannot cross-reference. See the raw file and LINEERROR output above."
        return @{}
    }

    Write-Host "tag shape of the $Label response (count, path):"
    Get-TagPaths $doc.DocumentElement '' |
        Group-Object |
        Sort-Object Count -Descending |
        Select-Object -First 40 |
        ForEach-Object { Write-Host ("{0,6}  {1}" -f $_.Count, $_.Name) }

    # Confirmed shape - captured 2026-10-16 against this install's real "Bills
    # Receivable"/"Bills Payable" TYPE=Data report export (not the BSNAME/BSAMT
    # P&L shape originally guessed by analogy; this report is structured
    # differently). One bill is a flat run of ENVELOPE-level siblings:
    #   <BILLFIXED><BILLDATE>..</BILLDATE><BILLREF>..</BILLREF>
    #              <BILLPARTY>ledger name</BILLPARTY></BILLFIXED>
    #   <BILLCL>outstanding amount</BILLCL>
    #   <BILLDUE>due date</BILLDUE>
    #   <BILLOVERDUE>days overdue, pre-computed by Tally</BILLOVERDUE>
    #   <BILLVCHDATE>..</BILLVCHDATE><BILLVCHTYPE>..</BILLVCHTYPE>
    #   <BILLVCHNUMBER>..</BILLVCHNUMBER><BILLVCHAMOUNT>..</BILLVCHAMOUNT>
    # BILLPARTY is the ledger name; BILLCL is that bill's outstanding amount -
    # the field this script cross-references. Confirmed on real data that the
    # report is NOT cleanly split by receivable/payable nature: both "Bills
    # Receivable" and "Bills Payable" requests returned a mix of Sundry
    # Debtors, Sundry Creditors, and Fixed Assets ledgers (any ledger with
    # bill-by-bill tracking enabled, company-wide) - the report ID alone does
    # not scope the result the way its name suggests, so a real sync feature
    # built on this would need to classify each BILLPARTY by its own ledger
    # group (the existing ConfettiLedgerBalances pull already has this),
    # not trust which of the two report IDs returned it.
    $amountsByLedger = @{}
    foreach ($fixedNode in $doc.SelectNodes('//BILLFIXED')) {
        $partyNode = $fixedNode.SelectSingleNode('BILLPARTY')
        if ($null -eq $partyNode) { continue }
        $name = $partyNode.InnerText.Trim()
        if ($name -eq '') { continue }
        $clNode = $fixedNode.NextSibling
        while ($null -ne $clNode -and $clNode -isnot [System.Xml.XmlElement]) {
            $clNode = $clNode.NextSibling
        }
        if ($null -eq $clNode -or $clNode.Name -ne 'BILLCL') { continue }
        $amt = Get-Amount $clNode.InnerText
        if ($null -ne $amt) {
            if ($amountsByLedger.ContainsKey($name)) { $amountsByLedger[$name] += $amt } else { $amountsByLedger[$name] = $amt }
        }
    }
    Write-Host "$Label bills parsed: $($amountsByLedger.Count) distinct ledger names"
    return $amountsByLedger
}

$billsReceivable = Read-BillsReport "Bills Receivable" "Bills Receivable" $BillsReceivableOutPath
$billsPayable = Read-BillsReport "Bills Payable" "Bills Payable" $BillsPayableOutPath

# ── Step 4/5: cross-reference candidates against the bills reports ─────────
function Show-CrossReference([string]$SideLabel, [string[]]$Candidates, [hashtable]$BillsByLedger) {
    Write-Host ""
    Write-Host "── ${SideLabel}: empty-balance candidates found in the Bills report with a real amount ──"
    $found = @()
    $notFound = @()
    foreach ($name in $Candidates) {
        if ($BillsByLedger.ContainsKey($name) -and [Math]::Abs($BillsByLedger[$name]) -gt 0.01) {
            $found += [pscustomobject]@{ Name = $name; Amount = $BillsByLedger[$name] }
        } else {
            $notFound += $name
        }
    }
    Write-Host "candidates checked: $($Candidates.Count)"
    Write-Host "found with a real nonzero amount in the Bills report: $($found.Count)"
    foreach ($f in ($found | Select-Object -First 30)) {
        Write-Host ("  '{0}': {1:N2}" -f $f.Name, $f.Amount)
    }
    Write-Host "not found / still zero: $($notFound.Count)"
    return $found
}

$receivableHits = Show-CrossReference "Receivables" $allReceivableCandidates $billsReceivable
$payableHits = Show-CrossReference "Payables (control group)" $allPayableCandidates $billsPayable

Write-Host ""
Write-Host "── summary ──"
Write-Host "receivables-side candidates: $($allReceivableCandidates.Count), confirmed real via Bills Receivable: $($receivableHits.Count)"
Write-Host "payables-side candidates (control): $($allPayableCandidates.Count), confirmed real via Bills Payable: $($payableHits.Count)"
if ($allPayableCandidates.Count -gt 0 -and $payableHits.Count -gt ($allPayableCandidates.Count * 0.1)) {
    Write-Host "NOTE: the payables control group found more real amounts than expected - Sundry Creditors is known to reconcile exactly, so this is new information worth a closer look, not something to ignore."
}

if ($receivableHits.Count -gt 0) {
    exit 0
} else {
    Write-Host ""
    Write-Host "No empty-balance receivables candidate was confirmed to carry a real amount in the Bills Receivable report."
    Write-Host "Check the LINEERROR / tag-shape output above first - if the report ID or shape was wrong, this result doesn't mean anything yet."
    exit 1
}
