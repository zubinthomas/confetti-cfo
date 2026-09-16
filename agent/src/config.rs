//! Local agent config - deliberately just the two things the machine/install
//! itself must know before it can talk to the server at all (where the
//! server is, and its own API key) - that's a bootstrap problem no amount of
//! server-side config can solve. Everything else - which ledgers matter, how
//! often to sync, whether to auto-commit, and now also the local Tally
//! gateway URL and company name - lives on the server's `tally_sources` row
//! and is fetched fresh every cycle (see main.rs), so an admin can retune it
//! without touching this file or restarting the agent. `tally_gateway_url`
//! and `tally_company_name` are kept here too, but only as an optional
//! fallback for before an admin has set them remotely.
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// e.g. "https://data.confetti.errantquill.com" - no trailing slash.
    pub server_url: String,
    /// The raw API key shown once when the source was created
    /// (POST /api/tally/sources) or rotated - not the bcrypt hash.
    pub api_key: String,
    /// e.g. "http://localhost:9001" - this machine's configured gateway
    /// port, which may not be Tally's 9000 default (see the integration
    /// plan: this client's gateway is on 9001). Fallback only - an admin
    /// setting this on the source in the web UI takes precedence.
    pub tally_gateway_url: Option<String>,
    /// Only needed if more than one company is loaded in Tally on this
    /// machine; omitted, Tally's gateway uses whichever is already open.
    /// Fallback only, same as tally_gateway_url.
    pub tally_company_name: Option<String>,
}

#[derive(Debug)]
pub enum ConfigError {
    Io(std::io::Error),
    Parse(toml::de::Error),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "could not read config file: {e}"),
            ConfigError::Parse(e) => write!(f, "could not parse config file: {e}"),
        }
    }
}
impl std::error::Error for ConfigError {}

impl Config {
    /// Loads from the path in `CONFETTI_TALLY_CONFIG`, or `config.toml` next
    /// to the executable if that env var isn't set. A file, not env vars for
    /// the values themselves, because this is meant to run as an unattended
    /// Windows Service - an admin editing one file and restarting the
    /// service is a much more findable workflow than hunting down how a
    /// Windows Service's environment was set.
    pub fn load() -> Result<Config, ConfigError> {
        let path = Self::config_path();
        let raw = fs::read_to_string(&path).map_err(ConfigError::Io)?;
        toml::from_str(&raw).map_err(ConfigError::Parse)
    }

    fn config_path() -> PathBuf {
        if let Ok(p) = std::env::var("CONFETTI_TALLY_CONFIG") {
            return PathBuf::from(p);
        }
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));
        exe_dir.join("config.toml")
    }
}
