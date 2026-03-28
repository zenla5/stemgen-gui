//! Stem provenance metadata
//!
//! Defines the provenance structure for embedding separation metadata
//! into stem files. Includes schema_version for forward/backward compatibility.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;
use tracing::{debug, info};

/// Schema version for the provenance structure.
/// Bumped when fields are added/removed to enable migration handling.
pub const PROVENANCE_SCHEMA_VERSION: u8 = 1;

/// Errors that can occur when loading or saving provenance metadata.
#[derive(Error, Debug)]
pub enum ProvenanceError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("No provenance metadata found for: {0}")]
    NotFound(String),
}

impl ProvenanceError {
    /// Returns true if this error indicates the provenance file was not found.
    pub fn is_not_found(&self) -> bool {
        matches!(self, ProvenanceError::NotFound(_))
    }
}

/// User notes sidecar file extension.
const USER_NOTES_EXTENSION: &str = "notes.json";

/// User notes structure stored in sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserNotes {
    pub stem_path: String,
    pub notes: String,
    pub updated_at: String,
}

/// Stem provenance metadata
///
/// Embedded in .stem.mp4 files as a freeform MP4 atom (`----:com.stemgen:PROV`)
/// AND written as a sidecar JSON file (`.prov.json`). Never modifies audio data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemProvenance {
    /// Schema version (always 1 for this structure)
    pub schema_version: u8,

    /// AI model used for separation (e.g., "bs_roformer", "htdemucs", "htdemucs_ft", "demucs")
    pub separation_model: String,

    /// Model version / checkpoint hash (optional — may be unknown for older models)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,

    /// stemgen library version used for separation (from Python sidecar)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stemgen_version: Option<String>,

    /// stemgen-gui application version that triggered the job
    pub stemgen_gui_version: String,

    /// ISO 8601 UTC timestamp when separation was performed
    pub separation_timestamp: String,

    /// Original source file path (may differ from current location on disk)
    pub source_path: String,

    /// SHA-256 content hash of the source file at separation time.
    /// Used to detect if the source was later modified.
    pub source_content_hash: String,

    /// Duration of source file in seconds
    pub source_duration_secs: f64,

    /// Sample rate of source file in Hz (e.g., 44100, 48000)
    pub source_sample_rate: u32,

    /// Quality preset used (e.g., "draft", "standard", "master")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub separation_quality_preset: Option<String>,

    /// Custom separation parameters (e.g., shifts, overlap settings).
    /// Stored as raw JSON for flexibility.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub separation_params: Option<serde_json::Value>,

    /// Unique job identifier (UUID or timestamp-based)
    pub job_id: String,

    /// Batch identifier if multiple files were processed together
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,

    /// Freeform user notes (editable via GUI)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_notes: Option<String>,

    /// Stem type this file represents (if individual stem, otherwise None for .stem.mp4)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem_type: Option<String>,
}

impl StemProvenance {
    /// Create a new provenance record with the current schema version.
    ///
    /// # Arguments
    ///
    /// * `separation_model` - AI model name (e.g., "bs_roformer")
    /// * `stemgen_gui_version` - Version of stemgen-gui app
    /// * `separation_timestamp` - ISO 8601 UTC timestamp
    /// * `source_path` - Path to source audio file
    /// * `source_content_hash` - SHA-256 hash of source file
    /// * `source_duration_secs` - Duration of source in seconds
    /// * `source_sample_rate` - Sample rate of source in Hz
    /// * `job_id` - Unique job identifier
    ///
    /// # Returns
    ///
    /// A new `StemProvenance` with `schema_version = 1` and all optional fields set to `None`.
    #[must_use]
    pub fn new(
        separation_model: String,
        stemgen_gui_version: String,
        separation_timestamp: String,
        source_path: String,
        source_content_hash: String,
        source_duration_secs: f64,
        source_sample_rate: u32,
        job_id: String,
    ) -> Self {
        Self {
            schema_version: PROVENANCE_SCHEMA_VERSION,
            separation_model,
            model_version: None,
            stemgen_version: None,
            stemgen_gui_version,
            separation_timestamp,
            source_path,
            source_content_hash,
            source_duration_secs,
            source_sample_rate,
            separation_quality_preset: None,
            separation_params: None,
            job_id,
            batch_id: None,
            user_notes: None,
            stem_type: None,
        }
    }

    /// Serialize to JSON bytes
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails (should not happen for valid structs).
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        serde_json::to_vec(self)
    }

    /// Serialize to a pretty-printed JSON string
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails.
    pub fn to_json_string(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserialize from JSON bytes
    ///
    /// # Errors
    ///
    /// Returns an error if the bytes are not valid JSON or do not match the structure.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        serde_json::from_slice(bytes)
    }

    /// Deserialize from a JSON string
    ///
    /// # Errors
    ///
    /// Returns an error if the string is not valid JSON or does not match the structure.
    pub fn from_json_str(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    /// Check if this provenance record is from a given schema version.
    #[must_use]
    pub fn is_schema_version(&self, version: u8) -> bool {
        self.schema_version == version
    }

    /// Get the sidecar file path for a given stem file path.
    ///
    /// For example: `/path/to/track.stem.mp4` → `/path/to/track.stem.mp4.prov.json`
    #[must_use]
    pub fn sidecar_path(stem_path: &Path) -> PathBuf {
        PathBuf::from(format!("{}.prov.json", stem_path.display()))
    }

    /// Get the user notes sidecar file path for a given stem file path.
    ///
    /// For example: `/path/to/track.stem.mp4` → `/path/to/track.stem.mp4.notes.json`
    #[must_use]
    pub fn notes_sidecar_path(stem_path: &Path) -> PathBuf {
        PathBuf::from(format!("{}.{}", stem_path.display(), USER_NOTES_EXTENSION))
    }

    /// Load provenance metadata from the sidecar file for a given stem path.
    ///
    /// Returns `Ok(None)` if the sidecar file does not exist.
    ///
    /// # Errors
    ///
    /// Returns an error if the sidecar file exists but cannot be parsed.
    pub fn load_from_sidecar(stem_path: &Path) -> Result<Option<Self>, ProvenanceError> {
        let sidecar_path = Self::sidecar_path(stem_path);

        if !sidecar_path.exists() {
            debug!("Provenance sidecar not found: {}", sidecar_path.display());
            return Ok(None);
        }

        info!("Loading provenance from: {}", sidecar_path.display());
        let content = std::fs::read_to_string(&sidecar_path)?;
        let provenance: StemProvenance = serde_json::from_str(&content)?;

        debug!(
            "Loaded provenance for model '{}' (job {})",
            provenance.separation_model, provenance.job_id
        );

        Ok(Some(provenance))
    }

    /// Save provenance metadata to the sidecar file.
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be written.
    pub fn save_to_sidecar(&self, stem_path: &Path) -> Result<PathBuf, ProvenanceError> {
        let sidecar_path = Self::sidecar_path(stem_path);

        // Ensure parent directory exists
        if let Some(parent) = sidecar_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&sidecar_path, content)?;

        info!("Provenance saved to: {}", sidecar_path.display());
        Ok(sidecar_path)
    }

    /// Get the source hash field.
    /// This is an alias for `source_content_hash` for convenience.
    #[must_use]
    pub fn source_hash(&self) -> &str {
        &self.source_content_hash
    }
}

// =============================================================================
// Standalone functions for use by other modules
// =============================================================================

/// Load provenance from a sidecar file (standalone function).
pub fn load_stem_provenance_sidecar(stem_path: &Path) -> Result<Option<StemProvenance>, ProvenanceError> {
    StemProvenance::load_from_sidecar(stem_path)
}

/// Save provenance to a sidecar file (standalone function).
pub fn save_stem_provenance_sidecar(
    stem_path: &Path,
    provenance: &StemProvenance,
) -> Result<PathBuf, ProvenanceError> {
    provenance.save_to_sidecar(stem_path)
}

/// Save user notes to a sidecar file (non-destructive write).
///
/// This writes only to a `.notes.json` sidecar file and does not modify
/// the audio data or provenance metadata.
pub fn save_stem_user_notes(stem_path: &Path, notes: &str) -> Result<PathBuf, ProvenanceError> {
    let notes_path = StemProvenance::notes_sidecar_path(stem_path);

    // Ensure parent directory exists
    if let Some(parent) = notes_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let notes_data = UserNotes {
        stem_path: stem_path.to_string_lossy().to_string(),
        notes: notes.to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    let content = serde_json::to_string_pretty(&notes_data)?;
    std::fs::write(&notes_path, content)?;

    info!("User notes saved to: {}", notes_path.display());
    Ok(notes_path)
}

/// Load user notes from a sidecar file.
pub fn load_stem_user_notes(stem_path: &Path) -> Result<Option<String>, ProvenanceError> {
    let notes_path = StemProvenance::notes_sidecar_path(stem_path);

    if !notes_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&notes_path)?;
    let notes_data: UserNotes = serde_json::from_str(&content)?;

    Ok(Some(notes_data.notes))
}

impl Default for StemProvenance {
    fn default() -> Self {
        Self {
            schema_version: PROVENANCE_SCHEMA_VERSION,
            separation_model: String::new(),
            model_version: None,
            stemgen_version: None,
            stemgen_gui_version: String::new(),
            separation_timestamp: String::new(),
            source_path: String::new(),
            source_content_hash: String::new(),
            source_duration_secs: 0.0,
            source_sample_rate: 44100,
            separation_quality_preset: None,
            separation_params: None,
            job_id: String::new(),
            batch_id: None,
            user_notes: None,
            stem_type: None,
        }
    }
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provenance_schema_version_is_one() {
        let prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/music/track.mp3".to_string(),
            "abc123def456".to_string(),
            180.5,
            44100,
            "job_123".to_string(),
        );
        assert_eq!(prov.schema_version, 1);
        assert!(prov.is_schema_version(1));
        assert!(!prov.is_schema_version(2));
    }

    #[test]
    fn test_provenance_creation_all_required_fields() {
        let prov = StemProvenance::new(
            "htdemucs_ft".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T14:30:00Z".to_string(),
            "/music/song.flac".to_string(),
            "deadbeef1234".to_string(),
            240.0,
            48000,
            "job_456".to_string(),
        );

        assert_eq!(prov.separation_model, "htdemucs_ft");
        assert_eq!(prov.stemgen_gui_version, "1.0.9");
        assert_eq!(prov.separation_timestamp, "2026-03-28T14:30:00Z");
        assert_eq!(prov.source_path, "/music/song.flac");
        assert_eq!(prov.source_content_hash, "deadbeef1234");
        assert_eq!(prov.source_duration_secs, 240.0);
        assert_eq!(prov.source_sample_rate, 48000);
        assert_eq!(prov.job_id, "job_456");

        // All optional fields should be None
        assert!(prov.model_version.is_none());
        assert!(prov.stemgen_version.is_none());
        assert!(prov.separation_quality_preset.is_none());
        assert!(prov.separation_params.is_none());
        assert!(prov.batch_id.is_none());
        assert!(prov.user_notes.is_none());
        assert!(prov.stem_type.is_none());
    }

    #[test]
    fn test_provenance_serialization_roundtrip() {
        let mut prov = StemProvenance::new(
            "demucs".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T10:00:00Z".to_string(),
            "/audio/track.wav".to_string(),
            "hash123".to_string(),
            60.0,
            44100,
            "job_789".to_string(),
        );
        prov.model_version = Some("v1.2.0".to_string());
        prov.stemgen_version = Some("0.5.0".to_string());
        prov.separation_quality_preset = Some("standard".to_string());
        prov.batch_id = Some("batch_001".to_string());
        prov.user_notes = Some("Test separation".to_string());
        prov.stem_type = Some("drums".to_string());

        let json = prov.to_json_bytes().unwrap();
        let deserialized = StemProvenance::from_json_bytes(&json).unwrap();

        assert_eq!(deserialized.schema_version, prov.schema_version);
        assert_eq!(deserialized.separation_model, prov.separation_model);
        assert_eq!(deserialized.model_version, prov.model_version);
        assert_eq!(deserialized.stemgen_version, prov.stemgen_version);
        assert_eq!(deserialized.separation_quality_preset, prov.separation_quality_preset);
        assert_eq!(deserialized.batch_id, prov.batch_id);
        assert_eq!(deserialized.user_notes, prov.user_notes);
        assert_eq!(deserialized.stem_type, prov.stem_type);
        assert_eq!(deserialized.source_content_hash, prov.source_content_hash);
    }

    #[test]
    fn test_provenance_pretty_json() {
        let prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/path/to/file.mp3".to_string(),
            "sha256hash".to_string(),
            180.0,
            44100,
            "job_test".to_string(),
        );

        let pretty = prov.to_json_string().unwrap();
        // Pretty JSON should contain newlines and indentation
        assert!(pretty.contains('\n'));
        assert!(pretty.contains("  \"schema_version\": 1"));
    }

    #[test]
    fn test_provenance_json_str_deserialization() {
        let json = r#"{
            "schema_version": 1,
            "separation_model": "htdemucs",
            "model_version": "v2.0",
            "stemgen_gui_version": "1.0.9",
            "separation_timestamp": "2026-03-28T15:00:00Z",
            "source_path": "/music/test.flac",
            "source_content_hash": "sha256_test",
            "source_duration_secs": 120.5,
            "source_sample_rate": 44100,
            "separation_quality_preset": "draft",
            "separation_params": {"shifts": 5, "overlap": 0.25},
            "job_id": "job_abc",
            "batch_id": null,
            "user_notes": null,
            "stem_type": null
        }"#;

        let prov = StemProvenance::from_json_str(json).unwrap();
        assert_eq!(prov.schema_version, 1);
        assert_eq!(prov.separation_model, "htdemucs");
        assert_eq!(prov.model_version, Some("v2.0".to_string()));
        assert_eq!(prov.separation_quality_preset, Some("draft".to_string()));
        assert!(prov.separation_params.is_some());
        assert_eq!(prov.batch_id, None);
        assert_eq!(prov.user_notes, None);
    }

    #[test]
    fn test_provenance_minimal_deserialization() {
        // Minimal valid provenance with only required fields
        let json = r#"{
            "schema_version": 1,
            "separation_model": "bs_roformer",
            "stemgen_gui_version": "1.0.9",
            "separation_timestamp": "2026-03-28T12:00:00Z",
            "source_path": "/audio/track.mp3",
            "source_content_hash": "abc123",
            "source_duration_secs": 60.0,
            "source_sample_rate": 44100,
            "job_id": "job_001"
        }"#;

        let prov = StemProvenance::from_json_str(json).unwrap();
        assert_eq!(prov.schema_version, 1);
        assert_eq!(prov.separation_model, "bs_roformer");
        assert!(prov.model_version.is_none());
        assert!(prov.batch_id.is_none());
    }

    #[test]
    fn test_provenance_sidecar_path() {
        let stem_path = Path::new("/music/track.stem.mp4");
        let sidecar = StemProvenance::sidecar_path(stem_path);
        assert_eq!(
            sidecar.to_string_lossy(),
            "/music/track.stem.mp4.prov.json"
        );

        let stem_path2 = Path::new("C:\\Users\\Music\\track.stem.mp4");
        let sidecar2 = StemProvenance::sidecar_path(stem_path2);
        assert_eq!(
            sidecar2.to_string_lossy(),
            "C:\\Users\\Music\\track.stem.mp4.prov.json"
        );
    }

    #[test]
    fn test_provenance_default() {
        let prov = StemProvenance::default();
        assert_eq!(prov.schema_version, PROVENANCE_SCHEMA_VERSION);
        assert!(prov.separation_model.is_empty());
        assert_eq!(prov.source_sample_rate, 44100);
        assert_eq!(prov.source_duration_secs, 0.0);
        assert!(prov.model_version.is_none());
        assert!(prov.separation_params.is_none());
    }

    #[test]
    fn test_provenance_skips_none_fields() {
        // When serializing, fields set to None should not appear in JSON
        let prov = StemProvenance::new(
            "demucs".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/path.mp3".to_string(),
            "hash".to_string(),
            100.0,
            44100,
            "job_1".to_string(),
        );

        let json = prov.to_json_string().unwrap();
        assert!(!json.contains("model_version"));
        assert!(!json.contains("user_notes"));
        assert!(!json.contains("batch_id"));
        assert!(!json.contains("stem_type"));
        // serde pretty-printer uses a space after the colon
        assert!(json.contains("\"separation_model\": \"demucs\""));
    }

    #[test]
    fn test_provenance_separation_params_json_value() {
        let mut prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/path.mp3".to_string(),
            "hash".to_string(),
            100.0,
            44100,
            "job_1".to_string(),
        );

        prov.separation_params = Some(serde_json::json!({
            "shifts": 10,
            "overlap": 0.5,
            "segment": null,
            "float32": true
        }));

        let json = prov.to_json_string().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let params = parsed.get("separation_params").unwrap();
        assert_eq!(params["shifts"], 10);
        assert_eq!(params["overlap"], 0.5);
        assert!(params["float32"].as_bool().unwrap_or(false));
    }

    #[test]
    fn test_provenance_invalid_json_returns_error() {
        let invalid_json = "{ not valid json }";
        let result = StemProvenance::from_json_str(invalid_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_provenance_unicode_paths() {
        let prov = StemProvenance::new(
            "htdemucs".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/music/日本語/トラック.flac".to_string(),
            "unicode_hash_äöü".to_string(),
            180.0,
            44100,
            "job_unicode".to_string(),
        );

        let json = prov.to_json_string().unwrap();
        let deserialized = StemProvenance::from_json_str(&json).unwrap();
        assert_eq!(deserialized.source_path, "/music/日本語/トラック.flac");
        assert_eq!(deserialized.source_content_hash, "unicode_hash_äöü");
    }

    #[test]
    fn test_provenance_long_job_id() {
        // UUID-style job IDs should work fine
        let uuid_job = "550e8400-e29b-41d4-a716-446655440000";
        let prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/path.mp3".to_string(),
            "hash".to_string(),
            60.0,
            44100,
            uuid_job.to_string(),
        );

        let json = prov.to_json_string().unwrap();
        let deserialized = StemProvenance::from_json_str(&json).unwrap();
        assert_eq!(deserialized.job_id, uuid_job);
    }

    #[test]
    fn test_provenance_source_hash_alias() {
        let prov = StemProvenance::new(
            "bs_roformer".to_string(),
            "1.0.9".to_string(),
            "2026-03-28T12:00:00Z".to_string(),
            "/path.mp3".to_string(),
            "test_hash_value".to_string(),
            60.0,
            44100,
            "job_1".to_string(),
        );

        assert_eq!(prov.source_hash(), "test_hash_value");
        assert_eq!(prov.source_hash(), prov.source_content_hash);
    }
}
