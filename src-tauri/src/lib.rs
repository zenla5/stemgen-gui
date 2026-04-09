//! Stemgen-GUI - Main library
//!
//! A free and open source (FOSS) stem file generator for DJ software.

pub mod audio;
pub mod commands;
pub mod inference_provider;
pub mod stems;

use std::sync::Mutex as StdMutex;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex as TokioMutex;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Compute SHA-256 hash of a file, returned as a lowercase hex string.
fn compute_file_sha256(path: &std::path::Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let data = std::fs::read(path)?;
    let hash = Sha256::digest(&data);
    Ok(format!("{:x}", hash))
}

/// Application state shared across commands
pub struct AppState {
    /// SQLite database connection
    pub db: StdMutex<rusqlite::Connection>,
    /// Sidecar manager for Python process handling
    pub sidecar: TokioMutex<Option<commands::sidecar::SidecarManager>>,
    /// Default output directory for stems
    pub output_dir: std::path::PathBuf,
    /// Sidecar script path
    pub sidecar_path: std::path::PathBuf,
    /// Set of root IDs with active batch processors
    pub batch_processors: TokioMutex<std::collections::HashSet<String>>,
}

pub fn run() {
    // Initialize logging
    let log_dir = directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("stemgen-gui"));

    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "stemgen-gui.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .init();

    info!("Starting Stemgen GUI v{}", env!("CARGO_PKG_VERSION"));

    // Set up panic hook for better error reporting
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        tracing::error!("PANIC at {}: {}", location, msg);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            info!("Setting up application");

            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("stemgen.db");
            let conn = rusqlite::Connection::open(&db_path).expect("Failed to open database");

            // Run migrations
            commands::db::run_migrations(&conn).expect("Failed to run migrations");

            // Set up sidecar paths
            let project_dirs = directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
                .expect("Failed to get project directories");

            let data_dir = project_dirs.data_dir();
            let output_dir = data_dir.join("stems");
            let sidecar_path = data_dir.join("stemgen_sidecar.py");

            // Create directories
            std::fs::create_dir_all(&output_dir).ok();
            std::fs::create_dir_all(data_dir).ok();

            // Deploy sidecar script from resource bundle to data dir
            {
                let version = env!("CARGO_PKG_VERSION");
                let mut deploy_success = false;
                let mut deploy_error: Option<String> = None;

                if let Ok(resource_dir) = app.path().resource_dir() {
                    let mut resource_sidecar = resource_dir.join("stemgen_sidecar.py");
                    if !resource_sidecar.exists() {
                        // Dev mode fallback: Tauri preserves directory structure as _up_/python/
                        let fallback = resource_dir
                            .join("_up_")
                            .join("python")
                            .join("stemgen_sidecar.py");
                        if fallback.exists() {
                            resource_sidecar = fallback;
                        }
                    }
                    if resource_sidecar.exists() {
                        // Hash-based staleness detection (replaces unreliable mtime)
                        let should_copy = if !sidecar_path.exists() {
                            true
                        } else {
                            match (
                                compute_file_sha256(&resource_sidecar),
                                compute_file_sha256(&sidecar_path),
                            ) {
                                (Ok(src_hash), Ok(dst_hash)) => src_hash != dst_hash,
                                _ => true, // If hash fails, re-copy to be safe
                            }
                        };
                        if should_copy {
                            info!(
                                "Deploying sidecar script: {} -> {}",
                                resource_sidecar.display(),
                                sidecar_path.display()
                            );
                            match std::fs::copy(&resource_sidecar, &sidecar_path) {
                                Ok(_) => {
                                    // SHA-256 integrity verification after copy
                                    match (
                                        compute_file_sha256(&resource_sidecar),
                                        compute_file_sha256(&sidecar_path),
                                    ) {
                                        (Ok(src_hash), Ok(dst_hash)) if src_hash == dst_hash => {
                                            deploy_success = true;
                                        }
                                        (Ok(src_hash), Ok(dst_hash)) => {
                                            let msg = format!(
                                                "Sidecar integrity check FAILED after copy: \
                                                 source hash {} != destination hash {}. \
                                                 Deleting corrupted file. Please reinstall \
                                                 Stemgen GUI v{}. If the problem persists, \
                                                 please report it at \
                                                 https://github.com/zenla5/stemgen-gui/issues.",
                                                src_hash, dst_hash, version,
                                            );
                                            error!("{}", msg);
                                            let _ = std::fs::remove_file(&sidecar_path);
                                            deploy_error = Some(msg);
                                        }
                                        _ => {
                                            warn!(
                                                "Could not compute hashes for integrity check, \
                                                 assuming copy succeeded"
                                            );
                                            deploy_success = true;
                                        }
                                    }
                                }
                                Err(e) => {
                                    let msg = format!(
                                        "Sidecar script (stemgen_sidecar.py) could not be copied \
                                         from {} to {}: {}. Please reinstall Stemgen GUI v{} \
                                         and try again. If the problem persists, please report \
                                         it at https://github.com/zenla5/stemgen-gui/issues.",
                                        resource_sidecar.display(),
                                        sidecar_path.display(),
                                        e,
                                        version,
                                    );
                                    error!("{}", msg);
                                    deploy_error = Some(msg);
                                }
                            }
                        } else {
                            // Already up to date (hashes match)
                            deploy_success = true;
                        }
                    } else {
                        let searched = resource_dir.display().to_string();
                        let msg = format!(
                            "Sidecar script (stemgen_sidecar.py) was not found in the \
                             application resources directory ({}). Please reinstall Stemgen \
                             GUI v{} and try again. If the problem persists, please report \
                             it at https://github.com/zenla5/stemgen-gui/issues.",
                            searched, version,
                        );
                        error!("{}", msg);
                        deploy_error = Some(msg);
                    }
                } else {
                    let msg = format!(
                        "Failed to get the application resource directory. Please reinstall \
                         Stemgen GUI v{} and try again. If the problem persists, please report \
                         it at https://github.com/zenla5/stemgen-gui/issues.",
                        version,
                    );
                    error!("{}", msg);
                    deploy_error = Some(msg);
                }

                // Emit event so frontend can react
                let payload = serde_json::json!({
                    "success": deploy_success,
                    "path": sidecar_path.to_string_lossy(),
                    "error": deploy_error,
                });
                let _ = app.emit("sidecar-deployed", payload.clone());

                // Emit a distinct error event so the frontend can show a banner immediately
                if !deploy_success {
                    let _ = app.emit("sidecar-deploy-error", payload);
                }
            }

            info!("Output directory: {}", output_dir.display());
            info!("Sidecar path: {}", sidecar_path.display());

            // Manage app state first (state must be registered before accessed)
            app.manage(AppState {
                db: StdMutex::new(conn),
                sidecar: TokioMutex::new(None),
                output_dir,
                sidecar_path,
                batch_processors: TokioMutex::new(std::collections::HashSet::new()),
            });

            // Initialize the sidecar manager with the app handle for event emission
            let app_handle = app.handle().clone();
            let app_state = app.state::<AppState>();
            let mut sidecar_guard = app_state.sidecar.blocking_lock();
            let mut sidecar = commands::sidecar::SidecarManager::new(
                app_state.sidecar_path.clone(),
                app_state.output_dir.clone(),
            );
            sidecar.set_app_handle(app_handle);
            *sidecar_guard = Some(sidecar);

            info!("Application setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_dependencies,
            commands::check_python_deps,
            commands::get_audio_info,
            commands::start_separation,
            commands::cancel_separation,
            commands::get_models,
            commands::download_model,
            commands::delete_model,
            commands::cancel_download,
            commands::get_processing_history,
            commands::add_to_history,
            commands::get_settings,
            commands::save_settings,
            commands::get_waveform_data,
            commands::pack_stems,
            // Library management (v1.1.0)
            commands::scan_library,
            commands::find_duplicate_stems,
            commands::export_library_report,
            commands::get_staleness_rules,
            commands::save_staleness_rules,
            commands::save_user_notes,
            commands::verify_stem_integrity,
            commands::read_stem_provenance,
            commands::read_stem_notes,
            // Metadata
            commands::read_audio_metadata,
            commands::read_stem_metadata,
            // Provenance-aware separation
            commands::pack_stems_with_provenance,
            commands::export_stem,
            commands::batch_export_stems,
            // Audit trail
            commands::log_separation_job,
            commands::get_separation_log,
            commands::get_library_stats,
            // Library root management
            commands::library_roots::add_library_root,
            commands::library_roots::list_library_roots,
            commands::library_roots::get_library_root,
            commands::library_roots::update_library_root,
            commands::library_roots::delete_library_root,
            // Library scanner
            commands::scanner::scan_library_root,
            // Orphan management
            commands::library::get_library_orphans,
            commands::library::re_link_orphan,
            commands::library::delete_orphan_stem,
            commands::library::ignore_orphan_stem,
            // Batch queue
            commands::batch::queue_batch_generate,
            commands::batch::queue_batch_regenerate,
            commands::batch::get_batch_queue_status,
            commands::batch::pause_batch_queue,
            commands::batch::resume_batch_queue,
            commands::batch::cancel_batch_queue,
            commands::batch::clear_completed_queue,
            commands::batch::start_batch_processor,
            // Environment validation
            commands::validate_environment,
            commands::get_sidecar_status,
            commands::deploy_sidecar,
            // Dependency installation
            commands::install_executor::get_install_manifest,
            commands::install_executor::get_available_installers,
            commands::install_executor::install_dependency,
            commands::install_executor::cancel_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
