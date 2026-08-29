//! Audio resampler using rubato
//!
//! Resamples audio to 44.1kHz (NI stem standard).
//!
//! Uses rubato v1.0.1 Fft synchronous resampler.

use anyhow::Result;
use audioadapter::Adapter;
use audioadapter_buffers::owned::InterleavedOwned;
use rubato::{Fft, FixedSync, Resampler};
use tracing::debug;

use crate::audio::decoder::SampleData;

/// Target sample rate for NI stem standard
pub const TARGET_SAMPLE_RATE: u32 = 44100;

/// Audio resampler using rubato v1 FFT resampler
pub struct AudioResampler {
    target_sample_rate: u32,
}

impl AudioResampler {
    /// Create a new audio resampler
    pub fn new(target_sample_rate: u32) -> Self {
        Self { target_sample_rate }
    }

    /// Create a resampler for 44.1kHz output (NI stem standard)
    pub fn new_44100() -> Self {
        Self::new(TARGET_SAMPLE_RATE)
    }

    /// Resample audio to target sample rate
    ///
    /// Uses rubato v5 Fft synchronous resampler with FixedSync::Both mode.
    /// The whole clip is resampled with process_all, which trims the
    /// resampler's startup delay and returns an exactly-sized buffer.
    pub fn resample(&mut self, samples: &SampleData) -> Result<SampleData> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        // If already at target rate, return as-is
        if (input_sample_rate - output_sample_rate).abs() < f64::EPSILON {
            debug!("Audio already at target sample rate, skipping resampling");
            return Ok(samples.clone());
        }

        let num_channels = samples.channels as usize;
        let num_frames = samples.samples.len() / num_channels;

        // rubato v5 Fft::new signature:
        // new(sample_rate_input, sample_rate_output, chunk_size, nbr_channels, fixed)
        // Use FixedSync::Both - both chunk sizes are fixed to the resampling ratio.
        let chunk_size = 8192.min(num_frames.max(1));
        let mut resampler = Fft::new(
            input_sample_rate as usize,
            output_sample_rate as usize,
            chunk_size,
            num_channels,
            FixedSync::Both,
        )?;

        // Wrap the flat interleaved samples in an InterleavedOwned adapter.
        // The samples are already stored in interleaved form
        // [ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...], matching InterleavedOwned.
        let input_buf =
            InterleavedOwned::<f32>::new_from(samples.samples.clone(), num_channels, num_frames)
                .map_err(|e| anyhow::anyhow!("failed to build input buffer: {e}"))?;

        // Resample the whole clip. process_all resets the resampler, trims the
        // startup delay, and returns an InterleavedOwned holding exactly the
        // resampled frames (no leading silence, no trailing padding).
        let output_buf = resampler.process_all(&input_buf, num_frames, None)?;

        let output_frames = output_buf.frames();
        let output_chans = output_buf.channels();
        let interleaved = output_buf.take_data();

        debug!(
            "Resampling complete: {} Hz -> {} Hz ({} frames -> {} frames)",
            input_sample_rate, output_sample_rate, num_frames, output_frames
        );

        Ok(SampleData {
            samples: interleaved,
            sample_rate: self.target_sample_rate,
            channels: output_chans as u8,
        })
    }

    /// Resample with fixed output length
    #[allow(dead_code)]
    pub fn resample_to_length(
        &mut self,
        samples: &SampleData,
        _target_frames: usize,
    ) -> Result<SampleData> {
        // Delegate to regular resample
        self.resample(samples)
    }
}

impl Default for AudioResampler {
    fn default() -> Self {
        Self::new_44100()
    }
}

// ============================================================
// Unit Tests
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resampler_new_44100() {
        let resampler = AudioResampler::new_44100();
        assert_eq!(resampler.target_sample_rate, 44100);
    }

    #[test]
    fn test_resampler_new_custom_rate() {
        let resampler = AudioResampler::new(48000);
        assert_eq!(resampler.target_sample_rate, 48000);
    }

    #[test]
    fn test_resampler_default() {
        let resampler = AudioResampler::default();
        assert_eq!(resampler.target_sample_rate, 44100);
    }

    #[test]
    fn test_resampler_at_same_rate_returns_original() {
        use crate::audio::decoder::SampleData;

        let samples = SampleData {
            samples: vec![0.5f32; 1000],
            sample_rate: 44100,
            channels: 2,
        };

        let mut resampler = AudioResampler::new_44100();
        let result = resampler.resample(&samples);

        assert!(result.is_ok());
        let resampled = result.unwrap();
        // At same rate, should return equivalent data
        assert_eq!(resampled.sample_rate, 44100);
        assert_eq!(resampled.samples.len(), samples.samples.len());
    }

    #[test]
    fn test_target_sample_rate_constant() {
        assert_eq!(TARGET_SAMPLE_RATE, 44100);
    }
}
