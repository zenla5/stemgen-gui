//! NI Stem packer - Creates .stem.mp4 files for DJ software

use anyhow::{Context, Result};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{debug, info, warn};

use super::metadata::{NIStemMetadata, StemData, StemType};
use super::presets::ExportSettings;

pub struct StemPacker {
    settings: ExportSettings,
}

impl StemPacker {
    pub fn new(settings: ExportSettings) -> Self {
        Self { settings }
    }

    pub fn settings(&self) -> &ExportSettings {
        &self.settings
    }

    #[allow(clippy::similar_names)]
    pub async fn pack(
        &self,
        master_path: &Path,
        stem_paths: &[(StemType, PathBuf)],
        output_path: &Path,
    ) -> Result<()> {
        info!("Packing stems to: {:?}", output_path);

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let stem_order = self.settings.dj_software.stem_order();
        let ordered_stems: Vec<(StemType, PathBuf)> = stem_order
            .iter()
            .filter_map(|st| stem_paths.iter().find(|(t, _)| t == st).cloned())
            .collect();

        if ordered_stems.is_empty() && !stem_paths.is_empty() {
            warn!("No matching stems found for DJ software preset");
        }

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

        self.create_stem_mp4(master_path, &ordered_stems, &metadata, output_path)
            .await?;
        info!("Successfully created: {:?}", output_path);
        Ok(())
    }

    #[allow(clippy::similar_names)]
    async fn create_stem_mp4(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        metadata: &NIStemMetadata,
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating stem.mp4 with FFmpeg...");

        if !self.is_ffmpeg_available() {
            anyhow::bail!("FFmpeg not found. Please install FFmpeg to create stem files.");
        }

        if !stems.is_empty() {
            self.create_multi_track_stem(master_path, stems, output_path)
                .await?;
        } else {
            self.create_single_track_stem(master_path, output_path)
                .await?;
        }

        self.embed_metadata_atom(metadata, output_path)?;

        let metadata_path = output_path.with_extension("metadata.json");
        let metadata_json =
            serde_json::to_string_pretty(metadata).context("Failed to serialize metadata")?;
        std::fs::write(&metadata_path, metadata_json)?;

        debug!("Created metadata file: {:?}", metadata_path);
        Ok(())
    }

    #[allow(clippy::similar_names)]
    async fn create_multi_track_stem(
        &self,
        master_path: &Path,
        stems: &[(StemType, PathBuf)],
        output_path: &Path,
    ) -> Result<()> {
        info!("Creating multi-track stem file with {} stems", stems.len());

        let codec_args = match self.settings.output_format {
            super::presets::OutputFormat::Alac => vec!["-acodec", "alac"],
            super::presets::OutputFormat::Aac => vec!["-acodec", "aac", "-b:a", "256k"],
        };

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y").arg("-hide_banner").arg("-i").arg(master_path);

        for (_, stem_path) in stems {
            cmd.arg("-i").arg(stem_path);
        }

        let num_inputs = 1 + stems.len();
        for i in 0..num_inputs {
            cmd.arg("-map").arg(format!("{}:a", i));
        }

        cmd.args(["-ar", "44100"]);

        for codec_arg in codec_args {
            cmd.arg(codec_arg);
        }

        cmd.args(["-metadata:s:a:0", "title=Master"]);

        for (i, (stem_type, _)) in stems.iter().enumerate() {
            cmd.arg(format!("-metadata:s:a:{}", i + 1))
                .arg(format!("title={}", stem_type.name()));
        }

        cmd.arg(output_path);

        debug!("FFmpeg multi-track command: {:?}", cmd);

        let output = cmd
            .output()
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
            return self
                .create_single_track_stem(master_path, output_path)
                .await;
        }

        info!("Multi-track stem file created: {:?}", output_path);
        Ok(())
    }

    async fn create_single_track_stem(&self, master_path: &Path, output_path: &Path) -> Result<()> {
        info!("Creating single-track stem file from master");

        let codec = self.settings.output_format.codec_name();

        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-i",
                master_path.to_str().unwrap(),
                "-acodec",
                codec,
                "-ar",
                "44100",
                "-ac",
                "2",
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

    pub fn embed_metadata_atom(&self, metadata: &NIStemMetadata, mp4_path: &Path) -> Result<()> {
        let metadata_json =
            serde_json::to_string(metadata).context("Failed to serialize NI metadata to JSON")?;

        let mut file = std::fs::File::open(mp4_path)
            .with_context(|| format!("Failed to open MP4 file: {:?}", mp4_path))?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        drop(file);

        match self.inject_nmde_atom(&mut buffer, &metadata_json) {
            Ok(true) => {
                let mut out = std::fs::File::create(mp4_path)
                    .with_context(|| format!("Failed to create MP4 for writing: {:?}", mp4_path))?;
                use std::io::Write;
                out.write_all(&buffer)?;
                info!("NI 'nmde' atom embedded successfully in: {:?}", mp4_path);
            }
            Ok(false) => {
                warn!("No 'moov' box found in MP4; falling back to sidecar JSON");
                self.write_metadata_sidecar(mp4_path, &metadata_json)?;
            }
            Err(e) => {
                warn!("MP4 parsing failed ({}); falling back to sidecar JSON", e);
                self.write_metadata_sidecar(mp4_path, &metadata_json)?;
            }
        }

        Ok(())
    }

    fn write_metadata_sidecar(&self, mp4_path: &Path, json: &str) -> Result<()> {
        let sidecar_path = mp4_path.with_extension("stem.metadata");
        std::fs::write(&sidecar_path, json)
            .with_context(|| format!("Failed to write sidecar metadata: {:?}", sidecar_path))?;
        debug!("NI metadata sidecar written: {:?}", sidecar_path);
        Ok(())
    }

    fn inject_nmde_atom(&self, buffer: &mut Vec<u8>, json: &str) -> Result<bool> {
        let json_bytes = json.as_bytes();
        let nmde_payload_len = 5 + json_bytes.len();
        let nmde_total_len = 8 + nmde_payload_len;

        let mut nmde_atom = Vec::with_capacity(nmde_total_len);
        nmde_atom.extend_from_slice(&u32::to_be_bytes(nmde_total_len as u32));
        nmde_atom.extend_from_slice(b"nmde");
        nmde_atom.extend_from_slice(b"stem");
        nmde_atom.push(0u8);
        nmde_atom.extend_from_slice(json_bytes);
        debug!("nmde atom built: {} bytes total", nmde_atom.len());

        let mut offset = 0usize;
        let mut moov_start: Option<usize> = None;
        let mut moov_end: Option<usize> = None;
        let mut udta_child_start: Option<usize> = None;
        let mut udta_child_end: Option<usize> = None;

        while offset + 8 <= buffer.len() {
            let size = u32::from_be_bytes([
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ]) as usize;
            let fourcc = &buffer[offset + 4..offset + 8];

            if size < 8 {
                break;
            }
            let box_end = offset + size;

            if fourcc == b"moov" {
                moov_start = Some(offset);
                moov_end = Some(box_end);

                let mut child = offset + 8;
                while child + 8 <= box_end {
                    let child_size = u32::from_be_bytes([
                        buffer[child],
                        buffer[child + 1],
                        buffer[child + 2],
                        buffer[child + 3],
                    ]) as usize;
                    let child_fourcc = &buffer[child + 4..child + 8];
                    if child_size < 8 {
                        break;
                    }
                    let child_end = child + child_size;

                    if child_fourcc == b"udta" {
                        let mut grandchild = child + 8;
                        while grandchild + 8 <= child_end {
                            let gc_size = u32::from_be_bytes([
                                buffer[grandchild],
                                buffer[grandchild + 1],
                                buffer[grandchild + 2],
                                buffer[grandchild + 3],
                            ]) as usize;
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
                    }
                    child += child_size;
                }
                break;
            }

            offset += size;
        }

        let (Some(moov_s), Some(moov_e)) = (moov_start, moov_end) else {
            debug!("No moov box found");
            return Ok(false);
        };

        let mut offset = moov_s + 8;
        let mut udta_box_start: Option<usize> = None;
        let mut udta_box_end: Option<usize> = None;

        while offset + 8 <= moov_e {
            let size = u32::from_be_bytes([
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ]) as usize;
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

        debug!("moov at {}..{}", moov_s, moov_e);
        debug!("udta_box at {:?}..{:?}", udta_box_start, udta_box_end);
        debug!("udta_child at {:?}..{:?}", udta_child_start, udta_child_end);

        match (udta_box_start, udta_box_end) {
            (Some(ub_s), Some(ub_e)) => {
                if let (Some(nmde_s), Some(nmde_e)) = (udta_child_start, udta_child_end) {
                    self.splice_replace(buffer, nmde_s, nmde_e, &nmde_atom);
                } else {
                    self.splice_append(buffer, ub_s, ub_e, &nmde_atom);
                }
            }
            (None, None) | (None, Some(_)) | (Some(_), None) => {
                let mut udta_box = Vec::new();
                let udta_total_len = 8 + nmde_atom.len();
                udta_box.extend_from_slice(&u32::to_be_bytes(udta_total_len as u32));
                udta_box.extend_from_slice(b"udta");
                udta_box.extend_from_slice(&nmde_atom);

                let mut child = moov_s + 8;
                let mut last_child_start = moov_s + 8;
                while child + 8 <= moov_e {
                    let child_size = u32::from_be_bytes([
                        buffer[child],
                        buffer[child + 1],
                        buffer[child + 2],
                        buffer[child + 3],
                    ]) as usize;
                    if child_size < 8 {
                        break;
                    }
                    last_child_start = child;
                    child += child_size;
                }

                self.splice_insert(buffer, last_child_start, &udta_box);
            }
        }

        debug!(
            "nmde atom injected, total buffer size: {} bytes",
            buffer.len()
        );
        Ok(true)
    }

    fn splice_replace(
        &self,
        buffer: &mut Vec<u8>,
        old_start: usize,
        old_end: usize,
        new_atom: &[u8],
    ) {
        buffer.splice(old_start..old_end, new_atom.iter().cloned());
        debug!(
            "Splice-replaced {} bytes with {} bytes",
            old_end - old_start,
            new_atom.len()
        );
    }

    fn splice_append(
        &self,
        buffer: &mut Vec<u8>,
        udta_start: usize,
        udta_end: usize,
        new_child: &[u8],
    ) {
        let insert_at = udta_end;
        buffer.splice(insert_at..insert_at, new_child.iter().cloned());

        let new_udta_size = (udta_end - udta_start) as u32 + new_child.len() as u32;
        let size_bytes = u32::to_be_bytes(new_udta_size);
        buffer[udta_start..udta_start + 4].copy_from_slice(&size_bytes);

        debug!("Splice-append: new udta size = {}", new_udta_size);
    }

    fn splice_insert(&self, buffer: &mut Vec<u8>, insert_at: usize, new_box: &[u8]) {
        buffer.splice(insert_at..insert_at, new_box.iter().cloned());
        debug!("Splice-insert: inserted {} bytes", new_box.len());
    }

    fn is_ffmpeg_available(&self) -> bool {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

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
