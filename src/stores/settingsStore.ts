import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  
  // Reset
  resetSettings: () => void;
}

// Get available language codes from supportedLanguages
const availableLanguages: SupportedLanguageCode[] = supportedLanguages.map(l => l.code as SupportedLanguageCode);

const DEFAULT_SETTINGS = {
  theme: 'system' as Theme,
  language: 'en' as SupportedLanguageCode,
  defaultModel: 'bs_roformer' as AIModel,
  defaultDjSoftware: 'traktor' as DJSoftware,
  defaultOutputFormat: 'alac' as const,
  outputDirectory: '',
  cpuThreads: 4,
  gpuEnabled: true,
  maxParallelJobs: 1,
  exportPresets: [] as ExportPreset[],
  hasSeenFirstRun: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'stemgen-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export { supportedLanguages };
