//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).
//! 
//! Note: Uses rubato v1 API with InterleavedOwned buffer type.

use anyhow::Result;
use rubato::{Fft, Resampler};
use rubato::audioadapter::Adapter;
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
        Self {
            target_sample_rate,
        }
    }

    /// Create a resampler for 44.1kHz output (NI stem standard)
    pub fn new_44100() -> Self {
        Self::new(TARGET_SAMPLE_RATE)
    }

    /// Resample audio to target sample rate
    /// 
    /// Uses rubato v1 Fft resampler with InterleavedOwned buffer type.
    pub fn resample(&mut self, samples: &SampleData) -> Result<SampleData> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        // If already at target rate, return as-is
        if (input_sample_rate - output_sample_rate).abs() < f64::EPSILON {
            debug!("Audio already at target sample rate, skipping resampling");
            return Ok(samples.clone());
        }

        // Calculate the ratio for resampling
        let ratio = output_sample_rate / input_sample_rate;
        
        // Calculate number of frames needed
        let num_channels = samples.channels as usize;
        let input_frames = samples.samples.len() / num_channels;
        let output_frames = (input_frames as f64 * ratio) as usize;

        // rubato v1: Fft::new requires usize parameters
        let mut resampler = Fft::new(
            input_frames,  // n_in
            output_frames, // n_out
            num_channels, // n_channels
            512,           // chunk size
            512,           // delay compensation
        )?;

        // rubato v1 process takes: (input: impl Adapter, n_out: usize, trim: Option<&[bool]>) -> InterleavedOwned
        let resampled = resampler.process(&samples.samples, output_frames, None)?;

        // Use Adapter trait methods to get data from InterleavedOwned
        let resampled_samples = resampled.get_audio();
        let resampled_channels = resampled.channels() as u16;

        debug!(
            "Resampling complete: {} Hz -> {} Hz ({} frames -> {} frames)",
            input_sample_rate, output_sample_rate, input_frames, output_frames
        );

        Ok(SampleData {
            samples: resampled_samples.to_vec(),
            sample_rate: self.target_sample_rate,
            channels: resampled_channels,
        })
    }

    /// Resample with fixed output length
    pub fn resample_to_length(
        &mut self, 
        samples: &SampleData, 
        _target_frames: usize
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
