import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useSettingsStore } from './settingsStore';
import type {
  AudioFileMetadata,
  ProcessingJob,
  DependencyStatus,
  CheckDependenciesResult,
  ProcessingSettings,
  Stem,
  StemInfo,
  PackStemsResponse,
  SidecarStatus,
  EnvironmentValidation,
  InstallManifest,
  AvailableInstaller,
  InstallProgressEvent,
  InstallResult,
  PackageStatus,
} from '@/lib/types';
import { hasPackageStatusKey } from '@/lib/types';

// Fields that should be PackageStatus objects
const PACKAGE_STATUS_FIELDS = [
  'python', 'pytorch', 'torchaudio', 'demucs', 'cuda', 'ffmpeg', 'ffprobe', 'sidecarScript',
] as const;

/**
 * Validate that all PackageStatus fields in an EnvironmentValidation
 * response are valid. Normalizes bare string "available" to object form.
 * Logs warnings for malformed fields.
 */
function validateEnvironmentResponse(data: unknown): EnvironmentValidation {
  if (!data || typeof data !== 'object') {
    console.error('[validateEnvironment] Response is not an object:', typeof data, data);
    return { isReady: false, warnings: ['Invalid environment validation response'] };
  }
  const record = data as Record<string, unknown>;
  for (const field of PACKAGE_STATUS_FIELDS) {
    const val = record[field];
    // Normalize bare string "available" (Rust unit variant) to object form
    if (val === 'available') {
      record[field] = { available: null };
    } else if (val !== undefined && val !== null && !hasPackageStatusKey(val, 'available')
        && !hasPackageStatusKey(val, 'unavailable') && !hasPackageStatusKey(val, 'warning')
        && !hasPackageStatusKey(val, 'missing')) {
      console.error(
        `[validateEnvironment] Malformed PackageStatus for "${field}":`,
        `type=${typeof val}, value=${JSON.stringify(val)}`
      );
    }
  }
  return record as unknown as EnvironmentValidation;
}
import { DEFAULT_PROCESSING_SETTINGS, STEM_COLORS, STEM_DEFAULT_NAMES } from '@/lib/constants';
import { formatJobError } from '@/lib/errorHints';

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
  
  // Batch processing (Phase 5)
  maxParallelJobs: number;
  activeJobCount: number;
  pendingFiles: AudioFileMetadata[];
  
  // Stems
  currentStems: Stem[];
  
  // Dependencies
  dependencies: DependencyStatus;
  dependenciesChecked: boolean;
  
  // Sidecar health (Phase 3)
  sidecarHealth: SidecarStatus | null;
  environmentValidation: EnvironmentValidation | null;
  environmentValidated: boolean;
  environmentValidatedAt: number | null;  // timestamp of last validation
  sidecarDeployed: { success: boolean; path?: string; error?: string | null } | null;

  // Dependency install system
  installManifest: InstallManifest | null;
  activeInstallLines: Record<string, string[]>;  // depName -> output lines
  installResults: Record<string, InstallResult>;  // depName -> result

  // Downloaded models (persisted across restarts)
  downloadedModels: string[];
  
  // Settings
  settings: ProcessingSettings;
  
  // UI state
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  activeView: 'files' | 'queue' | 'mixer' | 'library' | 'settings';
  
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
  cancelAllProcessing: () => Promise<void>;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  
  // Batch processing actions (Phase 5)
  setMaxParallelJobs: (count: number) => void;
  
  // Stem actions
  setCurrentStems: (stems: Stem[]) => void;
  updateStem: (id: string, updates: Partial<Stem>) => void;
  resetStemMixer: () => void;
  
  // Dependency actions
  checkDependencies: () => Promise<void>;
  
  // Sidecar health actions (Phase 3)
  checkSidecarHealth: () => Promise<void>;
  validateEnvironment: () => Promise<void>;

  // Dependency install actions
  fetchInstallManifest: () => Promise<void>;
  getAvailableInstallers: (depName: string) => Promise<AvailableInstaller[]>;
  installDependency: (depName: string, installerId: string) => Promise<InstallResult>;
  cancelInstall: (installId: string) => Promise<void>;
  
  // Settings actions
  updateSettings: (settings: Partial<ProcessingSettings>) => void;
  resetSettings: () => void;
  
  // Downloaded models actions
  setDownloadedModels: (models: string[]) => void;
  addDownloadedModel: (modelId: string) => void;
  removeDownloadedModel: (modelId: string) => void;
  
  // UI actions
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
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

// Process a single job (internal helper)
async function processJob(
  file: AudioFileMetadata,
  job: ProcessingJob,
  settings: ProcessingSettings,
  updateJob: (id: string, updates: Partial<ProcessingJob>) => void,
  setCurrentStems: (stems: Stem[]) => void,
  setActiveView: (view: AppState['activeView']) => void,
): Promise<boolean> {
  updateJob(job.id, { status: 'processing' });

  try {
    // Cloud duration warning check
    const settingsStore = useSettingsStore.getState();
    if (settingsStore.activeProvider !== 'local') {
      const durationMinutes = (file.duration || 0) / 60;
      const warnMinutes = settingsStore.cloudDurationWarnMinutes;
      const hardCapMinutes = settingsStore.cloudDurationHardCapMinutes;

      if (hardCapMinutes !== null && durationMinutes > hardCapMinutes) {
        toast.warning('File too long for cloud processing', {
          description: `This file is ${Math.ceil(durationMinutes)} min long, exceeding the ${hardCapMinutes} min cap. Switching to local.`,
        });
        updateJob(job.id, {
          status: 'failed',
          error: `File duration (${Math.ceil(durationMinutes)} min) exceeds cloud hard cap (${hardCapMinutes} min)`,
        });
        return false;
      }

      if (warnMinutes !== null && durationMinutes > warnMinutes) {
        toast.warning('Long file for cloud processing', {
          description: `This file is ${Math.ceil(durationMinutes)} min long — cloud processing by ${settingsStore.activeProvider} may take a while.`,
        });
      }
    }

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
      const updatedStems = createDefaultStems().map(stem => {
        const stemInfo = stemMap.get(stem.type);
        return stemInfo?.file_path
          ? { ...stem, file_path: stemInfo.file_path }
          : stem;
      });
      setCurrentStems(updatedStems);
      
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
      updateJob(job.id, { progress: 0.8 });

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
    updateJob(job.id, {
      status: 'completed',
      progress: 1,
      completed_at: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const errorMessage = formatJobError(rawMessage);
    // Job failed
    updateJob(job.id, {
      status: 'failed',
      error: errorMessage,
    });

    // Show a persistent toast so the user cannot miss the failure
    const activeProvider = useSettingsStore.getState().activeProvider;
    if (activeProvider !== 'local') {
      toast.error('Cloud inference failed', {
        description: errorMessage,
        action: {
          label: 'Switch to Local',
          onClick: () => {
            useSettingsStore.getState().setActiveProvider('local');
          },
        },
      });
    } else {
      toast.error('Processing failed', {
        description: errorMessage,
      });
    }
    return false;
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      audioFiles: [],
      selectedFile: null,
      jobs: [],
      currentJobId: null,
      isProcessing: false,
      maxParallelJobs: 2,
      activeJobCount: 0,
      pendingFiles: [],
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
      sidecarHealth: null,
      environmentValidation: null,
      environmentValidated: false,
      environmentValidatedAt: null,
      sidecarDeployed: null,
      installManifest: null,
      activeInstallLines: {},
      installResults: {},
      downloadedModels: [],
      settings: DEFAULT_PROCESSING_SETTINGS,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      activeView: 'files',
      
      // File actions
      addFiles: (files) => {
        const currentFiles = get().audioFiles;
        const existingJobs = get().jobs;
        const settings = get().settings;
        const newFiles = files.filter(
          (f) => !currentFiles.some((cf) => cf.path === f.path)
        );
        // Create a pending ProcessingJob for each new file so the queue
        // tab shows items immediately on drop.
        const newJobs: ProcessingJob[] = newFiles
          .filter((f) => !existingJobs.some((j) => j.input_path === f.path))
          .map((file) => ({
            id: generateId(),
            input_path: file.path,
            output_path: file.path.replace(/\.[^.]+$/, '.stem.mp4'),
            status: 'pending' as const,
            progress: 0,
            model: settings.model,
            dj_software: settings.djPreset,
            started_at: new Date().toISOString(),
          }));
        set({
          audioFiles: [...currentFiles, ...newFiles],
          jobs: [...existingJobs, ...newJobs],
        });
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
      
      clearJobs: () => set({ jobs: [], currentJobId: null, isProcessing: false, pendingFiles: [], activeJobCount: 0 }),
      
      setCurrentJob: (id) => set({ currentJobId: id }),
      
      setIsProcessing: (processing) => set({ isProcessing: processing }),
      
      // Batch processing (Phase 5) - parallel job execution
      startProcessing: async (files: AudioFileMetadata[]) => {
        const { settings, setCurrentJob, setIsProcessing, setActiveView, updateJob, setCurrentStems } = get();

        // Re-entrancy guard: prevent duplicate scheduling when already processing
        if (get().isProcessing) return;

        // Pending jobs are created in addFiles on drop — find them instead of
        // creating duplicate jobs.
        const currentJobs = get().jobs;
        const pendingJobPaths = new Set(
          currentJobs.filter(j => j.status === 'pending').map(j => j.input_path)
        );

        // Derive pending files from existing pending jobs (preferred) or
        // fall back to the files argument for backward compat.
        const pendingFiles = files.length > 0
          ? files.filter(f => pendingJobPaths.has(f.path) || !currentJobs.some(j => j.input_path === f.path))
          : [];

        // If no files came in via argument, pull from existing pending jobs
        if (pendingFiles.length === 0 && pendingJobPaths.size > 0) {
          pendingFiles.push(...get().audioFiles.filter(f => pendingJobPaths.has(f.path)));
        }

        if (pendingFiles.length === 0) return;

        setIsProcessing(true);

        // Only create jobs for files that don't already have a pending job
        const newFiles = pendingFiles.filter(f => !pendingJobPaths.has(f.path));
        const newJobs: ProcessingJob[] = newFiles.map((file) => ({
          id: generateId(),
          input_path: file.path,
          output_path: file.path.replace(/\.[^.]+$/, '.stem.mp4'),
          status: 'pending' as const,
          progress: 0,
          model: settings.model,
          dj_software: settings.djPreset,
          started_at: new Date().toISOString(),
        }));

        if (newJobs.length > 0) {
          set((state) => ({
            jobs: [...state.jobs, ...newJobs],
          }));
        }

        set({ pendingFiles });
        
        // Process jobs — single-pass scheduler that reads fresh state each call.
        // Capacity is filled recursively via .finally() → processNextBatch(), so
        // activeJobCount and pendingFiles are never read from a stale snapshot.
        const processNextBatch = async () => {
          const fresh = get();
          if (!fresh.isProcessing) return;

          // Check if all jobs are done
          if (fresh.pendingFiles.length === 0 && fresh.activeJobCount === 0) {
            setIsProcessing(false);
            return;
          }

          // Determine effective max concurrent jobs
          const cloudProvider = useSettingsStore.getState().activeProvider;
          const batchParallel = useSettingsStore.getState().batchParallel;
          const effectiveMaxJobs = cloudProvider !== 'local'
            ? (batchParallel ? fresh.pendingFiles.length : 1)
            : fresh.maxParallelJobs;

          // Single-pass: start at most one new job if capacity is available
          if (fresh.pendingFiles.length > 0 && fresh.activeJobCount < effectiveMaxJobs) {
            const file = fresh.pendingFiles[0];
            const job = fresh.jobs.find(j => j.input_path === file.path && j.status === 'pending');

            if (!job) {
              // Job not found, skip this file and re-check
              set((state) => ({ pendingFiles: state.pendingFiles.slice(1) }));
              processNextBatch();
              return;
            }

            // Pop file from pending, increment active count
            set((state) => ({
              pendingFiles: state.pendingFiles.slice(1),
              activeJobCount: state.activeJobCount + 1,
            }));

            setCurrentJob(job.id);

            // Process job in background, then schedule next
            processJob(file, job, settings, updateJob, setCurrentStems, setActiveView)
              .finally(() => {
                set((state) => ({
                  activeJobCount: Math.max(0, state.activeJobCount - 1),
                }));
                processNextBatch();
              });
          }
        };
        
        // Start processing
        processNextBatch();
      },
      
      // Cancel a processing job
      cancelProcessing: async (jobId: string) => {
        const job = get().jobs.find(j => j.id === jobId);
        if (!job) return;
        
        // If pending, remove from pending files
        if (job.status === 'pending') {
          set((state) => ({
            pendingFiles: state.pendingFiles.filter(f => f.path !== job.input_path),
          }));
        }
        
        try {
          await invoke('cancel_separation', { jobId });
        } catch (error) {
          console.error('Failed to cancel job:', error);
        }
        
        get().updateJob(jobId, { status: 'cancelled' });
        
        // Decrement active count if was processing
        const currentJob = get().jobs.find(j => j.id === jobId);
        if (currentJob?.status === 'processing') {
          set((state) => ({
            activeJobCount: Math.max(0, state.activeJobCount - 1),
          }));
        }
      },
      
      // Cancel all processing
      cancelAllProcessing: async () => {
        const { jobs, pendingFiles, isProcessing } = get();
        
        if (!isProcessing) return;
        
        // Cancel all pending jobs
        for (const file of pendingFiles) {
          const job = jobs.find(j => j.input_path === file.path && j.status === 'pending');
          if (job) {
            get().updateJob(job.id, { status: 'cancelled' });
          }
        }
        
        // Cancel currently processing jobs
        for (const job of jobs) {
          if (job.status === 'processing') {
            try {
              await invoke('cancel_separation', { jobId: job.id });
            } catch (error) {
              console.error('Failed to cancel job:', error);
            }
            get().updateJob(job.id, { status: 'cancelled' });
          }
        }
        
        set({ 
          isProcessing: false, 
          pendingFiles: [], 
          activeJobCount: 0 
        });
      },
      
      // Pause processing (stops starting new jobs but continues current ones)
      pauseProcessing: () => {
        set({ isProcessing: false });
      },
      
      // Resume processing
      resumeProcessing: () => {
        const { pendingFiles } = get();
        if (pendingFiles.length > 0) {
          set({ isProcessing: true });
          // Trigger next batch processing
          get().startProcessing([]);
        }
      },
      
      // Batch processing config (Phase 5)
      setMaxParallelJobs: (count) => {
        const clampedCount = Math.max(1, Math.min(4, count));
        set({ maxParallelJobs: clampedCount });
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
      
      // Sidecar health check (Phase 3)
      checkSidecarHealth: async () => {
        try {
          const health = await invoke<SidecarStatus>('get_sidecar_status');
          set({ sidecarHealth: health });
        } catch (error) {
          console.error('Failed to check sidecar health:', error);
          set({ 
            sidecarHealth: {
              isHealthy: false,
              pythonFound: false,
              modelDirectory: '',
              modelCount: 0,
              errors: [error instanceof Error ? error.message : String(error)],
              gpuAvailable: false,
              demucsAvailable: false,
              bsRoformerAvailable: false,
              sidecarScriptFound: false,
            }
          });
        }
      },
      
      // Environment validation
      validateEnvironment: async () => {
        // Skip if cached result is fresh (< 30 seconds)
        const now = Date.now();
        const cached = get().environmentValidatedAt;
        if (cached && (now - cached) < 30_000 && get().environmentValidated) {
          return;
        }
        try {
          const raw = await invoke<unknown>('validate_environment');
          const validation = validateEnvironmentResponse(raw);
          set({ environmentValidation: validation, environmentValidated: true, environmentValidatedAt: now });
        } catch (error) {
          console.error('Failed to validate environment:', error);
          set({
            environmentValidation: {
              isReady: false,
              warnings: [error instanceof Error ? error.message : String(error)],
            },
            environmentValidated: true,
            environmentValidatedAt: now,
          });
        }
      },

      // Dependency install actions
      fetchInstallManifest: async () => {
        try {
          const manifest = await invoke<InstallManifest>('get_install_manifest');
          set({ installManifest: manifest });
        } catch (error) {
          console.error('Failed to fetch install manifest:', error);
        }
      },

      getAvailableInstallers: async (depName: string) => {
        try {
          return await invoke<AvailableInstaller[]>('get_available_installers', { depName });
        } catch (error) {
          console.error(`Failed to get installers for ${depName}:`, error);
          return [];
        }
      },

      installDependency: async (depName: string, installerId: string) => {
        // Listen for progress events
        const unlisten = await listen<InstallProgressEvent>('install-progress', (event) => {
          const { depName: eventDep, line } = event.payload;
          if (eventDep === depName) {
            set((state) => ({
              activeInstallLines: {
                ...state.activeInstallLines,
                [depName]: [...(state.activeInstallLines[depName] || []), line],
              },
            }));
          }
        });

        try {
          // Clear previous output
          set((state) => ({
            activeInstallLines: { ...state.activeInstallLines, [depName]: [] },
          }));

          const result = await invoke<InstallResult>('install_dependency', { depName, installerId });

          set((state) => ({
            installResults: { ...state.installResults, [depName]: result },
          }));

          // Re-validate environment after install (invalidate cache first)
          set({ environmentValidatedAt: null });
          const { validateEnvironment } = get();
          await validateEnvironment();

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorResult: InstallResult = {
            success: false,
            depName,
            installerId,
            alreadyInstalled: false,
            exitCode: null,
            output: [],
            error: errorMessage,
          };
          set((state) => ({
            installResults: { ...state.installResults, [depName]: errorResult },
          }));
          throw error;
        } finally {
          unlisten();
        }
      },

      cancelInstall: async (installId: string) => {
        try {
          await invoke('cancel_install', { installId });
        } catch (error) {
          console.error('Failed to cancel install:', error);
        }
      },

      // Settings actions
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },
      
      resetSettings: () => set({ settings: DEFAULT_PROCESSING_SETTINGS }),
      
      // Downloaded models actions
      setDownloadedModels: (models) => set({ downloadedModels: models }),
      addDownloadedModel: (modelId) => {
        set((state) => ({
          downloadedModels: state.downloadedModels.includes(modelId)
            ? state.downloadedModels
            : [...state.downloadedModels, modelId],
        }));
      },
      removeDownloadedModel: (modelId) => {
        set((state) => ({
          downloadedModels: state.downloadedModels.filter((id) => id !== modelId),
        }));
      },
      
      // UI actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
      
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: 'stemgen-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        sidebarCollapsed: state.sidebarCollapsed,
        activeView: state.activeView,
        maxParallelJobs: state.maxParallelJobs,
        environmentValidatedAt: state.environmentValidatedAt,
        downloadedModels: state.downloadedModels,
      }),
    }
  )
);

// Listen for sidecar deployment events from the backend (lazy init to avoid mock ordering issues in tests)
let _sidecarListenerInitialized = false;
function initSidecarListener() {
  if (_sidecarListenerInitialized) return;
  _sidecarListenerInitialized = true;
  try {
    const result = listen<{ success: boolean; path: string; error: string | null }>('sidecar-deployed', (event) => {
      useAppStore.setState({ sidecarDeployed: event.payload });
    });
    if (result && typeof result.catch === 'function') {
      result.catch((err: unknown) => {
        console.warn('Failed to set up sidecar-deployed listener:', err);
      });
    }
  } catch {
    // In test environments, listen may not be properly set up
  }
}
// Initialize on first use in browser; in tests this may never be called
if (typeof window !== 'undefined') {
  initSidecarListener();
}

/**
 * Single source of truth for environment readiness.
 * Consumes only environmentValidation (the richer, canonical data source).
 * Returns a structured object used by both summary cards and the footer.
 */
/**
 * Selector hook for accessing downloaded models from appStore.
 */
export const useDownloadedModels = () => useAppStore((state) => state.downloadedModels);

export function computeEnvironmentReadiness(v: EnvironmentValidation | null): {
  pythonOk: boolean;
  pytorchOk: boolean;
  gpuStatus: 'cuda' | 'cpu' | 'unknown';
  demucsOk: boolean;
  ffmpegOk: boolean;
  ffprobeOk: boolean;
  sidecarOk: boolean;
  isReady: boolean;
} {
  if (!v) {
    return {
      pythonOk: false, pytorchOk: false, gpuStatus: 'unknown',
      demucsOk: false, ffmpegOk: false, ffprobeOk: false,
      sidecarOk: false, isReady: false,
    };
  }

  const ok = (s?: PackageStatus | null) => hasPackageStatusKey(s, 'available');

  const gpuStatus: 'cuda' | 'cpu' | 'unknown' =
    hasPackageStatusKey(v.cuda, 'available') ? 'cuda' :
    ok(v.python) && v.pythonVersion ? 'cpu' :
    'unknown';

  return {
    pythonOk:   ok(v.python),
    pytorchOk:  ok(v.pytorch),
    gpuStatus,
    demucsOk:   ok(v.demucs),
    ffmpegOk:   ok(v.ffmpeg),
    ffprobeOk:  ok(v.ffprobe),
    sidecarOk:  ok(v.sidecarScript),
    isReady:    v.isReady,
  };
}
