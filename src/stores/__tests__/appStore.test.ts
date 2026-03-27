import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/stores/appStore';
import type { AudioFileMetadata, ProcessingJob } from '@/lib/types';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
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

    expect(useAppStore.getState().settings.model).toBe('bs_roformer');
  });
});
