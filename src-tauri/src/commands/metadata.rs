//! Metadata commands
//!
//! Reads audio metadata, BPM, key, and NI stem metadata from files.

use lofty::{Accessor, AudioFile, TaggedFileExt};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{debug, info, warn};

use crate::stems::metadata::NIStemMetadata;

/// Audio metadata with BPM/key detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMetadata {
    /// File path
    pub path: String,
    /// Track title
    pub title: Option<String>,
    /// Artist name
    pub artist: Option<String>,
    /// Album name
    pub album: Option<String>,
    /// Year
    pub year: Option<u32>,
    /// Genre
    pub genre: Option<String>,
    /// BPM (beats per minute) — extracted from audio or tag
    pub bpm: Option<f64>,
    /// Musical key (e.g., "Am", "C#m")
    pub key: Option<String>,
    /// Duration in seconds
    pub duration: f64,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Bit depth
    pub bit_depth: u16,
    /// Number of channels
    pub channels: u8,
    /// Cover art file path (extracted to temp file)
    pub cover_art_path: Option<String>,
}

/// NI stem file metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemFileMetadata {
    /// Path to the .stem.mp4 file
    pub path: String,
    /// NI stem metadata
    pub ni_metadata: Option<NIStemMetadata>,
    /// Number of audio tracks in the file
    pub track_count: u32,
    /// DJ software used for export
    pub dj_software: Option<String>,
    /// Overall metadata
    pub audio: AudioMetadata,
}

/// Read audio metadata from any supported audio file
#[tauri::command]
pub async fn read_audio_metadata(path: String) -> Result<AudioMetadata, String> {
    info!("Reading audio metadata: {}", path);

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Read with lofty
    let tagged_file = lofty::read_from_path(&path).map_err(|e| {
        warn!("Failed to read tags with lofty: {}", e);
        e.to_string()
    })?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();
    let sample_rate = properties.sample_rate().unwrap_or(44100);
    let channels = properties.channels().unwrap_or(2);
    let bit_depth = properties.bit_depth().unwrap_or(16) as u16;

    // Extract tags
    let mut title = None;
    let mut artist = None;
    let mut album = None;
    let mut year = None;
    let mut genre = None;

    if let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    {
        title = tag.title().map(|t| t.to_string());
        artist = tag.artist().map(|a| a.to_string());
        album = tag.album().map(|a| a.to_string());
        year = tag.year();
        genre = tag.genre().map(|g| g.to_string());
    }

    // Extract BPM from FFprobe
    let bpm = get_bpm_from_ffprobe(&path);

    // Key detection would require librosa-like analysis, skip for now
    let key = None;

    // Extract cover art to temp file
    let cover_art_path = extract_cover_art_ffmpeg(&path).ok();

    info!(
        "Audio metadata: '{}' by '{}' ({}s, {:?} BPM, {:?} key)",
        title.as_deref().unwrap_or("Unknown"),
        artist.as_deref().unwrap_or("Unknown"),
        duration,
        bpm,
        key
    );

    Ok(AudioMetadata {
        path,
        title,
        artist,
        album,
        year,
        genre,
        bpm,
        key,
        duration,
        sample_rate,
        bit_depth,
        channels,
        cover_art_path,
    })
}

/// Get BPM from FFprobe metadata
fn get_bpm_from_ffprobe(path: &str) -> Option<f64> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-show_entries",
            "format_tags=TBPM",
            "-of",
            "csv=p=0",
            path,
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let bpm_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if bpm_str.is_empty() || bpm_str == "TBPM" {
        return None;
    }

    bpm_str.parse::<f64>().ok()
}

/// Extract cover art using FFmpeg
fn extract_cover_art_ffmpeg(path: &str) -> Result<String, String> {
    let source_name = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("cover");

    let temp_dir = std::env::temp_dir();
    let cover_path = temp_dir.join(format!("{}_cover.jpg", source_name));

    let output = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            path,
            "-an",
            "-vcodec",
            "copy",
            cover_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("FFmpeg failed to extract cover".to_string());
    }

    // If the file doesn't exist, it might not have cover art
    if !cover_path.exists() {
        return Err("No cover art found".to_string());
    }

    debug!("Extracted cover art to: {:?}", cover_path);
    Ok(cover_path.to_string_lossy().to_string())
}

/// Read NI stem metadata from a .stem.mp4 file
#[tauri::command]
pub async fn read_stem_metadata(path: String) -> Result<StemFileMetadata, String> {
    info!("Reading stem metadata: {}", path);

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Read base audio metadata
    let audio = read_audio_metadata(path.clone()).await?;

    // Try to read NI metadata from sidecar JSON file
    let ni_metadata = read_ni_sidecar_metadata(path_obj);

    // Get track count from file (count audio streams)
    let track_count = count_audio_tracks(path_obj).unwrap_or(1);

    // Determine DJ software from track ordering (heuristic)
    let dj_software = infer_dj_software(&ni_metadata);

    debug!("Stem file: {} tracks, DJ: {:?}", track_count, dj_software);

    Ok(StemFileMetadata {
        path,
        ni_metadata,
        track_count,
        dj_software,
        audio,
    })
}

/// Read NI metadata from sidecar JSON file
fn read_ni_sidecar_metadata(stem_path: &Path) -> Option<NIStemMetadata> {
    // Try .stem.metadata sidecar
    let metadata_path = stem_path.with_extension("stem.metadata");
    if metadata_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&metadata_path) {
            if let Ok(metadata) = serde_json::from_str::<NIStemMetadata>(&content) {
                debug!("Loaded NI metadata from sidecar: {:?}", metadata_path);
                return Some(metadata);
            }
        }
    }

    // Try .metadata.json sidecar
    let alt_metadata_path = stem_path.with_extension("metadata.json");
    if alt_metadata_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&alt_metadata_path) {
            if let Ok(metadata) = serde_json::from_str::<NIStemMetadata>(&content) {
                debug!(
                    "Loaded NI metadata from alt sidecar: {:?}",
                    alt_metadata_path
                );
                return Some(metadata);
            }
        }
    }

    debug!("No NI sidecar metadata found for: {:?}", stem_path);
    None
}

/// Count audio tracks in an MP4/M4A file using FFprobe
fn count_audio_tracks(path: &Path) -> std::io::Result<u32> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            path.to_str().unwrap_or(""),
        ])
        .output()?;

    if !output.status.success() {
        return Ok(1);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let count = stdout.lines().filter(|line| line.contains("audio")).count() as u32;

    Ok(count.max(1))
}

/// Infer DJ software from NI metadata stem ordering
fn infer_dj_software(ni_metadata: &Option<NIStemMetadata>) -> Option<String> {
    let Some(metadata) = ni_metadata else {
        return None;
    };

    if metadata.stems.len() != 4 {
        return None;
    }

    // Check stem order to determine DJ software
    let order: Vec<&str> = metadata.stems.iter().map(|s| s.name.as_str()).collect();

    match order.as_slice() {
        ["Vocals", "Drums", "Bass", "Other"] => Some("Serato DJ".to_string()),
        ["Drums", "Bass", "Other", "Vocals"] => Some("Traktor Pro".to_string()),
        _ => None,
    }
}

/// Format BPM for display (remove decimal if whole number)
#[allow(dead_code)]
pub fn format_bpm(bpm: Option<f64>) -> Option<String> {
    bpm.map(|b| {
        if b.fract() == 0.0 {
            format!("{:.0}", b)
        } else {
            format!("{:.1}", b)
        }
    })
}

// ============================================================
// Unit Tests
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_metadata_serialization() {
        let meta = AudioMetadata {
            path: "/test/song.flac".to_string(),
            title: Some("Test Title".to_string()),
            artist: Some("Test Artist".to_string()),
            album: Some("Test Album".to_string()),
            year: Some(2024),
            genre: Some("Electronic".to_string()),
            bpm: Some(128.0),
            key: Some("Am".to_string()),
            duration: 180.5,
            sample_rate: 44100,
            bit_depth: 24,
            channels: 2,
            cover_art_path: Some("/tmp/cover.jpg".to_string()),
        };

        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("Test Title"));
        assert!(json.contains("Test Artist"));
        assert!(json.contains("128"));

        let deserialized: AudioMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.title.unwrap(), "Test Title");
        assert_eq!(deserialized.bpm.unwrap(), 128.0);
    }

    #[test]
    fn test_audio_metadata_minimal() {
        let meta = AudioMetadata {
            path: "/test/minimal.mp3".to_string(),
            title: None,
            artist: None,
            album: None,
            year: None,
            genre: None,
            bpm: None,
            key: None,
            duration: 60.0,
            sample_rate: 22050,
            bit_depth: 16,
            channels: 1,
            cover_art_path: None,
        };

        assert!(meta.title.is_none());
        assert!(meta.bpm.is_none());
        assert!(meta.key.is_none());
    }

    #[test]
    fn test_stem_file_metadata_serialization() {
        use crate::stems::metadata::NIStemMetadata;

        let ni_meta = NIStemMetadata::default();
        let meta = StemFileMetadata {
            path: "/test/track.stem.mp4".to_string(),
            ni_metadata: Some(ni_meta),
            track_count: 5,
            dj_software: Some("Traktor Pro".to_string()),
            audio: AudioMetadata {
                path: "/test/track.stem.mp4".to_string(),
                title: Some("My Track".to_string()),
                artist: Some("DJ Test".to_string()),
                album: None,
                year: Some(2024),
                genre: None,
                bpm: Some(130.5),
                key: Some("C#m".to_string()),
                duration: 200.0,
                sample_rate: 44100,
                bit_depth: 16,
                channels: 2,
                cover_art_path: None,
            },
        };

        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("My Track"));
        assert!(json.contains("DJ Test"));
        assert!(json.contains("5")); // track_count

        let deserialized: StemFileMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.track_count, 5);
        assert!(deserialized.ni_metadata.is_some());
    }

    #[test]
    fn test_format_bpm_whole_number() {
        assert_eq!(format_bpm(Some(120.0)), Some("120".to_string()));
        assert_eq!(format_bpm(Some(140.0)), Some("140".to_string()));
        assert_eq!(format_bpm(Some(0.0)), Some("0".to_string()));
    }

    #[test]
    fn test_format_bpm_decimal() {
        assert_eq!(format_bpm(Some(128.5)), Some("128.5".to_string()));
        assert_eq!(format_bpm(Some(99.9)), Some("99.9".to_string()));
        assert_eq!(format_bpm(Some(120.1)), Some("120.1".to_string()));
    }

    #[test]
    fn test_format_bpm_none() {
        assert_eq!(format_bpm(None), None);
    }

    #[test]
    fn test_infer_dj_software_traktor() {
        use crate::stems::metadata::{MasterData, NIStemMetadata, StemData};

        let stems = vec![
            StemData {
                name: "Drums".to_string(),
                color: "#FF6B6B".to_string(),
                file_path: "drums.m4a".to_string(),
            },
            StemData {
                name: "Bass".to_string(),
                color: "#4ECDC4".to_string(),
                file_path: "bass.m4a".to_string(),
            },
            StemData {
                name: "Other".to_string(),
                color: "#FFE66D".to_string(),
                file_path: "other.m4a".to_string(),
            },
            StemData {
                name: "Vocals".to_string(),
                color: "#95E1D3".to_string(),
                file_path: "vocals.m4a".to_string(),
            },
        ];
        let master = MasterData {
            name: "Master".to_string(),
            file_path: "master.m4a".to_string(),
        };
        let ni_meta = NIStemMetadata::new(stems, master);

        let result = infer_dj_software(&Some(ni_meta));
        assert_eq!(result, Some("Traktor Pro".to_string()));
    }

    #[test]
    fn test_infer_dj_software_serato() {
        use crate::stems::metadata::{MasterData, NIStemMetadata, StemData};

        let stems = vec![
            StemData {
                name: "Vocals".to_string(),
                color: "#95E1D3".to_string(),
                file_path: "vocals.m4a".to_string(),
            },
            StemData {
                name: "Drums".to_string(),
                color: "#FF6B6B".to_string(),
                file_path: "drums.m4a".to_string(),
            },
            StemData {
                name: "Bass".to_string(),
                color: "#4ECDC4".to_string(),
                file_path: "bass.m4a".to_string(),
            },
            StemData {
                name: "Other".to_string(),
                color: "#FFE66D".to_string(),
                file_path: "other.m4a".to_string(),
            },
        ];
        let master = MasterData {
            name: "Master".to_string(),
            file_path: "master.m4a".to_string(),
        };
        let ni_meta = NIStemMetadata::new(stems, master);

        let result = infer_dj_software(&Some(ni_meta));
        assert_eq!(result, Some("Serato DJ".to_string()));
    }

    #[test]
    fn test_infer_dj_software_unknown_order() {
        use crate::stems::metadata::{MasterData, NIStemMetadata, StemData};

        let stems = vec![
            StemData {
                name: "Bass".to_string(),
                color: "#4ECDC4".to_string(),
                file_path: "bass.m4a".to_string(),
            },
            StemData {
                name: "Drums".to_string(),
                color: "#FF6B6B".to_string(),
                file_path: "drums.m4a".to_string(),
            },
            StemData {
                name: "Vocals".to_string(),
                color: "#95E1D3".to_string(),
                file_path: "vocals.m4a".to_string(),
            },
            StemData {
                name: "Other".to_string(),
                color: "#FFE66D".to_string(),
                file_path: "other.m4a".to_string(),
            },
        ];
        let master = MasterData {
            name: "Master".to_string(),
            file_path: "master.m4a".to_string(),
        };
        let ni_meta = NIStemMetadata::new(stems, master);

        let result = infer_dj_software(&Some(ni_meta));
        assert_eq!(result, None);
    }

    #[test]
    fn test_infer_dj_software_no_metadata() {
        let result = infer_dj_software(&None);
        assert_eq!(result, None);
    }
}
