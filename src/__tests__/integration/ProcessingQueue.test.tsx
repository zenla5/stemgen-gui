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
  useAppStore.setState({
    audioFiles: [],
    jobs: [],
    isProcessing: false,
    activeJobCount: 0,
    pendingFiles: [],
    maxParallelJobs: 2,
  });
}

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<ProcessingJob> = {}): ProcessingJob {
  return {
    id: 'test-job-1',
    input_path: '/fake/test.mp3',
    output_path: '/fake/test.stem.mp4',
    status: 'pending',
    progress: 0,
    model: 'bs_roformer',
    dj_software: 'traktor',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessingQueue', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('renders empty queue state correctly', () => {
    render(<ProcessingQueue />);
    expect(screen.getByText(/no jobs in queue/i)).toBeInTheDocument();
    expect(screen.getByText(/add audio files and start processing/i)).toBeInTheDocument();
  });

  it('renders a job with pending status', async () => {
    await act(async () => {
      useAppStore.setState({ jobs: [makeJob({ status: 'pending' })] });
    });

    render(<ProcessingQueue />);

    expect(screen.getByText('test.mp3')).toBeInTheDocument();
    expect(screen.getByText(/waiting/i)).toBeInTheDocument();
  });

  it('renders a job with processing status and correct progress', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'processing', progress: 0.5 })],
        isProcessing: true,
      });
    });

    render(<ProcessingQueue />);

    expect(screen.getByText('test.mp3')).toBeInTheDocument();
    // Check that a progress indicator is present (could be "Processing" or "%" text)
    const progressText = screen.getAllByText(/processing|%/i);
    expect(progressText.length).toBeGreaterThan(0);
    // Progress bar shows 50%
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders a job with completed status', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'completed', progress: 1 })],
      });
    });

    render(<ProcessingQueue />);

    expect(screen.getByText('test.mp3')).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it('renders a job with failed status and shows error', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [
          makeJob({
            status: 'failed',
            error: 'Model not found',
          }),
        ],
      });
    });

    render(<ProcessingQueue />);

    // Use getAllByText since "failed" might appear multiple times
    const failedElements = screen.getAllByText(/failed/i);
    expect(failedElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Model not found/i)).toBeInTheDocument();
  });

  it('Start Processing button is disabled when no files', () => {
    render(<ProcessingQueue />);
    const btn = screen.getByRole('button', { name: /start processing/i });
    expect(btn).toBeDisabled();
  });

  it('Start Processing button is enabled when files are present', async () => {
    await act(async () => {
      useAppStore.setState({
        audioFiles: [{ path: '/fake/test.mp3', name: 'test.mp3', size: 1000, duration: 60, sample_rate: 44100, bit_depth: 16, channels: 2, format: 'mp3', metadata: {} }],
      });
    });

    render(<ProcessingQueue />);
    const btn = screen.getByRole('button', { name: /start processing/i });
    expect(btn).not.toBeDisabled();
  });

  it('Cancel All Processing button appears when isProcessing is true', async () => {
    await act(async () => {
      useAppStore.setState({
        audioFiles: [{ path: '/fake/test.mp3', name: 'test.mp3', size: 1000, duration: 60, sample_rate: 44100, bit_depth: 16, channels: 2, format: 'mp3', metadata: {} }],
        jobs: [makeJob({ status: 'processing', progress: 0.3 })],
        isProcessing: true,
        activeJobCount: 1,
        pendingFiles: [],
      });
    });

    render(<ProcessingQueue />);
    expect(screen.getByRole('button', { name: /cancel all processing/i })).toBeInTheDocument();
  });

  it('shows batch processing status when processing', async () => {
    await act(async () => {
      useAppStore.setState({
        jobs: [makeJob({ status: 'processing', progress: 0.3 })],
        isProcessing: true,
        activeJobCount: 1,
        pendingFiles: [{ path: '/fake/test2.mp3', name: 'test2.mp3', size: 1000, duration: 60, sample_rate: 44100, bit_depth: 16, channels: 2, format: 'mp3', metadata: {} }],
        maxParallelJobs: 2,
      });
    });

    render(<ProcessingQueue />);
    expect(screen.getByText(/batch processing/i)).toBeInTheDocument();
    expect(screen.getByText(/1 active/i)).toBeInTheDocument();
  });
});
