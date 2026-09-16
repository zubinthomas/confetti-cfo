//! Confetti Tally agent - runs on the client's Tally machine, polls Tally's
//! local gateway for ledger closing balances, and pushes the ones the server
//! has mapped. See agent/README.md for what's built vs. still to verify
//! against a real TallyPrime instance, and the integration plan
//! (~/.claude/plans - not in this repo) for the wider design.
//!
//! Currently a plain long-running process, not yet a Windows Service - see
//! the README for why that's fine for now and what packaging it as one later
//! would take.
use std::thread;
use std::time::Duration;

use chrono::Local;

use confetti_tally_agent::config::Config;
use confetti_tally_agent::server_client::ServerClient;
use confetti_tally_agent::tally_client::HttpTallyGateway;
use confetti_tally_agent::types::{PeriodType, TallyRecord};

/// Used when the server can't be reached at all, so there's no fetched
/// interval to honor yet - short enough to recover quickly, long enough not
/// to hammer a server that's actually down.
const FALLBACK_RETRY_SECONDS: u64 = 300;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let config = match Config::load() {
        Ok(c) => c,
        Err(e) => {
            log::error!("could not start: {e}");
            std::process::exit(1);
        }
    };

    let server = ServerClient::new(&config.server_url, &config.api_key);

    log::info!("confetti-tally-agent starting - server={}", config.server_url);

    loop {
        let sleep_seconds = run_cycle(&server, &config);
        log::info!("sleeping {sleep_seconds}s until next sync");
        thread::sleep(Duration::from_secs(sleep_seconds));
    }
}

/// Runs one fetch-config -> query-Tally -> push cycle. Never panics: any
/// failure is logged and the cycle just produces nothing to push. Returns how
/// long to sleep before the next cycle, in seconds.
fn run_cycle(server: &ServerClient, local: &Config) -> u64 {
    let agent_config = match server.fetch_config() {
        Ok(c) => c,
        Err(e) => {
            log::error!("could not fetch config from server: {e}");
            return FALLBACK_RETRY_SECONDS;
        }
    };
    let sleep_seconds = agent_config.sync_interval_minutes.max(1) * 60;

    if agent_config.sync_mode == "paused" {
        log::info!("source is paused on the server - skipping this cycle");
        return sleep_seconds;
    }
    if agent_config.ledger_names.is_empty() {
        log::info!("no ledgers mapped yet on the server - nothing to sync");
        return sleep_seconds;
    }

    // Server-set value wins; fall back to the local file for whichever the
    // admin hasn't set remotely yet.
    let gateway_url = agent_config.tally_gateway_url.as_deref()
        .or(local.tally_gateway_url.as_deref());
    let Some(gateway_url) = gateway_url else {
        log::error!("no tally_gateway_url set on the server or in config.toml - skipping this cycle");
        return sleep_seconds;
    };
    let company_name = agent_config.tally_company_name.clone()
        .or_else(|| local.tally_company_name.clone());
    let tally = HttpTallyGateway::new(gateway_url, company_name);

    let balances = match tally.fetch_ledger_balances() {
        Ok(b) => b,
        Err(e) => {
            log::error!("could not fetch ledger balances from Tally: {e}");
            return sleep_seconds;
        }
    };

    let wanted: std::collections::HashSet<&str> =
        agent_config.ledger_names.iter().map(String::as_str).collect();
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();

    let records: Vec<TallyRecord> = balances
        .into_iter()
        .filter(|b| wanted.contains(b.name.as_str()))
        .map(|b| TallyRecord {
            ledger_name: b.name,
            period_type: PeriodType::Custom,
            period_start: today.clone(),
            period_end: today.clone(),
            value: b.closing_balance,
        })
        .collect();

    if records.is_empty() {
        log::info!("none of the {} mapped ledger(s) were found in Tally's response", wanted.len());
        return sleep_seconds;
    }

    match server.push_sync(&records) {
        Ok(result) => {
            log::info!("pushed {} record(s): status={}", records.len(), result.status);
            if !result.unmapped_ledgers.is_empty() {
                log::warn!("server reports {} unmapped ledger(s): {:?}", result.unmapped_ledgers.len(), result.unmapped_ledgers);
            }
            if let Some(err) = result.error {
                log::warn!("server reported an error: {err}");
            }
        }
        Err(e) => log::error!("could not push sync to server: {e}"),
    }

    sleep_seconds
}
