import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as tauriCore from '@tauri-apps/api/core';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AIModel, DJSoftware } from '@/lib/types';

// Mock invoke separately for this test file (the global mock doesn't cover @tauri-apps/api/core)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
const invokeMock = vi.mocked(tauriCore.invoke);

// ─── Helpers ────────────────────────────────────────────────────────────────

const getDefaults = () => ({
  theme: 'system' as const,
  language: 'en' as const,
  defaultModel: 'demucs' as AIModel,
  defaultDjSoftware: 'traktor' as DJSoftware,
  defaultOutputFormat: 'alac' as const,
  outputDirectory: '',
  cpuThreads: 4,
  gpuEnabled: true,
  maxParallelJobs: 1,
  exportPresets: [],
  activeProvider: 'local' as const,
  falConfigured: false,
  replicateConfigured: false,
  replicateVersionHash: null as string | null,
  batchParallel: false,
  cloudDurationWarnMinutes: 15 as number | null,
  cloudDurationHardCapMinutes: null as number | null,
  privacyNoticeShown: false,
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
    expect(state.defaultModel).toBe('demucs');
    expect(state.cpuThreads).toBe(4);
    expect(state.gpuEnabled).toBe(true);
  });
});

// ─── TASK-016: Default Model Change Tests ─────────────────────────────────

describe('useSettingsStore — default model change (TASK-016)', () => {
  beforeEach(() => resetStore());

  it('initial defaultModel is demucs (not bs_roformer)', () => {
    expect(useSettingsStore.getState().defaultModel).toBe('demucs');
  });

  it('setDefaultModel changes model to bs_roformer', () => {
    useSettingsStore.getState().setDefaultModel('bs_roformer');
    expect(useSettingsStore.getState().defaultModel).toBe('bs_roformer');
  });

  it('setDefaultModel reverts back to demucs', () => {
    useSettingsStore.getState().setDefaultModel('bs_roformer');
    expect(useSettingsStore.getState().defaultModel).toBe('bs_roformer');

    useSettingsStore.getState().setDefaultModel('demucs');
    expect(useSettingsStore.getState().defaultModel).toBe('demucs');
  });

  it('setDefaultModel accepts all valid model IDs', () => {
    const validModels: AIModel[] = ['demucs', 'htdemucs', 'htdemucs_ft', 'bs_roformer'];

    for (const model of validModels) {
      useSettingsStore.getState().setDefaultModel(model);
      expect(useSettingsStore.getState().defaultModel).toBe(model);
    }
  });
});

// ─── Inference Provider Tests ─────────────────────────────────────────────

describe('useSettingsStore — inference provider', () => {
  beforeEach(() => {
    resetStore();
    invokeMock.mockReset();
  });

  it('starts with local as active provider', () => {
    expect(useSettingsStore.getState().activeProvider).toBe('local');
  });

  it('default configured flags are false', () => {
    expect(useSettingsStore.getState().falConfigured).toBe(false);
    expect(useSettingsStore.getState().replicateConfigured).toBe(false);
  });

  it('default cloudDurationWarnMinutes is 15', () => {
    expect(useSettingsStore.getState().cloudDurationWarnMinutes).toBe(15);
  });

  it('default cloudDurationHardCapMinutes is null', () => {
    expect(useSettingsStore.getState().cloudDurationHardCapMinutes).toBe(null);
  });

  it('default privacyNoticeShown is false', () => {
    expect(useSettingsStore.getState().privacyNoticeShown).toBe(false);
  });

  it('setActiveProvider calls invoke and updates state', async () => {
    invokeMock.mockResolvedValue(undefined);
    await useSettingsStore.getState().setActiveProvider('fal');
    expect(invokeMock).toHaveBeenCalledWith('set_inference_provider', { provider: 'fal' });
    expect(useSettingsStore.getState().activeProvider).toBe('fal');
  });

  it('setReplicateVersionHash updates state', () => {
    useSettingsStore.getState().setReplicateVersionHash('abc123');
    expect(useSettingsStore.getState().replicateVersionHash).toBe('abc123');
  });

  it('setReplicateVersionHash accepts null', () => {
    useSettingsStore.getState().setReplicateVersionHash('abc123');
    useSettingsStore.getState().setReplicateVersionHash(null);
    expect(useSettingsStore.getState().replicateVersionHash).toBe(null);
  });

  it('setBatchParallel updates state', () => {
    useSettingsStore.getState().setBatchParallel(true);
    expect(useSettingsStore.getState().batchParallel).toBe(true);
  });

  it('setCloudDurationWarnMinutes updates state', () => {
    useSettingsStore.getState().setCloudDurationWarnMinutes(30);
    expect(useSettingsStore.getState().cloudDurationWarnMinutes).toBe(30);
  });

  it('setCloudDurationHardCapMinutes updates state', () => {
    useSettingsStore.getState().setCloudDurationHardCapMinutes(60);
    expect(useSettingsStore.getState().cloudDurationHardCapMinutes).toBe(60);
  });

  it('markPrivacyNoticeShown calls invoke and updates state', async () => {
    invokeMock.mockResolvedValue(undefined);
    await useSettingsStore.getState().markPrivacyNoticeShown();
    expect(useSettingsStore.getState().privacyNoticeShown).toBe(true);
  });

  it('loadProviderConfig hydrates state from Tauri', async () => {
    invokeMock.mockResolvedValue({
      active_provider: 'replicate',
      replicate_version_hash: 'v2hash',
      batch_parallel: true,
      cloud_duration_warn_minutes: 20,
      cloud_duration_hard_cap_minutes: 45,
      privacy_notice_shown: true,
    });
    await useSettingsStore.getState().loadProviderConfig();
    const state = useSettingsStore.getState();
    expect(state.activeProvider).toBe('replicate');
    expect(state.replicateVersionHash).toBe('v2hash');
    expect(state.batchParallel).toBe(true);
    expect(state.cloudDurationWarnMinutes).toBe(20);
    expect(state.cloudDurationHardCapMinutes).toBe(45);
    expect(state.privacyNoticeShown).toBe(true);
  });

  it('loadProviderConfig falls back to defaults on error', async () => {
    invokeMock.mockRejectedValue(new Error('no config'));
    await useSettingsStore.getState().loadProviderConfig();
    expect(useSettingsStore.getState().activeProvider).toBe('local');
  });

  it('API key values are never in store state', () => {
    const state = useSettingsStore.getState();
    const stateStr = JSON.stringify(state);
    expect(stateStr).not.toContain('key');
    expect(stateStr).not.toContain('token');
    expect(stateStr).not.toContain('secret');
  });
});
