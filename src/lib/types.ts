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
export interface PackageStatusAvailable {
  available: null;
}

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
