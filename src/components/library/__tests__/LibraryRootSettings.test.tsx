import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryRootSettings } from '@/components/library/LibraryRootSettings';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryRoot } from '@/lib/types/library';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri dialog plugin
const mockOpen = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
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

const sampleRootMirrored: LibraryRoot = {
  id: 'root-2',
  path: '/music2',
  output_strategy: 'mirrored',
  mirrored_path: '/output',
  scan_policy: 'manual',
  created_at: '2026-02-01T00:00:00Z',
  staleness_policy: JSON.stringify({
    check_source_modified: true,
    check_model_outdated: true,
    check_parameters_changed: false,
    flag_unknown_provenance: true,
    prefer_model_family: 'roformer',
    quality_rank_threshold: 2,
    age_days_threshold: 90,
  }),
  ignored_globs: JSON.stringify(['*.tmp', '*.bak']),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStore(roots: LibraryRoot[] = []) {
  useLibraryStore.setState({
    libraryRoots: roots,
    isScanning: false,
    loadLibraryRoots: vi.fn(),
    addLibraryRoot: vi.fn().mockResolvedValue('new-id'),
    updateLibraryRoot: vi.fn().mockResolvedValue(undefined),
    deleteLibraryRoot: vi.fn().mockResolvedValue(undefined),
    scanLibraryRoot: vi.fn().mockResolvedValue(undefined),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LibraryRootSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders empty state CTA when no roots configured', () => {
    render(<LibraryRootSettings onClose={vi.fn()} />);

    expect(screen.getByText('No library roots configured.')).toBeInTheDocument();
    expect(screen.getByTestId('empty-add-root-btn')).toBeInTheDocument();
  });

  it('renders root list with path and strategy badge when roots exist', () => {
    resetStore([sampleRoot]);
    render(<LibraryRootSettings onClose={vi.fn()} />);

    expect(screen.getByText('/music')).toBeInTheDocument();
    expect(screen.getByText('alongside')).toBeInTheDocument();
  });

  it('calls loadLibraryRoots on mount', () => {
    const loadSpy = vi.fn();
    useLibraryStore.setState({ loadLibraryRoots: loadSpy });

    render(<LibraryRootSettings onClose={vi.fn()} />);

    expect(loadSpy).toHaveBeenCalledOnce();
  });

  it('Add Root button opens folder picker', async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue(null);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('add-root-btn'));

    expect(mockOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Select Library Root Folder',
    });
  });

  it('add root flow: folder selected calls addLibraryRoot', async () => {
    const user = userEvent.setup();
    const addSpy = vi.fn().mockResolvedValue('new-id');
    useLibraryStore.setState({ addLibraryRoot: addSpy });
    mockOpen.mockResolvedValue('/new/music/path');

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('add-root-btn'));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('/new/music/path', 'alongside');
    });
  });

  it('add root flow: folder cancelled does nothing', async () => {
    const user = userEvent.setup();
    const addSpy = vi.fn().mockResolvedValue('new-id');
    useLibraryStore.setState({ addLibraryRoot: addSpy });
    mockOpen.mockResolvedValue(null);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('add-root-btn'));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('Scan Now button calls scanLibraryRoot', async () => {
    const user = userEvent.setup();
    const scanSpy = vi.fn().mockResolvedValue(undefined);
    resetStore([sampleRoot]);
    useLibraryStore.setState({ scanLibraryRoot: scanSpy });

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('scan-root-1'));

    expect(scanSpy).toHaveBeenCalledWith('root-1', true);
  });

  it('Delete button shows inline confirmation', async () => {
    const user = userEvent.setup();
    resetStore([sampleRoot]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('delete-root-1'));

    expect(screen.getByTestId('confirm-delete-root-1')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-delete-root-1')).toBeInTheDocument();
  });

  it('Delete confirm calls deleteLibraryRoot', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    resetStore([sampleRoot]);
    useLibraryStore.setState({ deleteLibraryRoot: deleteSpy });

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('delete-root-1'));
    await user.click(screen.getByTestId('confirm-delete-root-1'));

    expect(deleteSpy).toHaveBeenCalledWith('root-1');
  });

  it('Delete cancel hides confirmation', async () => {
    const user = userEvent.setup();
    resetStore([sampleRoot]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('delete-root-1'));
    expect(screen.getByTestId('confirm-delete-root-1')).toBeInTheDocument();

    await user.click(screen.getByTestId('cancel-delete-root-1'));
    expect(screen.queryByTestId('confirm-delete-root-1')).not.toBeInTheDocument();
  });

  it('Edit button expands edit form with strategy select and sections', async () => {
    const user = userEvent.setup();
    resetStore([sampleRoot]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));

    expect(screen.getByTestId('output-strategy-select')).toBeInTheDocument();
    expect(screen.getByTestId('prefer-model-family-input')).toBeInTheDocument();
    expect(screen.getByTestId('quality-rank-input')).toBeInTheDocument();
    expect(screen.getByTestId('age-days-input')).toBeInTheDocument();
    expect(screen.getByTestId('flag-unknown-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('ignore-patterns-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('save-btn')).toBeInTheDocument();
  });

  it('Save calls updateLibraryRoot with correct payload including serialized JSON', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    resetStore([sampleRoot]);
    useLibraryStore.setState({ updateLibraryRoot: updateSpy });

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));
    await user.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'root-1',
        expect.objectContaining({
          output_strategy: 'alongside',
          staleness_policy: expect.any(String),
          ignored_globs: expect.any(String),
        })
      );
    });

    // Verify staleness_policy is valid JSON
    const callArgs = updateSpy.mock.calls[0][1];
    const staleness = JSON.parse(callArgs.staleness_policy);
    expect(staleness).toHaveProperty('check_source_modified');

    // Verify ignored_globs is a valid JSON array
    const globs = JSON.parse(callArgs.ignored_globs);
    expect(Array.isArray(globs)).toBe(true);
  });

  it('handles malformed staleness_policy JSON gracefully', async () => {
    const user = userEvent.setup();
    resetStore([{ ...sampleRoot, staleness_policy: 'not-json' }]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));

    // Should render without crashing and show default values
    expect(screen.getByTestId('output-strategy-select')).toBeInTheDocument();
  });

  it('handles malformed ignored_globs JSON gracefully', async () => {
    const user = userEvent.setup();
    resetStore([{ ...sampleRoot, ignored_globs: 'not-json' }]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));

    // Textarea should be empty (not crash)
    const textarea = screen.getByTestId('ignore-patterns-textarea');
    expect(textarea).toHaveValue('');
  });

  it('close button calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<LibraryRootSettings onClose={onClose} />);
    await user.click(screen.getByLabelText('Close settings'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('edit form pre-populates from root with staleness policy and globs', async () => {
    const user = userEvent.setup();
    resetStore([sampleRootMirrored]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-2'));

    expect(screen.getByTestId('output-strategy-select')).toHaveValue('mirrored');
    expect(screen.getByTestId('mirrored-path-input')).toHaveValue('/output');
    expect(screen.getByTestId('prefer-model-family-input')).toHaveValue('roformer');
    expect(screen.getByTestId('quality-rank-input')).toHaveValue(2);
    expect(screen.getByTestId('age-days-input')).toHaveValue(90);
    expect(screen.getByTestId('flag-unknown-checkbox')).toBeChecked();
    expect(screen.getByTestId('ignore-patterns-textarea')).toHaveValue('*.tmp\n*.bak');
  });

  it('changing output strategy shows/hides path fields', async () => {
    const user = userEvent.setup();
    resetStore([sampleRoot]);

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));

    // Initially alongside — no path inputs
    expect(screen.queryByTestId('mirrored-path-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flat-path-input')).not.toBeInTheDocument();

    // Switch to mirrored
    await user.selectOptions(screen.getByTestId('output-strategy-select'), 'mirrored');
    expect(screen.getByTestId('mirrored-path-input')).toBeInTheDocument();
    expect(screen.queryByTestId('flat-path-input')).not.toBeInTheDocument();

    // Switch to flat
    await user.selectOptions(screen.getByTestId('output-strategy-select'), 'flat');
    expect(screen.queryByTestId('flat-path-input')).toBeInTheDocument();
    expect(screen.queryByTestId('mirrored-path-input')).not.toBeInTheDocument();
  });

  it('save error is displayed when updateLibraryRoot fails', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.fn().mockRejectedValue(new Error('DB error'));
    resetStore([sampleRoot]);
    useLibraryStore.setState({ updateLibraryRoot: updateSpy });

    render(<LibraryRootSettings onClose={vi.fn()} />);
    await user.click(screen.getByTestId('edit-root-1'));
    await user.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('save-error')).toHaveTextContent('DB error');
    });
  });
});
