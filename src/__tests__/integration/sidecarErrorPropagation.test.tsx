import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ProcessingQueue } from '@/components/processing/ProcessingQueue';
import { useAppStore } from '@/stores/appStore';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
}));

// ─── Store reset helper ────────────────────────────────────────────────────────

function resetStore() {
  act(() => {
    useAppStore.setState({
      audioFiles: [],
      jobs: [],
      isProcessing: false,
      activeJobCount: 0,
      pendingFiles: [],
      maxParallelJobs: 2,
    });
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Sidecar Error Propagation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('shows failed job with demucs error and Setup Wizard hint when sidecar fails', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        throw new Error("No module named 'demucs'");
      }
      return undefined;
    });

    // Add a file and start processing
    await act(async () => {
      useAppStore.getState().addFiles([
        { path: '/music/test.mp3', name: 'test.mp3', size: 1000, duration: 60, sample_rate: 44100, bit_depth: 16, channels: 2, format: 'mp3', metadata: {} },
      ]);
    });

    render(<ProcessingQueue />);

    // Start processing
    const startBtn = screen.getByTestId('start-processing-btn');
    await act(async () => {
      startBtn.click();
    });

    // Wait for the job to fail
    await waitFor(() => {
      const state = useAppStore.getState();
      const failedJob = state.jobs.find(j => j.status === 'failed');
      expect(failedJob).toBeDefined();
    }, { timeout: 3000 });

    // Verify the error message contains "demucs" and the hint
    const state = useAppStore.getState();
    const failedJob = state.jobs.find(j => j.status === 'failed');
    expect(failedJob?.error).toContain('demucs');
    expect(failedJob?.error).toContain('Setup Wizard');
  }, 10000);

  it('renders the error message in the job card for failed jobs', async () => {
    // Set up a pre-failed job
    await act(async () => {
      useAppStore.setState({
        jobs: [{
          id: 'failed-job-1',
          input_path: '/music/test.mp3',
          output_path: '/music/test.stem.mp4',
          status: 'failed',
          progress: 0,
          model: 'bs_roformer',
          dj_software: 'traktor',
          error: "No module named 'demucs' — Open Setup Wizard to install missing dependencies.",
        }],
      });
    });

    render(<ProcessingQueue />);

    // The error message should be visible in the job card
    expect(screen.getByText(/No module named 'demucs'/)).toBeInTheDocument();
    expect(screen.getByText(/Setup Wizard/)).toBeInTheDocument();
  });

  it('shows generic error without hint for non-dependency errors', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'start_separation') {
        throw new Error('Separation process failed with exit code: 1');
      }
      return undefined;
    });

    await act(async () => {
      useAppStore.getState().addFiles([
        { path: '/music/test.mp3', name: 'test.mp3', size: 1000, duration: 60, sample_rate: 44100, bit_depth: 16, channels: 2, format: 'mp3', metadata: {} },
      ]);
    });

    render(<ProcessingQueue />);
    const startBtn = screen.getByTestId('start-processing-btn');
    await act(async () => {
      startBtn.click();
    });

    await waitFor(() => {
      const state = useAppStore.getState();
      const failedJob = state.jobs.find(j => j.status === 'failed');
      expect(failedJob).toBeDefined();
    }, { timeout: 3000 });

    const state = useAppStore.getState();
    const failedJob = state.jobs.find(j => j.status === 'failed');
    // Should have the error message but NOT the Setup Wizard hint
    expect(failedJob?.error).toContain('exit code: 1');
    expect(failedJob?.error).not.toContain('Setup Wizard');
  }, 10000);
});
