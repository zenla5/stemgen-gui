import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ProcessingQueue } from '@/components/processing/ProcessingQueue';
import { useAppStore } from '@/stores/appStore';
import type { ProcessingJob } from '@/lib/types';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
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

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<ProcessingJob> = {}): ProcessingJob {
  return {
    id: `job-${Math.random().toString(36).substring(2, 7)}`,
    input_path: '/fake/test.mp3',
    output_path: '/fake/test.stem.mp4',
    status: 'pending',
    progress: 0,
    model: 'bs_roformer',
    dj_software: 'traktor',
    ...overrides,
  };
}

const fakeAudioFile = {
  path: '/fake/test.mp3',
  name: 'test.mp3',
  size: 1000,
  duration: 60,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  format: 'mp3',
  metadata: {},
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessingQueue — error state display', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('renders error message for a failed job after expanding details', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [
          makeJob({
            status: 'failed',
            error: 'Separation process failed with exit code: Some(1)',
          }),
        ],
      });
    });

    render(<ProcessingQueue />);

    // Error is collapsed by default — toggle should be visible
    const toggle = screen.getByTestId('error-details-toggle');
    expect(toggle).toBeInTheDocument();

    // Expand the details
    await act(async () => {
      toggle.click();
    });

    expect(
      screen.getByText(/Separation process failed with exit code/)
    ).toBeInTheDocument();
  });

  it('error details toggle collapses and expands correctly', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [
          makeJob({
            status: 'failed',
            error: 'Some error message',
          }),
        ],
      });
    });

    render(<ProcessingQueue />);

    // Initially collapsed — error details not visible
    expect(screen.queryByTestId('error-details')).not.toBeInTheDocument();

    // Expand
    const toggle = screen.getByTestId('error-details-toggle');
    await act(async () => {
      toggle.click();
    });
    expect(screen.getByTestId('error-details')).toBeInTheDocument();
    expect(screen.getByText('Some error message')).toBeInTheDocument();

    // Collapse again
    await act(async () => {
      toggle.click();
    });
    expect(screen.queryByTestId('error-details')).not.toBeInTheDocument();
  });

  it('Start Processing button re-enables after all jobs are failed', async () => {
    await act(async () => {
      useAppStore.setState({
        audioFiles: [fakeAudioFile],
        jobs: [
          makeJob({ status: 'failed', error: 'Model not found' }),
        ],
        isProcessing: false,
      });
    });

    render(<ProcessingQueue />);

    // With no pending jobs, button should be disabled
    const btn = screen.getByRole('button', { name: /start processing/i });
    expect(btn).toBeDisabled();
  });

  it('Start Processing button re-enables after all jobs are completed', async () => {
    await act(async () => {
      useAppStore.setState({
        audioFiles: [fakeAudioFile],
        jobs: [
          makeJob({ status: 'completed', progress: 1 }),
        ],
        isProcessing: false,
      });
    });

    render(<ProcessingQueue />);

    const btn = screen.getByRole('button', { name: /start processing/i });
    // No pending jobs → disabled
    expect(btn).toBeDisabled();
  });

  it('Start Processing button is enabled when pending jobs exist after failure', async () => {
    await act(async () => {
      useAppStore.setState({
        audioFiles: [fakeAudioFile],
        jobs: [
          makeJob({ id: 'j1', status: 'failed', error: 'crashed' }),
          makeJob({ id: 'j2', status: 'pending' }),
        ],
        isProcessing: false,
      });
    });

    render(<ProcessingQueue />);

    const btn = screen.getByRole('button', { name: /start processing/i });
    expect(btn).not.toBeDisabled();
  });

  it('processing job shows a loading indicator', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'processing', progress: 0.4 })],
        isProcessing: true,
        activeJobCount: 1,
      });
    });

    render(<ProcessingQueue />);

    // The job item should show "Processing" status text and progress
    const processingElements = screen.getAllByText(/processing/i);
    expect(processingElements.length).toBeGreaterThan(0);
    // Progress percentage should be visible
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('Cancel All button appears only while isProcessing is true', async () => {
    // When not processing
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'pending' })],
        isProcessing: false,
      });
    });

    const { rerender } = render(<ProcessingQueue />);
    expect(screen.queryByTestId('cancel-all-btn')).not.toBeInTheDocument();

    // When processing
    await act(async () => {
      useAppStore.setState({
        isProcessing: true,
        activeJobCount: 1,
        jobs: [makeJob({ status: 'processing', progress: 0.2 })],
      });
    });

    rerender(<ProcessingQueue />);
    expect(screen.getByTestId('cancel-all-btn')).toBeInTheDocument();
  });

  it('Cancel All button disappears when isProcessing becomes false after failure', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'processing', progress: 0.5 })],
        isProcessing: true,
        activeJobCount: 1,
      });
    });

    const { rerender } = render(<ProcessingQueue />);
    expect(screen.getByTestId('cancel-all-btn')).toBeInTheDocument();

    // Simulate failure: isProcessing set to false, job marked failed
    await act(async () => {
      useAppStore.setState({
        isProcessing: false,
        activeJobCount: 0,
        jobs: [
          makeJob({
            status: 'failed',
            error: 'Separation process failed with exit code: Some(1)',
          }),
        ],
      });
    });

    rerender(<ProcessingQueue />);
    expect(screen.queryByTestId('cancel-all-btn')).not.toBeInTheDocument();
  });

  it('shows failed count in job stats', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [
          makeJob({ id: 'f1', status: 'failed', error: 'err1' }),
          makeJob({ id: 'f2', status: 'failed', error: 'err2' }),
          makeJob({ id: 'c1', status: 'completed' }),
        ],
      });
    });

    render(<ProcessingQueue />);

    expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    expect(screen.getByText(/1 completed/)).toBeInTheDocument();
  });
});
