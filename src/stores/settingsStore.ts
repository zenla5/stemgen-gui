import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIModel, DJSoftware } from '@/lib/types';
import type { Theme } from '@/lib/types';

export type ExportPreset = {
  id: string;
  name: string;
  model: AIModel;
  djSoftware: DJSoftware;
  outputFormat: 'alac' | 'aac';
  qualityPreset: 'draft' | 'standard' | 'master';
};

interface SettingsState {
  // Theme
  theme: Theme;
  
  // Language
  language: string;
  
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
  
  // Reset
  resetSettings: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'system' as Theme,
  language: 'en',
  defaultModel: 'bs_roformer' as AIModel,
  defaultDjSoftware: 'traktor' as DJSoftware,
  defaultOutputFormat: 'alac' as const,
  outputDirectory: '',
  cpuThreads: 4,
  gpuEnabled: true,
  maxParallelJobs: 1,
  exportPresets: [] as ExportPreset[],
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
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
      
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'stemgen-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
