import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAppStore } from '@/stores/appStore';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

let invokeMock: ReturnType<typeof vi.fn>;

async function getInvokeMock() {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke as ReturnType<typeof vi.fn>;
}

/** Create a deferred promise that can be resolved externally. */
function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeAudioFile(overrides: Record<string, unknown> = {}) {
  return {
    path: `/music/song${Math.random().toString(36).slice(2)}.mp3`,
    name: 'song.mp3',
    size: 1000,
    duration: 60,
    sample_rate: 44100,
    bit_depth: 16,
    channels: 2,
    format: 'mp3',
    metadata: {},
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('appStore startProcessing', () => {
  beforeEach(async () => {
    invokeMock = await getInvokeMock();
    vi.clearAllMocks();

    act(() => {
      useAppStore.setState({
        audioFiles: [],
        jobs: [],
        currentJobId: null,
        isProcessing: false,
        maxParallelJobs: 2,
        activeJobCount: 0,
        pendingFiles: [],
        currentStems: [],
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parallel cap: maxParallelJobs=2 means at most 2 invoke calls in-flight simultaneously', async () => {
    const deferreds = Array.from({ length: 5 }, () =>
      deferred<{ stem_type: string; file_path: string }[]>()
    );
    let callIndex = 0;
    let peakConcurrent = 0;
    let currentConcurrent = 0;

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        const idx = callIndex++;
        currentConcurrent++;
        peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
        try {
          return await deferreds[idx].promise;
        } finally {
          currentConcurrent--;
        }
      }
      // pack_stems and add_to_history succeed immediately
      return Promise.resolve({ success: true });
    });

    // Drop 5 files
    const files = Array.from({ length: 5 }, (_, i) =>
      makeAudioFile({ path: `/music/song${i}.mp3`, name: `song${i}.mp3` })
    );

    await act(async () => {
      useAppStore.getState().addFiles(files);
    });

    // Start processing
    await act(async () => {
      useAppStore.getState().startProcessing(files);
    });

    // Give microtasks a moment to settle
    await new Promise((r) => setTimeout(r, 100));

    // With maxParallelJobs=2, at most 2 should be in-flight initially
    expect(peakConcurrent).toBeLessThanOrEqual(2);
    expect(callIndex).toBeLessThanOrEqual(2);

    // Resolve all deferreds — this unblocks the entire chain
    for (const d of deferreds) {
      d.resolve([]);
    }
    // Give the scheduler enough time to chain through all jobs
    // Each job needs time for: processJob finally → processNextBatch → new processJob
    await new Promise((r) => setTimeout(r, 300));

    // All 5 should eventually be processed
    expect(callIndex).toBe(5);
  }, 15000);

  it('re-entrancy guard: calling startProcessing twice only creates one batch', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        await new Promise((r) => setTimeout(r, 50));
        return [];
      }
      return { success: true };
    });

    const files = [makeAudioFile({ path: '/music/single.mp3' })];

    await act(async () => {
      useAppStore.getState().addFiles(files);
    });

    // Start processing first time
    await act(async () => {
      useAppStore.getState().startProcessing(files);
    });

    const jobsAfterFirst = useAppStore.getState().jobs.length;

    // Try to start again — should be blocked
    await act(async () => {
      useAppStore.getState().startProcessing(files);
    });

    // No duplicate jobs should have been created
    expect(useAppStore.getState().jobs.length).toBe(jobsAfterFirst);
  }, 10000);

  it('error recovery: first file fails but second file is still processed', async () => {
    let callCount = 0;

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        callCount++;
        if (callCount === 1) {
          throw new Error('ModuleNotFoundError: No module named demucs');
        }
        return [];
      }
      if (cmd === 'pack_stems') {
        return { success: true };
      }
      return undefined;
    });

    const files = [
      makeAudioFile({ path: '/music/fail.mp3', name: 'fail.mp3' }),
      makeAudioFile({ path: '/music/succeed.mp3', name: 'succeed.mp3' }),
    ];

    await act(async () => {
      useAppStore.getState().addFiles(files);
    });

    await act(async () => {
      useAppStore.getState().startProcessing(files);
    });

    // Wait for both to complete
    await new Promise((r) => setTimeout(r, 500));

    const state = useAppStore.getState();
    const failedJob = state.jobs.find(j => j.input_path === '/music/fail.mp3');
    const succeededJob = state.jobs.find(j => j.input_path === '/music/succeed.mp3');

    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error).toContain('demucs');
    // Second file should still be processed (not stuck in pending)
    expect(succeededJob?.status).toBe('completed');
    expect(state.isProcessing).toBe(false);
  }, 15000);

  it('sequential cloud mode: batchParallel=false means only 1 in-flight at a time', async () => {
    // Set cloud provider
    const { useSettingsStore } = await import('@/stores/settingsStore');
    act(() => {
      useSettingsStore.setState({ activeProvider: 'fal', batchParallel: false });
    });

    let callIndex = 0;
    let peakConcurrent = 0;
    let currentConcurrent = 0;
    const deferreds = Array.from({ length: 3 }, () => deferred<string[]>());

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        const idx = callIndex++;
        currentConcurrent++;
        peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
        try {
          return await deferreds[idx].promise;
        } finally {
          currentConcurrent--;
        }
      }
      return { success: true };
    });

    const files = Array.from({ length: 3 }, (_, i) =>
      makeAudioFile({ path: `/music/cloud${i}.mp3`, name: `cloud${i}.mp3` })
    );

    await act(async () => {
      useAppStore.getState().addFiles(files);
    });

    await act(async () => {
      useAppStore.getState().startProcessing(files);
    });

    await new Promise((r) => setTimeout(r, 50));

    // In sequential cloud mode, only 1 job at a time
    expect(peakConcurrent).toBeLessThanOrEqual(1);
    expect(callIndex).toBe(1);

    // Resolve and verify next starts
    deferreds[0].resolve([]);
    await new Promise((r) => setTimeout(r, 100));
    expect(callIndex).toBe(2);

    // Cleanup
    deferreds[1].resolve([]);
    deferreds[2].resolve([]);
    await new Promise((r) => setTimeout(r, 100));

    // Restore
    act(() => {
      useSettingsStore.setState({ activeProvider: 'local' });
    });
  }, 15000);
});
