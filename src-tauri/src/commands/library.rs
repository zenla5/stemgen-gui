//! Library management commands.
//!
//! Provides commands for scanning stem libraries, checking staleness,
//! finding duplicates, and exporting library reports.

use crate::stems::{
    check_stem_staleness, load_registry, StemProvenance, StalenessReport,
    StalenessRules, StalenessStatus,
};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::State;
use tracing::{debug, info, warn};

/// Result of a library scan operation.
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryScanResult {
    /// Total number of stem files scanned
    pub total_scanned: usize,
    /// Number of current (up-to-date) stems
    pub current_count: usize,
    /// Number of stale stems
    pub stale_count: usize,
    /// Number of stems with unknown staleness
    pub unknown_count: usize,
    /// Individual staleness reports
    pub reports: Vec<StalenessReport>,
    /// Errors encountered during scan
    pub errors: Vec<String>,
}

/// Filter options for library scan.
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryScanFilter {
    /// Only scan stems created with this model
    pub model: Option<String>,
    /// Only scan stems with this DJ preset
    pub dj_preset: Option<String>,
    /// Only return stale stems
    pub stale_only: bool,
    /// Only return current stems
    pub current_only: bool,
}

impl Default for LibraryScanFilter {
    fn default() -> Self {
        Self {
            model: None,
            dj_preset: None,
            stale_only: false,
            current_only: false,
        }
    }
}

/// A duplicate stem entry — multiple stem files for the same source.
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateEntry {
    /// Source file hash (grouping key)
    pub source_hash: String,
    /// Source file path (from provenance)
    pub source_path: Option<String>,
    /// All stem files derived from this source
    pub stems: Vec<DuplicateStem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateStem {
    /// Path to the stem file
    pub path: String,
    /// Separation model used
    pub model: Option<String>,
    /// Model version used
    pub model_version: Option<String>,
    /// When the stem was created
    pub created_at: Option<String>,
    /// File size in bytes
    pub file_size: u64,
}

/// Export format for library reports.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ExportFormat {
    Csv,
    Markdown,
    Json,
}

/// Internal struct for export with provenance.
#[derive(Clone)]
struct StemWithPath {
    path: String,
    prov: StemProvenance,
}

/// Entry point for library scanning.
fn get_registry_path() -> PathBuf {
    directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("model_registry.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui/model_registry.json"))
}

/// Scan a directory tree for `.stem.mp4` files and check their staleness.
#[tauri::command]
pub async fn scan_library(
    _state: State<'_, AppState>,
    root_path: String,
    filter: Option<LibraryScanFilter>,
    rules: Option<StalenessRules>,
) -> Result<LibraryScanResult, String> {
    info!("Scanning library at: {}", root_path);

    let root = Path::new(&root_path);
    if !root.exists() {
        return Err(format!("Library path does not exist: {}", root_path));
    }

    let filter = filter.unwrap_or_default();
    let rules = rules.unwrap_or_default();

    // Load model registry
    let registry_path = get_registry_path();
    let registry = load_registry(&registry_path).unwrap_or_else(|e| {
        warn!("Failed to load model registry: {}", e);
        HashMap::new()
    });

    let mut reports: Vec<StalenessReport> = Vec::new();
    let errors: Vec<String> = Vec::new();
    let mut total_scanned = 0usize;

    // Walk directory tree
    let walker = walkdir::WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            !e.file_name().to_string_lossy().starts_with('.')
        });

    for entry in walker.filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.extension().map(|e| e == "mp4").unwrap_or(false)
            && path.file_name().map(|n| n.to_string_lossy().ends_with(".stem.mp4")).unwrap_or(false)
        {
            total_scanned += 1;
            let report = check_stem_staleness(path, &rules, &registry);

            if let Some(ref model_filter) = filter.model {
                if report.separation_model.as_ref() != Some(model_filter) {
                    continue;
                }
            }

            if filter.stale_only && !matches!(report.status, StalenessStatus::Stale(_)) {
                continue;
            }

            if filter.current_only && !matches!(report.status, StalenessStatus::Current) {
                continue;
            }

            reports.push(report);
        }
    }

    let current_count = reports.iter().filter(|r| matches!(r.status, StalenessStatus::Current)).count();
    let stale_count = reports.iter().filter(|r| matches!(r.status, StalenessStatus::Stale(_))).count();
    let unknown_count = reports.len() - current_count - stale_count;

    info!("Library scan complete: {} scanned, {} current, {} stale, {} unknown", total_scanned, current_count, stale_count, unknown_count);

    Ok(LibraryScanResult {
        total_scanned,
        current_count,
        stale_count,
        unknown_count,
        reports,
        errors,
    })
}

/// Find duplicate stems — multiple stem files for the same source.
#[tauri::command]
pub async fn find_duplicate_stems(root_path: String) -> Result<Vec<DuplicateEntry>, String> {
    info!("Finding duplicate stems in: {}", root_path);

    let root = Path::new(&root_path);
    if !root.exists() {
        return Err(format!("Library path does not exist: {}", root_path));
    }

    let mut groups: HashMap<String, Vec<DuplicateStem>> = HashMap::new();

    let walker = walkdir::WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'));

    for entry in walker.filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.extension().map(|e| e == "mp4").unwrap_or(false)
            && path.file_name().map(|n| n.to_string_lossy().ends_with(".stem.mp4")).unwrap_or(false)
        {
            match StemProvenance::load_from_sidecar(path) {
                Ok(Some(prov)) => {
                    let file_size = path.metadata().map(|m| m.len()).unwrap_or(0);
                    let stem = DuplicateStem {
                        path: path.to_string_lossy().to_string(),
                        model: Some(prov.separation_model.clone()),
                        model_version: prov.model_version.clone(),
                        created_at: Some(prov.separation_timestamp.clone()),
                        file_size,
                    };
                    groups.entry(prov.source_content_hash.clone()).or_insert_with(Vec::new).push(stem);
                }
                Ok(None) => { debug!("No provenance for: {}", path.display()); }
                Err(e) => { warn!("Error loading provenance for {}: {}", path.display(), e); }
            }
        }
    }

    let duplicates: Vec<DuplicateEntry> = groups
        .into_iter()
        .filter(|(_, stems)| stems.len() > 1)
        .map(|(source_hash, stems)| {
            let source_path = stems.first().and_then(|s| {
                let p = Path::new(&s.path);
                StemProvenance::load_from_sidecar(p).ok().flatten().map(|prov| prov.source_path)
            });
            DuplicateEntry { source_hash, source_path, stems }
        })
        .collect();

    info!("Found {} duplicate groups", duplicates.len());
    Ok(duplicates)
}

/// Export the library as CSV, Markdown, or JSON.
#[tauri::command]
pub async fn export_library_report(
    root_path: String,
    output_path: String,
    format: String,
) -> Result<String, String> {
    info!("Exporting library report: {} -> {} ({})", root_path, output_path, format);

    let root = Path::new(&root_path);
    if !root.exists() {
        return Err(format!("Library path does not exist: {}", root_path));
    }

    let mut stems_with_path: Vec<StemWithPath> = Vec::new();

    let walker = walkdir::WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'));

    for entry in walker.filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.extension().map(|e| e == "mp4").unwrap_or(false)
            && path.file_name().map(|n| n.to_string_lossy().ends_with(".stem.mp4")).unwrap_or(false)
        {
            match StemProvenance::load_from_sidecar(path) {
                Ok(Some(prov)) => {
                    stems_with_path.push(StemWithPath { path: path.to_string_lossy().to_string(), prov });
                }
                Ok(None) => {}
                Err(e) => { warn!("Error loading provenance for {}: {}", path.display(), e); }
            }
        }
    }

    let content = match format.to_lowercase().as_str() {
        "csv" => generate_csv_report(&stems_with_path),
        "markdown" | "md" => generate_markdown_report(&stems_with_path),
        "json" => {
            let json_data: Vec<serde_json::Value> = stems_with_path
                .iter()
                .map(|swp| serde_json::json!({ "stem_path": swp.path, "provenance": swp.prov }))
                .collect();
            serde_json::to_string_pretty(&json_data).map_err(|e| format!("Failed to serialize JSON: {}", e))?
        }
        _ => return Err(format!("Unknown format '{}'. Supported: csv, markdown, json", format))
    };

    std::fs::write(&output_path, &content).map_err(|e| format!("Failed to write report: {}", e))?;
    info!("Library report exported to: {}", output_path);
    Ok(output_path)
}

fn generate_csv_report(stems: &[StemWithPath]) -> String {
    let mut csv = String::new();
    csv.push_str("stem_path,source_path,source_hash,separation_model,model_version,stemgen_gui_version,stemgen_version,separation_timestamp,job_id,batch_id\n");

    for stem in stems {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            escape_csv(&stem.path),
            escape_csv(&stem.prov.source_path),
            escape_csv(&stem.prov.source_content_hash),
            escape_csv(&stem.prov.separation_model),
            stem.prov.model_version.as_ref().map(|s| escape_csv(s)).unwrap_or_default(),
            escape_csv(&stem.prov.stemgen_gui_version),
            stem.prov.stemgen_version.as_ref().map(|s| escape_csv(s)).unwrap_or_default(),
            escape_csv(&stem.prov.separation_timestamp),
            escape_csv(&stem.prov.job_id),
            stem.prov.batch_id.as_ref().map(|s| escape_csv(s)).unwrap_or_default(),
        ));
    }
    csv
}

fn generate_markdown_report(stems: &[StemWithPath]) -> String {
    let mut md = String::new();
    md.push_str("# Stem Library Report\n\n");
    md.push_str(&format!("**Total stems:** {}\n\n", stems.len()));
    md.push_str("| Stem Path | Source | Model | Model Version | stemgen-gui | Timestamp |\n");
    md.push_str("|-----------|--------|-------|---------------|--------------|----------|\n");

    for stem in stems {
        md.push_str(&format!(
            "| `{}` | `{}` | {} | {} | {} | {} |\n",
            truncate(&stem.path, 40),
            truncate(&stem.prov.source_path, 30),
            stem.prov.separation_model,
            stem.prov.model_version.as_deref().unwrap_or("-"),
            stem.prov.stemgen_gui_version,
            truncate(&stem.prov.separation_timestamp, 19),
        ));
    }

    let mut model_counts: HashMap<String, usize> = HashMap::new();
    for stem in stems {
        *model_counts.entry(stem.prov.separation_model.clone()).or_insert(0) += 1;
    }

    md.push_str("\n## Model Breakdown\n\n");
    md.push_str("| Model | Count |\n|-------|-------|\n");
    let mut sorted_models: Vec<(String, usize)> = model_counts.into_iter().collect();
    sorted_models.sort_by(|a, b| a.0.cmp(&b.0));
    for (model, count) in sorted_models {
        md.push_str(&format!("| {} | {} |\n", model, count));
    }
    md
}

fn escape_csv(s: &str) -> String {
    s.replace('"', "\"\"")
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len { s.to_string() } else { format!("{}...", &s[..max_len.saturating_sub(3)]) }
}

/// Get staleness rules from the app state settings.
#[tauri::command]
pub async fn get_staleness_rules(state: State<'_, AppState>) -> Result<StalenessRules, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?", [key], |row| row.get(0)).ok()
    };

    let rules = StalenessRules {
        check_source_modified: get_setting("staleness_check_source").map(|v| v == "true").unwrap_or(true),
        check_model_outdated: get_setting("staleness_check_model").map(|v| v == "true").unwrap_or(true),
        minimum_stemgen_gui_version: get_setting("staleness_min_gui_version"),
        check_parameters_changed: get_setting("staleness_check_params").map(|v| v == "true").unwrap_or(false),
        default_separation_params: get_setting("staleness_default_params").and_then(|v| serde_json::from_str(&v).ok()),
    };

    Ok(rules)
}

/// Save staleness rules to app state.
#[tauri::command]
pub async fn save_staleness_rules(state: State<'_, AppState>, rules: StalenessRules) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let set_setting = |key: &str, value: &str| -> Result<(), String> {
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", rusqlite::params![key, value])
            .map_err(|e| e.to_string())?;
        Ok(())
    };

    set_setting("staleness_check_source", &rules.check_source_modified.to_string())?;
    set_setting("staleness_check_model", &rules.check_model_outdated.to_string())?;
    if let Some(ref min_version) = rules.minimum_stemgen_gui_version {
        set_setting("staleness_min_gui_version", min_version)?;
    }
    set_setting("staleness_check_params", &rules.check_parameters_changed.to_string())?;
    if let Some(ref default_params) = rules.default_separation_params {
        let params_json = serde_json::to_string(default_params).map_err(|e| format!("Failed to serialize params: {}", e))?;
        set_setting("staleness_default_params", &params_json)?;
    }

    info!("Staleness rules saved");
    Ok(())
}

/// Save user notes for a stem file (non-destructive write).
#[tauri::command]
pub async fn save_user_notes(stem_path: String, notes: String) -> Result<(), String> {
    use crate::stems::save_stem_user_notes;
    let stem_path = Path::new(&stem_path);
    save_stem_user_notes(stem_path, &notes).map_err(|e| format!("Failed to save user notes: {}", e))?;
    info!("User notes saved for: {}", stem_path.display());
    Ok(())
}

/// Verify the integrity of stem files (source hash check).
#[tauri::command]
pub async fn verify_stem_integrity(stem_path: String) -> Result<bool, String> {
    use crate::audio::hash_file;

    let stem_path = Path::new(&stem_path);
    let provenance = StemProvenance::load_from_sidecar(stem_path)
        .map_err(|e| format!("Failed to load provenance: {}", e))?
        .ok_or("No provenance metadata found")?;

    let source_path = Path::new(&provenance.source_path);
    if !source_path.exists() {
        return Ok(false);
    }

    let current_hash = hash_file(source_path).map_err(|e| format!("Failed to hash source: {}", e))?;
    let matches = current_hash == provenance.source_content_hash;
    info!("Integrity check for {}: {}", stem_path.display(), if matches { "OK" } else { "MODIFIED" });

    Ok(matches)
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_csv() {
        assert_eq!(escape_csv("hello"), "hello");
        assert_eq!(escape_csv("hello,world"), "hello,world");
        assert_eq!(escape_csv("hello\"world"), "hello\"\"world");
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 8), "hello...");
    }

    #[test]
    fn test_library_scan_filter_default() {
        let filter = LibraryScanFilter::default();
        assert!(filter.model.is_none());
        assert!(!filter.stale_only);
        assert!(!filter.current_only);
    }

    #[test]
    fn test_duplicate_entry_serialization() {
        let entry = DuplicateEntry {
            source_hash: "abc123".to_string(),
            source_path: Some("/music/track.mp3".to_string()),
            stems: vec![
                DuplicateStem {
                    path: "/music/track_v1.stem.mp4".to_string(),
                    model: Some("bs_roformer".to_string()),
                    model_version: Some("v1.0".to_string()),
                    created_at: Some("2024-03-01T10:00:00Z".to_string()),
                    file_size: 5_000_000,
                },
            ],
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("abc123"));
        let deserialized: DuplicateEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stems.len(), 1);
    }

    #[test]
    fn test_export_format_serialization() {
        assert!(serde_json::to_string(&ExportFormat::Csv).is_ok());
        assert!(serde_json::to_string(&ExportFormat::Markdown).is_ok());
        assert!(serde_json::to_string(&ExportFormat::Json).is_ok());
    }
}
