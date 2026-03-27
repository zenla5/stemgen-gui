import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import * as settingsStoreModule from '@/stores/settingsStore';
import * as appStoreModule from '@/stores/appStore';

// Mock the stores
vi.mock('@/stores/settingsStore');
vi.mock('@/stores/appStore');

const createMockSettingsStore = (overrides = {}) => ({
  theme: 'dark' as const,
  language: 'en',
  gpuEnabled: true,
  cpuThreads: 4,
  maxParallelJobs: 2,
  setTheme: vi.fn(),
  setLanguage: vi.fn(),
  setGpuEnabled: vi.fn(),
  setCpuThreads: vi.fn(),
  setMaxParallelJobs: vi.fn(),
  ...overrides,
});

const createMockAppStore = (overrides = {}) => ({
  settings: {
    model: 'bs_roformer',
    device: 'auto',
    djPreset: 'traktor',
    outputFormat: 'aac',
    qualityPreset: 'standard',
  },
  updateSettings: vi.fn(),
  checkSidecarHealth: vi.fn(),
  validateEnvironment: vi.fn(),
  sidecarHealth: {
    isHealthy: true,
    pythonFound: true,
    pythonVersion: '3.10.0',
    pytorchVersion: '2.0.0',
    gpuAvailable: true,
    gpuDevice: 'NVIDIA RTX 3080',
    modelCount: 4,
    errors: [],
  },
  environmentValidation: {
    isReady: true,
    ffmpeg: { available: null },
    ffprobe: { available: null },
    python: { available: null },
    pytorch: { available: null },
    torchaudio: { available: null },
    demucs: { available: null },
    cuda: { available: null },
    sidecarScript: { available: null },
    warnings: [],
  },
  dependencies: {
    ffmpeg: true,
    sox: true,
    python: true,
    cuda: true,
    mps: false,
    models: true,
  },
  ...overrides,
});

describe('SettingsPanel — basic render', () => {
  let mockSettingsStore: ReturnType<typeof createMockSettingsStore>;
  let mockAppStore: ReturnType<typeof createMockAppStore>;

  beforeEach(() => {
    mockSettingsStore = createMockSettingsStore();
    mockAppStore = createMockAppStore();

    vi.mocked(settingsStoreModule.useSettingsStore).mockReturnValue(mockSettingsStore);
    vi.mocked(appStoreModule.useAppStore).mockReturnValue(mockAppStore as unknown as ReturnType<typeof appStoreModule.useAppStore>);
  });

  it('renders Settings title', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders Refresh button', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('renders GPU checkbox', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders language select', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders theme buttons', () => {
    render(<SettingsPanel />);
    // Dark, light, system buttons
    expect(screen.getAllByRole('button').filter(b => b.textContent?.includes('Dark')).length).toBeGreaterThan(0);
  });

  it('renders AI Model section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /AI Model/i })).toBeInTheDocument();
  });

  it('renders Device section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Processing Device/i })).toBeInTheDocument();
  });

  it('renders Output Format section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Output Format/i })).toBeInTheDocument();
  });

  it('renders Quality Preset section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Quality Preset/i })).toBeInTheDocument();
  });

  it('renders GPU Acceleration section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /GPU Acceleration/i })).toBeInTheDocument();
  });

  it('renders CPU Threads section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /CPU Threads/i })).toBeInTheDocument();
  });

  it('renders Parallel Jobs section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Parallel Jobs/i })).toBeInTheDocument();
  });
});

