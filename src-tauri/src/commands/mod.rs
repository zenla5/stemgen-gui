pub mod db;
pub mod audio;
pub mod separation;
pub mod sidecar;

use serde::{Deserialize, Serialize};
use tracing::info;

pub use audio::*;
pub use separation::*;
pub use db::*;
pub use sidecar::*;

/// Check if Python and required AI libraries are available
#[tauri::command]
pub async fn check_python_deps() -> Result<PythonDepsResult, String> {
    info!("Checking Python dependencies");
    
    // Try to find Python
    let python_path = which::which("python")
        .or_else(|_| which::which("python3"))
        .or_else(|_| which::which("py"));
    
    let (python_available, python_version) = if let Ok(path) = &python_path {
        let output = std::process::Command::new(path)
            .args(["--version"])
            .output();
        
        match output {
            Ok(o) => {
                let version = if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                } else {
                    String::from_utf8_lossy(&o.stderr).trim().to_string()
                };
                (true, Some(version))
            }
            Err(_) => (false, None),
        }
    } else {
        (false, None)
    };
    
    // Try to import required packages
    let demucs_available = if python_path.is_ok() {
        std::process::Command::new(python_path.as_ref().unwrap())
            .args(["-c", "import torch; import torchaudio"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    
    let bs_roformer_available = if python_path.is_ok() {
        std::process::Command::new(python_path.as_ref().unwrap())
            .args(["-c", "from bs_roformer import separator"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    
    Ok(PythonDepsResult {
        python_available,
        python_version,
        demucs_available,
        bs_roformer_available,
        cuda_available: demucs_available, // If demucs works, CUDA likely works too
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonDepsResult {
    pub python_available: bool,
    pub python_version: Option<String>,
    pub demucs_available: bool,
    pub bs_roformer_available: bool,
    pub cuda_available: bool,
}

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
