//! Integration tests for audio utility functions (WaveformData).

use stemgen_gui_lib::audio::waveform::WaveformData;
use stemgen_gui_lib::audio::decoder::SampleData;

fn make_test_samples(num_frames: usize, channels: u8, sample_rate: u32) -> SampleData {
    let interleaved: Vec<f32> = (0..num_frames * channels as usize)
        .map(|i| ((i as f32 * 0.01).sin() * 0.8).max(-1.0).min(1.0))
        .collect();
    
    SampleData {
        samples: interleaved,
        channels,
        sample_rate,
    }
}

#[test]
fn test_waveform_from_samples_returns_non_empty() {
    let samples = make_test_samples(44100, 2, 44100);
    
    let waveform = WaveformData::from_samples(&samples, 100);
    
    assert!(!waveform.points.is_empty(), "waveform must not be empty");
    assert_eq!(waveform.sample_rate, 44100);
}

#[test]
fn test_waveform_duration_calculated_correctly() {
    let samples = make_test_samples(44100, 2, 44100); // 1 second at 44100 Hz
    
    let waveform = WaveformData::from_samples(&samples, 10);
    
    // Duration should be approximately 1 second
    assert!((waveform.duration_secs - 1.0).abs() < 0.1);
}

#[test]
fn test_waveform_normalize() {
    let samples = make_test_samples(44100, 1, 44100);
    
    let mut waveform = WaveformData::from_samples(&samples, 100);
    
    // Normalize should run without panic
    waveform.normalize();
    
    // After normalization, peak should be <= 1.0
    let peak = waveform.get_peak();
    assert!(peak <= 1.0, "normalized peak should be <= 1.0, got {}", peak);
}

#[test]
fn test_waveform_get_peak() {
    let samples = make_test_samples(22050, 1, 22050);
    
    let waveform = WaveformData::from_samples(&samples, 50);
    let peak = waveform.get_peak();
    
    // Our test data is between -0.8 and 0.8, so peak should be > 0
    assert!(peak > 0.0, "peak should be > 0 for non-zero test data");
}

#[test]
fn test_waveform_points_have_min_max_rms() {
    let samples = make_test_samples(44100, 1, 44100);
    
    let waveform = WaveformData::from_samples(&samples, 10);
    
    for point in &waveform.points {
        // min should be <= max
        assert!(point.min <= point.max);
        // rms should be between min and max
        assert!(point.rms >= point.min);
        assert!(point.rms <= point.max);
    }
}

#[test]
fn test_waveform_different_sample_rates() {
    let samples_44100 = make_test_samples(44100, 1, 44100);
    let samples_22050 = make_test_samples(22050, 1, 22050);
    
    let wf_44100 = WaveformData::from_samples(&samples_44100, 50);
    let wf_22050 = WaveformData::from_samples(&samples_22050, 50);
    
    // Both should produce non-empty waveforms
    assert!(!wf_44100.points.is_empty());
    assert!(!wf_22050.points.is_empty());
    
    // Both should have approximately 1 second duration
    // (frames / sample_rate = duration in seconds)
    assert!((wf_44100.duration_secs - 1.0).abs() < 0.1, 
        "44100 Hz waveform should be ~1s, got {}", wf_44100.duration_secs);
    assert!((wf_22050.duration_secs - 1.0).abs() < 0.1, 
        "22050 Hz waveform should be ~1s, got {}", wf_22050.duration_secs);
    
    // Sample rate should be preserved
    assert_eq!(wf_44100.sample_rate, 44100);
    assert_eq!(wf_22050.sample_rate, 22050);
}

#[test]
fn test_waveform_mono_vs_stereo() {
    let mono = make_test_samples(44100, 1, 44100);
    let stereo = make_test_samples(44100, 2, 44100);
    
    let wf_mono = WaveformData::from_samples(&mono, 50);
    let wf_stereo = WaveformData::from_samples(&stereo, 50);
    
    // Both should produce results
    assert!(!wf_mono.points.is_empty());
    assert!(!wf_stereo.points.is_empty());
}
