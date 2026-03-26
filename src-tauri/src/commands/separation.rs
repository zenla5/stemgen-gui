use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{error, info};
use crate::audio::{AudioDecoder, AudioResampler, TARGET_SAMPLE_RATE};
use crate::audio::waveform::WaveformPoint;
use crate::commands::sidecar::SidecarManager;
use crate::stems::{StemPacker, StemType, DJSoftware, OutputFormat};

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

#[derive(Debug, Serialize, Deserialize)]
pub struct WaveformResponse {
    pub points: Vec<WaveformPoint>,
    pub sample_rate: u32,
    pub duration_secs: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackStemsRequest {
    pub master_path: String,
    pub stem_paths: Vec<StemPath>,
    pub output_path: String,
    pub dj_software: String,
    pub output_format: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StemPath {
    pub stem_type: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackStemsResponse {
    pub success: bool,
    pub output_path: String,
    pub metadata_path: Option<String>,
}

/// Separation response with stem paths
#[derive(Debug, Serialize, Deserialize)]
pub struct SeparationResponse {
    pub success: bool,
    pub stems: Vec<StemInfo>,
    pub output_dir: String,
}

/// Start stem separation using the Python sidecar
#[tauri::command]
pub async fn start_separation(
    source_path: String,
    output_path: String,
    settings: SeparationSettings,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<StemInfo>, String> {
    info!(
        "Starting separation: {} -> {} (model: {}, device: {})",
        source_path, output_path, settings.model, settings.device
    );
    
    // Get or create sidecar manager
    let mut sidecar_guard = state.sidecar.lock().await;
    
    if sidecar_guard.is_none() {
        // Initialize sidecar manager with paths from app state
        let sidecar = SidecarManager::new(
            state.sidecar_path.clone(),
            state.output_dir.clone(),
        );
        *sidecar_guard = Some(sidecar);
    }
    
    let sidecar = sidecar_guard.as_mut().ok_or("Sidecar not initialized")?;
    
    // Run the separation
    let source = Path::new(&source_path);
    
    // Generate a job ID
    let job_id = format!("job_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis());
    
    let result = sidecar.run_separation(
        job_id,
        source,
        &settings.model,
        &settings.device,
    ).await;
    
    match result {
        Ok(result) => {
            info!("Separation completed successfully with {} stems", result.stems.len());
            
            // Convert to StemInfo
            let stems: Vec<StemInfo> = result.stems.iter().map(|s| StemInfo {
                stem_type: s.stem_type.clone(),
                file_path: Some(s.path.to_string_lossy().to_string()),
            }).collect();
            
            Ok(stems)
        }
        Err(e) => {
            error!("Separation failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Cancel the current separation process
#[tauri::command]
pub async fn cancel_separation(
    _job_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    info!("Cancelling separation job");
    
    let mut sidecar_guard = state.sidecar.lock().await;
    
    if let Some(sidecar) = sidecar_guard.as_mut() {
        sidecar.cancel().await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Get list of available separation models
#[tauri::command]
pub async fn get_models() -> Result<Vec<ModelInfo>, String> {
    info!("Getting available models");
    
    // Return list of available models with metadata
    Ok(vec![
        ModelInfo {
            id: "bs_roformer".to_string(),
            name: "BS-RoFormer".to_string(),
            description: "High quality, medium speed. Best for vocals separation.".to_string(),
            quality: "high".to_string(),
            speed: "medium".to_string(),
            gpu_required: true,
        },
        ModelInfo {
            id: "htdemucs".to_string(),
            name: "HTDemucs".to_string(),
            description: "High quality, slower. Good all-around performer.".to_string(),
            quality: "high".to_string(),
            speed: "slow".to_string(),
            gpu_required: true,
        },
        ModelInfo {
            id: "htdemucs_ft".to_string(),
            name: "HTDemucs FT".to_string(),
            description: "Highest quality, slowest. Fine-tuned for best results.".to_string(),
            quality: "highest".to_string(),
            speed: "very_slow".to_string(),
            gpu_required: true,
        },
        ModelInfo {
            id: "demucs".to_string(),
            name: "Demucs".to_string(),
            description: "Medium quality, faster. Good for CPU inference.".to_string(),
            quality: "medium".to_string(),
            speed: "fast".to_string(),
            gpu_required: false,
        },
    ])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub quality: String,
    pub speed: String,
    pub gpu_required: bool,
}

/// Download a model from HuggingFace
#[tauri::command]
pub async fn download_model(
    model_id: String,
    window: tauri::Window,
) -> Result<(), String> {
    info!("Downloading model: {}", model_id);
    
    // This would download the model from HuggingFace
    // For now, just emit a simple progress event
    
    window.emit("model-download-progress", serde_json::json!({
        "status": "not_implemented",
        "model": model_id,
    })).map_err(|e| e.to_string())?;
    
    Err("Model download not yet implemented. Please install models manually.".to_string())
}

/// Get waveform data for audio file
#[tauri::command]
pub async fn get_waveform_data(
    path: String,
    points_per_second: Option<u32>,
) -> Result<WaveformResponse, String> {
    info!("Generating waveform data for: {}", path);
    
    let path = Path::new(&path);
    
    // Decode audio
    let mut decoder = AudioDecoder::new();
    let samples = decoder.decode(path)
        .map_err(|e| e.to_string())?;
    
    // Resample to target rate if needed
    let mut resampler = AudioResampler::new_44100();
    let samples = if samples.sample_rate != TARGET_SAMPLE_RATE {
        resampler.resample(&samples).map_err(|e| e.to_string())?
    } else {
        samples
    };
    
    // Generate waveform
    let points = points_per_second.unwrap_or(100);
    let waveform = samples.generate_waveform(points);
    
    // Convert to response format
    let waveform_points: Vec<WaveformPoint> = waveform.points.iter()
        .map(|p| WaveformPoint {
            min: p.min,
            max: p.max,
            rms: p.rms,
        })
        .collect();
    
    Ok(WaveformResponse {
        points: waveform_points,
        sample_rate: waveform.sample_rate,
        duration_secs: waveform.duration_secs,
    })
}

/// Pack multiple audio files into a .stem.mp4 file
#[tauri::command]
pub async fn pack_stems(
    request: PackStemsRequest,
) -> Result<PackStemsResponse, String> {
    info!("Packing stems to: {}", request.output_path);
    
    // Parse DJ software
    let dj_software = DJSoftware::from_str(&request.dj_software)
        .ok_or_else(|| format!("Unknown DJ software: {}", request.dj_software))?;
    
    // Parse output format
    let output_format = match request.output_format.to_lowercase().as_str() {
        "alac" => OutputFormat::Alac,
        "aac" | _ => OutputFormat::Aac,
    };
    
    // Create packer settings
    let settings = crate::stems::ExportSettings {
        dj_software,
        output_format,
        quality: crate::stems::QualityPreset::Standard,
        custom_colors: true,
    };
    
    // Create packer
    let packer = StemPacker::new(settings);
    
    // Parse stem paths
    let master_path = PathBuf::from(&request.master_path);
    let stem_paths: Vec<(StemType, PathBuf)> = request.stem_paths.iter()
        .filter_map(|sp| {
            let stem_type = match sp.stem_type.to_lowercase().as_str() {
                "drums" => Some(StemType::Drums),
                "bass" => Some(StemType::Bass),
                "other" => Some(StemType::Other),
                "vocals" => Some(StemType::Vocals),
                _ => None,
            }?;
            Some((stem_type, PathBuf::from(&sp.path)))
        })
        .collect();
    
    let output_path = PathBuf::from(&request.output_path);
    
    // Pack stems
    packer.pack(&master_path, &stem_paths, &output_path)
        .await
        .map_err(|e| e.to_string())?;
    
    // Return response
    let output_path_clone = request.output_path.clone();
    Ok(PackStemsResponse {
        success: true,
        output_path: output_path_clone,
        metadata_path: Some(format!("{}.metadata.json", request.output_path)),
    })
}
