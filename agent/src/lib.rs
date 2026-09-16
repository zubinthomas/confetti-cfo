//! Library surface so integration tests (tests/*.rs) can exercise the real
//! HTTP/XML code paths, not just the binary. See main.rs for how these wire
//! together into the actual polling loop.
pub mod config;
pub mod server_client;
pub mod tally_client;
pub mod types;
