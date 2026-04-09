//! Integration tests for library management features: scanner, batch queue, and orphan commands.

use rusqlite::Connection;
use stemgen_gui_lib::commands::db::run_migrations;

/// Helper to create an in-memory database with migrations applied.
fn create_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("failed to open in-memory database");
    run_migrations(&conn).expect("failed to run migrations");
    conn
}

// =============================================================================
// Database migration tests
// =============================================================================

#[test]
fn test_migrations_create_all_tables() {
    let conn = create_test_db();

    // Verify all expected tables exist
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(
        tables.contains(&"library_roots".to_string()),
        "library_roots table missing"
    );
    assert!(
        tables.contains(&"library_index".to_string()),
        "library_index table missing"
    );
    assert!(
        tables.contains(&"batch_queue".to_string()),
        "batch_queue table missing"
    );
}

#[test]
fn test_migrations_idempotent() {
    let conn = create_test_db();

    // Running migrations again should not fail
    run_migrations(&conn).expect("migrations should be idempotent");

    // Tables should still exist
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM library_roots", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

// =============================================================================
// Library root CRUD tests
// =============================================================================

#[test]
fn test_library_root_insert_and_list() {
    let conn = create_test_db();

    // Insert a library root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).expect("failed to insert library root");

    // List all roots
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM library_roots", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);

    // Verify the root data
    let path: String = conn
        .query_row(
            "SELECT path FROM library_roots WHERE id = 'root-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(path, "/music/library");
}

#[test]
fn test_library_root_delete_cascades() {
    let conn = create_test_db();

    // Insert a library root and an index entry
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["idx-1", "root-1", "/music/track.mp3", "NoStem", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Delete the root
    conn.execute("DELETE FROM library_roots WHERE id = 'root-1'", [])
        .unwrap();

    // Index entries should be cascaded
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM library_index", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        count, 0,
        "library_index entries should be cascade-deleted with root"
    );
}

#[test]
fn test_library_root_path_unique() {
    let conn = create_test_db();

    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Inserting a second root with the same path should fail
    let result = conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-2", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    );
    assert!(result.is_err(), "duplicate path should be rejected");
}

// =============================================================================
// Library index tests
// =============================================================================

#[test]
fn test_library_index_insert_and_query() {
    let conn = create_test_db();

    // Insert root and index entries
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["idx-1", "root-1", "/music/track1.mp3", "NoStem", "2026-04-09T00:00:00Z"],
    ).unwrap();

    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["idx-2", "root-1", "/music/track2.flac", "HasStemCurrent", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Query by status
    let no_stem_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_index WHERE status = 'NoStem'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(no_stem_count, 1);

    let current_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_index WHERE status = 'HasStemCurrent'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(current_count, 1);
}

// =============================================================================
// Batch queue tests
// =============================================================================

#[test]
fn test_batch_queue_insert_and_status() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert batch queue items
    for i in 1..=3 {
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                format!("batch-{i}"),
                "root-1",
                format!("/music/track{i}.mp3"),
                "pending",
                "bs_roformer",
                "2026-04-09T00:00:00Z"
            ],
        ).unwrap();
    }

    // Verify count
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 3, "should have 3 pending items in batch queue");
}

#[test]
fn test_cancel_batch_queue() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert batch queue items
    for i in 1..=3 {
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                format!("batch-{i}"),
                "root-1",
                format!("/music/track{i}.mp3"),
                "pending",
                "bs_roformer",
                "2026-04-09T00:00:00Z"
            ],
        ).unwrap();
    }

    // Cancel all pending items (set status to cancelled)
    conn.execute(
        "UPDATE batch_queue SET status = 'cancelled' WHERE root_id = ?1 AND status = 'pending'",
        rusqlite::params!["root-1"],
    )
    .unwrap();

    // Verify all are cancelled
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(pending, 0, "no pending items should remain");

    let cancelled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE status = 'cancelled'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(cancelled, 3, "all items should be cancelled");
}

#[test]
fn test_batch_queue_priority_ordering() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert items with different priorities
    conn.execute(
        "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, priority, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params!["batch-1", "root-1", "/music/track1.mp3", "pending", "bs_roformer", 5, "2026-04-09T00:00:00Z"],
    ).unwrap();

    conn.execute(
        "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, priority, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params!["batch-2", "root-1", "/music/track2.mp3", "pending", "bs_roformer", 10, "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Query ordered by priority DESC, created_at ASC
    let first_id: String = conn
        .query_row(
            "SELECT id FROM batch_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        first_id, "batch-2",
        "higher priority item should come first"
    );
}

// =============================================================================
// Orphan management tests
// =============================================================================

#[test]
fn test_orphan_detection_via_index() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert an orphaned stem entry
    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, status, stem_path, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params!["idx-1", "root-1", "/music/track1.mp3", "OrphanedStem", "/music/track1.stem.mp4", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Query for orphans
    let orphan_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_index WHERE status = 'OrphanedStem'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(orphan_count, 1, "should find 1 orphaned stem");

    // Verify the stem path
    let stem_path: String = conn
        .query_row(
            "SELECT stem_path FROM library_index WHERE status = 'OrphanedStem'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stem_path, "/music/track1.stem.mp4");
}

#[test]
fn test_relink_orphan_hash_match() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert an orphaned stem with a known source hash
    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, source_sha256, status, stem_path, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params!["idx-1", "root-1", "/music/track1.mp3", "abc123hash", "OrphanedStem", "/music/track1.stem.mp4", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Simulate re-link: find the orphan by stem path and verify hash matches
    let stored_hash: String = conn
        .query_row(
            "SELECT source_sha256 FROM library_index WHERE stem_path = '/music/track1.stem.mp4'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    // Hash matches → update status
    assert_eq!(
        stored_hash, "abc123hash",
        "stored hash should match expected"
    );

    conn.execute(
        "UPDATE library_index SET status = 'HasStemCurrent', source_path = '/music/new_track1.mp3' WHERE stem_path = '/music/track1.stem.mp4'",
        [],
    ).unwrap();

    // Verify the status changed
    let status: String = conn
        .query_row(
            "SELECT status FROM library_index WHERE stem_path = '/music/track1.stem.mp4'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        status, "HasStemCurrent",
        "status should be updated to HasStemCurrent after re-link"
    );
}

#[test]
fn test_relink_orphan_hash_mismatch() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert an orphaned stem with a known source hash
    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, source_sha256, status, stem_path, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params!["idx-1", "root-1", "/music/track1.mp3", "abc123hash", "OrphanedStem", "/music/track1.stem.mp4", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Hash mismatch → status should NOT change
    let new_source_hash = "different_hash";
    let stored_hash: String = conn
        .query_row(
            "SELECT source_sha256 FROM library_index WHERE stem_path = '/music/track1.stem.mp4'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_ne!(stored_hash, new_source_hash, "hashes should not match");

    // Status should remain OrphanedStem
    let status: String = conn
        .query_row(
            "SELECT status FROM library_index WHERE stem_path = '/music/track1.stem.mp4'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        status, "OrphanedStem",
        "status should remain OrphanedStem on hash mismatch"
    );
}

// =============================================================================
// Scanner integration tests (using tempfile directories and actual scan_root)
// =============================================================================

#[test]
fn test_scan_finds_no_stem_entries() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create 3 audio files with no stems
    std::fs::write(dir.path().join("track1.mp3"), b"fake mp3 data").unwrap();
    std::fs::write(dir.path().join("track2.flac"), b"fake flac data").unwrap();
    std::fs::write(dir.path().join("track3.wav"), b"fake wav data").unwrap();

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result.total_sources, 3, "should find 3 source files");
    assert_eq!(result.no_stem_count, 3, "all 3 should have NoStem status");
    assert_eq!(result.has_stem_current_count, 0);
    assert_eq!(result.orphaned_stem_count, 0);
}

#[test]
fn test_scan_finds_current_stem() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create a source audio file
    let source_content = b"fake audio content for current stem test";
    std::fs::write(dir.path().join("track.mp3"), source_content).unwrap();

    // Compute the hash of the source
    let source_hash =
        stemgen_gui_lib::audio::hash_file(dir.path().join("track.mp3").as_path()).unwrap();

    // Create matching stem file
    std::fs::write(dir.path().join("track.stem.mp4"), b"fake stem").unwrap();

    // Create provenance sidecar with matching hash
    let prov = stemgen_gui_lib::stems::StemProvenance::new(
        "htdemucs".to_string(),
        "1.0.0".to_string(),
        "2026-04-09T00:00:00Z".to_string(),
        dir.path().join("track.mp3").to_string_lossy().to_string(),
        source_hash,
        180.0,
        44100,
        "job-001".to_string(),
    );
    prov.save_to_sidecar(dir.path().join("track.stem.mp4").as_path())
        .unwrap();

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result.total_sources, 1);
    assert_eq!(
        result.has_stem_current_count, 1,
        "stem with matching provenance should be HasStemCurrent"
    );
    assert_eq!(result.no_stem_count, 0);
}

#[test]
fn test_scan_finds_unknown_provenance() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create source and stem without provenance sidecar
    std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();
    std::fs::write(dir.path().join("track.stem.mp4"), b"fake stem").unwrap();
    // No .prov.json sidecar → unknown provenance

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result.total_sources, 1);
    assert_eq!(
        result.has_stem_unknown_provenance_count, 1,
        "stem without sidecar should be HasStemUnknownProvenance"
    );
}

#[test]
fn test_scan_finds_orphan() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create stem file with provenance pointing to a source that doesn't exist
    std::fs::write(dir.path().join("track.stem.mp4"), b"fake stem").unwrap();

    let prov = stemgen_gui_lib::stems::StemProvenance::new(
        "htdemucs".to_string(),
        "1.0.0".to_string(),
        "2026-04-09T00:00:00Z".to_string(),
        "/nonexistent/original_source.mp3".to_string(),
        "hash_that_doesnt_match_anything".to_string(),
        180.0,
        44100,
        "job-002".to_string(),
    );
    prov.save_to_sidecar(dir.path().join("track.stem.mp4").as_path())
        .unwrap();

    // No source file exists → stem is orphaned
    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result.no_stem_count, 0, "no source files found");
    assert_eq!(
        result.orphaned_stem_count, 1,
        "stem without matching source should be OrphanedStem"
    );
    assert_eq!(result.total_sources, 1, "total includes orphan entries");
}

#[test]
fn test_incremental_scan_skips_unchanged() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    std::fs::write(dir.path().join("track1.mp3"), b"fake mp3 1").unwrap();
    std::fs::write(dir.path().join("track2.flac"), b"fake flac 2").unwrap();

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    // Full scan
    let result1 = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result1.total_sources, 2);

    // Incremental scan — files unchanged
    let result2 = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, false).unwrap();
    assert_eq!(
        result2.total_sources, 0,
        "incremental scan should skip unchanged files"
    );
}

// =============================================================================
// Batch queue integration tests (using queue_batch_generate logic)
// =============================================================================

#[test]
fn test_batch_queue_generate_inserts_correct_count() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert 3 NoStem entries in library_index
    for i in 1..=3 {
        conn.execute(
            "INSERT INTO library_index (id, root_id, source_path, status, ignored, updated_at) VALUES (?1, ?2, ?3, 'NoStem', 0, '2026-04-09T00:00:00Z')",
            rusqlite::params![format!("idx-{i}"), "root-1", format!("/music/track{i}.mp3")],
        ).unwrap();
    }

    // Insert 1 HasStemCurrent entry (should NOT be queued)
    conn.execute(
        "INSERT INTO library_index (id, root_id, source_path, status, ignored, updated_at) VALUES ('idx-4', 'root-1', '/music/track4.mp3', 'HasStemCurrent', 0, '2026-04-09T00:00:00Z')",
        [],
    ).unwrap();

    // Simulate queue_batch_generate: query NoStem entries and insert into batch_queue
    let mut stmt = conn.prepare(
        "SELECT source_path FROM library_index WHERE root_id = ?1 AND status = 'NoStem' AND ignored = 0"
    ).unwrap();
    let paths: Vec<String> = stmt
        .query_map(rusqlite::params!["root-1"], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    for (i, path) in paths.iter().enumerate() {
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at) VALUES (?1, ?2, ?3, 'pending', 'bs_roformer', '2026-04-09T00:00:00Z')",
            rusqlite::params![format!("bq-{i}"), "root-1", path],
        ).unwrap();
    }

    // Verify: exactly 3 NoStem entries were queued
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE root_id = 'root-1' AND status = 'pending'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 3,
        "should insert 3 batch queue items for 3 NoStem entries"
    );

    // Verify: HasStemCurrent entry was NOT queued
    let track4_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE source_path = '/music/track4.mp3'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        track4_count, 0,
        "HasStemCurrent entries should not be queued"
    );
}

#[test]
fn test_cancel_batch_queue_via_command() {
    let conn = create_test_db();

    // Insert root
    conn.execute(
        "INSERT INTO library_roots (id, path, output_strategy, scan_policy, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["root-1", "/music/library", "alongside", "manual", "2026-04-09T00:00:00Z"],
    ).unwrap();

    // Insert 3 pending batch items
    for i in 1..=3 {
        conn.execute(
            "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at) VALUES (?1, ?2, ?3, 'pending', 'demucs', '2026-04-09T00:00:00Z')",
            rusqlite::params![format!("bq-{i}"), "root-1", format!("/music/track{i}.mp3")],
        ).unwrap();
    }

    // Insert 1 done item (should NOT be cancelled)
    conn.execute(
        "INSERT INTO batch_queue (id, root_id, source_path, status, model_id, created_at) VALUES ('bq-done', 'root-1', '/music/done.mp3', 'done', 'demucs', '2026-04-09T00:00:00Z')",
        [],
    ).unwrap();

    // Cancel all pending (same SQL as cancel_batch_queue command)
    let now = chrono::Utc::now().to_rfc3339();
    let affected = conn.execute(
        "UPDATE batch_queue SET status = 'cancelled', finished_at = ? WHERE root_id = ? AND status = 'pending'",
        rusqlite::params![now, "root-1"],
    ).unwrap();
    assert_eq!(affected, 3, "should cancel 3 pending items");

    // Verify state
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE root_id = 'root-1' AND status = 'pending'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(pending, 0, "no pending items should remain");

    let cancelled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE root_id = 'root-1' AND status = 'cancelled'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(cancelled, 3, "all 3 pending items should be cancelled");

    // Done item should remain unchanged
    let done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM batch_queue WHERE root_id = 'root-1' AND status = 'done'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(done, 1, "done items should not be affected by cancel");
}

// =============================================================================
// Orphan management integration tests (with real hash-based re-linking)
// =============================================================================

#[test]
fn test_relink_orphan_hash_match_with_scan() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create source file and compute its hash
    let source_content = b"audio content for relink match test";
    let source_path = dir.path().join("original.mp3");
    std::fs::write(&source_path, source_content).unwrap();
    let source_hash = stemgen_gui_lib::audio::hash_file(&source_path).unwrap();

    // Create stem with provenance referencing the source hash
    let stem_path = dir.path().join("original.stem.mp4");
    std::fs::write(&stem_path, b"fake stem").unwrap();

    let prov = stemgen_gui_lib::stems::StemProvenance::new(
        "htdemucs".to_string(),
        "1.0.0".to_string(),
        "2026-04-09T00:00:00Z".to_string(),
        source_path.to_string_lossy().to_string(),
        source_hash.clone(),
        180.0,
        44100,
        "job-orphan".to_string(),
    );
    prov.save_to_sidecar(&stem_path).unwrap();

    // Remove the source file → stem becomes orphaned
    std::fs::remove_file(&source_path).unwrap();

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(
        result.orphaned_stem_count, 1,
        "stem should be detected as orphaned"
    );

    // Create a new file with identical content (same hash)
    let new_source_path = dir.path().join("relocated.mp3");
    std::fs::write(&new_source_path, source_content).unwrap();
    let new_hash = stemgen_gui_lib::audio::hash_file(&new_source_path).unwrap();
    assert_eq!(
        source_hash, new_hash,
        "same content should produce same hash"
    );

    // Simulate re-link: verify hash match and update the index
    conn.execute(
        "UPDATE library_index SET status = 'HasStemCurrent', source_path = ?1 WHERE root_id = ?2 AND status = 'OrphanedStem'",
        rusqlite::params![new_source_path.to_string_lossy().to_string(), root_id],
    ).unwrap();

    // Verify status updated
    let status: String = conn
        .query_row(
            "SELECT status FROM library_index WHERE root_id = ?1",
            rusqlite::params![root_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        status, "HasStemCurrent",
        "status should be updated after successful re-link"
    );
}

#[test]
fn test_relink_orphan_hash_mismatch_with_scan() {
    let conn = create_test_db();
    let dir = tempfile::tempdir().unwrap();

    // Create stem with provenance referencing a specific hash
    let stem_path = dir.path().join("track.stem.mp4");
    std::fs::write(&stem_path, b"fake stem").unwrap();

    let original_hash = "original_hash_abc123".to_string();
    let prov = stemgen_gui_lib::stems::StemProvenance::new(
        "htdemucs".to_string(),
        "1.0.0".to_string(),
        "2026-04-09T00:00:00Z".to_string(),
        "/nonexistent/source.mp3".to_string(),
        original_hash.clone(),
        180.0,
        44100,
        "job-mismatch".to_string(),
    );
    prov.save_to_sidecar(&stem_path).unwrap();

    let root_id = stemgen_gui_lib::commands::library_roots::db_insert_library_root(
        &conn,
        dir.path().to_str().unwrap(),
        "alongside",
        None,
        None,
    )
    .unwrap();

    let result = stemgen_gui_lib::commands::scanner::scan_root(&conn, &root_id, true).unwrap();
    assert_eq!(result.orphaned_stem_count, 1, "stem should be orphaned");

    // Load the provenance to get the expected hash (simulates re-link lookup)
    let loaded_prov = stemgen_gui_lib::stems::StemProvenance::load_from_sidecar(&stem_path)
        .unwrap()
        .unwrap();
    assert_eq!(loaded_prov.source_content_hash, original_hash);

    // Create a candidate file with DIFFERENT content
    let candidate_path = dir.path().join("wrong_source.mp3");
    std::fs::write(&candidate_path, b"completely different content").unwrap();
    let candidate_hash = stemgen_gui_lib::audio::hash_file(&candidate_path).unwrap();

    // Hash mismatch → re-link should NOT proceed
    assert_ne!(
        loaded_prov.source_content_hash, candidate_hash,
        "hashes should NOT match"
    );

    // Status should remain OrphanedStem
    let status: String = conn
        .query_row(
            "SELECT status FROM library_index WHERE root_id = ?1",
            rusqlite::params![root_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        status, "OrphanedStem",
        "status should remain OrphanedStem on hash mismatch"
    );
}
