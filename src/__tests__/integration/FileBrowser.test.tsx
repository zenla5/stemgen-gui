import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileBrowser } from '@/components/file-browser/FileBrowser';
import { useAppStore } from '@/stores/appStore';

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    path: '/test/audio.mp3',
    name: 'audio.mp3',
    format: 'mp3',
    duration: 180,
    sample_rate: 44100,
    channels: 2,
    size: 5000000,
  }),
}));

// ─── Store reset helper ────────────────────────────────────────────────────────

function resetStore() {
  useAppStore.setState({
    audioFiles: [],
    selectedFile: null,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileBrowser', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('renders the drop zone with correct placeholder text', () => {
    render(<FileBrowser />);

    expect(screen.getByText(/drag & drop audio files/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
  });

  it('renders the Open Files button', () => {
    render(<FileBrowser />);

    expect(screen.getByRole('button', { name: /open audio files/i })).toBeInTheDocument();
  });

  it('renders the drop zone as a button', () => {
    render(<FileBrowser />);

    expect(screen.getByRole('button', { name: /drop zone/i })).toBeInTheDocument();
  });

  it('renders empty state when no files are selected', () => {
    render(<FileBrowser />);

    // File count should show 0 files
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
