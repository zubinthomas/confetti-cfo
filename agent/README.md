# confetti-tally-agent

Runs on the client's Tally machine. Polls Tally's local XML/HTTP gateway for
ledger closing balances, and pushes the ones an admin has mapped
(`/api/tally/sources/:id/mappings`) to the confetti-cfo server. See the wider
integration plan for the design this implements (business context isn't
repeated here).

## What's here

- `src/config.rs` - loads `config.toml` (server URL, this install's API key,
  the local Tally gateway URL/port).
- `src/tally_client.rs` - builds a Tally TDL "Collection" request for every
  ledger's `NAME`/`PARENT`/`CLOSINGBALANCE`, and parses the XML response.
- `src/server_client.rs` - the confetti-cfo side: `GET /api/tally-agent/config`
  (cadence + which ledgers are in scope) and `POST /api/tally-agent/sync`
  (push), both authenticated with the install's API key.
- `src/main.rs` - the loop: fetch config -> query Tally -> filter to mapped
  ledgers -> push -> sleep for however long the server said to.
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

## Not yet built

- **Month/week period pushes.** `PeriodType::Month`/`Week` exist on the wire
  type (the server already handles them) but `main.rs` only ever produces
  `Custom` (point-in-time closing balances) - a monthly P&L pull would need a
  different Tally report request (e.g. a Profit & Loss export), not just a
  ledger collection.
## Running it

```sh
cp config.example.toml config.toml   # then fill in api_key etc.
cargo run
```

Logs go to stdout via `env_logger`; set `RUST_LOG=debug` for more detail.
This is also how to run it interactively on Windows before installing it as
a service - see below.

## Running as a Windows Service

Built with the `windows-service` crate (`src/service.rs`). Only compiled in
on Windows (`#[cfg(windows)]` throughout, and a target-gated dependency in
`Cargo.toml`), so it never affects the Linux dev build above.

**UNVERIFIED beyond compiling.** This was written and cross-compile-checked
(`cargo build --target x86_64-pc-windows-gnu`) from a Linux dev machine with
no Windows box available - actually installing the service, confirming the
Service Control Manager starts/stops it correctly, that logs land where
expected, and that it survives a reboot has not been done. Treat it the same
way as the "not yet verified against a real Tally instance" items above:
confirm on a real Windows machine before relying on it in production.

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
