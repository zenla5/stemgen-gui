//! NI Stem metadata
//! 
//! Defines the metadata structure for NI stem files.

use serde::{Deserialize, Serialize};

/// Stem types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StemType {
    Drums,
    Bass,
    Other,
    Vocals,
}

impl StemType {
    /// Get the default name
    pub fn name(&self) -> &'static str {
        match self {
            Self::Drums => "Drums",
            Self::Bass => "Bass",
            Self::Other => "Other",
            Self::Vocals => "Vocals",
        }
    }

    /// Get the NI-compatible color as RGB
    pub fn color_rgb(&self) -> (u8, u8, u8) {
        match self {
            Self::Drums => (0xFF, 0x6B, 0x6B),  // Red
            Self::Bass => (0x4E, 0xCD, 0xC4),   // Teal
            Self::Other => (0xFF, 0xE6, 0x6D),   // Yellow
            Self::Vocals => (0x95, 0xE1, 0xD3),  // Mint green
        }
    }

    /// Get the NI-compatible color as hex string
    pub fn color_hex(&self) -> String {
        let (r, g, b) = self.color_rgb();
        format!("#{:02X}{:02X}{:02X}", r, g, b)
    }
}

/// Stem information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemInfo {
    pub stem_type: StemType,
    pub name: String,
    pub color: String,
    pub file_path: Option<String>,
}

/// NI Stem metadata JSON structure
/// 
/// This is embedded in the .stem.mp4 file as a custom atom
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NIStemMetadata {
    pub version: String,
    pub application: ApplicationInfo,
    pub stems: Vec<StemData>,
    pub master: MasterData,
    pub track: Option<TrackInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationInfo {
    pub name: String,
    pub version: String,
    pub build: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemData {
    pub name: String,
    pub color: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterData {
    pub name: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub duration: Option<f64>,
    pub cover_art: Option<String>,
}

impl NIStemMetadata {
    /// Create new metadata for NI stems
    pub fn new(stems: Vec<StemData>, master: MasterData) -> Self {
        Self {
            version: "1.0".to_string(),
            application: ApplicationInfo {
                name: "Stemgen-GUI".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                build: "Rust".to_string(),
            },
            stems,
            master,
            track: None,
        }
    }

    /// Serialize to JSON bytes
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        serde_json::to_vec(self)
    }

    /// Deserialize from JSON bytes
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        serde_json::from_slice(bytes)
    }
}

impl Default for NIStemMetadata {
    fn default() -> Self {
        Self {
            version: "1.0".to_string(),
            application: ApplicationInfo {
                name: "Stemgen-GUI".to_string(),
                version: "0.1.0".to_string(),
                build: "Rust".to_string(),
            },
            stems: vec![
                StemData {
                    name: "Drums".to_string(),
                    color: StemType::Drums.color_hex(),
                    file_path: "drums.m4a".to_string(),
                },
                StemData {
                    name: "Bass".to_string(),
                    color: StemType::Bass.color_hex(),
                    file_path: "bass.m4a".to_string(),
                },
                StemData {
                    name: "Other".to_string(),
                    color: StemType::Other.color_hex(),
                    file_path: "other.m4a".to_string(),
                },
                StemData {
                    name: "Vocals".to_string(),
                    color: StemType::Vocals.color_hex(),
                    file_path: "vocals.m4a".to_string(),
                },
            ],
            master: MasterData {
                name: "Master".to_string(),
                file_path: "master.m4a".to_string(),
            },
            track: None,
        }
    }
}
