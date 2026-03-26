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
  StemInfo,
  PackStemsResponse,
} from '@/lib/types';
import { DEFAULT_PROCESSING_SETTINGS, STEM_COLORS, STEM_DEFAULT_NAMES } from '@/lib/constants';

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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
  startProcessing: (files: AudioFileMetadata[]) => Promise<void>;
  cancelProcessing: (jobId: string) => Promise<void>;
  
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
      
      // Start processing - creates jobs for selected files
      startProcessing: async (files: AudioFileMetadata[]) => {
        const { settings, addJob, setCurrentJob, setIsProcessing, setActiveView } = get();
        
        if (files.length === 0) return;
        
        setIsProcessing(true);
        
        // Create and process jobs for each file sequentially
        for (const file of files) {
          const job: ProcessingJob = {
            id: generateId(),
            input_path: file.path,
            output_path: file.path.replace(/\.[^.]+$/, '.stem.mp4'),
            status: 'pending',
            progress: 0,
            model: settings.model,
            dj_software: settings.djPreset,
            started_at: new Date().toISOString(),
          };
          
          addJob(job);
          setCurrentJob(job.id);
          
          // Update job status to processing
          get().updateJob(job.id, { status: 'processing' });
          
          try {
            // Call the Tauri backend for stem separation
            const stems = await invoke<StemInfo[]>('start_separation', {
              sourcePath: file.path,
              outputPath: job.output_path,
              settings: {
                model: settings.model,
                device: settings.device,
                output_format: settings.outputFormat,
                quality_preset: settings.qualityPreset,
                dj_preset: settings.djPreset,
              },
            });
            
            // Update currentStems with the real file paths from the backend
            if (stems && stems.length > 0) {
              const stemMap = new Map(stems.map(s => [s.stem_type.toLowerCase(), s]));
              const updatedStems = get().currentStems.map(stem => {
                const stemInfo = stemMap.get(stem.type);
                return stemInfo?.file_path
                  ? { ...stem, file_path: stemInfo.file_path }
                  : stem;
              });
              set({ currentStems: updatedStems });
              
              // Navigate to mixer for preview
              setActiveView('mixer');
            }
            
            // Pack stems into .stem.mp4
            const masterPath = file.path;
            const stemPaths = stems.map(s => ({
              stem_type: s.stem_type,
              path: s.file_path || '',
            })).filter(s => s.path);
            
            if (stemPaths.length > 0) {
              get().updateJob(job.id, { progress: 0.8 });
              
              await invoke<PackStemsResponse>('pack_stems', {
                request: {
                  master_path: masterPath,
                  stem_paths: stemPaths,
                  output_path: job.output_path,
                  dj_software: settings.djPreset,
                  output_format: settings.outputFormat,
                },
              });
            }
            
            // Add to processing history
            try {
              await invoke('add_to_history', {
                entry: {
                  id: job.id,
                  source_path: file.path,
                  output_path: job.output_path,
                  model: settings.model,
                  dj_preset: settings.djPreset,
                  processed_at: new Date().toISOString(),
                  duration_ms: 0,
                  file_size: file.size,
                },
              });
            } catch (historyError) {
              console.warn('Failed to add to history:', historyError);
            }
            
            // Job completed successfully
            get().updateJob(job.id, {
              status: 'completed',
              progress: 1,
              completed_at: new Date().toISOString(),
            });
          } catch (error) {
            // Job failed
            get().updateJob(job.id, {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        
        setIsProcessing(false);
      },
      
      // Cancel a processing job
      cancelProcessing: async (jobId: string) => {
        try {
          await invoke('cancel_separation', { jobId });
          get().updateJob(jobId, { status: 'cancelled' });
        } catch (error) {
          console.error('Failed to cancel job:', error);
        }
      },
      
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
