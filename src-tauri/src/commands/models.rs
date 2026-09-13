//! Model information and management
//!
//! Handles AI model metadata and download for stem separation.

use reqwest;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
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
    /// Numeric quality rank (higher = better, 0 if unknown)
    pub quality_rank: u8,
    /// ISO 8601 release date, e.g. "2024-11-01"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub released_at: Option<String>,
    /// URL to release notes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changelog_url: Option<String>,
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
    /// Human-readable progress message (e.g. current file being downloaded).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Error detail when `status == "error"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Per-model availability + installed-version status for the AI Models panel.
///
/// `revision` / `last_modified` describe the locally installed copy (short HF
/// commit hash + `YYYY-MM-DD`). `update_available` / `upstream_last_modified`
/// are filled by the on-demand update check (None when unknown or offline).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub id: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Per-model upstream update status returned by `check_model_updates`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUpdate {
    pub id: String,
    /// true when a loaded file's sha256 differs upstream; false when verified
    /// identical; None when unknown (offline / not installed / no upstream).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_available: Option<bool>,
    /// Upstream repo last-modified date (informational only — never triggers
    /// an update by itself).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_last_modified: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// demucs / HuggingFace download URL for each model ID.
///
/// Only models available as single downloadable files are supported.
/// htdemucs_ft and demucs are multi-file model bags — install via `pip install demucs` instead.
/// bs_roformer upstream repo (zenla5) is no longer publicly accessible.
fn model_download_url(model_id: &str) -> Option<String> {
    match model_id {
        "htdemucs" => Some(
            "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th"
                .to_string(),
        ),
        // Multi-file model bags or unavailable repos — download via sidecar instead
        "demucs" | "htdemucs_ft" | "bs_roformer" => None,
        _ => None,
    }
}

/// Returns whether a model should be downloaded via the Python sidecar
/// rather than a direct HTTP pull.
fn requires_sidecar_download(model_id: &str) -> bool {
    matches!(model_id, "htdemucs_ft" | "bs_roformer" | "demucs")
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

/// Path of the checksum sidecar written next to a direct `.onnx` download.
fn direct_model_sidecar_path(models_dir: &std::path::Path, model_id: &str) -> std::path::PathBuf {
    models_dir.join(format!("{model_id}.onnx.sha256"))
}

/// Read a direct `.onnx` download's version info from its checksum sidecar.
///
/// Direct HTTP downloads live in the app models dir, not the HuggingFace
/// cache, so their "version" is the sha256 of the downloaded file plus the
/// download date (issue #265). Returns `None` when no sidecar exists (e.g. a
/// legacy download) — the caller still reports the model as available.
fn read_direct_model_status(models_dir: &std::path::Path, model_id: &str) -> Option<ModelStatus> {
    let raw = std::fs::read_to_string(direct_model_sidecar_path(models_dir, model_id)).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let sha256 = parsed.get("sha256").and_then(|v| v.as_str()).unwrap_or("");
    let mut status = ModelStatus {
        id: model_id.to_string(),
        available: false,
        revision: None,
        last_modified: None,
        update_available: None,
        upstream_last_modified: None,
        error: None,
    };
    if sha256.len() >= 8 {
        status.revision = Some(sha256[..8].to_string());
    }
    if let Some(downloaded_at) = parsed.get("downloaded_at").and_then(|v| v.as_str()) {
        status.last_modified = downloaded_at.get(..10).map(|s| s.to_string());
    }
    Some(status)
}

/// Merge direct `.onnx` downloads in the app models dir into the sidecar's
/// HF-cache status so availability always agrees between the panel and the
/// footer indicator (issue #265).
fn merge_direct_download_status(statuses: Vec<ModelStatus>) -> Vec<ModelStatus> {
    merge_direct_download_status_in(&crate::commands::probe::get_models_dir(), statuses)
}

/// `merge_direct_download_status` against an explicit models dir (testable).
fn merge_direct_download_status_in(
    models_dir: &std::path::Path,
    statuses: Vec<ModelStatus>,
) -> Vec<ModelStatus> {
    let mut statuses = statuses;
    for model in get_available_models() {
        if model_download_url(&model.id).is_none() {
            continue;
        }
        let model_file = models_dir.join(format!("{}.onnx", model.id));
        if !model_file.exists() {
            continue;
        }
        let direct = read_direct_model_status(models_dir, &model.id);
        if let Some(s) = statuses.iter_mut().find(|s| s.id == model.id) {
            // Already available via the HF cache — keep the cache detail but
            // never report a direct install as missing.
            if !s.available {
                s.available = true;
                s.revision = direct
                    .as_ref()
                    .and_then(|d| d.revision.clone())
                    .or_else(|| s.revision.clone());
                s.last_modified = direct
                    .as_ref()
                    .and_then(|d| d.last_modified.clone())
                    .or_else(|| s.last_modified.clone());
            }
        } else {
            statuses.push(direct.unwrap_or(ModelStatus {
                id: model.id,
                available: true,
                revision: None,
                last_modified: None,
                update_available: None,
                upstream_last_modified: None,
                error: None,
            }));
        }
    }
    statuses
}

/// Ensure every known model id appears in the status list (the sidecar only
/// reports demucs-family models), preserving `get_available_models()` order.
fn ensure_known_models(statuses: Vec<ModelStatus>) -> Vec<ModelStatus> {
    let mut by_id: std::collections::HashMap<String, ModelStatus> =
        statuses.into_iter().map(|s| (s.id.clone(), s)).collect();
    get_available_models()
        .into_iter()
        .map(|m| {
            by_id.remove(&m.id).unwrap_or(ModelStatus {
                id: m.id,
                available: false,
                revision: None,
                last_modified: None,
                update_available: None,
                upstream_last_modified: None,
                error: None,
            })
        })
        .collect()
}

/// Run the sidecar's `--list-models` mode and parse per-model status.
async fn sidecar_list_models() -> Result<Vec<ModelStatus>, String> {
    use super::probe::{find_python, get_data_dir, NoWindow, PythonEnv};

    let python = find_python().ok_or("Python not found — cannot list downloaded models")?;
    let sidecar = get_data_dir().join("stemgen_sidecar.py");
    if !sidecar.exists() {
        return Err(format!(
            "Sidecar script not found at '{}'. Open Settings → System Status → Repair Installation.",
            sidecar.display()
        ));
    }

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::process::Command::new(&python)
            .args([sidecar.to_str().unwrap(), "--list-models"])
            .python_env()
            .no_window()
            .output(),
    )
    .await
    .map_err(|_| "list-models timed out after 30s".to_string())?
    .map_err(|e| format!("Failed to run sidecar list-models: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse sidecar list-models output: {e}"))?;

    Ok(parsed
        .into_iter()
        .map(|item| ModelStatus {
            id: item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            available: item
                .get("available")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            revision: item
                .get("revision")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            last_modified: item
                .get("last_modified")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            update_available: None,
            upstream_last_modified: None,
            error: None,
        })
        .collect())
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
            quality_rank: 4,
            released_at: None,
            changelog_url: None,
        },
        ModelInfo {
            id: "htdemucs".to_string(),
            name: "HTDemucs".to_string(),
            description: "High quality, slower. Good all-around performer.".to_string(),
            quality: "high".to_string(),
            speed: "slow".to_string(),
            gpu_required: true,
            size_mb: Some(1040),
            quality_rank: 2,
            released_at: None,
            changelog_url: None,
        },
        ModelInfo {
            id: "htdemucs_ft".to_string(),
            name: "HTDemucs FT".to_string(),
            description: "Highest quality, slowest. Fine-tuned for best results.".to_string(),
            quality: "highest".to_string(),
            speed: "very_slow".to_string(),
            gpu_required: true,
            size_mb: Some(1040),
            quality_rank: 3,
            released_at: None,
            changelog_url: None,
        },
        ModelInfo {
            id: "demucs".to_string(),
            name: "Demucs".to_string(),
            description: "Medium quality, faster. Good for CPU inference.".to_string(),
            quality: "medium".to_string(),
            speed: "fast".to_string(),
            gpu_required: false,
            size_mb: Some(830),
            quality_rank: 1,
            released_at: None,
            changelog_url: None,
        },
    ]
}

/// Download an AI model from the upstream repository with progress events
///
/// Downloads the full file to memory first, then writes it to disk while
/// emitting progress events. The cancellation flag is checked periodically.
/// Multi-file models (htdemucs_ft, bs_roformer, demucs) are downloaded via the Python sidecar.
#[tauri::command]
pub async fn download_model(model_id: String, app: AppHandle) -> Result<(), String> {
    info!("Starting model download: {}", model_id);

    if requires_sidecar_download(&model_id) {
        return download_model_via_sidecar(model_id, app, false).await;
    }

    let url =
        model_download_url(&model_id).ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let models_dir = crate::commands::probe::get_models_dir();
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
            message: Some("Starting download...".to_string()),
            error: None,
        },
    );

    // Check cancellation before starting the download
    if should_abort() {
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .user_agent(format!("Stemgen-GUI/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Send the download request
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body_excerpt = response
            .text()
            .await
            .map(|b| b.chars().take(200).collect::<String>())
            .unwrap_or_else(|_| "<could not read body>".to_string());
        return Err(format!(
            "Download failed: HTTP {status} for {url}\nResponse: {body_excerpt}"
        ));
    }

    let content_length = response.content_length().unwrap_or(total_bytes);
    let total_mb_actual = content_length as f64 / 1_000_000.0;

    // Stream the download with progress events
    use futures_util::StreamExt;
    let mut downloaded: u64 = 0;
    let mut buffer: Vec<u8> = Vec::with_capacity(content_length as usize);
    let mut stream = response.bytes_stream();
    let mut last_emitted_pct: f64 = -1.0;

    while let Some(chunk) = stream.next().await {
        if should_abort() {
            warn!("Download cancelled by user: {}", model_id);
            let _ = app.emit(
                "model-download-progress",
                DownloadProgressPayload {
                    model_id: model_id.clone(),
                    status: "cancelled".to_string(),
                    progress: 0.0,
                    downloaded_mb: 0.0,
                    total_mb: total_mb_actual,
                    message: None,
                    error: None,
                },
            );
            return Ok(());
        }

        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        downloaded += chunk.len() as u64;
        buffer.extend_from_slice(&chunk);

        let pct = (downloaded as f64 / content_length as f64) * 100.0;
        // Throttle events to every 1 % to avoid flooding the IPC bridge
        if pct - last_emitted_pct >= 1.0 {
            last_emitted_pct = pct;
            let _ = app.emit(
                "model-download-progress",
                DownloadProgressPayload {
                    model_id: model_id.clone(),
                    status: "downloading".to_string(),
                    progress: pct,
                    downloaded_mb: downloaded as f64 / 1_000_000.0,
                    total_mb: total_mb_actual,
                    message: Some(format!(
                        "Downloading... {} MB / {} MB",
                        downloaded as f64 / 1_000_000.0,
                        total_mb_actual
                    )),
                    error: None,
                },
            );
        }
    }

    let all_bytes = buffer;

    let downloaded_mb = all_bytes.len() as f64 / 1_000_000.0;
    let model_file = models_dir.join(format!("{}.onnx", model_id));

    std::fs::write(&model_file, &all_bytes)
        .map_err(|e| format!("Failed to write model file: {}", e))?;

    // Write a checksum sidecar alongside the direct download so the panel can
    // report a version (sha256 prefix + date) and detect the file even though
    // it lives outside the HuggingFace cache (issue #265).
    use sha2::{Digest, Sha256};
    let checksum = hex::encode(Sha256::digest(&all_bytes));
    let sidecar_meta = serde_json::json!({
        "sha256": checksum,
        "size": all_bytes.len(),
        "downloaded_at": chrono::Utc::now().to_rfc3339(),
    });
    let _ = std::fs::write(
        direct_model_sidecar_path(&models_dir, &model_id),
        serde_json::to_string(&sidecar_meta).unwrap_or_default(),
    );

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
            total_mb: total_mb_actual,
            message: Some(format!("{} downloaded", model_id)),
            error: None,
        },
    );

    Ok(())
}

/// Download a model via the Python sidecar (for multi-file model bags).
///
/// The sidecar emits JSON progress lines on stdout (`{"status":"progress",
/// "stage":"downloading","progress":<0..1>,"message":...}`) which we stream
/// to the frontend as `model-download-progress` events, so the UI shows real
/// progress instead of a 0→100 jump. On failure an `error` event is emitted
/// with the sidecar's stderr and the command returns `Err`. When `force` is
/// set the sidecar re-fetches even already-cached files (`--force`), which is
/// the "update" path for demucs-family models.
async fn download_model_via_sidecar(
    model_id: String,
    app: AppHandle,
    force: bool,
) -> Result<(), String> {
    use super::probe::{find_python, get_data_dir, NoWindow, PythonEnv};

    let python = find_python().ok_or("Python not found — cannot download model via sidecar")?;
    let sidecar = get_data_dir().join("stemgen_sidecar.py");
    if !sidecar.exists() {
        return Err(format!(
            "Sidecar script not found at '{}'. Open Settings → System Status → Repair Installation.",
            sidecar.display()
        ));
    }

    reset_abort();

    let total_mb = model_size_mb(&model_id) as f64;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressPayload {
            model_id: model_id.clone(),
            status: "downloading".to_string(),
            progress: 0.0,
            downloaded_mb: 0.0,
            total_mb,
            message: Some("Preparing download...".to_string()),
            error: None,
        },
    );

    let mut cmd = tokio::process::Command::new(&python);
    cmd.args([sidecar.to_str().unwrap(), "--download-model", &model_id]);
    if force {
        cmd.arg("--force");
    }
    let mut child = cmd
        .python_env()
        .no_window()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch sidecar for download: {e}"))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    // Stream the sidecar's stdout line-by-line, forwarding JSON progress.
    let mut stdout_lines = tokio::io::BufReader::new(stdout).lines();
    let mut last_message: Option<String> = None;
    let mut last_progress: f64 = 0.0;
    loop {
        let line = match tokio::time::timeout(
            std::time::Duration::from_secs(30 * 60),
            stdout_lines.next_line(),
        )
        .await
        {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => break,
            Ok(Err(e)) => {
                return Err(format!("Failed to read sidecar download output: {e}"));
            }
            Err(_) => {
                return Err("Model download timed out after 30 minutes".to_string());
            }
        };

        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
            let status = parsed.get("status").and_then(|v| v.as_str()).unwrap_or("");
            if status == "progress" {
                let progress = parsed
                    .get("progress")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let message = parsed
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Downloading...");
                last_progress = progress * 100.0;
                last_message = Some(message.to_string());
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgressPayload {
                        model_id: model_id.clone(),
                        status: "downloading".to_string(),
                        progress: last_progress,
                        downloaded_mb: 0.0,
                        total_mb,
                        message: Some(message.to_string()),
                        error: None,
                    },
                );
            } else if status == "complete" {
                last_message = parsed
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                last_progress = 100.0;
            } else if status == "error" {
                let error = parsed
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown sidecar error");
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgressPayload {
                        model_id: model_id.clone(),
                        status: "error".to_string(),
                        progress: last_progress,
                        downloaded_mb: 0.0,
                        total_mb,
                        message: None,
                        error: Some(error.to_string()),
                    },
                );
                return Err(error.to_string());
            }
        }
    }

    // Collect stderr for diagnostics.
    let mut stderr_buf = Vec::new();
    let mut stderr_reader = tokio::io::BufReader::new(stderr);
    stderr_reader.read_to_end(&mut stderr_buf).await.ok();

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for sidecar download: {e}"))?;
    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr_buf).to_string();
        let _ = app.emit(
            "model-download-progress",
            DownloadProgressPayload {
                model_id: model_id.clone(),
                status: "error".to_string(),
                progress: last_progress,
                downloaded_mb: 0.0,
                total_mb,
                message: None,
                error: Some(stderr.clone()),
            },
        );
        return Err(format!("Model download failed:\n{stderr}"));
    }

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressPayload {
            model_id: model_id.clone(),
            status: "complete".to_string(),
            progress: 100.0,
            downloaded_mb: total_mb,
            total_mb,
            message: last_message.or(Some(format!("{} downloaded", model_id))),
            error: None,
        },
    );

    info!("Model downloaded via sidecar: {}", model_id);
    Ok(())
}

/// Delete a downloaded AI model from the models directory
#[tauri::command]
pub async fn delete_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    info!("Deleting model: {}", model_id);

    // Demucs-family models store their weights in the HuggingFace cache, not
    // the app models dir — route them through the sidecar so the cache entries
    // are actually removed. Direct .onnx downloads live in the app models dir.
    if requires_sidecar_download(&model_id) {
        return delete_model_via_sidecar(model_id, app).await;
    }

    let models_dir = crate::commands::probe::get_models_dir();
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

/// Delete a demucs-family model's weights from the HuggingFace cache via the
/// Python sidecar (`--delete-model`).
async fn delete_model_via_sidecar(model_id: String, _app: tauri::AppHandle) -> Result<(), String> {
    use super::probe::{find_python, get_data_dir, NoWindow, PythonEnv};

    let python = find_python().ok_or("Python not found — cannot delete model via sidecar")?;
    let sidecar = get_data_dir().join("stemgen_sidecar.py");
    if !sidecar.exists() {
        return Err(format!(
            "Sidecar script not found at '{}'. Open Settings → System Status → Repair Installation.",
            sidecar.display()
        ));
    }

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tokio::process::Command::new(&python)
            .args([sidecar.to_str().unwrap(), "--delete-model", &model_id])
            .python_env()
            .no_window()
            .output(),
    )
    .await
    .map_err(|_| "delete-model timed out after 60 s".to_string())?
    .map_err(|e| format!("Failed to run sidecar delete-model: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Model delete failed:\n{stderr}"));
    }

    info!("Model deleted via sidecar: {}", model_id);
    Ok(())
}

/// Cancel an in-progress model download
#[tauri::command]
pub fn cancel_download(model_id: String) -> Result<(), String> {
    info!("Cancelling download for model: {}", model_id);
    set_abort();
    Ok(())
}

/// Check whether a specific model is downloaded and available locally.
///
/// Invokes the Python sidecar with `--check-model <model_id>` and parses the
/// JSON response to determine availability.
#[tauri::command]
pub async fn check_model_downloaded(model_id: String, _app: AppHandle) -> Result<bool, String> {
    use super::probe::{find_python, get_data_dir, NoWindow, PythonEnv};

    let python = find_python().ok_or("Python not found — cannot check model availability")?;
    let sidecar = get_data_dir().join("stemgen_sidecar.py");
    if !sidecar.exists() {
        return Err(format!(
            "Sidecar script not found at '{}'. Open Settings → System Status → Repair Installation.",
            sidecar.display()
        ));
    }

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::process::Command::new(&python)
            .args([sidecar.to_str().unwrap(), "--check-model", &model_id])
            .python_env()
            .no_window()
            .output(),
    )
    .await
    .map_err(|_| "check-model timed out after 30 s".to_string())?
    .map_err(|e| format!("Failed to run sidecar check-model: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse sidecar check-model output: {e}"))?;

    Ok(parsed
        .get("available")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

/// Return per-model availability + installed version for the AI Models panel.
///
/// Availability is resolved cache-only via the sidecar's `--list-models` (HF
/// cache) merged with direct `.onnx` downloads in the app models dir, so the
/// panel always shows the same installed set as the footer indicator.
#[tauri::command]
pub async fn get_model_statuses(_app: AppHandle) -> Result<Vec<ModelStatus>, String> {
    let statuses = merge_direct_download_status(sidecar_list_models().await?);
    Ok(ensure_known_models(statuses))
}

/// List all downloaded models that are available locally.
///
/// Invokes the Python sidecar with `--list-models` (HF cache) merged with
/// direct `.onnx` downloads, and returns the IDs where `"available": true`.
#[tauri::command]
pub async fn list_downloaded_models(_app: AppHandle) -> Result<Vec<String>, String> {
    let statuses = merge_direct_download_status(sidecar_list_models().await?);
    Ok(statuses
        .into_iter()
        .filter(|s| s.available)
        .map(|s| s.id)
        .collect())
}

/// Parse the sidecar's `--update-check` JSON array into `Vec<ModelUpdate>`.
fn parse_model_updates(stdout: &str) -> Result<Vec<ModelUpdate>, String> {
    let parsed: Vec<serde_json::Value> = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse sidecar update-check output: {e}"))?;
    Ok(parsed
        .into_iter()
        .map(|item| ModelUpdate {
            id: item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            update_available: item.get("update_available").and_then(|v| v.as_bool()),
            upstream_last_modified: item
                .get("upstream_last_modified")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        })
        .collect())
}

/// Check each demucs-family model for an upstream update.
///
/// Compares the sha256 of the exact files demucs loads against upstream `main`
/// via the sidecar's `--update-check`. The sidecar fails gracefully per model
/// when offline; a hard sidecar failure (e.g. Python missing) surfaces as an
/// `Err`, which the panel treats as "no update info".
#[tauri::command]
pub async fn check_model_updates(_app: AppHandle) -> Result<Vec<ModelUpdate>, String> {
    use super::probe::{find_python, get_data_dir, NoWindow, PythonEnv};

    let python = find_python().ok_or("Python not found — cannot check model updates")?;
    let sidecar = get_data_dir().join("stemgen_sidecar.py");
    if !sidecar.exists() {
        return Err(format!(
            "Sidecar script not found at '{}'. Open Settings → System Status → Repair Installation.",
            sidecar.display()
        ));
    }

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tokio::process::Command::new(&python)
            .args([sidecar.to_str().unwrap(), "--update-check"])
            .python_env()
            .no_window()
            .output(),
    )
    .await
    .map_err(|_| "update-check timed out after 60s".to_string())?
    .map_err(|e| format!("Failed to run sidecar update-check: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    parse_model_updates(&stdout)
}

/// Re-download an installed model's changed files from upstream.
///
/// Demucs-family models are updated via the sidecar (`--download-model --force`
/// → `snapshot_download(force_download=True)`), which re-fetches the model
/// files. Direct `.onnx` downloads are re-fetched through the same HTTP path
/// as `download_model` and emit `model-download-progress` events.
#[tauri::command]
pub async fn update_model(model_id: String, app: AppHandle) -> Result<(), String> {
    if requires_sidecar_download(&model_id) {
        return download_model_via_sidecar(model_id, app, true).await;
    }
    download_model(model_id, app).await
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
            quality_rank: 4,
            released_at: Some("2024-11-01".to_string()),
            changelog_url: Some("https://example.com/changelog".to_string()),
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("test-model"));
        assert!(json.contains("high"));
        assert!(json.contains("true")); // gpu_required
        assert!(json.contains("\"quality_rank\":4"));
        assert!(json.contains("\"released_at\":\"2024-11-01\""));
        assert!(json.contains("\"changelog_url\":\"https://example.com/changelog\""));
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
            "size_mb": 350,
            "quality_rank": 4
        }"#;

        let model: ModelInfo = serde_json::from_str(json).unwrap();
        assert_eq!(model.id, "bs_roformer");
        assert_eq!(model.quality, "high");
        assert!(model.gpu_required);
        assert_eq!(model.size_mb, Some(350));
        assert_eq!(model.quality_rank, 4);
    }

    #[test]
    fn test_download_progress_payload_serialization() {
        let payload = DownloadProgressPayload {
            model_id: "test-model".to_string(),
            status: "downloading".to_string(),
            progress: 50.0,
            downloaded_mb: 50.0,
            total_mb: 100.0,
            message: Some("Downloading...".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        // Should use camelCase for modelId
        assert!(json.contains("modelId"));
        assert!(json.contains("\"progress\":50"));
        assert!(!json.contains("model_id")); // snake_case not in output
                                             // message serializes; error is skipped when None
        assert!(json.contains("\"message\":\"Downloading...\""));
        assert!(!json.contains("error"));
    }

    #[test]
    fn test_download_progress_payload_error_serializes() {
        let payload = DownloadProgressPayload {
            model_id: "test-model".to_string(),
            status: "error".to_string(),
            progress: 0.0,
            downloaded_mb: 0.0,
            total_mb: 100.0,
            message: None,
            error: Some("Download failed".to_string()),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"status\":\"error\""));
        assert!(json.contains("\"error\":\"Download failed\""));
        assert!(!json.contains("message"));
    }

    #[test]
    fn test_download_progress_payload_omits_none_fields() {
        let payload = DownloadProgressPayload {
            model_id: "test-model".to_string(),
            status: "complete".to_string(),
            progress: 100.0,
            downloaded_mb: 100.0,
            total_mb: 100.0,
            message: None,
            error: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(!json.contains("message"));
        assert!(!json.contains("error"));
    }

    #[test]
    fn test_model_download_url_demucs() {
        // demucs is a multi-file model bag — no direct download URL
        assert!(model_download_url("demucs").is_none());
    }

    #[test]
    fn test_model_download_url_htdemucs() {
        assert!(model_download_url("htdemucs").is_some());
        let url = model_download_url("htdemucs").unwrap();
        assert!(url.contains("dl.fbaipublicfiles.com"));
        assert!(url.contains("hybrid_transformer"));
        assert!(url.ends_with(".th"));
    }

    #[test]
    fn test_model_download_url_htdemucs_ft() {
        // htdemucs_ft is a multi-file model bag — no direct download URL
        assert!(model_download_url("htdemucs_ft").is_none());
    }

    #[test]
    fn test_model_download_url_bs_roformer() {
        // bs_roformer upstream repo is no longer publicly accessible
        assert!(model_download_url("bs_roformer").is_none());
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
        let models_dir = crate::commands::probe::get_models_dir();
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
            assert!(
                model.gpu_required,
                "Model {} should require GPU",
                gpu_model_id
            );
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

    #[test]
    fn test_requires_sidecar_download_for_multi_file_models() {
        assert!(requires_sidecar_download("htdemucs_ft"));
        assert!(requires_sidecar_download("bs_roformer"));
        assert!(requires_sidecar_download("demucs"));
    }

    #[test]
    fn test_direct_download_for_htdemucs() {
        assert!(!requires_sidecar_download("htdemucs"));
        assert!(model_download_url("htdemucs").is_some());
    }

    #[test]
    fn test_model_download_url_returns_none_for_sidecar_models() {
        assert!(model_download_url("htdemucs_ft").is_none());
        assert!(model_download_url("bs_roformer").is_none());
        assert!(model_download_url("demucs").is_none());
    }

    #[test]
    fn test_model_info_quality_rank_is_u8() {
        let models = get_available_models();
        for model in models {
            // quality_rank is u8 — always 0..=255, just verify it's set
            let _ = model.quality_rank;
        }
        // Verify specific quality ranks
        let bs = get_available_models()
            .into_iter()
            .find(|m| m.id == "bs_roformer")
            .unwrap();
        assert_eq!(bs.quality_rank, 4);
        let demucs = get_available_models()
            .into_iter()
            .find(|m| m.id == "demucs")
            .unwrap();
        assert_eq!(demucs.quality_rank, 1);
        let htdemucs = get_available_models()
            .into_iter()
            .find(|m| m.id == "htdemucs")
            .unwrap();
        assert_eq!(htdemucs.quality_rank, 2);
        let htdemucs_ft = get_available_models()
            .into_iter()
            .find(|m| m.id == "htdemucs_ft")
            .unwrap();
        assert_eq!(htdemucs_ft.quality_rank, 3);
    }

    #[test]
    fn test_model_info_serialization_omits_none_optional_fields() {
        let model = ModelInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            description: "desc".to_string(),
            quality: "high".to_string(),
            speed: "fast".to_string(),
            gpu_required: false,
            size_mb: Some(100),
            quality_rank: 2,
            released_at: None,
            changelog_url: None,
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("\"quality_rank\":2"));
        assert!(!json.contains("released_at"));
        assert!(!json.contains("changelog_url"));
    }

    #[test]
    fn test_model_info_round_trip_with_all_fields() {
        let model = ModelInfo {
            id: "full-model".to_string(),
            name: "Full Model".to_string(),
            description: "All fields populated".to_string(),
            quality: "highest".to_string(),
            speed: "slow".to_string(),
            gpu_required: true,
            size_mb: Some(500),
            quality_rank: 5,
            released_at: Some("2025-06-15".to_string()),
            changelog_url: Some("https://example.com/changelog".to_string()),
        };

        let json = serde_json::to_string(&model).unwrap();
        let deserialized: ModelInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "full-model");
        assert_eq!(deserialized.quality_rank, 5);
        assert_eq!(deserialized.released_at, Some("2025-06-15".to_string()));
        assert_eq!(
            deserialized.changelog_url,
            Some("https://example.com/changelog".to_string())
        );
    }

    #[test]
    fn test_model_status_serializes_camel_case() {
        let status = ModelStatus {
            id: "htdemucs".to_string(),
            available: true,
            revision: Some("cbc8a9b1".to_string()),
            last_modified: Some("2026-09-02".to_string()),
            update_available: Some(false),
            upstream_last_modified: Some("2026-09-10".to_string()),
            error: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"lastModified\":\"2026-09-02\""));
        assert!(json.contains("\"updateAvailable\":false"));
        assert!(json.contains("\"upstreamLastModified\":\"2026-09-10\""));
        assert!(!json.contains("last_modified"));
        assert!(!json.contains("update_available"));
    }

    #[test]
    fn test_model_status_serialization_omits_none_fields() {
        let status = ModelStatus {
            id: "bs_roformer".to_string(),
            available: false,
            revision: None,
            last_modified: None,
            update_available: None,
            upstream_last_modified: None,
            error: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("revision"));
        assert!(!json.contains("lastModified"));
        assert!(!json.contains("updateAvailable"));
        assert!(!json.contains("upstreamLastModified"));
        assert!(!json.contains("error"));
    }

    #[test]
    fn test_read_direct_model_status_parses_sidecar() {
        let dir = std::env::temp_dir().join(format!("stemgen-test-sidecar-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let sidecar = direct_model_sidecar_path(&dir, "htdemucs");
        std::fs::write(
            &sidecar,
            r#"{"sha256":"0123456789abcdef","size":100,"downloaded_at":"2026-09-02T10:00:00Z"}"#,
        )
        .unwrap();

        let status = read_direct_model_status(&dir, "htdemucs").unwrap();
        assert_eq!(status.id, "htdemucs");
        assert_eq!(status.revision.as_deref(), Some("01234567"));
        assert_eq!(status.last_modified.as_deref(), Some("2026-09-02"));

        let _ = std::fs::remove_file(&sidecar);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_read_direct_model_status_returns_none_when_missing() {
        let dir = std::env::temp_dir().join(format!(
            "stemgen-test-sidecar-missing-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(read_direct_model_status(&dir, "htdemucs").is_none());
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_merge_direct_download_status_marks_onnx_available() {
        let dir = std::env::temp_dir().join(format!("stemgen-test-merge-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // The sidecar reports htdemucs as NOT in the HF cache.
        let statuses = vec![ModelStatus {
            id: "htdemucs".to_string(),
            available: false,
            revision: None,
            last_modified: None,
            update_available: None,
            upstream_last_modified: None,
            error: None,
        }];
        // A direct .onnx download exists in the models dir.
        std::fs::write(dir.join("htdemucs.onnx"), b"bytes").unwrap();
        std::fs::write(
            direct_model_sidecar_path(&dir, "htdemucs"),
            r#"{"sha256":"deadbeef12345678","size":5,"downloaded_at":"2026-09-02T10:00:00Z"}"#,
        )
        .unwrap();

        let merged = merge_direct_download_status_in(&dir, statuses);
        let htdemucs = merged.iter().find(|s| s.id == "htdemucs").unwrap();
        assert!(htdemucs.available);
        assert_eq!(htdemucs.revision.as_deref(), Some("deadbeef"));
        assert_eq!(htdemucs.last_modified.as_deref(), Some("2026-09-02"));

        for f in ["htdemucs.onnx", "htdemucs.onnx.sha256"] {
            let _ = std::fs::remove_file(dir.join(f));
        }
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_merge_direct_download_status_adds_missing_entry() {
        let dir =
            std::env::temp_dir().join(format!("stemgen-test-merge-add-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("htdemucs.onnx"), b"bytes").unwrap();

        let merged = merge_direct_download_status_in(&dir, Vec::new());
        assert!(merged.iter().any(|s| s.id == "htdemucs" && s.available));

        let _ = std::fs::remove_file(dir.join("htdemucs.onnx"));
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_merge_direct_download_status_keeps_hf_cache_available() {
        // When the HF cache already reports htdemucs available, a stale or
        // missing direct .onnx must not downgrade it.
        let dir =
            std::env::temp_dir().join(format!("stemgen-test-merge-keep-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let statuses = vec![ModelStatus {
            id: "htdemucs".to_string(),
            available: true,
            revision: Some("cbc8a9b1".to_string()),
            last_modified: Some("2026-09-02".to_string()),
            update_available: None,
            upstream_last_modified: None,
            error: None,
        }];
        let merged = merge_direct_download_status_in(&dir, statuses);
        let htdemucs = merged.iter().find(|s| s.id == "htdemucs").unwrap();
        assert!(htdemucs.available);
        assert_eq!(htdemucs.revision.as_deref(), Some("cbc8a9b1"));
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_ensure_known_models_returns_all_models() {
        let statuses = vec![ModelStatus {
            id: "htdemucs".to_string(),
            available: true,
            revision: Some("cbc8a9b1".to_string()),
            last_modified: None,
            update_available: None,
            upstream_last_modified: None,
            error: None,
        }];
        let known = ensure_known_models(statuses);
        assert_eq!(known.len(), 4);
        let ids: Vec<&str> = known.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"bs_roformer"));
        assert!(ids.contains(&"demucs"));
        assert!(ids.contains(&"htdemucs_ft"));
        let bs = known.iter().find(|s| s.id == "bs_roformer").unwrap();
        assert!(!bs.available);
        let htdemucs = known.iter().find(|s| s.id == "htdemucs").unwrap();
        assert!(htdemucs.available);
        // Order matches get_available_models().
        assert_eq!(known.first().map(|s| s.id.as_str()), Some("bs_roformer"));
    }

    #[test]
    fn test_model_update_serializes_camel_case() {
        let update = ModelUpdate {
            id: "htdemucs".to_string(),
            update_available: Some(true),
            upstream_last_modified: Some("2026-08-31".to_string()),
        };
        let json = serde_json::to_string(&update).unwrap();
        assert!(json.contains("\"updateAvailable\":true"));
        assert!(json.contains("\"upstreamLastModified\":\"2026-08-31\""));
        assert!(!json.contains("update_available"));
    }

    #[test]
    fn test_model_update_serialization_omits_none_fields() {
        let update = ModelUpdate {
            id: "htdemucs".to_string(),
            update_available: None,
            upstream_last_modified: None,
        };
        let json = serde_json::to_string(&update).unwrap();
        assert!(!json.contains("updateAvailable"));
        assert!(!json.contains("upstreamLastModified"));
    }

    #[test]
    fn test_parse_model_updates_reads_available_and_date() {
        let stdout = r#"[
            {"id":"htdemucs","update_available":true,"upstream_last_modified":"2026-08-31"},
            {"id":"htdemucs_ft","update_available":false,"upstream_last_modified":"2026-08-31"},
            {"id":"demucs","update_available":null,"error":"offline"}
        ]"#;
        let updates = parse_model_updates(stdout).unwrap();
        assert_eq!(updates.len(), 3);
        let htdemucs = updates.iter().find(|u| u.id == "htdemucs").unwrap();
        assert_eq!(htdemucs.update_available, Some(true));
        assert_eq!(
            htdemucs.upstream_last_modified.as_deref(),
            Some("2026-08-31")
        );
        let offline = updates.iter().find(|u| u.id == "demucs").unwrap();
        assert_eq!(offline.update_available, None);
    }

    #[test]
    fn test_parse_model_updates_handles_invalid_json() {
        assert!(parse_model_updates("not json").is_err());
    }
}
