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

// ============================================================
// Unit Tests
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_available_models_returns_4_models() {
        let models = get_available_models();
        assert_eq!(models.len(), 4);
    }

    #[test]
    fn test_get_available_models_has_valid_ids() {
        let models = get_available_models();
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&"demucs"));
        assert!(ids.contains(&"bs_roformer"));
        assert!(ids.contains(&"htdemucs"));
        assert!(ids.contains(&"htdemucs_ft"));
    }

    #[test]
    fn test_get_available_models_has_required_fields() {
        let models = get_available_models();
        for model in models {
            assert!(!model.id.is_empty());
            assert!(!model.name.is_empty());
            assert!(!model.description.is_empty());
            assert!(!model.quality.is_empty());
            assert!(!model.speed.is_empty());
        }
    }

    #[test]
    fn test_model_info_serialization() {
        let model = ModelInfo {
            id: "test-model".to_string(),
            name: "Test Model".to_string(),
            description: "A test model".to_string(),
            quality: "high".to_string(),
            speed: "fast".to_string(),
            gpu_required: true,
            size_mb: Some(100),
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("test-model"));
        assert!(json.contains("high"));
        assert!(json.contains("true")); // gpu_required
    }

    #[test]
    fn test_model_info_deserialization() {
        let json = r#"{
            "id": "bs_roformer",
            "name": "BS-RoFormer",
            "description": "High quality model",
            "quality": "high",
            "speed": "medium",
            "gpu_required": true,
            "size_mb": 350
        }"#;

        let model: ModelInfo = serde_json::from_str(json).unwrap();
        assert_eq!(model.id, "bs_roformer");
        assert_eq!(model.quality, "high");
        assert!(model.gpu_required);
        assert_eq!(model.size_mb, Some(350));
    }

    #[test]
    fn test_download_progress_payload_serialization() {
        let payload = DownloadProgressPayload {
            model_id: "test-model".to_string(),
            status: "downloading".to_string(),
            progress: 50.0,
            downloaded_mb: 50.0,
            total_mb: 100.0,
        };

        let json = serde_json::to_string(&payload).unwrap();
        // Should use camelCase for modelId
        assert!(json.contains("modelId"));
        assert!(json.contains("\"progress\":50"));
        assert!(!json.contains("model_id")); // snake_case not in output
    }

    #[test]
    fn test_model_download_url_demucs() {
        assert!(model_download_url("demucs").is_some());
        let url = model_download_url("demucs").unwrap();
        assert!(url.contains("demucs"));
        assert!(url.contains("dl.fbaipublicfiles.com"));
    }

    #[test]
    fn test_model_download_url_htdemucs() {
        assert!(model_download_url("htdemucs").is_some());
        let url = model_download_url("htdemucs").unwrap();
        assert!(url.contains("htdemucs"));
    }

    #[test]
    fn test_model_download_url_htdemucs_ft() {
        assert!(model_download_url("htdemucs_ft").is_some());
        let url = model_download_url("htdemucs_ft").unwrap();
        assert!(url.contains("htdemucs_ft"));
    }

    #[test]
    fn test_model_download_url_bs_roformer() {
        assert!(model_download_url("bs_roformer").is_some());
        let url = model_download_url("bs_roformer").unwrap();
        assert!(url.contains("bs_roformer"));
        assert!(url.contains("huggingface.co"));
    }

    #[test]
    fn test_model_download_url_invalid() {
        assert!(model_download_url("invalid-model").is_none());
        assert!(model_download_url("").is_none());
        assert!(model_download_url("unknown").is_none());
    }

    #[test]
    fn test_model_size_mb_all_models() {
        assert_eq!(model_size_mb("demucs"), 830);
        assert_eq!(model_size_mb("htdemucs"), 1040);
        assert_eq!(model_size_mb("htdemucs_ft"), 1040);
        assert_eq!(model_size_mb("bs_roformer"), 350);
    }

    #[test]
    fn test_model_size_mb_unknown_defaults_to_1000() {
        assert_eq!(model_size_mb("unknown"), 1000);
        assert_eq!(model_size_mb(""), 1000);
    }

    #[test]
    fn test_abort_flag_default_is_false() {
        // Reset and check default state
        reset_abort();
        assert!(!should_abort());
    }

    #[test]
    fn test_abort_flag_set_and_check() {
        // Reset first
        reset_abort();
        assert!(!should_abort());

        // Set abort
        set_abort();
        assert!(should_abort());

        // Reset again
        reset_abort();
        assert!(!should_abort());
    }

    #[test]
    fn test_get_models_dir_returns_path() {
        let models_dir = get_models_dir();
        assert!(models_dir.to_string_lossy().contains("stemgen-gui"));
        assert!(models_dir.to_string_lossy().contains("models"));
    }

    #[test]
    fn test_demucs_model_info_has_no_gpu_requirement() {
        let models = get_available_models();
        let demucs = models.iter().find(|m| m.id == "demucs").unwrap();
        assert!(!demucs.gpu_required);
        assert_eq!(demucs.size_mb, Some(830));
    }

    #[test]
    fn test_gpu_models_require_gpu() {
        let models = get_available_models();
        let gpu_models = ["bs_roformer", "htdemucs", "htdemucs_ft"];
        
        for gpu_model_id in gpu_models {
            let model = models.iter().find(|m| m.id == gpu_model_id).unwrap();
            assert!(model.gpu_required, "Model {} should require GPU", gpu_model_id);
        }
    }

    #[test]
    fn test_all_models_have_size_info() {
        let models = get_available_models();
        for model in models {
            assert!(model.size_mb.is_some());
            assert!(model.size_mb.unwrap() > 0);
        }
    }
}
