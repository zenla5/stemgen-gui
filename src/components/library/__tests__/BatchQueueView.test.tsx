import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchQueueView } from '@/components/library/BatchQueueView';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import type { BatchQueueStatusSummary, BatchQueueItem } from '@/lib/types/library';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeItem = (overrides: Partial<BatchQueueItem> = {}): BatchQueueItem => ({
  id: 'item-1',
  root_id: 'root-1',
  source_path: '/music/track1.flac',
  status: 'pending',
  model_id: 'bs_roformer',
  created_at: '2026-04-01T12:00:00Z',
  priority: 0,
  ...overrides,
});

const sampleStatus: BatchQueueStatusSummary = {
  pending_count: 2,
  processing_count: 1,
  done_count: 0,
  error_count: 0,
  cancelled_count: 0,
  total_count: 3,
  next_items: [
    makeItem({ id: 'item-1', source_path: '/music/track1.flac', status: 'processing' }),
    makeItem({ id: 'item-2', source_path: '/music/track2.flac', status: 'pending' }),
    makeItem({ id: 'item-3', source_path: '/music/track3.flac', status: 'pending' }),
  ],
};

const doneStatus: BatchQueueStatusSummary = {
  pending_count: 0,
  processing_count: 0,
  done_count: 2,
  error_count: 1,
  cancelled_count: 0,
  total_count: 3,
  next_items: [
    makeItem({ id: 'item-1', status: 'done' }),
    makeItem({ id: 'item-2', status: 'done' }),
    makeItem({ id: 'item-3', status: 'error', error_message: 'FFmpeg failed' }),
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStore(overrides: Partial<Parameters<typeof useBatchQueueStore.setState>[0]> = {}) {
  useBatchQueueStore.setState({
    queueStatus: sampleStatus,
    isProcessing: true,
    isPaused: false,
    queueError: null,
    unlisten: null,
    loadQueueStatus: vi.fn().mockResolvedValue(undefined),
    pauseQueue: vi.fn().mockResolvedValue(undefined),
    resumeQueue: vi.fn().mockResolvedValue(undefined),
    cancelQueue: vi.fn().mockResolvedValue(undefined),
    initBatchQueueListener: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BatchQueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders overlay with title "Processing Stems"', () => {
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByText('Processing Stems')).toBeInTheDocument();
    expect(screen.getByTestId('batch-queue-overlay')).toBeInTheDocument();
  });

  it('shows "Batch Complete" title when all items are done', () => {
    resetStore({ queueStatus: doneStatus, isProcessing: false });
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByText('Batch Complete')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByTestId('batch-progress-bar')).toBeInTheDocument();
  });

  it('shows correct completed / total count', () => {
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByText('0 / 3 files')).toBeInTheDocument();
  });

  it('renders scrollable item list with 3 items', () => {
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByTestId('batch-item-list')).toBeInTheDocument();
    expect(screen.getByText('track1.flac')).toBeInTheDocument();
    expect(screen.getByText('track2.flac')).toBeInTheDocument();
    expect(screen.getByText('track3.flac')).toBeInTheDocument();
  });

  it('shows status badges for items', () => {
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    const badges = screen.getAllByTestId('status-badge');
    expect(badges).toHaveLength(3);
  });

  it('Pause button calls pauseQueue', async () => {
    const user = userEvent.setup();
    const pauseQueueSpy = vi.fn().mockResolvedValue(undefined);
    resetStore({ pauseQueue: pauseQueueSpy });

    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);
    await user.click(screen.getByTestId('batch-pause-resume-btn'));

    expect(pauseQueueSpy).toHaveBeenCalledWith('root-1');
  });

  it('shows Resume button when paused', () => {
    resetStore({ isPaused: true });
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('Resume button calls resumeQueue', async () => {
    const user = userEvent.setup();
    const resumeQueueSpy = vi.fn().mockResolvedValue(undefined);
    resetStore({ isPaused: true, resumeQueue: resumeQueueSpy });

    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);
    await user.click(screen.getByTestId('batch-pause-resume-btn'));

    expect(resumeQueueSpy).toHaveBeenCalledWith('root-1');
  });

  it('Cancel All shows confirmation', async () => {
    const user = userEvent.setup();
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);
    await user.click(screen.getByTestId('batch-cancel-all-btn'));

    expect(screen.getByText('Cancel all?')).toBeInTheDocument();
    expect(screen.getByTestId('batch-cancel-confirm-btn')).toBeInTheDocument();
  });

  it('Cancel confirm calls cancelQueue', async () => {
    const user = userEvent.setup();
    const cancelQueueSpy = vi.fn().mockResolvedValue(undefined);
    resetStore({ cancelQueue: cancelQueueSpy });

    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);
    await user.click(screen.getByTestId('batch-cancel-all-btn'));
    await user.click(screen.getByTestId('batch-cancel-confirm-btn'));

    await waitFor(() => {
      expect(cancelQueueSpy).toHaveBeenCalledWith('root-1');
    });
  });

  it('Cancel dismiss hides confirmation', async () => {
    const user = userEvent.setup();
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);
    await user.click(screen.getByTestId('batch-cancel-all-btn'));
    await user.click(screen.getByTestId('batch-cancel-dismiss-btn'));

    expect(screen.queryByText('Cancel all?')).not.toBeInTheDocument();
  });

  it('Close button calls onClose when done', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    resetStore({ queueStatus: doneStatus, isProcessing: false });

    render(<BatchQueueView rootId="root-1" onClose={onClose} />);
    await user.click(screen.getByTestId('batch-close-btn'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows done summary with counts when complete', () => {
    resetStore({ queueStatus: doneStatus, isProcessing: false });
    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    const summary = screen.getByTestId('batch-done-summary');
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/2 done/)).toBeInTheDocument();
    expect(screen.getByText(/1 errors/)).toBeInTheDocument();
  });

  it('inits batch queue listener on mount', () => {
    const initSpy = vi.fn().mockResolvedValue(undefined);
    resetStore({ initBatchQueueListener: initSpy });

    render(<BatchQueueView rootId="root-1" onClose={vi.fn()} />);

    expect(initSpy).toHaveBeenCalledWith('root-1');
  });
});
