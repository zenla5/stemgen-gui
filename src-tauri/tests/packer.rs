//! Integration tests for NI Stem packer (atom injection).

use std::io::Write;
use stemgen_gui_lib::stems::metadata::{MasterData, NIStemMetadata, StemData};
use stemgen_gui_lib::stems::presets::{DJSoftware, ExportSettings, OutputFormat};
use stemgen_gui_lib::stems::StemPacker;

/// Build a minimal valid MP4 file in memory (ftyp + mdat + moov boxes).
fn make_minimal_mp4() -> Vec<u8> {
    // ftyp box (8 + 12 = 20 bytes)
    let mut ftyp = Vec::new();
    ftyp.write_all(&u32::to_be_bytes(20)).unwrap(); // size = 20
    ftyp.write_all(b"ftyp").unwrap();
    ftyp.write_all(b"isom").unwrap(); // major brand
    ftyp.write_all(&u32::to_be_bytes(512)).unwrap(); // minor version
    ftyp.write_all(b"isomiso2mp41").unwrap(); // compatible brands

    // mdat box (8 bytes, empty audio placeholder)
    let mut mdat = Vec::new();
    mdat.write_all(&u32::to_be_bytes(8)).unwrap(); // size = 8
    mdat.write_all(b"mdat").unwrap();

    // moov box (8 + 0 = 8 bytes — empty, will receive udta in tests)
    let mut moov = Vec::new();
    moov.write_all(&u32::to_be_bytes(8)).unwrap(); // size = 8
    moov.write_all(b"moov").unwrap();

    let mut mp4 = Vec::new();
    mp4.extend_from_slice(&ftyp);
    mp4.extend_from_slice(&mdat);
    mp4.extend_from_slice(&moov);
    mp4
}

/// Build an MP4 with a moov box that already contains an empty udta child.
fn make_mp4_with_udta() -> Vec<u8> {
    let mut ftyp = Vec::new();
    ftyp.write_all(&u32::to_be_bytes(20)).unwrap();
    ftyp.write_all(b"ftyp").unwrap();
    ftyp.write_all(b"isom").unwrap();
    ftyp.write_all(&u32::to_be_bytes(512)).unwrap();
    ftyp.write_all(b"isomiso2mp41").unwrap();

    let mut mdat = Vec::new();
    mdat.write_all(&u32::to_be_bytes(8)).unwrap();
    mdat.write_all(b"mdat").unwrap();

    // moov with udta child
    let mut udta = Vec::new();
    udta.write_all(&u32::to_be_bytes(8)).unwrap(); // udta size = 8 (empty)
    udta.write_all(b"udta").unwrap();

    let mut moov = Vec::new();
    moov.write_all(&u32::to_be_bytes(16)).unwrap(); // moov size = 16
    moov.write_all(b"moov").unwrap();
    moov.extend_from_slice(&udta);

    let mut mp4 = Vec::new();
    mp4.extend_from_slice(&ftyp);
    mp4.extend_from_slice(&mdat);
    mp4.extend_from_slice(&moov);
    mp4
}

/// Build an MP4 with moov containing udta that already has an nmde child.
fn make_mp4_with_nmde() -> Vec<u8> {
    let mut ftyp = Vec::new();
    ftyp.write_all(&u32::to_be_bytes(20)).unwrap();
    ftyp.write_all(b"ftyp").unwrap();
    ftyp.write_all(b"isom").unwrap();
    ftyp.write_all(&u32::to_be_bytes(512)).unwrap();
    ftyp.write_all(b"isomiso2mp41").unwrap();

    let mut mdat = Vec::new();
    mdat.write_all(&u32::to_be_bytes(8)).unwrap();
    mdat.write_all(b"mdat").unwrap();

    // nmde atom: size = 8 + 5 + 4 = 17 bytes ("stem" + null + "test")
    let nmde_payload_len = 5 + 4; // "stem" + null + "test"
    let nmde_total = 8 + nmde_payload_len;
    let mut nmde = Vec::new();
    nmde.write_all(&u32::to_be_bytes(nmde_total as u32))
        .unwrap();
    nmde.write_all(b"nmde").unwrap();
    nmde.write_all(b"stem").unwrap();
    nmde.write_all(&[0u8]).unwrap();
    nmde.write_all(b"test").unwrap();

    // udta box wrapping nmde
    let mut udta = Vec::new();
    udta.write_all(&u32::to_be_bytes((8 + nmde.len()) as u32))
        .unwrap();
    udta.write_all(b"udta").unwrap();
    udta.extend_from_slice(&nmde);

    let mut moov = Vec::new();
    moov.write_all(&u32::to_be_bytes((8 + udta.len()) as u32))
        .unwrap();
    moov.write_all(b"moov").unwrap();
    moov.extend_from_slice(&udta);

    let mut mp4 = Vec::new();
    mp4.extend_from_slice(&ftyp);
    mp4.extend_from_slice(&mdat);
    mp4.extend_from_slice(&moov);
    mp4
}

/// Check that a buffer contains the given fourcc atom at the expected position.
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
    assert_eq!(packer.settings.dj_software, DJSoftware::Traktor);
}

#[test]
fn test_nmde_atom_injected_into_empty_moov() {
    let mut mp4 = make_mp4_with_udta();
    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    // Manually call the internal atom-injection logic via pack()
    // by writing to a temp file first — we test the buffer logic directly.
    let json = serde_json::to_string(&metadata).unwrap();

    // Use a temp file for embed_metadata_atom
    let dir = std::env::temp_dir();
    let mp4_path = dir.join("test_stem_nmde_empty_moov.mp4");
    std::fs::write(&mp4_path, &mp4).unwrap();

    let result = packer.embed_metadata_atom(&metadata, &mp4_path);
    assert!(
        result.is_ok(),
        "embed_metadata_atom should succeed: {:?}",
        result
    );

    let buf = std::fs::read(&mp4_path).unwrap();

    // Verify nmde atom exists
    let (nmde_start, nmde_end) =
        find_atom(&buf, b"nmde").expect("nmde atom must be present after injection");
    assert!(nmde_end > nmde_start + 8);

    // Verify "stem" marker is in nmde payload
    let payload = &buf[nmde_start + 8..];
    assert!(
        payload.starts_with(b"stem"),
        "nmde payload should start with 'stem' marker"
    );

    // Verify JSON follows
    assert!(
        payload[5..].starts_with(b"{\"version\""),
        "nmde should contain JSON"
    );

    // Verify udta wraps nmde
    let (udta_start, udta_end) = find_atom(&buf, b"udta").expect("udta atom must be present");
    assert!(
        nmde_start >= udta_start && nmde_end <= udta_end,
        "nmde should be inside udta"
    );

    let _ = std::fs::remove_file(mp4_path);
}

#[test]
fn test_nmde_replaces_existing_nmde_in_udta() {
    let mut mp4 = make_mp4_with_nmde();
    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    let dir = std::env::temp_dir();
    let mp4_path = dir.join("test_stem_nmde_replace.mp4");
    std::fs::write(&mp4_path, &mp4).unwrap();

    let result = packer.embed_metadata_atom(&metadata, &mp4_path);
    assert!(result.is_ok());

    let buf = std::fs::read(&mp4_path).unwrap();

    // Should still have exactly one nmde
    let nmde_positions: Vec<_> = {
        let mut positions = Vec::new();
        let mut offset = 0;
        while offset + 8 <= buf.len() {
            let size = u32::from_be_bytes([
                buf[offset],
                buf[offset + 1],
                buf[offset + 2],
                buf[offset + 3],
            ]) as usize;
            let fcc = &buf[offset + 4..offset + 8];
            if fcc == b"nmde" {
                positions.push(offset);
            }
            if size < 8 {
                break;
            }
            offset += size;
        }
        positions
    };
    assert_eq!(
        nmde_positions.len(),
        1,
        "should have exactly one nmde atom after replacement"
    );

    // nmde should contain updated JSON (has new version)
    let (nmde_start, nmde_end) = find_atom(&buf, b"nmde").unwrap();
    let payload = &buf[nmde_start + 8..];
    let json_str = std::str::from_utf8(&payload[5..]).unwrap();
    assert!(
        json_str.contains("version"),
        "updated nmde should contain JSON"
    );
    assert!(
        !json_str.contains("test"),
        "old data 'test' should be replaced by JSON"
    );

    let _ = std::fs::remove_file(mp4_path);
}

#[test]
fn test_metadata_sidecar_written_when_no_moov() {
    let mut ftyp = Vec::new();
    ftyp.write_all(&u32::to_be_bytes(20)).unwrap();
    ftyp.write_all(b"ftyp").unwrap();
    ftyp.write_all(b"isom").unwrap();
    ftyp.write_all(&u32::to_be_bytes(512)).unwrap();
    ftyp.write_all(b"isomiso2mp41").unwrap();

    // No moov box — only ftyp
    let mp4_only_ftyp = ftyp;

    let metadata = make_test_metadata();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    let dir = std::env::temp_dir();
    let mp4_path = dir.join("test_stem_no_moov.mp4");
    let sidecar_path = mp4_path.with_extension("stem.metadata");
    std::fs::write(&mp4_path, &mp4_only_ftyp).unwrap();
    let _ = std::fs::remove_file(&sidecar_path); // clean up if exists

    let result = packer.embed_metadata_atom(&metadata, &mp4_path);
    assert!(result.is_ok());

    // Should have written sidecar JSON
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
fn test_nmde_atom_roundtrip_survives_multiple_injections() {
    let mut mp4 = make_mp4_with_udta();
    let settings = make_test_settings();
    let packer = StemPacker::new(settings);

    let dir = std::env::temp_dir();
    let mp4_path = dir.join("test_stem_roundtrip.mp4");
    std::fs::write(&mp4_path, &mp4).unwrap();

    // First injection
    let metadata1 = make_test_metadata();
    packer.embed_metadata_atom(&metadata1, &mp4_path).unwrap();
    let buf1 = std::fs::read(&mp4_path).unwrap();
    assert!(
        find_atom(&buf1, b"nmde").is_some(),
        "nmde should exist after first injection"
    );

    // Second injection (should replace the first)
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
    packer.embed_metadata_atom(&metadata2, &mp4_path).unwrap();
    let buf2 = std::fs::read(&mp4_path).unwrap();

    // Should still have exactly one nmde
    let nmde_count = {
        let mut count = 0;
        let mut offset = 0;
        while offset + 8 <= buf2.len() {
            let size = u32::from_be_bytes([
                buf2[offset],
                buf2[offset + 1],
                buf2[offset + 2],
                buf2[offset + 3],
            ]) as usize;
            if &buf2[offset + 4..offset + 8] == b"nmde" {
                count += 1;
            }
            if size < 8 {
                break;
            }
            offset += size;
        }
        count
    };
    assert_eq!(
        nmde_count, 1,
        "exactly one nmde atom after second injection"
    );

    // JSON should be the second one
    let (nmde_start, _) = find_atom(&buf2, b"nmde").unwrap();
    let payload = &buf2[nmde_start + 8..];
    assert!(
        payload[5..].contains("Master2"),
        "second metadata should be in nmde after replacement"
    );

    let _ = std::fs::remove_file(mp4_path);
}
