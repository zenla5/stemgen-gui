//! Integration tests for DJ software presets.

use stemgen_gui_lib::stems::presets::DJSoftware;
use stemgen_gui_lib::stems::metadata::StemType;

fn stem_order_names(software: DJSoftware) -> Vec<&'static str> {
    software
        .stem_order()
        .iter()
        .map(|s| s.name())
        .collect::<Vec<_>>()
}

#[test]
fn test_traktor_preset_order() {
    let names = stem_order_names(DJSoftware::Traktor);
    assert_eq!(names, vec!["Drums", "Bass", "Other", "Vocals"]);
    assert_eq!(DJSoftware::Traktor.codec(), "alac");
}

#[test]
fn test_rekordbox_preset_order() {
    let names = stem_order_names(DJSoftware::Rekordbox);
    assert_eq!(names, vec!["Drums", "Bass", "Other", "Vocals"]);
    assert_eq!(DJSoftware::Rekordbox.codec(), "aac");
}

#[test]
fn test_serato_preset_order() {
    let names = stem_order_names(DJSoftware::Serato);
    // Serato uses vocals-first ordering
    assert_eq!(names, vec!["Vocals", "Drums", "Bass", "Other"]);
    assert_eq!(DJSoftware::Serato.codec(), "aac");
}

#[test]
fn test_mixxx_preset_order() {
    let names = stem_order_names(DJSoftware::Mixxx);
    assert_eq!(names, vec!["Drums", "Bass", "Other", "Vocals"]);
    assert_eq!(DJSoftware::Mixxx.codec(), "alac");
}

#[test]
fn test_djay_preset_order() {
    let names = stem_order_names(DJSoftware::Djay);
    assert_eq!(names, vec!["Drums", "Bass", "Other", "Vocals"]);
    assert_eq!(DJSoftware::Djay.codec(), "aac");
}

#[test]
fn test_virtualdj_preset_order() {
    let names = stem_order_names(DJSoftware::VirtualDJ);
    // VirtualDJ uses vocals-first ordering
    assert_eq!(names, vec!["Vocals", "Drums", "Bass", "Other"]);
    assert_eq!(DJSoftware::VirtualDJ.codec(), "aac");
}

#[test]
fn test_all_presets_have_four_stems() {
    let all_presets = vec![
        DJSoftware::Traktor,
        DJSoftware::Rekordbox,
        DJSoftware::Serato,
        DJSoftware::Mixxx,
        DJSoftware::Djay,
        DJSoftware::VirtualDJ,
    ];
    
    for software in all_presets {
        let order = software.stem_order();
        assert_eq!(
            order.len(),
            4,
            "preset {:?} must have exactly 4 stems",
            software
        );
    }
}

#[test]
fn test_djsoftware_display_names() {
    assert_eq!(DJSoftware::Traktor.display_name(), "Traktor Pro");
    assert_eq!(DJSoftware::Rekordbox.display_name(), "Rekordbox");
    assert_eq!(DJSoftware::Serato.display_name(), "Serato DJ");
    assert_eq!(DJSoftware::Mixxx.display_name(), "Mixxx");
    assert_eq!(DJSoftware::Djay.display_name(), "djay");
    assert_eq!(DJSoftware::VirtualDJ.display_name(), "VirtualDJ");
}

#[test]
fn test_djsoftware_from_str() {
    assert_eq!(DJSoftware::from_str("traktor"), Some(DJSoftware::Traktor));
    assert_eq!(DJSoftware::from_str("rekordbox"), Some(DJSoftware::Rekordbox));
    assert_eq!(DJSoftware::from_str("serato"), Some(DJSoftware::Serato));
    assert_eq!(DJSoftware::from_str("mixxx"), Some(DJSoftware::Mixxx));
    assert_eq!(DJSoftware::from_str("djay"), Some(DJSoftware::Djay));
    assert_eq!(DJSoftware::from_str("virtualdj"), Some(DJSoftware::VirtualDJ));
    assert_eq!(DJSoftware::from_str("TRASKTRO"), None); // Invalid
    assert_eq!(DJSoftware::from_str("unknown"), None);
}

#[test]
fn test_djsoftware_file_extension() {
    for software in [
        DJSoftware::Traktor,
        DJSoftware::Rekordbox,
        DJSoftware::Serato,
        DJSoftware::Mixxx,
        DJSoftware::Djay,
        DJSoftware::VirtualDJ,
    ] {
        assert_eq!(software.file_extension(), ".m4a");
    }
}

#[test]
fn test_metadata_json_roundtrip_presets() {
    use stemgen_gui_lib::stems::metadata::NIStemMetadata;
    
    let metadata = NIStemMetadata::default();
    let json_bytes = metadata.to_json_bytes().expect("must serialize");
    let deserialized: NIStemMetadata = NIStemMetadata::from_json_bytes(&json_bytes)
        .expect("must deserialize");
    
    assert_eq!(deserialized.stems.len(), 4);
    assert_eq!(deserialized.stems[0].name, "Drums");
}
