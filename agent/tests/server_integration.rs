//! Exercises ServerClient against a REAL running confetti-cfo dev server -
//! not mocked, because the point is confirming this crate's HTTP client
//! actually agrees with server/routes/tallyAgent.ts's real behavior, not
//! just with what this crate assumes that behavior is.
//!
//! Ignored by default (`cargo test` won't try to reach a server that isn't
//! there). Run explicitly with the dev server up:
//!   npm run dev   (in server/, from the repo root)
//!   cargo test -- --ignored
//!
//! Uses the server's e2e fixture login (server/db/ensure-e2e-user.ts) only to
//! create/delete a throwaway tally_sources row via the human API - the agent
//! itself never logs in as a human, only ServerClient (API-key auth) is the
//! code actually under test here.
use confetti_tally_agent::server_client::ServerClient;
use confetti_tally_agent::types::{PeriodType, TallyRecord};

const SERVER_URL: &str = "http://localhost:3001";
const E2E_EMAIL: &str = "e2e@confetti.test";
const E2E_PASSWORD: &str = "e2e-test-password";

fn human_login() -> String {
    let resp: serde_json::Value = reqwest::blocking::Client::new()
        .post(format!("{SERVER_URL}/api/auth/login"))
        .json(&serde_json::json!({ "email": E2E_EMAIL, "password": E2E_PASSWORD }))
        .send()
        .expect("login request failed - is the dev server running on :3001?")
        .json()
        .unwrap();
    resp["access_token"].as_str().unwrap().to_string()
}

#[test]
#[ignore]
fn config_and_push_round_trip_against_real_server() {
    let token = human_login();
    let http = reqwest::blocking::Client::new();

    // create a throwaway source, with a gateway URL/company name set up front
    // to confirm they round-trip through GET /config below
    let created: serde_json::Value = http
        .post(format!("{SERVER_URL}/api/tally/sources"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "label": "agent-crate integration test",
            "tallyGatewayUrl": "http://localhost:9001",
            "tallyCompanyName": "Integration Test Co",
        }))
        .send().unwrap().json().unwrap();
    let source_id = created["source"]["id"].as_i64().unwrap();
    let api_key = created["apiKey"].as_str().unwrap().to_string();

    // fetch a real business unit + line item to map against
    let reference: serde_json::Value = http
        .get(format!("{SERVER_URL}/api/reference"))
        .bearer_auth(&token)
        .send().unwrap().json().unwrap();
    let unit_id = reference["businessUnits"][0]["id"].as_i64().unwrap();
    let line_item_id = reference["lineItems"][0]["id"].as_i64().unwrap();

    http.post(format!("{SERVER_URL}/api/tally/sources/{source_id}/mappings"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "ledgerName": "Integration Test Ledger",
            "businessUnitId": unit_id,
            "lineItemId": line_item_id,
        }))
        .send().unwrap();

    // this is the code actually under test: the agent's own client, using
    // its API key, not the human token above
    let agent = ServerClient::new(SERVER_URL, &api_key);

    let config = agent.fetch_config().expect("fetch_config should succeed with a valid API key");
    assert_eq!(config.ledger_names, vec!["Integration Test Ledger".to_string()]);
    assert_eq!(config.tally_gateway_url.as_deref(), Some("http://localhost:9001"));
    assert_eq!(config.tally_company_name.as_deref(), Some("Integration Test Co"));

    // clearing them via PATCH (the admin-UI path) should surface as None,
    // not an empty string, on the next fetch_config
    http.patch(format!("{SERVER_URL}/api/tally/sources/{source_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "tallyGatewayUrl": null, "tallyCompanyName": null }))
        .send().unwrap();
    let cleared_config = agent.fetch_config().expect("fetch_config should still succeed after clearing");
    assert_eq!(cleared_config.tally_gateway_url, None);
    assert_eq!(cleared_config.tally_company_name, None);

    let result = agent.push_sync(&[TallyRecord {
        ledger_name: "Integration Test Ledger".to_string(),
        period_type: PeriodType::Custom,
        period_start: "2026-01-01".to_string(),
        period_end: "2026-01-01".to_string(),
        value: 42.0,
    }]).expect("push_sync should succeed with a valid API key");
    assert_eq!(result.status, "preview_created");
    assert!(result.unmapped_ledgers.is_empty());

    // cleanup - delete the source (mappings cascade); the preview batch it
    // created is left as harmless history, same as the manual verification
    // done when the server endpoints were first built.
    http.delete(format!("{SERVER_URL}/api/tally/sources/{source_id}"))
        .bearer_auth(&token).send().unwrap();
}
