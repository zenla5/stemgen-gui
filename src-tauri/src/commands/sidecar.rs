//! Python sidecar process management for AI stem separation

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Represents a running separation process
pub struct SeparationProcess {
    /// The child process handle
    child: Child,
    /// Job ID for tracking
    job_id: String,
    /// The model being using
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
                format!(r"{}\AppData\Local\Programs\Python\Python312\python.exe", std::env::var("USERPROFILE").unwrap_or_default()),
            ]
        } else {
            vec![
                "python3".to_string(),
                "python".to_string(),
            ]
        };

        for candidate in &candidates {
            if let Ok(path) = which::which(candidate) {
                // Verify it's working
                let output = Command::new(&path)
                    .args(["--version"])
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
    pub async fn run_separation(
        &mut self,
        job_id: String,
        source_path: &Path,
        model: &str,
        device: &str,
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
        std::fs::create_dir_all(&job_output_dir)
            .context("Failed to create output directory")?;

        info!(
            "Starting separation: {} -> {} (model: {}, device: {})",
            source_path.display(),
            job_output_dir.display(),
            model,
            device
        );

        // Spawn the Python process
        let mut child = Command::new(python_path)
            .arg(&self.sidecar_path)
            .arg("--model")
            .arg(model)
            .arg("--input")
            .arg(source_path)
            .arg("--output")
            .arg(&job_output_dir)
            .arg("--device")
            .arg(device)
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
                            job_id_for_emit,
                            progress.status,
                            progress.stage,
                            progress.progress
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

        // Also log stderr
        if let Some(stderr) = stderr {
            let job_id_for_stderr = job_id.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        warn!("[{}] stderr: {}", job_id_for_stderr, trimmed);
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
            Err(anyhow::anyhow!("Separation process failed with exit code: {:?}", status.code()))
        }
    }

    /// Collect the generated stem files
    fn collect_stems(&self, output_dir: &Path, source_path: &Path) -> Result<Vec<StemResult>> {
        let mut stems = Vec::new();
        let stem_names = ["drums", "bass", "other", "vocals"];
        let source_stem = source_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("stem");

        for name in &stem_names {
            let stem_filename = format!("{}_{}.wav", source_stem, name);
            let stem_path = output_dir.join(&stem_filename);
            
            if stem_path.exists() {
                stems.push(StemResult {
                    stem_type: name.to_string(),
                    path: stem_path,
                });
            } else {
                warn!("Stem file not found: {}", stem_path.display());
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
