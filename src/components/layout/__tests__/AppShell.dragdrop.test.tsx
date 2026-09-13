/**
 * Tests for the app-wide .stem.mp4 drag-drop handling in AppShell (#263).
 *
 * AppShell registers a native `tauri://drag-drop` listener that recognizes
 * .stem.mp4 stem packs on ANY view and loads them into the Stem Mixer, while
 * leaving regular separable audio (handled by FileBrowser) untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockListeners: Record<string, (event: any) => void> = {};
const mockLoadStemPack = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (event: any) => void) => {
    mockListeners[event] = handler;
    return Promise.resolve(() => {
      delete mockListeners[event];
    });
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    vi.fn(() => ({
      activeView: 'files',
      sidebarCollapsed: false,
      isProcessing: false,
      currentJobId: null,
    })),
    { getState: vi.fn(() => ({ loadStemPack: mockLoadStemPack })) }
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/components/layout/Header', () => ({
  Header: () => <div data-testid="header" />,
}));
vi.mock('@/components/layout/StatusBar', () => ({
  StatusBar: () => <div data-testid="statusbar" />,
}));
vi.mock('@/components/file-browser/FileBrowser', () => ({
  FileBrowser: () => <div data-testid="files" />,
}));
vi.mock('@/components/processing/ProcessingQueue', () => ({
  ProcessingQueue: () => <div />,
}));
vi.mock('@/components/mixer/StemMixer', () => ({
  StemMixer: () => <div data-testid="mixer" />,
}));
vi.mock('@/components/settings/SettingsPanel', () => ({
  SettingsPanel: () => <div />,
}));
vi.mock('@/components/library/LibraryView', () => ({
  LibraryView: () => <div />,
}));

import { AppShell } from '../AppShell';

describe('AppShell .stem.mp4 drag-drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockListeners).forEach((k) => delete mockListeners[k]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers a tauri://drag-drop listener on mount', async () => {
    render(<AppShell />);
    await waitFor(() => {
      expect(mockListeners['tauri://drag-drop']).toBeDefined();
      expect(mockListeners['tauri://drag-enter']).toBeDefined();
      expect(mockListeners['tauri://drag-leave']).toBeDefined();
    });
  });

  it('loads a dropped .stem.mp4 into the mixer via loadStemPack', async () => {
    mockLoadStemPack.mockResolvedValue(undefined);
    render(<AppShell />);
    await waitFor(() => {
      expect(mockListeners['tauri://drag-drop']).toBeDefined();
    });

    mockListeners['tauri://drag-drop']({
      payload: { paths: ['/music/track.stem.mp4', '/music/other.note.txt'] },
    });

    // Wait a tick for the async handler to run
    await new Promise((r) => setTimeout(r, 20));
    expect(mockLoadStemPack).toHaveBeenCalledTimes(1);
    expect(mockLoadStemPack).toHaveBeenCalledWith('/music/track.stem.mp4');
  });

  it('ignores regular audio drops (handled by FileBrowser)', async () => {
    render(<AppShell />);
    await waitFor(() => {
      expect(mockListeners['tauri://drag-drop']).toBeDefined();
    });

    mockListeners['tauri://drag-drop']({ payload: { paths: ['/music/song.wav'] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockLoadStemPack).not.toHaveBeenCalled();
  });
});
