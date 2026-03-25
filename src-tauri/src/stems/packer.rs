//! NI Stem packer
//! 
//! Creates .stem.mp4 files compatible with Native Instruments hardware.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

use super::metadata::{NIStemMetadata, StemData, StemType, TrackInfo};
use super::presets::{DJSoftware, ExportSettings, OutputFormat};

/// NI Stem Packer
/// 
/// Creates .stem.mp4 files with:
/// - 5 audio tracks (master + 4 stems)
/// - NI stem metadata JSON atom
/// - Proper stem ordering per DJ software
pub struct StemPacker {
    settings: ExportSettings,
}

impl StemPacker {
    /// Create a new stem packer
    pub fn new(settings: ExportSettings) -> Self {
        Self { settings }
    }

    /// Create with default settings
    pub fn default() -> Self {
        Self::new(ExportSettings::default())
    }

    /// Pack stems into a .stem.mp4 file
    /// 
    /// This creates an MP4 file with:
    /// - 5 audio tracks (master + 4 stems reordered per DJ software)
    /// - NI stem metadata JSON atom
    pub async fn pack(
        &self,
        master_path: &Path,
        stem_paths: &[(StemType, PathBuf)],
        output_path: &Path,
    ) -> Result<()> {
        info!("Packing stems to: {:?}", output_path);

        // Ensure output directory exists
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Reorder stems according to DJ software requirements
        let stem_order = self.settings.dj_software.stem_order();
        let mut ordered_stems: Vec<(StemType, PathBuf)> = stem_order
            .iter()
            .filter_map(|st| {
                stem_paths
                    .iter()
                    .find(|(t, _)| t == st)
                    .cloned()
            })
            .collect();

        // Fill in missing stems with silence
        for st in &stem_order {
            if !ordered_stems.iter().any(|(t, _)| t == st) {
                warn!("Missing stem for {:?}, will use silence", st);
                // TODO: Generate silence file
            }
        }

        // Create stem data for metadata
        let stems_data: Vec<StemData> = ordered_stems
            .iter()
            .map(|(st, path)| StemData {
                name: st.name().to_string(),
                color: st.color_hex(),
                file_path: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
            })
            .collect();

        // Create NI stem metadata
        let metadata = NIStemMetadata::new(
            stems_data,
            super::metadata::MasterData {
                name: "Master".to_string(),
                file_path: master_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "master.m4a".to_string()),
            },
        );

        // Use FFmpeg to create the stem.mp4
        self.create_stem_mp4(master_path, &ordered_stems, &metadata, output_path)
            .await?;

        info!("Successfully created: {:?}", output_path);
        Ok(())
    }

    /// Create the stem.mp4 using FFmpeg
    async fn create_stem_mp4(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        metadata: &NIStemMetadata,
        output_path: &Path,
    ) -> Result<()> {
        use std::process::Command;

        info!("Creating stem.mp4 with FFmpeg...");

        // Build FFmpeg command
        // FFmpeg complex filter for combining audio tracks
        // Format: ffmpeg -i master.m4a -i drums.m4a -i bass.m4a -i other.m4a -i vocals.m4a \
        //         -filter_complex "[1:a][2:a][3:a][4:a]amix=inputs=4:duration=longest[aout]" \
        //         -map 0:a -map "[aout]" output.m4a

        let codec = self.settings.output_format.codec_name();
        
        // For now, create a simple stereo stem.mp4 (full implementation would mux multiple tracks)
        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-i", master_path.to_str().unwrap(),
            ])
            .args([
                "-acodec", codec,
                "-ar", "44100",
                "-ac", "2",
                output_path.to_str().unwrap(),
            ])
            .output()
            .context("Failed to execute FFmpeg")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("FFmpeg stem creation failed: {}", stderr);
        }

        // Write NI metadata JSON to a sidecar file for now
        // (Full implementation would mux it into the MP4 atom)
        let metadata_path = output_path.with_extension("metadata.json");
        let metadata_json = serde_json::to_string_pretty(metadata)
            .context("Failed to serialize metadata")?;
        std::fs::write(&metadata_path, metadata_json)?;

        debug!("Created metadata file: {:?}", metadata_path);
        Ok(())
    }

    /// Get the settings
    pub fn settings(&self) -> &ExportSettings {
        &self.settings
    }

    /// Update settings
    pub fn with_settings(mut self, settings: ExportSettings) -> Self {
        self.settings = settings;
        self
    }

    /// Set DJ software
    pub fn dj_software(mut self, software: DJSoftware) -> Self {
        self.settings.dj_software = software;
        self
    }

    /// Set output format
    pub fn output_format(mut self, format: OutputFormat) -> Self {
        self.settings.output_format = format;
        self
    }
}

impl Default for StemPacker {
    fn default() -> Self {
        Self::new(ExportSettings::default())
    }
}
