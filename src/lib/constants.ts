// Constants for Stemgen-GUI

import type { AIModel, DJSoftware } from './types';

// Stem colors (NI-compatible)
export const STEM_COLORS: Record<string, string> = {
  drums: '#FF6B6B',
  bass: '#4ECDC4',
  other: '#FFE66D',
  vocals: '#95E1D3',
};

// Stem default names
export const STEM_DEFAULT_NAMES: Record<string, string> = {
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other',
  vocals: 'Vocals',
};

// Alias for backward compatibility
export const NI_STEM_COLORS = STEM_COLORS;

// DJ Software presets
export const DJ_SOFTWARE_PRESETS = [
  {
    id: 'traktor' as DJSoftware,
    name: 'Traktor Pro',
    codec: 'alac',
    stem_order: ['drums', 'bass', 'other', 'vocals'],
  },
  {
    id: 'rekordbox' as DJSoftware,
    name: 'Rekordbox',
    codec: 'aac',
    stem_order: ['drums', 'bass', 'other', 'vocals'],
  },
  {
    id: 'serato' as DJSoftware,
    name: 'Serato DJ',
    codec: 'aac',
    stem_order: ['vocals', 'drums', 'bass', 'other'],
  },
  {
    id: 'mixxx' as DJSoftware,
    name: 'Mixxx',
    codec: 'alac',
    stem_order: ['drums', 'bass', 'other', 'vocals'],
  },
  {
    id: 'djay' as DJSoftware,
    name: 'djay',
    codec: 'aac',
    stem_order: ['drums', 'bass', 'other', 'vocals'],
  },
  {
    id: 'virtualdj' as DJSoftware,
    name: 'VirtualDJ',
    codec: 'aac',
    stem_order: ['vocals', 'drums', 'bass', 'other'],
  },
] as const;

// AI Models
export const AI_MODELS = [
  {
    id: 'demucs' as AIModel,
    name: 'Demucs',
    description: 'Fast separation, medium quality',
    quality: 'draft' as const,
    speed: 'fast' as const,
  },
  {
    id: 'bs_roformer' as AIModel,
    name: 'BS-RoFormer',
    description: 'High quality separation, medium speed',
    quality: 'standard' as const,
    speed: 'medium' as const,
  },
  {
    id: 'htdemucs' as AIModel,
    name: 'HT-Demucs',
    description: 'High quality separation, slow',
    quality: 'standard' as const,
    speed: 'slow' as const,
  },
  {
    id: 'htdemucs_ft' as AIModel,
    name: 'HT-Demucs FT',
    description: 'Highest quality separation, very slow',
    quality: 'master' as const,
    speed: 'slow' as const,
  },
] as const;

// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = [
  'mp3',
  'flac',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'aiff',
  'wma',
  'opus',
];

// Alias for backward compatibility
export const SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS;

// Quality presets
export const QUALITY_PRESETS = [
  {
    id: 'draft' as const,
    name: 'Draft',
    description: 'Fast, lower quality - good for preview',
    model: 'demucs' as AIModel,
  },
  {
    id: 'standard' as const,
    name: 'Standard',
    description: 'Balanced quality and speed',
    model: 'bs_roformer' as AIModel,
  },
  {
    id: 'master' as const,
    name: 'Master',
    description: 'Highest quality, slower processing',
    model: 'htdemucs_ft' as AIModel,
  },
] as const;

// Output formats
export const OUTPUT_FORMATS = [
  {
    id: 'alac' as const,
    name: 'ALAC',
    description: 'Apple Lossless - lossless quality, larger files',
    extension: '.m4a',
  },
  {
    id: 'aac' as const,
    name: 'AAC',
    description: 'Advanced Audio Coding - compressed, smaller files',
    extension: '.m4a',
  },
] as const;

// Theme options
export const THEMES = [
  { id: 'light' as const, name: 'Light' },
  { id: 'dark' as const, name: 'Dark' },
  { id: 'system' as const, name: 'System' },
];

// Device options
export const DEVICE_OPTIONS = [
  { id: 'cuda' as const, name: 'GPU (NVIDIA CUDA)' },
  { id: 'mps' as const, name: 'GPU (Apple Silicon)' },
  { id: 'cpu' as const, name: 'CPU' },
];

// Default processing settings
export const DEFAULT_PROCESSING_SETTINGS = {
  model: 'bs_roformer' as AIModel,
  device: 'cpu' as const,
  outputFormat: 'alac' as const,
  qualityPreset: 'standard' as const,
  djPreset: 'traktor' as DJSoftware,
  inferenceProvider: 'local' as const,
  customStemColors: true,
  normalizeAudio: true,
  preserveOriginal: true,
  cpuThreads: 4,
  gpuEnabled: true,
};

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  'ctrl+o': 'Open file',
  'ctrl+s': 'Start processing',
  'ctrl+b': 'Toggle sidebar',
  'ctrl+,': 'Open settings',
  'ctrl+q': 'Quit application',
  '1': 'Go to Files',
  '2': 'Go to Queue',
  '3': 'Go to Mixer',
  '4': 'Go to Settings',
  'space': 'Play/Pause preview',
  'delete': 'Remove selected',
  'escape': 'Cancel current action',
};

/// App info
// ⚠️ Keep in sync with package.json "version" field
export const APP_VERSION = '1.1.0';

export const APP_INFO = {
  name: 'Stemgen-GUI',
  version: APP_VERSION,
  description: 'A free and open source (FOSS) stem file generator for DJ software',
  repository: 'https://github.com/zenla5/stemgen-gui',
};
