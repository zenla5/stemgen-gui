use crate::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{debug, info};

/// Status of a batch queue item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchQueueStatus {
    Pending,
    Processing,
    Done,
    Error,
    Cancelled,
}

impl std::fmt::Display for BatchQueueStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchQueueStatus::Pending => write!(f, "pending"),
            BatchQueueStatus::Processing => write!(f, "processing"),
            BatchQueueStatus::Done => write!(f, "done"),
            BatchQueueStatus::Error => write!(f, "error"),
            BatchQueueStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl BatchQueueStatus {
    /// Parse from the string stored in SQLite.
    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "processing" => Some(Self::Processing),
            "done" => Some(Self::Done),
            "error" => Some(Self::Error),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

/// A single item in the batch processing queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueueItem {
    pub id: String,
    pub root_id: String,
    pub source_path: String,
    pub status: BatchQueueStatus,
    pub model_id: String,
    pub dj_preset: Option<String>,
    pub output_format: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub error_message: Option<String>,
    pub priority: i64,
}

/// Result of a batch queue operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueueResult {
    pub queued_count: usize,
    pub total_duration_secs: f64,
}

/// Summary of batch queue status for a root.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueueStatusSummary {
    pub pending_count: usize,
    pub processing_count: usize,
    pub done_count: usize,
    pub error_count: usize,
    pub cancelled_count: usize,
    pub total_count: usize,
    pub next_items: Vec<BatchQueueItem>,
}

/// Generate a unique ID with a prefix.
fn generate_id(prefix: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{}_{:016x}", prefix, ts)
}

/// Queue batch generation for all NoStem entries in a library root.
#[tauri::command]
pub async fn queue_batch_generate(
    state: State<'_, AppState>,
    root_id: String,
    model_id: String,
    dj_preset: Option<String>,
    output_format: Option<String>,
) -> Result<BatchQueueResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Query NoStem entries
    let mut stmt = conn
        .prepare(
            "SELECT source_path FROM library_index
             WHERE root_id = ? AND status = 'NoStem' AND ignored = 0",
        )
        .map_err(|e| format!("Failed to query NoStem entries: {}", e))?;

    let source_paths: Vec<String> = stmt
        .query_map(params![root_id], |row| row.get(0))
        .map_err(|e| format!("Failed to read entries: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let queued_count = source_paths.len();

    for source_path in &source_paths {
        let item_id = generate_id("bq");
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, dj_preset, output_format, created_at, priority)
             VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 0)",
            params![item_id, root_id, source_path, model_id, dj_preset, output_format, now],
        )
        .map_err(|e| format!("Failed to insert batch item: {}", e))?;
    }

    info!(
        "Queued {} items for batch generation in root {}",
        queued_count, root_id
    );

    Ok(BatchQueueResult {
        queued_count,
        total_duration_secs: 0.0,
    })
}

/// Queue batch regeneration for outdated (and optionally unknown-provenance) stems.
#[tauri::command]
pub async fn queue_batch_regenerate(
    state: State<'_, AppState>,
    root_id: String,
    model_id: String,
    include_unknown_provenance: bool,
    dj_preset: Option<String>,
    output_format: Option<String>,
) -> Result<BatchQueueResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let query = if include_unknown_provenance {
        "SELECT source_path FROM library_index
         WHERE root_id = ? AND status IN ('HasStemOutdated', 'HasStemUnknownProvenance') AND ignored = 0"
    } else {
        "SELECT source_path FROM library_index
         WHERE root_id = ? AND status = 'HasStemOutdated' AND ignored = 0"
    };

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("Failed to query entries: {}", e))?;

    let source_paths: Vec<String> = stmt
        .query_map(params![root_id], |row| row.get(0))
        .map_err(|e| format!("Failed to read entries: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let queued_count = source_paths.len();

    for source_path in &source_paths {
        let item_id = generate_id("bq");
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, dj_preset, output_format, created_at, priority)
             VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 0)",
            params![item_id, root_id, source_path, model_id, dj_preset, output_format, now],
        )
        .map_err(|e| format!("Failed to insert batch item: {}", e))?;
    }

    info!(
        "Queued {} items for batch regeneration in root {}",
        queued_count, root_id
    );

    Ok(BatchQueueResult {
        queued_count,
        total_duration_secs: 0.0,
    })
}

/// Get the batch queue status summary for a library root.
#[tauri::command]
pub async fn get_batch_queue_status(
    state: State<'_, AppState>,
    root_id: String,
) -> Result<BatchQueueStatusSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let count_by_status = |status: &str| -> Result<usize, String> {
        conn.query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE root_id = ? AND status = ?",
            params![root_id, status],
            |row| row.get::<_, i64>(0).map(|v| v as usize),
        )
        .map_err(|e| format!("Failed to count {}: {}", status, e))
    };

    let pending_count = count_by_status("pending")?;
    let processing_count = count_by_status("processing")?;
    let done_count = count_by_status("done")?;
    let error_count = count_by_status("error")?;
    let cancelled_count = count_by_status("cancelled")?;

    // Get next 50 items (pending first, then processing)
    let mut stmt = conn
        .prepare(
            "SELECT id, root_id, source_path, status, model_id, dj_preset, output_format,
                    created_at, started_at, finished_at, error_message, priority
             FROM batch_queue
             WHERE root_id = ? AND status IN ('pending', 'processing')
             ORDER BY priority DESC, created_at ASC
             LIMIT 50",
        )
        .map_err(|e| format!("Failed to query items: {}", e))?;

    let next_items: Vec<BatchQueueItem> = stmt
        .query_map(params![root_id], |row| {
            let status_str: String = row.get(3)?;
            Ok(BatchQueueItem {
                id: row.get(0)?,
                root_id: row.get(1)?,
                source_path: row.get(2)?,
                status: BatchQueueStatus::from_db(&status_str).unwrap_or(BatchQueueStatus::Pending),
                model_id: row.get(4)?,
                dj_preset: row.get(5)?,
                output_format: row.get(6)?,
                created_at: row.get(7)?,
                started_at: row.get(8)?,
                finished_at: row.get(9)?,
                error_message: row.get(10)?,
                priority: row.get(11)?,
            })
        })
        .map_err(|e| format!("Failed to read items: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let total_count = pending_count + processing_count + done_count + error_count + cancelled_count;

    Ok(BatchQueueStatusSummary {
        pending_count,
        processing_count,
        done_count,
        error_count,
        cancelled_count,
        total_count,
        next_items,
    })
}

/// Pause the batch queue for a library root.
#[tauri::command]
pub async fn pause_batch_queue(state: State<'_, AppState>, root_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')",
        params![format!("batch_pause_{}", root_id)],
    )
    .map_err(|e| format!("Failed to pause batch queue: {}", e))?;

    info!("Batch queue paused for root {}", root_id);
    Ok(())
}

/// Resume the batch queue for a library root.
#[tauri::command]
pub async fn resume_batch_queue(state: State<'_, AppState>, root_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM settings WHERE key = ?",
        params![format!("batch_pause_{}", root_id)],
    )
    .map_err(|e| format!("Failed to resume batch queue: {}", e))?;

    info!("Batch queue resumed for root {}", root_id);
    Ok(())
}

/// Cancel all pending batch queue items for a library root.
#[tauri::command]
pub async fn cancel_batch_queue(state: State<'_, AppState>, root_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE batch_queue SET status = 'cancelled', finished_at = ?
         WHERE root_id = ? AND status = 'pending'",
            params![now, root_id],
        )
        .map_err(|e| format!("Failed to cancel batch queue: {}", e))?;

    info!("Cancelled {} pending items for root {}", affected, root_id);
    Ok(())
}

/// Clear completed (done and cancelled) batch queue items for a library root.
#[tauri::command]
pub async fn clear_completed_queue(
    state: State<'_, AppState>,
    root_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let deleted = conn
        .execute(
            "DELETE FROM batch_queue WHERE root_id = ? AND status IN ('done', 'cancelled')",
            params![root_id],
        )
        .map_err(|e| format!("Failed to clear completed items: {}", e))?;

    debug!("Cleared {} completed items for root {}", deleted, root_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::db::run_migrations;
    use rusqlite::Connection;

    fn setup_test_db() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let root_id = "test_root";
        conn.execute(
            "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at)
             VALUES (?, '/tmp/test', 'alongside', 'manual', '2024-01-01T00:00:00Z')",
            params![root_id],
        )
        .unwrap();

        (conn, root_id.to_string())
    }

    fn insert_library_entry(conn: &Connection, root_id: &str, id: &str, status: &str) {
        conn.execute(
            "INSERT INTO library_index (id, root_id, source_path, status, ignored, updated_at)
             VALUES (?, ?, ?, ?, 0, '2024-01-01T00:00:00Z')",
            params![id, root_id, format!("/music/track_{}.mp3", id), status],
        )
        .unwrap();
    }

    #[test]
    fn test_batch_queue_status_serialization() {
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Pending).unwrap(),
            "\"pending\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Processing).unwrap(),
            "\"processing\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Done).unwrap(),
            "\"done\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Error).unwrap(),
            "\"error\""
        );
        assert_eq!(
            serde_json::to_string(&BatchQueueStatus::Cancelled).unwrap(),
            "\"cancelled\""
        );
    }

    #[test]
    fn test_batch_queue_status_deserialization() {
        let pending: BatchQueueStatus = serde_json::from_str("\"pending\"").unwrap();
        assert_eq!(pending, BatchQueueStatus::Pending);

        let processing: BatchQueueStatus = serde_json::from_str("\"processing\"").unwrap();
        assert_eq!(processing, BatchQueueStatus::Processing);

        let done: BatchQueueStatus = serde_json::from_str("\"done\"").unwrap();
        assert_eq!(done, BatchQueueStatus::Done);

        let error: BatchQueueStatus = serde_json::from_str("\"error\"").unwrap();
        assert_eq!(error, BatchQueueStatus::Error);

        let cancelled: BatchQueueStatus = serde_json::from_str("\"cancelled\"").unwrap();
        assert_eq!(cancelled, BatchQueueStatus::Cancelled);
    }

    #[test]
    fn test_batch_queue_status_from_db() {
        assert_eq!(
            BatchQueueStatus::from_db("pending"),
            Some(BatchQueueStatus::Pending)
        );
        assert_eq!(
            BatchQueueStatus::from_db("processing"),
            Some(BatchQueueStatus::Processing)
        );
        assert_eq!(
            BatchQueueStatus::from_db("done"),
            Some(BatchQueueStatus::Done)
        );
        assert_eq!(
            BatchQueueStatus::from_db("error"),
            Some(BatchQueueStatus::Error)
        );
        assert_eq!(
            BatchQueueStatus::from_db("cancelled"),
            Some(BatchQueueStatus::Cancelled)
        );
        assert_eq!(BatchQueueStatus::from_db("invalid"), None);
    }

    #[test]
    fn test_batch_queue_status_display() {
        assert_eq!(format!("{}", BatchQueueStatus::Pending), "pending");
        assert_eq!(format!("{}", BatchQueueStatus::Processing), "processing");
        assert_eq!(format!("{}", BatchQueueStatus::Done), "done");
        assert_eq!(format!("{}", BatchQueueStatus::Error), "error");
        assert_eq!(format!("{}", BatchQueueStatus::Cancelled), "cancelled");
    }

    #[test]
    fn test_batch_queue_item_serialization_roundtrip() {
        let item = BatchQueueItem {
            id: "item_001".to_string(),
            root_id: "root_abc".to_string(),
            source_path: "/music/track1.mp3".to_string(),
            status: BatchQueueStatus::Pending,
            model_id: "bs_roformer".to_string(),
            dj_preset: Some("traktor".to_string()),
            output_format: Some("alac".to_string()),
            created_at: "2024-03-28T12:00:00Z".to_string(),
            started_at: None,
            finished_at: None,
            error_message: None,
            priority: 0,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("item_001"));
        assert!(json.contains("root_abc"));
        assert!(json.contains("pending"));

        let deserialized: BatchQueueItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "item_001");
        assert_eq!(deserialized.root_id, "root_abc");
        assert_eq!(deserialized.status, BatchQueueStatus::Pending);
        assert_eq!(deserialized.model_id, "bs_roformer");
        assert_eq!(deserialized.dj_preset, Some("traktor".to_string()));
        assert!(deserialized.started_at.is_none());
    }

    #[test]
    fn test_batch_queue_item_error_status() {
        let item = BatchQueueItem {
            id: "item_err".to_string(),
            root_id: "root_abc".to_string(),
            source_path: "/music/track2.flac".to_string(),
            status: BatchQueueStatus::Error,
            model_id: "htdemucs".to_string(),
            dj_preset: None,
            output_format: None,
            created_at: "2024-03-28T12:00:00Z".to_string(),
            started_at: Some("2024-03-28T12:01:00Z".to_string()),
            finished_at: Some("2024-03-28T12:05:00Z".to_string()),
            error_message: Some("Sidecar timeout".to_string()),
            priority: 5,
        };

        let json = serde_json::to_string(&item).unwrap();
        let deserialized: BatchQueueItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, BatchQueueStatus::Error);
        assert_eq!(
            deserialized.error_message,
            Some("Sidecar timeout".to_string())
        );
        assert_eq!(deserialized.priority, 5);
    }

    #[test]
    fn test_batch_queue_insert_and_query() {
        let (conn, root_id) = setup_test_db();
        insert_library_entry(&conn, &root_id, "t1", "NoStem");
        insert_library_entry(&conn, &root_id, "t2", "NoStem");
        insert_library_entry(&conn, &root_id, "t3", "HasStemCurrent");

        // Insert batch items for NoStem entries
        let mut stmt = conn
            .prepare(
                "SELECT source_path FROM library_index WHERE root_id = ? AND status = 'NoStem'",
            )
            .unwrap();
        let paths: Vec<String> = stmt
            .query_map(params![root_id], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(paths.len(), 2);

        for (i, path) in paths.iter().enumerate() {
            conn.execute(
                "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at, priority)
                 VALUES (?, ?, ?, 'pending', 'bs_roformer', '2024-01-01T00:00:00Z', 0)",
                params![format!("bq_{}", i), root_id, path],
            )
            .unwrap();
        }

        // Verify count
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM batch_queue WHERE root_id = ? AND status = 'pending'",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_batch_queue_cancel() {
        let (conn, root_id) = setup_test_db();

        // Insert 3 pending items
        for i in 0..3 {
            conn.execute(
                "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at, priority)
                 VALUES (?, ?, ?, 'pending', 'demucs', '2024-01-01T00:00:00Z', 0)",
                params![format!("bq_{}", i), root_id, format!("/music/track_{}.mp3", i)],
            )
            .unwrap();
        }

        // Cancel all pending
        let affected = conn.execute(
            "UPDATE batch_queue SET status = 'cancelled' WHERE root_id = ? AND status = 'pending'",
            params![root_id],
        )
        .unwrap();
        assert_eq!(affected, 3);

        // Verify all are cancelled
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM batch_queue WHERE root_id = ? AND status = 'pending'",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 0);

        let cancelled: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM batch_queue WHERE root_id = ? AND status = 'cancelled'",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cancelled, 3);
    }

    #[test]
    fn test_batch_queue_status_summary_counts() {
        let (conn, root_id) = setup_test_db();

        let statuses = [
            "pending",
            "pending",
            "processing",
            "done",
            "error",
            "cancelled",
        ];
        for (i, status) in statuses.iter().enumerate() {
            conn.execute(
                "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at, priority)
                 VALUES (?, ?, ?, ?, 'htdemucs', '2024-01-01T00:00:00Z', 0)",
                params![format!("bq_{}", i), root_id, format!("/music/track_{}.mp3", i), status],
            )
            .unwrap();
        }

        let count_by_status = |status: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM batch_queue WHERE root_id = ? AND status = ?",
                params![root_id, status],
                |row| row.get(0),
            )
            .unwrap()
        };

        assert_eq!(count_by_status("pending"), 2);
        assert_eq!(count_by_status("processing"), 1);
        assert_eq!(count_by_status("done"), 1);
        assert_eq!(count_by_status("error"), 1);
        assert_eq!(count_by_status("cancelled"), 1);
    }

    #[test]
    fn test_batch_queue_pause_via_settings() {
        let (conn, root_id) = setup_test_db();

        // Set pause
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')",
            params![format!("batch_pause_{}", root_id)],
        )
        .unwrap();

        // Check pause flag
        let paused: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?",
                params![format!("batch_pause_{}", root_id)],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(paused, "true");

        // Remove pause
        conn.execute(
            "DELETE FROM settings WHERE key = ?",
            params![format!("batch_pause_{}", root_id)],
        )
        .unwrap();

        let result: rusqlite::Result<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?",
            params![format!("batch_pause_{}", root_id)],
            |row| row.get(0),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_queue_clear_completed() {
        let (conn, root_id) = setup_test_db();

        let statuses = ["pending", "done", "done", "cancelled", "error"];
        for (i, status) in statuses.iter().enumerate() {
            conn.execute(
                "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at, priority)
                 VALUES (?, ?, ?, ?, 'demucs', '2024-01-01T00:00:00Z', 0)",
                params![format!("bq_{}", i), root_id, format!("/music/track_{}.mp3", i), status],
            )
            .unwrap();
        }

        // Clear completed (done + cancelled)
        conn.execute(
            "DELETE FROM batch_queue WHERE root_id = ? AND status IN ('done', 'cancelled')",
            params![root_id],
        )
        .unwrap();

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM batch_queue WHERE root_id = ?",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 2); // pending + error remain
    }

    #[test]
    fn test_batch_queue_regenerate_query() {
        let (conn, root_id) = setup_test_db();

        insert_library_entry(&conn, &root_id, "t1", "HasStemOutdated");
        insert_library_entry(&conn, &root_id, "t2", "HasStemUnknownProvenance");
        insert_library_entry(&conn, &root_id, "t3", "HasStemCurrent");

        // Without unknown provenance
        let count_no_unknown: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_index
                 WHERE root_id = ? AND status = 'HasStemOutdated' AND ignored = 0",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_no_unknown, 1);

        // With unknown provenance
        let count_with_unknown: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_index
                 WHERE root_id = ? AND status IN ('HasStemOutdated', 'HasStemUnknownProvenance') AND ignored = 0",
                params![root_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_with_unknown, 2);
    }
}
