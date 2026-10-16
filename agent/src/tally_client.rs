//! Talks to Tally's local XML/HTTP gateway (Gateway of Tally -> F1 -> Settings
//! -> Connectivity). Two request shapes: a TDL "Collection" request to pull
//! every ledger's name, parent group and closing balance in one call (for
//! balance-mode mappings), and a report "Export" (e.g. Profit and Loss) for
//! period-mode mappings.
//!
//! The ledger-balances Collection request was live-tested against a real
//! TallyPrime install (CONFETTI EXPORTS PVT. LTD) on 2026-10-01 and the
//! original shape was wrong: a `<FETCH>NAME, PARENT, CLOSINGBALANCE</FETCH>`
//! tag does not declare a custom Collection's fields (that's a different,
//! report-level tag) - Tally silently ignored the whole Collection and fell
//! back to returning its generic object-browser stub (`CMPINFO` with every
//! count at 0, `<COLLECTION ISMSTDEPTYPE="Yes" MSTDEPTYPE="8">` with no
//! `<LEDGER>` children), even though the envelope itself parsed fine
//! (`STATUS=1`, no error). Confirmed against Tally's own documented
//! request/response example (case_study_1.htm) that the correct tag is one
//! `<NATIVEMETHOD>` per field - fixed below. Not yet re-verified with the
//! corrected request against the real gateway, so the sign convention on
//! CLOSINGBALANCE (debit vs. credit), the period-report row/tag shape, and
//! any escaping quirks in real ledger names still need confirming on-site.
use std::collections::{HashMap, HashSet};

use roxmltree::Document;

use crate::types::{LedgerBalance, LedgerRange, PeriodLedgerAmount, RawBill, TallyGroup, TrialBalanceGroup};

#[derive(Debug)]
pub enum TallyError {
    Request(reqwest::Error),
    Xml(roxmltree::Error),
    Unexpected(String),
}

impl std::fmt::Display for TallyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TallyError::Request(e) => write!(f, "could not reach Tally's gateway: {e}"),
            TallyError::Xml(e) => write!(f, "could not parse Tally's response: {e}"),
            TallyError::Unexpected(msg) => write!(f, "Tally's response was not what the agent expects: {msg}"),
        }
    }
}
impl std::error::Error for TallyError {}

/// Builds the ENVELOPE request for a "fetch every ledger's closing balance"
/// collection. `company` is only needed when more than one company is loaded.
pub fn build_ledger_balances_request(company: Option<&str>) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
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
    {company_var}
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
</ENVELOPE>"#
    )
}

/// Builds the ENVELOPE request for a period (P&L) report export - a
/// different Tally request shape than the ledger-balances collection above
/// (`TYPE=Data`/report export, not `TYPE=Collection`). UNVERIFIED against a
/// real TallyPrime instance: `report_name` (default "Profit and Loss") and
/// whether `EXPLODEFLAG=Yes` returns ledger-level rows for a P&L the way it
/// does for Trial Balance. The date format is `YYYYMMDD`, matching the
/// reference Tally MCP implementation (ShrutiSaagar/tally-prime-mcp).
/// `from_date`/`to_date` must already be `YYYYMMDD`. The result is only
/// trusted after `reconcile_period_with_ledger_range` agrees with raw data.
pub fn build_period_report_request(
    report_name: &str,
    company: Option<&str>,
    from_date: &str,
    to_date: &str,
) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>{report_name}</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <EXPLODEFLAG>Yes</EXPLODEFLAG>
    <SVFROMDATE TYPE="Date">{from_date}</SVFROMDATE>
    <SVTODATE TYPE="Date">{to_date}</SVTODATE>
    {company_var}
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>"#,
        report_name = xml_escape(report_name),
        from_date = xml_escape(from_date),
        to_date = xml_escape(to_date),
    )
}

/// Builds the ENVELOPE request for Tally's own Trial Balance report - the
/// standing books-balance check (tally-deployment-steps.md step 3), distinct
/// from the Profit and Loss request above. Confirmed on-site 2026-10-01:
/// `TYPE=Data`, `ID=Trial Balance`, group-level with no `EXPLODEFLAG` (Tally
/// doesn't explode a Trial Balance down to ledgers), no `SUBTYPE`/`TDL`
/// needed since it's a built-in report. Deliberately no
/// `SVFROMDATE`/`SVTODATE`: like `build_ledger_balances_request`, this reads
/// whatever reporting period is currently configured in Tally itself, so its
/// grand total is directly comparable to the raw ledger-balances Collection's
/// own sum - both report the same scope without the agent having to guess a
/// fiscal-year start date.
pub fn build_trial_balance_request(company: Option<&str>) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<ENVELOPE>
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
    {company_var}
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>"#
    )
}

/// Parses Tally's own Trial Balance report - confirmed on-site 2026-10-01.
/// Unlike the Profit and Loss shape, there's no HEADER/BODY wrapper: ENVELOPE
/// directly contains alternating DSPACCNAME/DSPACCINFO siblings, paired
/// positionally (not DSPACCNAME nested inside DSPACCINFO), one pair per
/// primary group - there are no ledger-level rows, since this report isn't
/// exploded. The amount is two levels deep (DSPACCINFO -> DSPCLDRAMT ->
/// DSPCLDRAMTA for the debit side, DSPCLCRAMT -> DSPCLCRAMTA for credit), and
/// the side a group carries no balance on comes back as an empty string, not
/// "0" - both are treated as zero here. Sign convention: DSPCLDRAMTA (debit)
/// comes back already negative, DSPCLCRAMTA (credit) positive, so the net is
/// a plain sum of the two, not credit minus debit (which would double-sign
/// every debit-side group).
pub fn parse_trial_balance(xml: &str) -> Result<Vec<TrialBalanceGroup>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.root_element().children().filter(|n| n.has_tag_name("DSPACCNAME")) {
        let name = node
            .descendants()
            .find(|n| n.has_tag_name("DSPDISPNAME"))
            .and_then(|n| n.text())
            .map(|t| t.trim().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let info_node = node
            .next_siblings()
            .skip(1)
            .find(|n| n.is_element())
            .filter(|n| n.has_tag_name("DSPACCINFO"))
            .ok_or_else(|| TallyError::Unexpected(format!("Trial Balance group \"{name}\" is not followed by a DSPACCINFO element")))?;
        let debit = optional_nested_amount(&info_node, "DSPCLDRAMT", "DSPCLDRAMTA")?;
        let credit = optional_nested_amount(&info_node, "DSPCLCRAMT", "DSPCLCRAMTA")?;
        out.push(TrialBalanceGroup { name, net_amount: credit + debit });
    }
    Ok(out)
}

/// Reads a two-levels-deep amount (e.g. DSPACCINFO -> DSPCLDRAMT ->
/// DSPCLDRAMTA) where the whole outer tag, the inner tag, or the text can
/// each be absent or empty - any of those means this side of the row carries
/// no balance, which is zero, not an error (unlike `required_amount`, where a
/// missing tag is unexpected).
fn optional_nested_amount(node: &roxmltree::Node, outer: &str, inner: &str) -> Result<f64, TallyError> {
    let Some(outer_node) = node.children().find(|c| c.has_tag_name(outer)) else {
        return Ok(0.0);
    };
    let Some(inner_node) = outer_node.children().find(|c| c.has_tag_name(inner)) else {
        return Ok(0.0);
    };
    let raw = inner_node.text().unwrap_or("").trim();
    if raw.is_empty() {
        return Ok(0.0);
    }
    parse_amount(raw).ok_or_else(|| TallyError::Unexpected(format!("{inner} is not a number: {raw:?}")))
}

/// Parses a Profit and Loss report exported with EXPLODEFLAG=Yes. Confirmed
/// on-site 2026-10-04. The response is a flat list of siblings under ENVELOPE,
/// not nested by group: a group heading (DSPACCNAME, then PLAMT with the group
/// total) followed by ledger rows (BSNAME with the ledger name, then BSAMT
/// whose signed amount is in BSSUBAMT). Only ledger rows are returned. Debit
/// is negative and credit positive, the same convention as the Trial Balance.
/// An empty amount is zero. A ledger row with no name is skipped.
pub fn parse_period_report(xml: &str) -> Result<Vec<PeriodLedgerAmount>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.root_element().children().filter(|n| n.has_tag_name("BSNAME")) {
        let name = node
            .descendants()
            .find(|n| n.has_tag_name("DSPDISPNAME"))
            .and_then(|n| n.text())
            .map(|t| t.trim().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let amount_node = node
            .next_siblings()
            .skip(1)
            .find(|n| n.is_element())
            .filter(|n| n.has_tag_name("BSAMT"))
            .ok_or_else(|| TallyError::Unexpected(format!("ledger row \"{name}\" is not followed by a BSAMT element")))?;
        let net_amount = required_amount(&amount_node, "BSSUBAMT")?;
        out.push(PeriodLedgerAmount { name, net_amount });
    }
    Ok(out)
}

/// Tally writes some control characters as numeric references (for example
/// `&#4;` in a group name). XML 1.0 forbids those, and a strict parser rejects
/// the whole response. This drops every numeric reference that isn't a legal
/// XML character and leaves the rest untouched.
pub fn strip_invalid_char_refs(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len());
    let mut rest = xml;
    while let Some(start) = rest.find("&#") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let (radix, digits) = match after.strip_prefix(['x', 'X']) {
            Some(hex) => (16, hex),
            None => (10, after),
        };
        let prefix_len = after.len() - digits.len();
        let digits_len = digits.chars().take_while(|c| c.is_digit(radix)).count();
        if digits_len == 0 || !digits[digits_len..].starts_with(';') {
            out.push_str("&#");
            rest = after;
            continue;
        }
        let reference_len = 2 + prefix_len + digits_len + 1;
        let legal = u32::from_str_radix(&digits[..digits_len], radix)
            .ok()
            .and_then(char::from_u32)
            .is_some_and(is_xml_char);
        if legal {
            out.push_str(&rest[start..start + reference_len]);
        }
        rest = &rest[start + reference_len..];
    }
    out.push_str(rest);
    out
}

fn is_xml_char(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{D7FF}' | '\u{E000}'..='\u{FFFD}' | '\u{10000}'..='\u{10FFFF}')
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Parses the ENVELOPE response into one LedgerBalance per <LEDGER> element.
/// A ledger whose CLOSINGBALANCE doesn't parse as a number is skipped (logged
/// by the caller) rather than failing the whole batch - one malformed row
/// shouldn't block every other ledger's real value from syncing.
pub fn parse_ledger_balances(xml: &str) -> Result<Vec<LedgerBalance>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.descendants().filter(|n| n.has_tag_name("LEDGER")) {
        let name = node
            .attribute("NAME")
            .map(str::to_string)
            .or_else(|| child_text(&node, "NAME"))
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let parent = child_text(&node, "PARENT");
        let closing_balance = match child_text(&node, "CLOSINGBALANCE").and_then(|v| parse_amount(&v)) {
            Some(v) => v,
            None => {
                log::warn!("tally: skipping ledger \"{name}\" - no parseable CLOSINGBALANCE");
                continue;
            }
        };
        out.push(LedgerBalance { name, parent, closing_balance });
    }
    Ok(out)
}

/// Opening and closing balances per ledger for `[from, to]` (both `YYYYMMDD`),
/// from a ledger Collection with SVFROMDATE/SVTODATE. This is the raw
/// reference the period report is checked against: a ledger's net movement
/// over the range is `closing - opening`. The OPENINGBALANCE/CLOSINGBALANCE
/// NATIVEMETHOD names follow the reference Tally MCP implementation; the
/// response shape is UNVERIFIED against a real TallyPrime instance.
pub fn build_ledger_range_request(company: Option<&str>, from: &str, to: &str) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
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
    <SVFROMDATE TYPE="Date">{from}</SVFROMDATE>
    <SVTODATE TYPE="Date">{to}</SVTODATE>
    {company_var}
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
</ENVELOPE>"#
    )
}

/// Parses a ledger range response. An empty amount tag is a zero balance
/// (Tally renders some zero balances that way), but a missing tag is an
/// error - silently treating a missing opening balance as zero would make
/// every reconciliation look like a mismatch with no clear cause.
pub fn parse_ledger_range(xml: &str) -> Result<Vec<LedgerRange>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.descendants().filter(|n| n.has_tag_name("LEDGER")) {
        let name = node
            .attribute("NAME")
            .map(str::to_string)
            .or_else(|| child_text(&node, "NAME"))
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        out.push(LedgerRange {
            name,
            parent: child_text(&node, "PARENT"),
            opening: required_amount(&node, "OPENINGBALANCE")?,
            closing: required_amount(&node, "CLOSINGBALANCE")?,
        });
    }
    Ok(out)
}

/// Builds the ENVELOPE request for every group's immediate parent - the
/// `ConfettiGroupHierarchy` Collection, confirmed on-site 2026-10-09 (same
/// NATIVEMETHOD pattern as the ledger collections, `TYPE=Group` instead of
/// `TYPE=Ledger`). Used to walk a ledger up to its primary group for the
/// standing Trial Balance check (`roll_up_by_primary_group`).
pub fn build_group_hierarchy_request(company: Option<&str>) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
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
    {company_var}
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
</ENVELOPE>"#
    )
}

/// Parses a `ConfettiGroupHierarchy` response - confirmed on-site
/// 2026-10-09: wrapped in `BODY/DATA/COLLECTION` (unlike the ledger
/// collections, which came back as flat `ENVELOPE` children), so this
/// searches the whole document rather than assuming a wrapper depth. A
/// `<GROUP>` with no `NAME` attribute is skipped - the real response's own
/// `CMPINFO` header happens to contain a bare `<GROUP>0</GROUP>` object-
/// browser count that would otherwise be mistaken for a row.
pub fn parse_group_hierarchy(xml: &str) -> Result<Vec<TallyGroup>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.descendants().filter(|n| n.has_tag_name("GROUP")) {
        let Some(name) = node.attribute("NAME").map(str::to_string).filter(|n| !n.is_empty()) else {
            continue;
        };
        let parent = child_text(&node, "PARENT").unwrap_or_default();
        out.push(TallyGroup { name, parent });
    }
    Ok(out)
}

/// Builds the ENVELOPE request for one of Tally's built-in bill-wise
/// Outstandings reports - `report_id` is `"Bills Receivable"` or `"Bills
/// Payable"`. Confirmed working 2026-10-16 against the real JP Office
/// install (see agent/scripts/check_bill_wise_raw.ps1): same `TYPE=Data`
/// report-export shape as `build_trial_balance_request`/
/// `build_period_report_request`, with `EXPLODEFLAG=Yes` so it returns
/// individual bill rows rather than just a total. Neither report ID is
/// cleanly scoped by receivable/payable nature on this install - both
/// return a mix of Sundry Debtors, Sundry Creditors, and Fixed Assets
/// ledgers (any ledger with bill-by-bill tracking enabled, company-wide) -
/// callers classify each bill by its own ledger's group instead of trusting
/// which report it came from (see `classify_bills` in main.rs).
pub fn build_bills_request(report_id: &str, company: Option<&str>) -> String {
    let company_var = company
        .map(|c| format!("<SVCURRENTCOMPANY>{}</SVCURRENTCOMPANY>", xml_escape(c)))
        .unwrap_or_default();
    format!(
        r#"<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>{report_id}</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <EXPLODEFLAG>Yes</EXPLODEFLAG>
    {company_var}
   </STATICVARIABLES>
  </DESC>
 </BODY>
</ENVELOPE>"#,
        report_id = xml_escape(report_id),
    )
}

/// Reads a leaf element's text, trimmed, treating an empty/missing tag as
/// `None` rather than an empty string - matches the empty-means-absent
/// convention used throughout this file for optional date/text fields.
fn leaf_text(node: &roxmltree::Node) -> Option<String> {
    node.text().map(str::trim).filter(|t| !t.is_empty()).map(str::to_string)
}

/// Parses a "Bills Receivable"/"Bills Payable" response - confirmed
/// 2026-10-16 against a real export (agent/scripts/check_bill_wise_raw.ps1's
/// own capture). Like Trial Balance, there's no HEADER/BODY wrapper: one
/// bill is a flat, strictly-ordered run of ENVELOPE-level siblings -
/// `<BILLFIXED>` (containing `<BILLDATE>`/`<BILLREF>`/`<BILLPARTY>`)
/// followed by `<BILLCL>` (the bill's current outstanding amount),
/// `<BILLDUE>`, `<BILLOVERDUE>` (Tally's own days-overdue snapshot - not
/// captured here; the app recomputes this live from `BILLDUE` instead,
/// since a synced snapshot goes stale between sync cycles),
/// `<BILLVCHDATE>`, `<BILLVCHTYPE>`, `<BILLVCHNUMBER>`, `<BILLVCHAMOUNT>` -
/// then the next `<BILLFIXED>` starts the next bill. A bill with no
/// `BILLPARTY` or no parseable `BILLCL` is skipped (logged by the caller),
/// matching `parse_ledger_balances`'s one-bad-row-shouldn't-block-the-rest
/// convention.
pub fn parse_bills_response(xml: &str) -> Result<Vec<RawBill>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let children: Vec<roxmltree::Node> = doc.root_element().children().filter(|n| n.is_element()).collect();

    let mut out = Vec::new();
    let mut i = 0;
    while i < children.len() {
        if !children[i].has_tag_name("BILLFIXED") {
            i += 1;
            continue;
        }
        let fixed = children[i];
        let ledger_name = child_text(&fixed, "BILLPARTY").unwrap_or_default();
        let bill_ref = child_text(&fixed, "BILLREF").unwrap_or_default();
        let bill_date = child_text(&fixed, "BILLDATE");

        let mut closing_amount: Option<f64> = None;
        let mut due_date = None;
        let mut voucher_date = None;
        let mut voucher_type = None;
        let mut voucher_number = None;
        let mut voucher_amount = None;
        let mut j = i + 1;
        while j < children.len() && !children[j].has_tag_name("BILLFIXED") {
            let node = &children[j];
            if node.has_tag_name("BILLCL") {
                closing_amount = leaf_text(node).and_then(|t| parse_amount(&t));
            } else if node.has_tag_name("BILLDUE") {
                due_date = leaf_text(node);
            } else if node.has_tag_name("BILLVCHDATE") {
                voucher_date = leaf_text(node);
            } else if node.has_tag_name("BILLVCHTYPE") {
                voucher_type = leaf_text(node);
            } else if node.has_tag_name("BILLVCHNUMBER") {
                voucher_number = leaf_text(node);
            } else if node.has_tag_name("BILLVCHAMOUNT") {
                voucher_amount = leaf_text(node).and_then(|t| parse_amount(&t));
            }
            j += 1;
        }

        if ledger_name.is_empty() {
            i = j;
            continue;
        }
        let Some(closing_amount) = closing_amount else {
            log::warn!("tally: skipping bill \"{bill_ref}\" for \"{ledger_name}\" - no parseable BILLCL");
            i = j;
            continue;
        };

        out.push(RawBill {
            ledger_name,
            bill_ref,
            bill_date,
            closing_amount,
            due_date,
            voucher_date,
            voucher_type,
            voucher_number,
            voucher_amount,
        });
        i = j;
    }
    Ok(out)
}

/// Walks a ledger's immediate parent group up to its primary group, using
/// the group hierarchy's own `parent` chain. Two terminal cases: a group
/// whose own parent is empty or `"Primary"` IS a primary group (confirmed
/// on-site: all 15 real primary groups have `PARENT=Primary`); a name the
/// hierarchy doesn't know about (or a cycle, or a chain longer than 50 -
/// real Tally charts are nowhere near that deep) is returned as-is rather
/// than erroring, so one bad row doesn't block every other group's rollup.
///
/// `ledger_parent` empty or literally `"Primary"` is a ledger with no group
/// at all - confirmed on-site 2026-10-09, the only real example is the
/// reserved `Profit & Loss A/c` ledger itself, which Tally's own Trial
/// Balance also reports under the `Profit & Loss A/c` primary group (not a
/// group literally named "Primary", which doesn't exist) - so that's
/// returned directly rather than falling into the walk below.
pub fn primary_group_of(ledger_parent: &str, groups: &HashMap<&str, &str>) -> String {
    if ledger_parent.is_empty() || ledger_parent == "Primary" {
        return "Profit & Loss A/c".to_string();
    }
    let mut seen = HashSet::new();
    let mut current = ledger_parent;
    loop {
        if !seen.insert(current) || seen.len() > 50 {
            return current.to_string();
        }
        let Some(&parent) = groups.get(current) else {
            return current.to_string();
        };
        if parent.is_empty() || parent == "Primary" {
            return current.to_string();
        }
        current = parent;
    }
}

/// Sums every ledger's raw closing balance by primary group, walking each
/// one's immediate PARENT through `groups`. A ledger with no PARENT at all
/// is skipped - it can't be attributed to any group. This is the raw side
/// of the standing Trial Balance check: compare the result against
/// `TrialBalanceGroup` entries from the same cycle, group name for group
/// name.
pub fn roll_up_by_primary_group(balances: &[LedgerBalance], groups: &[TallyGroup]) -> HashMap<String, f64> {
    let parent_of: HashMap<&str, &str> = groups.iter().map(|g| (g.name.as_str(), g.parent.as_str())).collect();
    let mut rollup: HashMap<String, f64> = HashMap::new();
    for ledger in balances {
        let Some(parent) = ledger.parent.as_deref() else { continue };
        let primary = primary_group_of(parent, &parent_of);
        *rollup.entry(primary).or_insert(0.0) += ledger.closing_balance;
    }
    rollup
}

/// Rupee tolerance for comparing a raw rollup against Tally's own report.
const GROUP_RECONCILE_TOLERANCE: f64 = 1.0;

/// Compares a primary-group rollup (`roll_up_by_primary_group`) against
/// Tally's own Trial Balance groups for the same cycle. `skip` lists group
/// names to leave out of the comparison entirely - as of 2026-10-09 that's
/// just `"Profit & Loss A/c"` (Tally computes that line on the fly for
/// display, the current year's running profit, not a rollup of the reserved
/// ledger's own recorded balance - confirmed against a real capture, not a
/// data bug). Returns one `(group name, raw rollup, Tally's total)` triple
/// per group that disagrees by more than a rupee; empty means every
/// compared group matched exactly.
pub fn reconcile_trial_balance_by_group(
    rollup: &HashMap<String, f64>,
    trial_balance: &[TrialBalanceGroup],
    skip: &[&str],
) -> Vec<(String, f64, f64)> {
    let tb: HashMap<&str, f64> = trial_balance.iter().map(|g| (g.name.as_str(), g.net_amount)).collect();
    let mut names: Vec<&str> = rollup.keys().map(String::as_str).chain(tb.keys().copied()).collect();
    names.sort_unstable();
    names.dedup();
    let mut problems = Vec::new();
    for name in names {
        if skip.contains(&name) {
            continue;
        }
        let raw = rollup.get(name).copied().unwrap_or(0.0);
        let tally = tb.get(name).copied().unwrap_or(0.0);
        if (raw - tally).abs() > GROUP_RECONCILE_TOLERANCE {
            problems.push((name.to_string(), raw, tally));
        }
    }
    problems
}

fn required_amount(node: &roxmltree::Node, tag: &str) -> Result<f64, TallyError> {
    let child = node
        .children()
        .find(|c| c.has_tag_name(tag))
        .ok_or_else(|| TallyError::Unexpected(format!("ledger has no {tag} element")))?;
    let raw = child.text().unwrap_or("").trim();
    if raw.is_empty() {
        return Ok(0.0);
    }
    parse_amount(raw).ok_or_else(|| TallyError::Unexpected(format!("{tag} is not a number: {raw:?}")))
}

/// Rupee tolerance for comparing amounts that went through Tally's text
/// formatting (two decimal places).
const RECONCILE_TOLERANCE: f64 = 0.01;

/// Checks the period report's net amounts for `wanted` ledgers against the
/// raw opening/closing balances over the same range. Returns one message per
/// disagreement; empty means every wanted ledger agreed. A ledger in neither
/// source is ignored; a ledger present in only one source is compared as 0 on
/// the other side.
pub fn reconcile_period_with_ledger_range(
    period: &[PeriodLedgerAmount],
    range: &[LedgerRange],
    wanted: &[&str],
) -> Vec<String> {
    let raw: HashMap<&str, f64> = range.iter().map(|l| (l.name.as_str(), l.closing - l.opening)).collect();
    let reported: HashMap<&str, f64> = period.iter().map(|p| (p.name.as_str(), p.net_amount)).collect();
    let mut problems = Vec::new();
    for &name in wanted {
        let (expected, got) = (raw.get(name).copied(), reported.get(name).copied());
        if expected.is_none() && got.is_none() {
            continue;
        }
        let (expected, got) = (expected.unwrap_or(0.0), got.unwrap_or(0.0));
        if (expected - got).abs() > RECONCILE_TOLERANCE {
            problems.push(format!(
                "\"{name}\": period report says {got:.2}, raw ledger movement says {expected:.2}"
            ));
        }
    }
    problems
}

/// In a double-entry book the signed closing balances of every ledger net to
/// zero (debit negative, credit positive, per Tally's convention). Returns the
/// total when it is off by more than a rupee, which points at the raw data or
/// the sign convention rather than at any one ledger.
pub fn books_imbalance(range: &[LedgerRange]) -> Option<f64> {
    let total: f64 = range.iter().map(|l| l.closing).sum();
    (total.abs() > 1.0).then_some(total)
}

/// Same idea as `books_imbalance`, but against Tally's own Trial Balance
/// report rather than the agent's raw ledger-balances pull - every primary
/// group's net balance should also sum to zero. Comparing this total with
/// `books_imbalance`'s is what tells the agent apart a real client-side
/// books problem from a bug in its own data pull: if the two disagree with
/// each other, the agent got something wrong; if they agree, Tally itself is
/// reporting unbalanced books.
pub fn trial_balance_imbalance(groups: &[TrialBalanceGroup]) -> Option<f64> {
    let total: f64 = groups.iter().map(|g| g.net_amount).sum();
    (total.abs() > 1.0).then_some(total)
}

fn child_text(node: &roxmltree::Node, tag: &str) -> Option<String> {
    node.children()
        .find(|c| c.has_tag_name(tag))
        .and_then(|c| c.text())
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// Tally sometimes renders amounts with thousands separators or a trailing
/// sign convention marker; strip anything that isn't part of a plain number.
fn parse_amount(raw: &str) -> Option<f64> {
    let cleaned: String = raw.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    cleaned.parse().ok()
}

/// Read-only by design: writing to Tally (`<TALLYREQUEST>Import</TALLYREQUEST>`)
/// is a planned future feature and must not exist yet, in any form. Every
/// request this type builds and sends must stay `<TALLYREQUEST>Export</TALLYREQUEST>`.
/// `requests_never_contain_an_import_tag` below guards this at the request-
/// builder level; if a write path is ever added, build it as a distinct,
/// explicitly-named method (e.g. `push_voucher`), never by quietly changing
/// what `Export` here or in `build_*_request` can do.
pub struct HttpTallyGateway {
    gateway_url: String,
    company_name: Option<String>,
    http: reqwest::blocking::Client,
}

impl HttpTallyGateway {
    pub fn new(gateway_url: &str, company_name: Option<String>) -> Self {
        Self {
            gateway_url: gateway_url.trim_end_matches('/').to_string(),
            company_name,
            http: reqwest::blocking::Client::new(),
        }
    }

    /// Every ledger Tally knows about, with its closing balance - callers
    /// filter this down to the ledger names the server actually wants
    /// (AgentConfig::ledgers), since Tally's collection FETCH doesn't
    /// cleanly support filtering by an arbitrary name list server-side.
    pub fn fetch_ledger_balances(&self) -> Result<Vec<LedgerBalance>, TallyError> {
        let body = build_ledger_balances_request(self.company_name.as_deref());
        parse_ledger_balances(&self.send_export(body)?)
    }

    /// Opening and closing balances for every ledger over `[from, to]`, both
    /// `YYYYMMDD`. The raw reference for `reconcile_period_with_ledger_range`.
    pub fn fetch_ledger_range(&self, from: &str, to: &str) -> Result<Vec<LedgerRange>, TallyError> {
        let body = build_ledger_range_request(self.company_name.as_deref(), from, to);
        parse_ledger_range(&self.send_export(body)?)
    }

    fn send_export(&self, body: String) -> Result<String, TallyError> {
        let text = self
            .http
            .post(&self.gateway_url)
            .header("Content-Type", "text/xml")
            .body(body)
            .send()
            .map_err(TallyError::Request)?
            .error_for_status()
            .map_err(TallyError::Request)?
            .text()
            .map_err(TallyError::Request)?;
        Ok(strip_invalid_char_refs(&text))
    }

    /// Every ledger's net movement over `[from_date, to_date]` per a period
    /// report (e.g. "Profit and Loss") - see `build_period_report_request`
    /// for the on-site-unverified caveats. Dates must already be in the
    /// `D-Mon-YYYY` shape Tally's gateway expects.
    pub fn fetch_period_report(
        &self,
        report_name: &str,
        from_date: &str,
        to_date: &str,
    ) -> Result<Vec<PeriodLedgerAmount>, TallyError> {
        let body = build_period_report_request(report_name, self.company_name.as_deref(), from_date, to_date);
        parse_period_report(&self.send_export(body)?)
    }

    /// Tally's own Trial Balance report, group-level - the standing
    /// books-balance cross-check (tally-deployment-steps.md step 3). No date
    /// range: see `build_trial_balance_request` for why.
    pub fn fetch_trial_balance(&self) -> Result<Vec<TrialBalanceGroup>, TallyError> {
        let body = build_trial_balance_request(self.company_name.as_deref());
        parse_trial_balance(&self.send_export(body)?)
    }

    /// Every bill from one of Tally's "Bills Receivable"/"Bills Payable"
    /// report exports. See `build_bills_request` for the confirmed shape and
    /// the caveat that `report_id` doesn't cleanly scope the result by
    /// receivable/payable nature - callers classify by ledger group instead.
    pub fn fetch_bills(&self, report_id: &str) -> Result<Vec<RawBill>, TallyError> {
        let body = build_bills_request(report_id, self.company_name.as_deref());
        parse_bills_response(&self.send_export(body)?)
    }

    /// Every group's immediate parent - used to walk a ledger up to its
    /// primary group for the same standing check. See
    /// `build_group_hierarchy_request`.
    pub fn fetch_group_hierarchy(&self) -> Result<Vec<TallyGroup>, TallyError> {
        let body = build_group_hierarchy_request(self.company_name.as_deref());
        parse_group_hierarchy(&self.send_export(body)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real excerpt (3 of 2727 ledgers) from a live TallyPrime
    // ConfettiLedgerBalances Collection export against CONFETTI EXPORTS
    // PVT. LTD - (from 1-Apr-25), captured 2026-10-02 - not fabricated.
    // Confirms PARENT/CLOSINGBALANCE are direct (single-level) children of
    // LEDGER, a zero/unposted balance can render as an empty tag rather
    // than "0.00", and the sign convention: a Bank Accounts (asset, debit
    // nature) ledger comes back negative, an Unsecured Loans (liability,
    // credit nature) ledger comes back positive - the same debit-negative/
    // credit-positive convention already confirmed for DSPCLDRAMTA/
    // DSPCLCRAMTA on the Trial Balance report.
    #[test]
    fn parses_ledger_collection_response() {
        let xml = r#"<ENVELOPE>
<LEDGER NAME="HDFC BANK (JODHPUR PARK)" RESERVEDNAME="">
    <PARENT TYPE="String">Bank Accounts</PARENT>
    <CLOSINGBALANCE TYPE="Amount">-1813.57</CLOSINGBALANCE>
</LEDGER>
<LEDGER NAME="Mrs-Shanta Ghosh-Loan" RESERVEDNAME="">
    <PARENT TYPE="String">Unsecured Loans</PARENT>
    <CLOSINGBALANCE TYPE="Amount">18135769.00</CLOSINGBALANCE>
</LEDGER>
<LEDGER NAME="Adhikary Plywood &amp; Glass" RESERVEDNAME="">
    <PARENT TYPE="String">Sundry Creditors</PARENT>
    <CLOSINGBALANCE TYPE="Amount">0.00</CLOSINGBALANCE>
</LEDGER>
<LEDGER NAME="3L Handicrafts" RESERVEDNAME="">
    <PARENT TYPE="String">Sundry Creditors</PARENT>
    <CLOSINGBALANCE TYPE="Amount"></CLOSINGBALANCE>
</LEDGER>
</ENVELOPE>"#;
        let balances = parse_ledger_balances(xml).unwrap();
        // The fourth ledger has an empty CLOSINGBALANCE and is skipped.
        assert_eq!(balances.len(), 3);
        assert_eq!(balances[0].name, "HDFC BANK (JODHPUR PARK)");
        assert_eq!(balances[0].parent.as_deref(), Some("Bank Accounts"));
        assert_eq!(balances[0].closing_balance, -1813.57);
        assert_eq!(balances[1].name, "Mrs-Shanta Ghosh-Loan");
        assert_eq!(balances[1].parent.as_deref(), Some("Unsecured Loans"));
        assert_eq!(balances[1].closing_balance, 18135769.00);
        // Confirms roxmltree decodes the &amp; entity Tally sends in real
        // ledger names back to a literal '&' with no custom handling needed.
        assert_eq!(balances[2].name, "Adhikary Plywood & Glass");
    }

    #[test]
    fn request_includes_company_when_given() {
        let req = build_ledger_balances_request(Some("CONFETTI EXPORTS PVT. LTD"));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
        let req_no_company = build_ledger_balances_request(None);
        assert!(!req_no_company.contains("SVCURRENTCOMPANY"));
    }

    // Writing to Tally is a planned future feature and must not exist yet.
    // Every request body this module can build must stay a read-only
    // Export, never an Import - this pins that down so it can't regress
    // silently as the request builders change.
    #[test]
    fn requests_never_contain_an_import_tag() {
        let requests = [
            build_ledger_balances_request(None),
            build_ledger_balances_request(Some("CONFETTI EXPORTS PVT. LTD")),
            build_period_report_request("Profit and Loss", None, "1-Apr-2026", "17-Sep-2026"),
            build_period_report_request(
                "Profit and Loss",
                Some("CONFETTI EXPORTS PVT. LTD"),
                "1-Apr-2026",
                "17-Sep-2026",
            ),
            build_trial_balance_request(None),
            build_trial_balance_request(Some("CONFETTI EXPORTS PVT. LTD")),
            build_group_hierarchy_request(None),
            build_group_hierarchy_request(Some("CONFETTI EXPORTS PVT. LTD")),
        ];
        for req in requests {
            assert!(req.contains("<TALLYREQUEST>Export</TALLYREQUEST>"));
            assert!(!req.to_lowercase().contains("import"));
        }
    }

    #[test]
    fn period_report_request_has_expected_shape() {
        let req = build_period_report_request(
            "Profit and Loss",
            Some("CONFETTI EXPORTS PVT. LTD"),
            "20260401",
            "20260917",
        );
        assert!(req.contains("<TYPE>Data</TYPE>"));
        assert!(req.contains("<ID>Profit and Loss</ID>"));
        assert!(req.contains(r#"<SVFROMDATE TYPE="Date">20260401</SVFROMDATE>"#));
        assert!(req.contains(r#"<SVTODATE TYPE="Date">20260917</SVTODATE>"#));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
    }

    // Tally sends `&#4;` in the Profit & Loss A/c parent. XML 1.0 forbids it,
    // so the raw response fails a strict parse until it's stripped.
    #[test]
    fn strips_numeric_refs_xml_forbids_and_keeps_legal_ones() {
        let raw = r#"<PARENT TYPE="String">&#4; Primary &#10;&#x1F; &#13; &#x41;&#65;&#x;&#</PARENT>"#;
        assert_eq!(
            strip_invalid_char_refs(raw),
            r#"<PARENT TYPE="String"> Primary &#10; &#13; &#x41;&#65;&#x;&#</PARENT>"#,
        );
    }

    #[test]
    fn ledger_balances_parse_after_stripping_forbidden_refs() {
        let raw = r#"<ENVELOPE><LEDGER NAME="Profit &amp; Loss A/c"><PARENT TYPE="String">&#4; Primary</PARENT><CLOSINGBALANCE>5353037.82</CLOSINGBALANCE></LEDGER></ENVELOPE>"#;
        assert!(parse_ledger_balances(raw).is_err());
        let balances = parse_ledger_balances(&strip_invalid_char_refs(raw)).unwrap();
        assert_eq!(balances[0].name, "Profit & Loss A/c");
        assert_eq!(balances[0].closing_balance, 5353037.82);
    }

    #[test]
    fn ledger_range_request_has_expected_shape() {
        let req = build_ledger_range_request(Some("CONFETTI EXPORTS PVT. LTD"), "20260401", "20260917");
        assert!(req.contains("<TALLYREQUEST>Export</TALLYREQUEST>"));
        assert!(req.contains("<TYPE>Collection</TYPE>"));
        assert!(req.contains(r#"<SVFROMDATE TYPE="Date">20260401</SVFROMDATE>"#));
        assert!(req.contains(r#"<SVTODATE TYPE="Date">20260917</SVTODATE>"#));
        assert!(req.contains("<NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>"));
        assert!(req.contains("<NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>"));
    }

    // Structure only: this response shape is taken from the reference
    // implementation, not yet captured from a real Tally instance. Replace
    // with a real excerpt once one is available.
    #[test]
    fn parses_ledger_range_treating_empty_as_zero() {
        let xml = r#"<ENVELOPE>
<LEDGER NAME="Sales &amp; Co">
    <PARENT TYPE="String">Sales Accounts</PARENT>
    <OPENINGBALANCE TYPE="Amount">0.00</OPENINGBALANCE>
    <CLOSINGBALANCE TYPE="Amount">-500000.00</CLOSINGBALANCE>
</LEDGER>
<LEDGER NAME="Unused">
    <PARENT TYPE="String">Indirect Expenses</PARENT>
    <OPENINGBALANCE TYPE="Amount"></OPENINGBALANCE>
    <CLOSINGBALANCE TYPE="Amount"></CLOSINGBALANCE>
</LEDGER>
</ENVELOPE>"#;
        let range = parse_ledger_range(xml).unwrap();
        assert_eq!(range.len(), 2);
        assert_eq!(range[0].name, "Sales & Co");
        assert_eq!(range[0].closing, -500000.0);
        assert_eq!(range[1].closing, 0.0);
    }

    #[test]
    fn ledger_range_errors_on_missing_opening_element() {
        let xml = r#"<ENVELOPE><LEDGER NAME="X"><CLOSINGBALANCE>1.00</CLOSINGBALANCE></LEDGER></ENVELOPE>"#;
        assert!(matches!(parse_ledger_range(xml), Err(TallyError::Unexpected(_))));
    }

    fn range_row(name: &str, opening: f64, closing: f64) -> LedgerRange {
        LedgerRange { name: name.into(), parent: None, opening, closing }
    }

    fn period_row(name: &str, net: f64) -> PeriodLedgerAmount {
        PeriodLedgerAmount { name: name.into(), net_amount: net }
    }

    // Synthetic inputs exercising the comparison logic itself.
    #[test]
    fn reconcile_passes_when_report_matches_raw_movement() {
        let range = [range_row("Sales", 0.0, -500000.0), range_row("Rent", -10000.0, -40000.0)];
        let period = [period_row("Sales", -500000.0), period_row("Rent", -30000.0)];
        assert!(reconcile_period_with_ledger_range(&period, &range, &["Sales", "Rent"]).is_empty());
    }

    #[test]
    fn reconcile_flags_a_ledger_the_report_gets_wrong() {
        let range = [range_row("Interest", 0.0, -100.0)];
        let period = [period_row("Interest", 0.0)];
        let problems = reconcile_period_with_ledger_range(&period, &range, &["Interest"]);
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("Interest"));
    }

    #[test]
    fn reconcile_flags_a_ledger_missing_from_the_report() {
        let range = [range_row("Freight", 0.0, -2500.0)];
        let problems = reconcile_period_with_ledger_range(&[], &range, &["Freight"]);
        assert_eq!(problems.len(), 1);
    }

    #[test]
    fn books_imbalance_reports_only_real_imbalance() {
        let balanced = [range_row("Bank", 0.0, -1000.0), range_row("Capital", 0.0, 1000.0)];
        assert_eq!(books_imbalance(&balanced), None);
        let off = [range_row("Bank", 0.0, -1000.0), range_row("Capital", 0.0, 1005.0)];
        assert_eq!(books_imbalance(&off), Some(5.0));
    }

    // Verbatim excerpt from a live TallyPrime Profit and Loss export
    // (EXPLODEFLAG=Yes, company CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)),
    // captured 2026-10-04. Group headings and totals are skipped; ledger rows
    // carry the signed amount in BSSUBAMT.
    #[test]
    fn parses_period_report_ledger_rows_from_real_export() {
        let xml = r#"<ENVELOPE>
<DSPACCNAME>
  <DSPDISPNAME>Sales Accounts</DSPDISPNAME>
</DSPACCNAME>
 <PLAMT>
  <PLSUBAMT></PLSUBAMT>
  <BSMAINAMT>43415621.83</BSMAINAMT>
</PLAMT>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>Sales-Garment</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT></BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>Sales-Handicraft-14.5%</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT>-394.00</BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>Sales Food-GST</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT>36614454.05</BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
<DSPACCNAME>
  <DSPDISPNAME>Cost of Sales :</DSPDISPNAME>
</DSPACCNAME>
 <PLAMT>
  <PLSUBAMT></PLSUBAMT>
  <BSMAINAMT>-20533051.13</BSMAINAMT>
</PLAMT>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>Electricity Charges</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT>-1627954.00</BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
</ENVELOPE>"#;
        let amounts = parse_period_report(xml).unwrap();
        let names: Vec<&str> = amounts.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["Sales-Garment", "Sales-Handicraft-14.5%", "Sales Food-GST", "Electricity Charges"]);
        assert_eq!(amounts[0].net_amount, 0.0);
        assert_eq!(amounts[1].net_amount, -394.0);
        assert_eq!(amounts[2].net_amount, 36614454.05);
        assert_eq!(amounts[3].net_amount, -1627954.0);
    }

    #[test]
    fn period_report_ledger_row_without_amount_is_an_error() {
        let xml = r#"<ENVELOPE><BSNAME><DSPACCNAME><DSPDISPNAME>Orphan</DSPDISPNAME></DSPACCNAME></BSNAME></ENVELOPE>"#;
        assert!(matches!(parse_period_report(xml), Err(TallyError::Unexpected(_))));
    }

    #[test]
    fn trial_balance_request_has_expected_shape() {
        let req = build_trial_balance_request(Some("CONFETTI EXPORTS PVT. LTD"));
        assert!(req.contains("<TYPE>Data</TYPE>"));
        assert!(req.contains("<ID>Trial Balance</ID>"));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
        // No EXPLODEFLAG and no date range, unlike the P&L request - see the
        // builder's own doc comment for why.
        assert!(!req.contains("EXPLODEFLAG"));
        assert!(!req.contains("SVFROMDATE"));
        assert!(!req.contains("SVTODATE"));
    }

    // Structure only, built from the confirmed shape in agent/README.md
    // ("Period report shape - confirmed against a real Trial Balance
    // export"), not a verbatim capture - no full raw export was saved on
    // 2026-10-01. Exercises the positional DSPACCNAME/DSPACCINFO pairing, the
    // two-levels-deep amount tags, an empty unused side, and the plain-sum
    // sign convention (debit already negative, credit positive).
    #[test]
    fn parses_trial_balance_groups_structural() {
        let xml = r#"<ENVELOPE>
<DSPACCNAME>
  <DSPDISPNAME>Sundry Creditors</DSPDISPNAME>
</DSPACCNAME>
<DSPACCINFO>
  <DSPCLDRAMT>
    <DSPCLDRAMTA></DSPCLDRAMTA>
  </DSPCLDRAMT>
  <DSPCLCRAMT>
    <DSPCLCRAMTA>1791964.67</DSPCLCRAMTA>
  </DSPCLCRAMT>
</DSPACCINFO>
<DSPACCNAME>
  <DSPDISPNAME>Fixed Assets</DSPDISPNAME>
</DSPACCNAME>
<DSPACCINFO>
  <DSPCLDRAMT>
    <DSPCLDRAMTA>-19391632.27</DSPCLDRAMTA>
  </DSPCLDRAMT>
  <DSPCLCRAMT>
    <DSPCLCRAMTA></DSPCLCRAMTA>
  </DSPCLCRAMT>
</DSPACCINFO>
</ENVELOPE>"#;
        let groups = parse_trial_balance(xml).unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].name, "Sundry Creditors");
        assert_eq!(groups[0].net_amount, 1791964.67);
        assert_eq!(groups[1].name, "Fixed Assets");
        assert_eq!(groups[1].net_amount, -19391632.27);
    }

    #[test]
    fn trial_balance_group_without_info_is_an_error() {
        let xml = r#"<ENVELOPE><DSPACCNAME><DSPDISPNAME>Orphan</DSPDISPNAME></DSPACCNAME></ENVELOPE>"#;
        assert!(matches!(parse_trial_balance(xml), Err(TallyError::Unexpected(_))));
    }

    fn tb_group(name: &str, net: f64) -> TrialBalanceGroup {
        TrialBalanceGroup { name: name.into(), net_amount: net }
    }

    #[test]
    fn trial_balance_imbalance_reports_only_real_imbalance() {
        let balanced = [tb_group("Sundry Creditors", 1000.0), tb_group("Fixed Assets", -1000.0)];
        assert_eq!(trial_balance_imbalance(&balanced), None);
        let off = [tb_group("Sundry Creditors", 1005.0), tb_group("Fixed Assets", -1000.0)];
        assert_eq!(trial_balance_imbalance(&off), Some(5.0));
    }

    #[test]
    fn group_hierarchy_request_has_expected_shape() {
        let req = build_group_hierarchy_request(Some("CONFETTI EXPORTS PVT. LTD"));
        assert!(req.contains("<TYPE>Collection</TYPE>"));
        assert!(req.contains("<ID>ConfettiGroupHierarchy</ID>"));
        assert!(req.contains("<TYPE>Group</TYPE>"));
        assert!(req.contains("<NATIVEMETHOD>Name</NATIVEMETHOD>"));
        assert!(req.contains("<NATIVEMETHOD>Parent</NATIVEMETHOD>"));
    }

    // Verbatim excerpt from a live TallyPrime ConfettiGroupHierarchy export
    // (CONFETTI EXPORTS PVT. LTD), captured 2026-10-09. Confirms: wrapped in
    // BODY/DATA/COLLECTION rather than flat under ENVELOPE like the ledger
    // collections (parse_group_hierarchy searches the whole document, not
    // just root_element().children(), because of this); a primary group's
    // PARENT comes back as " Primary" with a leading space (trimmed by
    // child_text); and the real CMPINFO header's own bare <GROUP>0</GROUP>
    // object-browser count must not be mistaken for a row.
    #[test]
    fn parses_group_hierarchy_from_real_export() {
        let xml = r#"<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <STATUS>1</STATUS>
 </HEADER>
 <BODY>
  <DESC>
   <CMPINFO>
    <COMPANY>0</COMPANY>
    <GROUP>0</GROUP>
    <LEDGER>1119</LEDGER>
   </CMPINFO>
  </DESC>
  <DATA>
   <COLLECTION ISMSTDEPTYPE="Yes" MSTDEPTYPE="4">
    <GROUP NAME="Advance to Staff" RESERVEDNAME="">
     <PARENT TYPE="String">Loans &amp; Advances (Asset)</PARENT>
    </GROUP>
    <GROUP NAME="Loans &amp; Advances (Asset)" RESERVEDNAME="Loans &amp; Advances (Asset)">
     <PARENT TYPE="String">Current Assets</PARENT>
    </GROUP>
    <GROUP NAME="Current Assets" RESERVEDNAME="Current Assets">
     <PARENT TYPE="String"> Primary</PARENT>
    </GROUP>
    <GROUP NAME="Fixed Assets" RESERVEDNAME="Fixed Assets">
     <PARENT TYPE="String"> Primary</PARENT>
    </GROUP>
   </COLLECTION>
  </DATA>
 </BODY>
</ENVELOPE>"#;
        let groups = parse_group_hierarchy(xml).unwrap();
        // The CMPINFO's bare <GROUP>0</GROUP> (no NAME attribute) is skipped,
        // so this is 4, not 5.
        assert_eq!(groups.len(), 4);
        assert_eq!(groups[0], TallyGroup { name: "Advance to Staff".into(), parent: "Loans & Advances (Asset)".into() });
        assert_eq!(groups[2], TallyGroup { name: "Current Assets".into(), parent: "Primary".into() });
    }

    fn real_group_hierarchy() -> Vec<TallyGroup> {
        vec![
            TallyGroup { name: "Advance to Staff".into(), parent: "Loans & Advances (Asset)".into() },
            TallyGroup { name: "Loans & Advances (Asset)".into(), parent: "Current Assets".into() },
            TallyGroup { name: "Current Assets".into(), parent: "Primary".into() },
            TallyGroup { name: "Fixed Assets".into(), parent: "Primary".into() },
        ]
    }

    #[test]
    fn primary_group_of_walks_a_multi_level_chain() {
        let groups = real_group_hierarchy();
        let parent_of: HashMap<&str, &str> = groups.iter().map(|g| (g.name.as_str(), g.parent.as_str())).collect();
        // Advance to Staff -> Loans & Advances (Asset) -> Current Assets: a
        // real two-hop chain, confirmed against the live export 2026-10-09.
        assert_eq!(primary_group_of("Advance to Staff", &parent_of), "Current Assets");
        // Already a primary group (its own parent is "Primary") - zero hops.
        assert_eq!(primary_group_of("Fixed Assets", &parent_of), "Fixed Assets");
    }

    // The only real example of this shape (confirmed 2026-10-09): the
    // reserved Profit & Loss A/c ledger has PARENT="Primary" directly, no
    // group at all. Tally's own Trial Balance reports that ledger under the
    // "Profit & Loss A/c" primary group, not a group literally named
    // "Primary" (which doesn't exist), so that's what this must return.
    #[test]
    fn primary_group_of_treats_a_parentless_ledger_as_profit_and_loss() {
        let groups = real_group_hierarchy();
        let parent_of: HashMap<&str, &str> = groups.iter().map(|g| (g.name.as_str(), g.parent.as_str())).collect();
        assert_eq!(primary_group_of("Primary", &parent_of), "Profit & Loss A/c");
        assert_eq!(primary_group_of("", &parent_of), "Profit & Loss A/c");
    }

    #[test]
    fn primary_group_of_does_not_hang_on_a_cycle() {
        let parent_of: HashMap<&str, &str> = [("A", "B"), ("B", "A")].into_iter().collect();
        // Must terminate, not loop forever - the exact name returned doesn't
        // matter as much as this test completing at all.
        let result = primary_group_of("A", &parent_of);
        assert!(result == "A" || result == "B");
    }

    #[test]
    fn primary_group_of_falls_back_on_an_unknown_parent() {
        let parent_of: HashMap<&str, &str> = HashMap::new();
        assert_eq!(primary_group_of("Some New Group Nobody Mapped", &parent_of), "Some New Group Nobody Mapped");
    }

    #[test]
    fn roll_up_by_primary_group_sums_ledgers_to_their_primary_group() {
        let groups = real_group_hierarchy();
        let balances = [
            LedgerBalance { name: "Staff A".into(), parent: Some("Advance to Staff".into()), closing_balance: -100.0 },
            LedgerBalance { name: "Staff B".into(), parent: Some("Advance to Staff".into()), closing_balance: -50.0 },
            LedgerBalance { name: "HDFC Bank".into(), parent: Some("Fixed Assets".into()), closing_balance: -500.0 },
            LedgerBalance { name: "No Parent".into(), parent: None, closing_balance: 999.0 },
        ];
        let rollup = roll_up_by_primary_group(&balances, &groups);
        assert_eq!(rollup.get("Current Assets"), Some(&-150.0));
        assert_eq!(rollup.get("Fixed Assets"), Some(&-500.0));
        // The parentless ledger can't be attributed to any group and must
        // not silently show up under some other bucket.
        assert_eq!(rollup.len(), 2);
    }

    #[test]
    fn reconcile_trial_balance_by_group_skips_listed_groups_and_flags_real_mismatches() {
        let mut rollup = HashMap::new();
        rollup.insert("Fixed Assets".to_string(), -19917872.27);
        rollup.insert("Current Assets".to_string(), -20722222.46); // known-imprecise, see README
        rollup.insert("Profit & Loss A/c".to_string(), 7608553.18); // skipped
        let trial_balance = [
            tb_group("Fixed Assets", -19917872.27), // exact match
            tb_group("Current Assets", -22144844.47), // real gap, confirmed 2026-10-09
            tb_group("Profit & Loss A/c", -665.76), // skipped - different quantities, not a bug
        ];
        let problems = reconcile_trial_balance_by_group(&rollup, &trial_balance, &["Profit & Loss A/c"]);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].0, "Current Assets");
    }

    #[test]
    fn reconcile_trial_balance_by_group_passes_when_everything_matches() {
        let mut rollup = HashMap::new();
        rollup.insert("Sales Accounts".to_string(), 47848738.02);
        let trial_balance = [tb_group("Sales Accounts", 47848738.02)];
        assert!(reconcile_trial_balance_by_group(&rollup, &trial_balance, &[]).is_empty());
    }

    // Verbatim excerpt (2 of 1363 bills) from a live TallyPrime "Bills
    // Receivable" EXPLODEFLAG=Yes export against CONFETTI EXPORTS PVT. LTD,
    // captured 2026-10-16 via agent/scripts/check_bill_wise_raw.ps1 - not
    // fabricated. Confirms the flat BILLFIXED/BILLCL/.../next-BILLFIXED
    // sibling shape, that BILLVCHNUMBER can be an empty tag (treated as
    // None, not an empty string), and the debit-negative sign convention
    // (both are receivables, both negative, matching ClosingBalance's own
    // convention confirmed elsewhere in this file).
    #[test]
    fn parses_bills_response_from_real_export() {
        let xml = r#"<ENVELOPE>
 <BILLFIXED>
  <BILLDATE>31-Mar-12</BILLDATE>
  <BILLREF>Aircondition-All</BILLREF>
  <BILLPARTY>Aircondition-All</BILLPARTY>
</BILLFIXED>
 <BILLCL>-108813.05</BILLCL>
 <BILLDUE>31-Mar-12</BILLDUE>
 <BILLOVERDUE>5312</BILLOVERDUE>
 <BILLVCHDATE>31-Mar-12</BILLVCHDATE>
 <BILLVCHTYPE>Opening Balance</BILLVCHTYPE>
 <BILLVCHNUMBER></BILLVCHNUMBER>
 <BILLVCHAMOUNT>-108813.05</BILLVCHAMOUNT>
 <BILLFIXED>
  <BILLDATE>31-Mar-12</BILLDATE>
  <BILLREF>Jodhpur Park</BILLREF>
  <BILLPARTY>Air Condition( Jodhpur Park)</BILLPARTY>
</BILLFIXED>
 <BILLCL>-73292.50</BILLCL>
 <BILLDUE>31-Mar-12</BILLDUE>
 <BILLOVERDUE>5312</BILLOVERDUE>
 <BILLVCHDATE>31-Mar-12</BILLVCHDATE>
 <BILLVCHTYPE>Opening Balance</BILLVCHTYPE>
 <BILLVCHNUMBER></BILLVCHNUMBER>
 <BILLVCHAMOUNT>-73292.50</BILLVCHAMOUNT>
</ENVELOPE>"#;
        let bills = parse_bills_response(xml).unwrap();
        assert_eq!(bills.len(), 2);
        assert_eq!(bills[0].ledger_name, "Aircondition-All");
        assert_eq!(bills[0].bill_ref, "Aircondition-All");
        assert_eq!(bills[0].bill_date.as_deref(), Some("31-Mar-12"));
        assert_eq!(bills[0].closing_amount, -108813.05);
        assert_eq!(bills[0].due_date.as_deref(), Some("31-Mar-12"));
        assert_eq!(bills[0].voucher_type.as_deref(), Some("Opening Balance"));
        // An empty BILLVCHNUMBER tag is None, not Some("").
        assert_eq!(bills[0].voucher_number, None);
        assert_eq!(bills[0].voucher_amount, Some(-108813.05));
        assert_eq!(bills[1].ledger_name, "Air Condition( Jodhpur Park)");
        assert_eq!(bills[1].bill_ref, "Jodhpur Park");
        assert_eq!(bills[1].closing_amount, -73292.50);
    }

    #[test]
    fn parses_bills_response_skips_a_bill_with_no_parseable_bill_cl() {
        let xml = r#"<ENVELOPE>
 <BILLFIXED>
  <BILLDATE>1-Apr-26</BILLDATE>
  <BILLREF>Some Ref</BILLREF>
  <BILLPARTY>Some Party</BILLPARTY>
</BILLFIXED>
 <BILLCL></BILLCL>
 <BILLDUE>1-May-26</BILLDUE>
</ENVELOPE>"#;
        let bills = parse_bills_response(xml).unwrap();
        assert!(bills.is_empty());
    }

    #[test]
    fn bills_request_has_expected_shape() {
        let req = build_bills_request("Bills Receivable", Some("CONFETTI EXPORTS PVT. LTD"));
        assert!(req.contains("<TALLYREQUEST>Export</TALLYREQUEST>"));
        assert!(req.contains("<TYPE>Data</TYPE>"));
        assert!(req.contains("<ID>Bills Receivable</ID>"));
        assert!(req.contains("<EXPLODEFLAG>Yes</EXPLODEFLAG>"));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
        assert!(!req.to_lowercase().contains("import"));
    }
}
