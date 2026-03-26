import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FileBrowser } from '@/components/file-browser/FileBrowser';
import { useAppStore } from '@/stores/appStore';
import type { AudioFileMetadata } from '@/lib/types';

// ─── Inline mock factories (hoisted via vi.hoisted) ──────────────────────────

const FAKE_AUDIO_INFO: AudioFileMetadata = {
  path: '/fake/audio/test.mp3',
  name: 'test.mp3',
  size: 4_194_304,
  duration: 180.5,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  format: 'mp3',
  metadata: { title: 'Test Track', artist: 'Test Artist' },
};

const { mockInvoke, mockListen, mockOpen } = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();

  const mockListenImpl = vi.fn().mockImplementation(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(event, handler as (payload: unknown) => void);
      return () => handlers.delete(event);
    }
  );

  function emitTauriEvent(event: string, payload: unknown) {
    const handler = handlers.get(event);
    if (handler) handler(payload);
  }

  const mockInvokeImpl = vi.fn().mockImplementation(
    async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_audio_info':
          return { ...FAKE_AUDIO_INFO, ...(args as Partial<AudioFileMetadata>) };
        case 'check_dependencies':
          return {
            ffmpeg: true, ffmpeg_version: '6.0', sox: true, sox_version: '14.4.2',
            python: true, python_version: '3.11.0', cuda: false, mps: false,
            model_directory: '/fake/models', model_count: 4,
          };
        case 'get_models':
          return ['demucs', 'bs_roformer', 'htdemucs', 'htdemucs_ft'];
        case 'start_separation':
          return { job_id: 'mock-job-id' };
        default:
          return undefined;
      }
    }
  );

  const mockOpenImpl = vi.fn().mockResolvedValue(['/fake/audio/track1.mp3', '/fake/audio/track2.flac']);

  return { mockInvoke: mockInvokeImpl, mockListen: mockListenImpl, mockOpen: mockOpenImpl, emitTauriEvent };
});

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mockOpen }));

// ─── Store reset helper ───────────────────────────────────────────────────────

function resetStore() {
  useAppStore.setState({ audioFiles: [], selectedFile: null });
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

  it('renders without crashing', () => {
    render(<FileBrowser />);
    expect(screen.getByText(/drag & drop audio files/i)).toBeInTheDocument();
  });

  it('displays file names after files are added', () => {
    render(<FileBrowser />);

    act(() => {
      useAppStore.getState().addFiles([
        { ...FAKE_AUDIO_INFO, path: '/test.mp3', name: 'test.mp3' },
        { ...FAKE_AUDIO_INFO, path: '/track.flac', name: 'track.flac' },
      ]);
    });

    expect(screen.getByText('test.mp3')).toBeInTheDocument();
    expect(screen.getByText('track.flac')).toBeInTheDocument();
  });

  it('shows correct file count when files are added', () => {
    render(<FileBrowser />);

    act(() => {
      useAppStore.getState().addFiles([
        { ...FAKE_AUDIO_INFO, path: '/test.mp3', name: 'test.mp3' },
      ]);
    });

    expect(screen.getByText(/1 file selected/i)).toBeInTheDocument();
  });

  it('shows plural "files" for more than one file', () => {
    render(<FileBrowser />);

    act(() => {
      useAppStore.getState().addFiles([
        { ...FAKE_AUDIO_INFO, path: '/a.mp3', name: 'a.mp3' },
        { ...FAKE_AUDIO_INFO, path: '/b.mp3', name: 'b.mp3' },
      ]);
    });

    expect(screen.getByText(/2 files selected/i)).toBeInTheDocument();
  });
});
