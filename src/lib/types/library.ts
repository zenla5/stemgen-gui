/**
 * Stem Library Management Types
 * 
 * TypeScript types for the stem file management system including:
 * - Provenance metadata
 * - Staleness detection
 * - Library scanning
 */

// =============================================================================
// Provenance Types
// =============================================================================

/**
 * Schema version for the provenance structure.
 */
export const PROVENANCE_SCHEMA_VERSION = 1;

/**
 * Stem provenance metadata embedded in .stem.mp4 files.
 */
export interface StemProvenance {
  /** Schema version (always 1 for this structure) */
  schema_version: number;

  /** AI model used for separation (e.g., "bs_roformer", "htdemucs", "htdemucs_ft", "demucs") */
  separation_model: string;

  /** Model version / checkpoint hash (optional) */
  model_version?: string;

  /** stemgen library version used for separation */
  stemgen_version?: string;

  /** stemgen-gui application version that triggered the job */
  stemgen_gui_version: string;

  /** ISO 8601 UTC timestamp when separation was performed */
  separation_timestamp: string;

  /** Original source file path */
  source_path: string;

  /** SHA-256 content hash of the source file at separation time */
  source_content_hash: string;

  /** Duration of source file in seconds */
  source_duration_secs: number;

  /** Sample rate of source file in Hz (e.g., 44100, 48000) */
  source_sample_rate: number;

  /** Quality preset used (e.g., "draft", "standard", "master") */
  separation_quality_preset?: string;

  /** Custom separation parameters */
  separation_params?: Record<string, unknown>;

  /** Unique job identifier (UUID or timestamp-based) */
  job_id: string;

  /** Batch identifier if multiple files were processed together */
  batch_id?: string;

  /** Freeform user notes (editable via GUI) */
  user_notes?: string;

  /** Stem type this file represents (if individual stem) */
  stem_type?: string;
}

// =============================================================================
// Staleness Types
// =============================================================================

/**
 * Reasons why a stem file is considered stale.
 */
export type StalenessReason =
  | { type: 'SourceModified' }
  | { type: 'NewerModelVersion'; current: string; available: string }
  | { type: 'StemgenGuiOutdated'; current: string; minimum: string }
  | { type: 'ParametersChanged' };

/**
 * Overall staleness status.
 */
export type StalenessStatus =
  | { status: 'Current' }
  | { status: 'Stale'; reasons: StalenessReason[] }
  | { status: 'Unknown'; reason: string };

/**
 * Detailed staleness report for a single stem file.
 */
export interface StalenessReport {
  /** Path to the stem file */
  stem_path: string;

  /** Stem file name */
  stem_name: string;

  /** Source file path from provenance */
  source_path?: string;

  /** Overall staleness status */
  status: StalenessStatus;

  /** Detailed reasons (only populated when stale) */
  reasons: StalenessReason[];

  /** Whether the source file exists on disk */
  source_exists: boolean;

  /** Whether the source hash matches */
  source_hash_matches?: boolean;

  /** When the stem was created (from provenance) */
  stem_created_at?: string;

  /** AI model used */
  separation_model?: string;

  /** Model version used */
  model_version?: string;

  /** stemgen-gui version used */
  stemgen_gui_version?: string;
}

/**
 * Known model version information.
 */
export interface ModelVersion {
  /** Model name (e.g., "bs_roformer", "htdemucs") */
  model: string;

  /** Version identifier (e.g., "v1", "latest", checkpoint hash) */
  version: string;

  /** Release date in ISO 8601 format (optional) */
  release_date?: string;

  /** Semantic version string if available (optional) */
  semver?: string;

  /** Whether this is considered the latest stable version */
  is_latest: boolean;
}

/**
 * Staleness detection rules.
 */
export interface StalenessRules {
  /** Check if source file has been modified */
  check_source_modified: boolean;

  /** Check if a newer model version is available */
  check_model_outdated: boolean;

  /** Minimum acceptable stemgen-gui version */
  minimum_stemgen_gui_version?: string;

  /** Check if separation parameters differ from current defaults */
  check_parameters_changed: boolean;

  /** Custom separation params considered "default" */
  default_separation_params?: Record<string, unknown>;
}

// =============================================================================
// Library Scan Types
// =============================================================================

/**
 * Filter options for library scan.
 */
export interface LibraryScanFilter {
  /** Only scan stems created with this model */
  model?: string;

  /** Only scan stems with this DJ preset */
  dj_preset?: string;

  /** Only return stale stems */
  stale_only: boolean;

  /** Only return current stems */
  current_only: boolean;
}

/**
 * Result of a library scan operation.
 */
export interface LibraryScanResult {
  /** Total number of stem files scanned */
  total_scanned: number;

  /** Number of current (up-to-date) stems */
  current_count: number;

  /** Number of stale stems */
  stale_count: number;

  /** Number of stems with unknown staleness */
  unknown_count: number;

  /** Individual staleness reports */
  reports: StalenessReport[];

  /** Errors encountered during scan */
  errors: string[];
}

/**
 * A duplicate stem entry — multiple stem files for the same source.
 */
export interface DuplicateEntry {
  /** Source file hash (grouping key) */
  source_hash: string;

  /** Source file path (from provenance) */
  source_path?: string;

  /** All stem files derived from this source */
  stems: DuplicateStem[];
}

/**
 * Individual duplicate stem information.
 */
export interface DuplicateStem {
  /** Path to the stem file */
  path: string;

  /** Separation model used */
  model?: string;

  /** Model version used */
  model_version?: string;

  /** When the stem was created */
  created_at?: string;

  /** File size in bytes */
  file_size: number;
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * Export format for library reports.
 */
export type ExportFormat = 'Csv' | 'Markdown' | 'Json';

// =============================================================================
// User Notes Types
// =============================================================================

/**
 * User notes stored in sidecar file.
 */
export interface UserNotes {
  /** Path to the stem file */
  stem_path: string;

  /** The notes content */
  notes: string;

  /** When the notes were last updated */
  updated_at: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a staleness status indicates the stem is current.
 */
export function isStemCurrent(status: StalenessStatus): status is { status: 'Current' } {
  return status.status === 'Current';
}

/**
 * Check if a staleness status indicates the stem is stale.
 */
export function isStemStale(status: StalenessStatus): status is { status: 'Stale'; reasons: StalenessReason[] } {
  return status.status === 'Stale';
}

/**
 * Check if a staleness status indicates unknown staleness.
 */
export function isStemUnknown(status: StalenessStatus): status is { status: 'Unknown'; reason: string } {
  return status.status === 'Unknown';
}

/**
 * Get a human-readable description of a staleness reason.
 */
export function getStalenessReasonDescription(reason: StalenessReason): string {
  switch (reason.type) {
    case 'SourceModified':
      return 'Source file has been modified';
    case 'NewerModelVersion':
      return `Newer model version available (${reason.current} → ${reason.available})`;
    case 'StemgenGuiOutdated':
      return `stemgen-gui version outdated (${reason.current} < ${reason.minimum})`;
    case 'ParametersChanged':
      return 'Separation parameters differ from current defaults';
    default:
      return 'Unknown reason';
  }
}

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format a timestamp to a human-readable date string.
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}
