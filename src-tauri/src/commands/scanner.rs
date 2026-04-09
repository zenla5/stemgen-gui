use crate::commands::library_roots;
use crate::stems::{check_stem_staleness, load_registry, StalenessStatus, StemProvenance};
use crate::AppState;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::State;
use tracing::{debug, info};

/// The state of a source file relative to its stem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum StemFileState {
    /// Source file found, no matching stem.
    NoStem,
    /// Stem exists and is up-to-date.
    HasStemCurrent,
    /// Stem exists but is outdated.
    HasStemOutdated,
    /// Stem exists but has no provenance sidecar.
    HasStemUnknownProvenance,
    /// Stem file exists but source cannot be found.
    OrphanedStem,
    /// Entry is explicitly ignored.
    Ignored,
}

impl StemFileState {
    pub fn as_str(&self) -> &'static str {
        match self {
            StemFileState::NoStem => "NoStem",
            StemFileState::HasStemCurrent => "HasStemCurrent",
            StemFileState::HasStemOutdated => "HasStemOutdated",
            StemFileState::HasStemUnknownProvenance => "HasStemUnknownProvenance",
            StemFileState::OrphanedStem => "OrphanedStem",
            StemFileState::Ignored => "Ignored",
        }
    }
}

/// A single entry in the library index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryIndexEntry {
    pub id: String,
    pub root_id: String,
    pub source_path: String,
    pub source_sha256: Option<String>,
    pub source_mtime: Option<i64>,
    pub source_inode: Option<i64>,
    pub stem_path: Option<String>,
    pub status: StemFileState,
    pub provenance_json: Option<String>,
    pub ignored: bool,
    pub updated_at: String,
}

/// Result of a library scan.
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryScanResultV2 {
    pub root_id: String,
    pub total_sources: usize,
    pub no_stem_count: usize,
    pub has_stem_current_count: usize,
    pub has_stem_outdated_count: usize,
    pub has_stem_unknown_provenance_count: usize,
    pub orphaned_stem_count: usize,
    pub ignored_count: usize,
    pub entries: Vec<LibraryIndexEntry>,
}

/// Supported audio file extensions (without dot).
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "aif", "aiff", "ogg", "opus", "m4a", "aac", "wv", "ape",
];

/// Directories to skip during walk.
const SKIP_DIRS: &[&str] = &["__MACOSX", ".Spotlight-V100"];

/// Generate a unique ID with a prefix.
fn generate_id(prefix: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{}_{:016x}", prefix, ts)
}

/// Check if a path is an audio source file.
fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            AUDIO_EXTENSIONS
                .iter()
                .any(|ae| ae.eq_ignore_ascii_case(ext))
        })
        .unwrap_or(false)
}

/// Check if a path is a stem file (.stem.mp4).
fn is_stem_file(path: &Path) -> bool {
    path.file_name()
        .map(|n| n.to_string_lossy().ends_with(".stem.mp4"))
        .unwrap_or(false)
}

/// Check if a path matches any of the given glob patterns.
fn matches_glob_patterns(path: &Path, root: &Path, patterns: &[String]) -> bool {
    let relative = path.strip_prefix(root).unwrap_or(path);
    for pattern in patterns {
        if let Ok(glob_pattern) = glob::Pattern::new(pattern) {
            if glob_pattern.matches_path(relative) {
                return true;
            }
        }
    }
    false
}

/// Parse ignored globs from the JSON string stored in DB.
fn parse_ignored_globs(globs: &Option<String>) -> Vec<String> {
    globs
        .as_ref()
        .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default()
}

/// Compute file mtime as Unix timestamp.
fn get_file_mtime(path: &Path) -> Option<i64> {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

/// Scan a library root and persist results to the database.
pub fn scan_root(
    conn: &Connection,
    root_id: &str,
    full_rescan: bool,
) -> Result<LibraryScanResultV2, String> {
    info!("Scanning library root: {} (full={})", root_id, full_rescan);

    // Load the library root config
    let root_config = library_roots::db_get_library_root(conn, root_id)
        .map_err(|e| format!("Failed to load library root: {}", e))?
        .ok_or_else(|| format!("Library root not found: {}", root_id))?;

    let root_path = Path::new(&root_config.path);
    if !root_path.exists() {
        return Err(format!(
            "Library root path does not exist: {}",
            root_config.path
        ));
    }

    let ignored_globs = parse_ignored_globs(&root_config.ignored_globs);
    let now = chrono::Utc::now().to_rfc3339();

    // Load model registry for staleness checks
    let registry_path = directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().join("model_registry.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui/model_registry.json"));
    let registry = load_registry(&registry_path).unwrap_or_default();

    // Collect source files
    let mut source_files: Vec<PathBuf> = Vec::new();
    let mut stem_files: Vec<PathBuf> = Vec::new();

    let walker = walkdir::WalkDir::new(root_path)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|d| name == *d)
        });

    for entry in walker.filter_map(|e| e.ok()) {
        let path = entry.path();

        // Skip ignored paths
        if !ignored_globs.is_empty() && matches_glob_patterns(path, root_path, &ignored_globs) {
            debug!("Skipping ignored path: {}", path.display());
            continue;
        }

        // Skip hidden files/dirs
        if path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }

        if entry.file_type().is_file() {
            if is_audio_file(path) {
                source_files.push(path.to_path_buf());
            } else if is_stem_file(path) {
                stem_files.push(path.to_path_buf());
            }
        }
    }

    info!(
        "Found {} source files and {} stem files",
        source_files.len(),
        stem_files.len()
    );

    // Build a map of stem files by their basename stem (e.g., "track" from "track.stem.mp4")
    let mut stem_by_basename: HashMap<String, Vec<&PathBuf>> = HashMap::new();
    for stem_path in &stem_files {
        if let Some(stem_name) = stem_path.file_stem().and_then(|s| s.to_str()) {
            // "track.stem" -> "track"
            let basename = stem_name.replace(".stem", "");
            stem_by_basename
                .entry(basename.to_lowercase())
                .or_default()
                .push(stem_path);
        }
    }

    // Build a map of stems by source hash from provenance
    let mut stem_by_hash: HashMap<String, Vec<&PathBuf>> = HashMap::new();
    for stem_path in &stem_files {
        if let Ok(Some(prov)) = StemProvenance::load_from_sidecar(stem_path) {
            stem_by_hash
                .entry(prov.source_content_hash.clone())
                .or_default()
                .push(stem_path);
        }
    }

    // Process each source file
    let mut entries: Vec<LibraryIndexEntry> = Vec::new();
    let mut matched_stems: HashSet<String> = HashSet::new();

    for source_path in &source_files {
        let source_path_str = source_path.to_string_lossy().to_string();

        // Skip if full_rescan is false and file hasn't changed
        if !full_rescan {
            let current_mtime = get_file_mtime(source_path);
            if let Some(existing_mtime) = get_existing_mtime(conn, root_id, &source_path_str) {
                if current_mtime == Some(existing_mtime) {
                    debug!("Skipping unchanged file: {}", source_path_str);
                    continue;
                }
            }
        }

        // Compute source hash
        let source_hash = crate::audio::hash_file(source_path).ok();

        // Try to find matching stem: first by hash, then by basename
        let mut stem_match: Option<(&PathBuf, Option<StemProvenance>)> = None;

        // Hash match
        if let Some(ref hash) = source_hash {
            if let Some(stem_paths) = stem_by_hash.get(hash) {
                if let Some(first_stem) = stem_paths.first() {
                    let prov = StemProvenance::load_from_sidecar(first_stem).ok().flatten();
                    stem_match = Some((first_stem, prov));
                    matched_stems.insert(first_stem.to_string_lossy().to_string());
                }
            }
        }

        // Basename fallback
        if stem_match.is_none() {
            if let Some(basename) = source_path.file_stem().and_then(|s| s.to_str()) {
                if let Some(stem_paths) = stem_by_basename.get(&basename.to_lowercase()) {
                    for stem_path in stem_paths {
                        let stem_str = stem_path.to_string_lossy().to_string();
                        if !matched_stems.contains(&stem_str) {
                            let prov = StemProvenance::load_from_sidecar(stem_path).ok().flatten();
                            stem_match = Some((stem_path, prov));
                            matched_stems.insert(stem_str);
                            break;
                        }
                    }
                }
            }
        }

        let (status, stem_path_str, provenance_json) = match stem_match {
            Some((stem_path, Some(prov))) => {
                // Check staleness
                let report = check_stem_staleness(stem_path, &Default::default(), &registry);
                let state = match report.status {
                    StalenessStatus::Current => StemFileState::HasStemCurrent,
                    StalenessStatus::Stale(_) => StemFileState::HasStemOutdated,
                    StalenessStatus::Unknown(_) => StemFileState::HasStemUnknownProvenance,
                };
                let prov_json = serde_json::to_string(&prov).ok();
                (
                    state,
                    Some(stem_path.to_string_lossy().to_string()),
                    prov_json,
                )
            }
            Some((stem_path, None)) => (
                StemFileState::HasStemUnknownProvenance,
                Some(stem_path.to_string_lossy().to_string()),
                None,
            ),
            None => (StemFileState::NoStem, None, None),
        };

        let entry_id = generate_id("idx");
        let mtime = get_file_mtime(source_path);

        entries.push(LibraryIndexEntry {
            id: entry_id.clone(),
            root_id: root_id.to_string(),
            source_path: source_path_str.clone(),
            source_sha256: source_hash,
            source_mtime: mtime,
            source_inode: None,
            stem_path: stem_path_str,
            status,
            provenance_json,
            ignored: false,
            updated_at: now.clone(),
        });

        // Upsert to database
        conn.execute(
            "INSERT INTO library_index (id, root_id, source_path, source_sha256, source_mtime,
                source_inode, stem_path, status, provenance_json, ignored, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(root_id, source_path) DO UPDATE SET
                root_id = excluded.root_id,
                source_sha256 = excluded.source_sha256,
                source_mtime = excluded.source_mtime,
                stem_path = excluded.stem_path,
                status = excluded.status,
                provenance_json = excluded.provenance_json,
                updated_at = excluded.updated_at",
            params![
                entry_id,
                root_id,
                source_path_str,
                entries.last().unwrap().source_sha256,
                mtime,
                None::<i64>,
                entries.last().unwrap().stem_path,
                status.as_str(),
                entries.last().unwrap().provenance_json,
                false,
                now
            ],
        )
        .map_err(|e| format!("Failed to upsert library index entry: {}", e))?;
    }

    // Mark existing entries whose source files no longer exist on disk as OrphanedStem
    let collected_source_paths: HashSet<String> =
        entries.iter().map(|e| e.source_path.clone()).collect();

    let mut existing_stmt = conn
        .prepare(
            "SELECT id, source_path, stem_path, provenance_json
             FROM library_index WHERE root_id = ?",
        )
        .map_err(|e| format!("Failed to query existing entries: {}", e))?;

    let existing_entries: Vec<(String, String, Option<String>, Option<String>)> = existing_stmt
        .query_map(params![root_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| format!("Failed to query existing entries: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for (existing_id, existing_source, existing_stem, existing_prov) in &existing_entries {
        if !collected_source_paths.contains(existing_source)
            && !entries.iter().any(|e| e.id == *existing_id)
        {
            let source_exists = std::path::Path::new(existing_source).exists();
            if !source_exists {
                conn.execute(
                    "UPDATE library_index SET status = ?, updated_at = ? WHERE id = ?",
                    params![StemFileState::OrphanedStem.as_str(), now, existing_id],
                )
                .map_err(|e| format!("Failed to mark orphan: {}", e))?;

                entries.push(LibraryIndexEntry {
                    id: existing_id.clone(),
                    root_id: root_id.to_string(),
                    source_path: existing_source.clone(),
                    source_sha256: None,
                    source_mtime: None,
                    source_inode: None,
                    stem_path: existing_stem.clone(),
                    status: StemFileState::OrphanedStem,
                    provenance_json: existing_prov.clone(),
                    ignored: false,
                    updated_at: now.clone(),
                });
            }
        }
    }

    // Detect orphaned stems (stems not matched to any source)
    for stem_path in &stem_files {
        let stem_str = stem_path.to_string_lossy().to_string();
        if !matched_stems.contains(&stem_str) {
            let prov = StemProvenance::load_from_sidecar(stem_path).ok().flatten();
            let prov_json = prov.as_ref().and_then(|p| serde_json::to_string(p).ok());

            let entry_id = generate_id("idx");
            let source_path_hint = prov
                .map(|p| p.source_path)
                .unwrap_or_else(|| stem_str.clone());

            entries.push(LibraryIndexEntry {
                id: entry_id.clone(),
                root_id: root_id.to_string(),
                source_path: source_path_hint.clone(),
                source_sha256: None,
                source_mtime: None,
                source_inode: None,
                stem_path: Some(stem_str.clone()),
                status: StemFileState::OrphanedStem,
                provenance_json: prov_json,
                ignored: false,
                updated_at: now.clone(),
            });

            conn.execute(
                "INSERT INTO library_index (id, root_id, source_path, source_sha256, source_mtime,
                    source_inode, stem_path, status, provenance_json, ignored, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(root_id, source_path) DO UPDATE SET
                    root_id = excluded.root_id,
                    stem_path = excluded.stem_path,
                    status = excluded.status,
                    provenance_json = excluded.provenance_json,
                    updated_at = excluded.updated_at",
                params![
                    entry_id,
                    root_id,
                    source_path_hint,
                    None::<String>,
                    None::<i64>,
                    None::<i64>,
                    Some(stem_str),
                    StemFileState::OrphanedStem.as_str(),
                    entries.last().unwrap().provenance_json,
                    false,
                    now
                ],
            )
            .map_err(|e| format!("Failed to upsert orphan entry: {}", e))?;
        }
    }

    // Update last_scanned_at on the root
    conn.execute(
        "UPDATE library_roots SET last_scanned_at = ? WHERE id = ?",
        params![now, root_id],
    )
    .map_err(|e| format!("Failed to update last_scanned_at: {}", e))?;

    // Compute counts
    let no_stem_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::NoStem)
        .count();
    let has_stem_current_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::HasStemCurrent)
        .count();
    let has_stem_outdated_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::HasStemOutdated)
        .count();
    let has_stem_unknown_provenance_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::HasStemUnknownProvenance)
        .count();
    let orphaned_stem_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::OrphanedStem)
        .count();
    let ignored_count = entries
        .iter()
        .filter(|e| e.status == StemFileState::Ignored)
        .count();

    info!(
        "Scan complete: {} sources, {} current, {} outdated, {} unknown, {} orphans",
        entries.len(),
        has_stem_current_count,
        has_stem_outdated_count,
        has_stem_unknown_provenance_count,
        orphaned_stem_count,
    );

    Ok(LibraryScanResultV2 {
        root_id: root_id.to_string(),
        total_sources: entries.len(),
        no_stem_count,
        has_stem_current_count,
        has_stem_outdated_count,
        has_stem_unknown_provenance_count,
        orphaned_stem_count,
        ignored_count,
        entries,
    })
}

/// Get existing mtime for a source path from the database.
fn get_existing_mtime(conn: &Connection, root_id: &str, source_path: &str) -> Option<i64> {
    conn.query_row(
        "SELECT source_mtime FROM library_index WHERE root_id = ? AND source_path = ?",
        params![root_id, source_path],
        |row| row.get(0),
    )
    .ok()
}

// =============================================================================
// Tauri Commands
// =============================================================================

#[tauri::command]
pub async fn scan_library_root(
    state: State<'_, AppState>,
    root_id: String,
    full_rescan: Option<bool>,
) -> Result<LibraryScanResultV2, String> {
    info!("scan_library_root called for: {}", root_id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    scan_root(&conn, &root_id, full_rescan.unwrap_or(true))
}

// =============================================================================
// Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::db::run_migrations;
    use crate::commands::library_roots::db_insert_library_root;

    #[test]
    fn test_is_audio_file() {
        assert!(is_audio_file(Path::new("track.mp3")));
        assert!(is_audio_file(Path::new("/music/song.flac")));
        assert!(is_audio_file(Path::new("beat.WAV")));
        assert!(is_audio_file(Path::new("loop.ogg")));
        assert!(!is_audio_file(Path::new("readme.txt")));
        assert!(!is_audio_file(Path::new("track.stem.mp4")));
    }

    #[test]
    fn test_is_stem_file() {
        assert!(is_stem_file(Path::new("track.stem.mp4")));
        assert!(is_stem_file(Path::new("/music/song.stem.mp4")));
        assert!(!is_stem_file(Path::new("track.mp4")));
        assert!(!is_stem_file(Path::new("track.mp3")));
    }

    #[test]
    fn test_stem_file_state_as_str() {
        assert_eq!(StemFileState::NoStem.as_str(), "NoStem");
        assert_eq!(StemFileState::HasStemCurrent.as_str(), "HasStemCurrent");
        assert_eq!(StemFileState::OrphanedStem.as_str(), "OrphanedStem");
    }

    #[test]
    fn test_matches_glob_patterns() {
        assert!(matches_glob_patterns(
            Path::new("/music/Samples/loop.wav"),
            Path::new("/music"),
            &["**/Samples/**".to_string()]
        ));
        assert!(!matches_glob_patterns(
            Path::new("/music/track.mp3"),
            Path::new("/music"),
            &["**/Samples/**".to_string()]
        ));
    }

    #[test]
    fn test_parse_ignored_globs() {
        assert!(parse_ignored_globs(&None).is_empty());
        let globs = parse_ignored_globs(&Some("[\"**/Samples/**\"]".to_string()));
        assert_eq!(globs.len(), 1);
        assert_eq!(globs[0], "**/Samples/**");
    }

    #[test]
    fn test_scan_empty_directory() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 0);
        assert_eq!(result.no_stem_count, 0);
        assert_eq!(result.orphaned_stem_count, 0);
    }

    #[test]
    fn test_scan_finds_audio_files() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        // Create 3 audio files
        std::fs::write(dir.path().join("track1.mp3"), b"fake mp3").unwrap();
        std::fs::write(dir.path().join("track2.flac"), b"fake flac").unwrap();
        std::fs::write(dir.path().join("track3.wav"), b"fake wav").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 3);
        assert_eq!(result.no_stem_count, 3);
        assert_eq!(result.has_stem_current_count, 0);
    }

    #[test]
    fn test_scan_skips_non_audio_files() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();
        std::fs::write(dir.path().join("readme.txt"), b"text").unwrap();
        std::fs::write(dir.path().join("cover.jpg"), b"image").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 1);
    }

    #[test]
    fn test_scan_skips_macosx_directory() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();
        let macosx = dir.path().join("__MACOSX");
        std::fs::create_dir(&macosx).unwrap();
        std::fs::write(macosx.join("track.mp3"), b"resource fork").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 1);
    }

    #[test]
    fn test_scan_library_index_persisted() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        scan_root(&conn, &root_id, true).unwrap();

        // Verify data is persisted in DB
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_index WHERE root_id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let status: String = conn
            .query_row(
                "SELECT status FROM library_index WHERE root_id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "NoStem");
    }

    #[test]
    fn test_scan_last_scanned_at_updated() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        // Verify last_scanned_at is null before scan
        let before: Option<String> = conn
            .query_row(
                "SELECT last_scanned_at FROM library_roots WHERE id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(before.is_none());

        scan_root(&conn, &root_id, true).unwrap();

        // Verify last_scanned_at is set after scan
        let after: Option<String> = conn
            .query_row(
                "SELECT last_scanned_at FROM library_roots WHERE id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(after.is_some());
    }

    #[test]
    fn test_incremental_scan_skips_unchanged_files() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track1.mp3"), b"fake mp3").unwrap();
        std::fs::write(dir.path().join("track2.flac"), b"fake flac").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        // Full scan
        let result1 = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result1.total_sources, 2);

        // Incremental scan — files haven't changed, so nothing is processed
        let result2 = scan_root(&conn, &root_id, false).unwrap();
        assert_eq!(result2.total_sources, 0);
    }

    #[test]
    fn test_incremental_scan_processes_modified_files() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"original").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        // Full scan
        scan_root(&conn, &root_id, true).unwrap();

        // Modify the file (sleep briefly to ensure mtime changes)
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(dir.path().join("track.mp3"), b"modified").unwrap();

        // Incremental scan — should detect the change
        let result = scan_root(&conn, &root_id, false).unwrap();
        assert_eq!(result.total_sources, 1);
    }

    #[test]
    fn test_glob_exclusion_filters_matching_files() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();

        // Create Samples subdirectory with files that should be excluded
        let samples = dir.path().join("Samples");
        std::fs::create_dir(&samples).unwrap();
        std::fs::write(samples.join("kick.wav"), b"fake kick").unwrap();
        std::fs::write(samples.join("snare.aif"), b"fake snare").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        // Set ignore globs
        conn.execute(
            "UPDATE library_roots SET ignored_globs = ? WHERE id = ?",
            params!["[\"**/Samples/**\"]", root_id],
        )
        .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 1);
    }

    #[test]
    fn test_glob_exclusion_with_multiple_patterns() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();

        let archive = dir.path().join("_archive");
        std::fs::create_dir(&archive).unwrap();
        std::fs::write(archive.join("old.flac"), b"old file").unwrap();

        let samples = dir.path().join("Samples");
        std::fs::create_dir(&samples).unwrap();
        std::fs::write(samples.join("loop.wav"), b"sample").unwrap();

        let root_id =
            db_insert_library_root(&conn, dir.path().to_str().unwrap(), "alongside", None, None)
                .unwrap();

        conn.execute(
            "UPDATE library_roots SET ignored_globs = ? WHERE id = ?",
            params!["[\"**/Samples/**\", \"**/_archive/**\"]", root_id],
        )
        .unwrap();

        let result = scan_root(&conn, &root_id, true).unwrap();
        assert_eq!(result.total_sources, 1);
    }
}
