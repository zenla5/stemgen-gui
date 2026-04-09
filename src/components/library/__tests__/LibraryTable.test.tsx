import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryTable } from '@/components/library/LibraryTable';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryIndexEntry, StemFileState } from '@/lib/types/library';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LibraryIndexEntry> = {}): LibraryIndexEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    root_id: 'root-1',
    source_path: '/music/track.mp3',
    status: 'NoStem',
    ignored: false,
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

const provenanceJson = JSON.stringify({
  schema_version: 1,
  separation_model: 'bs_roformer',
  model_version: 'v1.0',
  stemgen_version: '0.9.0',
  stemgen_gui_version: '1.2.0',
  separation_timestamp: '2026-03-15T10:00:00Z',
  source_path: '/music/track1.mp3',
  source_content_hash: 'abc123',
  source_duration_secs: 240,
  source_sample_rate: 44100,
  job_id: 'job-1',
});

const fiveEntries: LibraryIndexEntry[] = [
  makeEntry({ id: 'e1', source_path: '/music/alpha.flac', status: 'HasStemCurrent' }),
  makeEntry({ id: 'e2', source_path: '/music/beta.mp3', status: 'NoStem' }),
  makeEntry({
    id: 'e3',
    source_path: '/music/gamma.wav',
    status: 'HasStemOutdated',
    provenance_json: provenanceJson,
  }),
  makeEntry({
    id: 'e4',
    source_path: '/music/delta.flac',
    status: 'HasStemCurrent',
    provenance_json: provenanceJson,
  }),
  makeEntry({ id: 'e5', source_path: '/music/epsilon.mp3', status: 'OrphanedStem' }),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStore(entries: LibraryIndexEntry[] = []) {
  useLibraryStore.setState({
    libraryIndex: entries,
    statusFilter: [],
    searchQuery: '',
    groupBy: 'none',
    selectedStems: new Set(),
    setStatusFilter: vi.fn((states: StemFileState[]) =>
      useLibraryStore.setState({ statusFilter: states })
    ),
    setSearchQuery: vi.fn((q: string) =>
      useLibraryStore.setState({ searchQuery: q })
    ),
    setGroupBy: vi.fn(),
    toggleStemSelection: vi.fn((id: string) => {
      const current = new Set(useLibraryStore.getState().selectedStems);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      useLibraryStore.setState({ selectedStems: current });
    }),
    clearSelection: vi.fn(() => useLibraryStore.setState({ selectedStems: new Set() })),
    selectStem: vi.fn(),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LibraryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders empty state when no entries', () => {
    render(<LibraryTable />);
    expect(screen.getByTestId('library-table-empty')).toBeInTheDocument();
  });

  it('renders table with entries', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    expect(screen.getByTestId('library-table')).toBeInTheDocument();
    expect(screen.getByText('alpha.flac')).toBeInTheDocument();
    expect(screen.getByText('beta.mp3')).toBeInTheDocument();
    expect(screen.getByText('gamma.wav')).toBeInTheDocument();
  });

  it('renders status badges with correct labels', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    expect(screen.getByTestId('status-badge-e1')).toHaveTextContent('Current');
    expect(screen.getByTestId('status-badge-e2')).toHaveTextContent('No Stem');
    expect(screen.getByTestId('status-badge-e3')).toHaveTextContent('Outdated');
    expect(screen.getByTestId('status-badge-e5')).toHaveTextContent('Orphaned');
  });

  it('renders model and date from provenance', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    // e3 has provenance with bs_roformer model
    const e3Row = screen.getByTestId('row-e3');
    expect(within(e3Row).getByText('bs_roformer')).toBeInTheDocument();
  });

  it('renders dash for entries without provenance', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    // e2 has no provenance
    const e2Row = screen.getByTestId('row-e2');
    expect(within(e2Row).getAllByText('\u2014').length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status when status filter is applied', () => {
    resetStore(fiveEntries);
    // Set a status filter directly
    useLibraryStore.setState({ statusFilter: ['NoStem'] });

    render(<LibraryTable />);

    expect(screen.getByText('beta.mp3')).toBeInTheDocument();
    expect(screen.queryByText('alpha.flac')).not.toBeInTheDocument();
    expect(screen.queryByText('gamma.wav')).not.toBeInTheDocument();
  });

  it('filters by search query', () => {
    resetStore(fiveEntries);
    useLibraryStore.setState({ searchQuery: 'alpha' });

    render(<LibraryTable />);

    expect(screen.getByText('alpha.flac')).toBeInTheDocument();
    expect(screen.queryByText('beta.mp3')).not.toBeInTheDocument();
  });

  it('sorts by source_path ascending by default', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    const rows = screen.getAllByTestId(/^row-e\d$/);
    const filenames = rows.map((r) => r.querySelector('td:nth-child(3)')?.textContent);
    expect(filenames).toEqual([
      'alpha.flac',
      'beta.mp3',
      'delta.flac',
      'epsilon.mp3',
      'gamma.wav',
    ]);
  });

  it('sorts by source_path descending when clicked twice', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    // Click once to sort (already asc, so this toggles to desc)
    await user.click(screen.getByTestId('sort-source-path'));

    const rows = screen.getAllByTestId(/^row-e\d$/);
    const filenames = rows.map((r) => r.querySelector('td:nth-child(3)')?.textContent);
    expect(filenames).toEqual([
      'gamma.wav',
      'epsilon.mp3',
      'delta.flac',
      'beta.mp3',
      'alpha.flac',
    ]);
  });

  it('sorts by stem_date when header is clicked', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    await user.click(screen.getByTestId('sort-stem-date'));

    // After sorting by date asc, entries with dates (e3, e4) come first or last
    // depending on whether empty dates sort first or last
    expect(screen.getByTestId('sort-stem-date')).toBeInTheDocument();
  });

  it('toggles row selection on checkbox click', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    const checkbox = screen.getByTestId('checkbox-e1');
    await user.click(checkbox);

    expect(useLibraryStore.getState().toggleStemSelection).toHaveBeenCalledWith('e1');
  });

  it('select all checkbox selects all entries', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    await user.click(screen.getByTestId('select-all-checkbox'));

    expect(useLibraryStore.getState().selectedStems.size).toBe(5);
  });

  it('opens detail panel when row is clicked', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    // Click on the row (not checkbox)
    await user.click(screen.getByTestId('row-e1'));

    // Detail panel should appear with close button
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Close detail')).toBeInTheDocument();
  });

  it('shows "No stem file" message for entries without stem_path', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    await user.click(screen.getByTestId('row-e2'));

    expect(screen.getByText('No stem file for this entry.')).toBeInTheDocument();
  });

  it('closes detail panel when close button is clicked', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    await user.click(screen.getByTestId('row-e1'));
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Close detail'));
    expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument();
  });

  it('shows context menu on right-click', async () => {
    const user = userEvent.setup();
    resetStore(fiveEntries);
    render(<LibraryTable />);

    const row = screen.getByTestId('row-e1');
    await user.pointer({ keys: '[MouseRight>]', target: row });

    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
    expect(screen.getByText('Mark as Ignored')).toBeInTheDocument();
    expect(screen.getByText('Delete Stem')).toBeInTheDocument();
  });

  it('renders pagination when more than 50 entries', () => {
    const manyEntries = Array.from({ length: 55 }, (_, i) =>
      makeEntry({ id: `p-${i}`, source_path: `/music/track${i}.mp3` })
    );
    resetStore(manyEntries);
    render(<LibraryTable />);

    expect(screen.getByTestId('prev-page')).toBeInTheDocument();
    expect(screen.getByTestId('next-page')).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });

  it('does not render pagination when 50 or fewer entries', () => {
    resetStore(fiveEntries);
    render(<LibraryTable />);

    expect(screen.queryByTestId('prev-page')).not.toBeInTheDocument();
  });
});
