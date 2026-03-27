//! NI Stem format module
//!
//! Creates and parses .stem.mp4 files for DJ software compatibility.

pub mod metadata;
pub mod packer;
pub mod presets;

// Re-exports for convenience access
pub use metadata::{MasterData, NIStemMetadata, StemData, StemInfo, StemType};
pub use packer::StemPacker;
pub use presets::{all_dj_software, DJSoftware, ExportSettings, OutputFormat, QualityPreset};
