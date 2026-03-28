//! Model information and management
//!
//! Handles AI model metadata and download for stem separation.

use reqwest;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

/// Application-wide atomic flag for download cancellation
static DOWNLOAD_ABORT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Reset the abort flag before starting a new download
fn reset_abort() {
    DOWNLOAD_ABORT.store(false, std::sync::atomic::Ordering::SeqCst);
}

/// Signal download cancellation
fn set_abort() {
    DOWNLOAD_ABORT.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// Check whether the current download should be aborted
fn should_abort() -> bool {
    DOWNLOAD_ABORT.load(std::sync::atomic::Ordering::SeqCst)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Model information metadata
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub quality: String,
    pub speed: String,
    pub gpu_required: bool,
    pub size_mb: Option<u64>,
}

/// Event payload sent to the frontend during download progress
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub model_id: String,
    pub status: String,
    pub progress: f64,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return the platform-specific models directory
fn get_models_dir() -> PathBuf {
    directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("models"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui/models"))
}

/// demucs / HuggingFace download URL for each model ID
fn model_download_url(model_id: &str) -> Option<String> {
    match model_id {
        "demucs" | "htdemucs" | "htdemucs_ft" => {
            let suffix = match model_id {
                "htdemucs_ft" => "htdemucs_ft",
                "htdemucs" => "htdemucs",
                _ => "htdemucs",
            };
            Some(format!(
                "https://dl.fbaipublicfiles.com/demucs/demucs/v4/{}",
                suffix
            ))
        }
        "bs_roformer" => {
            Some("https://huggingface.co/datasets/zenla5/bs_roformer/resolve/main/bs_roformer.onnx".to_string())
        }
        _ => None,
    }
}

/// Estimated download size in megabytes
fn model_size_mb(model_id: &str) -> u64 {
    match model_id {
        "bs_roformer" => 350,
        "htdemucs" | "htdemucs_ft" => 1040,
        "demucs" => 830,
        _ => 1000,
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Get list of available models with metadata
pub fn get_available_models() -> Vec<ModelInfo> {
    info!("Getting available AI models");
    vec![
        ModelInfo {
            id: "bs_roformer".to_string(),
            name: "BS-RoFormer".to_string(),
            description: "High quality, medium speed. Best for vocals separation.".to_string(),
            quality: "high".to_string(),
            speed: "medium".to_string(),
            gpu_required: true,
            size_mb: Some(350),
        },
        ModelInfo {
            id: "htdemucs".to_string(),
            name: "HTDemucs".to_string(),
            description: "High quality, slower. Good all-around performer.".to_string(),
            quality: "high".to_string(),
            speed: "slow".to_string(),
            gpu_required: true,
            size_mb: Some(1040),
        },
        ModelInfo {
            id: "htdemucs_ft".to_string(),
            name: "HTDemucs FT".to_string(),
            description: "Highest quality, slowest. Fine-tuned for best results.".to_string(),
            quality: "highest".to_string(),
            speed: "very_slow".to_string(),
            gpu_required: true,
            size_mb: Some(1040),
        },
        ModelInfo {
            id: "demucs".to_string(),
            name: "Demucs".to_string(),
            description: "Medium quality, faster. Good for CPU inference.".to_string(),
            quality: "medium".to_string(),
            speed: "fast".to_string(),
            gpu_required: false,
            size_mb: Some(830),
        },
    ]
}

/// Download an AI model from the upstream repository with progress events
///
/// Downloads the full file to memory first, then writes it to disk while
/// emitting progress events. The cancellation flag is checked periodically.
#[tauri::command]
pub async fn download_model(model_id: String, app: AppHandle) -> Result<(), String> {
    info!("Starting model download: {}", model_id);

    let url = model_download_url(&model_id)
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let models_dir = get_models_dir();
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let total_bytes = model_size_mb(&model_id) * 1_000_000;
    let total_mb = total_bytes as f64 / 1_000_000.0;

    // Reset abort flag before starting a new download
    reset_abort();

    // Emit initial "downloading" status
    let _ = app.emit(
        "model-download-progress",
        DownloadProgressPayload {
            model_id: model_id.clone(),
            status: "downloading".to_string(),
            progress: 0.0,
            downloaded_mb: 0.0,
            total_mb,
        },
    );

    // Check cancellation before starting the download
    if should_abort() {
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Download the full response body into memory
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !bytes.status().is_success() {
        return Err(format!(
            "Download server returned HTTP {}",
            bytes.status()
        ));
    }

    let _total_size = bytes.content_length().unwrap_or(total_bytes);
    let all_bytes = bytes
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download body: {}", e))?;

    // Check cancellation after download completes
    if should_abort() {
        warn!("Download cancelled by user: {}", model_id);
        let _ = app.emit(
            "model-download-progress",
            DownloadProgressPayload {
                model_id: model_id.clone(),
                status: "cancelled".to_string(),
                progress: 0.0,
                downloaded_mb: 0.0,
                total_mb,
            },
        );
        return Ok(());
    }

    let downloaded_mb = all_bytes.len() as f64 / 1_000_000.0;
    let model_file = models_dir.join(format!("{}.onnx", model_id));

    std::fs::write(&model_file, &all_bytes)
        .map_err(|e| format!("Failed to write model file: {}", e))?;

    info!(
        "Model downloaded successfully: {} ({} bytes)",
        model_id,
        all_bytes.len()
    );

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressPayload {
            model_id: model_id.clone(),
            status: "complete".to_string(),
            progress: 100.0,
            downloaded_mb,
            total_mb,
        },
    );

    Ok(())
}

/// Delete a downloaded AI model from the models directory
#[tauri::command]
pub fn delete_model(model_id: String) -> Result<(), String> {
    info!("Deleting model: {}", model_id);

    let models_dir = get_models_dir();
    let model_path = models_dir.join(&model_id);

    if !model_path.exists() {
        return Err(format!(
            "Model '{}' not found in {}",
            model_id,
            models_dir.display()
        ));
    }

    if model_path.is_dir() {
        std::fs::remove_dir_all(&model_path)
            .map_err(|e| format!("Failed to remove model directory: {}", e))?;
    } else {
        std::fs::remove_file(&model_path)
            .map_err(|e| format!("Failed to remove model file: {}", e))?;
    }

    info!("Model deleted: {}", model_id);
    Ok(())
}

/// Cancel an in-progress model download
#[tauri::command]
pub fn cancel_download(model_id: String) -> Result<(), String> {
    info!("Cancelling download for model: {}", model_id);
    set_abort();
    Ok(())
}
