//! Install manifest — structured dependency install commands per platform.
//!
//! The manifest is embedded at compile time from `resources/install_manifest.json`.
//! It maps each dependency to platform-specific package managers and install commands.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Top-level install manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallManifest {
    pub manifest_version: u32,
    pub dependencies: HashMap<String, DependencyEntry>,
}

/// A single dependency with its platform-specific install options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEntry {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub required: bool,
    pub platforms: HashMap<String, PlatformConfig>,
}

/// Platform-specific configuration for a dependency
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfig {
    pub package_managers: Vec<PackageManager>,
}

/// A single package manager's detect and install commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageManager {
    pub id: String,
    pub priority: u32,
    pub detect_command: String,
    pub detect_args: Vec<String>,
    pub install_command: String,
    pub install_args: Vec<String>,
    pub needs_elevation: bool,
}

/// An available installer detected on the current system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableInstaller {
    pub id: String,
    pub name: String,
    pub needs_elevation: bool,
    /// Human-readable install command for copy-to-clipboard
    pub command_display: String,
}

static MANIFEST: OnceLock<InstallManifest> = OnceLock::new();

/// Load the embedded install manifest (parsed once, cached forever)
///
/// NOTE: This file is embedded at compile time via `include_str!()` and does NOT
/// need to be listed in `tauri.conf.json` bundle.resources. It is baked into the
/// binary, not loaded from the runtime resource directory.
pub fn get_manifest() -> &'static InstallManifest {
    MANIFEST.get_or_init(|| {
        let json = include_str!("../../resources/install_manifest.json");
        serde_json::from_str(json).expect("Failed to parse install_manifest.json")
    })
}

/// Get the current platform key matching the manifest (windows/macos/linux)
pub fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "linux"
    }
}

/// Build a human-readable command string from a PackageManager
pub fn command_display(pm: &PackageManager) -> String {
    let mut parts = vec![pm.install_command.clone()];
    parts.extend(pm.install_args.clone());
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_loads() {
        let manifest = get_manifest();
        assert!(manifest.manifest_version >= 1);
        assert!(manifest.dependencies.contains_key("ffmpeg"));
        assert!(manifest.dependencies.contains_key("python"));
        assert!(manifest.dependencies.contains_key("pytorch"));
        assert!(manifest.dependencies.contains_key("demucs"));
    }

    #[test]
    fn test_all_deps_have_platforms() {
        let manifest = get_manifest();
        for (name, dep) in &manifest.dependencies {
            assert!(!dep.platforms.is_empty(), "{name} has no platforms");
            for platform in ["windows", "macos", "linux"] {
                assert!(
                    dep.platforms.contains_key(platform),
                    "{name} missing platform {platform}"
                );
            }
        }
    }
}
