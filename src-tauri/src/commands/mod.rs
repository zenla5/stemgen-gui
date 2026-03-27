pub mod db;
pub mod audio;
pub mod metadata;
pub mod models;
pub mod separation;
pub mod sidecar;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tracing::info;

pub use audio::*;
pub use db::*;
pub use metadata::*;
pub use models::*;
pub use separation::*;
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
    let demucs_available = if let Ok(path) = &python_path {
        std::process::Command::new(path)
            .args(["-c", "import torch; import torchaudio"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    
    let bs_roformer_available = if let Ok(path) = &python_path {
        std::process::Command::new(path)
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

// ============================================================================
// Phase 3: Python Sidecar Health Monitoring
// ============================================================================

/// Get detailed Python/sidecar health status
#[tauri::command]
pub async fn get_sidecar_status() -> Result<SidecarStatus, String> {
    info!("Getting sidecar health status");
    
    let mut status = SidecarStatus::default();
    
    // 1. Find Python executable
    let python_path = which::which("python")
        .or_else(|_| which::which("python3"))
        .or_else(|_| which::which("py"));
    
    match python_path {
        Ok(path) => {
            status.python_found = true;
            status.python_path = Some(path.to_string_lossy().to_string());
            
            // Get version
            let output = Command::new(&path)
                .args(["--version"])
                .output()
                .map_err(|e| e.to_string())?;
            
            if output.status.success() {
                status.python_version = Some(
                    String::from_utf8_lossy(&output.stdout)
                        .trim()
                        .to_string()
                );
            }
            
            // Check PyTorch (needed for demucs)
            let torch_output = Command::new(&path)
                .args(["-c", "import torch; print(torch.__version__)"])
                .output()
                .map_err(|e| e.to_string())?;
            
            if torch_output.status.success() {
                status.pytorch_version = Some(
                    String::from_utf8_lossy(&torch_output.stdout).trim().to_string()
                );
                
                // Check GPU availability
                let cuda_check = Command::new(&path)
                    .args([
                        "-c",
                        "import torch; print('cuda' if torch.cuda.is_available() else 'cpu')",
                    ])
                    .output()
                    .map_err(|e| e.to_string())?;
                
                if cuda_check.status.success() {
                    let device = String::from_utf8_lossy(&cuda_check.stdout).trim().to_string();
                    status.gpu_available = device == "cuda";
                    status.gpu_device = Some(device);
                }
            }
        }
        Err(_) => {
            status.errors.push("Python not found".to_string());
        }
    }
    
    // 2. Check Python packages
    if status.python_found {
        let python_exe = status.python_path.as_ref().unwrap();
        
        // Check demucs
        let demucs_out = Command::new(python_exe)
            .args(["-c", "import demucs; print(demucs.__version__)"])
            .output();
        
        match demucs_out {
            Ok(o) if o.status.success() => {
                status.demucs_available = true;
                status.demucs_version = Some(
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                );
            }
            _ => {
                status.errors.push("demucs not installed".to_string());
            }
        }
        
        // Check torchaudio
        let torchaudio_out = Command::new(python_exe)
            .args(["-c", "import torchaudio; print(torchaudio.__version__)"])
            .output();
        
        match torchaudio_out {
            Ok(o) if o.status.success() => {
                status.torchaudio_version = Some(
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                );
            }
            _ => {
                status.errors.push("torchaudio not installed".to_string());
            }
        }
        
        // Check bs_roformer
        let bs_out = Command::new(python_exe)
            .args(["-c", "import bs_roformer; print(bs_roformer.__version__)"])
            .output();
        
        match bs_out {
            Ok(o) if o.status.success() => {
                status.bs_roformer_available = true;
                status.bs_roformer_version = Some(
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                );
            }
            _ => {
                status.errors.push("bs_roformer not installed (optional)".to_string());
            }
        }
    }
    
    // 3. Check sidecar script
    let sidecar_path = get_sidecar_script_path();
    if sidecar_path.exists() {
        status.sidecar_script_found = true;
        status.sidecar_script_path = Some(sidecar_path.to_string_lossy().to_string());
    } else {
        status.errors.push("stemgen_sidecar.py not found".to_string());
    }
    
    // 4. Check model directory
    let model_dir = get_model_directory();
    status.model_directory = model_dir.to_string_lossy().to_string();
    
    if model_dir.exists() {
        let model_count = std::fs::read_dir(&model_dir)
            .map(|d| d.filter_map(|e| e.ok()).count())
            .unwrap_or(0);
        status.model_count = model_count;
    }
    
    // 5. Determine overall health
    status.is_healthy = status.python_found 
        && status.demucs_available 
        && status.torchaudio_version.is_some()
        && status.sidecar_script_found;
    
    info!(
        "Sidecar status: healthy={}, python={}, demucs={}, models={}",
        status.is_healthy,
        status.python_found,
        status.demucs_available,
        status.model_count
    );
    
    Ok(status)
}

/// Check if a specific model is available for download/usage
#[tauri::command]
pub async fn check_model_available(model: String) -> Result<ModelAvailability, String> {
    info!("Checking model availability: {}", model);
    
    let model_dir = get_model_directory();
    let model_path = model_dir.join(&model);
    
    let available = model_path.exists() && model_path.is_dir();
    
    let size_bytes = if available {
        calculate_dir_size(&model_path).unwrap_or(0)
    } else {
        0
    };
    
    // Estimate download size based on model type
    let estimated_size_bytes = match model.as_str() {
        "htdemucs_ft" => 3_500_000_000u64,  // ~3.5 GB
        "htdemucs" => 3_200_000_000u64,     // ~3.2 GB
        "bs_roformer" => 2_800_000_000u64,  // ~2.8 GB
        "demucs" => 2_500_000_000u64,       // ~2.5 GB
        _ => 3_000_000_000u64,               // default ~3 GB
    };
    
    Ok(ModelAvailability {
        model: model.clone(),
        available,
        size_bytes,
        download_size_bytes: if available { 0 } else { estimated_size_bytes },
        path: if available { Some(model_path.to_string_lossy().to_string()) } else { None },
    })
}

/// Validate the entire Python environment for stem separation
#[tauri::command]
pub async fn validate_environment() -> Result<EnvironmentValidation, String> {
    info!("Validating Python environment");
    
    let mut validation = EnvironmentValidation::default();
    
    // 1. FFmpeg check
    if which::which("ffmpeg").is_ok() {
        validation.ffmpeg = Some(PackageStatus::Available);
    } else {
        validation.ffmpeg = Some(PackageStatus::Missing("ffmpeg not found".to_string()));
    }
    
    // 2. FFprobe check
    if which::which("ffprobe").is_ok() {
        validation.ffprobe = Some(PackageStatus::Available);
    } else {
        validation.ffprobe = Some(PackageStatus::Missing("ffprobe not found".to_string()));
    }
    
    // 3. Python check
    let python_path = which::which("python")
        .or_else(|_| which::which("python3"))
        .or_else(|_| which::which("py"));
    
    match python_path {
        Ok(path) => {
            validation.python = Some(PackageStatus::Available);
            validation.python_path = Some(path.to_string_lossy().to_string());
            
            // Check version
            if let Ok(output) = Command::new(&path).args(["--version"]).output() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if version.contains("3.9") || version.contains("3.10") || version.contains("3.11") || version.contains("3.12") {
                    validation.python_version = Some(version);
                } else {
                    validation.python = Some(PackageStatus::Warning(
                        format!("Python {} may not be compatible", version)
                    ));
                    validation.python_version = Some(version);
                }
            }
        }
        Err(_) => {
            validation.python = Some(PackageStatus::Missing(
                "Python not found. Install Python 3.9+".to_string()
            ));
        }
    }
    
    // 4. PyTorch check
    if let Some(ref py_path) = validation.python_path {
        let torch_check = Command::new(py_path)
            .args(["-c", "import torch; print(torch.__version__)"])
            .output();
        
        match torch_check {
            Ok(o) if o.status.success() => {
                let version = String::from_utf8_lossy(&o.stdout).trim().to_string();
                
                // Check CUDA
                let cuda_check = Command::new(py_path)
                    .args(["-c", "import torch; print('yes' if torch.cuda.is_available() else 'no')"])
                    .output();
                
                let has_cuda = cuda_check
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "yes")
                    .unwrap_or(false);
                
                if has_cuda {
                    validation.cuda = Some(PackageStatus::Available);
                    
                    // Get GPU name
                    let gpu_name = Command::new("nvidia-smi")
                        .arg("--query-gpu=name")
                        .arg("--format=csv,noheader")
                        .output()
                        .ok()
                        .and_then(|o| String::from_utf8(o.stdout).ok())
                        .map(|s| s.trim().to_string());
                    
                    validation.gpu_name = gpu_name;
                } else {
                    validation.cuda = Some(PackageStatus::Unavailable(
                        "CUDA not available, will use CPU".to_string()
                    ));
                }
                
                validation.pytorch = Some(PackageStatus::Available);
                validation.pytorch_version = Some(version);
            }
            Ok(_) => {
                validation.pytorch = Some(PackageStatus::Missing(
                    "PyTorch not installed".to_string()
                ));
            }
            Err(e) => {
                validation.pytorch = Some(PackageStatus::Missing(
                    format!("Failed to check PyTorch: {}", e)
                ));
            }
        }
        
        // 5. torchaudio check
        let torchaudio_check = Command::new(py_path)
            .args(["-c", "import torchaudio; print(torchaudio.__version__)"])
            .output();
        
        match torchaudio_check {
            Ok(o) if o.status.success() => {
                validation.torchaudio = Some(PackageStatus::Available);
                validation.torchaudio_version = Some(
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                );
            }
            _ => {
                validation.torchaudio = Some(PackageStatus::Missing(
                    "torchaudio not installed".to_string()
                ));
            }
        }
        
        // 6. demucs check
        let demucs_check = Command::new(py_path)
            .args(["-c", "import demucs; print(demucs.__version__)"])
            .output();
        
        match demucs_check {
            Ok(o) if o.status.success() => {
                validation.demucs = Some(PackageStatus::Available);
                validation.demucs_version = Some(
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                );
            }
            _ => {
                validation.demucs = Some(PackageStatus::Missing(
                    "demucs not installed".to_string()
                ));
            }
        }
        
        // 7. sidecar script check
        let sidecar_path = get_sidecar_script_path();
        if sidecar_path.exists() {
            validation.sidecar_script = Some(PackageStatus::Available);
            validation.sidecar_script_path = Some(sidecar_path.to_string_lossy().to_string());
        } else {
            validation.sidecar_script = Some(PackageStatus::Missing(
                format!("stemgen_sidecar.py not found at {:?}", sidecar_path)
            ));
        }
    }
    
    // 8. Overall readiness
    validation.is_ready = matches!(validation.python, Some(PackageStatus::Available))
        && matches!(validation.pytorch, Some(PackageStatus::Available))
        && matches!(validation.demucs, Some(PackageStatus::Available))
        && matches!(validation.ffmpeg, Some(PackageStatus::Available))
        && matches!(validation.ffprobe, Some(PackageStatus::Available));
    
    validation.warnings = validation
        .python
        .as_ref()
        .and_then(|s| {
            if matches!(s, PackageStatus::Warning(_)) {
                Some(s.to_string())
            } else {
                None
            }
        })
        .map(|w| vec![w])
        .unwrap_or_default();
    
    info!(
        "Environment validation: ready={}, warnings={}",
        validation.is_ready,
        validation.warnings.len()
    );
    
    Ok(validation)
}

// ============================================================================
// Helper types and functions
// ============================================================================

/// Sidecar health status
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub is_healthy: bool,
    pub python_found: bool,
    pub python_path: Option<String>,
    pub python_version: Option<String>,
    pub pytorch_version: Option<String>,
    pub gpu_available: bool,
    pub gpu_device: Option<String>,
    pub demucs_available: bool,
    pub demucs_version: Option<String>,
    pub torchaudio_version: Option<String>,
    pub bs_roformer_available: bool,
    pub bs_roformer_version: Option<String>,
    pub sidecar_script_found: bool,
    pub sidecar_script_path: Option<String>,
    pub model_directory: String,
    pub model_count: usize,
    pub errors: Vec<String>,
}

/// Model availability info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelAvailability {
    pub model: String,
    pub available: bool,
    pub size_bytes: u64,
    pub download_size_bytes: u64,
    pub path: Option<String>,
}

/// Package validation status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageStatus {
    Available,
    Unavailable(String),
    Warning(String),
    Missing(String),
}

impl std::fmt::Display for PackageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageStatus::Available => write!(f, "Available"),
            PackageStatus::Unavailable(s) => write!(f, "Unavailable: {}", s),
            PackageStatus::Warning(s) => write!(f, "Warning: {}", s),
            PackageStatus::Missing(s) => write!(f, "Missing: {}", s),
        }
    }
}

/// Full environment validation result
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentValidation {
    pub is_ready: bool,
    pub python: Option<PackageStatus>,
    pub python_path: Option<String>,
    pub python_version: Option<String>,
    pub pytorch: Option<PackageStatus>,
    pub pytorch_version: Option<String>,
    pub torchaudio: Option<PackageStatus>,
    pub torchaudio_version: Option<String>,
    pub demucs: Option<PackageStatus>,
    pub demucs_version: Option<String>,
    pub cuda: Option<PackageStatus>,
    pub gpu_name: Option<String>,
    pub ffmpeg: Option<PackageStatus>,
    pub ffprobe: Option<PackageStatus>,
    pub sidecar_script: Option<PackageStatus>,
    pub sidecar_script_path: Option<String>,
    pub warnings: Vec<String>,
}

fn get_sidecar_script_path() -> PathBuf {
    directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("stemgen_sidecar.py"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen_sidecar.py"))
}

fn get_model_directory() -> PathBuf {
    directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("models"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui/models"))
}

fn calculate_dir_size(path: &std::path::Path) -> std::io::Result<u64> {
    let mut size = 0u64;
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                size += entry.metadata()?.len();
            } else if path.is_dir() {
                size += calculate_dir_size(&path)?;
            }
        }
    }
    Ok(size)
}
