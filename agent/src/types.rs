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
    // Not produced yet - main.rs only ever pushes Custom (point-in-time
    // closing balances). Kept here because the server's TallyRecordInput
    // accepts all three; a future month-period P&L pull would use Month.
    #[allow(dead_code)]
    Month,
    #[allow(dead_code)]
    Week,
    Custom,
}

/// GET /api/tally-agent/config response.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub sync_interval_minutes: u64,
    pub sync_mode: String, // auto | manual | paused - informational; the server enforces this, the agent just pushes
    pub ledger_names: Vec<String>,
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
