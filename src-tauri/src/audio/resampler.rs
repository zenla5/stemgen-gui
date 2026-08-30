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

    /// Build a stereo (or mono) signal with a distinct per-channel constant so
    /// resampling preserves the interleaving and leaves no leading/trailing
    /// silence. `left` is placed on even indices, `right` on odd indices.
    fn constant_stereo(frames: usize, left: f32, right: f32) -> SampleData {
        let mut samples = Vec::with_capacity(frames * 2);
        for _ in 0..frames {
            samples.push(left);
            samples.push(right);
        }
        SampleData {
            samples,
            sample_rate: 48000,
            channels: 2,
        }
    }

    #[test]
    fn test_resample_frame_count_matches_ratio() {
        // 48000 Hz -> 44100 Hz = 0.91875 ratio.
        let frames = 48_000usize;
        let data = constant_stereo(frames, 1.0, -1.0);

        let mut resampler = AudioResampler::new_44100();
        let out = resampler.resample(&data).expect("resample ok");

        let ratio = 44_100.0 / 48_000.0;
        let expected = (frames as f64 * ratio) as usize;
        let out_frames = out.samples.len() / 2;
        let tolerance = (expected as f64 * 0.02).ceil() as usize + 2;

        assert_eq!(out.sample_rate, 44_100);
        assert_eq!(out.channels, 2);
        assert!(
            (out_frames as isize - expected as isize).abs() <= tolerance as isize,
            "output frame count {out_frames} not within {tolerance} of expected {expected}"
        );
    }

    #[test]
    fn test_resample_no_leading_silence_or_trailing_padding() {
        let frames = 48_000usize;
        let data = constant_stereo(frames, 1.0, -1.0);

        let mut resampler = AudioResampler::new_44100();
        let out = resampler.resample(&data).expect("resample ok");

        assert!(out.samples.len() >= 2, "output buffer too small");

        // A constant DC signal should resample to a constant DC signal. If
        // leading silence or trailing padding were introduced, the first/last
        // samples would collapse toward 0 instead of staying near the original.
        let nose = 8usize.min(out.samples.len());
        for i in 0..nose {
            let mag = out.samples[i].abs();
            assert!(
                mag > 0.5,
                "leading sample {i} = {} looks like leading silence",
                out.samples[i]
            );
        }
        let tail_from = out.samples.len() - nose;
        for i in tail_from..out.samples.len() {
            let mag = out.samples[i].abs();
            assert!(
                mag > 0.5,
                "trailing sample {i} = {} looks like trailing padding",
                out.samples[i]
            );
        }
    }

    #[test]
    fn test_resample_preserves_multichannel_interleaving() {
        let frames = 48_000usize;
        let data = constant_stereo(frames, 1.0, -1.0);

        let mut resampler = AudioResampler::new_44100();
        let out = resampler.resample(&data).expect("resample ok");

        // Interleaved [ch0, ch1, ch0, ch1, ...]: even = left (+1), odd = right (-1).
        let n = out.samples.len();
        assert!(n % 2 == 0, "stereo output must be 2-interleaved");
        for i in 0..(n / 2) {
            let left = out.samples[2 * i];
            let right = out.samples[2 * i + 1];
            assert!(
                (left - 1.0).abs() < 0.5,
                "left channel sample {i} = {left} not preserved"
            );
            assert!(
                (right + 1.0).abs() < 0.5,
                "right channel sample {i} = {right} not preserved"
            );
        }
    }

    #[test]
    fn test_resample_upsample_frame_count() {
        // 22050 Hz -> 44100 Hz = 2.0 ratio (2x upsampling), mono.
        let frames = 22_050usize;
        let data = SampleData {
            samples: vec![0.5f32; frames],
            sample_rate: 22_050,
            channels: 1,
        };

        let mut resampler = AudioResampler::new_44100();
        let out = resampler.resample(&data).expect("resample ok");

        let expected = frames * 2;
        let out_frames = out.samples.len();
        // rubato's exact output may differ by a frame or two around the ratio.
        let tolerance = (expected as f64 * 0.02).ceil() as usize + 2;

        assert_eq!(out.sample_rate, 44_100);
        assert_eq!(out.channels, 1);
        assert!(
            (out_frames as isize - expected as isize).abs() <= tolerance as isize,
            "upsample output frames {out_frames} not within {tolerance} of {expected}"
        );
    }
}
