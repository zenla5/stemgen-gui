use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    info!("Running database migrations");
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_history (
            id TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            output_path TEXT NOT NULL,
            model TEXT NOT NULL,
            dj_preset TEXT NOT NULL,
            processed_at TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            file_size INTEGER NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS export_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            output_format TEXT NOT NULL,
            quality_preset TEXT NOT NULL,
            dj_preset TEXT NOT NULL,
            individual_stem_export INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    
    info!("Database migrations complete");
    Ok(())
}
