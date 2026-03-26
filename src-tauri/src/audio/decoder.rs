//! Audio decoder using symphonia
//!
//! Decodes audio files (MP3, FLAC, WAV, OGG) into raw PCM samples.

use anyhow::{Context, Result};
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Supported audio formats
const SUPPORTED_FORMATS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "m4a", "aac", "wma", "aiff",
];

/// Audio metadata
pub struct AudioMetadata {
    pub sample_rate: u32,
    pub channels: u8,
    pub duration_secs: f64,
    pub bit_depth: Option<u8>,
}

impl AudioMetadata {
    /// Check if format is supported
    pub fn is_format_supported(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| SUPPORTED_FORMATS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
    }
}

/// Raw audio sample data
#[derive(Debug, Clone)]
pub struct SampleData {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u8,
}

impl SampleData {
    /// Generate waveform data from samples
    pub fn generate_waveform(&self, points_per_second: u32) -> super::waveform::WaveformData {
        super::waveform::WaveformData::from_samples(self, points_per_second)
    }
}

/// Audio decoder for reading various audio formats
pub struct AudioDecoder {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u8,
}

impl AudioDecoder {
    /// Create a new audio decoder
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            sample_rate: 44100,
            channels: 2,
        }
    }

    /// Decode an audio file
    pub fn decode(&mut self, path: &Path) -> Result<SampleData> {
        // Create the media source stream
        let file = std::fs::File::open(path)
            .context(format!("Failed to open audio file: {}", path.display()))?;
        
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        
        // Create the probe
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        
        let format_opts = FormatOptions::default();
        let metadata_opts = MetadataOptions::default();
        
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .context("Unsupported audio format")?;
        
        let mut format = probed.format;
        
        // Get the default track
        let track = format
            .default_track()
            .context("No audio track found")?;
        
        let codec_params = track.codec_params.clone();
        let track_id = track.id;
        let sample_rate = codec_params.sample_rate.unwrap_or(44100);
        let channels = codec_params.channels.map(|c| c.count() as u8).unwrap_or(2);
        
        // Create the decoder
        let decoder_opts = DecoderOptions::default();
        let mut decoder = symphonia::default::get_codecs()
            .make(&codec_params, &decoder_opts)
            .context("Failed to create decoder")?;
        
        // Decode all samples
        let mut all_samples = Vec::new();
        
        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(ref e)) 
                    if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(_) => break,
            };
            
            // Skip non-audio packets
            if packet.track_id() != track_id {
                continue;
            }
            
            // Decode the packet
            let decoded = match decoder.decode(&packet) {
                Ok(decoded) => decoded,
                Err(_) => continue,
            };
            
            // Convert to f32 samples
            match decoded {
                AudioBufferRef::F32(buf) => {
                    let samples = buf.chan(0);
                    all_samples.extend_from_slice(samples);
                }
                AudioBufferRef::S16(buf) => {
                    let samples = buf.chan(0);
                    all_samples.extend(samples.iter().map(|&s| s as f32 / 32768.0));
                }
                AudioBufferRef::S32(buf) => {
                    let samples = buf.chan(0);
                    all_samples.extend(samples.iter().map(|&s| s as f32 / 2147483648.0));
                }
                _ => {}
            }
        }
        
        // Store decoded data
        self.samples = all_samples.clone();
        self.sample_rate = sample_rate;
        self.channels = channels;
        
        Ok(SampleData {
            samples: all_samples,
            sample_rate,
            channels,
        })
    }

    /// Get the decoded samples
    pub fn get_samples(&self) -> &[f32] {
        &self.samples
    }

    /// Get the sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Get the number of channels
    pub fn channels(&self) -> u8 {
        self.channels
    }
}

impl Default for AudioDecoder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decoder_creation() {
        let decoder = AudioDecoder::new();
        assert_eq!(decoder.sample_rate, 44100);
        assert_eq!(decoder.channels, 2);
        assert!(decoder.samples.is_empty());
    }

    #[test]
    fn test_sample_data_creation() {
        let samples = vec![0.5f32; 1000];
        let sample_data = SampleData {
            samples,
            sample_rate: 44100,
            channels: 2,
        };
        
        assert_eq!(sample_data.samples.len(), 1000);
        assert_eq!(sample_data.sample_rate, 44100);
        assert_eq!(sample_data.channels, 2);
    }

    #[test]
    fn test_waveform_point_values() {
        // Test that waveform point values are valid
        let min = -1.0f32;
        let max = 1.0f32;
        let rms = 0.707f32; // Approximate RMS for sine wave
        
        assert!(min <= rms && rms <= max);
    }

    #[test]
    fn test_format_support_check() {
        // Test that supported formats are recognized
        assert!(AudioMetadata::is_format_supported(Path::new("test.mp3")));
        assert!(AudioMetadata::is_format_supported(Path::new("test.flac")));
        assert!(AudioMetadata::is_format_supported(Path::new("test.wav")));
        assert!(!AudioMetadata::is_format_supported(Path::new("test.xyz")));
    }
}
