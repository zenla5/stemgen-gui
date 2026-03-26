//! NI Stem format module
//! 
//! Creates and parses .stem.mp4 files for DJ software compatibility.

pub mod packer;
pub mod metadata;
pub mod presets;

// Re-exports for convenience access
pub use metadata::{NIStemMetadata, StemData, StemType, MasterData, StemInfo};
pub use presets::{DJSoftware, OutputFormat, QualityPreset, ExportSettings, all_dj_software};
pub use packer::StemPacker;
