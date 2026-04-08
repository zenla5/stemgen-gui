pub mod audio;
pub mod batch;
pub mod db;
pub mod install_executor;
pub mod install_manifest;
pub mod library;
pub mod metadata;
pub mod models;
pub mod probe;
pub mod separation;
pub mod sidecar;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use tracing::info;

use self::probe::*;

pub use audio::*;
pub use db::*;
pub use library::*;
pub use metadata::*;
pub use models::*;
pub use separation::*;
pub use sidecar::*;

/// Check if Python and required AI libraries are available
#[tauri::command]
pub async fn check_python_deps() -> Result<PythonDepsResult, String> {
    info!("Checking Python dependencies");

    let python_path = find_python();
    let python_available = python_path.is_some();
    let python_version = python_path.as_ref().and_then(|p| probe_python_version(p));

    let demucs_available = python_path
        .as_ref()
        .map(|p| probe_python_import(p, "import torch; import torchaudio"))
        .unwrap_or(false);

    let bs_roformer_available = python_path
        .as_ref()
        .map(|p| probe_python_import(p, "from bs_roformer import separator"))
        .unwrap_or(false);

    let cuda_available = python_path
        .as_ref()
        .map(|p| probe_torch_cuda(p))
        .unwrap_or(false);

    Ok(PythonDepsResult {
        python_available,
        python_version,
        demucs_available,
        bs_roformer_available,
        cuda_available,
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

    // Refresh PATH to pick up recently installed binaries
    refresh_path_from_registry();

    let ffmpeg = probe_binary("ffmpeg");
    let ffmpeg_version = if ffmpeg {
        probe_binary_version("ffmpeg", "-version")
            .map(|s| s.lines().next().unwrap_or("unknown").to_string())
    } else {
        None
    };

    let sox = probe_binary("sox");
    let sox_version = if sox {
        probe_binary_version("sox", "--version")
            .map(|s| s.lines().next().unwrap_or("unknown").to_string())
    } else {
        None
    };

    let python_path = find_python();
    let python = python_path.is_some();
    let python_version = python_path.as_ref().and_then(|p| probe_python_version(p));

    let cuda = probe_cuda();
    let mps = probe_mps();

    let model_dir = get_data_dir().join("models");
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
pub async fn get_sidecar_status(app: tauri::AppHandle) -> Result<SidecarStatus, String> {
    info!("Getting sidecar health status");

    let state = app.state::<crate::AppState>();
    let sidecar_path = state.sidecar_path.clone();

    let mut status = SidecarStatus::default();

    // 1. Find Python executable
    let python_path = find_python();
    match &python_path {
        Some(path) => {
            status.python_found = true;
            status.python_path = Some(path.to_string_lossy().to_string());
            status.python_version = probe_python_version(path);

            // Check PyTorch
            status.pytorch_version = probe_python_package_version(path, "torch");

            if status.pytorch_version.is_some() {
                let device = probe_torch_device(path).unwrap_or_else(|| "cpu".to_string());
                status.gpu_available = device == "cuda";
                status.gpu_device = Some(device);
            }
        }
        None => {
            status.errors.push("Python not found".to_string());
        }
    }

    // 2. Check Python packages
    if let Some(ref py_path) = python_path {
        status.demucs_version = probe_python_package_version(py_path, "demucs");
        status.demucs_available = status.demucs_version.is_some();
        if !status.demucs_available {
            status.errors.push("demucs not installed".to_string());
        }

        status.torchaudio_version = probe_python_package_version(py_path, "torchaudio");
        if status.torchaudio_version.is_none() {
            status.errors.push("torchaudio not installed".to_string());
        }

        status.bs_roformer_version = probe_python_package_version(py_path, "bs_roformer");
        status.bs_roformer_available = status.bs_roformer_version.is_some();
        if !status.bs_roformer_available {
            status
                .errors
                .push("bs_roformer not installed (optional)".to_string());
        }
    }

    // 3. Check sidecar script (from AppState)
    if sidecar_path.exists() {
        status.sidecar_script_found = true;
        status.sidecar_script_path = Some(sidecar_path.to_string_lossy().to_string());
    } else {
        status
            .errors
            .push("stemgen_sidecar.py not found".to_string());
    }

    // 4. Check model directory
    let model_dir = get_model_directory();
    status.model_directory = model_dir.to_string_lossy().to_string();

    if model_dir.exists() {
        status.model_count = std::fs::read_dir(&model_dir)
            .map(|d| d.filter_map(|e| e.ok()).count())
            .unwrap_or(0);
    }

    // 5. Determine overall health
    status.is_healthy = status.python_found
        && status.demucs_available
        && status.torchaudio_version.is_some()
        && status.sidecar_script_found;

    info!(
        "Sidecar status: healthy={}, python={}, demucs={}, models={}",
        status.is_healthy, status.python_found, status.demucs_available, status.model_count
    );

    Ok(status)
}

/// Re-deploy the sidecar script from the resource bundle to the data directory.
/// Returns the destination path on success, or an error message on failure.
#[tauri::command]
pub async fn deploy_sidecar(app: tauri::AppHandle) -> Result<String, String> {
    info!("Deploying sidecar script via command");
    let version = env!("CARGO_PKG_VERSION");
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {e}"))?;
    let mut resource_sidecar = resource_dir.join("stemgen_sidecar.py");
    if !resource_sidecar.exists() {
        // Dev mode fallback: Tauri preserves directory structure as _up_/python/
        let fallback = resource_dir
            .join("_up_")
            .join("python")
            .join("stemgen_sidecar.py");
        if fallback.exists() {
            resource_sidecar = fallback;
        }
    }

    if !resource_sidecar.exists() {
        return Err(format!(
            "Sidecar script (stemgen_sidecar.py) was not found in the application resources \
             directory ({}). Please reinstall Stemgen GUI v{} and try again. If the problem \
             persists, please report it at https://github.com/zenla5/stemgen-gui/issues.",
            resource_dir.display(),
            version,
        ));
    }

    let data_dir = get_data_dir();
    let sidecar_path = data_dir.join("stemgen_sidecar.py");

    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
    std::fs::copy(&resource_sidecar, &sidecar_path)
        .map_err(|e| format!("Failed to copy sidecar to {}: {e}", sidecar_path.display()))?;

    // SHA-256 integrity verification
    let src_hash = crate::compute_file_sha256(&resource_sidecar)
        .map_err(|e| format!("Failed to hash source sidecar: {e}"))?;
    let dst_hash = crate::compute_file_sha256(&sidecar_path)
        .map_err(|e| format!("Failed to hash destination sidecar: {e}"))?;
    if src_hash != dst_hash {
        let _ = std::fs::remove_file(&sidecar_path);
        return Err(format!(
            "Sidecar integrity check FAILED: source hash {} != destination hash {}. \
             Deleted corrupted file. Please reinstall Stemgen GUI v{}. If the problem \
             persists, please report it at https://github.com/zenla5/stemgen-gui/issues.",
            src_hash, dst_hash, version,
        ));
    }

    info!("Sidecar deployed to: {}", sidecar_path.display());
    Ok(sidecar_path.to_string_lossy().to_string())
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
        "htdemucs_ft" => 3_500_000_000u64, // ~3.5 GB
        "htdemucs" => 3_200_000_000u64,    // ~3.2 GB
        "bs_roformer" => 2_800_000_000u64, // ~2.8 GB
        "demucs" => 2_500_000_000u64,      // ~2.5 GB
        _ => 3_000_000_000u64,             // default ~3 GB
    };

    Ok(ModelAvailability {
        model: model.clone(),
        available,
        size_bytes,
        download_size_bytes: if available { 0 } else { estimated_size_bytes },
        path: if available {
            Some(model_path.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

/// Validate the entire Python environment for stem separation
#[tauri::command]
pub async fn validate_environment(app: tauri::AppHandle) -> Result<EnvironmentValidation, String> {
    info!("Validating Python environment");

    let state = app.state::<crate::AppState>();
    let sidecar_path = state.sidecar_path.clone();

    // Refresh PATH to pick up recently installed binaries
    refresh_path_from_registry();

    let mut validation = EnvironmentValidation::default();

    // 1. FFmpeg check
    if probe_binary("ffmpeg") {
        validation.ffmpeg = Some(PackageStatus::Available);
    } else {
        validation.ffmpeg = Some(PackageStatus::Missing("ffmpeg not found".to_string()));
    }

    // 2. FFprobe check
    if probe_binary("ffprobe") {
        validation.ffprobe = Some(PackageStatus::Available);
    } else {
        validation.ffprobe = Some(PackageStatus::Missing("ffprobe not found".to_string()));
    }

    // 3. Python check
    match find_python() {
        Some(path) => {
            validation.python_path = Some(path.to_string_lossy().to_string());

            if let Some(version) = probe_python_version(&path) {
                if version.contains("3.9")
                    || version.contains("3.10")
                    || version.contains("3.11")
                    || version.contains("3.12")
                    || version.contains("3.13")
                {
                    validation.python = Some(PackageStatus::Available);
                } else {
                    validation.python = Some(PackageStatus::Warning(format!(
                        "Python {} may not be compatible",
                        version
                    )));
                }
                validation.python_version = Some(version);
            } else {
                validation.python = Some(PackageStatus::Available);
            }
        }
        None => {
            validation.python = Some(PackageStatus::Missing(
                "Python not found. Install Python 3.9+".to_string(),
            ));
        }
    }

    // 4-7. Python package checks (only if Python is available)
    if let Some(ref py_path_str) = validation.python_path {
        let py_path = std::path::Path::new(py_path_str);
        // PyTorch
        match probe_python_package_version(py_path, "torch") {
            Some(version) => {
                validation.pytorch = Some(PackageStatus::Available);
                validation.pytorch_version = Some(version);

                // CUDA check
                if probe_torch_cuda(py_path) {
                    validation.cuda = Some(PackageStatus::Available);
                    validation.gpu_name = probe_gpu_name();
                } else {
                    validation.cuda = Some(PackageStatus::Unavailable(
                        "CUDA not available, will use CPU".to_string(),
                    ));
                }
            }
            None => {
                validation.pytorch =
                    Some(PackageStatus::Missing("PyTorch not installed".to_string()));
            }
        }

        // torchaudio
        match probe_python_package_version(py_path, "torchaudio") {
            Some(version) => {
                validation.torchaudio = Some(PackageStatus::Available);
                validation.torchaudio_version = Some(version);
            }
            None => {
                validation.torchaudio = Some(PackageStatus::Missing(
                    "torchaudio not installed".to_string(),
                ));
            }
        }

        // demucs
        match probe_python_package_version(py_path, "demucs") {
            Some(version) => {
                validation.demucs = Some(PackageStatus::Available);
                validation.demucs_version = Some(version);
            }
            None => {
                validation.demucs =
                    Some(PackageStatus::Missing("demucs not installed".to_string()));
            }
        }

        // sidecar script (from AppState)
        if sidecar_path.exists() {
            validation.sidecar_script = Some(PackageStatus::Available);
            validation.sidecar_script_path = Some(sidecar_path.to_string_lossy().to_string());
        } else {
            validation.sidecar_script = Some(PackageStatus::Missing(format!(
                "stemgen_sidecar.py not found at {:?}",
                sidecar_path
            )));
        }
    }

    // 8. Overall readiness
    validation.is_ready = matches!(validation.python, Some(PackageStatus::Available))
        && matches!(validation.pytorch, Some(PackageStatus::Available))
        && matches!(validation.demucs, Some(PackageStatus::Available))
        && matches!(validation.ffmpeg, Some(PackageStatus::Available))
        && matches!(validation.ffprobe, Some(PackageStatus::Available))
        && matches!(validation.sidecar_script, Some(PackageStatus::Available));

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

fn get_model_directory() -> PathBuf {
    get_data_dir().join("models")
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
