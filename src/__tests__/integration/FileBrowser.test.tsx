import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FileBrowser } from '@/components/file-browser/FileBrowser';
import { useAppStore } from '@/stores/appStore';
import { createMockInvoke, createMockListen, createMockOpen, FAKE_AUDIO_INFO } from './setup';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: createMockInvoke(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: createMockListen().mock,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: createMockOpen(),
}));

// ─── Store reset helper ───────────────────────────────────────────────────────

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
    expect(screen.getByRole('button', { name: /open files/i })).toBeInTheDocument();
  });

  it('shows "Drop audio files here" when isDraggingOver is true', async () => {
    const user = userEvent.setup();
    render(<FileBrowser />);

    const dropZone = screen.getByText(/drag & drop audio files/i).closest('div');
    if (dropZone) {
      fireEvent.dragEnter(dropZone);
      await waitFor(() => {
        expect(screen.getByText(/drop audio files here/i)).toBeInTheDocument();
      });
    }
  });

  it('calls addFiles when files are added via store', async () => {
    const addFilesSpy = vi.spyOn(useAppStore.getState(), 'addFiles');
    render(<FileBrowser />);

    useAppStore.getState().addFiles([{ ...FAKE_AUDIO_INFO, path: '/test.mp3', name: 'test.mp3' }]);

    await waitFor(() => {
      expect(addFilesSpy).toHaveBeenCalled();
    });
  });

  it('displays file names after files are added', async () => {
    render(<FileBrowser />);

    useAppStore.getState().addFiles([
      { ...FAKE_AUDIO_INFO, path: '/test.mp3', name: 'test.mp3' },
      { ...FAKE_AUDIO_INFO, path: '/track.flac', name: 'track.flac' },
    ]);

    await waitFor(() => {
      expect(screen.getByText('test.mp3')).toBeInTheDocument();
      expect(screen.getByText('track.flac')).toBeInTheDocument();
    });
  });

  it('shows correct file count when files are added', async () => {
    render(<FileBrowser />);

    useAppStore.getState().addFiles([
      { ...FAKE_AUDIO_INFO, path: '/test.mp3', name: 'test.mp3' },
    ]);

    await waitFor(() => {
      expect(screen.getByText(/1 file selected/i)).toBeInTheDocument();
    });
  });

  it('shows plural "files" for more than one file', async () => {
    render(<FileBrowser />);

    useAppStore.getState().addFiles([
      { ...FAKE_AUDIO_INFO, path: '/a.mp3', name: 'a.mp3' },
      { ...FAKE_AUDIO_INFO, path: '/b.mp3', name: 'b.mp3' },
    ]);

    await waitFor(() => {
      expect(screen.getByText(/2 files selected/i)).toBeInTheDocument();
    });
  });
});
