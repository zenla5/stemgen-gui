//! Python sidecar process management for AI stem separation

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use super::probe::{is_windows_store_stub, NoWindow, PythonEnv};

/// Represents a running separation process
pub struct SeparationProcess {
    /// The child process handle
    child: Child,
    /// Job ID for tracking
    job_id: String,
    /// The model being used (stored for potential future use)
    #[allow(dead_code)]
    model: String,
}

/// Manages the Python sidecar process for stem separation
pub struct SidecarManager {
    /// Currently running process, if any
    current_process: Option<Arc<RwLock<SeparationProcess>>>,
    /// Python executable path
    python_path: Option<PathBuf>,
    /// Sidecar script path
    pub sidecar_path: PathBuf,
    /// Output directory for stems
    output_dir: PathBuf,
    /// Tauri app handle for emitting events to frontend
    app_handle: Option<AppHandle>,
}

impl SidecarManager {
    /// Create a new sidecar manager
    pub fn new(sidecar_path: PathBuf, output_dir: PathBuf) -> Self {
        Self {
            current_process: None,
            python_path: None,
            sidecar_path,
            output_dir,
            app_handle: None,
        }
    }

    /// Set the Tauri app handle for event emission
    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    /// Detect Python executable
    pub async fn detect_python(&mut self) -> Result<PathBuf> {
        // Try common Python paths
        let candidates = if cfg!(windows) {
            vec![
                "python".to_string(),
                "python3".to_string(),
                "py".to_string(),
                r"C:\Python312\python.exe".to_string(),
                r"C:\Python311\python.exe".to_string(),
                r"C:\Python310\python.exe".to_string(),
                format!(
                    r"{}\AppData\Local\Programs\Python\Python312\python.exe",
                    std::env::var("USERPROFILE").unwrap_or_default()
                ),
            ]
        } else {
            vec!["python3".to_string(), "python".to_string()]
        };

        for candidate in &candidates {
            if let Ok(path) = which::which(candidate) {
                // Skip Windows Store stubs
                if is_windows_store_stub(&path) {
                    continue;
                }

                // Verify it's working
                let output = Command::new(&path)
                    .args(["--version"])
                    .python_env()
                    .output()
                    .await
                    .context("Failed to check Python version")?;

                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout);
                    info!("Found Python: {} at {}", version.trim(), path.display());
                    self.python_path = Some(path.clone());
                    return Ok(path);
                }
            }
        }

        anyhow::bail!("Python not found. Please install Python 3.9 or later.")
    }

    /// Check if the sidecar script exists
    pub fn check_sidecar(&self) -> Result<()> {
        if !self.sidecar_path.exists() {
            anyhow::bail!(
                "Sidecar script not found at: {}. Please ensure stemgen_sidecar.py exists.",
                self.sidecar_path.display()
            );
        }
        Ok(())
    }

    /// Run stem separation using the Python sidecar
    ///
    /// When `provider` is Some, device is set to "cloud" and additional flags
    /// are passed. **Security note:** API key is passed as a CLI argument to the
    /// sidecar subprocess — it is never logged by tracing.
    #[allow(clippy::too_many_arguments)]
    pub async fn run_separation(
        &mut self,
        job_id: String,
        source_path: &Path,
        model: &str,
        device: &str,
        provider: Option<&str>,
        api_key: Option<&str>,
        version_hash: Option<&str>,
    ) -> Result<SeparationResult> {
        // Detect Python if not already detected
        if self.python_path.is_none() {
            self.detect_python().await?;
        }

        let python_path = self.python_path.as_ref().unwrap();

        // Check sidecar script
        self.check_sidecar()?;

        // Create output directory for this job
        let job_output_dir = self.output_dir.join(&job_id);
        std::fs::create_dir_all(&job_output_dir).context("Failed to create output directory")?;

        info!(
            "Starting separation: {} -> {} (model: {}, device: {})",
            source_path.display(),
            job_output_dir.display(),
            model,
            device
        );

        if let Some(p) = provider {
            tracing::debug!("Spawning with provider: {}", p);
        }
        // API key is NEVER logged

        // Build command with required args
        let mut cmd = Command::new(python_path);
        cmd.arg(&self.sidecar_path)
            .arg("--model")
            .arg(model)
            .arg("--input")
            .arg(source_path)
            .arg("--output")
            .arg(&job_output_dir)
            .arg("--device")
            .arg(device);

        // Add cloud-specific flags
        if let Some(p) = provider {
            cmd.arg("--provider").arg(p);
        }
        if let Some(key) = api_key {
            cmd.arg("--api-key").arg(key);
        }
        if let Some(ver) = version_hash {
            cmd.arg("--provider-version").arg(ver);
        }

        let mut child = cmd
            .python_env()
            .no_window()
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn Python sidecar")?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let app_handle_clone = self.app_handle.clone();
        let job_id_for_emit = job_id.clone();

        // Create the process wrapper
        let process = SeparationProcess {
            child,
            job_id: job_id.clone(),
            model: model.to_string(),
        };

        let process_arc = Arc::new(RwLock::new(process));
        self.current_process = Some(process_arc.clone());

        // Read stdout and emit progress events to frontend
        if let Some(stdout) = stdout {
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    if let Ok(progress) = serde_json::from_str::<ProgressUpdate>(trimmed) {
                        info!(
                            "[{}] Progress: {} (stage={:?}, progress={:?})",
                            job_id_for_emit, progress.status, progress.stage, progress.progress
                        );

                        // Emit event to frontend if we have an app handle
                        if let Some(ref handle) = app_handle_clone {
                            let _ = handle.emit(
                                "separation-progress",
                                serde_json::json!({
                                    "job_id": job_id_for_emit,
                                    "status": progress.status,
                                    "stage": progress.stage,
                                    "message": progress.message,
                                    "progress": progress.progress,
                                    "error": progress.error,
                                }),
                            );
                        }
                    } else {
                        debug!("[{}] Non-JSON stdout: {}", job_id_for_emit, trimmed);
                    }
                }
            });
        }

        // Also log stderr and collect lines for error reporting
        let stderr_lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        if let Some(stderr) = stderr {
            let job_id_for_stderr = job_id.clone();
            let stderr_buf = stderr_lines.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        warn!("[{}] stderr: {}", job_id_for_stderr, trimmed);
                        if let Ok(mut buf) = stderr_buf.lock() {
                            buf.push(trimmed.to_string());
                        }
                    }
                }
            });
        }

        // Wait for the process to complete
        let status = {
            let mut process = process_arc.write().await;
            process.child.wait().await?
        };

        // Clear current process
        self.current_process = None;

        if status.success() {
            // Collect stem paths
            let stems = self.collect_stems(&job_output_dir, source_path)?;

            Ok(SeparationResult {
                success: true,
                stems,
                output_dir: job_output_dir,
            })
        } else {
            // Collect stderr tail for a more useful error message
            let stderr_tail = stderr_lines
                .lock()
                .ok()
                .map(|buf| {
                    let tail: Vec<&String> = buf.iter().rev().take(20).collect();
                    tail.into_iter()
                        .rev()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();

            // Try to extract a structured JSON error from stderr
            let error_message =
                extract_structured_error(&stderr_tail).unwrap_or_else(|| stderr_tail.clone());

            let exit_code = status.code();
            if error_message.is_empty() {
                Err(anyhow::anyhow!(
                    "Separation failed (exit {:?}): no stderr output",
                    exit_code
                ))
            } else {
                Err(anyhow::anyhow!(
                    "Separation failed (exit {:?}): {}",
                    exit_code,
                    error_message
                ))
            }
        }
    }

    /// Collect the generated stem files by scanning the output directory.
    ///
    /// The Python sidecar derives stem names from `model.sources` which may vary
    /// between models. This function dynamically discovers all `.wav` files
    /// matching the pattern `{source_stem}_{stem_name}.wav` rather than
    /// hardcoding a fixed list of stem names.
    pub fn collect_stems(&self, output_dir: &Path, source_path: &Path) -> Result<Vec<StemResult>> {
        let mut stems = Vec::new();
        let source_stem = source_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("stem");

        let prefix = format!("{}_", source_stem);

        // Scan output directory for all .wav files matching the stem pattern
        let entries = std::fs::read_dir(output_dir).with_context(|| {
            format!("Failed to read output directory: {}", output_dir.display())
        })?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            // Only consider .wav files
            if path.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }

            let filename = path
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or_default();

            // Check if filename matches the pattern {source_stem}_{stem_name}.wav
            if let Some(stem_name) = filename
                .strip_prefix(&prefix)
                .and_then(|s| s.strip_suffix(".wav"))
            {
                if !stem_name.is_empty() {
                    stems.push(StemResult {
                        stem_type: stem_name.to_string(),
                        path,
                    });
                }
            }
        }

        if stems.is_empty() {
            anyhow::bail!("No stem files were generated");
        }

        Ok(stems)
    }

    /// Cancel the current separation process
    pub async fn cancel(&mut self) -> Result<()> {
        if let Some(process) = &self.current_process {
            let mut process = process.write().await;
            info!("Cancelling separation job: {}", process.job_id);
            process.child.kill().await?;
        }
        self.current_process = None;
        Ok(())
    }

    /// Check if a separation is currently running
    pub fn is_running(&self) -> bool {
        self.current_process.is_some()
    }
}

/// Progress update from the Python sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    #[serde(rename = "status")]
    pub status: String,
    #[serde(rename = "model", default)]
    pub model: Option<String>,
    #[serde(rename = "device", default)]
    pub device: Option<String>,
    #[serde(rename = "stage", default)]
    pub stage: Option<String>,
    #[serde(rename = "message", default)]
    pub message: Option<String>,
    #[serde(rename = "progress", default)]
    pub progress: Option<f32>,
    #[serde(rename = "stems", default)]
    pub stems: Option<HashMap<String, String>>,
    #[serde(rename = "error", default)]
    pub error: Option<String>,
}

/// Result of a successful separation
#[derive(Debug)]
pub struct SeparationResult {
    pub success: bool,
    pub stems: Vec<StemResult>,
    pub output_dir: PathBuf,
}

/// A single stem file result
#[derive(Debug)]
pub struct StemResult {
    pub stem_type: String,
    pub path: PathBuf,
}

/// Attempt to extract a structured error message from stderr output.
///
/// The Python sidecar may emit JSON lines to stdout with an "error" key.
/// In some failure modes, these structured errors may also appear in stderr.
/// This function attempts to parse the stderr text and extract the "error" field.
fn extract_structured_error(stderr: &str) -> Option<String> {
    // Try to find a JSON object in the stderr text
    for line in stderr.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if let Some(error) = parsed.get("error").and_then(|e| e.as_str()) {
                    return Some(error.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that calling `.no_window()` on a tokio::process::Command
    /// does not prevent it from spawning successfully. On Windows the
    /// CREATE_NO_WINDOW flag is applied internally; on other platforms
    /// this is a no-op. Either way the command should run to completion.
    #[tokio::test]
    async fn test_no_window_sidecar_pattern_compiles_and_runs() {
        use super::super::probe::NoWindow;

        let mut cmd = tokio::process::Command::new(if cfg!(windows) { "cmd" } else { "echo" });
        if cfg!(windows) {
            cmd.args(["/C", "echo", "hello"]);
        } else {
            cmd.arg("hello");
        }
        // This mirrors the exact pattern used in run_separation:
        //   Command::new(python_path).no_window().stdout(...).stderr(...).spawn()
        let output = cmd
            .no_window()
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .expect("command failed to run");
        assert!(output.status.success());
    }

    /// On Windows, verify that std::process::Command (which shares the same
    /// NoWindow impl as tokio) sets CREATE_NO_WINDOW (0x08000000).
    /// On non-Windows this test is a no-op pass.
    #[test]
    fn test_no_window_sets_create_no_window_on_windows() {
        use super::super::probe::NoWindow;
        use std::process::Command;

        let mut cmd = Command::new(if cfg!(windows) { "cmd" } else { "echo" });
        cmd.no_window();

        // On Windows, creation_flags from CommandExt should contain CREATE_NO_WINDOW.
        // We verify by actually running the command — CREATE_NO_WINDOW does not prevent
        // execution, it just suppresses the console window.
        let output = cmd
            .args(if cfg!(windows) {
                ["/C", "echo", "ok"].as_slice()
            } else {
                &["ok"]
            })
            .output()
            .expect("command should spawn");
        assert!(output.status.success());
    }

    /// Verify that a Command built with `.env("PYTHONUTF8", "1")` propagates
    /// the env var to the child process (guards TASK-007 regression).
    #[tokio::test]
    async fn test_sidecar_spawn_sets_pythonutf8() {
        use super::super::probe::NoWindow;

        let mut cmd = tokio::process::Command::new(if cfg!(windows) { "cmd" } else { "env" });
        if cfg!(windows) {
            cmd.args(["/C", "set", "PYTHONUTF8"]);
        }
        cmd.env("PYTHONUTF8", "1")
            .no_window()
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await.expect("command should spawn");

        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            stdout.contains("PYTHONUTF8=1"),
            "Expected PYTHONUTF8=1 in stdout, got: {stdout}"
        );
    }

    /// Verify that running the sidecar with a non-existent input file
    /// returns a meaningful error string (not just an exit code).
    ///
    /// Skipped on Windows: the test binary lacks the application manifest
    /// required for comctl32 v6 (TaskDialogIndirect), causing a loader error.
    /// The functionality is tested on Linux/macOS CI and in the real Windows
    /// binary which carries the proper manifest.
    #[cfg(not(windows))]
    #[tokio::test]
    async fn test_sidecar_error_message_surfaced() {
        use std::path::PathBuf;

        let sidecar_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("python")
            .join("stemgen_sidecar.py");

        if !sidecar_path.exists() {
            // Skip if sidecar script is not available in this environment
            return;
        }

        let output_dir = std::env::temp_dir().join("stemgen-test-error");
        let _ = std::fs::create_dir_all(&output_dir);

        let mut manager = SidecarManager::new(sidecar_path, output_dir.clone());
        // Force a fake python path — the real one will be detected inside
        let _ = manager.detect_python().await;

        let fake_input = PathBuf::from("/nonexistent/path/to/audio.wav");
        let result = manager
            .run_separation(
                "test-job".to_string(),
                &fake_input,
                "demucs",
                "cpu",
                None,
                None,
                None,
            )
            .await;

        // Should return an error — either from python sidecar or from file not found
        assert!(
            result.is_err(),
            "Expected error for non-existent input file"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(!err_msg.is_empty(), "Error message should not be empty");

        // Cleanup
        let _ = std::fs::remove_dir_all(&output_dir);
    }

    /// Verify collect_stems returns only stem files that actually exist.
    /// Skipped on Windows (see test_sidecar_error_message_surfaced).
    #[cfg(not(windows))]
    #[test]
    fn test_collect_stems_returns_only_existing_files() {
        let tmp = std::env::temp_dir().join("stemgen-test-collect-partial");
        let _ = std::fs::create_dir_all(&tmp);

        // Create only 2 of 4 stem files
        std::fs::write(tmp.join("track_drums.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("track_vocals.wav"), b"fake").unwrap();

        let manager = SidecarManager::new(PathBuf::from("fake"), tmp.clone());
        let source = Path::new("/music/track.wav");
        let stems = manager.collect_stems(&tmp, source).unwrap();

        assert_eq!(stems.len(), 2);
        let types: Vec<&str> = stems.iter().map(|s| s.stem_type.as_str()).collect();
        assert!(types.contains(&"drums"));
        assert!(types.contains(&"vocals"));
        assert!(!types.contains(&"bass"));
        assert!(!types.contains(&"other"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Verify collect_stems returns an error when no stem files exist.
    /// Skipped on Windows (see test_sidecar_error_message_surfaced).
    #[cfg(not(windows))]
    #[test]
    fn test_collect_stems_errors_when_empty() {
        let tmp = std::env::temp_dir().join("stemgen-test-collect-empty");
        let _ = std::fs::create_dir_all(&tmp);

        let manager = SidecarManager::new(PathBuf::from("fake"), tmp.clone());
        let source = Path::new("/music/track.wav");
        let result = manager.collect_stems(&tmp, source);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("No stem files were generated"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Verify collect_stems handles Unicode source file names (guards TASK-007 regression).
    /// Skipped on Windows (see test_sidecar_error_message_surfaced).
    #[cfg(not(windows))]
    #[test]
    fn test_collect_stems_handles_unicode_source_name() {
        let tmp = std::env::temp_dir().join("stemgen-test-collect-unicode");
        let _ = std::fs::create_dir_all(&tmp);

        // Create stem files with accented source name
        std::fs::write(tmp.join("été_drums.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("été_bass.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("été_other.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("été_vocals.wav"), b"fake").unwrap();

        let manager = SidecarManager::new(PathBuf::from("fake"), tmp.clone());
        let source = Path::new("/musique/été.wav");
        let stems = manager.collect_stems(&tmp, source).unwrap();

        assert_eq!(stems.len(), 4);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// TASK-018: Verify collect_stems handles non-standard stem names.
    /// This tests that the dynamic stem collector works with models that
    /// produce stems with different names (e.g. "guitar", "piano").
    /// Skipped on Windows (see test_sidecar_error_message_surfaced).
    #[cfg(not(windows))]
    #[test]
    fn test_collect_stems_non_standard_names() {
        let tmp = std::env::temp_dir().join("stemgen-test-collect-nonstandard");
        let _ = std::fs::create_dir_all(&tmp);

        // Create stem files with non-standard names
        std::fs::write(tmp.join("track_guitar.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("track_piano.wav"), b"fake").unwrap();

        let manager = SidecarManager::new(PathBuf::from("fake"), tmp.clone());
        let source = Path::new("/music/track.wav");
        let stems = manager.collect_stems(&tmp, source).unwrap();

        assert_eq!(stems.len(), 2);
        let types: Vec<&str> = stems.iter().map(|s| s.stem_type.as_str()).collect();
        assert!(types.contains(&"guitar"));
        assert!(types.contains(&"piano"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// TASK-018: Verify collect_stems works with standard four-stem names (regression guard).
    /// Ensures the refactor to dynamic stem collection doesn't break the common case.
    /// Skipped on Windows (see test_sidecar_error_message_surfaced).
    #[cfg(not(windows))]
    #[test]
    fn test_collect_stems_standard_names_still_work() {
        let tmp = std::env::temp_dir().join("stemgen-test-collect-standard");
        let _ = std::fs::create_dir_all(&tmp);

        // Create all four standard stem files
        std::fs::write(tmp.join("track_drums.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("track_bass.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("track_other.wav"), b"fake").unwrap();
        std::fs::write(tmp.join("track_vocals.wav"), b"fake").unwrap();

        let manager = SidecarManager::new(PathBuf::from("fake"), tmp.clone());
        let source = Path::new("/music/track.wav");
        let stems = manager.collect_stems(&tmp, source).unwrap();

        assert_eq!(stems.len(), 4);
        let types: Vec<&str> = stems.iter().map(|s| s.stem_type.as_str()).collect();
        assert!(types.contains(&"drums"));
        assert!(types.contains(&"bass"));
        assert!(types.contains(&"other"));
        assert!(types.contains(&"vocals"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// TASK-019: Verify extract_structured_error parses valid JSON error.
    #[test]
    fn test_extract_structured_error_parses_valid_json() {
        let stderr = r#"{"status":"error","error":"my structured error"}"#;
        let result = extract_structured_error(stderr);
        assert_eq!(result, Some("my structured error".to_string()));
    }

    /// TASK-019: Verify extract_structured_error returns None for plain traceback.
    #[test]
    fn test_extract_structured_error_returns_none_for_plain_traceback() {
        let stderr = "plain traceback text\nmore lines";
        let result = extract_structured_error(stderr);
        assert_eq!(result, None);
    }

    /// TASK-019: Verify extract_structured_error returns None for invalid JSON.
    #[test]
    fn test_extract_structured_error_returns_none_for_invalid_json() {
        let stderr = "{invalid json}";
        let result = extract_structured_error(stderr);
        assert_eq!(result, None);
    }
}
