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

## Confirmed on-site (2026-10-01)

Live-tested against the client's real TallyPrime install (company
`CONFETTI EXPORTS PVT. LTD`, gateway on port `9001`):

- **Gateway port confirmed:** `9001`.
- **`SVCURRENTCOMPANY` must match the full string shown in Tally's company
  selector, including the trailing `- (from D-Mon-YY)` period suffix.**
  `CONFETTI EXPORTS PVT. LTD` alone (no suffix) fails with an explicit
  `<LINEERROR>Could not set 'SVCurrentCompany' to '...'</LINEERROR>` on a
  `TYPE=Data` report request; the full string
  `CONFETTI EXPORTS PVT. LTD - (from 1-Apr-25)` works. `config.rs`/
  `config.example.toml` need updating to store the full selector string,
  not just the company name, and that string will change every financial
  year - this needs a real plan (re-derive it per FY, or make it
  reconfigurable without a rebuild) before this ships, not just a hardcoded
  constant.
- **The ledger-balances Collection request's field declaration was wrong,
  and is fixed** (`<FETCH>...</FETCH>` isn't valid for a custom Collection;
  `<NATIVEMETHOD>` per field is). This was a real bug, but it was not the
  cause of the empty-stub responses seen while debugging on-site - see
  below.
- **Collection-type requests silently swallow a bad `SVCurrentCompany`**
  instead of erroring, unlike `TYPE=Data` report requests. A wrong company
  string produces the exact same generic object-browser stub (`CMPINFO`
  with every count at `0`, `<COLLECTION ISMSTDEPTYPE="Yes" MSTDEPTYPE="8">`
  with no children) regardless of what the Collection body actually says -
  this is what made the `FETCH`/`NATIVEMETHOD` bug above look like the
  cause when the real blocker was the company string the whole time. The
  ledger-balances Collection request itself has not yet been re-tested
  against the gateway now that the right company string is known - do that
  before trusting real balance data from it.
- **Period report shape - confirmed against a real Trial Balance export**
  (group-level, no `EXPLODEFLAG`; `TYPE=Data`, `ID=Trial Balance`, no
  `SUBTYPE`/`TDL` needed for a built-in report). The response has no
  `HEADER`/`BODY` wrapper at all - just `<ENVELOPE>` directly containing
  alternating `<DSPACCNAME>`/`<DSPACCINFO>` **siblings**, paired
  positionally, not `DSPACCNAME` nested inside `DSPACCINFO` as originally
  assumed. Amount tags are two levels deep
  (`<DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>`), and the unused side of a row
  is an empty string, not `"0"`. Sign convention confirmed: `DSPCLDRAMTA`
  (debit) comes back already negative, `DSPCLCRAMTA` (credit) positive, so
  `net_amount = credit + debit` (a plain sum - fixed from the previous
  `credit - debit`, which would have double-signed every debit row).
  This Trial Balance shape is no longer parsed by the agent; the P&L parser
  below replaced it, since the agent only pulls P&L.
- **Profit and Loss report (`EXPLODEFLAG=Yes`) - confirmed shape** (2026-10-04).
  It is not the Trial Balance shape. Group headings are `DSPACCNAME` followed
  by `PLAMT` (group total). Ledger rows are `BSNAME` (name in
  `DSPACCNAME/DSPDISPNAME`) followed by `BSAMT`, with the signed amount in
  `BSSUBAMT`. Everything is a flat list of siblings under `ENVELOPE`. Debit is
  negative and credit positive. The group totals match the sum of their
  ledger rows to the paisa, which confirms the sign convention. Cost of Sales
  and the stock groups (Opening, Purchase, Closing Stock) have no ledger rows,
  so they cannot be checked against ledger data. `parse_period_report` reads
  only the ledger rows.
- **Ledger-balances Collection request - confirmed working end to end**
  (2026-10-02), now that `SVCURRENTCOMPANY` carries the full selector
  string. The real response returned 2727 `<LEDGER>` rows. Shape matches
  what `parse_ledger_balances` already assumed: `NAME` is an attribute,
  `PARENT`/`CLOSINGBALANCE` are direct (single-level, not nested) children
  - no code change was needed here, unlike `parse_period_report`. A
  ledger with a true zero/unposted balance can render
  `<CLOSINGBALANCE TYPE="Amount"></CLOSINGBALANCE>` (empty) rather than
  `0.00` - about a third of the 2727 rows in the real export were empty
  this way - and `parse_ledger_balances` already skips those (logged at
  `warn`), which means a mapped ledger sitting at exactly zero drops out
  of a sync cycle instead of pushing an explicit 0. Current behavior, not
  yet flagged as a bug - revisit if a client mapping ever needs a hard
  zero distinguished from "Tally reported nothing."
- **`CLOSINGBALANCE` sign convention - confirmed, same convention as the
  Trial Balance report.** Debit-nature (asset) ledgers come back negative,
  credit-nature (liability) ledgers come back positive. Real examples from
  the same export: a Bank Accounts ledger (HDFC Bank, Jodhpur Park) at
  `-1813.57`; an Unsecured Loans ledger (a shareholder loan) at
  `18135769.00`. `Duties & Taxes` ledgers for GST payable (CGST/SGST/IGST)
  were also positive, consistent with a liability. `tally_client.rs`'s
  tests now include a real-data case for this.
- **Ledger name escaping/encoding - confirmed, no extra handling needed.**
  Real ledger names do come back with standard XML entities (`&amp;`,
  `&apos;` were both seen across the 2727-row export, e.g. `"Adhikary
  Plywood &amp; Glass"`) - `roxmltree`'s own entity decoding handles this
  on the read side with no custom unescaping required. `xml_escape` in
  `tally_client.rs` is only used for building outgoing requests
  (`SVCURRENTCOMPANY`, ledger names in a Data export ID) and remains
  correct for that direction.

## Not yet verified against a real Tally instance

- **The P&L figures are not yet reconciled to raw ledger data.** The P&L
  shape above is confirmed and internally consistent, but the comparison
  against the ledger range Collection (`OPENINGBALANCE`/`CLOSINGBALANCE`)
  has not run on-site yet.
- **`SVFROMDATE`/`SVTODATE` format.** The agent now sends `YYYYMMDD`, taken
  from the reference Tally MCP implementation (ShrutiSaagar/tally-prime-mcp,
  `tallyDate()` in `src/tally/xml.ts`). It is not yet confirmed against the
  real gateway. The earlier `D-Mon-YYYY` format was unverified and is gone.
- **The ledger range Collection** (`ID=ConfettiLedgerRange`, with
  `OPENINGBALANCE`/`CLOSINGBALANCE` over `SVFROMDATE`/`SVTODATE`). Its shape
  is taken from the reference implementation. The parser treats an empty
  amount as zero and a missing element as an error.

## Raw-data reconciliation (P&L safety check)

The agent does not push period (P&L) records on the strength of Tally's
report alone. For each month or week it also pulls the ledger range
Collection and checks that, for every mapped period ledger, the report's net
amount matches the raw `closing - opening` within one paisa. If any ledger
disagrees, the agent logs each mismatch and pushes nothing for that period
type until the next cycle. It also logs a warning if the raw closing balances
across all ledgers do not sum to zero, which would point at the raw data or
the sign convention.

To check this by hand against the gateway, run
`agent/scripts/check_pl_raw.ps1` (PowerShell). It is read-only, sends the same requests,
prints the disagreements, and saves the P&L response to
`tally_response.xml` in the current folder.

Do not trust month/week P&L numbers from this agent until the Profit and
Loss items above are confirmed against the real gateway. Ledger closing
balances are now confirmed end to end against the real gateway (parsing,
sign convention, and name encoding); everything downstream of the Tally
gateway call (server routes, merge pipeline, admin UI) has separately been
verified against the live dev server with fixture data.

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
