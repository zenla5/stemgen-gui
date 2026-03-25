use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{info, error};
use crate::audio::{AudioDecoder, AudioResampler, TARGET_SAMPLE_RATE};
use crate::audio::waveform::WaveformData;
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaveformPoint {
    pub min: f32,
    pub max: f32,
    pub rms: f32,
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
    
    Err("Separation not yet implemented - use pack_stems for existing stems".to_string())
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
    Ok(PackStemsResponse {
        success: true,
        output_path: request.output_path,
        metadata_path: Some(format!("{}.metadata.json", request.output_path)),
    })
}
