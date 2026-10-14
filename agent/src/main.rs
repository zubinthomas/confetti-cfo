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
use confetti_tally_agent::tally_client::{
    books_imbalance, reconcile_period_with_ledger_range, reconcile_trial_balance_by_group, roll_up_by_primary_group,
    HttpTallyGateway,
};
use confetti_tally_agent::types::{MappedLedger, PeriodGranularity, PeriodType, TallyRecord, ValueMode};

/// Used when the server doesn't send a period report name. Unverified against
/// real Tally - see agent/README.md. The server can override it per source.
const DEFAULT_PERIOD_REPORT_NAME: &str = "Profit and Loss";

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
    let report_name = agent_config.tally_period_report_name.as_deref().unwrap_or(DEFAULT_PERIOD_REPORT_NAME);

    // Standing books-balance check (tally-deployment-steps.md step 3). Runs
    // every cycle regardless of which value mode is mapped - unlike
    // `books_imbalance`, which only ever runs inside `fetch_period_records`
    // and so has never actually run against this client (no period-mode
    // ledger is mapped yet, only balance mode). Diagnostic only; never
    // affects what gets pushed.
    check_trial_balance(&tally);

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
        records.extend(fetch_period_records(&tally, report_name, &month_ledgers, PeriodType::Month, from, today, today));
    }

    if !week_ledgers.is_empty() {
        let monday = today - ChronoDuration::days(today.weekday().num_days_from_monday() as i64);
        let sunday = monday + ChronoDuration::days(6);
        let query_to = today.min(sunday);
        records.extend(fetch_period_records(&tally, report_name, &week_ledgers, PeriodType::Week, monday, query_to, sunday));
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

/// Fetches Tally's period report for `[period_start, query_to]` purely as a
/// cross-check, and builds one TallyRecord per mapped ledger from the raw
/// ledger range instead. Tally's `EXPLODEFLAG=Yes` report export has been
/// confirmed (2026-10-14, live against the JP Office install) to come back
/// 0.00 for a scattered subset of ledgers whose actual period movement is
/// nonzero - verified wrong by cross-checking Tally's own UI three ways
/// (Ledger Voucher list, Ledger Monthly Summary, Group Summary) for
/// "CLEANING CHARGES", all of which agreed with the raw range and not with
/// the exploded export. The raw range query has no report template or
/// EXPLODEFLAG explosion to get wrong, so it's the one used for the actual
/// pushed value; a disagreement is now a warning, not a reason to discard an
/// entire cycle's otherwise-good data. `period_end` is what gets sent to the
/// server (load-bearing for `Week`), and may differ from `query_to`.
fn fetch_period_records(
    tally: &HttpTallyGateway,
    report_name: &str,
    ledgers: &[&MappedLedger],
    period_type: PeriodType,
    period_start: NaiveDate,
    query_to: NaiveDate,
    period_end: NaiveDate,
) -> Vec<TallyRecord> {
    let from = format_tally_date(period_start);
    let to = format_tally_date(query_to);
    let amounts = match tally.fetch_period_report(report_name, &from, &to) {
        Ok(a) => a,
        Err(e) => {
            log::error!("could not fetch period report ({period_type:?}) from Tally - skipping the cross-check this cycle: {e}");
            Vec::new()
        }
    };
    let range = match tally.fetch_ledger_range(&from, &to) {
        Ok(r) => r,
        Err(e) => {
            log::error!("could not fetch raw ledger balances ({period_type:?}): {e}");
            return Vec::new();
        }
    };
    if let Some(total) = books_imbalance(&range) {
        log::warn!("raw ledger closing balances sum to {total:.2}, not zero - the raw data or sign convention may be off");
    }
    let names: Vec<&str> = ledgers.iter().map(|l| l.name.as_str()).collect();
    let problems = reconcile_period_with_ledger_range(&amounts, &range, &names);
    for p in &problems {
        log::warn!("P&L report disagrees with raw ledger movement ({period_type:?}), using raw ledger movement: {p}");
    }
    let wanted: std::collections::HashSet<&str> = names.into_iter().collect();
    let period_start_str = period_start.format("%Y-%m-%d").to_string();
    let period_end_str = period_end.format("%Y-%m-%d").to_string();
    range
        .into_iter()
        .filter(|r| wanted.contains(r.name.as_str()))
        .map(|r| TallyRecord {
            ledger_name: r.name,
            period_type,
            period_start: period_start_str.clone(),
            period_end: period_end_str.clone(),
            value: r.closing - r.opening,
        })
        .collect()
}

/// Formats a date the way Tally's gateway expects for SVFROMDATE/SVTODATE
/// (`YYYYMMDD`, per the reference Tally MCP implementation).
fn format_tally_date(d: NaiveDate) -> String {
    d.format("%Y%m%d").to_string()
}

/// Groups whose raw rollup is known, as of 2026-10-09, not to match Tally's
/// own Trial Balance exactly - confirmed on real data, not guessed. Logged at
/// `warn` with the known-imprecise reason instead of `error`, so a genuinely
/// new problem in some other group still stands out. "Current Assets" is
/// short by about 14.2 lakh against a real capture: roughly 440 of the 730
/// ledgers that roll up to it (mostly Sundry Debtors/Advance-type ledgers)
/// come back with an empty CLOSINGBALANCE from the plain ledger-balances
/// Collection, which `parse_ledger_balances` treats as zero - the working
/// theory is a handful of those are bill-wise-tracked ledgers that actually
/// carry a real balance that NATIVEMETHOD ClosingBalance doesn't resolve for
/// that ledger type, not that they're genuinely zero. Not yet root-caused to
/// specific ledgers - see tally-deployment-steps.md step 3.
const KNOWN_IMPRECISE_GROUPS: &[&str] = &["Current Assets"];

/// Groups Tally computes for display rather than reports as a literal
/// rollup, so comparing them to the agent's own raw-ledger rollup isn't
/// meaningful - see `reconcile_trial_balance_by_group`'s own doc comment.
const SKIP_GROUPS: &[&str] = &["Profit & Loss A/c"];

/// The standing books-balance check (tally-deployment-steps.md step 3):
/// pulls Tally's own Trial Balance report, the raw ledger-balances
/// Collection, and the group hierarchy, rolls the raw ledger balances up to
/// their primary groups, and compares each primary group's rolled-up total
/// against Tally's own Trial Balance figure for that group. This replaced an
/// earlier grand-total-only version (2026-10-09): Tally won't save an
/// unbalanced voucher, so a single "do both totals net to zero" comparison
/// is close to a tautology and doesn't test anything real. Comparing group
/// by group does: it confirms the agent's own ledger pull, sign convention,
/// and group-rollup logic agree with Tally's own authoritative report,
/// which is a genuine integrity check on the agent's own data pipeline, not
/// a claim about whether the client's books balance (Tally already
/// guarantees that). Diagnostic only - never blocks a sync.
fn check_trial_balance(tally: &HttpTallyGateway) {
    let balances = match tally.fetch_ledger_balances() {
        Ok(b) => b,
        Err(e) => {
            log::error!("trial balance check: could not fetch ledger balances from Tally: {e}");
            return;
        }
    };
    let groups = match tally.fetch_group_hierarchy() {
        Ok(g) => g,
        Err(e) => {
            log::error!("trial balance check: could not fetch Tally's group hierarchy: {e}");
            return;
        }
    };
    let trial_balance = match tally.fetch_trial_balance() {
        Ok(tb) => tb,
        Err(e) => {
            log::error!("trial balance check: could not fetch Tally's Trial Balance report: {e}");
            return;
        }
    };

    let rollup = roll_up_by_primary_group(&balances, &groups);
    let problems = reconcile_trial_balance_by_group(&rollup, &trial_balance, SKIP_GROUPS);

    let mut unexpected = 0;
    for (name, raw, tally_total) in &problems {
        let diff = raw - tally_total;
        if KNOWN_IMPRECISE_GROUPS.contains(&name.as_str()) {
            log::warn!(
                "trial balance check: \"{name}\" raw rollup {raw:.2} vs Tally's Trial Balance {tally_total:.2} (diff {diff:.2}) - known imprecision, see agent/README.md"
            );
        } else {
            unexpected += 1;
            log::error!(
                "trial balance check: \"{name}\" raw rollup {raw:.2} disagrees with Tally's own Trial Balance {tally_total:.2} (diff {diff:.2})"
            );
        }
    }
    if unexpected == 0 {
        let mut seen: std::collections::HashSet<&str> = rollup.keys().map(String::as_str).collect();
        seen.extend(trial_balance.iter().map(|g| g.name.as_str()));
        let compared = seen.len() - seen.iter().filter(|n| SKIP_GROUPS.contains(n)).count();
        log::info!(
            "trial balance check: no unexpected mismatches ({compared} primary group(s) compared, {} known-imprecise, {} skipped)",
            problems.len(),
            SKIP_GROUPS.len()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    /// Reproduces the real failure confirmed 2026-10-14 against the JP
    /// Office install: the EXPLODEFLAG period report comes back 0.00 for
    /// "CLEANING CHARGES" while the raw ledger range shows real movement.
    /// Asserts the returned record uses the raw range's value, and that a
    /// ledger where both sources agree ("CCTV Maintanence") still comes
    /// through correctly too.
    #[test]
    fn fetch_period_records_prefers_the_raw_range_over_a_disagreeing_report() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let addr = server.server_addr();

        let handle = thread::spawn(move || {
            // fetch_period_records calls fetch_period_report first, then
            // fetch_ledger_range - respond to each in that fixed order.
            let mut period_request = server.recv().unwrap();
            let mut body = String::new();
            period_request.as_reader().read_to_string(&mut body).unwrap();
            assert!(body.contains("<TYPE>Data</TYPE>"), "first request should be the period report export");
            let period_xml = r#"<ENVELOPE>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>CLEANING CHARGES</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT>0.00</BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
<BSNAME>
  <DSPACCNAME>
   <DSPDISPNAME>CCTV Maintanence</DSPDISPNAME>
</DSPACCNAME>
</BSNAME>
 <BSAMT>
  <BSSUBAMT>0.00</BSSUBAMT>
  <BSMAINAMT></BSMAINAMT>
</BSAMT>
</ENVELOPE>"#;
            period_request
                .respond(tiny_http::Response::from_string(period_xml))
                .unwrap();

            let mut range_request = server.recv().unwrap();
            let mut body = String::new();
            range_request.as_reader().read_to_string(&mut body).unwrap();
            assert!(body.contains("<ID>ConfettiLedgerRange</ID>"), "second request should be the raw ledger range");
            let range_xml = r#"<ENVELOPE>
<LEDGER NAME="CLEANING CHARGES">
  <PARENT>Building &amp; Show Room Maintanance</PARENT>
  <OPENINGBALANCE>190163.01</OPENINGBALANCE>
  <CLOSINGBALANCE>201492.38</CLOSINGBALANCE>
</LEDGER>
<LEDGER NAME="CCTV Maintanence">
  <PARENT>Building &amp; Show Room Maintanance</PARENT>
  <OPENINGBALANCE>13871.00</OPENINGBALANCE>
  <CLOSINGBALANCE>13871.00</CLOSINGBALANCE>
</LEDGER>
</ENVELOPE>"#;
            range_request
                .respond(tiny_http::Response::from_string(range_xml))
                .unwrap();
        });

        let tally = HttpTallyGateway::new(&format!("http://{addr}"), None);
        let cleaning = MappedLedger {
            name: "CLEANING CHARGES".to_string(),
            value_mode: ValueMode::Period,
            period_granularity: PeriodGranularity::Month,
        };
        let cctv = MappedLedger {
            name: "CCTV Maintanence".to_string(),
            value_mode: ValueMode::Period,
            period_granularity: PeriodGranularity::Month,
        };
        let ledgers: Vec<&MappedLedger> = vec![&cleaning, &cctv];
        let period_start = NaiveDate::from_ymd_opt(2026, 10, 1).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 10, 13).unwrap();

        let records = fetch_period_records(&tally, "Profit and Loss", &ledgers, PeriodType::Month, period_start, today, today);

        handle.join().unwrap();

        let by_name: std::collections::HashMap<&str, f64> =
            records.iter().map(|r| (r.ledger_name.as_str(), r.value)).collect();
        let cleaning = *by_name.get("CLEANING CHARGES").expect("CLEANING CHARGES should be in the pushed records");
        assert!((cleaning - 11329.37).abs() < 0.01, "should use the raw range's value (~11329.37), not the report's wrong 0.00: got {cleaning}");
        let cctv = *by_name.get("CCTV Maintanence").expect("CCTV Maintanence should be in the pushed records");
        assert!(cctv.abs() < 0.01, "CCTV Maintanence had no real movement, expected ~0.0: got {cctv}");
    }
}
