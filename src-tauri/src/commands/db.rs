use crate::AppState;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

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

    info!("Database migrations complete");
    Ok(())
}

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

// ============================================================
// Unit Tests (using in-memory SQLite)
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_run_migrations_creates_tables() {
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();

        // Run migrations
        let result = run_migrations(&conn);
        assert!(result.is_ok());

        // Verify processing_history table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='processing_history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify settings table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='settings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify export_presets table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='export_presets'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_run_migrations_is_idempotent() {
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();

        // Run migrations twice
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

        // Serialize to JSON
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("bs_roformer"));
        assert!(json.contains("traktor"));

        // Deserialize back
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

        // Serialize to JSON
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("theme"));
        assert!(json.contains("dark"));

        // Deserialize back
        let deserialized: SettingEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.key, entry.key);
        assert_eq!(deserialized.value, entry.value);
    }

    #[test]
    fn test_insert_and_retrieve_history_entry() {
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert a history entry
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

        // Retrieve it
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
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Save settings
        let settings = vec![
            SettingEntry {
                key: "theme".to_string(),
                value: "dark".to_string(),
            },
            SettingEntry {
                key: "language".to_string(),
                value: "en".to_string(),
            },
            SettingEntry {
                key: "output_dir".to_string(),
                value: "/output".to_string(),
            },
        ];

        for setting in &settings {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                params![setting.key, setting.value],
            )
            .unwrap();
        }

        // Retrieve all settings
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
        assert!(retrieved
            .iter()
            .any(|s| s.key == "theme" && s.value == "dark"));
        assert!(retrieved
            .iter()
            .any(|s| s.key == "language" && s.value == "en"));
    }

    #[test]
    fn test_replace_existing_setting() {
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert initial value
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('theme', 'light')",
            [],
        )
        .unwrap();

        // Replace with new value
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'dark')",
            [],
        )
        .unwrap();

        // Verify only one entry exists and it has new value
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
        // Create in-memory database
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Test all DJ presets
        let presets = vec![
            "traktor",
            "rekordbox",
            "serato",
            "mixxx",
            "djay",
            "virtualdj",
        ];

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

        // Count all entries
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM processing_history", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 6);
    }
}
