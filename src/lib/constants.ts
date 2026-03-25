// App constants
export const APP_NAME = 'Stemgen GUI';
export const APP_VERSION = '0.1.0';
export const APP_DESCRIPTION = 'A free and open source stem file generator';

// Stem colors (NI-compatible from Native Instruments)
export const NI_STEM_COLORS = {
  drums: '#FF6B6B',
  bass: '#4ECDC4',
  other: '#FFE66D',
  vocals: '#95E1D3',
} as const;

// Default processing settings
export const DEFAULT_PROCESSING_SETTINGS = {
  model: 'bs_roformer' as const,
  device: 'cuda' as const,
  outputFormat: 'alac' as const,
  qualityPreset: 'standard' as const,
  djPreset: 'traktor' as const,
  inferenceProvider: 'local' as const,
  customStemNames: {},
  customStemColors: {},
  outputDirectory: '',
  individualStemExport: false,
  extractCoverArt: true,
};

// Waveform settings
export const WAVEFORM_SAMPLES = 1000;
export const WAVEFORM_BAR_COUNT = 50;

// Progress update interval (ms)
export const PROGRESS_UPDATE_INTERVAL = 100;

// File size limits
export const MAX_FILE_SIZE_MB = 500;
export const MAX_BATCH_SIZE = 100;

// Batch processing
export const MAX_PARALLEL_JOBS = 2;

// Model download URLs
export const MODEL_DOWNLOAD_BASE_URL = 'https://huggingface.co/datasets/zenla5/stemgen-models';

// Update check interval (hours)
export const UPDATE_CHECK_INTERVAL = 24;

// History limit
export const MAX_HISTORY_ENTRIES = 100;

// Keyboard shortcuts
export const SHORTCUTS = {
  // File operations
  openFile: { key: 'o', modifiers: ['ctrl'] },
  openFolder: { key: 'o', modifiers: ['ctrl', 'shift'] },
  save: { key: 's', modifiers: ['ctrl'] },
  saveAs: { key: 's', modifiers: ['ctrl', 'shift'] },
  close: { key: 'w', modifiers: ['ctrl'] },
  
  // Processing
  startProcessing: { key: 'Enter', modifiers: ['ctrl'] },
  cancelProcessing: { key: 'Escape' },
  pauseProcessing: { key: 'Space', modifiers: ['ctrl'] },
  
  // Playback
  play: { key: 'Space' },
  stop: { key: 's', modifiers: ['ctrl', 'alt'] },
  
  // View
  toggleTheme: { key: 't', modifiers: ['ctrl'] },
  toggleSidebar: { key: 'b', modifiers: ['ctrl'] },
  toggleFullscreen: { key: 'f', modifiers: ['ctrl'] },
  
  // Stem mixer
  soloStem: { key: 's', modifiers: ['alt'] },
  muteStem: { key: 'm', modifiers: ['alt'] },
  soloAll: { key: 's', modifiers: ['alt', 'shift'] },
  unmuteAll: { key: 'm', modifiers: ['alt', 'shift'] },
  
  // Queue
  clearQueue: { key: 'Delete', modifiers: ['ctrl'] },
  removeSelected: { key: 'Delete' },
  moveUp: { key: 'ArrowUp', modifiers: ['alt'] },
  moveDown: { key: 'ArrowDown', modifiers: ['alt'] },
} as const;

// App routes
export const ROUTES = {
  home: '/',
  processing: '/processing',
  mixer: '/mixer',
  settings: '/settings',
  models: '/models',
  history: '/history',
} as const;
