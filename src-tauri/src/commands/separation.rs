use crate::audio::waveform::WaveformPoint;
use crate::audio::{AudioDecoder, AudioResampler, TARGET_SAMPLE_RATE};
use crate::commands::models::{get_available_models, ModelInfo};
use crate::commands::sidecar::SidecarManager;
use crate::stems::{DJSoftware, OutputFormat, StemPacker, StemType};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{error, info};

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

/// Export individual stem to different format
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportStemRequest {
    pub stem_path: String,
    pub output_path: String,
    pub format: String, // "wav", "mp3", "flac", "aac", "alac"
    pub normalize: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportStemResponse {
    pub success: bool,
    pub output_path: String,
}

/// Batch export all stems
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExportRequest {
    pub stem_paths: Vec<StemPath>,
    pub output_dir: String,
    pub format: String,
    pub normalize: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExportResponse {
    pub success: bool,
    pub exported_files: Vec<String>,
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
    _output_path: String,
    settings: SeparationSettings,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<StemInfo>, String> {
    info!(
        "Starting separation: {} (model: {}, device: {})",
        source_path, settings.model, settings.device
    );

    // Get or create sidecar manager
    let mut sidecar_guard = state.sidecar.lock().await;

    if sidecar_guard.is_none() {
        // Initialize sidecar manager with paths from app state
        let sidecar = SidecarManager::new(state.sidecar_path.clone(), state.output_dir.clone());
        *sidecar_guard = Some(sidecar);
    }

    let sidecar = sidecar_guard.as_mut().ok_or("Sidecar not initialized")?;

    // Run the separation
    let source = Path::new(&source_path);

    // Generate a job ID
    let job_id = format!(
        "job_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let result = sidecar
        .run_separation(job_id, source, &settings.model, &settings.device)
        .await;

    match result {
        Ok(result) => {
            info!(
                "Separation completed successfully with {} stems",
                result.stems.len()
            );

            // Convert to StemInfo
            let stems: Vec<StemInfo> = result
                .stems
                .iter()
                .map(|s| StemInfo {
                    stem_type: s.stem_type.clone(),
                    file_path: Some(s.path.to_string_lossy().to_string()),
                })
                .collect();

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
pub fn get_models() -> Result<Vec<ModelInfo>, String> {
    info!("Getting available models");
    Ok(get_available_models())
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
    let samples = decoder.decode(path).map_err(|e| e.to_string())?;

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
    let waveform_points: Vec<WaveformPoint> = waveform
        .points
        .iter()
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
pub async fn pack_stems(request: PackStemsRequest) -> Result<PackStemsResponse, String> {
    info!("Packing stems to: {}", request.output_path);

    // Parse DJ software
    let dj_software = DJSoftware::from_str(&request.dj_software)
        .ok_or_else(|| format!("Unknown DJ software: {}", request.dj_software))?;

    // Parse output format
    let output_format = match request.output_format.to_lowercase().as_str() {
        "alac" => OutputFormat::Alac,
        _ => OutputFormat::Aac,
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
    let stem_paths: Vec<(StemType, PathBuf)> = request
        .stem_paths
        .iter()
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

    let master_path = PathBuf::from(&request.master_path);
    let output_path = PathBuf::from(&request.output_path);

    // Pack stems
    packer
        .pack(&master_path, &stem_paths, &output_path)
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

// ============================================================================
// Phase 4: Export/Download Stems
// ============================================================================

/// Export a single stem to a different audio format
#[tauri::command]
pub async fn export_stem(request: ExportStemRequest) -> Result<ExportStemResponse, String> {
    info!(
        "Exporting stem: {} -> {}",
        request.stem_path, request.output_path
    );

    let input_path = Path::new(&request.stem_path);
    let output_path = Path::new(&request.output_path);

    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    // Build FFmpeg command
    let codec = match request.format.to_lowercase().as_str() {
        "wav" => ("pcm_s16le", "-y"),
        "flac" => ("flac", "-y"),
        "mp3" => ("libmp3lame", "-y"),
        "aac" => ("aac", "-y"),
        "alac" => ("alac", "-y"),
        "ogg" => ("libvorbis", "-y"),
        _ => ("copy", "-y"),
    };

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-i").arg(input_path);

    if codec.0 == "copy" {
        // Just change container
        cmd.args(["-c", "copy"]);
    } else {
        cmd.args(["-c:a", codec.0]);
    }

    // Normalize if requested
    if request.normalize {
        cmd.args(["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]);
    }

    // Audio settings
    cmd.args(["-ar", "44100", "-ac", "2"]);
    cmd.arg("-y"); // Overwrite

    cmd.arg(output_path);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Export failed: {}", stderr));
    }

    info!("Stem exported successfully: {}", output_path.display());

    Ok(ExportStemResponse {
        success: true,
        output_path: request.output_path,
    })
}

// ============================================================
// Unit Tests
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_separation_settings_serialization() {
        let settings = SeparationSettings {
            model: "bs_roformer".to_string(),
            device: "cuda".to_string(),
            output_format: "alac".to_string(),
            quality_preset: "standard".to_string(),
            dj_preset: "traktor".to_string(),
        };

        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("bs_roformer"));
        assert!(json.contains("cuda"));

        let deserialized: SeparationSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.model, "bs_roformer");
    }

    #[test]
    fn test_stem_info_serialization() {
        let stem = StemInfo {
            stem_type: "drums".to_string(),
            file_path: Some("/path/to/drums.wav".to_string()),
        };

        let json = serde_json::to_string(&stem).unwrap();
        assert!(json.contains("drums"));
        assert!(json.contains("/path/to/drums.wav"));

        let deserialized: StemInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_type, "drums");
    }

    #[test]
    fn test_stem_path_serialization() {
        let stem = StemPath {
            stem_type: "bass".to_string(),
            path: "/path/to/bass.wav".to_string(),
        };

        let json = serde_json::to_string(&stem).unwrap();
        assert!(json.contains("bass"));

        let deserialized: StemPath = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_type, "bass");
    }

    #[test]
    fn test_pack_stems_request_serialization() {
        let request = PackStemsRequest {
            master_path: "/test/master.wav".to_string(),
            stem_paths: vec![
                StemPath { stem_type: "drums".to_string(), path: "/test/drums.wav".to_string() },
                StemPath { stem_type: "bass".to_string(), path: "/test/bass.wav".to_string() },
            ],
            output_path: "/test/output.stem.mp4".to_string(),
            dj_software: "traktor".to_string(),
            output_format: "alac".to_string(),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("/test/master.wav"));
        assert!(json.contains("/test/output.stem.mp4"));

        let deserialized: PackStemsRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_paths.len(), 2);
    }

    #[test]
    fn test_pack_stems_response_serialization() {
        let response = PackStemsResponse {
            success: true,
            output_path: "/test/output.stem.mp4".to_string(),
            metadata_path: Some("/test/output.metadata.json".to_string()),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("true"));
        assert!(json.contains("output.stem.mp4"));

        let deserialized: PackStemsResponse = serde_json::from_str(&json).unwrap();
        assert!(deserialized.success);
        assert!(deserialized.metadata_path.is_some());
    }

    #[test]
    fn test_export_stem_request_serialization() {
        let request = ExportStemRequest {
            stem_path: "/test/drums.wav".to_string(),
            output_path: "/test/drums.mp3".to_string(),
            format: "mp3".to_string(),
            normalize: true,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("mp3"));
        assert!(json.contains("true")); // normalize

        let deserialized: ExportStemRequest = serde_json::from_str(&json).unwrap();
        assert!(deserialized.normalize);
    }

    #[test]
    fn test_batch_export_request_serialization() {
        let request = BatchExportRequest {
            stem_paths: vec![
                StemPath { stem_type: "drums".to_string(), path: "/drums.wav".to_string() },
                StemPath { stem_type: "bass".to_string(), path: "/bass.wav".to_string() },
            ],
            output_dir: "/output".to_string(),
            format: "flac".to_string(),
            normalize: false,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("/output"));
        assert!(json.contains("flac"));

        let deserialized: BatchExportRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_paths.len(), 2);
    }

    #[test]
    fn test_batch_export_response_serialization() {
        let response = BatchExportResponse {
            success: true,
            exported_files: vec![
                "/output/drums.flac".to_string(),
                "/output/bass.flac".to_string(),
            ],
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("drums.flac"));
        assert!(json.contains("bass.flac"));

        let deserialized: BatchExportResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.exported_files.len(), 2);
    }

    #[test]
    fn test_separation_response_serialization() {
        let response = SeparationResponse {
            success: true,
            stems: vec![
                StemInfo { stem_type: "drums".to_string(), file_path: Some("/drums.wav".to_string()) },
            ],
            output_dir: "/stems/track".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("drums"));

        let deserialized: SeparationResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stems.len(), 1);
    }

    #[test]
    fn test_stem_info_without_file_path() {
        let stem = StemInfo {
            stem_type: "vocals".to_string(),
            file_path: None,
        };

        let json = serde_json::to_string(&stem).unwrap();
        let deserialized: StemInfo = serde_json::from_str(&json).unwrap();
        assert!(deserialized.file_path.is_none());
    }
}

/// Batch export multiple stems
#[tauri::command]
pub async fn batch_export_stems(
    request: BatchExportRequest,
) -> Result<BatchExportResponse, String> {
    info!(
        "Batch exporting {} stems to {}",
        request.stem_paths.len(),
        request.output_dir
    );

    // Ensure output directory exists
    let output_dir = Path::new(&request.output_dir);
    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let mut exported_files = Vec::new();

    for stem in &request.stem_paths {
        let input_path = Path::new(&stem.path);
        let stem_name = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("stem");
        let output_path = output_dir.join(format!("{}.{}", stem_name, request.format));

        let export_request = ExportStemRequest {
            stem_path: stem.path.clone(),
            output_path: output_path.to_string_lossy().to_string(),
            format: request.format.clone(),
            normalize: request.normalize,
        };

        match export_stem(export_request).await {
            Ok(response) => {
                exported_files.push(response.output_path);
            }
            Err(e) => {
                error!("Failed to export {}: {}", stem.path, e);
            }
        }
    }

    Ok(BatchExportResponse {
        success: !exported_files.is_empty(),
        exported_files,
    })
}
