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
        match *self {
            Self::Traktor => "alac",  // Native Instruments prefers ALAC
            Self::Rekordbox => "aac", // Pioneer uses AAC
            Self::Serato => "aac",    // Serato uses AAC
            Self::Mixxx => "alac",    // Mixxx supports both
            Self::Djay => "aac",      // Algoriddim uses AAC
            Self::VirtualDJ => "aac", // Atomix uses AAC
        }
    }

    /// Get the file extension for encoded stems
    pub fn file_extension(&self) -> &'static str {
        ".m4a"
    }

    /// Parse from string
    #[allow(clippy::should_implement_trait)]
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
    Alac, // Lossless, Apple
    Aac,  // Compressed, Universal
}

impl OutputFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Alac => "m4a",
            Self::Aac => "m4a",
        }
    }

    pub fn codec_name(&self) -> &'static str {
        match *self {
            Self::Alac => "alac",
            Self::Aac => "aac",
        }
    }
}

/// Quality preset
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QualityPreset {
    Draft,    // Fast, lower quality
    Standard, // Balanced
    Master,   // Slow, highest quality
}

impl QualityPreset {
    /// Get bitrate for AAC encoding
    pub fn aac_bitrate(&self) -> u32 {
        match *self {
            Self::Draft => 128,
            Self::Standard => 256,
            Self::Master => 320,
        }
    }

    /// Get model to use for this quality
    pub fn model(&self) -> &'static str {
        match *self {
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
#[must_use]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_djsoftware_stem_order_traktor() {
        let order = DJSoftware::Traktor.stem_order();
        assert_eq!(order.len(), 4);
        assert_eq!(order[0], StemType::Drums);
        assert_eq!(order[1], StemType::Bass);
        assert_eq!(order[2], StemType::Other);
        assert_eq!(order[3], StemType::Vocals);
    }

    #[test]
    fn test_djsoftware_stem_order_serato() {
        let order = DJSoftware::Serato.stem_order();
        assert_eq!(order.len(), 4);
        // Serato has different order: vocals first
        assert_eq!(order[0], StemType::Vocals);
        assert_eq!(order[1], StemType::Drums);
        assert_eq!(order[2], StemType::Bass);
        assert_eq!(order[3], StemType::Other);
    }

    #[test]
    fn test_djsoftware_stem_order_rekordbox() {
        let order = DJSoftware::Rekordbox.stem_order();
        // Rekordbox uses same order as Traktor
        assert_eq!(order[0], StemType::Drums);
    }

    #[test]
    fn test_djsoftware_from_str() {
        assert_eq!(DJSoftware::from_str("traktor"), Some(DJSoftware::Traktor));
        assert_eq!(
            DJSoftware::from_str("rekordbox"),
            Some(DJSoftware::Rekordbox)
        );
        assert_eq!(DJSoftware::from_str("serato"), Some(DJSoftware::Serato));
        assert_eq!(DJSoftware::from_str("TRASKTRO"), None); // Invalid
    }

    #[test]
    fn test_output_format_codec() {
        assert_eq!(OutputFormat::Alac.codec_name(), "alac");
        assert_eq!(OutputFormat::Aac.codec_name(), "aac");
    }

    #[test]
    fn test_quality_preset_bitrate() {
        assert_eq!(QualityPreset::Draft.aac_bitrate(), 128);
        assert_eq!(QualityPreset::Standard.aac_bitrate(), 256);
        assert_eq!(QualityPreset::Master.aac_bitrate(), 320);
    }

    #[test]
    fn test_quality_preset_model() {
        assert_eq!(QualityPreset::Draft.model(), "demucs");
        assert_eq!(QualityPreset::Standard.model(), "bs_roformer");
        assert_eq!(QualityPreset::Master.model(), "htdemucs_ft");
    }

    #[test]
    fn test_export_settings_default() {
        let settings = ExportSettings::default();
        assert_eq!(settings.dj_software, DJSoftware::Traktor);
        assert_eq!(settings.output_format, OutputFormat::Alac);
        assert_eq!(settings.quality, QualityPreset::Standard);
        assert!(settings.custom_colors);
    }

    #[test]
    fn test_all_dj_software_count() {
        let software = all_dj_software();
        assert_eq!(software.len(), 6);
    }
}
