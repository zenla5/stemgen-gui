import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AIModel, DJSoftware } from '@/lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const getDefaults = () => ({
  theme: 'system' as const,
  language: 'en' as const,
  defaultModel: 'bs_roformer' as AIModel,
  defaultDjSoftware: 'traktor' as DJSoftware,
  defaultOutputFormat: 'alac' as const,
  outputDirectory: '',
  cpuThreads: 4,
  gpuEnabled: true,
  maxParallelJobs: 1,
  exportPresets: [],
});

function resetStore() {
  useSettingsStore.setState(getDefaults());
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useSettingsStore — theme', () => {
  beforeEach(() => resetStore());

  it('starts with system theme', () => {
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('setTheme updates theme', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('setTheme accepts light theme', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
  });
});

describe('useSettingsStore — language', () => {
  beforeEach(() => resetStore());

  it('starts with english', () => {
    expect(useSettingsStore.getState().language).toBe('en');
  });

  it('setLanguage updates language to supported code', async () => {
    await useSettingsStore.getState().setLanguage('de');
    expect(useSettingsStore.getState().language).toBe('de');
  });

  it('setLanguage updates to unsupported code (implementation currently accepts any value)', async () => {
    // The implementation accepts any string and sets it as the language.
    // This is a known behavior - only the i18n changeLanguage() is gated.
    await useSettingsStore.getState().setLanguage('fr');
    expect(useSettingsStore.getState().language).toBe('fr');
  });
});

describe('useSettingsStore — defaults', () => {
  beforeEach(() => resetStore());

  it('setDefaultModel updates model', () => {
    useSettingsStore.getState().setDefaultModel('demucs');
    expect(useSettingsStore.getState().defaultModel).toBe('demucs');
  });

  it('setDefaultDjSoftware updates DJ software', () => {
    useSettingsStore.getState().setDefaultDjSoftware('serato');
    expect(useSettingsStore.getState().defaultDjSoftware).toBe('serato');
  });

  it('setDefaultOutputFormat updates format', () => {
    useSettingsStore.getState().setDefaultOutputFormat('aac');
    expect(useSettingsStore.getState().defaultOutputFormat).toBe('aac');
  });

  it('setOutputDirectory updates directory', () => {
    useSettingsStore.getState().setOutputDirectory('/my/output');
    expect(useSettingsStore.getState().outputDirectory).toBe('/my/output');
  });
});

describe('useSettingsStore — CPU/GPU settings', () => {
  beforeEach(() => resetStore());

  it('setCpuThreads updates thread count', () => {
    useSettingsStore.getState().setCpuThreads(8);
    expect(useSettingsStore.getState().cpuThreads).toBe(8);
  });

  it('setGpuEnabled toggles GPU', () => {
    const store = useSettingsStore.getState();
    expect(store.gpuEnabled).toBe(true);
    store.setGpuEnabled(false);
    expect(useSettingsStore.getState().gpuEnabled).toBe(false);
  });

  it('setMaxParallelJobs updates job count', () => {
    useSettingsStore.getState().setMaxParallelJobs(4);
    expect(useSettingsStore.getState().maxParallelJobs).toBe(4);
  });
});

describe('useSettingsStore — export presets', () => {
  beforeEach(() => resetStore());

  it('addExportPreset appends to presets array', () => {
    const preset = {
      id: 'preset-1',
      name: 'My Preset',
      model: 'bs_roformer' as AIModel,
      djSoftware: 'traktor' as DJSoftware,
      outputFormat: 'alac' as const,
      qualityPreset: 'standard' as const,
    };

    useSettingsStore.getState().addExportPreset(preset);
    expect(useSettingsStore.getState().exportPresets).toHaveLength(1);
    expect(useSettingsStore.getState().exportPresets[0].name).toBe('My Preset');
  });

  it('removeExportPreset filters by id', () => {
    const store = useSettingsStore.getState();
    store.addExportPreset({
      id: 'p1', name: 'P1', model: 'demucs' as AIModel,
      djSoftware: 'traktor' as DJSoftware, outputFormat: 'alac' as const,
      qualityPreset: 'draft' as const,
    });
    store.addExportPreset({
      id: 'p2', name: 'P2', model: 'bs_roformer' as AIModel,
      djSoftware: 'serato' as DJSoftware, outputFormat: 'aac' as const,
      qualityPreset: 'standard' as const,
    });

    store.removeExportPreset('p1');

    const ids = useSettingsStore.getState().exportPresets.map((p) => p.id);
    expect(ids).not.toContain('p1');
    expect(ids).toContain('p2');
  });

  it('updateExportPreset merges updates', () => {
    const store = useSettingsStore.getState();
    store.addExportPreset({
      id: 'p1', name: 'Original', model: 'demucs' as AIModel,
      djSoftware: 'traktor' as DJSoftware, outputFormat: 'alac' as const,
      qualityPreset: 'draft' as const,
    });

    store.updateExportPreset('p1', { name: 'Updated', qualityPreset: 'standard' as const });

    const updated = useSettingsStore.getState().exportPresets.find((p) => p.id === 'p1');
    expect(updated?.name).toBe('Updated');
    expect(updated?.model).toBe('demucs'); // unchanged
  });
});

describe('useSettingsStore — reset', () => {
  it('resetSettings restores all defaults', () => {
    const store = useSettingsStore.getState();
    store.setTheme('dark');
    store.setLanguage('de');
    store.setDefaultModel('htdemucs');
    store.setCpuThreads(16);
    store.setGpuEnabled(false);

    store.resetSettings();

    const state = useSettingsStore.getState();
    expect(state.theme).toBe('system');
    expect(state.language).toBe('en');
    expect(state.defaultModel).toBe('bs_roformer');
    expect(state.cpuThreads).toBe(4);
    expect(state.gpuEnabled).toBe(true);
  });
});
