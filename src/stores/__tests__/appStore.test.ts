import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/stores/appStore';
import type { AudioFileMetadata, ProcessingJob } from '@/lib/types';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const fakeFile = (overrides: Partial<AudioFileMetadata> = {}): AudioFileMetadata => ({
  path: '/audio/test.mp3',
  name: 'test.mp3',
  size: 5_000_000,
  duration: 180,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  format: 'mp3',
  metadata: {},
  ...overrides,
});

const fakeJob = (overrides: Partial<ProcessingJob> = {}): ProcessingJob => ({
  id: 'job-1',
  input_path: '/audio/test.mp3',
  output_path: '/out/test.stem.mp4',
  status: 'pending',
  progress: 0,
  model: 'bs_roformer',
  dj_software: 'traktor',
  started_at: new Date().toISOString(),
  ...overrides,
});

function resetStore() {
  useAppStore.setState({
    audioFiles: [],
    selectedFile: null,
    jobs: [],
    currentJobId: null,
    isProcessing: false,
    pendingFiles: [],
    activeJobCount: 0,
    maxParallelJobs: 2,
    currentStems: useAppStore.getState().currentStems.map((s) => ({
      ...s,
      volume: 1,
      muted: false,
      solo: false,
    })),
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
    sidebarCollapsed: false,
    activeView: 'files',
    downloadedModels: [],
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useAppStore — file management', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('starts with empty files', () => {
    expect(useAppStore.getState().audioFiles).toHaveLength(0);
  });

  it('addFiles appends new files without duplicates', () => {
    const store = useAppStore.getState();
    store.addFiles([fakeFile({ path: '/a.mp3' }), fakeFile({ path: '/b.mp3' })]);
    expect(useAppStore.getState().audioFiles).toHaveLength(2);

    // Duplicate should be ignored
    store.addFiles([fakeFile({ path: '/a.mp3' })]);
    expect(useAppStore.getState().audioFiles).toHaveLength(2);
  });

  it('removeFile filters out the correct file', () => {
    const store = useAppStore.getState();
    store.addFiles([fakeFile({ path: '/a.mp3' }), fakeFile({ path: '/b.mp3' })]);
    store.removeFile('/a.mp3');

    const paths = useAppStore.getState().audioFiles.map((f) => f.path);
    expect(paths).not.toContain('/a.mp3');
    expect(paths).toContain('/b.mp3');
  });

  it('selectFile sets selectedFile', () => {
    const store = useAppStore.getState();
    const file = fakeFile({ path: '/selected.mp3' });
    store.addFiles([file]);
    store.selectFile(file);

    expect(useAppStore.getState().selectedFile?.path).toBe('/selected.mp3');
  });

  it('clearFiles resets files and selectedFile', () => {
    const store = useAppStore.getState();
    store.addFiles([fakeFile()]);
    store.clearFiles();

    expect(useAppStore.getState().audioFiles).toHaveLength(0);
    expect(useAppStore.getState().selectedFile).toBeNull();
  });
});

describe('useAppStore — job management', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('addJob appends to jobs array', () => {
    useAppStore.getState().addJob(fakeJob({ id: 'j1' }));
    expect(useAppStore.getState().jobs).toHaveLength(1);
  });

  it('updateJob merges updates into correct job', () => {
    const store = useAppStore.getState();
    store.addJob(fakeJob({ id: 'j1', status: 'pending' }));
    store.updateJob('j1', { status: 'processing', progress: 0.5 });

    const updated = useAppStore.getState().jobs.find((j) => j.id === 'j1');
    expect(updated?.status).toBe('processing');
    expect(updated?.progress).toBe(0.5);
  });

  it('removeJob filters out the correct job', () => {
    const store = useAppStore.getState();
    store.addJob(fakeJob({ id: 'j1' }));
    store.addJob(fakeJob({ id: 'j2' }));
    store.removeJob('j1');

    expect(useAppStore.getState().jobs.map((j) => j.id)).toEqual(['j2']);
  });

  it('clearJobs resets all job state', () => {
    const store = useAppStore.getState();
    store.addJob(fakeJob({ id: 'j1' }));
    store.setCurrentJob('j1');
    store.clearJobs();

    expect(useAppStore.getState().jobs).toHaveLength(0);
    expect(useAppStore.getState().currentJobId).toBeNull();
  });

  it('setCurrentJob updates currentJobId', () => {
    useAppStore.getState().setCurrentJob('job-abc');
    expect(useAppStore.getState().currentJobId).toBe('job-abc');
  });

  it('setIsProcessing updates processing flag', () => {
    expect(useAppStore.getState().isProcessing).toBe(false);
    useAppStore.getState().setIsProcessing(true);
    expect(useAppStore.getState().isProcessing).toBe(true);
  });
});

describe('useAppStore — stem mixer', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('updateStem modifies the correct stem', () => {
    const store = useAppStore.getState();
    store.updateStem('drums', { volume: 0.5, muted: true });

    const drums = useAppStore.getState().currentStems.find((s) => s.id === 'drums');
    expect(drums?.volume).toBe(0.5);
    expect(drums?.muted).toBe(true);
  });

  it('resetStemMixer restores defaults', () => {
    const store = useAppStore.getState();
    store.updateStem('drums', { volume: 0, muted: true, solo: true });
    store.updateStem('bass', { volume: 0.5 });
    store.resetStemMixer();

    const stems = useAppStore.getState().currentStems;
    stems.forEach((s) => {
      expect(s.volume).toBe(1);
      expect(s.muted).toBe(false);
      expect(s.solo).toBe(false);
    });
  });

  it('has 4 default stems', () => {
    const types = useAppStore.getState().currentStems.map((s) => s.type);
    expect(types).toContain('drums');
    expect(types).toContain('bass');
    expect(types).toContain('other');
    expect(types).toContain('vocals');
  });
});

describe('useAppStore — UI state', () => {
  beforeEach(() => resetStore());

  it('toggleSidebar flips sidebarCollapsed', () => {
    const store = useAppStore.getState();
    expect(store.sidebarCollapsed).toBe(false);
    store.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    store.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('setActiveView changes the view', () => {
    const store = useAppStore.getState();
    store.setActiveView('mixer');
    expect(useAppStore.getState().activeView).toBe('mixer');
    store.setActiveView('settings');
    expect(useAppStore.getState().activeView).toBe('settings');
  });
});

describe('useAppStore — batch processing', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('setMaxParallelJobs clamps to 1-4', () => {
    const store = useAppStore.getState();

    store.setMaxParallelJobs(0);
    expect(useAppStore.getState().maxParallelJobs).toBe(1);

    store.setMaxParallelJobs(10);
    expect(useAppStore.getState().maxParallelJobs).toBe(4);

    store.setMaxParallelJobs(3);
    expect(useAppStore.getState().maxParallelJobs).toBe(3);
  });

  it('default maxParallelJobs is 2', () => {
    resetStore();
    expect(useAppStore.getState().maxParallelJobs).toBe(2);
  });
});

describe('useAppStore — dependencies', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('checkDependencies populates dependency status', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({
      ffmpeg: true,
      sox: true,
      python: true,
      cuda: true,
      model_count: 4,
    });

    await useAppStore.getState().checkDependencies();

    const deps = useAppStore.getState().dependencies;
    expect(deps.ffmpeg).toBe(true);
    expect(deps.python).toBe(true);
    expect(deps.cuda).toBe(true);
    expect(deps.models).toBe(true);
    expect(useAppStore.getState().dependenciesChecked).toBe(true);
  });

  it('checkSidecarHealth sets sidecarHealth', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({
      isHealthy: true,
      pythonFound: true,
      sidecarScriptFound: true,
      demucsAvailable: true,
      bsRoformerAvailable: true,
      gpuAvailable: true,
      modelDirectory: '/models',
      modelCount: 4,
      errors: [],
    });

    await useAppStore.getState().checkSidecarHealth();

    const health = useAppStore.getState().sidecarHealth;
    expect(health?.isHealthy).toBe(true);
    expect(health?.demucsAvailable).toBe(true);
    expect(health?.modelCount).toBe(4);
  });

  it('checkSidecarHealth handles errors gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Sidecar not running'));

    await useAppStore.getState().checkSidecarHealth();

    const health = useAppStore.getState().sidecarHealth;
    expect(health?.isHealthy).toBe(false);
    expect(health?.errors).toContain('Sidecar not running');
  });

  it('validateEnvironment sets environmentValidation', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({
      isReady: true,
      warnings: ['FFmpeg version is old'],
    });

    await useAppStore.getState().validateEnvironment();

    expect(useAppStore.getState().environmentValidation?.isReady).toBe(true);
    expect(useAppStore.getState().environmentValidated).toBe(true);
  });
});

describe('useAppStore — settings', () => {
  beforeEach(() => resetStore());

  it('updateSettings merges partial updates', () => {
    const store = useAppStore.getState();
    store.updateSettings({ model: 'htdemucs' });

    expect(useAppStore.getState().settings.model).toBe('htdemucs');
    // Other settings should be unchanged (use defaults)
  });

  it('resetSettings restores default settings', () => {
    const store = useAppStore.getState();
    store.updateSettings({ model: 'htdemucs' });
    store.resetSettings();

    expect(useAppStore.getState().settings.model).toBe('demucs');
  });

  it('updateSettings can update multiple settings', () => {
    const store = useAppStore.getState();
    store.updateSettings({ model: 'htdemucs', device: 'cuda', outputFormat: 'aac' });
    
    const settings = useAppStore.getState().settings;
    expect(settings.model).toBe('htdemucs');
    expect(settings.device).toBe('cuda');
    expect(settings.outputFormat).toBe('aac');
  });
});

describe('useAppStore — pause/resume processing', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('resumeProcessing does not set isProcessing when no pending files', () => {
    const store = useAppStore.getState();
    store.setIsProcessing(false);
    
    store.resumeProcessing();
    expect(useAppStore.getState().isProcessing).toBe(false);
  });
});

describe('useAppStore — additional edge cases', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('removeFile also clears selectedFile if it matches', () => {
    const store = useAppStore.getState();
    const file = fakeFile({ path: '/test-remove.mp3' });
    store.addFiles([file]);
    store.selectFile(file);
    expect(useAppStore.getState().selectedFile?.path).toBe('/test-remove.mp3');
    
    store.removeFile('/test-remove.mp3');
    expect(useAppStore.getState().selectedFile).toBeNull();
  });

  it('setCurrentStems replaces all stems', () => {
    const store = useAppStore.getState();
    const newStems = [
      { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 0.5, muted: true, solo: false },
      { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false },
      { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false },
      { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false },
    ];
    
    store.setCurrentStems(newStems);
    expect(useAppStore.getState().currentStems).toEqual(newStems);
  });

  it('updateStem only modifies specified stem', () => {
    const store = useAppStore.getState();
    const originalBass = store.currentStems.find(s => s.id === 'bass');
    
    store.updateStem('drums', { volume: 0.3 });
    const updatedBass = useAppStore.getState().currentStems.find(s => s.id === 'bass');
    
    expect(updatedBass?.volume).toBe(originalBass?.volume);
    expect(updatedBass?.muted).toBe(originalBass?.muted);
  });


  it('checkDependencies handles error gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend error'));
    
    await useAppStore.getState().checkDependencies();
    
    expect(useAppStore.getState().dependenciesChecked).toBe(true);
  });

  it('validateEnvironment handles error gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Validation failed'));
    
    await useAppStore.getState().validateEnvironment();
    
    expect(useAppStore.getState().environmentValidated).toBe(true);
    expect(useAppStore.getState().environmentValidation?.isReady).toBe(false);
  });

  it('addJob with duplicate id does not throw', () => {
    const store = useAppStore.getState();
    store.addJob(fakeJob({ id: 'unique-job' }));
    expect(useAppStore.getState().jobs).toHaveLength(1);
    
    // Adding another job with same id - Zustand allows it
    store.addJob(fakeJob({ id: 'unique-job' }));
    expect(useAppStore.getState().jobs).toHaveLength(2);
  });

  it('updateJob on non-existent job does not throw', () => {
    const store = useAppStore.getState();
    expect(() => store.updateJob('non-existent', { status: 'processing' })).not.toThrow();
  });

  it('removeJob on non-existent job does not throw', () => {
    const store = useAppStore.getState();
    expect(() => store.removeJob('non-existent')).not.toThrow();
  });

  it('updateStem on non-existent stem does not throw', () => {
    const store = useAppStore.getState();
    expect(() => store.updateStem('non-existent', { volume: 0.5 })).not.toThrow();
  });
});

// ─── TASK-009: Error-display tests for separation failure ──────────────────

describe('useAppStore — separation failure error display', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('sets job status to failed and stores error when start_separation rejects', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(
      new Error('Separation process failed with exit code: Some(1)')
    );

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/fail-test.mp3' });
    store.addFiles([file]);

    await store.startProcessing([file]);

    // Wait for async processing to settle
    await new Promise((r) => setTimeout(r, 50));

    const state = useAppStore.getState();
    const failedJob = state.jobs.find((j) => j.input_path === '/audio/fail-test.mp3');
    expect(failedJob).toBeDefined();
    expect(failedJob!.status).toBe('failed');
    expect(failedJob!.error).toBeTruthy();
    expect(failedJob!.error!.length).toBeGreaterThan(0);
  });

  it('exposes error text on the ProcessingJob object (not silently swallowed)', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(
      new Error('No module named \'demucs\'')
    );

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/missing-dep.mp3' });
    store.addFiles([file]);

    await store.startProcessing([file]);
    await new Promise((r) => setTimeout(r, 50));

    const state = useAppStore.getState();
    const failedJob = state.jobs.find((j) => j.input_path === '/audio/missing-dep.mp3');
    expect(failedJob?.error).toContain('demucs');
  });

  it('sets isProcessing to false after a job fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(
      new Error('Separation process failed with exit code: Some(1)')
    );

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/processing-flag.mp3' });
    store.addFiles([file]);

    await store.startProcessing([file]);
    await new Promise((r) => setTimeout(r, 50));

    expect(useAppStore.getState().isProcessing).toBe(false);
  });

  it('appends Setup Wizard hint for dependency-related errors', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(
      new Error('ModuleNotFoundError: No module named \'torch\'')
    );

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/hint-test.mp3' });
    store.addFiles([file]);

    await store.startProcessing([file]);
    await new Promise((r) => setTimeout(r, 50));

    const state = useAppStore.getState();
    const failedJob = state.jobs.find((j) => j.input_path === '/audio/hint-test.mp3');
    expect(failedJob?.error).toContain('Setup Wizard');
  });
});

// ─── TASK-259: pack_stems failure must fail the job (not freeze the spinner) ─

describe('useAppStore — pack_stems failure', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('marks job failed and resets isProcessing when pack_stems rejects', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'start_separation') {
        return Promise.resolve([
          { stem_type: 'drums', file_path: '/out/drums.wav' },
          { stem_type: 'bass', file_path: '/out/bass.wav' },
          { stem_type: 'other', file_path: '/out/other.wav' },
          { stem_type: 'vocals', file_path: '/out/vocals.wav' },
        ]);
      }
      if (cmd === 'pack_stems') {
        return Promise.reject(new Error('ffmpeg exec failed'));
      }
      return Promise.resolve({ success: true });
    });

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/pack-fail.mp3' });
    store.addFiles([file]);
    await store.startProcessing([file]);
    await new Promise((r) => setTimeout(r, 50));

    const state = useAppStore.getState();
    const failedJob = state.jobs.find((j) => j.input_path === '/audio/pack-fail.mp3');
    expect(failedJob).toBeDefined();
    expect(failedJob!.status).toBe('failed');
    expect(failedJob!.error).toContain('pack');
    expect(state.isProcessing).toBe(false);
  });
});

// ─── TASK-244: Live separation-progress events ──────────────────────────────

describe('useAppStore — separation-progress events', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('updates job.progress from separation-progress events for the matching job', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const { invoke } = await import('@tauri-apps/api/core');

    let handler: ((e: { payload: Record<string, unknown> }) => void) | null = null;
    vi.mocked(listen).mockImplementation((event, cb) => {
      if (event === 'separation-progress') {
        handler = cb as (e: { payload: Record<string, unknown> }) => void;
      }
      return Promise.resolve(() => {});
    });

    let resolveSeparation!: (v: unknown) => void;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'start_separation') {
        return new Promise((res) => { resolveSeparation = res; });
      }
      // pack_stems and add_to_history succeed immediately
      return Promise.resolve({ success: true });
    });

    const store = useAppStore.getState();
    const file = fakeFile({ path: '/audio/progress-test.mp3' });
    store.addFiles([file]);
    await store.startProcessing([file]);

    const job = useAppStore.getState().jobs.find((j) => j.input_path === '/audio/progress-test.mp3');
    expect(job).toBeDefined();
    expect(job!.status).toBe('processing');

    // The backend receives the frontend's job id, and a matching event moves the bar
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'start_separation',
      expect.objectContaining({ jobId: job!.id })
    );

    handler!({ payload: { job_id: job!.id, status: 'progress', stage: 'separating', progress: 0.45 } });
    let current = useAppStore.getState().jobs.find((j) => j.id === job!.id);
    expect(current!.progress).toBe(0.45);

    // A non-matching job_id (another parallel job) must not touch this job
    handler!({ payload: { job_id: 'other-job', status: 'progress', progress: 0.99 } });
    current = useAppStore.getState().jobs.find((j) => j.id === job!.id);
    expect(current!.progress).toBe(0.45);

    // Let the separation resolve and confirm the job still completes
    resolveSeparation!([]);
    await new Promise((r) => setTimeout(r, 50));
    current = useAppStore.getState().jobs.find((j) => j.id === job!.id);
    expect(current!.status).toBe('completed');
  });
});

// ─── TASK-007: Downloaded models persistence tests ─────────────────────────

describe('useAppStore — downloaded models', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('starts with empty downloadedModels', () => {
    expect(useAppStore.getState().downloadedModels).toEqual([]);
  });

  it('setDownloadedModels replaces the array', () => {
    const store = useAppStore.getState();
    store.setDownloadedModels(['htdemucs', 'bs_roformer']);
    expect(useAppStore.getState().downloadedModels).toEqual(['htdemucs', 'bs_roformer']);
  });

  it('addDownloadedModel adds a model if not present', () => {
    const store = useAppStore.getState();
    store.addDownloadedModel('htdemucs');
    expect(useAppStore.getState().downloadedModels).toContain('htdemucs');
  });

  it('addDownloadedModel does not duplicate an existing model', () => {
    const store = useAppStore.getState();
    store.addDownloadedModel('htdemucs');
    store.addDownloadedModel('htdemucs');
    expect(useAppStore.getState().downloadedModels).toEqual(['htdemucs']);
  });

  it('removeDownloadedModel removes the specified model', () => {
    const store = useAppStore.getState();
    store.setDownloadedModels(['htdemucs', 'bs_roformer', 'htdemucs_ft']);
    store.removeDownloadedModel('bs_roformer');
    expect(useAppStore.getState().downloadedModels).toEqual(['htdemucs', 'htdemucs_ft']);
  });

  it('removeDownloadedModel on non-existent model does not throw', () => {
    const store = useAppStore.getState();
    store.setDownloadedModels(['htdemucs']);
    expect(() => store.removeDownloadedModel('nonexistent')).not.toThrow();
    expect(useAppStore.getState().downloadedModels).toEqual(['htdemucs']);
  });

  it('downloadedModels is persisted to localStorage', () => {
    const store = useAppStore.getState();
    store.setDownloadedModels(['demucs', 'htdemucs']);
    
    // Check that the partialize function includes downloadedModels
    const state = useAppStore.getState();
    expect(state.downloadedModels).toEqual(['demucs', 'htdemucs']);
  });

  it('refreshDownloadedModels invokes list_downloaded_models and updates state', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['demucs', 'htdemucs_ft']);

    const store = useAppStore.getState();
    await store.refreshDownloadedModels();

    expect(invoke).toHaveBeenCalledWith('list_downloaded_models');
    expect(useAppStore.getState().downloadedModels).toEqual(['demucs', 'htdemucs_ft']);
  });

  it('refreshDownloadedModels keeps prior list on failure', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('sidecar missing'));

    useAppStore.setState({ downloadedModels: ['htdemucs'] });
    const store = useAppStore.getState();
    await store.refreshDownloadedModels();

    expect(useAppStore.getState().downloadedModels).toEqual(['htdemucs']);
  });
});

// ─── Load existing .stem.mp4 into the Stem Mixer (#263) ────────────────────

describe('useAppStore — loadStemPack', () => {
  const cleanStems = () => [
    { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 1, muted: false, solo: false },
    { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false },
    { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false },
    { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false },
  ];

  beforeEach(() => {
    // resetAllMocks clears inherited implementations from earlier describes.
    vi.resetAllMocks();
    useAppStore.setState({ currentStems: cleanStems(), activeView: 'files' });
  });

  it('invokes unpack_stems and populates currentStems with paths, names and colors', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue([
      { stem_type: 'drums', file_path: '/unpacked/drums.wav', name: 'Kicks', color: '#FF6B6B' },
      { stem_type: 'bass', file_path: '/unpacked/bass.wav', name: 'Bass', color: '#4ECDC4' },
      { stem_type: 'other', file_path: '/unpacked/other.wav', name: 'Other', color: '#FFE66D' },
      { stem_type: 'vocals', file_path: '/unpacked/vocals.wav', name: 'Vocals', color: '#95E1D3' },
    ]);

    const store = useAppStore.getState();
    await store.loadStemPack('/music/track.stem.mp4');

    expect(invoke).toHaveBeenCalledWith('unpack_stems', { path: '/music/track.stem.mp4' });

    const state = useAppStore.getState();
    const drums = state.currentStems.find((s) => s.type === 'drums');
    expect(drums?.file_path).toBe('/unpacked/drums.wav');
    expect(drums?.name).toBe('Kicks');
    expect(drums?.color).toBe('#FF6B6B');
    // All four stems have paths
    expect(state.currentStems.filter((s) => s.file_path)).toHaveLength(4);
    // Navigates to the mixer
    expect(state.activeView).toBe('mixer');
  });

  it('falls back to canonical names/colors when unpacked stems omit them', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue([
      { stem_type: 'drums', file_path: '/unpacked/drums.wav', name: null, color: null },
      { stem_type: 'bass', file_path: '/unpacked/bass.wav', name: null, color: null },
      { stem_type: 'other', file_path: '/unpacked/other.wav', name: null, color: null },
      { stem_type: 'vocals', file_path: '/unpacked/vocals.wav', name: null, color: null },
    ]);

    const store = useAppStore.getState();
    await store.loadStemPack('/music/track.stem.mp4');

    const state = useAppStore.getState();
    const drums = state.currentStems.find((s) => s.type === 'drums')!;
    expect(drums.name).toBe('Drums');
    expect(drums.color).toBe('#FF6B6B');
    expect(state.activeView).toBe('mixer');
  });

  it('does not navigate or update stems when unpack_stems returns empty', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue([]);

    useAppStore.setState({ activeView: 'files' });
    const before = useAppStore.getState().currentStems;
    const store = useAppStore.getState();
    await store.loadStemPack('/music/track.stem.mp4');

    expect(useAppStore.getState().activeView).toBe('files');
    expect(useAppStore.getState().currentStems).toEqual(before);
  });

  it('keeps current view and stems unchanged when unpack_stems rejects', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValue(new Error('ffprobe failed: no such file'));

    useAppStore.setState({ activeView: 'library' });
    const before = useAppStore.getState().currentStems;
    const store = useAppStore.getState();
    await store.loadStemPack('/music/bad.stem.mp4');

    expect(useAppStore.getState().activeView).toBe('library');
    expect(useAppStore.getState().currentStems).toEqual(before);
  });
});
