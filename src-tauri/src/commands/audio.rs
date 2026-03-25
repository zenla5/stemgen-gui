use serde::{Deserialize, Serialize};
use lofty::{AudioFile, TaggedFileExt};
use std::path::Path;
use tracing::info;

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
