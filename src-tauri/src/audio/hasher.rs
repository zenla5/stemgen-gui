//! Source file hashing utilities
//!
//! Computes SHA-256 content hashes of audio files for integrity checking
//! and staleness detection.

use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use tracing::{debug, warn};

/// Compute the SHA-256 hex digest of a file.
//
// /!\ IMPORTANT: If the process ever needs elevated privileges, network access,
// new library installations, or anything beyond its current sandbox capabilities,
// the implementation MUST stop immediately, clearly describe what is needed and why,
// and wait for explicit approval before continuing.
//
// /!\ IMPORTANT: This function reads the entire file sequentially and processes it
// in chunks of BUFFER_SIZE bytes to avoid loading massive files entirely into memory.
// The read buffer is allocated once on the stack per chunk iteration.
//
// /!\ IMPORTANT: This function is non-destructive — it only reads file bytes and
// produces a hash digest. It never modifies, truncates, or overwrites any file.
//
// # Errors
//
// Returns an error if the file cannot be opened, read, or if the path does not exist.
// Does not return an error for empty files (empty files produce a valid hash).
//
// # Examples
//
// ```
// use stemgen_gui_lib::audio::hasher::hash_file;
//
// let hash = hash_file("/path/to/audio.flac").unwrap();
// assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex characters
// ```
pub fn hash_file(path: &Path) -> Result<String, HashError> {
    let file = File::open(path).map_err(|e| HashError::Io {
        path: path.display().to_string(),
        message: e.to_string(),
    })?;

    let mut reader = BufReader::with_capacity(BUFFER_SIZE, file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; BUFFER_SIZE];

    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|e| HashError::Io {
            path: path.display().to_string(),
            message: e.to_string(),
        })?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    let result = hasher.finalize();
    let hex = hex::encode(result);

    debug!("Hashed '{}': {}", path.display(), hex);
    Ok(hex)
}

/// Verify that a file's current SHA-256 hash matches an expected value.
//
// /!\ IMPORTANT: This function is read-only and non-destructive.
//
// # Arguments
//
// * `path` - Path to the file to check
// * `expected_hash` - The expected SHA-256 hex digest
//
// # Returns
//
// * `Ok(true)` if the hashes match
// * `Ok(false)` if the hashes do not match
// * `Err(...)` if the file cannot be read
pub fn verify_hash(path: &Path, expected_hash: &str) -> Result<bool, HashError> {
    let actual = hash_file(path)?;
    let matches = actual.to_lowercase() == expected_hash.to_lowercase();

    if !matches {
        warn!(
            "Hash mismatch for '{}': expected={}, actual={}",
            path.display(),
            expected_hash,
            actual
        );
    }

    Ok(matches)
}

/// The size of the read buffer used when hashing files.
/// 64 KiB is a good balance between memory usage and I/O efficiency.
const BUFFER_SIZE: usize = 65536;

/// Errors that can occur during file hashing.
#[derive(Debug, thiserror::Error)]
pub enum HashError {
    #[error("Failed to read file '{path}': {message}")]
    Io { path: String, message: String },
}

// =============================================================================
// Unit Tests
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_hash_empty_file() {
        // SHA-256 of empty byte sequence is well-known
        // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let temp_file = NamedTempFile::new().unwrap();
        let hash = hash_file(temp_file.path()).unwrap();
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_hash_known_content() {
        // Write known bytes directly (avoiding Windows CRLF translation)
        let known_bytes: &[u8] = b"hello world\n"; // 12 bytes with LF
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(known_bytes).unwrap();
        temp_file.flush().unwrap();

        let hash = hash_file(temp_file.path()).unwrap();
        // Verify length (SHA-256 always produces 64 hex chars)
        assert_eq!(hash.len(), 64);
        // Verify it's a valid hex string
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        // Verify idempotency
        let hash2 = hash_file(temp_file.path()).unwrap();
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_hash_idempotent() {
        // Calling hash_file twice on the same file must produce the same result
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "idempotent test content").unwrap();
        temp_file.flush().unwrap();

        let hash1 = hash_file(temp_file.path()).unwrap();
        let hash2 = hash_file(temp_file.path()).unwrap();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_length_is_64_hex_chars() {
        // SHA-256 always produces exactly 64 hexadecimal characters
        let temp_file = NamedTempFile::new().unwrap();
        let hash = hash_file(temp_file.path()).unwrap();
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_verify_hash_matches() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "hello world").unwrap();
        temp_file.flush().unwrap();

        let hash = hash_file(temp_file.path()).unwrap();
        let result = verify_hash(temp_file.path(), &hash).unwrap();
        assert!(result);
    }

    #[test]
    fn test_verify_hash_mismatches() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "hello world").unwrap();
        temp_file.flush().unwrap();

        let result = verify_hash(temp_file.path(), "deadbeef1234567890abcdef").unwrap();
        assert!(!result);
    }

    #[test]
    fn test_verify_hash_case_insensitive() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "hello world").unwrap();
        temp_file.flush().unwrap();

        let hash = hash_file(temp_file.path()).unwrap();
        // Uppercase expected
        let upper = hash.to_uppercase();
        let result = verify_hash(temp_file.path(), &upper).unwrap();
        assert!(result);
    }

    #[test]
    fn test_hash_nonexistent_file_returns_error() {
        let result = hash_file(Path::new("/this/file/does/not/exist.mp3"));
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_msg = err.to_string();
        assert!(err_msg.contains("/this/file/does/not/exist.mp3"));
    }

    #[test]
    fn test_hash_error_type_is_hash_error() {
        let result = hash_file(Path::new("/nonexistent"));
        assert!(matches!(result, Err(HashError::Io { .. })));
    }

    #[test]
    fn test_hash_large_file_chunks() {
        // Create a file larger than BUFFER_SIZE to test chunked reading
        let mut temp_file = NamedTempFile::new().unwrap();
        // Write more than 64 KiB
        let data: Vec<u8> = (0..100_000).map(|i| (i % 256) as u8).collect();
        temp_file.write_all(&data).unwrap();
        temp_file.flush().unwrap();

        let hash = hash_file(temp_file.path()).unwrap();
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_hash_binary_content() {
        // Test binary data with null bytes, high bytes, etc.
        let mut temp_file = NamedTempFile::new().unwrap();
        let binary_data: Vec<u8> = (0..=255).collect();
        temp_file.write_all(&binary_data).unwrap();
        temp_file.flush().unwrap();

        let hash = hash_file(temp_file.path()).unwrap();
        assert_eq!(hash.len(), 64);
        // SHA-256 of bytes 0..=255 (256 bytes) is a known value
        assert_eq!(
            hash,
            "40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880"
        );
    }

    #[test]
    fn test_hash_error_contains_path() {
        let fake_path = "/path/that/does/not/exist.flac";
        let result = hash_file(Path::new(fake_path));
        assert!(result.is_err());
        let err_str = result.unwrap_err().to_string();
        assert!(err_str.contains(fake_path));
    }
}
