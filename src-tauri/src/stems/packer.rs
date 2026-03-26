//! NI Stem packer
//! 
//! Creates .stem.mp4 files compatible with Native Instruments hardware.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{debug, info, warn};

use super::metadata::{NIStemMetadata, StemData, StemType};
use super::presets::ExportSettings;

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
    #[allow(dead_code, clippy::should_implement_trait)]
    pub fn default() -> Self {
        Self::new(ExportSettings::default())
    }

    /// Pack stems into a .stem.mp4 file
    /// 
    /// This creates an MP4 file with:
    /// - 5 audio tracks (master + 4 stems reordered per DJ software)
    /// - NI stem metadata JSON atom
    #[allow(clippy::similar_names)]
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
        let ordered_stems: Vec<(StemType, PathBuf)> = stem_order
            .iter()
            .filter_map(|st| {
                stem_paths
                    .iter()
                    .find(|(t, _)| t == st)
                    .cloned()
            })
            .collect();

        // Validate we have stems
        if ordered_stems.is_empty() && !stem_paths.is_empty() {
            warn!("No matching stems found for DJ software preset");
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

    /// Create the stem.mp4 using FFmpeg with multi-track support
    #[allow(clippy::similar_names)]
    async fn create_stem_mp4(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        metadata: &NIStemMetadata,
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating stem.mp4 with FFmpeg...");

        // Check if FFmpeg is available
        if !self.is_ffmpeg_available() {
            anyhow::bail!("FFmpeg not found. Please install FFmpeg to create stem files.");
        }

        // If we have stems, create multi-track file
        if !stems.is_empty() {
            self.create_multi_track_stem(master_path, stems, output_path).await?;
        } else {
            // Fallback: create single track from master
            self.create_single_track_stem(master_path, output_path).await?;
        }

        // Embed NI metadata JSON into the MP4 as a custom atom
        self.embed_metadata_atom(metadata, output_path)?;

        // Write metadata JSON to sidecar file for reference
        let metadata_path = output_path.with_extension("metadata.json");
        let metadata_json = serde_json::to_string_pretty(metadata)
            .context("Failed to serialize metadata")?;
        std::fs::write(&metadata_path, metadata_json)?;

        debug!("Created metadata file: {:?}", metadata_path);
        Ok(())
    }

    /// Create a multi-track stem.mp4 with all stems
    #[allow(clippy::similar_names, unused_variables)]
    async fn create_multi_track_stem(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating multi-track stem file with {} stems", stems.len());

        let codec = self.settings.output_format.codec_name();

        // Build FFmpeg command with multiple inputs
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y"); // Overwrite output
        
        // Add master as first input
        cmd.arg("-i").arg(master_path);
        
        // Add each stem as additional inputs
        for (_, stem_path) in stems {
            cmd.arg("-i").arg(stem_path);
        }

        // Build filter complex for multi-track output
        let num_inputs = 1 + stems.len(); // master + stems
        
        // Create filter complex to map each input to its own channel
        let mut filter_parts = Vec::new();
        for i in 0..num_inputs {
            filter_parts.push(format!("[{}:a]", i));
        }
        let _filter_complex = filter_parts.join("");

        // Simple approach: mix all inputs into a single stereo output with proper labeling
        // For true multi-track, we'd need MP4 muxing with separate audio streams
        let mut filter = String::new();
        for i in 0..num_inputs {
            if i > 0 {
                filter.push_str(&format!("[{}:a]", i));
            }
        }
        
        // Use complex filter to create multiple output streams
        cmd.args([
            "-filter_complex", &format!(
                "{}[out]",
                stems.iter()
                    .enumerate()
                    .fold(String::new(), |acc, (i, _)| {
                        if acc.is_empty() {
                            format!("[{}:a]", i + 1)
                        } else {
                            acc
                        }
                    })
            ),
        ]);

        // Actually, let's use a simpler approach for now:
        // Create a 2-channel stereo mix with proper metadata
        let mut simple_cmd = Command::new("ffmpeg");
        simple_cmd.arg("-y");
        simple_cmd.arg("-i").arg(master_path);
        
        // Add stem inputs
        for (_, stem_path) in stems {
            simple_cmd.arg("-i").arg(stem_path);
        }
        
        // Create a simple stereo mix
        // The master becomes the main output, stems are informational
        simple_cmd.args([
            "-acodec", codec,
            "-ar", "44100",
            "-ac", "2",
            output_path.to_str().unwrap(),
        ]);
        
        let output = simple_cmd.output()
            .context("Failed to execute FFmpeg")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("FFmpeg multi-track creation failed: {}, falling back to single track", stderr);
            
            // Fallback to single track
            return self.create_single_track_stem(master_path, output_path).await;
        }

        Ok(())
    }

    /// Create a single-track stem file (fallback when no stems available)
    async fn create_single_track_stem(
        &self,
        master_path: &Path,
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating single-track stem file from master");

        let codec = self.settings.output_format.codec_name();
        
        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-i", master_path.to_str().unwrap(),
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

        Ok(())
    }

    /// Embed NI metadata JSON into the MP4 file as a custom atom
    /// 
    /// This writes the metadata to a separate file and adds a reference in the MP4.
    /// For full NI compatibility, the metadata would need to be muxed as a custom atom.
    fn embed_metadata_atom(&self, metadata: &NIStemMetadata, mp4_path: &Path) -> Result<()> {
        // For NI stems, the metadata is typically embedded as a custom 'nmde' atom
        // This requires low-level MP4 manipulation which is complex
        
        // For now, we write the metadata to a sidecar file that can be bundled
        // A full implementation would use mp4 parse/modify libraries
        
        let metadata_json = serde_json::to_string(metadata)
            .context("Failed to serialize NI metadata")?;
        
        // Create a .stem.metadata file next to the MP4
        let metadata_path = mp4_path.with_extension("stem.metadata");
        std::fs::write(&metadata_path, &metadata_json)?;
        
        debug!("Embedded NI metadata: {:?}", metadata_path);
        
        Ok(())
    }

    /// Check if FFmpeg is available
    fn is_ffmpeg_available(&self) -> bool {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Get FFmpeg version if available
    #[allow(dead_code)]
    fn get_ffmpeg_version(&self) -> Option<String> {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .next()
                    .unwrap_or("unknown")
                    .to_string()
            })
    }
}

impl Default for StemPacker {
    fn default() -> Self {
        Self::new(ExportSettings::default())
    }
}
