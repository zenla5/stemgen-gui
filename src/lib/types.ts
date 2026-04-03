// Types for Stemgen-GUI

// Audio types
export interface AudioFileMetadata {
  path: string;
  name: string;
  size: number;
  duration: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  format: string;
  metadata: Record<string, string>;
  cover_art_path?: string;
}

export interface AudioInfo {
  path: string;
  name: string;
  size: number;
  duration: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  format: string;
  metadata: Record<string, string>;
  cover_art_path?: string;
}

export interface WaveformPoint {
  min: number;
  max: number;
  rms: number;
}

export interface WaveformData {
  points: WaveformPoint[];
  sample_rate: number;
  duration_secs: number;
}

// Stem types
export type StemType = 'drums' | 'bass' | 'other' | 'vocals';

export const STEM_DEFAULT_NAMES: Record<StemType, string> = {
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other',
  vocals: 'Vocals',
};

export const STEM_COLORS: Record<StemType, string> = {
  drums: '#FF6B6B',
  bass: '#4ECDC4',
  other: '#FFE66D',
  vocals: '#95E1D3',
};

export interface Stem {
  id: string;
  type: StemType;
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  file_path?: string;
}

export interface NIStemMetadata {
  version: string;
  application: {
    name: string;
    version: string;
    build: string;
  };
  stems: StemData[];
  master: MasterData;
  track?: TrackInfo;
}

export interface StemData {
  name: string;
  color: string;
  file_path: string;
}

export interface MasterData {
  name: string;
  file_path: string;
}

export interface TrackInfo {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  cover_art?: string;
}

// DJ Software presets
export type DJSoftware = 'traktor' | 'rekordbox' | 'serato' | 'mixxx' | 'djay' | 'virtualdj';

export interface DJSoftwareInfo {
  id: DJSoftware;
  name: string;
  codec: string;
  stem_order: StemType[];
}

// AI Models
export type AIModel = 'bs_roformer' | 'htdemucs' | 'htdemucs_ft' | 'demucs';

export interface ModelInfo {
  id: AIModel;
  name: string;
  description: string;
  quality: 'draft' | 'standard' | 'master';
  speed: 'fast' | 'medium' | 'slow';
}

// Inference Provider
export type InferenceProvider = 'local' | 'replicate' | 'magnetic' | 'argilla';

// Processing types
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ProcessingJob {
  id: string;
  input_path: string;
  output_path: string;
  status: ProcessingStatus;
  progress: number;
  model: AIModel;
  dj_software: DJSoftware;
  error?: string;
  started_at?: string;
  completed_at?: string;
  stems?: Stem[];
}

export interface ProcessingSettings {
  model: AIModel;
  device: 'cpu' | 'cuda' | 'mps';
  outputFormat: 'alac' | 'aac';
  qualityPreset: 'draft' | 'standard' | 'master';
  djPreset: DJSoftware;
  inferenceProvider: InferenceProvider;
  customStemColors: boolean;
  normalizeAudio: boolean;
  preserveOriginal: boolean;
  cpuThreads: number;
  gpuEnabled: boolean;
}

// Dependencies
export interface DependencyStatus {
  ffmpeg: boolean;
  sox: boolean;
  python: boolean;
  cuda: boolean;
  mps: boolean;
  models: boolean;
}

export interface DependenciesStatus {
  ffmpeg: boolean;
  ffmpeg_version?: string;
  sox: boolean;
  sox_version?: string;
  python: boolean;
  python_version?: string;
  cuda: boolean;
  mps: boolean;
  model_directory: string;
  model_count: number;
}

export interface CheckDependenciesResult {
  ffmpeg: boolean;
  ffmpeg_version?: string;
  sox: boolean;
  sox_version?: string;
  python: boolean;
  python_version?: string;
  cuda: boolean;
  mps: boolean;
  model_directory: string;
  model_count: number;
}

// App state
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  default_model: AIModel;
  default_dj_software: DJSoftware;
  default_output_format: 'alac' | 'aac';
  output_directory: string;
  cpu_threads: number;
  gpu_enabled: boolean;
}

// Audio metadata with BPM/key detection (mirrors Rust backend)
export interface AudioMetadata {
  path: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  bpm?: number;
  key?: string;
  duration: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  cover_art_path?: string;
}

// NI stem file metadata (mirrors Rust backend)
export interface StemFileMetadata {
  path: string;
  ni_metadata?: NIStemMetadata;
  track_count: number;
  dj_software?: string;
  audio: AudioMetadata;
}

// Sidecar health status (Phase 3 - mirrors Rust backend)
export interface SidecarStatus {
  isHealthy: boolean;
  pythonFound: boolean;
  pythonPath?: string;
  pythonVersion?: string;
  pytorchVersion?: string;
  gpuAvailable: boolean;
  gpuDevice?: string;
  demucsAvailable: boolean;
  demucsVersion?: string;
  torchaudioVersion?: string;
  bsRoformerAvailable: boolean;
  bsRoformerVersion?: string;
  sidecarScriptFound: boolean;
  sidecarScriptPath?: string;
  modelDirectory: string;
  modelCount: number;
  errors: string[];
}

// Model availability info
export interface ModelAvailability {
  model: string;
  available: boolean;
  sizeBytes: number;
  downloadSizeBytes: number;
  path?: string;
}

// Package validation status (mirrors Rust PackageStatus enum with snake_case)
// Rust unit variant serializes as bare string "available"; tuple variants as objects.
// Accept both wire representations.
export type PackageStatusAvailable = { available: null } | 'available';

export interface PackageStatusUnavailable {
  unavailable: string;
}

export interface PackageStatusWarning {
  warning: string;
}

export interface PackageStatusMissing {
  missing: string;
}

export type PackageStatus =
  | PackageStatusAvailable
  | PackageStatusUnavailable
  | PackageStatusWarning
  | PackageStatusMissing;

/**
 * Safely check if a PackageStatus value has a given key.
 * Handles both the bare-string form (e.g. "available") from Rust unit variants
 * and the object form (e.g. { available: null }) from tuple variants.
 */
export function hasPackageStatusKey(
  status: unknown,
  key: string
): boolean {
  // Unit variant serializes as a bare string (e.g. "available")
  if (typeof status === 'string') return status === key;
  // Tuple variants serialize as objects (e.g. { missing: "msg" })
  return typeof status === 'object' && status !== null && key in status;
}

/**
 * Safely extract a string value from a PackageStatus field.
 * Returns the string value if the key exists, or undefined if the
 * status is not a valid object.
 */
export function getPackageStatusValue(
  status: unknown,
  key: string
): string | undefined {
  if (!hasPackageStatusKey(status, key)) return undefined;
  const val = (status as Record<string, unknown>)[key];
  return typeof val === 'string' ? val : undefined;
}

// Full environment validation result
export interface EnvironmentValidation {
  isReady: boolean;
  python?: PackageStatus;
  pythonPath?: string;
  pythonVersion?: string;
  pytorch?: PackageStatus;
  pytorchVersion?: string;
  torchaudio?: PackageStatus;
  torchaudioVersion?: string;
  demucs?: PackageStatus;
  demucsVersion?: string;
  cuda?: PackageStatus;
  gpuName?: string;
  ffmpeg?: PackageStatus;
  ffprobe?: PackageStatus;
  sidecarScript?: PackageStatus;
  sidecarScriptPath?: string;
  warnings: string[];
}

// History
export interface HistoryEntry {
  id: string;
  input_file: string;
  output_file: string;
  model: AIModel;
  dj_software: DJSoftware;
  created_at: string;
  duration: number;
}

// Theme type
export type Theme = 'light' | 'dark' | 'system';

// Stem separation types (mirrors Rust backend)
export interface StemInfo {
  stem_type: string;
  file_path?: string;
}

export interface PackStemsRequest {
  master_path: string;
  stem_paths: StemPath[];
  output_path: string;
  dj_software: string;
  output_format: string;
}

export interface StemPath {
  stem_type: string;
  path: string;
}

export interface PackStemsResponse {
  success: boolean;
  output_path: string;
  metadata_path?: string;
}

// ============================================================================
// Phase 4: Export/Download Stems
// ============================================================================

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'aac' | 'alac' | 'ogg';

export interface ExportStemRequest {
  stem_path: string;
  output_path: string;
  format: ExportFormat;
  normalize: boolean;
}

export interface ExportStemResponse {
  success: boolean;
  output_path: string;
}

export interface BatchExportRequest {
  stem_paths: StemPath[];
  output_dir: string;
  format: ExportFormat;
  normalize: boolean;
}

export interface BatchExportResponse {
  success: boolean;
  exported_files: string[];
}

// ============================================================================
// Dependency Install System
// ============================================================================

export interface InstallManifest {
  manifestVersion: number;
  dependencies: Record<string, DependencyManifestEntry>;
}

export interface DependencyManifestEntry {
  name: string;
  displayName: string;
  description: string;
  required: boolean;
  platforms: Record<string, PlatformConfig>;
}

export interface PlatformConfig {
  packageManagers: PackageManagerEntry[];
}

export interface PackageManagerEntry {
  id: string;
  priority: number;
  detectCommand: string;
  detectArgs: string[];
  installCommand: string;
  installArgs: string[];
  needsElevation: boolean;
}

export interface AvailableInstaller {
  id: string;
  name: string;
  needsElevation: boolean;
  commandDisplay: string;
}

export interface InstallProgressEvent {
  installId: string;
  depName: string;
  line: string;
  stream: 'stdout' | 'stderr';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface InstallResult {
  success: boolean;
  depName: string;
  installerId: string;
  alreadyInstalled: boolean;
  exitCode: number | null;
  output: string[];
  error?: string;
}
