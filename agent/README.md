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

- **Windows Service packaging.** This is a plain long-running process today
  (`cargo run` / the built exe, left running), not installed as a service -
  fine for now since it can be developed and tested on any machine, but a
  real deployment on the client's dedicated machine should wrap this with
  the `windows-service` crate (or NSSM) so it starts on boot and restarts on
  crash. Not wired up here since it can't be built or tested outside Windows.
- **Month/week period pushes.** `PeriodType::Month`/`Week` exist on the wire
  type (the server already handles them) but `main.rs` only ever produces
  `Custom` (point-in-time closing balances) - a monthly P&L pull would need a
  different Tally report request (e.g. a Profit & Loss export), not just a
  ledger collection.
- **Mapping-table seeding.** This agent assumes ledger mappings already
  exist on the server; bulk-loading the chart-of-accounts export into
  `tally_ledger_mappings` is a separate (not yet built) admin-UI workstream.

## Running it

```sh
cp config.example.toml config.toml   # then fill in api_key etc.
cargo run
```

Logs go to stdout via `env_logger`; set `RUST_LOG=debug` for more detail.

## Testing

```sh
cargo test                # unit tests + the mock-Tally-gateway integration test
cargo test -- --ignored   # also runs server_integration.rs against a REAL
                          # confetti-cfo dev server - start `npm run dev` in
                          # server/ first
```
