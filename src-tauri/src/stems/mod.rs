//! NI Stem format module
//!
//! Creates and parses .stem.mp4 files for DJ software compatibility.

pub mod metadata;
pub mod packer;
pub mod presets;
pub mod provenance;
pub mod staleness;

pub use provenance::{
    save_stem_provenance_sidecar, save_stem_user_notes, StemProvenance,
    PROVENANCE_SCHEMA_VERSION,
};
pub use staleness::{
    check_stem_staleness, is_version_newer, load_registry, save_registry,
    ModelVersion, ModelVersionRegistry, StalenessReason, StalenessReport, StalenessRules,
    StalenessStatus,
};

// Re-exports for convenience access
pub use metadata::{MasterData, NIStemMetadata, StemData, StemInfo, StemType};
pub use packer::StemPacker;
pub use presets::{all_dj_software, DJSoftware, ExportSettings, OutputFormat, QualityPreset};
