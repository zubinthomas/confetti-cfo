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
}

/// One ledger read back from Tally's gateway.
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerBalance {
    pub name: String,
    #[allow(dead_code)] // captured for future mapping-seed use, not needed for a sync push
    pub parent: Option<String>,
    pub closing_balance: f64,
}

/// One ledger's net movement over a period, read back from a Tally period
/// report (e.g. Profit and Loss) rather than a ledger-collection pull.
#[derive(Debug, Clone, PartialEq)]
pub struct PeriodLedgerAmount {
    pub name: String,
    pub net_amount: f64,
}
