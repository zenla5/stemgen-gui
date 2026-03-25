// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = [
  '.mp3', '.flac', '.wav', '.wave', '.aiff', '.aif', '.ogg', '.m4a', '.aac'
] as const;

export type SupportedAudioFormat = typeof SUPPORTED_AUDIO_FORMATS[number];

// Stem types
export const STEM_TYPES = ['drums', 'bass', 'other', 'vocals'] as const;
export type StemType = typeof STEM_TYPES[number];

export const STEM_COLORS: Record<StemType, string> = {
  drums: '#FF6B6B',
  bass: '#4ECDC4',
  other: '#FFE66D',
  vocals: '#95E1D3',
};

export const STEM_DEFAULT_NAMES: Record<StemType, string> = {
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other',
  vocals: 'Vocals',
};

// DJ Software presets
export const DJ_SOFTWARE_PRESETS = [
  'traktor',
  'rekordbox',
  'serato',
  'mixxx',
  'djay',
  'virtualdj',
] as const;
export type DJSoftwarePreset = typeof DJ_SOFTWARE_PRESETS[number];

// Stem order per DJ software
export const STEM_ORDERS: Record<DJSoftwarePreset, StemType[]> = {
  traktor: ['drums', 'bass', 'other', 'vocals'],
  rekordbox: ['drums', 'bass', 'other', 'vocals'],
  serato: ['vocals', 'drums', 'bass', 'other'],
  mixxx: ['drums', 'bass', 'other', 'vocals'],
  djay: ['drums', 'bass', 'other', 'vocals'],
  virtualdj: ['vocals', 'drums', 'bass', 'other'],
};

// AI Models
export const AI_MODELS = [
  { id: 'bs_roformer', name: 'BS RoFormer', quality: 'high', speed: 'medium' },
  { id: 'htdemucs', name: 'HTDemucs', quality: 'high', speed: 'slow' },
  { id: 'htdemucs_ft', name: 'HTDemucs (fine-tuned)', quality: 'highest', speed: 'slow' },
  { id: 'demucs', name: 'Demucs v4', quality: 'medium', speed: 'fast' },
] as const;
export type AIModelId = typeof AI_MODELS[number]['id'];

// Processing device
export const PROCESSING_DEVICES = ['cuda', 'mps', 'cpu'] as const;
export type ProcessingDevice = typeof PROCESSING_DEVICES[number];

// Output formats
export const OUTPUT_FORMATS = ['alac', 'aac'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

// Quality presets
export const QUALITY_PRESETS = ['draft', 'standard', 'master'] as const;
export type QualityPreset = typeof QUALITY_PRESETS[number];

// Job status
export const JOB_STATUSES = [
  'pending',
  'converting',
  'separating',
  'encoding',
  'packing',
  'tagging',
  'completed',
  'failed',
] as const;
export type JobStatus = typeof JOB_STATUSES[number];

// Inference providers
export const INFERENCE_PROVIDERS = [
  { id: 'local', name: 'Local (Your GPU/CPU)' },
  { id: 'replicate', name: 'Replicate' },
  { id: 'modal', name: 'Modal' },
  { id: 'runpod', name: 'RunPod' },
] as const;
export type InferenceProviderId = typeof INFERENCE_PROVIDERS[number]['id'];

// Theme
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = typeof THEMES[number];

// Audio file metadata
export interface AudioFileMetadata {
  path: string;
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  format: SupportedAudioFormat;
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  bpm?: number;
  key?: string;
  genre?: string;
  coverArt?: string;
}

// Stem data
export interface Stem {
  id: string;
  type: StemType;
  name: string;
  color: string;
  filePath?: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

// Processing job
export interface ProcessingJob {
  id: string;
  sourceFile: AudioFileMetadata;
  outputPath: string;
  status: JobStatus;
  progress: number;
  progressMessage: string;
  model: AIModelId;
  device: ProcessingDevice;
  outputFormat: OutputFormat;
  djPreset: DJSoftwarePreset;
  stems: Stem[];
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Processing settings
export interface ProcessingSettings {
  model: AIModelId;
  device: ProcessingDevice;
  outputFormat: OutputFormat;
  qualityPreset: QualityPreset;
  djPreset: DJSoftwarePreset;
  inferenceProvider: InferenceProviderId;
  customStemNames: Partial<Record<StemType, string>>;
  customStemColors: Partial<Record<StemType, string>>;
  outputDirectory: string;
  individualStemExport: boolean;
  extractCoverArt: boolean;
}

// Dependency status
export interface DependencyStatus {
  ffmpeg: boolean;
  sox: boolean;
  python: boolean;
  cuda: boolean;
  mps: boolean;
  models: boolean;
}

// Export preset
export interface ExportPreset {
  id: string;
  name: string;
  model: AIModelId;
  outputFormat: OutputFormat;
  qualityPreset: QualityPreset;
  djPreset: DJSoftwarePreset;
  individualStemExport: boolean;
}

// Processing history entry
export interface HistoryEntry {
  id: string;
  sourcePath: string;
  outputPath: string;
  model: AIModelId;
  djPreset: DJSoftwarePreset;
  processedAt: Date;
  duration: number;
  fileSize: number;
}

// Tauri command types
export interface CheckDependenciesResult {
  ffmpeg: boolean;
  ffmpegVersion?: string;
  sox: boolean;
  soxVersion?: string;
  python: boolean;
  pythonVersion?: string;
  cuda: boolean;
  mps: boolean;
  modelDirectory: string;
  modelCount: number;
}

export interface AudioInfoResult {
  path: string;
  duration: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  format: string;
  metadata: Record<string, string>;
  coverArtPath?: string;
}

export interface SeparationProgress {
  jobId: string;
  stage: 'converting' | 'separating' | 'encoding' | 'packing' | 'tagging';
  progress: number;
  message: string;
  stemType?: StemType;
}
