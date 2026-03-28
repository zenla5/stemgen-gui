//! Audio processing module for Stemgen-GUI
//!
//! Handles audio decoding, resampling, format conversion, and hashing.

pub mod converter;
pub mod decoder;
pub mod hasher;
pub mod resampler;
pub mod waveform;

pub use decoder::*;
pub use hasher::{hash_file, verify_hash, HashError};
pub use resampler::*;
#[allow(unused_imports)]
pub use waveform::*;
