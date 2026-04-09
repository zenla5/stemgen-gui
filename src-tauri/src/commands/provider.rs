//! Tauri commands for cloud inference provider configuration.
//!
//! **Security invariant:** API keys are stored in the OS keychain only.
//! They are NEVER logged, emitted in events, or written to SQLite.

use crate::inference_provider;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tracing::info;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Get the current inference provider configuration (no keys).
#[tauri::command]
pub fn get_inference_provider_config(
    state: tauri::State<'_, AppState>,
) -> Result<inference_provider::InferenceProviderConfig, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    inference_provider::get_config(&conn)
}

/// Set the active inference provider.
#[tauri::command]
pub fn set_inference_provider(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    info!("Setting active inference provider: {}", provider);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut config = inference_provider::get_config(&conn)?;

    config.active_provider = match provider.as_str() {
        "local" => inference_provider::InferenceProvider::Local,
        "fal" => inference_provider::InferenceProvider::Fal,
        "replicate" => inference_provider::InferenceProvider::Replicate,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    inference_provider::save_config(&conn, &config)
}

/// Store an API key in the OS keychain.
///
/// **Security invariant:** The key value is never logged or returned.
#[tauri::command]
pub fn set_provider_api_key(
    provider: String,
    key: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    info!("Setting API key for provider: {}", provider);

    inference_provider::store_api_key(&provider, &key)?;

    // Mark as configured in DB config
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match provider.as_str() {
        "fal" | "replicate" => {}
        _ => return Err(format!("Unknown provider: {}", provider)),
    }
    let config = inference_provider::get_config(&conn)?;
    inference_provider::save_config(&conn, &config)
}

/// Delete a stored API key from the OS keychain.
#[tauri::command]
pub fn clear_provider_api_key(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    info!("Clearing API key for provider: {}", provider);

    inference_provider::delete_api_key(&provider)?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let config = inference_provider::get_config(&conn)?;
    inference_provider::save_config(&conn, &config)
}

// ---------------------------------------------------------------------------
// Provider connection test
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub error: Option<String>,
}

/// Test connectivity to a cloud provider.
///
/// Makes a lightweight HTTP request to validate the stored API key.
/// **Security invariant:** The API key is loaded from keychain and used
/// only in the Authorization header — never logged.
#[tauri::command]
pub async fn test_provider_connection(
    provider: String,
    _state: tauri::State<'_, AppState>,
) -> Result<ConnectionTestResult, String> {
    info!("Testing connection for provider: {}", provider);

    let api_key = match inference_provider::load_api_key(&provider)? {
        Some(key) => key,
        None => {
            return Ok(ConnectionTestResult {
                ok: false,
                error: Some("No API key stored".to_string()),
            })
        }
    };

    let client = reqwest::Client::new();

    let result = match provider.as_str() {
        "fal" => {
            // Lightweight GET to fal.ai — expect non-401 if key is valid
            client
                .get("https://fal.run/fal-ai/demucs")
                .header("Authorization", format!("Key {}", api_key))
                .send()
                .await
        }
        "replicate" => {
            // GET account info from Replicate
            client
                .get("https://api.replicate.com/v1/account")
                .header("Authorization", format!("Token {}", api_key))
                .send()
                .await
        }
        _ => {
            return Err(format!("Unknown provider: {}", provider));
        }
    };

    match result {
        Ok(resp) => {
            let status = resp.status();
            if status == reqwest::StatusCode::UNAUTHORIZED {
                Ok(ConnectionTestResult {
                    ok: false,
                    error: Some("API key rejected".to_string()),
                })
            } else if status.is_success() {
                Ok(ConnectionTestResult {
                    ok: true,
                    error: None,
                })
            } else {
                // Non-401 but non-success — key might still be valid
                Ok(ConnectionTestResult {
                    ok: true,
                    error: None,
                })
            }
        }
        Err(e) => Ok(ConnectionTestResult {
            ok: false,
            error: Some(format!("Network error: {}", e)),
        }),
    }
}
