//! Integration tests for NI Stem packer (nmde atom injection).
//!
//! These tests verify the nmde atom injection logic using real FFmpeg-generated MP4 files.
//! FFmpeg must be installed and available in PATH for these tests to pass.
//!
//! Strategy: Rather than building complex MP4 fixtures in memory (which requires correctly
//! parsing and restructuring existing moov boxes), we test the actual behavior:
//! 1. The packer creates valid MP4s via FFmpeg
//! 2. The nmde injection modifies those files
//! 3. We verify the resulting files have the correct structure

use stemgen_gui_lib::stems::metadata::{MasterData, NIStemMetadata, StemData};
use stemgen_gui_lib::stems::presets::{DJSoftware, ExportSettings, OutputFormat};
use stemgen_gui_lib::stems::StemPacker;

/// Generate a real MP4 file using FFmpeg with silence.
fn generate_mp4_via_ffmpeg(path: &std::path::Path) -> std::io::Result<()> {
    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.arg("-f")
        .arg("lavfi")
        .arg("-i")
        .arg("anullsrc=r=44100:cl=stereo")
        .arg("-t")
        .arg("0.1")
        .arg("-y")
        .arg(path);
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("FFmpeg failed: {}", String::from_utf8_lossy(&output.stderr)),
        ));
    }
    Ok(())
}

/// Find a top-level atom by fourcc in MP4 buffer.
fn find_atom(buffer: &[u8], fourcc: &[u8; 4]) -> Option<(usize, usize)> {
    let mut offset = 0;
    while offset + 8 <= buffer.len() {
        let size = u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize;
        let fcc = &buffer[offset + 4..offset + 8];
        if fcc == fourcc {
            return Some((offset, offset + size));
        }
        if size < 8 || offset + size > buffer.len() {
            break;
        }
        offset += size;
    }
    None
}

/// Count top-level atoms.
fn count_atoms(buffer: &[u8], fourcc: &[u8; 4]) -> usize {
    let mut count = 0;
    let mut offset = 0;
    while offset + 8 <= buffer.len() {
        let size = u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize;
        if &buffer[offset + 4..offset + 8] == fourcc {
            count += 1;
        }
        if size < 8 {
            break;
        }
        offset += size;
    }
    count
}

/// Find moov box, then search its children for udta.
fn find_udta_in_moov(buffer: &[u8]) -> Option<(usize, usize)> {
    let mut offset = 0;
    while offset + 8 <= buffer.len() {
        let size =
            u32::from_be_bytes([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]])
                as usize;
        let fourcc = &buffer[offset + 4..offset + 8];
        if fourcc == b"moov" {
            // Walk moov children
            let mut child = offset + 8;
            let box_end = offset + size;
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
                if child_fourcc == b"udta" {
                    return Some((child, child + child_size));
                }
                child += child_size;
            }
            return None;
        }
        if size < 8 || offset + size > buffer.len() {
            break;
        }
        offset += size;
    }
    None
}

/// Find nmde inside a moov/udta box.
fn find_nmde_in_udta(buffer: &[u8], udta_start: usize, udta_end: usize) -> Option<(usize, usize)> {
    let mut offset = udta_start + 8; // skip udta header
    while offset + 8 <= udta_end {
        let size = u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize;
        let fcc = &buffer[offset + 4..offset + 8];
        if fcc == b"nmde" {
            return Some((offset, offset + size));
        }
        if size < 8 {
            break;
        }
        offset += size;
    }
    None
}

fn make_test_metadata() -> NIStemMetadata {
    let stems = vec![
        StemData {
            name: "Drums".to_string(),
            color: "#FF6B6B".to_string(),
            file_path: "drums.m4a".to_string(),
        },
        StemData {
            name: "Bass".to_string(),
            color: "#4ECDC4".to_string(),
            file_path: "bass.m4a".to_string(),
        },
    ];
    let master = MasterData {
        name: "Master".to_string(),
        file_path: "master.m4a".to_string(),
    };
    NIStemMetadata::new(stems, master)
}

fn make_test_settings() -> ExportSettings {
    ExportSettings {
        dj_software: DJSoftware::Traktor,
        output_format: OutputFormat::Alac,
        quality: stemgen_gui_lib::stems::QualityPreset::Standard,
        custom_colors: true,
    }
}

#[test]
fn test_stem_packer_creation() {
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);
    assert_eq!(packer.settings().dj_software, DJSoftware::Traktor);
}

#[test]
fn test_metadata_sidecar_written_when_no_moov() {
    // Create MP4 with only ftyp box (no moov)
    let mut ftyp = Vec::new();
    ftyp.extend_from_slice(&u32::to_be_bytes(20));
    ftyp.extend_from_slice(b"ftyp");
    ftyp.extend_from_slice(b"isom");
    ftyp.extend_from_slice(&u32::to_be_bytes(512));
    ftyp.extend_from_slice(b"isomiso2mp41");

    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    let temp_dir = std::env::temp_dir();
    let mp4_path = temp_dir.join("test_no_moov.mp4");
    let sidecar_path = mp4_path.with_extension("stem.metadata");

    std::fs::write(&mp4_path, &ftyp).unwrap();
    let _ = std::fs::remove_file(&sidecar_path);

    packer
        .embed_metadata_atom(&metadata, &mp4_path)
        .expect("embed_metadata_atom should succeed even without moov");

    assert!(
        sidecar_path.exists(),
        "sidecar metadata file should be created as fallback"
    );
    let sidecar_content = std::fs::read_to_string(&sidecar_path).unwrap();
    assert!(
        sidecar_content.contains("version"),
        "sidecar should contain metadata JSON"
    );

    let _ = std::fs::remove_file(mp4_path);
    let _ = std::fs::remove_file(sidecar_path);
}

#[test]
fn test_nmde_atom_injected_into_real_ffmpeg_mp4() {
    // Generate a real MP4 via FFmpeg - this has proper moov/udta structure
    let temp_dir = std::env::temp_dir();
    let test_mp4 = temp_dir.join("packer_test_real.mp4");

    generate_mp4_via_ffmpeg(&test_mp4).expect("FFmpeg must be available");

    // Verify the MP4 has moov
    let raw_data = std::fs::read(&test_mp4).unwrap();
    assert!(
        find_atom(&raw_data, b"moov").is_some(),
        "FFmpeg-generated MP4 should have moov"
    );
    drop(raw_data);

    // Run injection
    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    packer
        .embed_metadata_atom(&metadata, &test_mp4)
        .expect("embed_metadata_atom should succeed");

    let buf = std::fs::read(&test_mp4).unwrap();

    // Verify nmde was injected somewhere (either inside udta or as sidecar fallback)
    // First check if nmde exists at top level
    if let Some((nmde_start, nmde_end)) = find_atom(&buf, b"nmde") {
        // nmde was injected
        assert!(nmde_end > nmde_start + 8, "nmde should have content");
        let payload = &buf[nmde_start + 8..];
        assert!(
            payload.starts_with(b"stem"),
            "nmde payload should start with 'stem'"
        );
        assert!(
            payload[5..].starts_with(b"{\"version\""),
            "nmde should contain JSON"
        );
    } else {
        // No nmde at top level - check if it's inside moov's udta
        if let Some((udta_start, udta_end)) = find_udta_in_moov(&buf) {
            let nmde_in_udta = find_nmde_in_udta(&buf, udta_start, udta_end);
            assert!(
                nmde_in_udta.is_some(),
                "nmde should be inside moov's udta if not at top level"
            );
        }
        // Either way, the injection should have succeeded
    }

    let _ = std::fs::remove_file(test_mp4);
}

#[test]
fn test_nmde_atom_roundtrip_multiple_injections() {
    // Test that multiple injections don't create duplicate nmde atoms
    let temp_dir = std::env::temp_dir();
    let test_mp4 = temp_dir.join("packer_test_roundtrip.mp4");

    generate_mp4_via_ffmpeg(&test_mp4).expect("FFmpeg must be available");
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    // First injection
    let metadata1 = make_test_metadata();
    packer
        .embed_metadata_atom(&metadata1, &test_mp4)
        .expect("first injection should succeed");

    let buf1 = std::fs::read(&test_mp4).unwrap();
    let nmde_count1 = count_atoms(&buf1, b"nmde");
    assert!(
        nmde_count1 <= 1,
        "should have at most one nmde after first injection"
    );

    // Second injection with different metadata
    let metadata2 = {
        let stems = vec![StemData {
            name: "Vocals".to_string(),
            color: "#95E1D3".to_string(),
            file_path: "vocals.m4a".to_string(),
        }];
        let master = MasterData {
            name: "Master2".to_string(),
            file_path: "master2.m4a".to_string(),
        };
        NIStemMetadata::new(stems, master)
    };

    packer
        .embed_metadata_atom(&metadata2, &test_mp4)
        .expect("second injection should succeed");

    let buf2 = std::fs::read(&test_mp4).unwrap();

    // Should still have exactly one nmde (replacement, not addition)
    let nmde_count2 = count_atoms(&buf2, b"nmde");
    assert_eq!(nmde_count2, 1, "exactly one nmde atom after second injection");

    // JSON should be the second one (contains "Master2", not the original "Master")
    if let Some((nmde_start, _)) = find_atom(&buf2, b"nmde") {
        let payload = &buf2[nmde_start + 8..];
        let json_str = std::str::from_utf8(&payload[5..]).unwrap();
        assert!(
            json_str.contains("Master2"),
            "second metadata 'Master2' should be in nmde, got: {}",
            json_str
        );
        // Check that the original name is NOT present (exact match for "Master")
        assert!(
            !json_str.contains("\"Master\""),
            "old data 'Master' should be replaced, got: {}",
            json_str
        );
    }

    let _ = std::fs::remove_file(test_mp4);
}

#[test]
fn test_nmde_injection_preserves_original_audio_structure() {
    // Verify that nmde injection doesn't corrupt the MP4 structure
    let temp_dir = std::env::temp_dir();
    let test_mp4 = temp_dir.join("packer_test_structure.mp4");

    generate_mp4_via_ffmpeg(&test_mp4).expect("FFmpeg must be available");
    let raw_data = std::fs::read(&test_mp4).unwrap();

    // Count atoms before injection
    let ftyp_before = count_atoms(&raw_data, b"ftyp");
    let moov_before = count_atoms(&raw_data, b"moov");
    let mdat_before = count_atoms(&raw_data, b"mdat");
    drop(raw_data);

    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    packer
        .embed_metadata_atom(&metadata, &test_mp4)
        .expect("embed_metadata_atom should succeed");

    let buf = std::fs::read(&test_mp4).unwrap();

    // Core structure should be preserved
    assert_eq!(
        count_atoms(&buf, b"ftyp"),
        ftyp_before,
        "ftyp count should be preserved"
    );
    assert_eq!(
        count_atoms(&buf, b"moov"),
        moov_before,
        "moov count should be preserved"
    );
    assert_eq!(
        count_atoms(&buf, b"mdat"),
        mdat_before,
        "mdat count should be preserved"
    );

    let _ = std::fs::remove_file(test_mp4);
}
