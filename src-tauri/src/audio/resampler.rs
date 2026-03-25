//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).

use anyhow::{Context, Result};
use rubato::{SincFixedIn, SincInterpolationParameters, SincInterpolationType, Resampler};
use tracing::{debug, info};

use crate::audio::decoder::AudioSamples;

/// Target sample rate for NI stem format
pub const TARGET_SAMPLE_RATE: u32 = 44100;

/// Audio resampler
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
    pub fn resample(&mut self, samples: &AudioSamples) -> Result<AudioSamples> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        // If already at target rate, return as-is
        if input_sample_rate == output_sample_rate {
            debug!("Audio already at target sample rate, skipping resampling");
            return Ok(samples.clone());
        }

        info!(
            "Resampling from {} Hz to {} Hz",
            input_sample_rate, output_sample_rate
        );

        // Calculate resampling ratio
        let resample_ratio = output_sample_rate / input_sample_rate;
        
        // Number of output samples
        let input_frames = samples.samples.len() / samples.channels as usize;
        let output_frames = (input_frames as f64 * resample_ratio).ceil() as usize;
        
        // Initialize resampler with parameters
        // Use a sinc resampler for high quality
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let resampler = SincFixedIn::<f32>::new(
            resample_ratio,
            output_sample_rate / input_sample_rate,
            params,
            samples.channels as usize,
            output_frames,
        ).map_err(|e| anyhow::anyhow!("Failed to create resampler: {}", e))?;

        // Process samples - use as_slice() to get &[f32] which implements AsRef<[f32]>
        let resampled = resampler.process(samples.samples.as_slice(), None)
            .context("Failed to resample audio")?;

        // resampled is Vec<Vec<f32>>, one vector per channel
        // We need to interleave the channels back into a single vector
        let num_channels = samples.channels as usize;
        let mut interleaved = Vec::with_capacity(resampled[0].len() * num_channels);
        
        for frame_idx in 0..resampled[0].len() {
            for ch in 0..num_channels {
                interleaved.push(resampled[ch][frame_idx]);
            }
        }

        info!(
            "Resampling complete: {} frames -> {} frames",
            input_frames, output_frames
        );

        Ok(AudioSamples {
            samples: interleaved,
            sample_rate: self.target_sample_rate,
            channels: samples.channels,
        })
    }

    /// Resample with fixed output length
    pub fn resample_to_length(
        &mut self, 
        samples: &AudioSamples, 
        target_frames: usize
    ) -> Result<AudioSamples> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        // Calculate ratio
        let resample_ratio = output_sample_rate / input_sample_rate;
        
        // Initialize resampler
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let resampler = SincFixedIn::<f32>::new(
            resample_ratio,
            output_sample_rate / input_sample_rate,
            params,
            samples.channels as usize,
            target_frames,
        ).map_err(|e| anyhow::anyhow!("Failed to create resampler: {}", e))?;

        // Process using as_slice() to get &[f32]
        let resampled = resampler.process(samples.samples.as_slice(), None)
            .context("Failed to resample audio")?;

        // Interleave channels
        let num_channels = samples.channels as usize;
        let mut interleaved = Vec::with_capacity(resampled[0].len() * num_channels);
        
        for frame_idx in 0..resampled[0].len() {
            for ch in 0..num_channels {
                interleaved.push(resampled[ch][frame_idx]);
            }
        }

        Ok(AudioSamples {
            samples: interleaved,
            sample_rate: self.target_sample_rate,
            channels: samples.channels,
        })
    }
}

impl Default for AudioResampler {
    fn default() -> Self {
        Self::new_44100()
    }
}
