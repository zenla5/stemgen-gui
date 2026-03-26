//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).

use anyhow::{Context, Result};
use rubato::{Fft, Resampler};
use tracing::{debug, info};

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
    #[allow(clippy::similar_names)]
    pub fn resample(&mut self, samples: &SampleData) -> Result<SampleData> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        // If already at target rate, return as-is
        if (input_sample_rate - output_sample_rate).abs() < f64::EPSILON {
            debug!("Audio already at target sample rate, skipping resampling");
            return Ok(samples.clone());
        }

        info!(
            "Resampling from {} Hz to {} Hz",
            input_sample_rate, output_sample_rate
        );

        let num_channels = samples.channels as usize;
        let input_frames = samples.len() / num_channels;

        // rubato v1: Use Fft resampler for synchronous resampling
        // Fft::new(target_rate, input_rate, channels) creates a resampler
        let mut resampler = Fft::new(
            output_sample_rate,
            input_sample_rate,
            num_channels,
        ).map_err(|e| anyhow::anyhow!("Failed to create resampler: {}", e))?;

        // Process samples - rubato v1 expects Vec<Vec<f32>>
        let mut channels: Vec<Vec<f32>> = vec![Vec::with_capacity(input_frames); num_channels];
        for (i, sample) in samples.samples.iter().enumerate() {
            channels[i % num_channels].push(*sample);
        }

        let resampled = resampler.process(&channels)
            .context("Failed to resample audio")?;

        // Interleave channels back
        let num_output_channels = resampled.len();
        let output_frames = if num_output_channels > 0 { resampled[0].len() } else { 0 };
        let mut interleaved = Vec::with_capacity(output_frames * num_output_channels);

        for frame in 0..output_frames {
            for ch in 0..num_output_channels {
                interleaved.push(resampled[ch][frame]);
            }
        }

        info!(
            "Resampling complete: {} frames -> {} frames",
            input_frames, output_frames
        );

        Ok(SampleData {
            samples: interleaved,
            sample_rate: self.target_sample_rate,
            channels: num_output_channels as u16,
        })
    }

    /// Resample with fixed output length
    #[allow(clippy::similar_names)]
    pub fn resample_to_length(
        &mut self, 
        samples: &SampleData, 
        _target_frames: usize
    ) -> Result<SampleData> {
        // Fft resampler doesn't support fixed output length, use regular resample
        self.resample(samples)
    }
}

impl Default for AudioResampler {
    fn default() -> Self {
        Self::new_44100()
    }
}
