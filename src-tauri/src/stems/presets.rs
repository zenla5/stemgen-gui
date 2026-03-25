//! DJ Software presets for stem ordering and formatting
//! 
//! Each DJ software has specific requirements for stem format.

use serde::{Deserialize, Serialize};

use super::metadata::StemType;

/// Supported DJ software
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DJSoftware {
    Traktor,
    Rekordbox,
    Serato,
    Mixxx,
    Djay,
    VirtualDJ,
}

impl DJSoftware {
    /// Get display name
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Traktor => "Traktor Pro",
            Self::Rekordbox => "Rekordbox",
            Self::Serato => "Serato DJ",
            Self::Mixxx => "Mixxx",
            Self::Djay => "djay",
            Self::VirtualDJ => "VirtualDJ",
        }
    }

    /// Get the stem ordering for this software
    /// Returns stems in the order they should appear in the .stem.mp4
    pub fn stem_order(&self) -> Vec<StemType> {
        match self {
            // NI Native Instruments order
            Self::Traktor => vec![
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
                StemType::Vocals,
            ],
            // Pioneer order (same as NI)
            Self::Rekordbox => vec![
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
                StemType::Vocals,
            ],
            // Serato order (different!)
            Self::Serato => vec![
                StemType::Vocals,
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
            ],
            // Mixxx order (same as NI)
            Self::Mixxx => vec![
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
                StemType::Vocals,
            ],
            // Algoriddim order (same as NI)
            Self::Djay => vec![
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
                StemType::Vocals,
            ],
            // Atomix order (same as Serato)
            Self::VirtualDJ => vec![
                StemType::Vocals,
                StemType::Drums,
                StemType::Bass,
                StemType::Other,
            ],
        }
    }

    /// Get the recommended audio codec
    pub fn codec(&self) -> &'static str {
        match self {
            Self::Traktor => "alac",      // Native Instruments prefers ALAC
            Self::Rekordbox => "aac",     // Pioneer uses AAC
            Self::Serato => "aac",        // Serato uses AAC
            Self::Mixxx => "alac",        // Mixxx supports both
            Self::Djay => "aac",          // Algoriddim uses AAC
            Self::VirtualDJ => "aac",     // Atomix uses AAC
        }
    }

    /// Get the file extension for encoded stems
    pub fn file_extension(&self) -> &'static str {
        ".m4a"
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "traktor" | "traktor_pro" => Some(Self::Traktor),
            "rekordbox" | "pioneer" => Some(Self::Rekordbox),
            "serato" | "serato_dj" => Some(Self::Serato),
            "mixxx" => Some(Self::Mixxx),
            "djay" | "algoriddim" => Some(Self::Djay),
            "virtualdj" | "virtual_dj" => Some(Self::VirtualDJ),
            _ => None,
        }
    }
}

/// Output format for stems
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputFormat {
    Alac,  // Lossless, Apple
    Aac,   // Compressed, Universal
}

impl OutputFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Alac => "m4a",
            Self::Aac => "m4a",
        }
    }

    pub fn codec_name(&self) -> &'static str {
        match self {
            Self::Alac => "alac",
            Self::Aac => "aac",
        }
    }
}

/// Quality preset
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QualityPreset {
    Draft,    // Fast, lower quality
    Standard,  // Balanced
    Master,    // Slow, highest quality
}

impl QualityPreset {
    /// Get bitrate for AAC encoding
    pub fn aac_bitrate(&self) -> u32 {
        match self {
            Self::Draft => 128,
            Self::Standard => 256,
            Self::Master => 320,
        }
    }

    /// Get model to use for this quality
    pub fn model(&self) -> &'static str {
        match self {
            Self::Draft => "demucs",
            Self::Standard => "bs_roformer",
            Self::Master => "htdemucs_ft",
        }
    }
}

/// Export settings for a DJ software
#[derive(Debug, Clone)]
pub struct ExportSettings {
    pub dj_software: DJSoftware,
    pub output_format: OutputFormat,
    pub quality: QualityPreset,
    pub custom_colors: bool,
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            dj_software: DJSoftware::Traktor,
            output_format: OutputFormat::Alac,
            quality: QualityPreset::Standard,
            custom_colors: true,
        }
    }
}

/// Get all supported DJ software
pub fn all_dj_software() -> Vec<DJSoftware> {
    vec![
        DJSoftware::Traktor,
        DJSoftware::Rekordbox,
        DJSoftware::Serato,
        DJSoftware::Mixxx,
        DJSoftware::Djay,
        DJSoftware::VirtualDJ,
    ]
}
