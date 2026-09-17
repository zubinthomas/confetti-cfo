# confetti-tally-agent

Runs on the client's Tally machine. Polls Tally's local XML/HTTP gateway for
ledger closing balances, and pushes the ones an admin has mapped
(`/api/tally/sources/:id/mappings`) to the confetti-cfo server. See the wider
integration plan for the design this implements (business context isn't
repeated here).

## What's here

- `src/config.rs` - loads `config.toml` (server URL, this install's API key,
  the local Tally gateway URL/port).
- `src/tally_client.rs` - two Tally gateway request shapes: a TDL
  "Collection" request for every ledger's `NAME`/`PARENT`/`CLOSINGBALANCE`
  (balance-mode ledgers), and a report "Export" request (e.g. Profit and
  Loss) for a date range (period-mode ledgers) - and parsers for both XML
  responses.
- `src/server_client.rs` - the confetti-cfo side: `GET /api/tally-agent/config`
  (cadence + which ledgers are in scope, and each one's value mode/period
  granularity) and `POST /api/tally-agent/sync` (push), both authenticated
  with the install's API key.
- `src/main.rs` - the loop: fetch config -> split mapped ledgers into
  balance/monthly-P&L/weekly-P&L groups -> query Tally per group -> push
  everything together -> sleep for however long the server said to.
- `src/service.rs` (Windows only) - wraps that same loop as a real Windows
  Service. See "Running as a Windows Service" below.

## Not yet verified against a real Tally instance

Written and tested against the *documented* shape of Tally's gateway XML
(the TDL Collection request/response format) - no real TallyPrime instance
was available while building this. Before trusting a real push, confirm
on-site:

- **Sign convention.** Whether `CLOSINGBALANCE` comes back debit-positive or
  credit-positive for the ledgers that matter (cash/bank vs. liabilities)
  isn't something a schema doc alone settles reliably.
- **Ledger name escaping/encoding.** Real ledger names have been seen with
  `&`, parentheses, and non-ASCII characters (see the client's actual
  chart-of-accounts export) - `xml_escape` in `tally_client.rs` handles the
  basics, but only real responses will show what Tally actually sends back.
- **The gateway port.** This client's is `9001`, not Tally's `9000` default -
  already reflected in `config.example.toml`, but double-check per
  installation.
- **Period report shape (month/week P&L pushes).** This is the biggest
  unverified leap in the whole integration. `build_period_report_request`/
  `parse_period_report` in `tally_client.rs` are inferred from Tally's
  documented *Trial Balance* export example - no confirmed Profit and Loss
  example was found. Specifically unconfirmed:
  - The exact report `<ID>` string Tally expects (using `"Profit and
    Loss"`, not confirmed exact - Tally's report names are sometimes
    TDL-internal identifiers that differ from what's shown in the UI).
  - The `SVFROMDATE`/`SVTODATE` date format (using `D-Mon-YYYY`, e.g.
    `1-Apr-2026`, per a documented Trial Balance example - a separate
    search summary claimed `YYYYMMDD` instead).
  - Whether `EXPLODEFLAG=Yes` returns ledger-level rows for a P&L report
    the way it does for Trial Balance, or something coarser (group totals
    only).
  - The row/tag shape itself - whether a P&L export actually uses
    `DSPACCINFO`/`DSPACCNAME`/`DSPDISPNAME`/`DSPCLDRAMT(A)`/`DSPCLCRAMT(A)`
    the same way Trial Balance does.
  - The debit/credit-to-signed-value convention (`net_amount = credit -
    debit` is a best guess, same tier of guess as `CLOSINGBALANCE`'s sign
    above).

  Do not trust month/week P&L numbers from this agent until confirmed
  against a real TallyPrime instance - everything downstream of the Tally
  gateway call (server routes, merge pipeline, admin UI) has been verified
  against the live dev server with fixture data, but not against real
  Tally output.

## Running it

```sh
cp config.example.toml config.toml   # then fill in api_key etc.
cargo run
```

Logs go to stdout via `env_logger`; set `RUST_LOG=debug` for more detail.
This is also how to run it interactively on Windows before installing it as
a service - see below.

Month/week P&L pushes only ever report on the *current* month/week as of
each run - a period whose window closed while the agent was down (e.g.
across a month boundary) is not backfilled. This is a keep-dashboards-fresh
tool, not a historical importer.

## Running as a Windows Service

Built with the `windows-service` crate (`src/service.rs`). Only compiled in
on Windows (`#[cfg(windows)]` throughout, and a target-gated dependency in
`Cargo.toml`), so it never affects the Linux dev build above.

**Verified on a real Windows 11 VM** (install -> `sc query` shows it
registered correctly, AUTO_START, LocalSystem -> `sc start` ->
`agent.log` shows the real poll loop running, including a real network
round trip to a live confetti-cfo server over the VM's NAT interface and a
correctly-mapped ledger name fetched from it -> `sc stop` -> `agent.log`
shows the control handler catching the stop request and shutting down
cleanly within seconds, not the full sync interval -> `sc query` confirms
STOPPED -> `--uninstall` -> `sc query` confirms it's gone). One thing this
pass didn't cover: reboot survival and the `sc.exe failure` restart-on-crash
action below, since that VM had no real Tally install to generate a crash
against - lower priority than the install/start/stop path that's now
confirmed.

**Build** (on an actual Windows machine, recommended for a production
binary - cross-compiling with the `gnu` target from Linux is only useful as
a compile-smoke-test, not for a binary you'd actually deploy):
```
cargo build --release --target x86_64-pc-windows-msvc
```

**Install** (from an elevated/Administrator command prompt, after copying
the built `.exe` and a filled-in `config.toml` next to each other):
```
confetti-tally-agent.exe --install
```
This registers it as a service (`ConfettiTallyAgent`, display name "Confetti
Tally Agent") set to start automatically on boot. It does not start it
immediately - start it from `services.msc`, or `sc.exe start
ConfettiTallyAgent`.

Restart-on-crash isn't configured by the installer (the exact
`ServiceFailureActions` API wasn't confirmed against a real build - see
`src/service.rs`). Set it up once, after installing, with:
```
sc.exe failure ConfettiTallyAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000
```

**Logs** go to `agent.log` next to the executable (no console is available
for an installed service, so `env_logger`'s stdout output isn't visible -
`service.rs` switches to a file logger instead). No log rotation yet; keep
an eye on the file's size.

**Uninstall / upgrade** (stop it first - there's no in-place binary swap for
a running Windows service):
```
sc.exe stop ConfettiTallyAgent
confetti-tally-agent.exe --uninstall
REM replace the .exe with the new build, then:
confetti-tally-agent.exe --install
```

## Testing

```sh
cargo test                # unit tests + the mock-Tally-gateway integration test
cargo test -- --ignored   # also runs server_integration.rs against a REAL
                          # confetti-cfo dev server - start `npm run dev` in
                          # server/ first
```
