//! Staleness detection for stem files.
//!
//! Determines whether a stem file is a candidate for re-separation based on:
//! - Source file has been modified since separation
//! - A newer model version is available
//! - stemgen-gui version is below a configured minimum
//! - Separation parameters differ from current defaults

use crate::audio::verify_hash;
use crate::stems::provenance::StemProvenance;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tracing::{debug, info, warn};

/// Known model version registry.
/// Maps model names to their known version identifiers.
pub type ModelVersionRegistry = HashMap<String, Vec<ModelVersion>>;

/// Information about a known model version.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelVersion {
    /// Model name (e.g., "bs_roformer", "htdemucs")
    pub model: String,
    /// Version identifier (e.g., "v1", "latest", checkpoint hash)
    pub version: String,
    /// Release date in ISO 8601 format (optional)
    pub release_date: Option<String>,
    /// Semantic version string if available (optional)
    pub semver: Option<String>,
    /// Whether this is considered the latest stable version
    pub is_latest: bool,
}

/// Reasons why a stem file is considered stale.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum StalenessReason {
    /// Source file has been modified (hash mismatch)
    SourceModified,
    /// A newer model version is available
    NewerModelVersion { current: String, available: String },
    /// stemgen-gui version is below minimum
    StemgenGuiOutdated { current: String, minimum: String },
    /// Separation parameters differ from current defaults
    ParametersChanged,
    /// Model family doesn't match the preferred family
    PreferredModelFamily {
        current_family: String,
        preferred: String,
    },
    /// Quality rank is below threshold compared to best available model
    QualityRankBelowThreshold { current_rank: u8, best_rank: u8 },
    /// Stem is older than the configured age threshold and a better model exists
    StemTooOld { age_days: u32, threshold: u32 },
}

/// Overall staleness status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum StalenessStatus {
    /// Stem is up to date
    Current,
    /// Stem is a candidate for re-separation
    Stale(Vec<StalenessReason>),
    /// Unable to determine staleness
    Unknown(String),
}

/// Detailed staleness report for a single stem file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StalenessReport {
    /// Path to the stem file
    pub stem_path: String,
    /// Stem file name
    pub stem_name: String,
    /// Source file path from provenance
    pub source_path: Option<String>,
    /// Overall staleness status
    pub status: StalenessStatus,
    /// Detailed reasons (only populated when stale)
    pub reasons: Vec<StalenessReason>,
    /// Whether the source file exists on disk
    pub source_exists: bool,
    /// Whether the source hash matches
    pub source_hash_matches: Option<bool>,
    /// When the stem was created (from provenance)
    pub stem_created_at: Option<String>,
    /// AI model used
    pub separation_model: Option<String>,
    /// Model version used
    pub model_version: Option<String>,
    /// stemgen-gui version used
    pub stemgen_gui_version: Option<String>,
}

/// Staleness detection rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StalenessRules {
    /// Check if source file has been modified
    pub check_source_modified: bool,
    /// Check if a newer model version is available
    pub check_model_outdated: bool,
    /// Minimum acceptable stemgen-gui version
    pub minimum_stemgen_gui_version: Option<String>,
    /// Check if separation parameters differ from current defaults
    pub check_parameters_changed: bool,
    /// Custom separation params considered "default"
    pub default_separation_params: Option<serde_json::Value>,
    /// Preferred model family — flag if the stem was not separated with this family
    pub prefer_model_family: Option<String>,
    /// Flag if the stem's quality rank is below (best_available - threshold)
    pub quality_rank_threshold: Option<u8>,
    /// Flag if the stem is older than N days AND a better model exists
    pub age_days_threshold: Option<u32>,
    /// If true, treat stems with no provenance as staleness candidates
    pub flag_unknown_provenance: bool,
}

impl Default for StalenessRules {
    fn default() -> Self {
        Self {
            check_source_modified: true,
            check_model_outdated: true,
            minimum_stemgen_gui_version: Some("1.0.0".to_string()),
            check_parameters_changed: false,
            default_separation_params: None,
            prefer_model_family: None,
            quality_rank_threshold: None,
            age_days_threshold: None,
            flag_unknown_provenance: false,
        }
    }
}

/// Information about the best available model, used for quality-rank and age checks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BestModelInfo {
    /// Model family of the best available model (e.g., "roformer", "demucs")
    pub model_family: String,
    /// Quality rank of the best available model (higher = better)
    pub quality_rank: u8,
}

/// Check if a specific version string is considered "newer" than another.
///
/// Uses a simple string comparison. For more accurate semver comparison,
/// a dedicated semver crate would be needed.
///
/// Returns `true` if `newer` > `current`.
pub fn is_version_newer(current: &str, newer: &str) -> bool {
    // If current is "latest", nothing is newer
    if current == "latest" {
        return false;
    }

    // If newer is "latest", it's always newer than any version
    if newer == "latest" {
        return true;
    }

    // If they're equal, nothing is newer
    if current == newer {
        return false;
    }

    // Handle "v1" vs "v2" pattern
    let current_stripped = current.strip_prefix('v').unwrap_or(current);
    let newer_stripped = newer.strip_prefix('v').unwrap_or(newer);

    // If both are numeric-like, compare
    if let (Ok(current_num), Ok(newer_num)) = (
        current_stripped.parse::<f64>(),
        newer_stripped.parse::<f64>(),
    ) {
        return newer_num > current_num;
    }

    // Fallback to lexicographic comparison
    newer > current
}

/// Evaluate staleness for a single stem file.
///
/// This function is non-destructive — it only reads files and produces a report.
/// It never modifies any audio data or metadata.
pub fn check_stem_staleness(
    stem_path: &Path,
    rules: &StalenessRules,
    registry: &ModelVersionRegistry,
) -> StalenessReport {
    check_stem_staleness_with_best(stem_path, rules, registry, None)
}

/// Evaluate staleness with optional best-model information for quality/age checks.
pub fn check_stem_staleness_with_best(
    stem_path: &Path,
    rules: &StalenessRules,
    registry: &ModelVersionRegistry,
    best_model: Option<&BestModelInfo>,
) -> StalenessReport {
    let stem_path_str = stem_path.to_string_lossy().to_string();
    let stem_name = stem_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    debug!("Checking staleness for: {}", stem_path_str);

    // Try to load provenance
    let provenance = match StemProvenance::load_from_sidecar(stem_path) {
        Ok(Some(p)) => p,
        Ok(None) => {
            debug!("No provenance sidecar found for: {}", stem_path_str);
            return StalenessReport {
                stem_path: stem_path_str.clone(),
                stem_name,
                source_path: None,
                status: StalenessStatus::Unknown("No provenance metadata found".to_string()),
                reasons: vec![],
                source_exists: false,
                source_hash_matches: None,
                stem_created_at: None,
                separation_model: None,
                model_version: None,
                stemgen_gui_version: None,
            };
        }
        Err(e) => {
            warn!("Failed to load provenance for {}: {}", stem_path_str, e);
            return StalenessReport {
                stem_path: stem_path_str.clone(),
                stem_name,
                source_path: None,
                status: StalenessStatus::Unknown(format!("Error loading provenance: {}", e)),
                reasons: vec![],
                source_exists: false,
                source_hash_matches: None,
                stem_created_at: None,
                separation_model: None,
                model_version: None,
                stemgen_gui_version: None,
            };
        }
    };

    let mut reasons: Vec<StalenessReason> = Vec::new();
    let mut source_exists = false;
    let mut source_hash_matches: Option<bool> = None;

    // Rule 1: Check if source file has been modified
    if rules.check_source_modified {
        let source_path_str = &provenance.source_path;
        let source_path = Path::new(source_path_str);
        source_exists = source_path.exists();

        if source_exists {
            match verify_hash(source_path, &provenance.source_content_hash) {
                Ok(matches) => {
                    source_hash_matches = Some(matches);
                    if !matches {
                        reasons.push(StalenessReason::SourceModified);
                        debug!(
                            "Source modified for {}: {}",
                            stem_path_str,
                            source_path.display()
                        );
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to verify source hash for {}: {}",
                        source_path.display(),
                        e
                    );
                    source_hash_matches = None;
                }
            }
        } else {
            reasons.push(StalenessReason::SourceModified);
            debug!(
                "Source file missing for {}: {}",
                stem_path_str,
                source_path.display()
            );
        }
    }

    // Rule 2: Check if a newer model version is available
    if rules.check_model_outdated {
        if let Some(versions) = registry.get(&provenance.separation_model) {
            let current_version = provenance.model_version.as_deref().unwrap_or("unknown");
            let latest_version = versions
                .iter()
                .find(|v| v.is_latest)
                .or_else(|| versions.iter().max_by_key(|v| &v.version))
                .map(|v| v.version.as_str())
                .unwrap_or("unknown");

            if latest_version != current_version
                && latest_version != "unknown"
                && is_version_newer(current_version, latest_version)
            {
                reasons.push(StalenessReason::NewerModelVersion {
                    current: current_version.to_string(),
                    available: latest_version.to_string(),
                });
                debug!(
                    "Newer model version available for {}: {} -> {}",
                    stem_path_str, current_version, latest_version
                );
            }
        }
    }

    // Rule 3: Check stemgen-gui version
    if let Some(min_version) = &rules.minimum_stemgen_gui_version {
        if is_version_newer(min_version, &provenance.stemgen_gui_version) {
            reasons.push(StalenessReason::StemgenGuiOutdated {
                current: provenance.stemgen_gui_version.clone(),
                minimum: min_version.clone(),
            });
            debug!(
                "stemgen-gui outdated for {}: {} < {}",
                stem_path_str, provenance.stemgen_gui_version, min_version
            );
        }
    }

    // Rule 4: Check separation parameters
    if rules.check_parameters_changed {
        if let Some(ref default_params) = rules.default_separation_params {
            if let Some(ref current_params) = provenance.separation_params {
                if current_params != default_params {
                    reasons.push(StalenessReason::ParametersChanged);
                    debug!("Separation parameters changed for {}", stem_path_str);
                }
            }
        }
    }

    // Rule 5: Check preferred model family
    if let Some(ref preferred) = rules.prefer_model_family {
        if let Some(ref current_family) = provenance.model_family {
            if current_family != preferred {
                reasons.push(StalenessReason::PreferredModelFamily {
                    current_family: current_family.clone(),
                    preferred: preferred.clone(),
                });
                debug!(
                    "Model family mismatch for {}: {} vs preferred {}",
                    stem_path_str, current_family, preferred
                );
            }
        }
    }

    // Rule 6: Check quality rank threshold
    if let (Some(threshold), Some(best)) = (rules.quality_rank_threshold, best_model) {
        // Derive quality rank from separation_model by looking up known models
        let current_rank = derive_quality_rank(&provenance.separation_model);
        if current_rank > 0 && best.quality_rank > current_rank {
            let gap = best.quality_rank - current_rank;
            if gap > threshold {
                reasons.push(StalenessReason::QualityRankBelowThreshold {
                    current_rank,
                    best_rank: best.quality_rank,
                });
                debug!(
                    "Quality rank below threshold for {}: {} vs best {} (gap {} > threshold {})",
                    stem_path_str, current_rank, best.quality_rank, gap, threshold
                );
            }
        }
    }

    // Rule 7: Check age-based staleness
    if let (Some(age_threshold), Some(best)) = (rules.age_days_threshold, best_model) {
        if let Some(age_days) = compute_stem_age_days(&provenance.separation_timestamp) {
            if age_days > age_threshold {
                // Only flag if a better model exists
                let current_rank = derive_quality_rank(&provenance.separation_model);
                if best.quality_rank > current_rank {
                    reasons.push(StalenessReason::StemTooOld {
                        age_days,
                        threshold: age_threshold,
                    });
                    debug!(
                        "Stem too old for {}: {} days > {} days threshold",
                        stem_path_str, age_days, age_threshold
                    );
                }
            }
        }
    }

    let status = if reasons.is_empty() {
        StalenessStatus::Current
    } else {
        StalenessStatus::Stale(reasons.clone())
    };

    info!(
        "Staleness check complete for {}: {:?}",
        stem_path_str, status
    );

    StalenessReport {
        stem_path: stem_path_str,
        stem_name,
        source_path: Some(provenance.source_path.clone()),
        status,
        reasons,
        source_exists,
        source_hash_matches,
        stem_created_at: Some(provenance.separation_timestamp.clone()),
        separation_model: Some(provenance.separation_model.clone()),
        model_version: provenance.model_version.clone(),
        stemgen_gui_version: Some(provenance.stemgen_gui_version.clone()),
    }
}

/// Load the local model version registry from disk.
///
/// Returns an empty registry if the registry file doesn't exist.
pub fn load_registry(registry_path: &Path) -> Result<ModelVersionRegistry, String> {
    if !registry_path.exists() {
        debug!("Registry file not found, returning empty registry");
        return Ok(HashMap::new());
    }

    let content = std::fs::read_to_string(registry_path)
        .map_err(|e| format!("Failed to read registry: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse registry JSON: {}", e))
}

/// Save the model version registry to disk.
pub fn save_registry(registry: &ModelVersionRegistry, registry_path: &Path) -> Result<(), String> {
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;

    // Ensure parent directory exists
    if let Some(parent) = registry_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create registry directory: {}", e))?;
    }

    std::fs::write(registry_path, content)
        .map_err(|e| format!("Failed to write registry: {}", e))?;

    info!("Registry saved to: {}", registry_path.display());
    Ok(())
}

// =============================================================================
// Helper functions for quality-rank and age-based rules
// =============================================================================

/// Derive a quality rank from a model ID string.
///
/// Known model ranks (from models.rs):
/// - bs_roformer: 4
/// - htdemucs_ft: 3
/// - htdemucs: 2
/// - demucs: 1
/// - unknown: 0
fn derive_quality_rank(model_id: &str) -> u8 {
    let lower = model_id.to_lowercase();
    if lower.contains("bs_roformer") || lower.contains("roformer") {
        4
    } else if lower.contains("htdemucs_ft") {
        3
    } else if lower.contains("htdemucs") {
        2
    } else if lower.contains("demucs") {
        1
    } else {
        0
    }
}

/// Compute the age of a stem in days from its separation timestamp.
///
/// Returns `None` if the timestamp cannot be parsed.
fn compute_stem_age_days(separation_timestamp: &str) -> Option<u32> {
    let sep_time = chrono::DateTime::parse_from_rfc3339(separation_timestamp).ok()?;
    let now = chrono::Utc::now();
    let duration = now.signed_duration_since(sep_time);
    if duration.num_seconds() < 0 {
        return Some(0);
    }
    Some(duration.num_days() as u32)
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_version_newer_with_semver() {
        assert!(!is_version_newer("1.0.0", "1.0.0"));
        assert!(is_version_newer("1.0.0", "1.1.0"));
        assert!(is_version_newer("1.0.0", "2.0.0"));
        assert!(is_version_newer("0.9.0", "1.0.0"));
        assert!(!is_version_newer("2.0.0", "1.0.0"));
    }

    #[test]
    fn test_version_newer_with_v_prefix() {
        assert!(is_version_newer("v1.0", "v2.0"));
        assert!(!is_version_newer("v2.0", "v1.0"));
        assert!(is_version_newer("v1", "v2"));
    }

    #[test]
    fn test_version_newer_with_latest() {
        assert!(is_version_newer("v1.0", "latest"));
        assert!(!is_version_newer("latest", "latest"));
        assert!(!is_version_newer("latest", "v2.0"));
    }

    #[test]
    fn test_version_newer_with_checkpoints() {
        // Checkpoint hashes should be compared lexicographically
        assert!(is_version_newer("abc123", "def456"));
    }

    #[test]
    fn test_staleness_report_current() {
        let rules = StalenessRules::default();
        let registry = HashMap::new();

        // With no provenance, it should return Unknown
        let temp_dir = TempDir::new().unwrap();
        let stem_path = temp_dir.path().join("test.stem.mp4");

        let report = check_stem_staleness(&stem_path, &rules, &registry);
        assert!(matches!(report.status, StalenessStatus::Unknown(_)));
    }

    #[test]
    fn test_staleness_rules_default() {
        let rules = StalenessRules::default();
        assert!(rules.check_source_modified);
        assert!(rules.check_model_outdated);
        assert!(rules.minimum_stemgen_gui_version.is_some());
        assert!(!rules.check_parameters_changed);
    }

    #[test]
    fn test_model_version_serialization() {
        let version = ModelVersion {
            model: "bs_roformer".to_string(),
            version: "v1.0".to_string(),
            release_date: Some("2024-01-15".to_string()),
            semver: Some("1.0.0".to_string()),
            is_latest: true,
        };

        let json = serde_json::to_string(&version).unwrap();
        assert!(json.contains("bs_roformer"));
        assert!(json.contains("v1.0"));

        let deserialized: ModelVersion = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.model, "bs_roformer");
        assert!(deserialized.is_latest);
    }

    #[test]
    fn test_staleness_report_serialization() {
        let report = StalenessReport {
            stem_path: "/test/track.stem.mp4".to_string(),
            stem_name: "track.stem.mp4".to_string(),
            source_path: Some("/test/track.mp3".to_string()),
            status: StalenessStatus::Current,
            reasons: vec![],
            source_exists: true,
            source_hash_matches: Some(true),
            stem_created_at: Some("2024-03-28T12:00:00Z".to_string()),
            separation_model: Some("bs_roformer".to_string()),
            model_version: Some("v1.0".to_string()),
            stemgen_gui_version: Some("1.0.10".to_string()),
        };

        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("track.stem.mp4"));
        assert!(json.contains("bs_roformer"));

        let deserialized: StalenessReport = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stem_name, "track.stem.mp4");
    }

    #[test]
    fn test_staleness_status_stale_serialization() {
        let status = StalenessStatus::Stale(vec![
            StalenessReason::SourceModified,
            StalenessReason::NewerModelVersion {
                current: "v1.0".to_string(),
                available: "v2.0".to_string(),
            },
        ]);

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("SourceModified"));
        assert!(json.contains("NewerModelVersion"));

        let deserialized: StalenessStatus = serde_json::from_str(&json).unwrap();
        match deserialized {
            StalenessStatus::Stale(reasons) => {
                assert_eq!(reasons.len(), 2);
            }
            _ => panic!("Expected Stale status"),
        }
    }

    #[test]
    fn test_registry_roundtrip() {
        let mut registry = ModelVersionRegistry::new();
        registry.insert(
            "bs_roformer".to_string(),
            vec![
                ModelVersion {
                    model: "bs_roformer".to_string(),
                    version: "v1.0".to_string(),
                    release_date: Some("2024-01-01".to_string()),
                    semver: Some("1.0.0".to_string()),
                    is_latest: false,
                },
                ModelVersion {
                    model: "bs_roformer".to_string(),
                    version: "latest".to_string(),
                    release_date: Some("2024-03-01".to_string()),
                    semver: Some("1.1.0".to_string()),
                    is_latest: true,
                },
            ],
        );

        let temp_dir = TempDir::new().unwrap();
        let registry_path = temp_dir.path().join("registry.json");

        save_registry(&registry, &registry_path).unwrap();
        let loaded = load_registry(&registry_path).unwrap();

        assert!(loaded.contains_key("bs_roformer"));
        assert_eq!(loaded.get("bs_roformer").unwrap().len(), 2);
    }

    #[test]
    fn test_registry_load_nonexistent_returns_empty() {
        let result = load_registry(Path::new("/nonexistent/path/registry.json"));
        assert!(result.is_ok());
        let registry = result.unwrap();
        assert!(registry.is_empty());
    }

    #[test]
    fn test_staleness_reason_equality() {
        let r1 = StalenessReason::SourceModified;
        let r2 = StalenessReason::SourceModified;
        assert_eq!(r1, r2);

        let r3 = StalenessReason::NewerModelVersion {
            current: "v1".to_string(),
            available: "v2".to_string(),
        };
        let r4 = StalenessReason::NewerModelVersion {
            current: "v1".to_string(),
            available: "v2".to_string(),
        };
        assert_eq!(r3, r4);
    }

    #[test]
    fn test_preferred_model_family_serialization() {
        let reason = StalenessReason::PreferredModelFamily {
            current_family: "demucs".to_string(),
            preferred: "roformer".to_string(),
        };
        let json = serde_json::to_string(&reason).unwrap();
        assert!(json.contains("PreferredModelFamily"));
        assert!(json.contains("demucs"));
        assert!(json.contains("roformer"));

        let deserialized: StalenessReason = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, reason);
    }

    #[test]
    fn test_quality_rank_below_threshold_serialization() {
        let reason = StalenessReason::QualityRankBelowThreshold {
            current_rank: 1,
            best_rank: 4,
        };
        let json = serde_json::to_string(&reason).unwrap();
        assert!(json.contains("QualityRankBelowThreshold"));

        let deserialized: StalenessReason = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, reason);
    }

    #[test]
    fn test_stem_too_old_serialization() {
        let reason = StalenessReason::StemTooOld {
            age_days: 365,
            threshold: 180,
        };
        let json = serde_json::to_string(&reason).unwrap();
        assert!(json.contains("StemTooOld"));

        let deserialized: StalenessReason = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, reason);
    }

    #[test]
    fn test_staleness_rules_default_new_fields() {
        let rules = StalenessRules::default();
        assert!(rules.prefer_model_family.is_none());
        assert!(rules.quality_rank_threshold.is_none());
        assert!(rules.age_days_threshold.is_none());
        assert!(!rules.flag_unknown_provenance);
    }

    #[test]
    fn test_derive_quality_rank() {
        assert_eq!(derive_quality_rank("bs_roformer"), 4);
        assert_eq!(derive_quality_rank("htdemucs_ft"), 3);
        assert_eq!(derive_quality_rank("htdemucs"), 2);
        assert_eq!(derive_quality_rank("demucs"), 1);
        assert_eq!(derive_quality_rank("unknown_model"), 0);
        // Case-insensitive matching
        assert_eq!(derive_quality_rank("BS_RoFormer"), 4);
    }

    #[test]
    fn test_compute_stem_age_days() {
        // A timestamp from 10 days ago should give ~10
        let ten_days_ago = (chrono::Utc::now() - chrono::Duration::days(10)).to_rfc3339();
        let age = compute_stem_age_days(&ten_days_ago);
        assert!(age.is_some());
        let age_val = age.unwrap();
        assert!(age_val == 9 || age_val == 10 || age_val == 11);

        // Future timestamp should return 0
        let future = (chrono::Utc::now() + chrono::Duration::days(5)).to_rfc3339();
        assert_eq!(compute_stem_age_days(&future), Some(0));

        // Invalid timestamp
        assert!(compute_stem_age_days("not-a-date").is_none());
    }

    #[test]
    fn test_best_model_info_serialization() {
        let info = BestModelInfo {
            model_family: "roformer".to_string(),
            quality_rank: 4,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("roformer"));

        let deserialized: BestModelInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.quality_rank, 4);
    }
}
