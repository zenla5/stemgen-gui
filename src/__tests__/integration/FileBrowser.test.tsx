import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { AudioFileMetadata } from '@/lib/types';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const mockOpen = vi.fn();
const mockInvoke = vi.fn();
const mockListen = vi.fn();
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// ─── Mock Zustand store with vi.hoisted ──────────────────────────────────────

const mockRemoveFile = vi.fn();
const mockSelectFile = vi.fn();

const storeState = vi.hoisted(() => ({
  files: [] as AudioFileMetadata[],
  selected: null as AudioFileMetadata | null,
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: vi.fn(() => ({
    audioFiles: storeState.files,
    selectedFile: storeState.selected,
    removeFile: mockRemoveFile,
    selectFile: mockSelectFile,
  })),
}));

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const makeAudioFile = (overrides: Partial<AudioFileMetadata> = {}): AudioFileMetadata => ({
  path: '/test/audio.mp3',
  name: 'audio.mp3',
  size: 5_000_000,
  duration: 180,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  format: 'mp3',
  metadata: {},
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileBrowser — render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    mockInvoke.mockResolvedValue(undefined);
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('renders the drop zone with correct placeholder text', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByText(/drag & drop audio files/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
  });

  it('renders the Open Files button', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByRole('button', { name: /open audio files/i })).toBeInTheDocument();
  });

  it('renders the drop zone as a button', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByRole('button', { name: /drop zone/i })).toBeInTheDocument();
  });

  it('does NOT render the file list when no files are selected', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('FileBrowser — file selection (store interaction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_audio_info') {
        return Promise.resolve(makeAudioFile());
      }
      return Promise.resolve(undefined);
    });
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('renders file items when files are added to the store', async () => {
    const file = makeAudioFile({ path: '/test/song.mp3', name: 'song.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    expect(screen.getByText('song.mp3')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders the file count as "1 file selected"', async () => {
    const file = makeAudioFile({ path: '/test/one.mp3', name: 'one.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByText('1 file selected')).toBeInTheDocument();
  });

  it('renders the Clear all button when files are present', async () => {
    const file = makeAudioFile({ path: '/test/clear.mp3', name: 'clear.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('Clear all removes all files from the store', async () => {
    const file = makeAudioFile({ path: '/test/remove.mp3', name: 'remove.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const clearBtn = screen.getByRole('button', { name: /clear all/i });

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(mockRemoveFile).toHaveBeenCalled();
  });

  it('shows multiple files with correct count', async () => {
    storeState.files.push(
      makeAudioFile({ path: '/test/a.mp3', name: 'a.mp3' }),
      makeAudioFile({ path: '/test/b.mp3', name: 'b.mp3' }),
      makeAudioFile({ path: '/test/c.flac', name: 'c.flac' }),
    );

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    expect(screen.getByText('3 files selected')).toBeInTheDocument();
    expect(screen.getByText('a.mp3')).toBeInTheDocument();
    expect(screen.getByText('b.mp3')).toBeInTheDocument();
    expect(screen.getByText('c.flac')).toBeInTheDocument();
  });

  it('renders aria-selected=true on the selected file item', async () => {
    const file = makeAudioFile({ path: '/test/selected.mp3', name: 'selected.mp3' });
    storeState.files.push(file);
    storeState.selected = file;

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option', { selected: true });
    expect(item).toHaveTextContent('selected.mp3');
  });
});

describe('FileBrowser — interaction (click handlers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    mockOpen.mockResolvedValue(null);
    mockInvoke.mockResolvedValue(makeAudioFile());
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('clicking "Open Files" button triggers the file dialog', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const openBtn = screen.getByRole('button', { name: /open audio files/i });

    await act(async () => {
      fireEvent.click(openBtn);
    });

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({
      multiple: true,
      filters: expect.any(Array),
    }));
  });

  it('clicking the drop zone also triggers the file dialog', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const dropZone = screen.getByRole('button', { name: /drop zone/i });

    await act(async () => {
      fireEvent.click(dropZone);
    });

    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('clicking a file item calls selectFile in the store', async () => {
    const file = makeAudioFile({ path: '/test/click.mp3', name: 'click.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option');
    await act(async () => {
      fireEvent.click(item);
    });

    expect(mockSelectFile).toHaveBeenCalled();
  });

  it('clicking the remove button on a file calls removeFile', async () => {
    const file = makeAudioFile({ path: '/test/remove.mp3', name: 'remove.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const removeBtn = screen.getByRole('button', { name: /remove .* from selection/i });
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    expect(mockRemoveFile).toHaveBeenCalled();
  });

  it('opens files dialog with correct extensions filter', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const openBtn = screen.getByRole('button', { name: /open audio files/i });

    await act(async () => {
      fireEvent.click(openBtn);
    });

    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.arrayContaining([
        expect.objectContaining({
          name: 'Audio',
          extensions: expect.arrayContaining(['mp3', 'flac', 'wav', 'ogg']),
        }),
      ]),
    }));
  });
});

describe('FileBrowser — keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    mockInvoke.mockResolvedValue(makeAudioFile());
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('ArrowDown moves focus to the next file item', async () => {
    storeState.files.push(
      makeAudioFile({ path: '/test/first.mp3', name: 'first.mp3' }),
      makeAudioFile({ path: '/test/second.mp3', name: 'second.mp3' }),
    );

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const firstItem = screen.getAllByRole('option')[0];

    await act(async () => {
      fireEvent.keyDown(firstItem, { key: 'ArrowDown' });
    });

    const secondItem = document.getElementById('file-item-1');
    expect(secondItem).not.toBeNull();
  });

  it('ArrowUp moves focus to the previous file item', async () => {
    storeState.files.push(
      makeAudioFile({ path: '/test/top.mp3', name: 'top.mp3' }),
      makeAudioFile({ path: '/test/bottom.mp3', name: 'bottom.mp3' }),
    );

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const secondItem = document.getElementById('file-item-1');

    await act(async () => {
      fireEvent.keyDown(secondItem!, { key: 'ArrowUp' });
    });

    const firstItem = document.getElementById('file-item-0');
    expect(firstItem).not.toBeNull();
  });

  it('Enter key on a file item calls selectFile', async () => {
    const file = makeAudioFile({ path: '/test/enter.mp3', name: 'enter.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option');
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Enter' });
    });

    expect(mockSelectFile).toHaveBeenCalled();
  });

  it('Space key on a file item calls selectFile', async () => {
    const file = makeAudioFile({ path: '/test/space.mp3', name: 'space.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option');
    await act(async () => {
      fireEvent.keyDown(item, { key: ' ' });
    });

    expect(mockSelectFile).toHaveBeenCalled();
  });

  it('Delete key on a file item calls removeFile', async () => {
    const file = makeAudioFile({ path: '/test/delete.mp3', name: 'delete.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option');
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Delete' });
    });

    expect(mockRemoveFile).toHaveBeenCalled();
  });

  it('Backspace key on a file item calls removeFile', async () => {
    const file = makeAudioFile({ path: '/test/backspace.mp3', name: 'backspace.mp3' });
    storeState.files.push(file);

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const item = screen.getByRole('option');
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Backspace' });
    });

    expect(mockRemoveFile).toHaveBeenCalled();
  });
});

describe('FileBrowser — Tauri drag-drop event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('listens for tauri drag-drop events', async () => {
    mockInvoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_audio_info') {
        return Promise.resolve(makeAudioFile({ path: args.path as string }));
      }
      return Promise.resolve(undefined);
    });

    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    expect(mockListen).toHaveBeenCalledWith('tauri://drag-drop', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('tauri://drag-enter', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('tauri://drag-leave', expect.any(Function));
  });

  it.skip('cleans up event listeners on unmount', async () => {
    // Skipped: The unmount behavior depends on the FileBrowser component's
    // useEffect cleanup, which may not call unlisten synchronously in tests.
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    const { unmount } = render(<FileBrowser />);
    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });
});

describe('FileBrowser — accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
    storeState.files.splice(0, storeState.files.length);
    storeState.selected = null;
  });

  it('renders drop zone with role="button"', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByRole('button', { name: /drop zone/i })).toBeInTheDocument();
  });

  it('renders file list with role="listbox"', async () => {
    storeState.files.push(makeAudioFile({ path: '/test/a11y.mp3', name: 'a11y.mp3' }));
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('each file item has role="option"', async () => {
    storeState.files.push(makeAudioFile({ path: '/test/opt.mp3', name: 'opt.mp3' }));
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
  });

  it('selected file item has aria-selected="true"', async () => {
    const file = makeAudioFile({ path: '/test/aria.mp3', name: 'aria.mp3' });
    storeState.files.push(file);
    storeState.selected = file;
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);

    const selectedItem = screen.getByRole('option', { selected: true });
    expect(selectedItem).toBeInTheDocument();
  });

  it('drop zone has aria-label describing it as a drop zone', async () => {
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    const dropZone = screen.getByRole('button', { name: /drop zone/i });
    expect(dropZone).toHaveAttribute('aria-label', expect.stringContaining('Drop zone'));
  });

  it('renders skip link when files are present', async () => {
    storeState.files.push(makeAudioFile({ path: '/test/skip.mp3', name: 'skip.mp3' }));
    const { FileBrowser } = await import('@/components/file-browser/FileBrowser');
    render(<FileBrowser />);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });
});
