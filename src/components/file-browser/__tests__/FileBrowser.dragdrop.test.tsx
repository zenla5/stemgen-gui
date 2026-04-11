/**
 * Tests for drag-and-drop payload handling in FileBrowser (TASK-014).
 *
 * Validates that the Tauri v2 Event<T> wrapper is correctly used:
 * - event.payload.paths (correct)
 * - NOT event.paths (broken pre-v2 API)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { FileBrowser } from '../FileBrowser';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
  SUPPORTED_AUDIO_FORMATS: ['mp3', 'flac', 'wav', 'ogg', 'm4a'],
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';

describe('FileBrowser drag-and-drop', () => {
  const mockAddFiles = vi.fn();
  const mockRemoveFile = vi.fn();
  const mockSelectFile = vi.fn();
  const mockAudioFiles: any[] = [];
  const mockSelectedFile = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useAppStore to return our mock functions
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      audioFiles: mockAudioFiles,
      addFiles: mockAddFiles,
      removeFile: mockRemoveFile,
      selectFile: mockSelectFile,
      selectedFile: mockSelectedFile,
    });

    // Mock listen to capture callbacks
    (listen as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(() => {});
  });

  it('should call addFiles with correct path when drag-drop event uses payload.paths (Tauri v2 API)', async () => {
    // Capture the registered callback
    let registeredCallback: ((event: any) => void) | null = null;
    (listen as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, callback: (event: any) => void) => {
        if (_event === 'tauri://drag-drop') {
          registeredCallback = callback;
        }
        return Promise.resolve(() => {});
      }
    );

    // Mock invoke to return audio metadata
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: '/tmp/test.wav',
      name: 'test',
      format: 'wav',
      duration: 120,
      size: 1024000,
      sample_rate: 44100,
    });

    render(<FileBrowser />);

    // Wait for listeners to be registered
    await waitFor(() => {
      expect(registeredCallback).not.toBeNull();
    });

    // Simulate drag-drop event with Tauri v2 payload structure
    const dragDropEvent = {
      payload: {
        paths: ['/tmp/test.wav'],
      },
    };

    await registeredCallback!(dragDropEvent);

    // Wait for addFiles to be called
    await waitFor(() => {
      expect(mockAddFiles).toHaveBeenCalledTimes(1);
      expect(mockAddFiles).toHaveBeenCalledWith([
        expect.objectContaining({
          path: '/tmp/test.wav',
          name: 'test',
        }),
      ]);
    });
  });

  it('should NOT add files when event has paths without payload wrapper (old broken API)', async () => {
    // Capture the registered callback
    let registeredCallback: ((event: any) => void) | null = null;
    (listen as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, callback: (event: any) => void) => {
        if (_event === 'tauri://drag-drop') {
          registeredCallback = callback;
        }
        return Promise.resolve(() => {});
      }
    );

    render(<FileBrowser />);

    // Wait for listeners to be registered
    await waitFor(() => {
      expect(registeredCallback).not.toBeNull();
    });

    // Simulate old broken API structure (paths directly on event, not in payload)
    const oldBrokenEvent = {
      paths: ['/tmp/wrong.wav'],
    };

    await registeredCallback!(oldBrokenEvent);

    // Wait a bit to ensure addFiles is NOT called
    await new Promise((resolve) => setTimeout(resolve, 100));

    // addFiles should not have been called because event.payload.paths would be undefined
    expect(mockAddFiles).not.toHaveBeenCalled();
  });

  it('should handle multiple files in drag-drop payload', async () => {
    let registeredCallback: ((event: any) => void) | null = null;
    (listen as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, callback: (event: any) => void) => {
        if (_event === 'tauri://drag-drop') {
          registeredCallback = callback;
        }
        return Promise.resolve(() => {});
      }
    );

    (invoke as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        path: '/tmp/song1.wav',
        name: 'song1',
        format: 'wav',
        duration: 180,
        size: 2048000,
        sample_rate: 44100,
      })
      .mockResolvedValueOnce({
        path: '/tmp/song2.mp3',
        name: 'song2',
        format: 'mp3',
        duration: 240,
        size: 3072000,
        sample_rate: 44100,
      });

    render(<FileBrowser />);

    await waitFor(() => {
      expect(registeredCallback).not.toBeNull();
    });

    const dragDropEvent = {
      payload: {
        paths: ['/tmp/song1.wav', '/tmp/song2.mp3'],
      },
    };

    await registeredCallback!(dragDropEvent);

    await waitFor(() => {
      expect(mockAddFiles).toHaveBeenCalledTimes(1);
      expect(mockAddFiles).toHaveBeenCalledWith([
        expect.objectContaining({ path: '/tmp/song1.wav' }),
        expect.objectContaining({ path: '/tmp/song2.mp3' }),
      ]);
    });
  });

  it('should filter out unsupported file formats from drag-drop', async () => {
    let registeredCallback: ((event: any) => void) | null = null;
    (listen as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, callback: (event: any) => void) => {
        if (_event === 'tauri://drag-drop') {
          registeredCallback = callback;
        }
        return Promise.resolve(() => {});
      }
    );

    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: '/tmp/song.wav',
      name: 'song',
      format: 'wav',
      duration: 120,
      size: 1024000,
      sample_rate: 44100,
    });

    render(<FileBrowser />);

    await waitFor(() => {
      expect(registeredCallback).not.toBeNull();
    });

    // Mix of supported (.wav) and unsupported (.txt) files
    const dragDropEvent = {
      payload: {
        paths: ['/tmp/song.wav', '/tmp/readme.txt'],
      },
    };

    await registeredCallback!(dragDropEvent);

    await waitFor(() => {
      // Only the .wav file should be processed
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('get_audio_info', { path: '/tmp/song.wav' });
    });
  });
});