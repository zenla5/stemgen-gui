use serde::{Deserialize, Serialize};
use tracing::{info, error};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SeparationSettings {
    pub model: String,
    pub device: String,
    pub output_format: String,
    pub quality_preset: String,
    pub dj_preset: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StemInfo {
    pub stem_type: String,
    pub file_path: Option<String>,
}

#[tauri::command]
pub async fn start_separation(
    source_path: String,
    output_path: String,
    settings: SeparationSettings,
) -> Result<Vec<StemInfo>, String> {
    info!(
        "Starting separation: {} -> {} (model: {}, device: {})",
        source_path, output_path, settings.model, settings.device
    );
    
    // This is a placeholder - actual implementation would:
    // 1. Convert audio to 44.1kHz WAV using FFmpeg/SoX
    // 2. Run AI model (bs_roformer or demucs) via Python sidecar
    // 3. Create .stem.mp4 using ni-stem format
    // 4. Return stem file paths
    
    Err("Separation not yet implemented".to_string())
}

#[tauri::command]
pub async fn cancel_separation(job_id: String) -> Result<(), String> {
    info!("Cancelling separation job: {}", job_id);
    // Cancel the running separation process
    Ok(())
}

#[tauri::command]
pub async fn get_models() -> Result<Vec<String>, String> {
    info!("Getting available models");
    
    // Return list of available models
    Ok(vec![
        "bs_roformer".to_string(),
        "htdemucs".to_string(),
        "htdemucs_ft".to_string(),
        "demucs".to_string(),
    ])
}

#[tauri::command]
pub async fn download_model(
    model_id: String,
    window: tauri::Window,
) -> Result<(), String> {
    info!("Downloading model: {}", model_id);
    
    // This would download the model from HuggingFace
    // and emit progress events to the window
    
    Ok(())
}
