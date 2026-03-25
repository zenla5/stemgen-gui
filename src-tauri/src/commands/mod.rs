pub mod db;
pub mod audio;
pub mod separation;

use serde::{Deserialize, Serialize};
use crate::AppState;
use tauri::State;
use tracing::{info, error};

// Re-export commands
pub use audio::*;
pub use separation::*;
pub use db::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckDependenciesResult {
    pub ffmpeg: bool,
    pub ffmpeg_version: Option<String>,
    pub sox: bool,
    pub sox_version: Option<String>,
    pub python: bool,
    pub python_version: Option<String>,
    pub cuda: bool,
    pub mps: bool,
    pub model_directory: String,
    pub model_count: usize,
}

#[tauri::command]
pub async fn check_dependencies() -> Result<CheckDependenciesResult, String> {
    info!("Checking dependencies");
    
    // Check FFmpeg
    let ffmpeg = which::which("ffmpeg").is_ok();
    let ffmpeg_version = if ffmpeg {
        std::process::Command::new("ffmpeg")
            .arg("-version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.lines().next().unwrap_or("unknown").to_string())
    } else {
        None
    };
    
    // Check Sox
    let sox = which::which("sox").is_ok();
    let sox_version = if sox {
        std::process::Command::new("sox")
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.lines().next().unwrap_or("unknown").to_string())
    } else {
        None
    };
    
    // Check Python
    let python = which::which("python3").is_ok() || which::which("python").is_ok();
    let python_version = if python {
        std::process::Command::new(if which::which("python3").is_ok() { "python3" } else { "python" })
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .or_else(|| std::process::Command::new(if which::which("python3").is_ok() { "python3" } else { "python" })
                .arg("--version")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stderr).ok()))
            .map(|s| s.trim().to_string())
    } else {
        None
    };
    
    // Check CUDA
    #[cfg(target_os = "windows")]
    let cuda = std::process::Command::new("nvidia-smi")
        .arg("--query-gpu=name")
        .arg("--format=csv,noheader")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    
    #[cfg(not(target_os = "windows"))]
    let cuda = false;
    
    // Check MPS (macOS)
    #[cfg(target_os = "macos")]
    let mps = true; // macOS always supports MPS if it has Apple Silicon
    #[cfg(not(target_os = "macos"))]
    let mps = false;
    
    // Check model directory
    let model_dir = directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("models"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui/models"));
    
    std::fs::create_dir_all(&model_dir).ok();
    
    let model_count = if model_dir.exists() {
        std::fs::read_dir(&model_dir)
            .map(|d| d.filter_map(|e| e.ok()).count())
            .unwrap_or(0)
    } else {
        0
    };
    
    info!(
        "Dependencies check complete: ffmpeg={}, sox={}, python={}, cuda={}, models={}",
        ffmpeg, sox, python, cuda, model_count
    );
    
    Ok(CheckDependenciesResult {
        ffmpeg,
        ffmpeg_version,
        sox,
        sox_version,
        python,
        python_version,
        cuda,
        mps,
        model_directory: model_dir.to_string_lossy().to_string(),
        model_count,
    })
}
