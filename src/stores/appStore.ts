import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type {
  AudioFileMetadata,
  ProcessingJob,
  DependencyStatus,
  CheckDependenciesResult,
  ProcessingSettings,
  Stem,
} from '@/lib/types';
import { DEFAULT_PROCESSING_SETTINGS, STEM_COLORS, STEM_DEFAULT_NAMES } from '@/lib/constants';

interface AppState {
  // Audio files
  audioFiles: AudioFileMetadata[];
  selectedFile: AudioFileMetadata | null;
  
  // Processing jobs
  jobs: ProcessingJob[];
  currentJobId: string | null;
  isProcessing: boolean;
  
  // Stems
  currentStems: Stem[];
  
  // Dependencies
  dependencies: DependencyStatus;
  dependenciesChecked: boolean;
  
  // Settings
  settings: ProcessingSettings;
  
  // UI state
  sidebarCollapsed: boolean;
  activeView: 'files' | 'queue' | 'mixer' | 'settings';
  
  // Actions
  addFiles: (files: AudioFileMetadata[]) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
  selectFile: (file: AudioFileMetadata | null) => void;
  
  // Job actions
  addJob: (job: ProcessingJob) => void;
  updateJob: (id: string, updates: Partial<ProcessingJob>) => void;
  removeJob: (id: string) => void;
  clearJobs: () => void;
  setCurrentJob: (id: string | null) => void;
  setIsProcessing: (processing: boolean) => void;
  
  // Stem actions
  setCurrentStems: (stems: Stem[]) => void;
  updateStem: (id: string, updates: Partial<Stem>) => void;
  resetStemMixer: () => void;
  
  // Dependency actions
  checkDependencies: () => Promise<void>;
  
  // Settings actions
  updateSettings: (settings: Partial<ProcessingSettings>) => void;
  resetSettings: () => void;
  
  // UI actions
  toggleSidebar: () => void;
  setActiveView: (view: AppState['activeView']) => void;
}

// Helper to create default stems
const createDefaultStems = (): Stem[] => {
  return [
    { id: 'drums', type: 'drums', name: STEM_DEFAULT_NAMES.drums, color: STEM_COLORS.drums, volume: 1, muted: false, solo: false },
    { id: 'bass', type: 'bass', name: STEM_DEFAULT_NAMES.bass, color: STEM_COLORS.bass, volume: 1, muted: false, solo: false },
    { id: 'other', type: 'other', name: STEM_DEFAULT_NAMES.other, color: STEM_COLORS.other, volume: 1, muted: false, solo: false },
    { id: 'vocals', type: 'vocals', name: STEM_DEFAULT_NAMES.vocals, color: STEM_COLORS.vocals, volume: 1, muted: false, solo: false },
  ];
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      audioFiles: [],
      selectedFile: null,
      jobs: [],
      currentJobId: null,
      isProcessing: false,
      currentStems: createDefaultStems(),
      dependencies: {
        ffmpeg: false,
        sox: false,
        python: false,
        cuda: false,
        mps: false,
        models: false,
      },
      dependenciesChecked: false,
      settings: DEFAULT_PROCESSING_SETTINGS,
      sidebarCollapsed: false,
      activeView: 'files',
      
      // File actions
      addFiles: (files) => {
        const currentFiles = get().audioFiles;
        const newFiles = files.filter(
          (f) => !currentFiles.some((cf) => cf.path === f.path)
        );
        set({ audioFiles: [...currentFiles, ...newFiles] });
      },
      
      removeFile: (path) => {
        const files = get().audioFiles.filter((f) => f.path !== path);
        const selected = get().selectedFile;
        set({
          audioFiles: files,
          selectedFile: selected?.path === path ? null : selected,
        });
      },
      
      clearFiles: () => set({ audioFiles: [], selectedFile: null }),
      
      selectFile: (file) => set({ selectedFile: file }),
      
      // Job actions
      addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
      
      updateJob: (id, updates) => {
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id ? { ...j, ...updates } : j
          ),
        }));
      },
      
      removeJob: (id) => {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.id !== id),
          currentJobId: state.currentJobId === id ? null : state.currentJobId,
        }));
      },
      
      clearJobs: () => set({ jobs: [], currentJobId: null, isProcessing: false }),
      
      setCurrentJob: (id) => set({ currentJobId: id }),
      
      setIsProcessing: (processing) => set({ isProcessing: processing }),
      
      // Stem actions
      setCurrentStems: (stems) => set({ currentStems: stems }),
      
      updateStem: (id, updates) => {
        set((state) => ({
          currentStems: state.currentStems.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },
      
      resetStemMixer: () => set({ currentStems: createDefaultStems() }),
      
      // Dependency check
      checkDependencies: async () => {
        try {
          const result = await invoke<CheckDependenciesResult>('check_dependencies');
          set({
            dependencies: {
              ffmpeg: result.ffmpeg,
              sox: result.sox,
              python: result.python,
              cuda: result.cuda,
              mps: result.mps,
              models: result.model_count > 0,
            },
            dependenciesChecked: true,
          });
        } catch (error) {
          console.error('Failed to check dependencies:', error);
          set({ dependenciesChecked: true });
        }
      },
      
      // Settings actions
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },
      
      resetSettings: () => set({ settings: DEFAULT_PROCESSING_SETTINGS }),
      
      // UI actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: 'stemgen-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        sidebarCollapsed: state.sidebarCollapsed,
        activeView: state.activeView,
      }),
    }
  )
);
