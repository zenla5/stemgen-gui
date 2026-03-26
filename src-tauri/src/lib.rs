//! Stemgen-GUI - Main library
//! 
//! A free and open source (FOSS) stem file generator for DJ software.

pub mod audio;
pub mod commands;
pub mod stems;

use tokio::sync::Mutex as TokioMutex;
use std::sync::Mutex as StdMutex;
use tauri::Manager;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            
            let db_path = app_data_dir.join("stemgen.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("Failed to open database");
            
            // Run migrations
            commands::db::run_migrations(&conn).expect("Failed to run migrations");
            
            // Set up sidecar paths
            let project_dirs = directories::ProjectDirs::from("dev", "stemgen", "stemgen-gui")
                .expect("Failed to get project directories");
            
            let data_dir = project_dirs.data_dir();
            let output_dir = data_dir.join("stems");
            let sidecar_path = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| data_dir.to_path_buf())
                .join("python")
                .join("stemgen_sidecar.py");
            
            // Create directories
            std::fs::create_dir_all(&output_dir).ok();
            
            info!("Output directory: {}", output_dir.display());
            info!("Sidecar path: {}", sidecar_path.display());
            
            // Manage app state first (state must be registered before accessed)
            app.manage(AppState {
                db: StdMutex::new(conn),
                sidecar: TokioMutex::new(None),
                output_dir,
                sidecar_path,
            });
            
            // Initialize the sidecar manager with the app handle for event emission
            let app_handle = app.handle().clone();
            let mut sidecar_guard = app.state::<AppState>().sidecar.blocking_lock();
            let mut sidecar = commands::sidecar::SidecarManager::new(
                app.state::<AppState>().sidecar_path.clone(),
                app.state::<AppState>().output_dir.clone(),
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
            commands::get_processing_history,
            commands::add_to_history,
            commands::get_settings,
            commands::save_settings,
            commands::get_waveform_data,
            commands::pack_stems,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
