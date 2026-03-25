import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Theme, ExportPreset } from '@/lib/types';
import { DEFAULT_PROCESSING_SETTINGS } from '@/lib/constants';

interface SettingsState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  
  // Language
  language: string;
  setLanguage: (language: string) => void;
  
  // Export presets
  exportPresets: ExportPreset[];
  addExportPreset: (preset: ExportPreset) => void;
  updateExportPreset: (id: string, updates: Partial<ExportPreset>) => void;
  removeExportPreset: (id: string) => void;
  
  // Output directory
  outputDirectory: string;
  setOutputDirectory: (dir: string) => void;
  
  // Parallel jobs
  maxParallelJobs: number;
  setMaxParallelJobs: (max: number) => void;
  
  // Notifications
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  
  // Auto-update
  autoUpdateEnabled: boolean;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  
  // Inference API keys
  replicateApiKey: string;
  setReplicateApiKey: (key: string) => void;
  modalApiKey: string;
  setModalApiKey: (key: string) => void;
  runpodApiKey: string;
  setRunpodApiKey: (key: string) => void;
  
  // Reset
  resetAllSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'system',
      language: 'en',
      exportPresets: [],
      outputDirectory: '',
      maxParallelJobs: 2,
      notificationsEnabled: true,
      autoUpdateEnabled: true,
      replicateApiKey: '',
      modalApiKey: '',
      runpodApiKey: '',
      
      // Theme actions
      setTheme: (theme) => set({ theme }),
      
      // Language actions
      setLanguage: (language) => set({ language }),
      
      // Export preset actions
      addExportPreset: (preset) => {
        set((state) => ({
          exportPresets: [...state.exportPresets, preset],
        }));
      },
      
      updateExportPreset: (id, updates) => {
        set((state) => ({
          exportPresets: state.exportPresets.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removeExportPreset: (id) => {
        set((state) => ({
          exportPresets: state.exportPresets.filter((p) => p.id !== id),
        }));
      },
      
      // Output directory
      setOutputDirectory: (dir) => set({ outputDirectory: dir }),
      
      // Parallel jobs
      setMaxParallelJobs: (max) => set({ maxParallelJobs: Math.max(1, Math.min(max, 4)) }),
      
      // Notifications
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      
      // Auto-update
      setAutoUpdateEnabled: (enabled) => set({ autoUpdateEnabled: enabled }),
      
      // API keys
      setReplicateApiKey: (key) => set({ replicateApiKey: key }),
      setModalApiKey: (key) => set({ modalApiKey: key }),
      setRunpodApiKey: (key) => set({ runpodApiKey: key }),
      
      // Reset
      resetAllSettings: () =>
        set({
          theme: 'system',
          language: 'en',
          exportPresets: [],
          outputDirectory: '',
          maxParallelJobs: 2,
          notificationsEnabled: true,
          autoUpdateEnabled: true,
          replicateApiKey: '',
          modalApiKey: '',
          runpodApiKey: '',
        }),
    }),
    {
      name: 'stemgen-settings-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        exportPresets: state.exportPresets,
        outputDirectory: state.outputDirectory,
        maxParallelJobs: state.maxParallelJobs,
        notificationsEnabled: state.notificationsEnabled,
        autoUpdateEnabled: state.autoUpdateEnabled,
      }),
    }
  )
);
