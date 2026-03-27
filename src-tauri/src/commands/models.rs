//! Model information and management
//!
//! Handles AI model metadata for stem separation.

use serde::{Deserialize, Serialize};
use tracing::info;

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

/// Get available models from demucs
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
