use crate::audio::waveform::WaveformPoint;
use crate::audio::{hash_file, AudioDecoder, AudioResampler, TARGET_SAMPLE_RATE};
use crate::commands::models::{get_available_models, ModelInfo};
use crate::commands::sidecar::SidecarManager;
use crate::stems::provenance::StemProvenance;
use crate::stems::{DJSoftware, OutputFormat, StemPacker, StemType};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{error, info, warn};

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

/// Provenance fields that the frontend provides when packing stems.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProvenanceFields {
    /// AI model used (e.g., "bs_roformer", "htdemucs")
    pub separation_model: String,
    /// Model version / checkpoint hash (optional)
    #[serde(default)]
    pub model_version: Option<String>,
    /// stemgen library version from Python sidecar (optional)
    #[serde(default)]
    pub stemgen_version: Option<String>,
    /// Quality preset used (optional, e.g., "standard")
    #[serde(default)]
    pub separation_quality_preset: Option<String>,
    /// Custom separation parameters as JSON (optional)
    #[serde(default)]
    pub separation_params: Option<serde_json::Value>,
    /// Batch identifier (optional)
    #[serde(default)]
    pub batch_id: Option<String>,
}

impl Default for ProvenanceFields {
    fn default() -> Self {
        Self {
            separation_model: String::new(),
            model_version: None,
            stemgen_version: None,
            separation_quality_preset: None,
            separation_params: None,
            batch_id: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackStemsWithProvenanceRequest {
    pub master_path: String,
    pub stem_paths: Vec<StemPath>,
    pub output_path: String,
    pub dj_software: String,
    pub output_format: String,
    /// Provenance metadata fields
    pub provenance: ProvenanceFields,
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
    /// Path to the provenance sidecar file (if provenance was written)
    pub provenance_path: Option<String>,
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
        let sidecar =
            SidecarManager::new(state.sidecar_path.clone(), state.output_dir.clone());
        *sidecar_guard = Some(sidecar);
    }

    let sidecar = sidecar_guard.as_mut().ok_or("Sidecar not initialized")?;
    let source = Path::new(&source_path);

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

    let mut decoder = AudioDecoder::new();
    let samples = decoder.decode(path).map_err(|e| e.to_string())?;

    let mut resampler = AudioResampler::new_44100();
    let samples = if samples.sample_rate != TARGET_SAMPLE_RATE {
        resampler.resample(&samples).map_err(|e| e.to_string())?
    } else {
        samples
    };

    let points = points_per_second.unwrap_or(100);
    let waveform = samples.generate_waveform(points);

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

/// Pack multiple audio files into a .stem.mp4 file (legacy, no provenance)
#[tauri::command]
pub async fn pack_stems(request: PackStemsRequest) -> Result<PackStemsResponse, String> {
    info!("Packing stems to: {}", request.output_path);

    let dj_software = DJSoftware::from_str(&request.dj_software)
        .ok_or_else(|| format!("Unknown DJ software: {}", request.dj_software))?;

    let output_format = match request.output_format.to_lowercase().as_str() {
        "alac" => OutputFormat::Alac,
        _ => OutputFormat::Aac,
    };

    let settings = crate::stems::ExportSettings {
        dj_software,
        output_format,
        quality: crate::stems::QualityPreset::Standard,
        custom_colors: true,
    };

    let packer = StemPacker::new(settings);

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

    packer
        .pack(&master_path, &stem_paths, &output_path)
        .await
        .map_err(|e| e.to_string())?;

    Ok(PackStemsResponse {
        success: true,
        output_path: request.output_path.clone(),
        metadata_path: Some(format!("{}.metadata.json", request.output_path)),
        provenance_path: None,
    })
}

/// Pack multiple audio files into a .stem.mp4 file with full provenance metadata.
///
/// This is the preferred entry point for new separation workflows.
/// It writes provenance to a `.prov.json` sidecar file for library management.
#[tauri::command]
pub async fn pack_stems_with_provenance(
    request: PackStemsWithProvenanceRequest,
) -> Result<PackStemsResponse, String> {
    info!(
        "Packing stems with provenance to: {} (model: {})",
        request.output_path, request.provenance.separation_model
    );

    let dj_software = DJSoftware::from_str(&request.dj_software)
        .ok_or_else(|| format!("Unknown DJ software: {}", request.dj_software))?;

    let output_format = match request.output_format.to_lowercase().as_str() {
        "alac" => OutputFormat::Alac,
        _ => OutputFormat::Aac,
    };

    let settings = crate::stems::ExportSettings {
        dj_software,
        output_format,
        quality: crate::stems::QualityPreset::Standard,
        custom_colors: true,
    };

    let packer = StemPacker::new(settings);

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

    // Compute source file hash and audio properties
    let source_hash = hash_file(&master_path).map_err(|e| {
        warn!("Failed to hash source file: {}", e);
        format!("Failed to hash source file: {}", e)
    }).unwrap_or_else(|_| {
        warn!("Using placeholder hash for source file");
        String::from("unknown")
    });

    // Get audio properties from decoder
    let (source_duration_secs, source_sample_rate) = match AudioDecoder::new().decode(&master_path) {
        Ok(samples) => {
            let duration = if samples.sample_rate > 0 {
                samples.samples.len() as f64 / samples.sample_rate as f64
            } else {
                0.0
            };
            (duration, samples.sample_rate)
        }
        Err(e) => {
            warn!("Failed to read source audio properties: {}", e);
            (0.0, 44100)
        }
    };

    // Generate job ID if not provided
    let job_id = format!(
        "job_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    // Build provenance record
    let provenance = StemProvenance::new(
        request.provenance.separation_model,
        env!("CARGO_PKG_VERSION").to_string(),
        chrono::Utc::now().to_rfc3339(),
        master_path.to_string_lossy().to_string(),
        source_hash,
        source_duration_secs,
        source_sample_rate,
        job_id,
    );

    // Override with frontend-provided values
    let mut prov = provenance;
    prov.model_version = request.provenance.model_version;
    prov.stemgen_version = request.provenance.stemgen_version;
    prov.separation_quality_preset = request.provenance.separation_quality_preset;
    prov.separation_params = request.provenance.separation_params;
    prov.batch_id = request.provenance.batch_id;

    // Pack stems and write provenance sidecar
    let prov_path = packer
        .pack_with_provenance(&master_path, &stem_paths, &output_path, &prov)
        .await
        .map_err(|e| e.to_string())?;

    info!(
        "Successfully packed stems with provenance: {}",
        output_path.display()
    );

    Ok(PackStemsResponse {
        success: true,
        output_path: request.output_path.clone(),
        metadata_path: Some(format!("{}.metadata.json", request.output_path)),
        provenance_path: Some(prov_path.to_string_lossy().to_string()),
    })
}

/// Export a single stem to a different audio format
#[tauri::command]
pub async fn export_stem(request: ExportStemRequest) -> Result<ExportStemResponse, String> {
    info!(
        "Exporting stem: {} -> {}",
        request.stem_path, request.output_path
    );

    let input_path = Path::new(&request.stem_path);
    let output_path = Path::new(&request.output_path);

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

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
        cmd.args(["-c", "copy"]);
    } else {
        cmd.args(["-c:a", codec.0]);
    }

    if request.normalize {
        cmd.args(["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]);
    }

    cmd.args(["-ar", "44100", "-ac", "2"]);
    cmd.arg("-y");
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
        let out_path = output_dir.join(format!("{}.{}", stem_name, request.format));

        let export_request = ExportStemRequest {
            stem_path: stem.path.clone(),
            output_path: out_path.to_string_lossy().to_string(),
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

// =============================================================================
// Unit Tests
// =============================================================================
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
                StemPath {
                    stem_type: "drums".to_string(),
                    path: "/test/drums.wav".to_string(),
                },
                StemPath {
                    stem_type: "bass".to_string(),
                    path: "/test/bass.wav".to_string(),
                },
            ],
            output_path: "/test/output.stem.mp4".to_string(),
            dj_software: "traktor".to_string(),
            output_format: "alac".to_string(),
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("/test/master.wav"));
        let deserialized: PackStemsRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_paths.len(), 2);
    }

    #[test]
    fn test_pack_stems_response_serialization() {
        let response = PackStemsResponse {
            success: true,
            output_path: "/test/output.stem.mp4".to_string(),
            metadata_path: Some("/test/output.metadata.json".to_string()),
            provenance_path: Some("/test/output.prov.json".to_string()),
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("true"));
        let deserialized: PackStemsResponse = serde_json::from_str(&json).unwrap();
        assert!(deserialized.success);
        assert!(deserialized.metadata_path.is_some());
        assert!(deserialized.provenance_path.is_some());
    }

    #[test]
    fn test_provenance_fields_default() {
        let fields = ProvenanceFields::default();
        assert!(fields.separation_model.is_empty());
        assert!(fields.model_version.is_none());
        assert!(fields.stemgen_version.is_none());
        assert!(fields.separation_quality_preset.is_none());
        assert!(fields.separation_params.is_none());
        assert!(fields.batch_id.is_none());
    }

    #[test]
    fn test_provenance_fields_roundtrip() {
        let fields = ProvenanceFields {
            separation_model: "bs_roformer".to_string(),
            model_version: Some("v1.0".to_string()),
            stemgen_version: Some("0.5.0".to_string()),
            separation_quality_preset: Some("standard".to_string()),
            separation_params: Some(serde_json::json!({"shifts": 10})),
            batch_id: Some("batch_001".to_string()),
        };
        let json = serde_json::to_string(&fields).unwrap();
        let deserialized: ProvenanceFields = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.separation_model, "bs_roformer");
        assert_eq!(deserialized.model_version, Some("v1.0".to_string()));
        assert_eq!(deserialized.batch_id, Some("batch_001".to_string()));
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
        let deserialized: ExportStemRequest = serde_json::from_str(&json).unwrap();
        assert!(deserialized.normalize);
    }

    #[test]
    fn test_batch_export_request_serialization() {
        let request = BatchExportRequest {
            stem_paths: vec![
                StemPath {
                    stem_type: "drums".to_string(),
                    path: "/drums.wav".to_string(),
                },
            ],
            output_dir: "/output".to_string(),
            format: "flac".to_string(),
            normalize: false,
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("/output"));
        let deserialized: BatchExportRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_paths.len(), 1);
    }

    #[test]
    fn test_batch_export_response_serialization() {
        let response = BatchExportResponse {
            success: true,
            exported_files: vec!["/output/drums.flac".to_string()],
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("drums.flac"));
        let deserialized: BatchExportResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.exported_files.len(), 1);
    }

    #[test]
    fn test_separation_response_serialization() {
        let response = SeparationResponse {
            success: true,
            stems: vec![StemInfo {
                stem_type: "drums".to_string(),
                file_path: Some("/drums.wav".to_string()),
            }],
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
