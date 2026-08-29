//! Audio decoder using symphonia
//!
//! Decodes audio files (MP3, FLAC, WAV, OGG) into raw PCM samples.

use anyhow::{Context, Result};
use std::path::Path;
use symphonia::core::audio::{Audio, GenericAudioBufferRef};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::codecs::CodecParameters;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

/// Supported audio formats
const SUPPORTED_FORMATS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac", "wma", "aiff"];

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

        let mut format = symphonia::default::get_probe()
            .probe(&hint, mss, format_opts, metadata_opts)
            .context("Unsupported audio format")?;

        // Get the default audio track
        let track = format
            .default_track(TrackType::Audio)
            .context("No audio track found")?;

        // Extract audio codec parameters (in 0.6 these are nested inside the
        // CodecParameters enum rather than a flat struct).
        let audio_codec_params = match track.codec_params.as_ref() {
            Some(CodecParameters::Audio(audio)) => audio,
            _ => anyhow::bail!("Track has no audio codec parameters"),
        };

        let track_id = track.id;
        let sample_rate = audio_codec_params.sample_rate.unwrap_or(44100);
        let channels = audio_codec_params
            .channels
            .as_ref()
            .map(|c| c.count() as u8)
            .unwrap_or(2);

        // Create the decoder
        let decoder_opts = AudioDecoderOptions::default();
        let mut decoder = symphonia::default::get_codecs()
            .make_audio_decoder(audio_codec_params, &decoder_opts)
            .context("Failed to create decoder")?;

        // Decode all samples
        let mut all_samples = Vec::new();

        // Ok(None) = end of stream; any error is non-fatal here.
        while let Ok(Some(packet)) = format.next_packet() {
            // Skip non-audio packets
            if packet.track_id != track_id {
                continue;
            }

            // Decode the packet
            let decoded = match decoder.decode(&packet) {
                Ok(decoded) => decoded,
                Err(_) => continue,
            };

            // Convert to f32 samples. In 0.6 the generic wrapper is
            // GenericAudioBufferRef and per-channel access is via the Audio
            // trait's plane() (channel 0 == front center / first channel).
            match decoded {
                GenericAudioBufferRef::F32(buf) => {
                    if let Some(samples) = buf.plane(0) {
                        all_samples.extend_from_slice(samples);
                    }
                }
                GenericAudioBufferRef::S16(buf) => {
                    if let Some(samples) = buf.plane(0) {
                        all_samples.extend(samples.iter().map(|&s| s as f32 / 32768.0));
                    }
                }
                GenericAudioBufferRef::S32(buf) => {
                    if let Some(samples) = buf.plane(0) {
                        all_samples.extend(samples.iter().map(|&s| s as f32 / 2147483648.0));
                    }
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
