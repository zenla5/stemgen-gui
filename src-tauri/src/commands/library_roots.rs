use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

// =============================================================================
// Data Types
// =============================================================================

/// A configured library root directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryRoot {
    pub id: String,
    pub path: String,
    pub output_strategy: String,
    pub mirrored_path: Option<String>,
    pub flat_path: Option<String>,
    pub scan_policy: String,
    pub ignored_globs: Option<String>,
    pub staleness_policy: Option<String>,
    pub created_at: String,
    pub last_scanned_at: Option<String>,
}

/// Partial update for a library root.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryRootUpdate {
    pub output_strategy: Option<String>,
    pub mirrored_path: Option<String>,
    pub flat_path: Option<String>,
    pub scan_policy: Option<String>,
    pub ignored_globs: Option<String>,
    pub staleness_policy: Option<String>,
}

// =============================================================================
// Internal helpers (testable without Tauri state)
// =============================================================================

/// Generate a unique ID with a prefix.
fn generate_id(prefix: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{}_{:016x}", prefix, ts)
}

const SELECT_COLUMNS: &str = "id, path, output_strategy, mirrored_path, flat_path, \
                              scan_policy, ignored_globs, staleness_policy, created_at, last_scanned_at";

fn row_to_library_root(row: &rusqlite::Row) -> rusqlite::Result<LibraryRoot> {
    Ok(LibraryRoot {
        id: row.get(0)?,
        path: row.get(1)?,
        output_strategy: row.get(2)?,
        mirrored_path: row.get(3)?,
        flat_path: row.get(4)?,
        scan_policy: row.get(5)?,
        ignored_globs: row.get(6)?,
        staleness_policy: row.get(7)?,
        created_at: row.get(8)?,
        last_scanned_at: row.get(9)?,
    })
}

/// Insert a library root. Returns the generated id.
pub fn db_insert_library_root(
    conn: &Connection,
    path: &str,
    output_strategy: &str,
    mirrored_path: Option<&str>,
    flat_path: Option<&str>,
) -> Result<String> {
    let id = generate_id("root");
    let created_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, mirrored_path, flat_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![id, path, output_strategy, mirrored_path, flat_path, created_at],
    )?;

    Ok(id)
}

/// List all library roots.
pub fn db_list_library_roots(conn: &Connection) -> Result<Vec<LibraryRoot>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM library_roots ORDER BY created_at",
        SELECT_COLUMNS
    ))?;

    let rows = stmt
        .query_map([], row_to_library_root)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Get a single library root by id.
pub fn db_get_library_root(conn: &Connection, id: &str) -> Result<Option<LibraryRoot>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM library_roots WHERE id = ?",
        SELECT_COLUMNS
    ))?;

    let result = stmt.query_row([id], row_to_library_root).optional()?;

    Ok(result)
}

/// Update a library root's mutable fields.
pub fn db_update_library_root(
    conn: &Connection,
    id: &str,
    updates: &LibraryRootUpdate,
) -> Result<()> {
    if let Some(ref strategy) = updates.output_strategy {
        conn.execute(
            "UPDATE library_roots SET output_strategy = ? WHERE id = ?",
            params![strategy, id],
        )?;
    }
    if let Some(ref mirrored) = updates.mirrored_path {
        conn.execute(
            "UPDATE library_roots SET mirrored_path = ? WHERE id = ?",
            params![mirrored, id],
        )?;
    }
    if let Some(ref flat) = updates.flat_path {
        conn.execute(
            "UPDATE library_roots SET flat_path = ? WHERE id = ?",
            params![flat, id],
        )?;
    }
    if let Some(ref policy) = updates.scan_policy {
        conn.execute(
            "UPDATE library_roots SET scan_policy = ? WHERE id = ?",
            params![policy, id],
        )?;
    }
    if let Some(ref globs) = updates.ignored_globs {
        conn.execute(
            "UPDATE library_roots SET ignored_globs = ? WHERE id = ?",
            params![globs, id],
        )?;
    }
    if let Some(ref staleness) = updates.staleness_policy {
        conn.execute(
            "UPDATE library_roots SET staleness_policy = ? WHERE id = ?",
            params![staleness, id],
        )?;
    }
    Ok(())
}

/// Delete a library root and its cascading data.
pub fn db_delete_library_root(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM library_roots WHERE id = ?", [id])?;
    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

#[tauri::command]
pub async fn add_library_root(
    state: State<'_, AppState>,
    path: String,
    output_strategy: Option<String>,
    mirrored_path: Option<String>,
    flat_path: Option<String>,
) -> Result<String, String> {
    info!("Adding library root: {}", path);

    // Validate path exists on disk
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let strategy = output_strategy.unwrap_or_else(|| "alongside".to_string());
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    db_insert_library_root(
        &conn,
        &path,
        &strategy,
        mirrored_path.as_deref(),
        flat_path.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_library_roots(state: State<'_, AppState>) -> Result<Vec<LibraryRoot>, String> {
    info!("Listing library roots");

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db_list_library_roots(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_library_root(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<LibraryRoot>, String> {
    info!("Getting library root: {}", id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db_get_library_root(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_library_root(
    state: State<'_, AppState>,
    id: String,
    updates: LibraryRootUpdate,
) -> Result<(), String> {
    info!("Updating library root: {}", id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db_update_library_root(&conn, &id, &updates).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_library_root(state: State<'_, AppState>, id: String) -> Result<(), String> {
    info!("Deleting library root: {}", id);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db_delete_library_root(&conn, &id).map_err(|e| e.to_string())
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::db::run_migrations;

    #[test]
    fn test_insert_and_list_library_root() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let id = db_insert_library_root(&conn, "/music/library", "alongside", None, None).unwrap();
        assert!(!id.is_empty());

        let roots = db_list_library_roots(&conn).unwrap();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].path, "/music/library");
        assert_eq!(roots[0].output_strategy, "alongside");
        assert_eq!(roots[0].scan_policy, "manual");
    }

    #[test]
    fn test_get_library_root_by_id() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let id = db_insert_library_root(&conn, "/music", "mirrored", Some("/backup/music"), None)
            .unwrap();

        let root = db_get_library_root(&conn, &id).unwrap().unwrap();
        assert_eq!(root.path, "/music");
        assert_eq!(root.output_strategy, "mirrored");
        assert_eq!(root.mirrored_path, Some("/backup/music".to_string()));
    }

    #[test]
    fn test_get_library_root_not_found() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let result = db_get_library_root(&conn, "nonexistent-id").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_library_root() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let id = db_insert_library_root(&conn, "/music", "alongside", None, None).unwrap();

        let updates = LibraryRootUpdate {
            output_strategy: Some("flat".to_string()),
            flat_path: Some("/output/all".to_string()),
            scan_policy: Some("on_open".to_string()),
            ..Default::default()
        };
        db_update_library_root(&conn, &id, &updates).unwrap();

        let root = db_get_library_root(&conn, &id).unwrap().unwrap();
        assert_eq!(root.output_strategy, "flat");
        assert_eq!(root.flat_path, Some("/output/all".to_string()));
        assert_eq!(root.scan_policy, "on_open");
    }

    #[test]
    fn test_delete_library_root() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let id = db_insert_library_root(&conn, "/music", "alongside", None, None).unwrap();

        db_delete_library_root(&conn, &id).unwrap();

        let result = db_get_library_root(&conn, &id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_cascades_to_library_index() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let root_id = db_insert_library_root(&conn, "/music", "alongside", None, None).unwrap();

        // Insert a library index entry referencing this root
        conn.execute(
            "INSERT INTO library_index (id, root_id, source_path, status, updated_at)
             VALUES ('idx1', ?, '/music/song.mp3', 'NoStem', '2024-01-01T00:00:00Z')",
            params![root_id],
        )
        .unwrap();

        let count_before: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_index WHERE root_id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_before, 1);

        db_delete_library_root(&conn, &root_id).unwrap();

        let count_after: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_index WHERE root_id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn test_multiple_library_roots() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        db_insert_library_root(&conn, "/music/rock", "alongside", None, None).unwrap();
        db_insert_library_root(&conn, "/music/jazz", "mirrored", Some("/backup/jazz"), None)
            .unwrap();
        db_insert_library_root(
            &conn,
            "/music/electronic",
            "flat",
            None,
            Some("/output/stems"),
        )
        .unwrap();

        let roots = db_list_library_roots(&conn).unwrap();
        assert_eq!(roots.len(), 3);

        let paths: Vec<&str> = roots.iter().map(|r| r.path.as_str()).collect();
        assert!(paths.contains(&"/music/rock"));
        assert!(paths.contains(&"/music/jazz"));
        assert!(paths.contains(&"/music/electronic"));
    }

    #[test]
    fn test_library_root_serialization() {
        let root = LibraryRoot {
            id: "test-id".to_string(),
            path: "/music".to_string(),
            output_strategy: "alongside".to_string(),
            mirrored_path: None,
            flat_path: None,
            scan_policy: "manual".to_string(),
            ignored_globs: Some("[\"**/Samples/**\"]".to_string()),
            staleness_policy: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            last_scanned_at: None,
        };

        let json = serde_json::to_string(&root).unwrap();
        assert!(json.contains("/music"));
        assert!(json.contains("alongside"));

        let deserialized: LibraryRoot = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.path, "/music");
        assert_eq!(
            deserialized.ignored_globs,
            Some("[\"**/Samples/**\"]".to_string())
        );
    }
}
