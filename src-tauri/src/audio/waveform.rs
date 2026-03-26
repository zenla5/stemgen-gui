//! Waveform generation module
//! 
//! Generates waveform data for visualization.

use serde::{Deserialize, Serialize};
use crate::audio::decoder::SampleData;

/// Waveform data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformPoint {
    pub min: f32,
    pub max: f32,
    pub rms: f32,
}

/// Waveform data
#[derive(Debug, Clone)]
pub struct WaveformData {
    pub points: Vec<WaveformPoint>,
    pub sample_rate: u32,
    pub duration_secs: f64,
}

impl WaveformData {
    /// Generate waveform from audio samples
    pub fn from_samples(samples: &SampleData, points_per_second: u32) -> Self {
        let frames = samples.samples.len() / samples.channels as usize;
        let duration_secs = frames as f64 / samples.sample_rate as f64;
        let total_points = (duration_secs * points_per_second as f64).ceil() as usize;
        
        let frames_per_point = (frames / total_points.max(1)).max(1);
        
        let mut points = Vec::with_capacity(total_points);
        
        for i in 0..total_points {
            let start = i * frames_per_point;
            let end = (start + frames_per_point).min(frames);
            
            if start >= frames {
                break;
            }
            
            // Extract mono samples for this segment
            let segment_samples: Vec<f32> = (start..end)
                .map(|frame| {
                    // Mix to mono
                    samples.samples[frame * samples.channels as usize..][..samples.channels as usize]
                        .iter()
                        .sum::<f32>() / samples.channels as f32
                })
                .collect();
            
            if segment_samples.is_empty() {
                continue;
            }
            
            // Calculate min, max, and RMS
            let min = segment_samples.iter().cloned().fold(f32::INFINITY, f32::min);
            let max = segment_samples.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            
            let sum_squares: f32 = segment_samples.iter()
                .map(|s| s * s)
                .sum();
            let rms = (sum_squares / segment_samples.len() as f32).sqrt();
            
            points.push(WaveformPoint { min, max, rms });
        }
        
        Self {
            points,
            sample_rate: samples.sample_rate,
            duration_secs,
        }
    }
    
    /// Get peak values for normalization
    pub fn get_peak(&self) -> f32 {
        self.points.iter()
            .map(|p| p.max.abs())
            .fold(0.0f32, f32::max)
    }
    
    /// Normalize waveform to -1.0 to 1.0 range
    pub fn normalize(&mut self) {
        let peak = self.get_peak();
        if peak > 0.0 && peak != 1.0 {
            for point in &mut self.points {
                point.min /= peak;
                point.max /= peak;
                point.rms /= peak;
            }
        }
    }
}

impl SampleData {
    /// Generate waveform data
    pub fn generate_waveform(&self, points_per_second: u32) -> WaveformData {
        WaveformData::from_samples(self, points_per_second)
    }
}
