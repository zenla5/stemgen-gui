import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryView } from '@/components/library/LibraryView';
import { useLibraryStore } from '@/stores/libraryStore';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { LibraryRoot, LibraryIndexEntry, LibraryScanResultV2 } from '@/lib/types/library';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────

const mockOpen = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const root1: LibraryRoot = {
  id: 'root-1',
  path: '/music/library',
  output_strategy: 'alongside',
  scan_policy: 'manual',
  ignored_globs: undefined,
  staleness_policy: undefined,
  created_at: '2026-04-01T00:00:00Z',
  last_scanned_at: '2026-04-09T10:00:00Z',
};

const scanResult: LibraryScanResultV2 = {
  root_id: 'root-1',
  total_sources: 5,
  no_stem_count: 2,
  has_stem_current_count: 2,
  has_stem_outdated_count: 1,
  has_stem_unknown_provenance_count: 0,
  orphaned_stem_count: 0,
  ignored_count: 0,
  entries: [],
};

const entries: LibraryIndexEntry[] = [
  {
    id: 'e1',
    root_id: 'root-1',
    source_path: '/music/library/alpha.flac',
    status: 'HasStemCurrent',
    ignored: false,
    updated_at: '2026-04-09T00:00:00Z',
  },
  {
    id: 'e2',
    root_id: 'root-1',
    source_path: '/music/library/beta.mp3',
    status: 'NoStem',
    ignored: false,
    updated_at: '2026-04-09T00:00:00Z',
  },
  {
    id: 'e3',
    root_id: 'root-1',
    source_path: '/music/library/gamma.wav',
    status: 'HasStemOutdated',
    ignored: false,
    updated_at: '2026-04-09T00:00:00Z',
    provenance_json: JSON.stringify({
      schema_version: 1,
      separation_model: 'demucs',
      model_version: 'v1',
      stemgen_gui_version: '1.2.0',
      stemgen_version: '0.9.0',
      separation_timestamp: '2026-03-15T10:00:00Z',
      source_path: '/music/library/gamma.wav',
      source_content_hash: 'abc123',
      source_duration_secs: 240,
      source_sample_rate: 44100,
      job_id: 'job-old',
    }),
  },
  {
    id: 'e4',
    root_id: 'root-1',
    source_path: '/music/library/delta.flac',
    status: 'HasStemCurrent',
    ignored: false,
    updated_at: '2026-04-09T00:00:00Z',
    provenance_json: JSON.stringify({
      schema_version: 1,
      separation_model: 'bs_roformer',
      model_version: 'v1',
      stemgen_gui_version: '1.2.0',
      stemgen_version: '0.9.0',
      separation_timestamp: '2026-04-01T10:00:00Z',
      source_path: '/music/library/delta.flac',
      source_content_hash: 'def456',
      source_duration_secs: 180,
      source_sample_rate: 44100,
      job_id: 'job-new',
    }),
  },
  {
    id: 'e5',
    root_id: 'root-1',
    source_path: '/music/library/epsilon.mp3',
    status: 'NoStem',
    ignored: false,
    updated_at: '2026-04-09T00:00:00Z',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStores() {
  useLibraryStore.setState({
    libraryRoots: [],
    libraryIndex: [],
    scanResultV2: null,
    isScanning: false,
    statusFilter: [],
    searchQuery: '',
    groupBy: 'none',
    selectedStems: new Set(),
    loadLibraryRoots: vi.fn().mockResolvedValue(undefined),
    addLibraryRoot: vi.fn().mockResolvedValue('root-1'),
    scanLibraryRoot: vi.fn().mockResolvedValue(undefined),
    orphans: [],
    loadOrphans: vi.fn().mockResolvedValue(undefined),
    deleteOrphan: vi.fn().mockResolvedValue(undefined),
    relinkOrphan: vi.fn().mockResolvedValue({ matched: false, new_status: 'OrphanedStem' }),
    ignoreOrphan: vi.fn().mockResolvedValue(undefined),
  });

  useBatchQueueStore.setState({
    queueStatus: null,
    isProcessing: false,
    isPaused: false,
    queueError: null,
    loadQueueStatus: vi.fn().mockResolvedValue(undefined),
    queueGenerate: vi.fn().mockResolvedValue({ queued_count: 2, total_duration_secs: 0 }),
    queueRegenerate: vi.fn().mockResolvedValue({ queued_count: 1, total_duration_secs: 0 }),
    startProcessor: vi.fn().mockResolvedValue(undefined),
    pauseQueue: vi.fn().mockResolvedValue(undefined),
    resumeQueue: vi.fn().mockResolvedValue(undefined),
    cancelQueue: vi.fn().mockResolvedValue(undefined),
    clearCompleted: vi.fn().mockResolvedValue(undefined),
    initBatchQueueListener: vi.fn(),
    cleanup: vi.fn(),
  });

  useSettingsStore.setState({
    defaultModel: 'bs_roformer',
    defaultDjSoftware: 'traktor',
    defaultOutputFormat: 'alac',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LibraryView integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it('shows empty state CTA when no roots configured', () => {
    render(<LibraryView />);

    expect(screen.getByText('library.setUpLibrary')).toBeInTheDocument();
    expect(screen.getByText('library.addLibraryFolder')).toBeInTheDocument();
  });

  it('renders overview panel and table when roots exist', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('library-overview-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('library-table')).toBeInTheDocument();
  });

  it('displays scan stats in overview panel', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('library-overview-panel')).toBeInTheDocument();
    });

    // Stats should be visible
    expect(screen.getByText('library.total')).toBeInTheDocument();
    expect(screen.getAllByText('library.noStem').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('library.current').length).toBeGreaterThanOrEqual(1);
  });

  it('shows table entries with correct filenames', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('library-table')).toBeInTheDocument();
    });

    expect(screen.getByText('alpha.flac')).toBeInTheDocument();
    expect(screen.getByText('beta.mp3')).toBeInTheDocument();
    expect(screen.getByText('gamma.wav')).toBeInTheDocument();
  });

  it('opens StemInfoPanel when clicking a row with stem_path', async () => {
    const user = userEvent.setup();
    // Set up a row with provenance (HasStemCurrent) that would have a stem_path
    const entryWithStem = entries.find((e) => e.status === 'HasStemCurrent' && e.provenance_json);
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries.map((e) =>
        e.id === entryWithStem?.id ? { ...e, stem_path: '/music/library/delta.stem.mp4' } : e
      ),
    });

    // Mock invoke for StemInfoPanel provenance loading
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return null;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return undefined;
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('library-table')).toBeInTheDocument();
    });

    // Click on the row with stem_path
    await user.click(screen.getByTestId('row-e4'));

    await waitFor(() => {
      expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
    });
  });

  it('Generate Missing button is disabled when no_stem_count is 0', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: { ...scanResult, no_stem_count: 0, entries: [] },
      libraryIndex: entries.filter((e) => e.status !== 'NoStem'),
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-missing-btn')).toBeDisabled();
    });
  });

  it('Generate Missing button is enabled when no_stem_count > 0', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-missing-btn')).not.toBeDisabled();
    });
  });

  it('shows scanning indicator when isScanning is true', async () => {
    useLibraryStore.setState({
      libraryRoots: [root1],
      isScanning: true,
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getAllByText('library.scanning').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows settings panel when settings button is clicked', async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({
      libraryRoots: [root1],
      scanResultV2: scanResult,
      libraryIndex: entries,
    });

    render(<LibraryView />);

    await waitFor(() => {
      expect(screen.getByTestId('library-overview-panel')).toBeInTheDocument();
    });

    // Click the settings button
    await user.click(screen.getByLabelText('library.settings'));

    await waitFor(() => {
      expect(screen.getByText('library.libraryRoots')).toBeInTheDocument();
    });
  });
});
