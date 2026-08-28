//! Install executor — runs dependency install commands with streaming output.
//!
//! Follows the same pattern as `sidecar.rs`: spawn a child process, read stdout/stderr
//! line-by-line via tokio, and emit Tauri events to the frontend for live progress.

use super::install_manifest::{
    command_display, current_platform, get_manifest, AvailableInstaller, PackageManager,
};
use super::probe::{NoWindow, PythonEnv};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{info, warn};

/// Progress event emitted during install
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgressEvent {
    pub install_id: String,
    pub dep_name: String,
    pub line: String,
    pub stream: String,
    pub status: String,
}

/// Result of an install attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub success: bool,
    pub dep_name: String,
    pub installer_id: String,
    pub already_installed: bool,
    pub exit_code: Option<i32>,
    pub output: Vec<String>,
    pub error: Option<String>,
}

/// Set of install IDs that have been requested for cancellation
static CANCELLED: std::sync::OnceLock<Mutex<HashSet<String>>> = std::sync::OnceLock::new();

fn cancelled_set() -> &'static Mutex<HashSet<String>> {
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_cancelled(id: &str) -> bool {
    cancelled_set().lock().unwrap().contains(id)
}

fn mark_cancelled(id: &str) {
    cancelled_set().lock().unwrap().insert(id.to_string());
}

fn clear_cancelled(id: &str) {
    cancelled_set().lock().unwrap().remove(id);
}

/// Get the install manifest
#[tauri::command]
pub async fn get_install_manifest() -> Result<super::install_manifest::InstallManifest, String> {
    Ok(get_manifest().clone())
}

/// Get available installers for a dependency on the current platform
#[tauri::command]
pub async fn get_available_installers(dep_name: String) -> Result<Vec<AvailableInstaller>, String> {
    let manifest = get_manifest();
    let platform = current_platform();

    let dep = manifest
        .dependencies
        .get(&dep_name)
        .ok_or_else(|| format!("Unknown dependency: {dep_name}"))?;

    let platform_config = dep
        .platforms
        .get(platform)
        .ok_or_else(|| format!("No install config for {dep_name} on {platform}"))?;

    let mut available = Vec::new();

    // Sort by priority
    let mut managers = platform_config.package_managers.clone();
    managers.sort_by_key(|m| m.priority);

    for pm in &managers {
        // Check if the package manager is available on this system.
        // which::which() performs synchronous filesystem/PATH lookups — run it in
        // spawn_blocking so it does not stall the tokio async thread pool when
        // multiple get_available_installers calls run concurrently on settings mount.
        let detect_cmd = pm.detect_command.clone();
        let which_found = tokio::task::spawn_blocking(move || which::which(&detect_cmd).is_ok())
            .await
            .unwrap_or(false);

        let detected = which_found
            || Command::new(&pm.detect_command)
                .args(&pm.detect_args)
                .python_env()
                .no_window()
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await
                .map(|s| s.success())
                .unwrap_or(false);

        if detected {
            available.push(AvailableInstaller {
                id: pm.id.clone(),
                name: pm.id.clone(),
                needs_elevation: pm.needs_elevation,
                command_display: command_display(pm),
            });
        }
    }

    Ok(available)
}

/// Install a dependency using the specified installer
#[tauri::command]
pub async fn install_dependency(
    app_handle: AppHandle,
    dep_name: String,
    installer_id: String,
) -> Result<InstallResult, String> {
    let install_id = format!(
        "{}-{}-{}",
        dep_name,
        installer_id,
        chrono::Utc::now().timestamp()
    );

    info!(
        "Starting install: {} via {} (id={})",
        dep_name, installer_id, install_id
    );

    // Find the dependency and package manager in the manifest
    let manifest = get_manifest();
    let platform = current_platform();

    let dep = manifest
        .dependencies
        .get(&dep_name)
        .ok_or_else(|| format!("Unknown dependency: {dep_name}"))?;

    let platform_config = dep
        .platforms
        .get(platform)
        .ok_or_else(|| format!("No install config for {dep_name} on {platform}"))?;

    let pm = platform_config
        .package_managers
        .iter()
        .find(|m| m.id == installer_id)
        .ok_or_else(|| format!("Unknown installer '{installer_id}' for {dep_name}"))?;

    // Idempotency: check if already installed
    if is_dependency_installed(&pm.detect_command, &pm.detect_args).await {
        info!("{} is already installed, skipping", dep_name);
        return Ok(InstallResult {
            success: true,
            dep_name,
            installer_id,
            already_installed: true,
            exit_code: Some(0),
            output: vec!["Already installed".to_string()],
            error: None,
        });
    }

    // Build the install command
    let (cmd, args) = build_install_command(pm);

    // Pre-check: verify the package manager binary is available.
    // which::which() is synchronous — run in spawn_blocking to avoid stalling the runtime.
    let cmd_check = cmd.clone();
    let pm_not_found = tokio::task::spawn_blocking(move || which::which(&cmd_check).is_err())
        .await
        .unwrap_or(true);
    if pm_not_found {
        return Ok(InstallResult {
            success: false,
            dep_name,
            installer_id,
            already_installed: false,
            exit_code: None,
            output: vec![],
            error: Some(format!(
                "Package manager '{cmd}' is not available. Install it first or install manually."
            )),
        });
    }

    info!("Running: {} {}", cmd, args.join(" "));

    // Spawn the install process
    let mut child = Command::new(&cmd)
        .args(&args)
        .python_env()
        .no_window()
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn install command: {e}"))?;

    // Take stdout/stderr for streaming
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let install_id_stdout = install_id.clone();
    let install_id_stderr = install_id.clone();
    let dep_name_stdout = dep_name.clone();
    let dep_name_stderr = dep_name.clone();
    let app_handle_stdout = app_handle.clone();
    let app_handle_stderr = app_handle.clone();

    // Stream stdout
    let stdout_handle = if let Some(stdout) = stdout {
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                info!("[install:{}] stdout: {}", install_id_stdout, trimmed);
                let _ = app_handle_stdout.emit(
                    "install-progress",
                    InstallProgressEvent {
                        install_id: install_id_stdout.clone(),
                        dep_name: dep_name_stdout.clone(),
                        line: trimmed,
                        stream: "stdout".to_string(),
                        status: "running".to_string(),
                    },
                );
            }
        })
    } else {
        tokio::spawn(async {})
    };

    // Stream stderr and capture lines for error reporting
    let stderr_lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let stderr_lines_clone = stderr_lines.clone();
    let stderr_handle = if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                stderr_lines_clone.lock().unwrap().push(trimmed.clone());
                warn!("[install:{}] stderr: {}", install_id_stderr, trimmed);
                let _ = app_handle_stderr.emit(
                    "install-progress",
                    InstallProgressEvent {
                        install_id: install_id_stderr.clone(),
                        dep_name: dep_name_stderr.clone(),
                        line: trimmed,
                        stream: "stderr".to_string(),
                        status: "running".to_string(),
                    },
                );
            }
        })
    } else {
        tokio::spawn(async {})
    };

    // Wait for process completion, checking cancel flag periodically
    let exit_code = loop {
        if is_cancelled(&install_id) {
            info!("Install cancelled: {}", install_id);
            let _ = child.kill().await;
            clear_cancelled(&install_id);

            // Wait for output readers
            let _ = tokio::join!(stdout_handle, stderr_handle);

            // Emit cancelled status
            let _ = app_handle.emit(
                "install-progress",
                InstallProgressEvent {
                    install_id: install_id.clone(),
                    dep_name: dep_name.clone(),
                    line: "Installation cancelled".to_string(),
                    stream: "stdout".to_string(),
                    status: "cancelled".to_string(),
                },
            );

            return Ok(InstallResult {
                success: false,
                dep_name,
                installer_id,
                already_installed: false,
                exit_code: None,
                output: vec![],
                error: Some("Installation cancelled by user".to_string()),
            });
        }

        // Try waiting with a short timeout
        match tokio::time::timeout(std::time::Duration::from_millis(200), child.wait()).await {
            Ok(Ok(status)) => break status.code(),
            Ok(Err(e)) => {
                let _ = tokio::join!(stdout_handle, stderr_handle);
                return Err(format!("Failed to wait for install process: {e}"));
            }
            Err(_) => continue, // Timeout, loop again to check cancel flag
        }
    };

    // Wait for output readers to finish
    let _ = tokio::join!(stdout_handle, stderr_handle);
    clear_cancelled(&install_id);

    // Refresh PATH so newly installed binaries are immediately detectable
    super::probe::refresh_path_from_registry();

    let success = exit_code == Some(0);
    let status_str = if success { "completed" } else { "failed" };

    // Emit final status
    let _ = app_handle.emit(
        "install-progress",
        InstallProgressEvent {
            install_id: install_id.clone(),
            dep_name: dep_name.clone(),
            line: if success {
                "Installation completed successfully".to_string()
            } else {
                format!("Installation failed with exit code {:?}", exit_code)
            },
            stream: if success { "stdout" } else { "stderr" }.to_string(),
            status: status_str.to_string(),
        },
    );

    info!(
        "Install finished: {} (success={}, exit_code={:?})",
        dep_name, success, exit_code
    );

    Ok(InstallResult {
        success,
        dep_name,
        installer_id,
        already_installed: false,
        exit_code,
        output: vec![],
        error: if !success {
            let stderr_tail = stderr_lines
                .lock()
                .unwrap()
                .iter()
                .rev()
                .take(10)
                .rev()
                .cloned()
                .collect::<Vec<_>>()
                .join("\n");
            Some(format!(
                "Process exited with code {:?}.{}",
                exit_code,
                if stderr_tail.is_empty() {
                    String::new()
                } else {
                    format!("\nStderr:\n{stderr_tail}")
                }
            ))
        } else {
            None
        },
    })
}

/// Cancel a running install
#[tauri::command]
pub async fn cancel_install(install_id: String) -> Result<(), String> {
    info!("Cancel requested for install: {}", install_id);
    mark_cancelled(&install_id);
    Ok(())
}

/// Check if a dependency is already installed (idempotency guard)
async fn is_dependency_installed(detect_command: &str, detect_args: &[String]) -> bool {
    Command::new(detect_command)
        .args(detect_args)
        .python_env()
        .no_window()
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Build the install command, handling elevation on Windows
fn build_install_command(pm: &PackageManager) -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        if pm.needs_elevation {
            // Use PowerShell Start-Process with RunAs for UAC elevation
            (
                "powershell".to_string(),
                vec![
                    "-Command".to_string(),
                    format!(
                        "Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -Wait",
                        pm.install_command,
                        pm.install_args.join(" ")
                    ),
                ],
            )
        } else {
            (pm.install_command.clone(), pm.install_args.clone())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Linux/macOS, sudo is already in install_args if elevation is needed
        (pm.install_command.clone(), pm.install_args.clone())
    }
}
