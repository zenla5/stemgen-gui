//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).

use anyhow::{Context, Result};
use rubato::{Resampler, SincFixedIn, InterpolationType, InterpolationParameters};
use tracing::{debug, info};

use crate::audio::decoder::AudioSamples;

/// Target sample rate for NI stem format
pub const TARGET_SAMPLE_RATE: u32 = 44100;

/// Audio resampler
pub struct AudioResampler {
    target_sample_rate: u32,
    sinc_resampler: Option<SincFixedIn<f32>>,
}

impl AudioResampler {
    /// Create a new audio resampler
    pub fn new(target_sample_rate: u32) -> Self {
        Self {
            target_sample_rate,
            sinc_resampler: None,
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
        let params = InterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: InterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let mut resampler = SincFixedIn::<f32>::new(
            output_sample_rate / input_sample_rate,
            params,
            output_frames,
            samples.channels as usize,
        );

        // Process each channel
        let mut output_samples = Vec::with_capacity(output_frames * samples.channels as usize);
        
        for ch in 0..samples.channels as usize {
            // Extract channel
            let channel_samples: Vec<f32> = samples.samples
                .chunks(samples.channels as usize)
                .map(|frame| frame[ch])
                .collect();
            
            // Resample
            let resampled = resampler.process_single_channel(
                &channel_samples,
                std::num::NonZeroUsize::new(256).unwrap(),
                false,
            ).context("Failed to resample audio")?;
            
            output_samples.extend(resampled);
        }

        info!(
            "Resampling complete: {} frames -> {} frames",
            input_frames, output_frames
        );

        Ok(AudioSamples {
            samples: output_samples,
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
        let input_frames = samples.samples.len() / samples.channels as usize;
        
        // Initialize resampler
        let params = InterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: InterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let mut resampler = SincFixedIn::<f32>::new(
            output_sample_rate / input_sample_rate,
            params,
            target_frames,
            samples.channels as usize,
        );

        // Process each channel
        let mut output_samples = Vec::with_capacity(target_frames * samples.channels as usize);
        
        for ch in 0..samples.channels as usize {
            let channel_samples: Vec<f32> = samples.samples
                .chunks(samples.channels as usize)
                .map(|frame| frame[ch])
                .collect();
            
            let resampled = resampler.process_single_channel(
                &channel_samples,
                std::num::NonZeroUsize::new(256).unwrap(),
                false,
            ).context("Failed to resample audio")?;
            
            output_samples.extend(resampled);
        }

        Ok(AudioSamples {
            samples: output_samples,
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
