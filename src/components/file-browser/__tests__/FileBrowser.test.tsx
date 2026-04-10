import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FileBrowser } from '../FileBrowser';
import { useAppStore } from '@/stores/appStore';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mockListen = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const capturedHandlers: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// Mock the dialog plugin so handleOpenFiles doesn't call the real OS dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeMetadata = (path: string) => ({
  path,
  name: path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'file',
  format: path.split('.').pop() ?? 'wav',
  duration: 180,
  size: 10_485_760,
  sample_rate: 44100,
  channels: 2,
  bit_depth: 16,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupMocks() {
  for (const key of Object.keys(capturedHandlers)) {
    delete capturedHandlers[key];
  }
  // listen() captures handlers keyed by event name
  mockListen.mockImplementation(async (eventName: string, handler: (...args: unknown[]) => void) => {
    capturedHandlers[eventName] = handler;
    return vi.fn(); // unlisten fn
  });

  mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_audio_info') {
      return fakeMetadata(args?.path as string);
    }
    return undefined;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FileBrowser drag-and-drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
    // Reset store to clean state
    useAppStore.setState({ audioFiles: [], jobs: [], selectedFile: null });
  });

  it('adds a file when tauri://drag-drop fires with correct payload shape', async () => {
    render(<FileBrowser />);

    // Wait for listeners to register
    await waitFor(() => {
      expect(capturedHandlers['tauri://drag-drop']).toBeDefined();
    });

    // Simulate a drag-drop event with correct Tauri v2 shape
    capturedHandlers['tauri://drag-drop']({
      payload: { paths: ['/tmp/test.wav'] },
    });

    await waitFor(() => {
      const files = useAppStore.getState().audioFiles;
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/tmp/test.wav');
    });
  });

  it('does NOT add a file when drag-drop fires with old wrong shape (no payload wrapper)', async () => {
    render(<FileBrowser />);

    await waitFor(() => {
      expect(capturedHandlers['tauri://drag-drop']).toBeDefined();
    });

    // Simulate old broken shape — event has paths directly, not event.payload.paths
    // This will throw internally (event.payload is undefined) but must NOT add a file.
    // Suppress the expected unhandled rejection from the async handler.
    const handler = capturedHandlers['tauri://drag-drop'] as (...args: unknown[]) => Promise<void>;
    const promise = handler({ paths: ['/tmp/test.wav'] }).catch(() => {});

    await promise;
    await new Promise((r) => setTimeout(r, 50));

    expect(useAppStore.getState().audioFiles).toHaveLength(0);
  });

  it('sets isDraggingOver=true on tauri://drag-enter', async () => {
    render(<FileBrowser />);

    await waitFor(() => {
      expect(capturedHandlers['tauri://drag-enter']).toBeDefined();
    });

    capturedHandlers['tauri://drag-enter']({});

    await waitFor(() => {
      const dropZone = screen.getByTestId('drop-zone');
      expect(dropZone.className).toContain('bg-primary/10');
    });
  });

  it('sets isDraggingOver=false on tauri://drag-leave', async () => {
    render(<FileBrowser />);

    await waitFor(() => {
      expect(capturedHandlers['tauri://drag-leave']).toBeDefined();
    });

    // First drag-enter so we can verify drag-leave removes the class
    capturedHandlers['tauri://drag-enter']({});
    await waitFor(() => {
      expect(screen.getByTestId('drop-zone').className).toContain('bg-primary/10');
    });

    capturedHandlers['tauri://drag-leave']({});
    await waitFor(() => {
      const dropZone = screen.getByTestId('drop-zone');
      expect(dropZone.className).not.toContain('bg-primary/10');
    });
  });
});
