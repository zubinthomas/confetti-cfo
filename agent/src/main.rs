//! Confetti Tally agent - runs on the client's Tally machine, polls Tally's
//! local gateway for ledger closing balances, and pushes the ones the server
//! has mapped. See agent/README.md for what's built vs. still to verify
//! against a real TallyPrime instance, and the integration plan
//! (~/.claude/plans - not in this repo) for the wider design.
//!
//! Two run modes: `run_foreground()` below (a plain loop, used for local
//! dev/testing on any platform) and, on Windows only, `service::run_as_service()`
//! (installed as a real Windows Service - see service.rs and "Running as a
//! Windows Service" in the README). main() below just decides which one to
//! use based on platform and argv.
use std::thread;
use std::time::Duration;

use chrono::{Datelike, Local, NaiveDate};
use chrono::Duration as ChronoDuration;

use confetti_tally_agent::config::Config;
use confetti_tally_agent::server_client::ServerClient;
use confetti_tally_agent::tally_client::HttpTallyGateway;
use confetti_tally_agent::types::{MappedLedger, PeriodGranularity, PeriodType, TallyRecord, ValueMode};

/// Report name passed as the Tally gateway request's <ID> for period pulls.
/// UNVERIFIED against real Tally - see agent/README.md and tally_client.rs.
const PERIOD_REPORT_NAME: &str = "Profit and Loss";

#[cfg(windows)]
mod service;

/// Used when the server can't be reached at all, so there's no fetched
/// interval to honor yet - short enough to recover quickly, long enough not
/// to hammer a server that's actually down.
const FALLBACK_RETRY_SECONDS: u64 = 300;

#[cfg(not(windows))]
fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    run_foreground();
}

/// On Windows, argv decides the mode: no args means this was launched by the
/// Service Control Manager (the way an installed service actually starts),
/// --install/--uninstall register or remove it (needs an elevated prompt),
/// --foreground runs the plain loop for testing before installing it as a
/// service.
#[cfg(windows)]
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("--install") => {
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
            if let Err(e) = service::install_service() {
                log::error!("could not install service: {e}");
                std::process::exit(1);
            }
            log::info!("service installed - it will start automatically on boot, or start it now from Services.msc");
        }
        Some("--uninstall") => {
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
            if let Err(e) = service::uninstall_service() {
                log::error!("could not uninstall service: {e}");
                std::process::exit(1);
            }
            log::info!("service uninstalled");
        }
        Some("--foreground") => {
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
            run_foreground();
        }
        _ => {
            // No console here if this really was launched by the SCM, so
            // service::run_as_service() sets up its own file logging before
            // doing anything else that might need to log.
            if let Err(e) = service::run_as_service() {
                eprintln!(
                    "could not start as a Windows service: {e}\n\
                     (if you meant to run this interactively, use --foreground; \
                     to install it as a service first, use --install)"
                );
                std::process::exit(1);
            }
        }
    }
}

fn run_foreground() {
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
    if agent_config.ledgers.is_empty() {
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

    let balance_ledgers: Vec<&MappedLedger> =
        agent_config.ledgers.iter().filter(|l| l.value_mode == ValueMode::Balance).collect();
    let month_ledgers: Vec<&MappedLedger> = agent_config.ledgers.iter()
        .filter(|l| l.value_mode == ValueMode::Period && l.period_granularity == PeriodGranularity::Month)
        .collect();
    let week_ledgers: Vec<&MappedLedger> = agent_config.ledgers.iter()
        .filter(|l| l.value_mode == ValueMode::Period && l.period_granularity == PeriodGranularity::Week)
        .collect();

    let today = Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();
    let mut records: Vec<TallyRecord> = Vec::new();

    if !balance_ledgers.is_empty() {
        let wanted: std::collections::HashSet<&str> = balance_ledgers.iter().map(|l| l.name.as_str()).collect();
        match tally.fetch_ledger_balances() {
            Ok(balances) => {
                records.extend(balances.into_iter().filter(|b| wanted.contains(b.name.as_str())).map(|b| TallyRecord {
                    ledger_name: b.name,
                    period_type: PeriodType::Custom,
                    period_start: today_str.clone(),
                    period_end: today_str.clone(),
                    value: b.closing_balance,
                }));
            }
            Err(e) => log::error!("could not fetch ledger balances from Tally: {e}"),
        }
    }

    if !month_ledgers.is_empty() {
        let from = today.with_day(1).unwrap_or(today);
        records.extend(fetch_period_records(&tally, &month_ledgers, PeriodType::Month, from, today, today));
    }

    if !week_ledgers.is_empty() {
        let monday = today - ChronoDuration::days(today.weekday().num_days_from_monday() as i64);
        let sunday = monday + ChronoDuration::days(6);
        let query_to = today.min(sunday);
        records.extend(fetch_period_records(&tally, &week_ledgers, PeriodType::Week, monday, query_to, sunday));
    }

    if records.is_empty() {
        log::info!("none of the {} mapped ledger(s) produced a value to push this cycle", agent_config.ledgers.len());
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

/// Fetches Tally's period report for `[period_start, query_to]`, filters to
/// `ledgers`, and builds one TallyRecord per match - `period_end` is what
/// gets sent to the server (load-bearing for `Week`, since the server
/// doesn't recompute it the way it does for `Month`), which may differ from
/// `query_to` (the actual date asked of Tally, capped at today).
fn fetch_period_records(
    tally: &HttpTallyGateway,
    ledgers: &[&MappedLedger],
    period_type: PeriodType,
    period_start: NaiveDate,
    query_to: NaiveDate,
    period_end: NaiveDate,
) -> Vec<TallyRecord> {
    let wanted: std::collections::HashSet<&str> = ledgers.iter().map(|l| l.name.as_str()).collect();
    let amounts = match tally.fetch_period_report(
        PERIOD_REPORT_NAME,
        &format_tally_date(period_start),
        &format_tally_date(query_to),
    ) {
        Ok(a) => a,
        Err(e) => {
            log::error!("could not fetch period report ({period_type:?}) from Tally: {e}");
            return Vec::new();
        }
    };
    let period_start_str = period_start.format("%Y-%m-%d").to_string();
    let period_end_str = period_end.format("%Y-%m-%d").to_string();
    amounts
        .into_iter()
        .filter(|a| wanted.contains(a.name.as_str()))
        .map(|a| TallyRecord {
            ledger_name: a.name,
            period_type,
            period_start: period_start_str.clone(),
            period_end: period_end_str.clone(),
            value: a.net_amount,
        })
        .collect()
}

/// Formats a date the way Tally's gateway expects for SVFROMDATE/SVTODATE
/// (`D-Mon-YYYY`, e.g. "1-Apr-2026") - UNVERIFIED, see tally_client.rs.
fn format_tally_date(d: NaiveDate) -> String {
    format!("{}-{}", d.day(), d.format("%b-%Y"))
}
