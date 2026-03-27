//! Audio converter module
//!
//! Converts between audio formats using FFmpeg.

use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;
use tracing::{debug, info};

/// Audio format types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioFormat {
    Wav,
    Flac,
    Mp3,
    Aac,
    Alac,
    Ogg,
}

impl AudioFormat {
    /// Get the file extension
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Wav => "wav",
            Self::Flac => "flac",
            Self::Mp3 => "mp3",
            Self::Aac => "m4a",
            Self::Alac => "m4a",
            Self::Ogg => "ogg",
        }
    }

    /// Get the MIME type
    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Wav => "audio/wav",
            Self::Flac => "audio/flac",
            Self::Mp3 => "audio/mpeg",
            Self::Aac => "audio/aac",
            Self::Alac => "audio/mp4",
            Self::Ogg => "audio/ogg",
        }
    }

    /// Check if format is lossless
    pub fn is_lossless(&self) -> bool {
        matches!(self, Self::Wav | Self::Flac | Self::Alac)
    }

    /// Parse from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "wav" => Some(Self::Wav),
            "flac" => Some(Self::Flac),
            "mp3" => Some(Self::Mp3),
            "m4a" | "aac" => Some(Self::Aac),
            "alac" => Some(Self::Alac),
            "ogg" | "oga" => Some(Self::Ogg),
            _ => None,
        }
    }
}

/// Audio converter
pub struct AudioConverter {
    ffmpeg_path: String,
}

impl AudioConverter {
    /// Create a new audio converter
    pub fn new() -> Self {
        Self {
            ffmpeg_path: "ffmpeg".to_string(),
        }
    }

    /// Create with custom FFmpeg path
    pub fn with_ffmpeg_path(path: impl Into<String>) -> Self {
        Self {
            ffmpeg_path: path.into(),
        }
    }

    /// Check if FFmpeg is available
    pub fn is_available(&self) -> bool {
        Command::new(&self.ffmpeg_path)
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Convert audio to WAV format (32-bit float)
    pub fn convert_to_wav(&self, input: &Path, output: &Path, sample_rate: u32) -> Result<()> {
        info!("Converting {:?} to WAV: {:?}", input, output);

        let output = Command::new(&self.ffmpeg_path)
            .args([
                "-y",
                "-i",
                input.to_str().unwrap(),
                "-acodec",
                "pcm_f32le", // 32-bit float
                "-ar",
                &sample_rate.to_string(),
                "-ac",
                "2", // Stereo
                output.to_str().unwrap(),
            ])
            .output()
            .context("Failed to execute FFmpeg")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("FFmpeg conversion failed: {}", stderr);
        }

        debug!("Conversion complete");
        Ok(())
    }

    /// Convert audio to specified format
    pub fn convert(
        &self,
        input: &Path,
        output: &Path,
        format: AudioFormat,
        sample_rate: u32,
        bitrate: Option<u32>,
        channels: u8,
    ) -> Result<()> {
        info!("Converting {:?} to {:?}: {:?}", input, format, output);

        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            input.to_str().unwrap().to_string(),
            "-ar".to_string(),
            sample_rate.to_string(),
            "-ac".to_string(),
            channels.to_string(),
        ];

        // Add codec-specific options
        match format {
            AudioFormat::Wav => {
                args.extend(["-acodec".to_string(), "pcm_f32le".to_string()]);
            }
            AudioFormat::Flac => {
                args.extend(["-acodec".to_string(), "flac".to_string()]);
            }
            AudioFormat::Mp3 => {
                args.extend(["-acodec".to_string(), "libmp3lame".to_string()]);
                if let Some(br) = bitrate {
                    args.extend(["-b:a".to_string(), format!("{}k", br)]);
                }
            }
            AudioFormat::Aac => {
                args.extend(["-acodec".to_string(), "aac".to_string()]);
                if let Some(br) = bitrate {
                    args.extend(["-b:a".to_string(), format!("{}k", br)]);
                }
            }
            AudioFormat::Alac => {
                args.extend(["-acodec".to_string(), "alac".to_string()]);
            }
            AudioFormat::Ogg => {
                args.extend(["-acodec".to_string(), "libvorbis".to_string()]);
                if let Some(br) = bitrate {
                    args.extend(["-b:a".to_string(), format!("{}k", br)]);
                }
            }
        }

        args.push(output.to_str().unwrap().to_string());

        let output = Command::new(&self.ffmpeg_path)
            .args(&args)
            .output()
            .context("Failed to execute FFmpeg")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("FFmpeg conversion failed: {}", stderr);
        }

        debug!("Conversion complete");
        Ok(())
    }

    /// Extract audio from video
    pub fn extract_audio(&self, input: &Path, output: &Path, format: AudioFormat) -> Result<()> {
        info!("Extracting audio from {:?} to {:?}", input, output);

        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            input.to_str().unwrap().to_string(),
            "-vn".to_string(), // No video
            "-acodec".to_string(),
            "copy".to_string(), // Copy codec (no re-encoding)
        ];

        match format {
            AudioFormat::Mp3 => args.extend(["-f".to_string(), "mp3".to_string()]),
            AudioFormat::Aac | AudioFormat::Alac => {
                args.extend(["-f".to_string(), "ipod".to_string()])
            }
            AudioFormat::Ogg => args.extend(["-f".to_string(), "ogg".to_string()]),
            _ => {}
        }

        args.push(output.to_str().unwrap().to_string());

        let output = Command::new(&self.ffmpeg_path)
            .args(&args)
            .output()
            .context("Failed to execute FFmpeg")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("FFmpeg audio extraction failed: {}", stderr);
        }

        Ok(())
    }

    /// Get FFmpeg version
    pub fn version(&self) -> Option<String> {
        Command::new(&self.ffmpeg_path)
            .arg("-version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.lines().next().unwrap_or("unknown").to_string())
    }
}

impl Default for AudioConverter {
    fn default() -> Self {
        Self::new()
    }
}
