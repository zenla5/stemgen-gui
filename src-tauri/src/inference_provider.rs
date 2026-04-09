//! Inference provider configuration and persistence.
//!
//! Manages the user's choice between local and cloud inference providers
//! (fal.ai, Replicate) and persists the configuration to the SQLite
//! settings table as a JSON blob.
//!
//! **Security invariant:** API keys are NEVER stored here. They live only
//! in the OS keychain via the `keyring` crate.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum InferenceProvider {
    #[default]
    Local,
    Fal,
    Replicate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceProviderConfig {
    pub active_provider: InferenceProvider,
    pub replicate_version_hash: Option<String>,
    pub batch_parallel: bool,
    pub cloud_duration_warn_minutes: Option<u32>,
    pub cloud_duration_hard_cap_minutes: Option<u32>,
    pub privacy_notice_shown: bool,
}

impl Default for InferenceProviderConfig {
    fn default() -> Self {
        Self {
            active_provider: InferenceProvider::Local,
            replicate_version_hash: None,
            batch_parallel: false,
            cloud_duration_warn_minutes: Some(15),
            cloud_duration_hard_cap_minutes: None,
            privacy_notice_shown: false,
        }
    }
}

const SETTINGS_KEY: &str = "inference_provider_config";
const KEYRING_SERVICE: &str = "stemgen-gui";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/// Load the inference provider config from the settings table.
///
/// Returns defaults if the row does not yet exist.
pub fn get_config(conn: &Connection) -> Result<InferenceProviderConfig, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![SETTINGS_KEY]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        serde_json::from_str(&value).map_err(|e| e.to_string())
    } else {
        Ok(InferenceProviderConfig::default())
    }
}

/// Persist the inference provider config to the settings table.
pub fn save_config(conn: &Connection, config: &InferenceProviderConfig) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![SETTINGS_KEY, json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Keychain helpers (API keys stored in OS keychain, NEVER in SQLite/logs)
// ---------------------------------------------------------------------------

/// Store an API key in the OS keychain.
///
/// **Security invariant:** The key is stored ONLY in the keychain. It must
/// never be written to SQLite, log output, or Tauri event payloads.
pub fn store_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, provider).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

/// Load an API key from the OS keychain.
///
/// Returns `Ok(None)` if no key is stored (not an error).
///
/// **Security invariant:** Callers must never log or emit the returned key.
pub fn load_api_key(provider: &str) -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete a stored API key from the OS keychain.
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, provider).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already absent
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn default_config_serializes_and_deserializes() {
        let config = InferenceProviderConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let restored: InferenceProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.active_provider, InferenceProvider::Local);
        assert_eq!(restored.batch_parallel, false);
        assert_eq!(restored.cloud_duration_warn_minutes, Some(15));
        assert_eq!(restored.privacy_notice_shown, false);
    }

    #[test]
    fn get_config_returns_defaults_when_no_row() {
        let conn = test_conn();
        let config = get_config(&conn).unwrap();
        assert_eq!(config.active_provider, InferenceProvider::Local);
    }

    #[test]
    fn save_and_get_roundtrip() {
        let conn = test_conn();
        let mut config = InferenceProviderConfig::default();
        config.active_provider = InferenceProvider::Fal;
        config.replicate_version_hash = Some("abc123".into());
        config.batch_parallel = true;
        config.privacy_notice_shown = true;

        save_config(&conn, &config).unwrap();
        let loaded = get_config(&conn).unwrap();

        assert_eq!(loaded.active_provider, InferenceProvider::Fal);
        assert_eq!(loaded.replicate_version_hash, Some("abc123".into()));
        assert!(loaded.batch_parallel);
        assert!(loaded.privacy_notice_shown);
    }

    #[test]
    fn save_overwrites_previous_config() {
        let conn = test_conn();

        let config1 = InferenceProviderConfig {
            active_provider: InferenceProvider::Fal,
            ..Default::default()
        };
        save_config(&conn, &config1).unwrap();

        let config2 = InferenceProviderConfig {
            active_provider: InferenceProvider::Replicate,
            replicate_version_hash: Some("v2".into()),
            ..Default::default()
        };
        save_config(&conn, &config2).unwrap();

        let loaded = get_config(&conn).unwrap();
        assert_eq!(loaded.active_provider, InferenceProvider::Replicate);
        assert_eq!(loaded.replicate_version_hash, Some("v2".into()));
    }

    #[test]
    fn provider_enum_serializes_as_lowercase() {
        assert_eq!(serde_json::to_string(&InferenceProvider::Local).unwrap(), "\"local\"");
        assert_eq!(serde_json::to_string(&InferenceProvider::Fal).unwrap(), "\"fal\"");
        assert_eq!(
            serde_json::to_string(&InferenceProvider::Replicate).unwrap(),
            "\"replicate\""
        );
    }

    #[test]
    fn keychain_store_load_delete_roundtrip() {
        let provider = "fal_test";
        let key = "test-key-12345";

        // Clean up any leftover from previous failed runs
        let _ = delete_api_key(provider);

        // Store
        store_api_key(provider, key).unwrap();

        // Load
        let loaded = load_api_key(provider).unwrap();
        assert_eq!(loaded, Some(key.to_string()));

        // Delete
        delete_api_key(provider).unwrap();

        // Load after delete → None
        let after_delete = load_api_key(provider).unwrap();
        assert_eq!(after_delete, None);
    }

    #[test]
    fn keychain_load_returns_none_for_missing_entry() {
        let result = load_api_key("nonexistent_provider_xyz").unwrap();
        assert_eq!(result, None);
    }
}
