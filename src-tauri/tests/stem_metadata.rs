//! Integration tests for NI Stem metadata structures.

use stemgen_gui_lib::stems::metadata::{NIStemMetadata, StemData, MasterData, StemType};

#[test]
fn test_metadata_default_produces_valid_json() {
    let metadata = NIStemMetadata::default();
    
    // Should serialize to valid JSON
    let json_bytes = metadata.to_json_bytes().expect("metadata must be JSON serializable");
    assert!(!json_bytes.is_empty());
    
    // Should deserialize back
    let deserialized: NIStemMetadata = NIStemMetadata::from_json_bytes(&json_bytes)
        .expect("metadata must be JSON deserializable");
    assert_eq!(deserialized.version, metadata.version);
}

#[test]
fn test_metadata_contains_all_four_stems() {
    let metadata = NIStemMetadata::default();
    
    assert_eq!(metadata.stems.len(), 4);
    assert!(metadata.stems.iter().any(|s| s.name == "Drums"));
    assert!(metadata.stems.iter().any(|s| s.name == "Bass"));
    assert!(metadata.stems.iter().any(|s| s.name == "Other"));
    assert!(metadata.stems.iter().any(|s| s.name == "Vocals"));
}

#[test]
fn test_stem_colors_are_ni_compatible() {
    let metadata = NIStemMetadata::default();
    
    for stem in &metadata.stems {
        assert!(
            stem.color.starts_with('#'),
            "stem {} color must be a hex color string",
            stem.name
        );
        assert_eq!(
            stem.color.len(),
            7,
            "stem {} color must be 7-char hex (e.g. #RRGGBB)",
            stem.name
        );
    }
    
    // Verify exact NI colors
    let color_map: std::collections::HashMap<_, _> = metadata
        .stems
        .iter()
        .map(|s| (s.name.as_str(), s.color.as_str()))
        .collect();
    
    assert_eq!(color_map.get("Drums"), Some(&"#FF6B6B"));
    assert_eq!(color_map.get("Bass"), Some(&"#4ECDC4"));
    assert_eq!(color_map.get("Other"), Some(&"#FFE66D"));
    assert_eq!(color_map.get("Vocals"), Some(&"#95E1D3"));
}

#[test]
fn test_master_track_exists() {
    let metadata = NIStemMetadata::default();
    assert_eq!(metadata.master.name, "Master");
}

#[test]
fn test_metadata_new_with_custom_stems() {
    let stems = vec![
        StemData {
            name: "Drums".to_string(),
            color: StemType::Drums.color_hex(),
            file_path: "drums.m4a".to_string(),
        },
    ];
    
    let master = MasterData {
        name: "Master".to_string(),
        file_path: "master.m4a".to_string(),
    };
    
    let metadata = NIStemMetadata::new(stems, master);
    
    assert_eq!(metadata.stems.len(), 1);
    assert_eq!(metadata.stems[0].name, "Drums");
    assert_eq!(metadata.master.name, "Master");
}

#[test]
fn test_stem_type_color_methods() {
    assert_eq!(StemType::Drums.color_hex(), "#FF6B6B");
    assert_eq!(StemType::Bass.color_hex(), "#4ECDC4");
    assert_eq!(StemType::Other.color_hex(), "#FFE66D");
    assert_eq!(StemType::Vocals.color_hex(), "#95E1D3");
    
    let (r, g, b) = StemType::Drums.color_rgb();
    assert_eq!((r, g, b), (0xFF, 0x6B, 0x6B));
}

#[test]
fn test_metadata_application_info() {
    let metadata = NIStemMetadata::default();
    assert_eq!(metadata.application.name, "Stemgen-GUI");
}
