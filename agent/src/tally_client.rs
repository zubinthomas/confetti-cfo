//! Talks to Tally's local XML/HTTP gateway (Gateway of Tally -> F1 -> Settings
//! -> Connectivity). Two request shapes: a TDL "Collection" request to pull
//! every ledger's name, parent group and closing balance in one call (for
//! balance-mode mappings), and a report "Export" (e.g. Profit and Loss) for
//! period-mode mappings. NOT verified against a real TallyPrime instance yet
//! (none was available while writing this - see the integration plan's
//! "Blocked on the client" section); the XML shapes below match Tally's
//! publicly documented gateway schema, but the sign convention on
//! CLOSINGBALANCE (debit vs. credit), the period-report row/tag shape, and
//! any escaping quirks in real ledger names need confirming on-site before
//! this is trusted for real pushes.
use roxmltree::Document;

use crate::types::{LedgerBalance, PeriodLedgerAmount};

#[derive(Debug)]
pub enum TallyError {
    Request(reqwest::Error),
    Xml(roxmltree::Error),
}

impl std::fmt::Display for TallyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TallyError::Request(e) => write!(f, "could not reach Tally's gateway: {e}"),
            TallyError::Xml(e) => write!(f, "could not parse Tally's response: {e}"),
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
        r#"<ENVELOPE>
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
     <COLLECTION NAME="ConfettiLedgerBalances" ISINITIALIZE="Yes">
      <TYPE>Ledger</TYPE>
      <FETCH>NAME, PARENT, CLOSINGBALANCE</FETCH>
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
/// real TallyPrime instance: `report_name` (using "Profit and Loss"), the
/// `SVFROMDATE`/`SVTODATE` date format (`D-Mon-YYYY` per Tally's published
/// Trial Balance example - no confirmed P&L example was found), and whether
/// `EXPLODEFLAG=Yes` returns ledger-level rows for a P&L report the way it
/// does for Trial Balance all need confirming on-site. `from_date`/`to_date`
/// must already be in that `D-Mon-YYYY` shape.
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

/// Parses a period report's ENVELOPE response into one PeriodLedgerAmount
/// per row. UNVERIFIED shape - inferred from Tally's documented Trial
/// Balance example (no confirmed P&L example found): each row is a
/// <DSPACCINFO> holding a <DSPACCNAME><DSPDISPNAME> name and separate
/// debit/credit closing-amount tags (not one signed value the way
/// CLOSINGBALANCE is for the ledger collection). Prefers the "A" (absolute/
/// unformatted numeric) amount tag when present, falling back to the plain
/// one; net_amount = credit - debit, a best-guess sign convention that also
/// needs confirming on-site. A row with neither a name nor any parseable
/// amount is skipped rather than failing the whole batch.
pub fn parse_period_report(xml: &str) -> Result<Vec<PeriodLedgerAmount>, TallyError> {
    let doc = Document::parse(xml).map_err(TallyError::Xml)?;
    let mut out = Vec::new();
    for node in doc.descendants().filter(|n| n.has_tag_name("DSPACCINFO")) {
        let name = node
            .children()
            .find(|c| c.has_tag_name("DSPACCNAME"))
            .and_then(|c| child_text(&c, "DSPDISPNAME").or_else(|| c.text().map(|t| t.trim().to_string())))
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let debit = child_text(&node, "DSPCLDRAMTA")
            .or_else(|| child_text(&node, "DSPCLDRAMT"))
            .and_then(|v| parse_amount(&v))
            .unwrap_or(0.0);
        let credit = child_text(&node, "DSPCLCRAMTA")
            .or_else(|| child_text(&node, "DSPCLCRAMT"))
            .and_then(|v| parse_amount(&v))
            .unwrap_or(0.0);
        out.push(PeriodLedgerAmount { name, net_amount: credit - debit });
    }
    Ok(out)
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
        let response = self
            .http
            .post(&self.gateway_url)
            .header("Content-Type", "text/xml")
            .body(body)
            .send()
            .map_err(TallyError::Request)?
            .error_for_status()
            .map_err(TallyError::Request)?;
        let text = response.text().map_err(TallyError::Request)?;
        parse_ledger_balances(&text)
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
        let response = self
            .http
            .post(&self.gateway_url)
            .header("Content-Type", "text/xml")
            .body(body)
            .send()
            .map_err(TallyError::Request)?
            .error_for_status()
            .map_err(TallyError::Request)?;
        let text = response.text().map_err(TallyError::Request)?;
        parse_period_report(&text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ledger_collection_response() {
        let xml = r#"<ENVELOPE>
            <LEDGER NAME="Cash-Hindustan Park" RESERVEDNAME="">
                <PARENT>Cash-in-hand</PARENT>
                <CLOSINGBALANCE>150000.00</CLOSINGBALANCE>
            </LEDGER>
            <LEDGER NAME="Axis Bank Ltd-Salt Lake">
                <PARENT>Bank Accounts</PARENT>
                <CLOSINGBALANCE>-42350.5</CLOSINGBALANCE>
            </LEDGER>
        </ENVELOPE>"#;
        let balances = parse_ledger_balances(xml).unwrap();
        assert_eq!(balances.len(), 2);
        assert_eq!(balances[0].name, "Cash-Hindustan Park");
        assert_eq!(balances[0].parent.as_deref(), Some("Cash-in-hand"));
        assert_eq!(balances[0].closing_balance, 150000.00);
        assert_eq!(balances[1].closing_balance, -42350.5);
    }

    #[test]
    fn skips_ledger_with_unparseable_balance() {
        let xml = r#"<ENVELOPE>
            <LEDGER NAME="Suspense A/c"><PARENT>Suspense</PARENT><CLOSINGBALANCE></CLOSINGBALANCE></LEDGER>
            <LEDGER NAME="Cash"><PARENT>Cash-in-hand</PARENT><CLOSINGBALANCE>100</CLOSINGBALANCE></LEDGER>
        </ENVELOPE>"#;
        let balances = parse_ledger_balances(xml).unwrap();
        assert_eq!(balances.len(), 1);
        assert_eq!(balances[0].name, "Cash");
    }

    #[test]
    fn request_includes_company_when_given() {
        let req = build_ledger_balances_request(Some("CONFETTI EXPORTS PVT. LTD"));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
        let req_no_company = build_ledger_balances_request(None);
        assert!(!req_no_company.contains("SVCURRENTCOMPANY"));
    }

    #[test]
    fn period_report_request_has_expected_shape() {
        let req = build_period_report_request(
            "Profit and Loss",
            Some("CONFETTI EXPORTS PVT. LTD"),
            "1-Apr-2026",
            "17-Sep-2026",
        );
        assert!(req.contains("<TYPE>Data</TYPE>"));
        assert!(req.contains("<ID>Profit and Loss</ID>"));
        assert!(req.contains(r#"<SVFROMDATE TYPE="Date">1-Apr-2026</SVFROMDATE>"#));
        assert!(req.contains(r#"<SVTODATE TYPE="Date">17-Sep-2026</SVTODATE>"#));
        assert!(req.contains("<SVCURRENTCOMPANY>CONFETTI EXPORTS PVT. LTD</SVCURRENTCOMPANY>"));
    }

    // Fabricated - no confirmed real P&L export was available, so this
    // fixture is shaped after Tally's documented Trial Balance example.
    #[test]
    fn parses_period_report_response() {
        let xml = r#"<ENVELOPE>
            <DSPACCINFO>
                <DSPACCNAME><DSPDISPNAME>Sales Accounts</DSPDISPNAME></DSPACCNAME>
                <DSPCLDRAMT>0</DSPCLDRAMT>
                <DSPCLDRAMTA>0</DSPCLDRAMTA>
                <DSPCLCRAMT>500000.00</DSPCLCRAMT>
                <DSPCLCRAMTA>500000.00</DSPCLCRAMTA>
            </DSPACCINFO>
            <DSPACCINFO>
                <DSPACCNAME><DSPDISPNAME>Rent Expense</DSPDISPNAME></DSPACCNAME>
                <DSPCLDRAMT>25000.00</DSPCLDRAMT>
                <DSPCLDRAMTA>25000.00</DSPCLDRAMTA>
                <DSPCLCRAMT>0</DSPCLCRAMT>
                <DSPCLCRAMTA>0</DSPCLCRAMTA>
            </DSPACCINFO>
        </ENVELOPE>"#;
        let amounts = parse_period_report(xml).unwrap();
        assert_eq!(amounts.len(), 2);
        assert_eq!(amounts[0].name, "Sales Accounts");
        assert_eq!(amounts[0].net_amount, 500000.00);
        assert_eq!(amounts[1].name, "Rent Expense");
        assert_eq!(amounts[1].net_amount, -25000.00);
    }

    #[test]
    fn skips_period_report_row_with_no_name() {
        let xml = r#"<ENVELOPE>
            <DSPACCINFO><DSPCLDRAMT>0</DSPCLDRAMT><DSPCLCRAMT>100</DSPCLCRAMT></DSPACCINFO>
            <DSPACCINFO>
                <DSPACCNAME><DSPDISPNAME>Sales</DSPDISPNAME></DSPACCNAME>
                <DSPCLDRAMT>0</DSPCLDRAMT><DSPCLCRAMT>100</DSPCLCRAMT>
            </DSPACCINFO>
        </ENVELOPE>"#;
        let amounts = parse_period_report(xml).unwrap();
        assert_eq!(amounts.len(), 1);
        assert_eq!(amounts[0].name, "Sales");
    }
}
