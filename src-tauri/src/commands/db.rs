use crate::AppState;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

// =============================================================================
// Data Types
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessingHistoryEntry {
    pub id: String,
    pub source_path: String,
    pub output_path: String,
    pub model: String,
    pub dj_preset: String,
    pub processed_at: String,
    pub duration_ms: i64,
    pub file_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

/// A record of a single separation job, used for audit trails.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SeparationJobLog {
    /// Unique job identifier (matches StemProvenance.job_id)
    pub job_id: String,
    /// Source file path
    pub source_path: String,
    /// Source file SHA-256 content hash
    pub source_hash: String,
    /// Source file size in bytes
    pub source_size_bytes: i64,
    /// Source duration in seconds
    pub source_duration_secs: f64,
    /// Source sample rate
    pub source_sample_rate: u32,
    /// AI model used (e.g., "bs_roformer", "htdemucs")
    pub separation_model: String,
    /// Model version / checkpoint hash
    pub model_version: Option<String>,
    /// stemgen-gui version
    pub stemgen_gui_version: String,
    /// stemgen library version
    pub stemgen_version: Option<String>,
    /// DJ software preset
    pub dj_preset: String,
    /// Output format
    pub output_format: String,
    /// Quality preset
    pub separation_quality_preset: Option<String>,
    /// Custom separation parameters (JSON string)
    pub separation_params: Option<String>,
    /// Batch identifier (optional)
    pub batch_id: Option<String>,
    /// Timestamp when separation was triggered (ISO 8601)
    pub separation_timestamp: String,
    /// Output stem file path
    pub output_path: String,
    /// Whether the job completed successfully
    pub success: bool,
    /// Error message if failed
    pub error_message: Option<String>,
    /// Total processing time in milliseconds
    pub processing_time_ms: i64,
}

impl Default for SeparationJobLog {
    fn default() -> Self {
        Self {
            job_id: String::new(),
            source_path: String::new(),
            source_hash: String::new(),
            source_size_bytes: 0,
            source_duration_secs: 0.0,
            source_sample_rate: 44100,
            separation_model: String::new(),
            model_version: None,
            stemgen_gui_version: env!("CARGO_PKG_VERSION").to_string(),
            stemgen_version: None,
            dj_preset: String::new(),
            output_format: String::new(),
            separation_quality_preset: None,
            separation_params: None,
            batch_id: None,
            separation_timestamp: chrono::Utc::now().to_rfc3339(),
            output_path: String::new(),
            success: false,
            error_message: None,
            processing_time_ms: 0,
        }
    }
}

/// Summary statistics for the stem library.
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_stem_files: i64,
    pub total_source_files: i64,
    pub total_size_bytes: i64,
    pub unique_models: i64,
    pub model_breakdown: Vec<ModelCount>,
    pub dj_preset_breakdown: Vec<DjPresetCount>,
    pub stale_count: i64,
    pub unknown_source_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelCount {
    pub model: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DjPresetCount {
    pub dj_preset: String,
    pub count: i64,
}

// =============================================================================
// Migrations
// =============================================================================

pub fn run_migrations(conn: &Connection) -> Result<()> {
    info!("Running database migrations");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_history (
            id TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            output_path TEXT NOT NULL,
            model TEXT NOT NULL,
            dj_preset TEXT NOT NULL,
            processed_at TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            file_size INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS export_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            output_format TEXT NOT NULL,
            quality_preset TEXT NOT NULL,
            dj_preset TEXT NOT NULL,
            individual_stem_export INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    // Migration: add provenance columns to processing_history if not exists
    let has_prov_source_hash: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('processing_history') WHERE name='source_hash'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if has_prov_source_hash == 0 {
        info!("Adding provenance columns to processing_history");
        conn.execute_batch(
            "ALTER TABLE processing_history ADD COLUMN source_hash TEXT;
             ALTER TABLE processing_history ADD COLUMN source_size_bytes INTEGER;
             ALTER TABLE processing_history ADD COLUMN source_duration_secs REAL;
             ALTER TABLE processing_history ADD COLUMN source_sample_rate INTEGER;
             ALTER TABLE processing_history ADD COLUMN model_version TEXT;
             ALTER TABLE processing_history ADD COLUMN stemgen_gui_version TEXT;
             ALTER TABLE processing_history ADD COLUMN stemgen_version TEXT;
             ALTER TABLE processing_history ADD COLUMN separation_quality_preset TEXT;
             ALTER TABLE processing_history ADD COLUMN separation_params TEXT;
             ALTER TABLE processing_history ADD COLUMN batch_id TEXT;
             ALTER TABLE processing_history ADD COLUMN job_id TEXT;",
        )?;
    }

    // Migration: create separation_job_log table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS separation_job_log (
            job_id TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            source_duration_secs REAL NOT NULL DEFAULT 0.0,
            source_sample_rate INTEGER NOT NULL DEFAULT 44100,
            separation_model TEXT NOT NULL,
            model_version TEXT,
            stemgen_gui_version TEXT NOT NULL,
            stemgen_version TEXT,
            dj_preset TEXT NOT NULL,
            output_format TEXT NOT NULL,
            separation_quality_preset TEXT,
            separation_params TEXT,
            batch_id TEXT,
            separation_timestamp TEXT NOT NULL,
            output_path TEXT NOT NULL,
            success INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            processing_time_ms INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    // Migration: create indexes for separation_job_log
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_separation_job_log_model ON separation_job_log(separation_model)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_separation_job_log_source_hash ON separation_job_log(source_hash)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_separation_job_log_timestamp ON separation_job_log(separation_timestamp DESC)",
        [],
    )
    .ok();

    info!("Database migrations complete");
    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

#[tauri::command]
pub async fn get_processing_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ProcessingHistoryEntry>, String> {
    info!("Getting processing history");

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare("SELECT id, source_path, output_path, model, dj_preset, processed_at, duration_ms, file_size FROM processing_history ORDER BY processed_at DESC LIMIT ?")
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([limit], |row| {
            Ok(ProcessingHistoryEntry {
                id: row.get(0)?,
                source_path: row.get(1)?,
                output_path: row.get(2)?,
                model: row.get(3)?,
                dj_preset: row.get(4)?,
                processed_at: row.get(5)?,
                duration_ms: row.get(6)?,
                file_size: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
pub async fn add_to_history(
    state: State<'_, AppState>,
    entry: ProcessingHistoryEntry,
) -> Result<(), String> {
    info!("Adding to processing history: {}", entry.id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO processing_history (id, source_path, output_path, model, dj_preset, processed_at, duration_ms, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            entry.id,
            entry.source_path,
            entry.output_path,
            entry.model,
            entry.dj_preset,
            entry.processed_at,
            entry.duration_ms,
            entry.file_size,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Log a separation job to the audit trail.
///
/// This creates an immutable record of the separation job that can be used
/// for staleness detection, library statistics, and audit purposes.
#[tauri::command]
pub async fn log_separation_job(
    state: State<'_, AppState>,
    job: SeparationJobLog,
) -> Result<(), String> {
    info!("Logging separation job: {}", job.job_id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO separation_job_log (
            job_id, source_path, source_hash, source_size_bytes,
            source_duration_secs, source_sample_rate, separation_model,
            model_version, stemgen_gui_version, stemgen_version,
            dj_preset, output_format, separation_quality_preset,
            separation_params, batch_id, separation_timestamp,
            output_path, success, error_message, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            job.job_id,
            job.source_path,
            job.source_hash,
            job.source_size_bytes,
            job.source_duration_secs,
            job.source_sample_rate,
            job.separation_model,
            job.model_version,
            job.stemgen_gui_version,
            job.stemgen_version,
            job.dj_preset,
            job.output_format,
            job.separation_quality_preset,
            job.separation_params,
            job.batch_id,
            job.separation_timestamp,
            job.output_path,
            job.success,
            job.error_message,
            job.processing_time_ms,
        ],
    )
    .map_err(|e| e.to_string())?;

    info!("Separation job logged successfully");
    Ok(())
}

/// Retrieve the separation job log, optionally filtered by model or source hash.
#[tauri::command]
pub async fn get_separation_log(
    state: State<'_, AppState>,
    model_filter: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SeparationJobLog>, String> {
    info!("Getting separation log (model_filter={:?})", model_filter);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);

    let entries: Vec<SeparationJobLog> = if let Some(ref model) = model_filter {
        let mut stmt = conn
            .prepare(
                "SELECT job_id, source_path, source_hash, source_size_bytes,
                        source_duration_secs, source_sample_rate, separation_model,
                        model_version, stemgen_gui_version, stemgen_version,
                        dj_preset, output_format, separation_quality_preset,
                        separation_params, batch_id, separation_timestamp,
                        output_path, success, error_message, processing_time_ms
                 FROM separation_job_log
                 WHERE separation_model = ?
                 ORDER BY separation_timestamp DESC
                 LIMIT ?",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_map(params![model, limit], map_separation_job_log_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT job_id, source_path, source_hash, source_size_bytes,
                        source_duration_secs, source_sample_rate, separation_model,
                        model_version, stemgen_gui_version, stemgen_version,
                        dj_preset, output_format, separation_quality_preset,
                        separation_params, batch_id, separation_timestamp,
                        output_path, success, error_message, processing_time_ms
                 FROM separation_job_log
                 ORDER BY separation_timestamp DESC
                 LIMIT ?",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_map([limit], map_separation_job_log_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    Ok(entries)
}

/// Get library statistics for the stem collection.
#[tauri::command]
pub async fn get_library_stats(
    state: State<'_, AppState>,
) -> Result<LibraryStats, String> {
    info!("Computing library statistics");

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let total_stem_files: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT job_id) FROM separation_job_log WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_source_files: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT source_hash) FROM separation_job_log WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_size_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(source_size_bytes), 0) FROM separation_job_log WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let unique_models: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT separation_model) FROM separation_job_log WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Model breakdown
    let mut model_stmt = conn
        .prepare(
            "SELECT separation_model, COUNT(*) as cnt
             FROM separation_job_log WHERE success = 1
             GROUP BY separation_model ORDER BY cnt DESC",
        )
        .map_err(|e| e.to_string())?;

    let model_breakdown: Vec<ModelCount> = model_stmt
        .query_map([], |row| {
            Ok(ModelCount {
                model: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // DJ preset breakdown
    let mut preset_stmt = conn
        .prepare(
            "SELECT dj_preset, COUNT(*) as cnt
             FROM separation_job_log WHERE success = 1
             GROUP BY dj_preset ORDER BY cnt DESC",
        )
        .map_err(|e| e.to_string())?;

    let dj_preset_breakdown: Vec<DjPresetCount> = preset_stmt
        .query_map([], |row| {
            Ok(DjPresetCount {
                dj_preset: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Placeholder counts (these would be computed by the staleness engine
    // by comparing against the model registry, but we track them here)
    let stale_count: i64 = 0; // Computed by staleness engine
    let unknown_source_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM separation_job_log WHERE success = 1 AND (source_hash IS NULL OR source_hash = '')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LibraryStats {
        total_stem_files,
        total_source_files,
        total_size_bytes,
        unique_models,
        model_breakdown,
        dj_preset_breakdown,
        stale_count,
        unknown_source_count,
    })
}

/// Map a separation_job_log row to a SeparationJobLog struct.
fn map_separation_job_log_row(row: &rusqlite::Row) -> rusqlite::Result<SeparationJobLog> {
    Ok(SeparationJobLog {
        job_id: row.get(0)?,
        source_path: row.get(1)?,
        source_hash: row.get(2)?,
        source_size_bytes: row.get(3)?,
        source_duration_secs: row.get(4)?,
        source_sample_rate: row.get(5)?,
        separation_model: row.get(6)?,
        model_version: row.get(7)?,
        stemgen_gui_version: row.get(8)?,
        stemgen_version: row.get(9)?,
        dj_preset: row.get(10)?,
        output_format: row.get(11)?,
        separation_quality_preset: row.get(12)?,
        separation_params: row.get(13)?,
        batch_id: row.get(14)?,
        separation_timestamp: row.get(15)?,
        output_path: row.get(16)?,
        success: row.get(17)?,
        error_message: row.get(18)?,
        processing_time_ms: row.get(19)?,
    })
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Vec<SettingEntry>, String> {
    info!("Getting settings");

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([], |row| {
            Ok(SettingEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: Vec<SettingEntry>,
) -> Result<(), String> {
    info!("Saving settings");

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    for setting in settings {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![setting.key, setting.value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_migrations_creates_tables() {
        let conn = Connection::open_in_memory().unwrap();
        let result = run_migrations(&conn);
        assert!(result.is_ok());

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='processing_history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='separation_job_log'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_run_migrations_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        let result1 = run_migrations(&conn);
        let result2 = run_migrations(&conn);
        assert!(result1.is_ok());
        assert!(result2.is_ok());
    }

    #[test]
    fn test_processing_history_entry_serialization() {
        let entry = ProcessingHistoryEntry {
            id: "test-id".to_string(),
            source_path: "/path/to/source.mp3".to_string(),
            output_path: "/path/to/output.stem.mp4".to_string(),
            model: "bs_roformer".to_string(),
            dj_preset: "traktor".to_string(),
            processed_at: "2024-01-01T00:00:00Z".to_string(),
            duration_ms: 1000,
            file_size: 1024,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("bs_roformer"));
        assert!(json.contains("traktor"));

        let deserialized: ProcessingHistoryEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, entry.id);
        assert_eq!(deserialized.model, entry.model);
    }

    #[test]
    fn test_setting_entry_serialization() {
        let entry = SettingEntry {
            key: "theme".to_string(),
            value: "dark".to_string(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("theme"));
        assert!(json.contains("dark"));

        let deserialized: SettingEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.key, entry.key);
        assert_eq!(deserialized.value, entry.value);
    }

    #[test]
    fn test_insert_and_retrieve_history_entry() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entry = ProcessingHistoryEntry {
            id: "test-123".to_string(),
            source_path: "/music/song.mp3".to_string(),
            output_path: "/music/song.stem.mp4".to_string(),
            model: "htdemucs".to_string(),
            dj_preset: "rekordbox".to_string(),
            processed_at: "2024-03-28T12:00:00Z".to_string(),
            duration_ms: 5000,
            file_size: 4096,
        };

        conn.execute(
            "INSERT INTO processing_history (id, source_path, output_path, model, dj_preset, processed_at, duration_ms, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                entry.id,
                entry.source_path,
                entry.output_path,
                entry.model,
                entry.dj_preset,
                entry.processed_at,
                entry.duration_ms,
                entry.file_size,
            ],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, source_path, output_path, model, dj_preset, processed_at, duration_ms, file_size FROM processing_history WHERE id = ?"
        ).unwrap();

        let retrieved: ProcessingHistoryEntry = stmt
            .query_row(["test-123"], |row| {
                Ok(ProcessingHistoryEntry {
                    id: row.get(0)?,
                    source_path: row.get(1)?,
                    output_path: row.get(2)?,
                    model: row.get(3)?,
                    dj_preset: row.get(4)?,
                    processed_at: row.get(5)?,
                    duration_ms: row.get(6)?,
                    file_size: row.get(7)?,
                })
            })
            .unwrap();

        assert_eq!(retrieved.id, "test-123");
        assert_eq!(retrieved.model, "htdemucs");
        assert_eq!(retrieved.dj_preset, "rekordbox");
    }

    #[test]
    fn test_save_and_retrieve_settings() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let settings = vec![
            SettingEntry { key: "theme".to_string(), value: "dark".to_string() },
            SettingEntry { key: "language".to_string(), value: "en".to_string() },
            SettingEntry { key: "output_dir".to_string(), value: "/output".to_string() },
        ];

        for setting in &settings {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                params![setting.key, setting.value],
            )
            .unwrap();
        }

        let mut stmt = conn.prepare("SELECT key, value FROM settings").unwrap();
        let retrieved: Vec<SettingEntry> = stmt
            .query_map([], |row| {
                Ok(SettingEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(retrieved.len(), 3);
        assert!(retrieved.iter().any(|s| s.key == "theme" && s.value == "dark"));
        assert!(retrieved.iter().any(|s| s.key == "language" && s.value == "en"));
    }

    #[test]
    fn test_replace_existing_setting() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('theme', 'light')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'dark')",
            [],
        )
        .unwrap();

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key = 'theme'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let value: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'theme'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "dark");
    }

    #[test]
    fn test_history_with_various_dj_presets() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let presets = vec!["traktor", "rekordbox", "serato", "mixxx", "djay", "virtualdj"];

        for (i, preset) in presets.iter().enumerate() {
            conn.execute(
                "INSERT INTO processing_history (id, source_path, output_path, model, dj_preset, processed_at, duration_ms, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    format!("test-{}", i),
                    "/source.mp3",
                    "/output.stem.mp4",
                    "bs_roformer",
                    preset,
                    "2024-01-01T00:00:00Z",
                    1000,
                    1024,
                ],
            ).unwrap();
        }

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM processing_history", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 6);
    }

    #[test]
    fn test_separation_job_log_serialization() {
        let job = SeparationJobLog {
            job_id: "job_123".to_string(),
            source_path: "/music/track.mp3".to_string(),
            source_hash: "abc123def456".to_string(),
            source_size_bytes: 5_000_000,
            source_duration_secs: 180.5,
            source_sample_rate: 44100,
            separation_model: "bs_roformer".to_string(),
            model_version: Some("v1.0.0".to_string()),
            stemgen_gui_version: "1.0.10".to_string(),
            stemgen_version: Some("0.5.0".to_string()),
            dj_preset: "traktor".to_string(),
            output_format: "alac".to_string(),
            separation_quality_preset: Some("standard".to_string()),
            separation_params: Some(r#"{"shifts": 10}"#.to_string()),
            batch_id: Some("batch_001".to_string()),
            separation_timestamp: "2024-03-28T12:00:00Z".to_string(),
            output_path: "/music/track.stem.mp4".to_string(),
            success: true,
            error_message: None,
            processing_time_ms: 45000,
        };

        let json = serde_json::to_string(&job).unwrap();
        assert!(json.contains("job_123"));
        assert!(json.contains("bs_roformer"));
        assert!(json.contains("abc123def456"));
        assert!(json.contains("batch_001"));

        let deserialized: SeparationJobLog = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.job_id, "job_123");
        assert_eq!(deserialized.separation_model, "bs_roformer");
        assert_eq!(deserialized.success, true);
    }

    #[test]
    fn test_log_separation_job_roundtrip() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let job = SeparationJobLog {
            job_id: "job_test_001".to_string(),
            source_path: "/test/source.flac".to_string(),
            source_hash: "deadbeef123456".to_string(),
            source_size_bytes: 30_000_000,
            source_duration_secs: 300.0,
            source_sample_rate: 44100,
            separation_model: "htdemucs".to_string(),
            model_version: None,
            stemgen_gui_version: "1.0.10".to_string(),
            stemgen_version: None,
            dj_preset: "rekordbox".to_string(),
            output_format: "aac".to_string(),
            separation_quality_preset: None,
            separation_params: None,
            batch_id: None,
            separation_timestamp: "2024-03-28T14:00:00Z".to_string(),
            output_path: "/test/output.stem.mp4".to_string(),
            success: true,
            error_message: None,
            processing_time_ms: 60000,
        };

        conn.execute(
            "INSERT OR REPLACE INTO separation_job_log (
                job_id, source_path, source_hash, source_size_bytes,
                source_duration_secs, source_sample_rate, separation_model,
                model_version, stemgen_gui_version, stemgen_version,
                dj_preset, output_format, separation_quality_preset,
                separation_params, batch_id, separation_timestamp,
                output_path, success, error_message, processing_time_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                job.job_id, job.source_path, job.source_hash, job.source_size_bytes,
                job.source_duration_secs, job.source_sample_rate, job.separation_model,
                job.model_version, job.stemgen_gui_version, job.stemgen_version,
                job.dj_preset, job.output_format, job.separation_quality_preset,
                job.separation_params, job.batch_id, job.separation_timestamp,
                job.output_path, job.success, job.error_message, job.processing_time_ms,
            ],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT job_id, source_path, source_hash, source_size_bytes,
                    source_duration_secs, source_sample_rate, separation_model,
                    model_version, stemgen_gui_version, stemgen_version,
                    dj_preset, output_format, separation_quality_preset,
                    separation_params, batch_id, separation_timestamp,
                    output_path, success, error_message, processing_time_ms
             FROM separation_job_log WHERE job_id = ?"
        ).unwrap();

        let retrieved: SeparationJobLog = stmt
            .query_row(["job_test_001"], map_separation_job_log_row)
            .unwrap();

        assert_eq!(retrieved.job_id, "job_test_001");
        assert_eq!(retrieved.separation_model, "htdemucs");
        assert_eq!(retrieved.source_hash, "deadbeef123456");
        assert_eq!(retrieved.success, true);
        assert_eq!(retrieved.dj_preset, "rekordbox");
    }

    #[test]
    fn test_library_stats_empty() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let total_stem_files: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT job_id) FROM separation_job_log WHERE success = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total_stem_files, 0);
    }

    #[test]
    fn test_separation_job_log_with_null_optionals() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert with null optional fields
        conn.execute(
            "INSERT OR REPLACE INTO separation_job_log (
                job_id, source_path, source_hash, source_size_bytes,
                source_duration_secs, source_sample_rate, separation_model,
                model_version, stemgen_gui_version, stemgen_version,
                dj_preset, output_format, separation_quality_preset,
                separation_params, batch_id, separation_timestamp,
                output_path, success, error_message, processing_time_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, 0, NULL, ?)",
            params![
                "job_null_test",
                "/source.mp3",
                "hash123",
                1_000_000,
                120.0,
                44100,
                "demucs",
                "1.0.0",
                "traktor",
                "alac",
                "2024-03-28T12:00:00Z",
                "/output.stem.mp4",
                10000,
            ],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT job_id, source_path, source_hash, source_size_bytes,
                    source_duration_secs, source_sample_rate, separation_model,
                    model_version, stemgen_gui_version, stemgen_version,
                    dj_preset, output_format, separation_quality_preset,
                    separation_params, batch_id, separation_timestamp,
                    output_path, success, error_message, processing_time_ms
             FROM separation_job_log WHERE job_id = ?"
        ).unwrap();

        let retrieved: SeparationJobLog = stmt
            .query_row(["job_null_test"], map_separation_job_log_row)
            .unwrap();

        assert_eq!(retrieved.job_id, "job_null_test");
        assert!(retrieved.model_version.is_none());
        assert!(retrieved.stemgen_version.is_none());
        assert!(retrieved.separation_quality_preset.is_none());
        assert!(retrieved.batch_id.is_none());
    }
}
