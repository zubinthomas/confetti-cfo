//! Wire types shared with the server. Field names/shapes must stay in sync
//! with `server/tally/sync.ts`'s `TallyRecordInput` and
//! `server/routes/tallyAgent.ts` by hand - there's no shared schema between
//! the two languages.

use serde::{Deserialize, Serialize};

/// One ledger's value to push, matching `TallyRecordInput` on the server.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TallyRecord {
    pub ledger_name: String,
    pub period_type: PeriodType,
    pub period_start: String, // YYYY-MM-DD
    pub period_end: String,   // YYYY-MM-DD; same as period_start for a point-in-time balance
    pub value: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PeriodType {
    Month,
    Week,
    Custom,
}

/// Whether a mapped ledger pushes a point-in-time closing balance or a
/// period-aggregated (P&L) figure. Mirrors the server's `tally_value_mode` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ValueMode {
    Balance,
    Period,
}

/// Only meaningful when `ValueMode::Period`. Mirrors the server's
/// `tally_period_granularity` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PeriodGranularity {
    Month,
    Week,
}

/// One entry of `AgentConfig.ledgers`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedLedger {
    pub name: String,
    pub value_mode: ValueMode,
    pub period_granularity: PeriodGranularity,
}

/// GET /api/tally-agent/config response.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub sync_interval_minutes: u64,
    pub sync_mode: String, // auto | manual | paused - informational; the server enforces this, the agent just pushes
    pub ledgers: Vec<MappedLedger>,
    /// Set by an admin in the web UI; None means "use the local config.toml value".
    pub tally_gateway_url: Option<String>,
    pub tally_company_name: Option<String>,
    /// Set by an admin in the web UI; None means the agent's built-in default
    /// ("Profit and Loss").
    pub tally_period_report_name: Option<String>,
    /// Set by an admin in the web UI once the bill-wise ageing sync is ready
    /// to go live for this source. Defaults to false (via serde, for an older
    /// server response that doesn't send the field yet, and as the safe
    /// default so this never silently activates on an already-deployed
    /// agent) - never inferred from `ledgers` or anything else.
    #[serde(default)]
    pub sync_bills: bool,
}

/// The `bills` sub-object of a sync response - reported separately from
/// `status`/`error` above because syncTallyBillsPush (server/tally/sync.ts)
/// never touches the same tallySources outcome fields as the records push,
/// so a bills-side failure wouldn't otherwise show up anywhere in this
/// struct at all.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillsSyncResult {
    pub status: String,
    pub error: Option<String>,
    #[allow(dead_code)] // not acted on yet - logged for visibility only
    pub batch: Option<serde_json::Value>,
}

/// POST /api/tally-agent/sync response.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub status: String,
    pub error: Option<String>,
    pub unmapped_ledgers: Vec<String>,
    #[allow(dead_code)] // not acted on yet - logged for visibility only
    pub batches: Vec<serde_json::Value>,
    pub bills: BillsSyncResult,
}

/// One ledger read back from Tally's gateway.
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerBalance {
    pub name: String,
    /// Used by `tally_client::roll_up_by_primary_group` to walk the ledger up
    /// to its primary group for the standing Trial Balance check.
    pub parent: Option<String>,
    pub closing_balance: f64,
}

/// One ledger's opening and closing balance over a date range, from Tally's
/// ledger collection with SVFROMDATE/SVTODATE. Net movement is closing - opening.
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerRange {
    pub name: String,
    pub parent: Option<String>,
    pub opening: f64,
    pub closing: f64,
}

/// One ledger's net movement over a period, read back from a Tally period
/// report (e.g. Profit and Loss) rather than a ledger-collection pull.
#[derive(Debug, Clone, PartialEq)]
pub struct PeriodLedgerAmount {
    pub name: String,
    pub net_amount: f64,
}

/// One primary group's net closing balance from Tally's own Trial Balance
/// report. Group-level only - Trial Balance isn't exploded down to ledgers
/// the way Profit and Loss is. This is the standing cross-check
/// (`trial_balance_imbalance`) against the agent's own raw sum of ledger
/// closing balances.
#[derive(Debug, Clone, PartialEq)]
pub struct TrialBalanceGroup {
    pub name: String,
    pub net_amount: f64,
}

/// One group from Tally's own group hierarchy (NOT a Trial Balance line -
/// every group, including sub-groups, primary groups and everything in
/// between). Used to walk a ledger's immediate PARENT up to its primary
/// group. `parent` is empty, or the literal string `"Primary"`, exactly
/// when `name` is itself a primary group - confirmed on-site 2026-10-09
/// (15 primary groups in the real export, all with `PARENT=Primary`).
#[derive(Debug, Clone, PartialEq)]
pub struct TallyGroup {
    pub name: String,
    pub parent: String,
}

/// One bill read back from Tally's "Bills Receivable"/"Bills Payable" report
/// export (`tally_client::parse_bills_response`), before classification -
/// field names mirror Tally's own confirmed response tags (BILLPARTY,
/// BILLREF, BILLCL, etc. - see that function's doc comment) rather than
/// being renamed, so the mapping from raw XML to this struct stays
/// traceable. `closing_amount` is Tally's `BILLCL` tag, signed per the same
/// debit-negative/credit-positive convention as everywhere else in this
/// agent.
#[derive(Debug, Clone, PartialEq)]
pub struct RawBill {
    pub ledger_name: String,
    pub bill_ref: String,
    pub bill_date: Option<String>,
    pub closing_amount: f64,
    pub due_date: Option<String>,
    pub voucher_date: Option<String>,
    pub voucher_type: Option<String>,
    pub voucher_number: Option<String>,
    pub voucher_amount: Option<f64>,
}

/// Which side of the books an outstanding bill belongs to. Classified by
/// `classify_bills` (main.rs) from the bill's own ledger's immediate PARENT
/// group - neither "Bills Receivable" nor "Bills Payable" report ID is
/// cleanly scoped by this on the real install (confirmed 2026-10-16: both
/// return a mix of Sundry Debtors, Sundry Creditors, and Fixed Assets
/// ledgers), so this can't be inferred from which report a bill came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BillNature {
    Receivable,
    Payable,
}

/// One outstanding bill, pushed to the server as part of `POST
/// /api/tally-agent/sync`'s `bills` array. Mirrors the server's
/// `ParsedBillRecord` (server/import/types.ts) by hand - no shared schema
/// between the two languages, same as `TallyRecord` above.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillRecord {
    pub ledger_name: String,
    pub bill_ref: String,
    pub bill_date: Option<String>,
    pub nature: BillNature,
    pub outstanding_amount: f64,
    pub due_date: Option<String>,
    pub voucher_date: Option<String>,
    pub voucher_type: Option<String>,
    pub voucher_number: Option<String>,
    pub voucher_amount: Option<f64>,
}
