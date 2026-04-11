import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { AIModel, DJSoftware } from '@/lib/types';
import type { Theme } from '@/lib/types';
import { changeLanguage, supportedLanguages } from '@/i18n';

export type ExportPreset = {
  id: string;
  name: string;
  model: AIModel;
  djSoftware: DJSoftware;
  outputFormat: 'alac' | 'aac';
  qualityPreset: 'draft' | 'standard' | 'master';
};

export type SupportedLanguageCode = 'en' | 'de';

export type ActiveProvider = 'local' | 'fal' | 'replicate';

interface InferenceProviderConfig {
  active_provider: ActiveProvider;
  replicate_version_hash: string | null;
  batch_parallel: boolean;
  cloud_duration_warn_minutes: number | null;
  cloud_duration_hard_cap_minutes: number | null;
  privacy_notice_shown: boolean;
}

interface SettingsState {
  // Theme
  theme: Theme;
  
  // Language
  language: SupportedLanguageCode;
  
  // Default export settings
  defaultModel: AIModel;
  defaultDjSoftware: DJSoftware;
  defaultOutputFormat: 'alac' | 'aac';
  
  // Output directory
  outputDirectory: string;
  
  // Export presets
  exportPresets: ExportPreset[];
  
  // CPU/GPU settings
  cpuThreads: number;
  gpuEnabled: boolean;
  maxParallelJobs: number;
  
  // First-run wizard
  hasSeenFirstRun: boolean;

  // Inference provider
  activeProvider: ActiveProvider;
  falConfigured: boolean;
  replicateConfigured: boolean;
  replicateVersionHash: string | null;
  batchParallel: boolean;
  cloudDurationWarnMinutes: number | null;
  cloudDurationHardCapMinutes: number | null;
  privacyNoticeShown: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setLanguage: (language: string) => void;
  setDefaultModel: (model: AIModel) => void;
  setDefaultDjSoftware: (software: DJSoftware) => void;
  setDefaultOutputFormat: (format: 'alac' | 'aac') => void;
  setOutputDirectory: (directory: string) => void;
  setCpuThreads: (threads: number) => void;
  setGpuEnabled: (enabled: boolean) => void;
  setMaxParallelJobs: (max: number) => void;
  
  // Preset actions
  addExportPreset: (preset: ExportPreset) => void;
  removeExportPreset: (id: string) => void;
  updateExportPreset: (id: string, updates: Partial<ExportPreset>) => void;
  
  // First-run actions
  completeFirstRun: () => void;

  // Inference provider actions
  setActiveProvider: (provider: ActiveProvider) => Promise<void>;
  setReplicateVersionHash: (hash: string | null) => void;
  setBatchParallel: (enabled: boolean) => void;
  setCloudDurationWarnMinutes: (minutes: number | null) => void;
  setCloudDurationHardCapMinutes: (minutes: number | null) => void;
  markPrivacyNoticeShown: () => Promise<void>;
  loadProviderConfig: () => Promise<void>;

  // Reset
  resetSettings: () => void;
}

// Get available language codes from supportedLanguages
const availableLanguages: SupportedLanguageCode[] = supportedLanguages.map(l => l.code as SupportedLanguageCode);

const DEFAULT_SETTINGS = {
  theme: 'system' as Theme,
  language: 'en' as SupportedLanguageCode,
  defaultModel: 'demucs' as AIModel,
  defaultDjSoftware: 'traktor' as DJSoftware,
  defaultOutputFormat: 'alac' as const,
  outputDirectory: '',
  cpuThreads: 4,
  gpuEnabled: true,
  maxParallelJobs: 1,
  exportPresets: [] as ExportPreset[],
  hasSeenFirstRun: false,
  activeProvider: 'local' as ActiveProvider,
  falConfigured: false,
  replicateConfigured: false,
  replicateVersionHash: null as string | null,
  batchParallel: false,
  cloudDurationWarnMinutes: 15 as number | null,
  cloudDurationHardCapMinutes: null as number | null,
  privacyNoticeShown: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      
      setTheme: (theme) => set({ theme }),
      setLanguage: async (language) => {
        // Only change language if it's a supported language
        if (availableLanguages.includes(language as SupportedLanguageCode)) {
          await changeLanguage(language as SupportedLanguageCode);
        }
        set({ language: language as SupportedLanguageCode });
      },
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDefaultDjSoftware: (software) => set({ defaultDjSoftware: software }),
      setDefaultOutputFormat: (format) => set({ defaultOutputFormat: format }),
      setOutputDirectory: (directory) => set({ outputDirectory: directory }),
      setCpuThreads: (threads) => set({ cpuThreads: threads }),
      setGpuEnabled: (enabled) => set({ gpuEnabled: enabled }),
      setMaxParallelJobs: (max) => set({ maxParallelJobs: max }),
      
      addExportPreset: (preset) =>
        set((state) => ({
          exportPresets: [...state.exportPresets, preset],
        })),
      
      removeExportPreset: (id) =>
        set((state) => ({
          exportPresets: state.exportPresets.filter((p) => p.id !== id),
        })),
      
      updateExportPreset: (id, updates) =>
        set((state) => ({
          exportPresets: state.exportPresets.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      
      completeFirstRun: () => set({ hasSeenFirstRun: true }),

      // Inference provider actions
      // NOTE: API keys are never stored in this Zustand store or localStorage.
      // Keys are managed exclusively via OS keychain through Rust Tauri commands.
      setActiveProvider: async (provider) => {
        await invoke('set_inference_provider', { provider });
        set({ activeProvider: provider });
      },

      setReplicateVersionHash: (hash) => {
        set({ replicateVersionHash: hash });
      },

      setBatchParallel: (enabled) => {
        set({ batchParallel: enabled });
      },

      setCloudDurationWarnMinutes: (minutes) => {
        set({ cloudDurationWarnMinutes: minutes });
      },

      setCloudDurationHardCapMinutes: (minutes) => {
        set({ cloudDurationHardCapMinutes: minutes });
      },

      markPrivacyNoticeShown: async () => {
        await invoke('set_inference_provider', { provider: get().activeProvider });
        set({ privacyNoticeShown: true });
      },

      loadProviderConfig: async () => {
        try {
          const config = await invoke<InferenceProviderConfig>('get_inference_provider_config');
          set({
            activeProvider: config.active_provider,
            replicateVersionHash: config.replicate_version_hash,
            batchParallel: config.batch_parallel,
            cloudDurationWarnMinutes: config.cloud_duration_warn_minutes,
            cloudDurationHardCapMinutes: config.cloud_duration_hard_cap_minutes,
            privacyNoticeShown: config.privacy_notice_shown,
            // configured flags are derived from keychain existence, not from config blob
            falConfigured: false,
            replicateConfigured: false,
          });
        } catch {
          // Silently fall back to defaults — config will be created on first write
        }
      },

      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'stemgen-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export { supportedLanguages };
