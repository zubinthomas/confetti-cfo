//! Talks to confetti-cfo's agent-facing API (server/routes/tallyAgent.ts) -
//! the outbound-only direction the integration plan settled on, since this
//! machine can't be relied on to be reachable inbound. Every call carries the
//! install's API key as a Bearer token (server/middleware/tallyAgentAuth.ts).
use crate::types::{AgentConfig, SyncResponse, TallyRecord};

pub struct ServerClient {
    base_url: String,
    api_key: String,
    http: reqwest::blocking::Client,
}

impl ServerClient {
    pub fn new(server_url: &str, api_key: &str) -> Self {
        Self {
            base_url: server_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            http: reqwest::blocking::Client::new(),
        }
    }

    /// GET /api/tally-agent/config - cadence + which ledgers are in scope.
    pub fn fetch_config(&self) -> Result<AgentConfig, reqwest::Error> {
        self.http
            .get(format!("{}/api/tally-agent/config", self.base_url))
            .bearer_auth(&self.api_key)
            .send()?
            .error_for_status()?
            .json()
    }

    /// POST /api/tally-agent/sync - never expected to error on a data-side
    /// problem (unmapped ledgers, validation issues); those come back inside
    /// a 200 response body. A non-2xx here means auth or transport failed.
    pub fn push_sync(&self, records: &[TallyRecord]) -> Result<SyncResponse, reqwest::Error> {
        self.http
            .post(format!("{}/api/tally-agent/sync", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&serde_json::json!({ "records": records }))
            .send()?
            .error_for_status()?
            .json()
    }
}
