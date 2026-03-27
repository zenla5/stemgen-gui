import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AI_MODELS, DJ_SOFTWARE_PRESETS, OUTPUT_FORMATS, QUALITY_PRESETS, DEVICE_OPTIONS } from '@/lib/constants';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// ─── Store reset helper ────────────────────────────────────────────────────────

function resetStores() {
  act(() => {
    useAppStore.setState({
      settings: {
        model: 'bs_roformer',
        device: 'cuda',
        outputFormat: 'alac',
        qualityPreset: 'standard',
        djPreset: 'traktor',
        inferenceProvider: 'local',
        customStemColors: true,
        normalizeAudio: true,
        preserveOriginal: true,
        cpuThreads: 4,
        gpuEnabled: true,
      },
      dependencies: {
        ffmpeg: true,
        sox: true,
        python: true,
        cuda: false,
        mps: false,
        models: false,
      },
    });

    useSettingsStore.setState({
      theme: 'dark',
      language: 'en',
      cpuThreads: 4,
      gpuEnabled: true,
      maxParallelJobs: 1,
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPanel', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStores();
  });

  it('renders the Settings title', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders all 4 AI models', () => {
    render(<SettingsPanel />);
    for (const model of AI_MODELS) {
      expect(screen.getByText(model.name)).toBeInTheDocument();
    }
  });

  it('renders all 6 DJ software presets', () => {
    render(<SettingsPanel />);
    for (const preset of DJ_SOFTWARE_PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument();
    }
  });

  it('renders output format options', () => {
    render(<SettingsPanel />);
    for (const format of OUTPUT_FORMATS) {
      expect(screen.getByText(format.name)).toBeInTheDocument();
    }
  });

  it('renders quality preset options', () => {
    render(<SettingsPanel />);
    for (const preset of QUALITY_PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument();
    }
  });

  it('renders device options', () => {
    render(<SettingsPanel />);
    for (const device of DEVICE_OPTIONS) {
      expect(screen.getByText(device.name)).toBeInTheDocument();
    }
  });

  it('renders language selector', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders Appearance section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /appearance/i })).toBeInTheDocument();
  });

  it('renders GPU Acceleration section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /gpu acceleration/i })).toBeInTheDocument();
  });

  it('renders CPU Threads section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /cpu threads/i })).toBeInTheDocument();
  });

  it('renders Parallel Jobs section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /parallel jobs/i })).toBeInTheDocument();
  });
});
