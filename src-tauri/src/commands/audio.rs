use lofty::{Accessor, AudioFile, TaggedFileExt};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::info;

// ============================================================
// Unit Tests
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_info_serialization() {
        let info = AudioInfo {
            path: "/test/song.mp3".to_string(),
            name: "song.mp3".to_string(),
            size: 5_000_000,
            duration: 180.5,
            sample_rate: 44100,
            bit_depth: 16,
            channels: 2,
            format: "MP3".to_string(),
            metadata: std::collections::HashMap::new(),
            cover_art_path: None,
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("/test/song.mp3"));
        assert!(json.contains("180.5"));
        assert!(json.contains("44100"));

        let deserialized: AudioInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.path, "/test/song.mp3");
        assert_eq!(deserialized.duration, 180.5);
        assert_eq!(deserialized.sample_rate, 44100);
    }

    #[test]
    fn test_audio_info_with_metadata() {
        let mut meta = std::collections::HashMap::new();
        meta.insert("title".to_string(), "My Song".to_string());
        meta.insert("artist".to_string(), "Test Artist".to_string());

        let info = AudioInfo {
            path: "/test/track.flac".to_string(),
            name: "track.flac".to_string(),
            size: 30_000_000,
            duration: 240.0,
            sample_rate: 96000,
            bit_depth: 24,
            channels: 2,
            format: "FLAC".to_string(),
            metadata: meta,
            cover_art_path: Some("/tmp/cover.jpg".to_string()),
        };

        assert_eq!(info.metadata.get("title").unwrap(), "My Song");
        assert_eq!(info.metadata.get("artist").unwrap(), "Test Artist");
        assert!(info.cover_art_path.is_some());
    }

    #[test]
    fn test_audio_info_with_empty_metadata() {
        let info = AudioInfo {
            path: "/test/empty.mp3".to_string(),
            name: "empty.mp3".to_string(),
            size: 1000,
            duration: 10.0,
            sample_rate: 22050,
            bit_depth: 8,
            channels: 1,
            format: "MP3".to_string(),
            metadata: std::collections::HashMap::new(),
            cover_art_path: None,
        };

        assert!(info.metadata.is_empty());
        assert!(info.cover_art_path.is_none());
    }

    #[test]
    fn test_audio_info_deserialization_with_missing_optional_fields() {
        let json = r#"{
            "path": "/test/file.wav",
            "name": "file.wav",
            "size": 1000000,
            "duration": 60.0,
            "sample_rate": 48000,
            "bit_depth": 32,
            "channels": 2,
            "format": "WAV",
            "metadata": {},
            "cover_art_path": null
        }"#;

        let info: AudioInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.format, "WAV");
        assert_eq!(info.channels, 2);
        assert!(info.cover_art_path.is_none());
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub duration: f64,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u8,
    pub format: String,
    pub metadata: std::collections::HashMap<String, String>,
    pub cover_art_path: Option<String>,
}

#[tauri::command]
pub async fn get_audio_info(path: String) -> Result<AudioInfo, String> {
    info!("Getting audio info for: {}", path);

    let path_obj = Path::new(&path);

    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path_obj
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Get file format
    let format = path_obj
        .extension()
        .map(|e| e.to_string_lossy().to_string().to_uppercase())
        .unwrap_or_else(|| "UNKNOWN".to_string());

    // Read audio metadata using lofty
    let tagged_file = lofty::read_from_path(&path).map_err(|e| e.to_string())?;
    let properties = tagged_file.properties();

    let duration = properties.duration().as_secs_f64();
    let sample_rate = properties.sample_rate().unwrap_or(44100);
    let channels = properties.channels().unwrap_or(2);
    let bit_depth = properties.bit_depth().unwrap_or(16) as u16;

    // Extract tags
    let mut meta = std::collections::HashMap::new();
    if let Some(tag) = tagged_file.primary_tag() {
        if let Some(title) = tag.title() {
            meta.insert("title".to_string(), title.to_string());
        }
        if let Some(artist) = tag.artist() {
            meta.insert("artist".to_string(), artist.to_string());
        }
        if let Some(album) = tag.album() {
            meta.insert("album".to_string(), album.to_string());
        }
        if let Some(year) = tag.year() {
            meta.insert("year".to_string(), year.to_string());
        }
        if let Some(genre) = tag.genre() {
            meta.insert("genre".to_string(), genre.to_string());
        }
    }

    info!(
        "Audio info: {} ({}s, {}Hz, {}bit, {}ch)",
        name, duration, sample_rate, bit_depth, channels
    );

    Ok(AudioInfo {
        path,
        name,
        size: metadata.len(),
        duration,
        sample_rate,
        bit_depth,
        channels,
        format,
        metadata: meta,
        cover_art_path: None,
    })
}
