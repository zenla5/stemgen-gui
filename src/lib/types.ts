// ============================================================================
// Stem types
// ============================================================================

export type StemType = 'drums' | 'bass' | 'other' | 'vocals';

export interface StemPath {
  stem_type: StemType;
  path: string;
}

export interface StemInfo {
  stem_type: string;
  file_path: string | null;
}

export interface Stem {
  stemType: StemType;
  label: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  waveform: WaveformData | null;
  audio?: HTMLAudioElement;
}

export interface StemData {
  stemType: StemType;
  label: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

// ============================================================================
// Processing types
// ============================================================================

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ProcessingJob {
  id: string;
  fileName: string;
  filePath: string;
  status: ProcessingStatus;
  progress: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  outputPath?: string;
  stems?: StemInfo[];
  input_path?: string;
  completed_at?: number;
}

export interface SeparationSettings {
  model: string;
  device: string;
  output_format: string;
  quality_preset: string;
  dj_preset: string;
}

export interface ProcessingSettings extends SeparationSettings {}

// ============================================================================
// Audio types
// ============================================================================

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

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration_secs: number;
  sample_rate: number;
  channels: number;
  bitrate?: number;
  format: string;
}

export interface AudioFileMetadata {
  audio: AudioMetadata;
  stems: AudioMetadata[];
}

// ============================================================================
// NI Stem metadata
// ============================================================================

export interface NIStemMetadata {
  version: string;
  stem_count: number;
  stems: NIStem[];
  master?: {
    name: string;
    file_path: string;
  };
}

export interface NIStem {
  name: string;
  color: string;
  file_path: string;
}

export interface StemFileMetadata {
  stem_type: StemType;
  file_path: string;
  metadata: NIStemMetadata;
  audio?: AudioMetadata;
  dj_software?: string;
  track_count?: number;
}

// ============================================================================
// Pack stems types
// ============================================================================

export interface PackStemsRequest {
  master_path: string;
  stem_paths: StemPath[];
  output_path: string;
  dj_software: string;
  output_format: string;
}

export interface PackStemsResponse {
  success: boolean;
  output_path: string;
  metadata_path?: string;
}

// ============================================================================
// Export types (Phase 4)
// ============================================================================

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

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'aac' | 'alac' | 'ogg';

// ============================================================================
// DJ Software presets
// ============================================================================

export type DJSoftware = 'traktor' | 'rekordbox' | 'serato' | 'mixxx' | 'djay' | 'virtualdj';

export interface DJSoftwarePreset {
  id: DJSoftware;
  name: string;
  codec: 'alac' | 'aac';
  stem_order: StemType[];
  notes?: string;
}

// ============================================================================
// Settings types
// ============================================================================

export interface AppSettings {
  model: string;
  device: 'cpu' | 'cuda' | 'mps';
  outputFormat: 'alac' | 'aac';
  qualityPreset: 'draft' | 'standard' | 'high';
  djPreset: DJSoftware;
  outputDirectory: string;
}

export interface Theme {
  id: 'light' | 'dark' | 'system';
  name: string;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  quality: 'draft' | 'standard' | 'master';
  speed: 'fast' | 'medium' | 'slow';
}

export interface DeviceOption {
  id: 'cpu' | 'cuda' | 'mps';
  name: string;
  description?: string;
}

export interface QualityPreset {
  id: 'draft' | 'standard' | 'high';
  name: string;
  description: string;
}

export interface OutputFormatOption {
  id: 'alac' | 'aac';
  name: string;
  description: string;
}

// ============================================================================
// Dependency/Environment types (Phase 3)
// ============================================================================

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

export interface ModelAvailability {
  model: string;
  available: boolean;
  sizeBytes: number;
  downloadSizeBytes: number;
  path?: string;
}

export type PackageStatus = 
  | { available: null }
  | { unavailable: string }
  | { warning: string }
  | { missing: string };

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

export type DependencyStatus = 'ok' | 'warning' | 'error';

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

// ============================================================================
// Model types
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  quality: 'draft' | 'standard' | 'master';
  speed: 'fast' | 'medium' | 'slow';
  size_bytes: number;
  downloaded: boolean;
  download_url?: string;
}

// ============================================================================
// UI State types
// ============================================================================

export interface AppState {
  files: string[];
  jobs: ProcessingJob[];
  stems: StemData[];
  dependencies: {
    ffmpeg: boolean;
    sox: boolean;
    python: boolean;
    cuda: boolean;
    mps: boolean;
  };
  isProcessing: boolean;
  settings: AppSettings;
  sidecarHealth?: SidecarStatus;
  environmentValidation?: EnvironmentValidation;
}

export interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: string;
  gpuEnabled: boolean;
  cpuThreads: number;
  maxParallelJobs: number;
}
