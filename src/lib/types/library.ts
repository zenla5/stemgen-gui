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

  // --- Separation section additions ---
  /** Human-readable model name, e.g. "HTDemucs Fine-Tuned" */
  model_name?: string;
  /** Model family, e.g. "demucs", "roformer" */
  model_family?: string;
  /** SHA-256 of the model checkpoint file */
  model_sha256?: string;
  /** Wall-clock time the separation job took in seconds */
  separation_duration_secs?: number;
  /** Device used for separation: "cpu" | "cuda" | "mps" */
  device?: string;

  // --- Toolchain additions ---
  /** FFmpeg version, e.g. "7.0" */
  ffmpeg_version?: string;
  /** OS info, e.g. "macOS 15.1" */
  os_info?: string;

  // --- Source file additions ---
  /** File size of the source at separation time in bytes */
  source_size_bytes?: number;
  /** Source format, e.g. "flac", "mp3", "wav" */
  source_format?: string;
  /** Source bit depth, e.g. 16, 24 */
  source_bitdepth?: number;

  // --- Export additions ---
  /** Export codec, e.g. "alac", "aac" */
  export_codec?: string;
  /** DJ preset used, e.g. "traktor", "rekordbox" */
  export_dj_preset?: string;
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
  | { type: 'ParametersChanged' }
  | { type: 'PreferredModelFamily'; current_family: string; preferred: string }
  | { type: 'QualityRankBelowThreshold'; current_rank: number; best_rank: number }
  | { type: 'StemTooOld'; age_days: number; threshold: number };

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

  /** Preferred model family — flag if the stem was not separated with this family */
  prefer_model_family?: string;

  /** Flag if the stem's quality rank is below (best_available - threshold) */
  quality_rank_threshold?: number;

  /** Flag if the stem is older than N days AND a better model exists */
  age_days_threshold?: number;

  /** If true, treat stems with no provenance as staleness candidates */
  flag_unknown_provenance: boolean;
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

/**
 * Format a duration in seconds to a human-readable string.
 * e.g. 94.3 → "1m 34s", 3665 → "1h 1m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0s';
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Format a bit depth value to a human-readable string.
 * e.g. 16 → "16-bit", undefined → "—"
 */
export function formatBitdepth(bits: number | undefined): string {
  if (bits === undefined || bits === null) return '\u2014';
  return `${bits}-bit`;
}

// =============================================================================
// Scanner & Library Index Types
// =============================================================================

/**
 * State of a source file relative to its stem.
 */
export type StemFileState =
  | 'NoStem'
  | 'HasStemCurrent'
  | 'HasStemOutdated'
  | 'HasStemUnknownProvenance'
  | 'OrphanedStem'
  | 'Ignored';

/**
 * A single entry in the library index.
 */
export interface LibraryIndexEntry {
  id: string;
  root_id: string;
  source_path: string;
  source_sha256?: string;
  source_mtime?: number;
  source_inode?: number;
  stem_path?: string;
  status: StemFileState;
  provenance_json?: string;
  ignored: boolean;
  updated_at: string;
}

/**
 * A configured library root.
 */
export interface LibraryRoot {
  id: string;
  path: string;
  output_strategy: 'alongside' | 'mirrored' | 'flat';
  mirrored_path?: string;
  flat_path?: string;
  scan_policy: 'manual' | 'on_open';
  ignored_globs?: string;
  staleness_policy?: string;
  created_at: string;
  last_scanned_at?: string;
}

/**
 * Partial update for a library root.
 */
export interface LibraryRootUpdate {
  output_strategy?: 'alongside' | 'mirrored' | 'flat';
  mirrored_path?: string;
  flat_path?: string;
  scan_policy?: 'manual' | 'on_open';
  ignored_globs?: string;
  staleness_policy?: string;
}

/**
 * Result of a library scan (v2 — per-state counts + entries).
 */
export interface LibraryScanResultV2 {
  root_id: string;
  total_sources: number;
  no_stem_count: number;
  has_stem_current_count: number;
  has_stem_outdated_count: number;
  has_stem_unknown_provenance_count: number;
  orphaned_stem_count: number;
  ignored_count: number;
  entries: LibraryIndexEntry[];
}

// =============================================================================
// Batch Queue Types
// =============================================================================

/**
 * Status of a batch queue item.
 */
export type BatchQueueStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled';

/**
 * A single item in the batch processing queue.
 */
export interface BatchQueueItem {
  id: string;
  root_id: string;
  source_path: string;
  status: BatchQueueStatus;
  model_id: string;
  dj_preset?: string;
  output_format?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  priority: number;
}

/**
 * Summary of batch queue status for a root.
 */
export interface BatchQueueStatusSummary {
  pending_count: number;
  processing_count: number;
  done_count: number;
  error_count: number;
  cancelled_count: number;
  total_count: number;
  next_items: BatchQueueItem[];
}

/**
 * Result of a batch queue operation.
 */
export interface BatchQueueResult {
  queued_count: number;
  total_duration_secs: number;
}

// =============================================================================
// Orphan Management Types
// =============================================================================

/**
 * An orphaned stem entry from the library index.
 */
export interface OrphanedStemEntry {
  id: string;
  stem_path: string;
  last_known_source_path: string;
  file_size?: number;
  last_modified?: string;
}

/**
 * Result of a re-link attempt.
 */
export interface RelinkResult {
  matched: boolean;
  new_status: string;
}

// =============================================================================
// Extended Utility Functions
// =============================================================================

/**
 * Get a human-readable label for a stem file state.
 */
export function stemStateLabel(state: StemFileState): string {
  switch (state) {
    case 'NoStem':
      return 'No Stem';
    case 'HasStemCurrent':
      return 'Current';
    case 'HasStemOutdated':
      return 'Outdated';
    case 'HasStemUnknownProvenance':
      return 'Unknown';
    case 'OrphanedStem':
      return 'Orphaned';
    case 'Ignored':
      return 'Ignored';
    default:
      return state;
  }
}

/**
 * Get a Tailwind color class for a stem file state.
 */
export function stemStateColor(state: StemFileState): string {
  switch (state) {
    case 'NoStem':
      return 'text-gray-500';
    case 'HasStemCurrent':
      return 'text-green-500';
    case 'HasStemOutdated':
      return 'text-yellow-500';
    case 'HasStemUnknownProvenance':
      return 'text-blue-500';
    case 'OrphanedStem':
      return 'text-red-500';
    case 'Ignored':
      return 'text-gray-400';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get a description of the new staleness reason types.
 */
export function getStalenessReasonDescriptionExtended(reason: StalenessReason): string {
  switch (reason.type) {
    case 'SourceModified':
      return 'Source file has been modified';
    case 'NewerModelVersion':
      return `Newer model version available (${reason.current} → ${reason.available})`;
    case 'StemgenGuiOutdated':
      return `stemgen-gui version outdated (${reason.current} < ${reason.minimum})`;
    case 'ParametersChanged':
      return 'Separation parameters differ from current defaults';
    case 'PreferredModelFamily':
      return `Model family "${reason.current_family}" does not match preferred "${reason.preferred}"`;
    case 'QualityRankBelowThreshold':
      return `Quality rank ${reason.current_rank} is below best available ${reason.best_rank}`;
    case 'StemTooOld':
      return `Stem is ${reason.age_days} days old (threshold: ${reason.threshold} days)`;
    default:
      return 'Unknown reason';
  }
}
