//! NI Stem metadata
//!
//! Defines the metadata structure for NI stem files.

use serde::{Deserialize, Serialize};

use super::provenance::StemProvenance;

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
            Self::Other => (0xFF, 0xE6, 0x6D),  // Yellow
            Self::Vocals => (0x95, 0xE1, 0xD3), // Mint green
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
    /// Separation provenance metadata (None for legacy stem files)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance: Option<StemProvenance>,
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
            provenance: None,
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
            provenance: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stem_type_names() {
        assert_eq!(StemType::Drums.name(), "Drums");
        assert_eq!(StemType::Bass.name(), "Bass");
        assert_eq!(StemType::Other.name(), "Other");
        assert_eq!(StemType::Vocals.name(), "Vocals");
    }

    #[test]
    fn test_stem_type_colors() {
        assert_eq!(StemType::Drums.color_hex(), "#FF6B6B");
        assert_eq!(StemType::Bass.color_hex(), "#4ECDC4");
        assert_eq!(StemType::Other.color_hex(), "#FFE66D");
        assert_eq!(StemType::Vocals.color_hex(), "#95E1D3");
    }

    #[test]
    fn test_stem_type_rgb() {
        assert_eq!(StemType::Drums.color_rgb(), (0xFF, 0x6B, 0x6B));
        assert_eq!(StemType::Bass.color_rgb(), (0x4E, 0xCD, 0xC4));
        assert_eq!(StemType::Other.color_rgb(), (0xFF, 0xE6, 0x6D));
        assert_eq!(StemType::Vocals.color_rgb(), (0x95, 0xE1, 0xD3));
    }

    #[test]
    fn test_metadata_creation() {
        let stems = vec![
            StemData {
                name: "Drums".to_string(),
                color: "#FF6B6B".to_string(),
                file_path: "drums.m4a".to_string(),
            },
            StemData {
                name: "Bass".to_string(),
                color: "#4ECDC4".to_string(),
                file_path: "bass.m4a".to_string(),
            },
        ];

        let master = MasterData {
            name: "Master".to_string(),
            file_path: "master.m4a".to_string(),
        };

        let metadata = NIStemMetadata::new(stems, master);

        assert_eq!(metadata.version, "1.0");
        assert_eq!(metadata.stems.len(), 2);
        assert_eq!(metadata.master.name, "Master");
    }

    #[test]
    fn test_metadata_serialization() {
        let metadata = NIStemMetadata::default();

        let json = metadata.to_json_bytes().unwrap();
        assert!(!json.is_empty());

        let deserialized = NIStemMetadata::from_json_bytes(&json).unwrap();
        assert_eq!(deserialized.version, metadata.version);
        assert_eq!(deserialized.stems.len(), metadata.stems.len());
    }

    #[test]
    fn test_metadata_default() {
        let metadata = NIStemMetadata::default();

        assert_eq!(metadata.version, "1.0");
        assert_eq!(metadata.stems.len(), 4);
        assert_eq!(metadata.master.name, "Master");
    }

    #[test]
    fn test_track_info_serialization() {
        let track = TrackInfo {
            title: Some("Test Song".to_string()),
            artist: Some("Test Artist".to_string()),
            album: Some("Test Album".to_string()),
            year: Some(2024),
            genre: Some("Electronic".to_string()),
            bpm: Some(128.0),
            key: Some("Am".to_string()),
            duration: Some(180.5),
            cover_art: None,
        };

        let json = serde_json::to_string(&track).unwrap();
        assert!(json.contains("Test Song"));
        assert!(json.contains("128"));
    }

    #[test]
    fn test_metadata_with_provenance_roundtrip() {
        let prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.2.0".to_string(),
            "2026-04-01T10:00:00Z".to_string(),
            "/music/track.mp3".to_string(),
            "hash123".to_string(),
            180.0,
            44100,
            "job_1".to_string(),
        );

        let stems = vec![StemData {
            name: "Vocals".to_string(),
            color: "#95E1D3".to_string(),
            file_path: "vocals.m4a".to_string(),
        }];
        let master = MasterData {
            name: "Master".to_string(),
            file_path: "master.m4a".to_string(),
        };

        let mut metadata = NIStemMetadata::new(stems, master);
        metadata.provenance = Some(prov);

        let json = metadata.to_json_bytes().unwrap();
        let deserialized = NIStemMetadata::from_json_bytes(&json).unwrap();

        assert!(deserialized.provenance.is_some());
        let prov_out = deserialized.provenance.unwrap();
        assert_eq!(prov_out.separation_model, "bs_roformer");
        assert_eq!(prov_out.job_id, "job_1");
    }

    #[test]
    fn test_metadata_without_provenance_roundtrip() {
        let metadata = NIStemMetadata::default();

        let json = serde_json::to_string(&metadata).unwrap();
        // provenance is None, should not appear in JSON
        assert!(!json.contains("provenance"));

        // Round-trip without provenance key (backward compat)
        let deserialized: NIStemMetadata = serde_json::from_str(&json).unwrap();
        assert!(deserialized.provenance.is_none());
    }

    #[test]
    fn test_metadata_backward_compat_old_json_without_provenance() {
        let old_json = r#"{
            "version": "1.0",
            "application": { "name": "Stemgen-GUI", "version": "1.0.0", "build": "Rust" },
            "stems": [],
            "master": { "name": "Master", "file_path": "master.m4a" }
        }"#;

        let metadata: NIStemMetadata = serde_json::from_str(old_json).unwrap();
        assert_eq!(metadata.version, "1.0");
        assert!(metadata.provenance.is_none());
        assert!(metadata.track.is_none());
    }
}
