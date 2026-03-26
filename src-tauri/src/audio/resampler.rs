//! Audio resampler using rubato
//! 
//! Resamples audio to 44.1kHz (NI stem standard).
//! 
//! Uses rubato v1.0.1 Fft synchronous resampler.

use anyhow::Result;
use audioadapter::{Adapter, AdapterMut};
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
    /// Uses rubato v1 Fft synchronous resampler with FixedSync::Input mode.
    /// The process method handles the full resampling with InterleavedOwned buffers.
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

        // rubato v1 Fft::new signature:
        // new(sample_rate_input, sample_rate_output, chunk_size, sub_chunks, nbr_channels, fixed)
        // Use FixedSync::Input - fixed input chunk, variable output
        let chunk_size = 8192.min(num_frames.max(1));
        let mut resampler = Fft::new(
            input_sample_rate as usize,
            output_sample_rate as usize,
            chunk_size,
            1, // sub_chunks
            num_channels,
            FixedSync::Input,
        )?;

        // Create input InterleavedOwned buffer from flat samples
        let mut input_buf = InterleavedOwned::<f32>::new(
            0.0f32,
            num_channels,
            num_frames,
        );
        
        // Copy samples into the interleaved buffer
        // InterleavedOwned stores samples as [ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...]
        for frame in 0..num_frames {
            for ch in 0..num_channels {
                let idx = frame * num_channels + ch;
                if idx < samples.samples.len() {
                    // InterleavedOwned uses interleaved layout
                    let _ = input_buf.write_sample(ch, frame, &samples.samples[idx]);
                }
            }
        }

        // Process all audio
        let output_buf = resampler.process(&input_buf, 0, None)?;

        // Get output dimensions
        let output_frames = output_buf.frames();
        let output_chans = output_buf.channels();

        // Read resampled samples back into flat Vec<f32>
        let mut interleaved = Vec::with_capacity(output_frames * output_chans);
        for frame in 0..output_frames {
            for ch in 0..output_chans {
                if let Some(sample) = output_buf.read_sample(ch, frame) {
                    interleaved.push(sample);
                }
            }
        }

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
