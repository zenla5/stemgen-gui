//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).

use anyhow::{Context, Result};
use rubato::{Resampler, SincFixedIn2, SincInterpolationParameters, SincInterpolationType};
use tracing::{debug, info};

use crate::audio::decoder::SampleData;

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

    /// Deinterleave interleaved samples into channel-separated samples
    fn deinterleave(samples: &[f32], num_channels: usize) -> Vec<Vec<f32>> {
        let frames = samples.len() / num_channels;
        
        let mut deinterleaved: Vec<Vec<f32>> = vec![Vec::with_capacity(frames); num_channels];
        
        for frame in 0..frames {
            for ch in 0..num_channels {
                deinterleaved[ch].push(samples[frame * num_channels + ch]);
            }
        }
        
        deinterleaved
    }

    /// Interleave channel-separated samples back into interleaved format
    fn interleave(channels: &[Vec<f32>]) -> Vec<f32> {
        if channels.is_empty() {
            return Vec::new();
        }
        
        let num_channels = channels.len();
        let frames = channels[0].len();
        
        let mut interleaved = Vec::with_capacity(frames * num_channels);
        
        for frame in 0..frames {
            for ch in 0..num_channels {
                interleaved.push(channels[ch][frame]);
            }
        }
        
        interleaved
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

        // Number of input frames
        let num_channels = samples.channels as usize;
        let input_frames = samples.samples.len() / num_channels;
        
        // rubato v1: SincFixedIn2::new(output_sample_rate, input_sample_rate, params, n_channels, n_frames)
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let mut resampler = SincFixedIn2::<f32>::new(
            output_sample_rate,
            input_sample_rate,
            params,
            num_channels,
            input_frames,
        ).map_err(|e| anyhow::anyhow!("Failed to create resampler: {}", e))?;

        // Deinterleave the input samples (rubato expects Vec<Vec<f32>>)
        let deinterleaved = Self::deinterleave(&samples.samples, num_channels);
        
        // Process samples
        let resampled = resampler.process(&deinterleaved, false)
            .context("Failed to resample audio")?;

        // Reinterleave the output channels
        let interleaved = Self::interleave(&resampled);

        let output_frames = interleaved.len() / num_channels;
        info!(
            "Resampling complete: {} frames -> {} frames",
            input_frames, output_frames
        );

        Ok(SampleData {
            samples: interleaved,
            sample_rate: self.target_sample_rate,
            channels: samples.channels,
        })
    }

    /// Resample with fixed output length
    #[allow(clippy::similar_names)]
    pub fn resample_to_length(
        &mut self, 
        samples: &SampleData, 
        _target_frames: usize
    ) -> Result<SampleData> {
        let input_sample_rate = samples.sample_rate as f64;
        let output_sample_rate = self.target_sample_rate as f64;

        let num_channels = samples.channels as usize;
        
        // rubato v1: Use input frames
        let input_frames = samples.samples.len() / num_channels;
        
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let mut resampler = SincFixedIn2::<f32>::new(
            output_sample_rate,
            input_sample_rate,
            params,
            num_channels,
            input_frames,
        ).map_err(|e| anyhow::anyhow!("Failed to create resampler: {}", e))?;

        // Deinterleave the input samples
        let deinterleaved = Self::deinterleave(&samples.samples, num_channels);
        
        // Process using the deinterleaved data
        let resampled = resampler.process(&deinterleaved, false)
            .context("Failed to resample audio")?;

        // Reinterleave channels
        let interleaved = Self::interleave(&resampled);

        Ok(SampleData {
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
