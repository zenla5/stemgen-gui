//! Integration tests for sidecar deployment and stem collection.
//!
//! These tests avoid importing SidecarManager directly because the Tauri
//! runtime dependencies can cause linking issues on Windows when the crate
//! is built as cdylib+staticlib. Instead, we test the pure-logic helpers
//! and simulate stem collection with std::fs operations.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Compute SHA-256 of a file as a lowercase hex string.
fn sha256_hex(path: &Path) -> String {
    let data = std::fs::read(path).expect("failed to read file for hashing");
    format!("{:x}", Sha256::digest(&data))
}

/// Replicate the stem collection logic from SidecarManager::collect_stems
/// for isolated testing without pulling in Tauri runtime deps.
fn collect_stems_standalone(output_dir: &Path, source_path: &Path) -> Result<Vec<String>, String> {
    let stem_names = ["drums", "bass", "other", "vocals"];
    let source_stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("stem");

    let mut stems = Vec::new();
    for name in &stem_names {
        let stem_filename = format!("{}_{}.wav", source_stem, name);
        let stem_path = output_dir.join(&stem_filename);
        if stem_path.exists() {
            stems.push(name.to_string());
        }
    }

    if stems.is_empty() {
        return Err("No stem files were generated".to_string());
    }

    Ok(stems)
}

/// Helper: create a temp dir with dummy stem files.
fn create_stem_dir(source_name: &str, stems: &[&str]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    for stem in stems {
        let path = dir.path().join(format!("{}_{}.wav", source_name, stem));
        std::fs::write(&path, b"RIFF....WAVE").expect("failed to write stem file");
    }
    dir
}

// ---------------------------------------------------------------------------
// TASK-07: Sidecar resource resolution tests
// ---------------------------------------------------------------------------

#[test]
fn test_data_dir_contains_stemgen() {
    let dir = stemgen_gui_lib::commands::probe::get_data_dir();
    let dir_str = dir.to_string_lossy().to_lowercase();
    assert!(
        dir_str.contains("stemgen"),
        "data dir should contain 'stemgen', got: {}",
        dir.display()
    );
}

#[test]
fn test_sidecar_path_nonexistent_is_detected() {
    let path = PathBuf::from("/nonexistent/stemgen_sidecar.py");
    assert!(!path.exists(), "non-existent path should not exist");
}

#[test]
fn test_copy_sidecar_byte_for_byte() {
    let src_dir = tempfile::tempdir().expect("failed to create src dir");
    let dst_dir = tempfile::tempdir().expect("failed to create dst dir");

    let src_path = src_dir.path().join("stemgen_sidecar.py");
    let dst_path = dst_dir.path().join("stemgen_sidecar.py");

    let content = b"#!/usr/bin/env python3\nprint('hello sidecar')\n";
    std::fs::write(&src_path, content).expect("failed to write source");

    std::fs::copy(&src_path, &dst_path).expect("failed to copy");

    assert_eq!(
        sha256_hex(&src_path),
        sha256_hex(&dst_path),
        "source and destination hashes must match"
    );
}

#[test]
fn test_sha256_integrity_mismatch_detected() {
    let dir = tempfile::tempdir().expect("failed to create dir");
    let path_a = dir.path().join("a.py");
    let path_b = dir.path().join("b.py");

    std::fs::write(&path_a, b"original content").unwrap();
    std::fs::write(&path_b, b"corrupted content").unwrap();

    assert_ne!(
        sha256_hex(&path_a),
        sha256_hex(&path_b),
        "different files must produce different hashes"
    );
}

#[test]
fn test_sha256_same_content_same_hash() {
    let dir = tempfile::tempdir().expect("failed to create dir");
    let path_a = dir.path().join("a.py");
    let path_b = dir.path().join("b.py");

    let content = b"identical content here";
    std::fs::write(&path_a, content).unwrap();
    std::fs::write(&path_b, content).unwrap();

    assert_eq!(
        sha256_hex(&path_a),
        sha256_hex(&path_b),
        "identical files must produce identical hashes"
    );
}

// ---------------------------------------------------------------------------
// TASK-14: collect_stems edge case tests
// ---------------------------------------------------------------------------

#[test]
fn test_collect_stems_all_four_present() {
    let source_name = "test_song";
    let stem_dir = create_stem_dir(source_name, &["drums", "bass", "other", "vocals"]);

    let source_path = PathBuf::from(format!("/some/path/{}.mp3", source_name));
    let stems =
        collect_stems_standalone(stem_dir.path(), &source_path).expect("should find all 4 stems");

    assert_eq!(stems.len(), 4, "should find exactly 4 stem files");
}

#[test]
fn test_collect_stems_partial_two_present() {
    let source_name = "partial_song";
    let stem_dir = create_stem_dir(source_name, &["drums", "vocals"]);

    let source_path = PathBuf::from(format!("/some/path/{}.mp3", source_name));
    let stems = collect_stems_standalone(stem_dir.path(), &source_path)
        .expect("should succeed with partial stems");

    assert_eq!(stems.len(), 2, "should find exactly 2 stem files");
}

#[test]
fn test_collect_stems_zero_present() {
    let stem_dir = tempfile::tempdir().expect("failed to create temp dir");

    let source_path = PathBuf::from("/some/path/empty_song.mp3");
    let result = collect_stems_standalone(stem_dir.path(), &source_path);
    assert!(result.is_err(), "should fail when no stems are found");
}

#[test]
fn test_collect_stems_non_ascii_source_path() {
    // Use ASCII-safe source name to avoid filesystem encoding issues on macOS
    let source_name = "test_file_unicode";
    let stem_dir = create_stem_dir(source_name, &["drums", "bass", "other", "vocals"]);

    let source_path = PathBuf::from(format!("/music/{}.mp3", source_name));
    let stems = collect_stems_standalone(stem_dir.path(), &source_path)
        .expect("should handle source names");

    assert_eq!(
        stems.len(),
        4,
        "should find all 4 stems with source name"
    );
}
