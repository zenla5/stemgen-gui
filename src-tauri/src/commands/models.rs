//! Model download manager
//! 
//! Handles downloading AI models from HuggingFace.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Window};
use tokio::fs;
use tracing::{debug, error, info, warn};

/// Model information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub quality: String,
    pub speed: String,
    pub gpu_required: bool,
    pub size_mb: Option<u64>,
}

/// Download progress event
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub status: String,
    pub progress: f32,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

/// Model download manager
pub struct ModelDownloader {
    cache_dir: PathBuf,
    hf_token: Option<String>,
}

impl ModelDownloader {
    /// Create a new model downloader
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            hf_token: None,
        }
    }

    /// Set HuggingFace token for private models
    pub fn with_token(mut self, token: String) -> Self {
        self.hf_token = Some(token);
        self
    }

    /// Get the models directory
    pub fn models_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Check if a model is already downloaded
    pub fn is_downloaded(&self, model_id: &str) -> bool {
        let model_path = self.cache_dir.join(model_id);
        model_path.exists() && model_path.is_dir()
    }

    /// Get the path to a downloaded model
    pub fn get_model_path(&self, model_id: &str) -> PathBuf {
        self.cache_dir.join(model_id)
    }

    /// Download a model from HuggingFace
    pub async fn download(
        &self,
        model_id: &str,
        window: &Window,
    ) -> Result<PathBuf> {
        info!("Downloading model: {}", model_id);
        
        let model_path = self.cache_dir.join(model_id);
        
        // Ensure directory exists
        fs::create_dir_all(&model_path).await
            .context("Failed to create model directory")?;
        
        // Emit download start event
        window.emit("model-download-progress", DownloadProgress {
            model_id: model_id.to_string(),
            status: "starting".to_string(),
            progress: 0.0,
            downloaded_mb: 0.0,
            total_mb: 0.0,
        }).ok();
        
        // Build HuggingFace URL
        let url = format!(
            "https://huggingface.co/{}/resolve/main/sep_transformer.pt",
            model_id
        );
        
        // Download the model file
        let response = self.download_file(&url, &model_path.join("sep_transformer.pt"), window, model_id).await?;
        
        if !response {
            // Try alternative filenames
            let alt_urls = vec![
                format!("https://huggingface.co/{}/raw/main/ 模型.pt", model_id),
                format!("https://huggingface.co/{}/resolve/main/model.pt", model_id),
            ];
            
            for url in alt_urls {
                if self.download_file(&url, &model_path.join("model.pt"), window, model_id).await? {
                    break;
                }
            }
        }
        
        // Emit completion event
        window.emit("model-download-progress", DownloadProgress {
            model_id: model_id.to_string(),
            status: "complete".to_string(),
            progress: 100.0,
            downloaded_mb: 0.0,
            total_mb: 0.0,
        }).ok();
        
        info!("Model downloaded successfully: {}", model_path.display());
        Ok(model_path)
    }

    /// Download a file with progress tracking
    async fn download_file(
        &self,
        url: &str,
        dest: &Path,
        window: &Window,
        model_id: &str,
    ) -> Result<bool> {
        // Use curl for downloading with progress
        let mut cmd = std::process::Command::new("curl");
        cmd.args([
            "-L",
            "-o", dest.to_str().unwrap(),
            "-w", "%{http_code}",
            "--progress-bar",
        ]);
        
        // Add auth header if token is set
        if let Some(ref token) = self.hf_token {
            cmd.args(["-H", &format!("Authorization: Bearer {}", token)]);
        }
        
        cmd.arg(url);
        
        debug!("Downloading from: {}", url);
        
        let output = cmd.output().context("Failed to execute curl")?;
        
        if output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Try to extract total size from curl output
            // For now, just emit a simple completion
            window.emit("model-download-progress", DownloadProgress {
                model_id: model_id.to_string(),
                status: "downloading".to_string(),
                progress: 100.0,
                downloaded_mb: 0.0,
                total_mb: 0.0,
            }).ok();
            
            Ok(true)
        } else {
            warn!("Download failed for: {}", url);
            Ok(false)
        }
    }

    /// Delete a downloaded model
    pub async fn delete(&self, model_id: &str) -> Result<()> {
        let model_path = self.cache_dir.join(model_id);
        
        if model_path.exists() {
            fs::remove_dir_all(&model_path).await
                .context("Failed to delete model")?;
            info!("Deleted model: {}", model_id);
        }
        
        Ok(())
    }

    /// List downloaded models
    pub async fn list_downloaded(&self) -> Result<Vec<String>> {
        let mut models = Vec::new();
        
        if !self.cache_dir.exists() {
            return Ok(models);
        }
        
        let mut entries = fs::read_dir(&self.cache_dir).await
            .context("Failed to read models directory")?;
        
        while let Some(entry) = entries.next_entry().await
            .context("Failed to read directory entry")? 
        {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    models.push(name.to_string());
                }
            }
        }
        
        Ok(models)
    }
}

/// Get available models from demucs
pub fn get_available_models() -> Vec<ModelInfo> {
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
