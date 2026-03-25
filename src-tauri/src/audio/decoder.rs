//! Audio decoder using symphonia
//! 
//! Supports MP3, FLAC, WAV, OGG, AAC, and more.

use anyhow::{Context, Result};
use symphonia::core::audio::AudioBufferRef;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use tracing::{debug, info, warn};

use crate::audio::resampler::Resampler;

/// Supported audio formats
const SUPPORTED_FORMATS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "m4a", "aac", "aiff", "aif", "wma", "opus"
];

/// Audio metadata
#[derive(Debug, Clone)]
pub struct AudioMetadata {
    pub sample_rate: u32,
    pub channels: u8,
    pub duration_secs: f64,
    pub bit_depth: Option<u16>,
    pub format: String,
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

/// Audio sample data
#[derive(Debug, Clone)]
pub struct AudioSamples {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u8,
}

/// Audio decoder for extracting raw samples from audio files
pub struct AudioDecoder {
    sample_rate: u32,
    channels: u8,
}

impl AudioDecoder {
    /// Create a new audio decoder
    pub fn new() -> Self {
        Self {
            sample_rate: 44100,
            channels: 2,
        }
    }

    /// Decode audio file to raw samples
    pub fn decode(&mut self, path: &Path) -> Result<AudioSamples> {
        info!("Decoding audio file: {:?}", path);

        // Open the file
        let file = File::open(path)
            .with_context(|| format!("Failed to open audio file: {:?}", path))?;
        
        let mss = MediaSourceStream::new(Box::new(BufReader::new(file)), Default::default());

        // Create the probe
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        // Probe the format
        let format_opts = FormatOptions {
            enable_gapless: false,
            ..Default::default()
        };
        
        let metadata_opts = MetadataOptions::default();
        
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .context("Failed to probe audio format")?;

        let mut format = probed.format;

        // Find the first audio track
        let track = format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
            .with_context(|| "No audio track found in file")?;

        let track_id = track.id;
        let codec_params = &track.codec_params;
        
        debug!("Track info: {:?}", track);
        debug!("Codec params: {:?}", codec_params);

        // Update sample rate and channels
        self.sample_rate = codec_params.sample_rate.unwrap_or(44100);
        self.channels = codec_params.channels.map(|c| c.count() as u8).unwrap_or(2);

        // Create the decoder
        let decoder_opts = DecoderOptions::default();
        let mut decoder = symphonia::default::get_codecs()
            .make(codec_params, &decoder_opts)
            .context("Failed to create decoder")?;

        // Decode all packets
        let mut all_samples: Vec<f32> = Vec::new();
        let mut total_duration = 0.0f64;

        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(ref err)) 
                    if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(e) => {
                    warn!("Error reading packet: {}", e);
                    break;
                }
            };

            if packet.track_id() != track_id {
                continue;
            }

            // Decode the packet
            match decoder.decode(&packet) {
                Ok(audio_buf) => {
                    let samples = Self::extract_samples(&audio_buf);
                    let sample_count = samples.len() / self.channels as usize;
                    total_duration += sample_count as f64 / self.sample_rate as f64;
                    all_samples.extend(samples);
                }
                Err(e) => {
                    debug!("Error decoding packet: {}", e);
                }
            }
        }

        info!(
            "Decoded {} samples ({} channels, {} Hz, {:.2}s)",
            all_samples.len(),
            self.channels,
            self.sample_rate,
            total_duration
        );

        Ok(AudioSamples {
            samples: all_samples,
            sample_rate: self.sample_rate,
            channels: self.channels,
        })
    }

    /// Extract samples from an AudioBufferRef
    fn extract_samples(audio_buf: &AudioBufferRef) -> Vec<f32> {
        match audio_buf {
            AudioBufferRef::U8(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| (s as f32 - 128.0) / 128.0)
                    .collect()
            }
            AudioBufferRef::U16(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| s as f32 / 65535.0)
                    .collect()
            }
            AudioBufferRef::U24(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| {
                        let val = ((s[0] as i32) | ((s[1] as i32) << 8) | ((s[2] as i32) << 16)) << 8;
                        val as f32 / 8388608.0
                    })
                    .collect()
            }
            AudioBufferRef::U32(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| s as f32 / 4294967295.0)
                    .collect()
            }
            AudioBufferRef::S8(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| s as f32 / 128.0)
                    .collect()
            }
            AudioBufferRef::S16(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| s as f32 / 32768.0)
                    .collect()
            }
            AudioBufferRef::S24(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| {
                        let val = (s[0] as i32) | ((s[1] as i32) << 8) | ((s[2] as i32) << 16);
                        val as f32 / 8388608.0
                    })
                    .collect()
            }
            AudioBufferRef::S32(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter())
                    .map(|&s| s as f32 / 2147483648.0)
                    .collect()
            }
            AudioBufferRef::F32(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().to_vec())
                    .collect()
            }
            AudioBufferRef::F64(buf) => {
                buf.planes()
                    .iter()
                    .flat_map(|plane| plane.as_slice().iter().map(|&s| s as f32).to_vec())
                    .collect()
            }
        }
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
    fn test_format_support() {
        assert!(AudioMetadata::is_format_supported(Path::new("test.mp3")));
        assert!(AudioMetadata::is_format_supported(Path::new("test.flac")));
        assert!(!AudioMetadata::is_format_supported(Path::new("test.xyz")));
    }
}
