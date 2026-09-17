//! Windows Service wrapper around the same fetch-config -> query-Tally ->
//! push cycle `run_cycle()` (main.rs) uses in the foreground. Entirely
//! `#[cfg(windows)]`-gated from main.rs, so it never affects the Linux dev
//! build this crate is otherwise developed and tested against.
//!
//! Verified end-to-end on a real Windows 11 VM: install, SCM start/stop
//! (control handler correctly catches Stop and shuts down within seconds),
//! uninstall, and file logging of a real poll cycle against a live server.
//! See "Running as a Windows Service" in README.md for what that pass did
//! and didn't cover (reboot survival and crash-restart weren't tested).
use std::ffi::OsString;
use std::sync::mpsc;
use std::time::Duration;

use windows_service::service::{
    ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
    ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult, ServiceStatusHandle};
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};
use windows_service::{define_windows_service, service_dispatcher};

use confetti_tally_agent::config::Config;
use confetti_tally_agent::server_client::ServerClient;

pub const SERVICE_NAME: &str = "ConfettiTallyAgent";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, service_main);

/// Called by main() when launched with no arguments - the way the Service
/// Control Manager actually starts an installed service. Blocks until asked
/// to stop. Returns Err if this process wasn't really launched by the SCM
/// (e.g. double-clicked, or run from a shell without --foreground).
pub fn run_as_service() -> Result<(), Box<dyn std::error::Error>> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}

fn service_main(_arguments: Vec<OsString>) {
    if let Err(e) = init_file_logging() {
        // No logger is active yet, and a service has no console - stderr
        // (which itself may go nowhere) is the best that's available here.
        eprintln!("could not set up file logging: {e}");
    }
    if let Err(e) = run_service() {
        log::error!("service exited with an error: {e}");
    }
}

fn run_service() -> Result<(), Box<dyn std::error::Error>> {
    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };
    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;
    set_status(&status_handle, ServiceState::Running, ServiceControlAccept::STOP);

    let config = match Config::load() {
        Ok(c) => c,
        Err(e) => {
            log::error!("could not start: {e}");
            set_status(&status_handle, ServiceState::Stopped, ServiceControlAccept::empty());
            return Ok(());
        }
    };
    let server = ServerClient::new(&config.server_url, &config.api_key);
    log::info!("confetti-tally-agent service starting - server={}", config.server_url);

    loop {
        let sleep_seconds = crate::run_cycle(&server, &config);
        log::info!("sleeping up to {sleep_seconds}s until next sync (or a stop request)");

        // Wait in 1s increments rather than one long sleep, so a stop
        // request is honored quickly instead of waiting out the full
        // interval - matches the windows-service crate's own examples.
        let mut waited_seconds = 0u64;
        loop {
            match shutdown_rx.recv_timeout(Duration::from_secs(1)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                    log::info!("stop requested - shutting down");
                    set_status(&status_handle, ServiceState::Stopped, ServiceControlAccept::empty());
                    return Ok(());
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    waited_seconds += 1;
                    if waited_seconds >= sleep_seconds {
                        break;
                    }
                }
            }
        }
    }
}

fn set_status(handle: &ServiceStatusHandle, state: ServiceState, controls_accepted: ServiceControlAccept) {
    let result = handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: state,
        controls_accepted,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    });
    if let Err(e) = result {
        log::error!("could not report service status {state:?} to the SCM: {e}");
    }
}

fn init_file_logging() -> Result<(), Box<dyn std::error::Error>> {
    let exe_dir = std::env::current_exe()?
        .parent()
        .map(std::path::Path::to_path_buf)
        .ok_or("could not determine the executable's directory")?;
    let log_path = exe_dir.join("agent.log");
    let log_file = std::fs::OpenOptions::new().create(true).append(true).open(log_path)?;
    // No rotation yet - a known gap, see README. An admin should keep an eye
    // on agent.log's size until this gets one.
    simplelog::WriteLogger::init(simplelog::LevelFilter::Info, simplelog::Config::default(), log_file)?;
    Ok(())
}

/// Registers this executable as a Windows Service, set to start
/// automatically on boot. Must be run elevated (Administrator).
///
/// Doesn't configure restart-on-crash here - the exact
/// windows-service::service::ServiceFailureActions API wasn't confirmed
/// against a real Windows build while writing this (no Windows machine was
/// available). Run the equivalent `sc.exe failure` command documented in
/// the README once after installing instead.
pub fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager_access = ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE;
    let service_manager = ServiceManager::local_computer(None::<&str>, manager_access)?;

    let service_info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from("Confetti Tally Agent"),
        service_type: SERVICE_TYPE,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: std::env::current_exe()?,
        launch_arguments: vec![],
        dependencies: vec![],
        account_name: None,
        account_password: None,
    };
    let service = service_manager.create_service(&service_info, ServiceAccess::CHANGE_CONFIG)?;
    service.set_description(
        "Pushes Tally ledger balances to confetti-cfo. See agent/README.md in the confetti-cfo repo.",
    )?;
    Ok(())
}

/// Removes the registered service. Doesn't stop it first if it's running -
/// stop it via `sc.exe stop ConfettiTallyAgent` or Services.msc before
/// uninstalling, or the service keeps running (orphaned from the SCM's
/// registry) until the process is killed some other way.
pub fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager_access = ServiceManagerAccess::CONNECT;
    let service_manager = ServiceManager::local_computer(None::<&str>, manager_access)?;
    let service = service_manager.open_service(SERVICE_NAME, ServiceAccess::DELETE)?;
    service.delete()?;
    Ok(())
}
