use crate::audio::waveform::WaveformPoint;
use crate::audio::{hash_file, AudioDecoder, AudioResampler, TARGET_SAMPLE_RATE};
use crate::commands::models::{get_available_models, ModelInfo};
use crate::commands::sidecar::SidecarManager;
use crate::inference_provider;
use crate::stems::metadata::{self, NIStemMetadata};
use crate::stems::provenance::StemProvenance;
use crate::stems::{DJSoftware, OutputFormat, StemPacker, StemType};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tracing::{error, info, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SeparationSettings {
    pub model: String,
    pub device: String,
    pub output_format: String,
    pub quality_preset: String,
    pub dj_preset: String,
    /// Cloud provider name ("fal" or "replicate") — optional for backward compat
    #[serde(default)]
    pub provider: Option<String>,
    /// Replicate model version hash — optional
    #[serde(default)]
    pub replicate_version_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StemInfo {
    pub stem_type: String,
    pub file_path: Option<String>,
}

/// One stem extracted from an existing `.stem.mp4` for mixer preview.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnpackedStem {
    /// Canonical stem type (`drums` | `bass` | `other` | `vocals`)
    pub stem_type: String,
    /// Path to the extracted WAV file
    pub file_path: String,
    /// Display name from NI metadata (when present)
    pub name: Option<String>,
    /// Hex color from NI metadata (when present)
    pub color: Option<String>,
}

/// A single stem's resolved identity (pure, no I/O) used to drive extraction.
#[derive(Debug, Clone)]
struct StemPlan {
    stem_type: String,
    name: Option<String>,
    color: Option<String>,
}

/// Resolve the 4 stem identities for a `.stem.mp4`.
///
/// Stream indices 1-4 map to the NI metadata `stems` array order when present
/// (regardless of the DJ software's ordering), otherwise to the Traktor
/// ordering (1=drums, 2=bass, 3=other, 4=vocals). Custom names/colors from the
/// metadata are preserved; a name that maps to a canonical type is used as the
/// stem type, with the index-based type as a uniqueness/fallback guarantee.
fn resolve_stem_plan(ni_metadata: &Option<NIStemMetadata>) -> Vec<StemPlan> {
    let mut used_types = std::collections::HashSet::new();

    (1..=4)
        .map(|idx| {
            let fallback_type = metadata::stem_type_from_index(idx).to_string();
            let meta_stem = ni_metadata.as_ref().and_then(|m| m.stems.get(idx - 1));

            let name = meta_stem.map(|s| s.name.clone());
            let color = meta_stem.map(|s| s.color.clone());

            let preferred_type = name
                .as_deref()
                .and_then(metadata::stem_type_from_name)
                .map(|t| t.to_string());

            // Prefer a canonical type derived from the name, but fall back to
            // the index type (which is always unique) to avoid duplicates.
            let stem_type = if let Some(t) = &preferred_type {
                if used_types.insert(t.clone()) {
                    t.clone()
                } else {
                    fallback_type.clone()
                }
            } else {
                fallback_type.clone()
            };

            StemPlan {
                stem_type,
                name,
                color,
            }
        })
        .collect()
}

/// Count audio streams in a file using ffprobe (async, non-blocking).
async fn count_audio_streams(path: &Path) -> Result<u32, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().filter(|line| line.contains("audio")).count() as u32)
}

/// Demux a single audio stream (by 1-based index) to a WAV file with ffmpeg.
async fn extract_stream_to_wav(
    input: &Path,
    stream_index: u32,
    output: &Path,
) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-i",
            input.to_str().unwrap_or(""),
            "-map",
            &format!("0:a:{}", stream_index),
            "-c:a",
            "pcm_s16le",
            "-ar",
            "44100",
            "-ac",
            "2",
            output.to_str().unwrap_or(""),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "FFmpeg failed to extract stream {}: {}",
            stream_index,
            stderr.trim()
        ));
    }

    Ok(())
}

/// Read NI metadata from a sidecar JSON file adjacent to the stem pack
/// (mirrors `commands::metadata::read_ni_sidecar_metadata`).
fn read_sidecar_metadata(stem_path: &Path) -> Option<NIStemMetadata> {
    for ext in [".stem.metadata", ".metadata.json"] {
        let metadata_path = stem_path.with_extension(ext.trim_start_matches('.'));
        if metadata_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&metadata_path) {
                if let Ok(metadata) = serde_json::from_str::<NIStemMetadata>(&content) {
                    return Some(metadata);
                }
            }
        }
    }
    None
}

/// Extract the 4 stem streams (indexes 1-4) from an existing `.stem.mp4` into
/// temporary WAV files so they can be previewed in the Stem Mixer without
/// re-running AI separation.
///
/// The WAVs are written idempotently under `~/.local/share/stemgen-gui/stems/
/// unpacked/<stem-pack-basename>/` (re-extraction overwrites them, so repeated
/// drops do not accumulate files). Names/colors are taken from the embedded NI
/// metadata when present. All FFmpeg/ffprobe calls are async (guards #259).
#[tauri::command]
pub async fn unpack_stems(
    path: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<UnpackedStem>, String> {
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !path.to_lowercase().ends_with(".stem.mp4") {
        return Err(format!("Not a .stem.mp4 file: {}", path));
    }

    let track_count = count_audio_streams(path_obj).await?;
    if track_count < 5 {
        return Err(format!(
            "{} is not a valid stem pack (expected a master + 4 stem audio streams, found {})",
            path, track_count
        ));
    }

    // Read NI metadata from the embedded 'nmde' atom (fall back to defaults,
    // then to a sidecar JSON next to the file if one exists).
    let ni_metadata = metadata::read_embedded_ni_metadata(path_obj)
        .unwrap_or(None)
        .or_else(|| read_sidecar_metadata(path_obj));

    let plan = resolve_stem_plan(&ni_metadata);

    let base_name = path_obj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("stem-pack");
    let safe_base = base_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect::<String>();
    let out_dir = state.output_dir.join("unpacked").join(safe_base);

    let mut stems = Vec::with_capacity(plan.len());
    for (i, plan_item) in plan.iter().enumerate() {
        let stream_index = (i + 1) as u32;
        let out_path = out_dir.join(format!("{}.wav", plan_item.stem_type));
        extract_stream_to_wav(path_obj, stream_index, &out_path).await?;
        stems.push(UnpackedStem {
            stem_type: plan_item.stem_type.clone(),
            file_path: out_path.to_string_lossy().to_string(),
            name: plan_item.name.clone(),
            color: plan_item.color.clone(),
        });
    }

    info!(
        "Unpacked {} stems from {} into {}",
        stems.len(),
        path,
        out_dir.display()
    );

    Ok(stems)
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
#[derive(Debug, Default, Serialize, Deserialize, Clone)]
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
    /// Device used for separation (optional, e.g., "cpu", "cuda", "mps")
    #[serde(default)]
    pub device: Option<String>,
    /// DJ preset (optional, e.g., "traktor", "rekordbox")
    #[serde(default)]
    pub dj_preset: Option<String>,
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
    job_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<StemInfo>, String> {
    info!(
        "Starting separation: {} (model: {}, device: {})",
        source_path, settings.model, settings.device
    );

    // Read inference provider config from DB
    let provider_config = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        inference_provider::get_config(&conn)?
    };

    // Determine cloud provider and load API key if needed
    let (device, provider, api_key, version_hash) =
        if provider_config.active_provider != inference_provider::InferenceProvider::Local {
            let provider_name = match provider_config.active_provider {
                inference_provider::InferenceProvider::Fal => "fal",
                inference_provider::InferenceProvider::Replicate => "replicate",
                _ => unreachable!(),
            };

            // Load API key from keychain — never log the key value
            let key = inference_provider::load_api_key(provider_name)?.ok_or_else(|| {
                "No API key configured for this provider — go to Settings → Inference".to_string()
            })?;

            info!("Using cloud provider: {}", provider_name);

            (
                "cloud".to_string(),
                Some(provider_name.to_string()),
                Some(key),
                provider_config.replicate_version_hash.clone(),
            )
        } else {
            (
                settings.device.clone(),
                settings.provider.clone(),
                None,
                settings.replicate_version_hash.clone(),
            )
        };

    // Get or create sidecar manager
    let mut sidecar_guard = state.sidecar.lock().await;

    if sidecar_guard.is_none() {
        let sidecar = SidecarManager::new(state.sidecar_path.clone(), state.output_dir.clone());
        *sidecar_guard = Some(sidecar);
    }

    let sidecar = sidecar_guard.as_mut().ok_or("Sidecar not initialized")?;
    let source = Path::new(&source_path);

    let result = sidecar
        .run_separation(
            job_id,
            source,
            &settings.model,
            &device,
            provider.as_deref(),
            api_key.as_deref(),
            version_hash.as_deref(),
        )
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
pub async fn get_models() -> Result<Vec<ModelInfo>, String> {
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

    // Compute source file hash and audio properties. hash_file and the
    // AudioDecoder are blocking, so run them on a blocking thread rather than
    // stalling the Tokio worker that also delivers IPC/events (guards #259).
    let master_for_analysis = master_path.clone();
    let (source_hash, source_duration_secs, source_sample_rate, source_size_bytes) =
        tokio::task::spawn_blocking(move || -> (String, f64, u32, Option<u64>) {
            let source_hash = hash_file(&master_for_analysis).unwrap_or_else(|e| {
                warn!("Failed to hash source file (using placeholder): {}", e);
                String::from("unknown")
            });

            let (source_duration_secs, source_sample_rate) =
                match AudioDecoder::new().decode(&master_for_analysis) {
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

            let source_size_bytes = std::fs::metadata(&master_for_analysis)
                .ok()
                .map(|m| m.len());

            (
                source_hash,
                source_duration_secs,
                source_sample_rate,
                source_size_bytes,
            )
        })
        .await
        .map_err(|e| format!("Source analysis task failed: {}", e))?;

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
    prov.device = request.provenance.device;
    prov.export_dj_preset = request.provenance.dj_preset;
    prov.export_codec = Some(request.output_format.clone());

    // Derive model family from model ID
    prov.model_family = if prov.separation_model.contains("roformer") {
        Some("roformer".to_string())
    } else if prov.separation_model.contains("demucs") {
        Some("demucs".to_string())
    } else {
        None
    };

    // Look up human-readable model name
    prov.model_name = get_available_models()
        .into_iter()
        .find(|m| m.id == prov.separation_model)
        .map(|m| m.name);

    // Source file metadata
    prov.source_format = master_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    prov.source_size_bytes = source_size_bytes;

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
        .await
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
            provider: None,
            replicate_version_hash: None,
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
            device: Some("cuda".to_string()),
            dj_preset: Some("traktor".to_string()),
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
            stem_paths: vec![StemPath {
                stem_type: "drums".to_string(),
                path: "/drums.wav".to_string(),
            }],
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

    #[test]
    fn test_unpacked_stem_serialization() {
        let stem = UnpackedStem {
            stem_type: "drums".to_string(),
            file_path: "/out/drums.wav".to_string(),
            name: Some("Drums".to_string()),
            color: Some("#FF6B6B".to_string()),
        };
        let json = serde_json::to_string(&stem).unwrap();
        assert!(json.contains("drums"));
        assert!(json.contains("#FF6B6B"));
        let deserialized: UnpackedStem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_type, "drums");
        assert_eq!(deserialized.name, Some("Drums".to_string()));
    }

    #[test]
    fn test_resolve_stem_plan_traktor_order() {
        use crate::stems::metadata::{MasterData, StemData};
        let stems = vec![
            StemData {
                name: "Drums".into(),
                color: "#FF6B6B".into(),
                file_path: "drums.m4a".into(),
            },
            StemData {
                name: "Bass".into(),
                color: "#4ECDC4".into(),
                file_path: "bass.m4a".into(),
            },
            StemData {
                name: "Other".into(),
                color: "#FFE66D".into(),
                file_path: "other.m4a".into(),
            },
            StemData {
                name: "Vocals".into(),
                color: "#95E1D3".into(),
                file_path: "vocals.m4a".into(),
            },
        ];
        let meta = NIStemMetadata::new(
            stems,
            MasterData {
                name: "Master".into(),
                file_path: "master.m4a".into(),
            },
        );

        let plan = resolve_stem_plan(&Some(meta));
        assert_eq!(plan.len(), 4);
        assert_eq!(plan[0].stem_type, "drums");
        assert_eq!(plan[1].stem_type, "bass");
        assert_eq!(plan[2].stem_type, "other");
        assert_eq!(plan[3].stem_type, "vocals");
        assert_eq!(plan[0].name.as_deref(), Some("Drums"));
        assert_eq!(plan[0].color.as_deref(), Some("#FF6B6B"));
    }

    #[test]
    fn test_resolve_stem_plan_serato_order() {
        use crate::stems::metadata::{MasterData, StemData};
        let stems = vec![
            StemData {
                name: "Vocals".into(),
                color: "#95E1D3".into(),
                file_path: "vocals.m4a".into(),
            },
            StemData {
                name: "Drums".into(),
                color: "#FF6B6B".into(),
                file_path: "drums.m4a".into(),
            },
            StemData {
                name: "Bass".into(),
                color: "#4ECDC4".into(),
                file_path: "bass.m4a".into(),
            },
            StemData {
                name: "Other".into(),
                color: "#FFE66D".into(),
                file_path: "other.m4a".into(),
            },
        ];
        let meta = NIStemMetadata::new(
            stems,
            MasterData {
                name: "Master".into(),
                file_path: "master.m4a".into(),
            },
        );

        // Names map to canonical types regardless of order.
        let plan = resolve_stem_plan(&Some(meta));
        assert_eq!(plan[0].stem_type, "vocals");
        assert_eq!(plan[1].stem_type, "drums");
        assert_eq!(plan[2].stem_type, "bass");
        assert_eq!(plan[3].stem_type, "other");
    }

    #[test]
    fn test_resolve_stem_plan_no_metadata_uses_index_order() {
        let plan = resolve_stem_plan(&None);
        assert_eq!(plan.len(), 4);
        assert_eq!(plan[0].stem_type, "drums");
        assert_eq!(plan[1].stem_type, "bass");
        assert_eq!(plan[2].stem_type, "other");
        assert_eq!(plan[3].stem_type, "vocals");
        assert!(plan.iter().all(|p| p.name.is_none() && p.color.is_none()));
    }

    #[test]
    fn test_resolve_stem_plan_handles_duplicate_names() {
        use crate::stems::metadata::{MasterData, StemData};
        let stems = vec![
            StemData {
                name: "Drums".into(),
                color: "#FF6B6B".into(),
                file_path: "a.m4a".into(),
            },
            StemData {
                name: "Drums".into(),
                color: "#111111".into(),
                file_path: "b.m4a".into(),
            },
            StemData {
                name: "Other".into(),
                color: "#FFE66D".into(),
                file_path: "c.m4a".into(),
            },
            StemData {
                name: "Vocals".into(),
                color: "#95E1D3".into(),
                file_path: "d.m4a".into(),
            },
        ];
        let meta = NIStemMetadata::new(
            stems,
            MasterData {
                name: "Master".into(),
                file_path: "master.m4a".into(),
            },
        );

        // A duplicate 'Drums' name must not yield two stem_types; index fallback
        // keeps each of the four types unique.
        let plan = resolve_stem_plan(&Some(meta));
        let mut types: Vec<&str> = plan.iter().map(|p| p.stem_type.as_str()).collect();
        types.sort_unstable();
        assert_eq!(types, vec!["bass", "drums", "other", "vocals"]);
    }

    #[tokio::test]
    async fn test_extract_stream_fails_cleanly_on_bad_input() {
        // A missing input returns a clear error without blocking (async path).
        let err = extract_stream_to_wav(
            Path::new("/nonexistent/stem-pack.mp4"),
            1,
            Path::new("/tmp/stemgen-out-drums.wav"),
        )
        .await;
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn test_count_audio_streams_fails_on_missing_file() {
        let result = count_audio_streams(Path::new("/nonexistent/stem-pack.mp4")).await;
        assert!(result.is_err());
    }
}
