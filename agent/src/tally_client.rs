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
use std::collections::HashMap;

use roxmltree::Document;

use crate::types::{LedgerBalance, LedgerRange, PeriodLedgerAmount};

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
}
