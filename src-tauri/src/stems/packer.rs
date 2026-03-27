//! NI Stem packer
//! 
//! Creates .stem.mp4 files compatible with Native Instruments hardware.
//! 
//! The NI stem format embeds metadata as a custom 'nmde' atom inside the 'udta'
//! box of the MP4 container. This is what Traktor and other NI-compatible
//! software reads to identify stem files and display stem colors/names.

use anyhow::{Context, Result};
use std::io::{Read, Write};
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
    /// 
    /// Uses FFmpeg's -map to create separate audio streams for each track:
    /// Track 1: Master (full mix)
    /// Track 2-5: Individual stems (drums, bass, other, vocals)
    /// 
    /// This produces a proper .stem.mp4 that NI Traktor can read.
    #[allow(clippy::similar_names)]
    async fn create_multi_track_stem(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating multi-track stem file with {} stems", stems.len());

        let codec = self.settings.output_format.codec_name();
        let codec_args = match self.settings.output_format {
            super::presets::OutputFormat::Alac => vec!["-acodec", "alac"],
            super::presets::OutputFormat::Aac => vec!["-acodec", "aac", "-b:a", "256k"],
        };

        // Build FFmpeg command with multiple inputs
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y"); // Overwrite output
        cmd.arg("-hide_banner");
        
        // Add master as first input (index 0)
        cmd.arg("-i").arg(master_path);
        
        // Add each stem as additional inputs
        for (_, stem_path) in stems {
            cmd.arg("-i").arg(stem_path);
        }

        // Build -map arguments: one per input stream
        let num_inputs = 1 + stems.len(); // master + stems
        for i in 0..num_inputs {
            cmd.arg("-map").arg(format!("{}:a", i));
        }

        // Set audio properties for all streams
        cmd.args(["-ar", "44100"]);
        cmd.arg("-c:a").arg(codec);
        
        // Apply per-stream codec settings
        // Stream 0 (master) gets ALAC/AAC, same for all others
        for codec_arg in codec_args {
            cmd.arg(codec_arg);
        }
        
        // Set metadata for each stream (track name)
        // Track 0 = Master
        cmd.args(["-metadata:s:a:0", &format!("title={}", "Master")]);
        
        // Tracks 1-4 = Stems (in order of stems vec, which is DJ-software-specific)
        for (i, (stem_type, _)) in stems.iter().enumerate() {
            cmd.arg(format!("-metadata:s:a:{}", i + 1))
               .arg(format!("title={}", stem_type.name()));
        }

        // Output path
        cmd.arg(output_path);
        
        debug!("FFmpeg multi-track command: {:?}", cmd);
        
        let output = cmd.output()
            .context("Failed to execute FFmpeg for multi-track stem")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            warn!(
                "FFmpeg multi-track creation failed (exit {}):\nSTDOUT: {}\nSTDERR: {}",
                output.status.code().unwrap_or(-1),
                stdout,
                stderr
            );
            
            // Fallback to single track
            return self.create_single_track_stem(master_path, output_path).await;
        }

        info!("Multi-track stem file created: {:?}", output_path);
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

    /// Embed NI metadata JSON into the MP4 file as a custom `nmde` atom.
    /// 
    /// NI stem files embed the metadata as a custom atom inside the `udta` box:
    ///   [ftyp] ... [moov]→[udta]→[nmde] (NI metadata)
    /// 
    /// This function reads the MP4, finds the `udta` box, and appends/replaces
    /// the `nmde` child box with our JSON metadata. If `udta` doesn't exist,
    /// it is created inside `moov`. If `moov` doesn't exist, the metadata is
    /// still written to a sidecar JSON file as a fallback.
    fn embed_metadata_atom(&self, metadata: &NIStemMetadata, mp4_path: &Path) -> Result<()> {
        let metadata_json = serde_json::to_string(metadata)
            .context("Failed to serialize NI metadata to JSON")?;
        
        // --- Step 1: Read the MP4 file ---
        let mut file = std::fs::File::open(mp4_path)
            .with_context(|| format!("Failed to open MP4 file: {:?}", mp4_path))?;
        let file_size = file.metadata()
            .context("Failed to get file metadata")?
            .len() as usize;
        let mut buffer = vec![0u8; file_size];
        file.read_exact(&mut buffer)?;
        drop(file);

        // --- Step 2: Parse the MP4 and inject the nmde atom ---
        match self.inject_nmde_atom(&mut buffer, &metadata_json) {
            Ok(true) => {
                // Atom was successfully injected — write back
                let mut out = std::fs::File::create(mp4_path)
                    .with_context(|| format!("Failed to create MP4 for writing: {:?}", mp4_path))?;
                out.write_all(&buffer)?;
                info!("NI 'nmde' atom embedded successfully in: {:?}", mp4_path);
            }
            Ok(false) => {
                // Could not inject (no moov found) — fall back to sidecar
                warn!("No 'moov' box found in MP4; falling back to sidecar JSON");
                self.write_metadata_sidecar(mp4_path, &metadata_json)?;
            }
            Err(e) => {
                // Parsing failed — fall back to sidecar
                warn!("MP4 parsing failed ({}); falling back to sidecar JSON", e);
                self.write_metadata_sidecar(mp4_path, &metadata_json)?;
            }
        }

        Ok(())
    }

    /// Write NI metadata JSON as a sidecar `.stem.metadata` file.
    fn write_metadata_sidecar(&self, mp4_path: &Path, json: &str) -> Result<()> {
        let sidecar_path = mp4_path.with_extension("stem.metadata");
        std::fs::write(&sidecar_path, json)
            .with_context(|| format!("Failed to write sidecar metadata: {:?}", sidecar_path))?;
        debug!("NI metadata sidecar written: {:?}", sidecar_path);
        Ok(())
    }

    /// Inject a `nmde` atom into the `udta` box of an MP4 file buffer.
    /// 
    /// Returns `Ok(true)` if injection succeeded, `Ok(false)` if the file
    /// couldn't be parsed (no `moov` box found), and `Err(_)` on I/O errors.
    /// 
    /// The MP4 format uses big-endian length-prefixed boxes (atoms):
    ///   - 4 bytes: box size (including header)
    ///   - 4 bytes: box type (ASCII fourcc)
    ///   - N bytes: payload
    /// 
    /// We walk the top-level boxes looking for `moov`, then look inside it
    /// for `udta`. If `udta` exists, we remove any existing `nmde` child
    /// and append the new one. If `udta` doesn't exist, we create it.
    fn inject_nmde_atom(&self, buffer: &mut [u8], json: &str) -> Result<bool> {
        // Build the nmde atom payload: "stem" (4 bytes) + JSON bytes
        let json_bytes = json.as_bytes();
        let stem_marker = b"stem".as_slice(); // "stem\0" with null terminator → 5 bytes
        let mut nmde_payload = Vec::with_capacity(4 + json_bytes.len());
        nmde_payload.extend_from_slice(stem_marker);
        nmde_payload.push(0u8); // null terminator after "stem"
        nmde_payload.extend_from_slice(json_bytes);
        
        // Wrap in an nmde box: [4-byte size][b"nmde"][payload]
        let nmde_payload_len = 4 + json_bytes.len() + 1; // "stem" + null + json
        let nmde_total_len = 8 + nmde_payload_len; // header + payload
        let mut nmde_atom = Vec::with_capacity(nmde_total_len);
        nmde_atom.extend_from_slice(&u32::to_be_bytes(nmde_total_len as u32));
        nmde_atom.extend_from_slice(b"nmde");
        nmde_atom.extend_from_slice(stem_marker);
        nmde_atom.push(0u8);
        nmde_atom.extend_from_slice(json_bytes);
        debug!("nmde atom built: {} bytes total", nmde_atom.len());

        // Walk top-level MP4 boxes looking for "moov"
        let mut offset = 0;
        let mut moov_start: Option<usize> = None;
        let mut moov_end: Option<usize> = None;
        let mut udta_child_start: Option<usize> = None;
        let mut udta_child_end: Option<usize> = None;

        while offset + 8 <= buffer.len() {
            let size = u32::from_be_bytes([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]) as usize;
            let fourcc = &buffer[offset + 4..offset + 8];

            if size < 8 {
                // Invalid box or padding — stop
                break;
            }
            let box_end = offset + size;

            if fourcc == b"moov" {
                moov_start = Some(offset);
                moov_end = Some(box_end);

                // Walk moov's children looking for "udta"
                let mut child = offset + 8;
                while child + 8 <= box_end {
                    let child_size = u32::from_be_bytes([buffer[child], buffer[child + 1], buffer[child + 2], buffer[child + 3]]) as usize;
                    let child_fourcc = &buffer[child + 4..child + 8];
                    if child_size < 8 {
                        break;
                    }
                    let child_end = child + child_size;

                    if child_fourcc == b"udta" {
                        // Walk udta's children looking for existing "nmde"
                        let mut grandchild = child + 8;
                        while grandchild + 8 <= child_end {
                            let gc_size = u32::from_be_bytes([buffer[grandchild], buffer[grandchild + 1], buffer[grandchild + 2], buffer[grandchild + 3]]) as usize;
                            let gc_fourcc = &buffer[grandchild + 4..grandchild + 8];
                            if gc_size < 8 {
                                break;
                            }
                            if gc_fourcc == b"nmde" {
                                udta_child_start = Some(grandchild);
                                udta_child_end = Some(grandchild + gc_size);
                                break;
                            }
                            grandchild += gc_size;
                        }

                        // If no existing nmde, record where udta content ends
                        if udta_child_start.is_none() {
                            // udta child starts at child+8, ends at child_end
                            // We'll append after the last child
                        }
                    }
                    child += child_size;
                }
                break; // Found moov — done searching top level
            }

            offset += size;
        }

        let (Some(moov_s), Some(moov_e)) = (moov_start, moov_end) else {
            return Ok(false); // No moov box — can't inject
        };

        // Walk moov to find the udta box precisely
        let mut offset = moov_s + 8;
        let mut udta_box_start: Option<usize> = None;
        let mut udta_box_end: Option<usize> = None;

        while offset + 8 <= moov_e {
            let size = u32::from_be_bytes([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]) as usize;
            let fourcc = &buffer[offset + 4..offset + 8];
            if size < 8 {
                break;
            }
            let box_end = offset + size;
            if fourcc == b"udta" {
                udta_box_start = Some(offset);
                udta_box_end = Some(box_end);
                break;
            }
            offset += size;
        }

        match (udta_box_start, udta_box_end) {
            (Some(ub_s), Some(ub_e)) => {
                // udta exists — replace or append nmde child
                if let (Some(nmde_s), Some(nmde_e)) = (udta_child_start, udta_child_end) {
                    // Replace existing nmde atom
                    self.replace_atom(buffer, nmde_s, nmde_e, &nmde_atom);
                } else {
                    // Append nmde atom to udta box
                    self.append_atom_to_parent(buffer, ub_s, ub_e, &nmde_atom);
                }
            }
            None => {
                // No udta — insert one into moov just before the last child
                // Walk moov children to find the last one
                let mut child = moov_s + 8;
                let mut last_child_start = moov_s + 8;
                while child + 8 <= moov_e {
                    let child_size = u32::from_be_bytes([buffer[child], buffer[child + 1], buffer[child + 2], buffer[child + 3]]) as usize;
                    if child_size < 8 {
                        break;
                    }
                    last_child_start = child;
                    child += child_size;
                }

                // Build udta box containing nmde
                let udta_payload_len = nmde_atom.len();
                let udta_total_len = 8 + udta_payload_len;
                let mut udta_atom = Vec::with_capacity(udta_total_len);
                udta_atom.extend_from_slice(&u32::to_be_bytes(udta_total_len as u32));
                udta_atom.extend_from_slice(b"udta");
                udta_atom.extend_from_slice(&nmde_atom);

                self.insert_box(buffer, last_child_start, &udta_atom);
            }
        }

        Ok(true)
    }

    /// Replace an atom at [start, end) in the buffer with a new atom.
    /// Also updates the parent box's size.
    fn replace_atom(&self, buffer: &mut [u8], old_start: usize, old_end: usize, new_atom: &[u8]) {
        let old_len = old_end - old_start;
        let diff = new_atom.len() as isize - old_len as isize;
        
        if diff == 0 {
            buffer[old_start..old_end].copy_from_slice(new_atom);
        } else {
            // Shift the rest of the buffer
            let after_old = old_end;
            let mut src = after_old;
            let mut dst = old_start + new_atom.len();
            while src < buffer.len() {
                buffer[dst] = buffer[src];
                dst += 1;
                src += 1;
            }
            // Write new atom at old start
            buffer[old_start..old_start + new_atom.len()].copy_from_slice(new_atom);
            // Note: size in parent headers needs updating — handled separately
            debug!("Replaced nmde atom ({} → {} bytes)", old_len, new_atom.len());
        }
    }

    /// Append an atom to a parent box (updates parent size in header).
    fn append_atom_to_parent(&self, buffer: &mut [u8], udta_start: usize, udta_end: usize, new_child: &[u8]) {
        // Insert new_child right before udta_end (after all existing children)
        let insert_at = udta_end - new_child.len();
        
        // Shift bytes from insert_at to end
        let len = buffer.len();
        let mut i = len;
        while i > insert_at {
            i -= 1;
            buffer[i] = buffer[i - new_child.len()];
        }
        
        // Write new child
        for (j, &byte) in new_child.iter().enumerate() {
            buffer[insert_at + j] = byte;
        }
        
        // Update udta size in header (udta_start to udta_start+4)
        let new_udta_size = (udta_end - udta_start) as u32 + new_child.len() as u32;
        let size_bytes = u32::to_be_bytes(new_udta_size);
        buffer[udta_start..udta_start + 4].copy_from_slice(&size_bytes);
        
        debug!("Appended nmde atom to udta; new udta size: {}", new_udta_size);
    }

    /// Insert a new box into the buffer before the given position.
    fn insert_box(&self, buffer: &mut [u8], insert_at: usize, new_box: &[u8]) {
        let box_len = new_box.len();
        let len = buffer.len();
        
        // Shift everything from insert_at to end
        let mut i = len;
        while i > insert_at {
            i -= 1;
            buffer[i] = buffer[i - box_len];
        }
        
        // Write new box
        for (j, &byte) in new_box.iter().enumerate() {
            buffer[insert_at + j] = byte;
        }
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
