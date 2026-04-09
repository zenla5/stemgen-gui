import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryOverviewPanel } from '@/components/library/LibraryOverviewPanel';
import { useLibraryStore } from '@/stores/libraryStore';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { LibraryRoot, LibraryScanResultV2 } from '@/lib/types/library';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const sampleRoot: LibraryRoot = {
  id: 'root-1',
  path: '/music',
  output_strategy: 'alongside',
  scan_policy: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  last_scanned_at: '2026-04-01T12:00:00Z',
};

const sampleStats: LibraryScanResultV2 = {
  root_id: 'root-1',
  total_sources: 100,
  no_stem_count: 40,
  has_stem_current_count: 30,
  has_stem_outdated_count: 15,
  has_stem_unknown_provenance_count: 5,
  orphaned_stem_count: 5,
  ignored_count: 5,
  entries: [],
};

const emptyStats: LibraryScanResultV2 = {
  root_id: 'root-1',
  total_sources: 0,
  no_stem_count: 0,
  has_stem_current_count: 0,
  has_stem_outdated_count: 0,
  has_stem_unknown_provenance_count: 0,
  orphaned_stem_count: 0,
  ignored_count: 0,
  entries: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStores(stats: LibraryScanResultV2 | null = null) {
  useLibraryStore.setState({
    libraryRoots: [sampleRoot],
    isScanning: false,
    scanResultV2: stats,
    scanLibraryRoot: vi.fn().mockResolvedValue(undefined),
    loadLibraryRoots: vi.fn(),
  });

  useBatchQueueStore.setState({
    queueGenerate: vi.fn().mockResolvedValue({ queued_count: 0, total_duration_secs: 0 }),
    queueRegenerate: vi.fn().mockResolvedValue({ queued_count: 0, total_duration_secs: 0 }),
    startProcessor: vi.fn().mockResolvedValue(undefined),
    isProcessing: false,
    isPaused: false,
    queueStatus: null,
    queueError: null,
    loadQueueStatus: vi.fn(),
    cleanup: vi.fn(),
  });

  useSettingsStore.setState({
    defaultModel: 'bs_roformer',
    defaultDjSoftware: 'traktor',
    defaultOutputFormat: 'alac',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LibraryOverviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores(sampleStats);
  });

  it('renders root path and last scanned time', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('/music')).toBeInTheDocument();
    expect(screen.getByText(/last scanned/i)).toBeInTheDocument();
  });

  it('renders stat grid with correct values', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('100')).toBeInTheDocument(); // total
    expect(screen.getByText('40')).toBeInTheDocument(); // no stem
    expect(screen.getByText('30')).toBeInTheDocument(); // current
    expect(screen.getByText('15')).toBeInTheDocument(); // outdated
    // Unknown, Orphaned, and Ignored all have value 5
    expect(screen.getAllByText('5')).toHaveLength(3);
  });

  it('renders status breakdown bar when total > 0', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('does not render status bar when total is 0', () => {
    resetStores(emptyStats);
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.queryByTestId('status-bar')).not.toBeInTheDocument();
  });

  it('Scan Now button calls scanLibraryRoot', async () => {
    const user = userEvent.setup();
    const scanSpy = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({ scanLibraryRoot: scanSpy });

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);
    await user.click(screen.getByTestId('scan-now-btn'));

    expect(scanSpy).toHaveBeenCalledWith('root-1', true);
  });

  it('Scan Now shows spinner when scanning', () => {
    useLibraryStore.setState({ isScanning: true });

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('Scanning...')).toBeInTheDocument();
    expect(screen.getByTestId('scan-now-btn')).toBeDisabled();
  });

  it('Settings button calls onOpenSettings', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(
      <LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={onOpenSettings} />
    );
    await user.click(screen.getByLabelText('Settings'));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('Generate Missing button is disabled when noStemCount is 0', () => {
    resetStores({ ...sampleStats, no_stem_count: 0 });
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByTestId('generate-missing-btn')).toBeDisabled();
  });

  it('Generate Missing button is enabled when noStemCount > 0', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByTestId('generate-missing-btn')).not.toBeDisabled();
  });

  it('Generate Missing button shows count', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('Generate Missing (40)')).toBeInTheDocument();
  });

  it('Regenerate Outdated button is disabled when outdated count is 0', () => {
    resetStores({ ...sampleStats, has_stem_outdated_count: 0 });
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByTestId('regenerate-outdated-btn')).toBeDisabled();
  });

  it('Regenerate Outdated button shows count', () => {
    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);

    expect(screen.getByText('Regenerate Outdated (15)')).toBeInTheDocument();
  });

  it('Generate Missing opens confirmation dialog', async () => {
    const user = userEvent.setup();

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);
    await user.click(screen.getByTestId('generate-missing-btn'));

    expect(screen.getByTestId('batch-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Generate Missing Stems')).toBeInTheDocument();
  });

  it('Regenerate Outdated opens confirmation dialog', async () => {
    const user = userEvent.setup();

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);
    await user.click(screen.getByTestId('regenerate-outdated-btn'));

    expect(screen.getByTestId('batch-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Regenerate Outdated Stems')).toBeInTheDocument();
  });

  it('Generate Missing confirmation calls queueGenerate and startProcessor', async () => {
    const user = userEvent.setup();
    const queueGenerateSpy = vi.fn().mockResolvedValue({ queued_count: 40, total_duration_secs: 0 });
    const startProcessorSpy = vi.fn().mockResolvedValue(undefined);
    useBatchQueueStore.setState({
      queueGenerate: queueGenerateSpy,
      startProcessor: startProcessorSpy,
    });

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);
    await user.click(screen.getByTestId('generate-missing-btn'));
    await user.click(screen.getByTestId('batch-start-btn'));

    await waitFor(() => {
      expect(queueGenerateSpy).toHaveBeenCalledWith('root-1', 'bs_roformer', 'traktor', 'alac');
      expect(startProcessorSpy).toHaveBeenCalledWith('root-1');
    });
  });

  it('Regenerate Outdated confirmation calls queueRegenerate and startProcessor', async () => {
    const user = userEvent.setup();
    const queueRegenerateSpy = vi.fn().mockResolvedValue({ queued_count: 15, total_duration_secs: 0 });
    const startProcessorSpy = vi.fn().mockResolvedValue(undefined);
    useBatchQueueStore.setState({
      queueRegenerate: queueRegenerateSpy,
      startProcessor: startProcessorSpy,
    });

    render(<LibraryOverviewPanel selectedRootId="root-1" onOpenSettings={vi.fn()} />);
    await user.click(screen.getByTestId('regenerate-outdated-btn'));
    await user.click(screen.getByTestId('batch-start-btn'));

    await waitFor(() => {
      expect(queueRegenerateSpy).toHaveBeenCalledWith('root-1', 'bs_roformer', false, 'traktor', 'alac');
      expect(startProcessorSpy).toHaveBeenCalledWith('root-1');
    });
  });
});
