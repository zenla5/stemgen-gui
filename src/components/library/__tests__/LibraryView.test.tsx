import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryView } from '@/components/library/LibraryView';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryRoot } from '@/lib/types/library';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

// Mock batchQueueStore (used by LibraryOverviewPanel)
vi.mock('@/stores/batchQueueStore', () => ({
  useBatchQueueStore: () => ({
    queueGenerate: vi.fn(),
    queueRegenerate: vi.fn(),
    startProcessor: vi.fn(),
    isProcessing: false,
    isPaused: false,
    queueStatus: null,
    queueError: null,
    loadQueueStatus: vi.fn(),
    cleanup: vi.fn(),
  }),
}));

// Mock settingsStore (used by LibraryOverviewPanel)
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    defaultModel: 'bs_roformer',
    defaultDjSoftware: 'traktor',
    defaultOutputFormat: 'alac',
  }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const sampleRoot: LibraryRoot = {
  id: 'root-1',
  path: '/music',
  output_strategy: 'alongside',
  scan_policy: 'manual',
  created_at: '2026-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStore(roots: LibraryRoot[] = []) {
  useLibraryStore.setState({
    libraryRoots: roots,
    libraryIndex: [],
    statusFilter: [],
    searchQuery: '',
    groupBy: 'none',
    selectedStems: new Set(),
    isScanning: false,
    scanResultV2: null,
    loadLibraryRoots: vi.fn(),
    scanLibraryRoot: vi.fn().mockResolvedValue(undefined),
    addLibraryRoot: vi.fn().mockResolvedValue('new-id'),
    setStatusFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setGroupBy: vi.fn(),
    toggleStemSelection: vi.fn(),
    clearSelection: vi.fn(),
    selectStem: vi.fn(),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LibraryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders empty state CTA when no library roots configured', () => {
    render(<LibraryView />);

    expect(screen.getByText('library.setUpLibrary')).toBeInTheDocument();
    expect(screen.getByText('library.addLibraryFolder')).toBeInTheDocument();
  });

  it('calls loadLibraryRoots on mount', () => {
    const loadSpy = vi.fn();
    useLibraryStore.setState({ loadLibraryRoots: loadSpy });

    render(<LibraryView />);

    expect(loadSpy).toHaveBeenCalledOnce();
  });

  it('renders overview panel and table when roots are configured', () => {
    resetStore([sampleRoot]);
    render(<LibraryView />);

    expect(screen.getByTestId('library-overview-panel')).toBeInTheDocument();
    expect(screen.getByTestId('library-table-empty')).toBeInTheDocument();
  });

  it('auto-selects first root and triggers scan on mount', () => {
    const scanSpy = vi.fn().mockResolvedValue(undefined);
    resetStore([sampleRoot]);
    useLibraryStore.setState({ scanLibraryRoot: scanSpy });

    render(<LibraryView />);

    expect(scanSpy).toHaveBeenCalledWith('root-1', false);
  });

  it('shows scanning indicator when isScanning is true', () => {
    resetStore([sampleRoot]);
    useLibraryStore.setState({ isScanning: true });

    render(<LibraryView />);

    // "Scanning..." appears in both overview panel button and the scanning indicator
    expect(screen.getAllByText('library.scanning').length).toBeGreaterThanOrEqual(1);
  });

  it('shows settings panel when settings button is clicked', async () => {
    resetStore([sampleRoot]);
    const user = userEvent.setup();

    render(<LibraryView />);
    await user.click(screen.getByLabelText('library.settings'));

    expect(screen.getByText('library.libraryRoots')).toBeInTheDocument();
  });
});
