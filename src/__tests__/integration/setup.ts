/**
 * Shared mocks for React integration tests.
 * These mocks provide typed fake implementations of Tauri APIs.
 */
import { vi } from 'vitest';
import type { AudioFileMetadata } from '@/lib/types';

// --- invoke mock helpers ---

/** Default fake audio file metadata returned by `get_audio_info` */
export const FAKE_AUDIO_INFO: AudioFileMetadata = {
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

/** Creates a mock invoke function that returns typed responses for known commands */
export function createMockInvoke() {
  return vi.fn().mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'get_audio_info':
        return { ...FAKE_AUDIO_INFO, ...(args as Partial<AudioFileMetadata>) };
      case 'check_dependencies':
        return {
          ffmpeg: true,
          ffmpeg_version: 'ffmpeg version 6.0',
          sox: true,
          sox_version: 'SoX v14.4.2',
          python: true,
          python_version: 'Python 3.11.0',
          cuda: false,
          mps: false,
          model_directory: '/fake/models',
          model_count: 4,
        };
      case 'get_models':
        return ['demucs', 'bs_roformer', 'htdemucs', 'htdemucs_ft'];
      case 'start_separation':
        return { job_id: 'mock-job-id' };
      case 'cancel_separation':
        return { success: true };
      default:
        return undefined;
    }
  });
}

// --- listen mock helpers ---

/** Creates a mock listen function that returns an unlisten function.
 *  The callback is stored so tests can fire events manually. */
export function createMockListen() {
  const handlers = new Map<string, (payload: unknown) => void>();

  const mock = vi.fn().mockImplementation(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(event, handler as (payload: unknown) => void);
      return () => handlers.delete(event);
    }
  );

  /** Fire a fake Tauri event to all registered handlers */
  function emitTauriEvent(event: string, payload: unknown) {
    const handler = handlers.get(event);
    if (handler) handler(payload);
  }

  return { mock, emitTauriEvent };
}

// --- open dialog mock helper ---

/** Default fake file paths returned by the `open` dialog */
export const FAKE_DIALOG_PATHS = ['/fake/audio/track1.mp3', '/fake/audio/track2.flac'];

/** Creates a mock open dialog function */
export function createMockOpen() {
  return vi.fn().mockResolvedValue(FAKE_DIALOG_PATHS);
}

// Re-export common test fixtures
export { FAKE_AUDIO_INFO as defaultAudioInfo };
