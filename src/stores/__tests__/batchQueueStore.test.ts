import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import type { BatchQueueStatusSummary, BatchQueueResult } from '@/lib/types/library';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const fakeQueueStatus: BatchQueueStatusSummary = {
  pending_count: 3,
  processing_count: 1,
  done_count: 5,
  error_count: 0,
  cancelled_count: 1,
  total_count: 10,
  next_items: [
    {
      id: 'bq_1',
      root_id: 'root_1',
      source_path: '/music/track1.mp3',
      status: 'pending',
      model_id: 'bs_roformer',
      created_at: '2026-01-01T00:00:00Z',
      priority: 0,
    },
  ],
};

const fakeQueueResult: BatchQueueResult = {
  queued_count: 3,
  total_duration_secs: 0,
};

describe('batchQueueStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBatchQueueStore.setState({
      queueStatus: null,
      isProcessing: false,
      isPaused: false,
      queueError: null,
      unlisten: null,
    });
  });

  describe('loadQueueStatus', () => {
    it('loads queue status from backend', async () => {
      mockInvoke.mockResolvedValueOnce(fakeQueueStatus);

      await useBatchQueueStore.getState().loadQueueStatus('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('get_batch_queue_status', { rootId: 'root_1' });
      expect(useBatchQueueStore.getState().queueStatus).toEqual(fakeQueueStatus);
      expect(useBatchQueueStore.getState().isProcessing).toBe(true);
    });

    it('sets isProcessing to false when no processing items', async () => {
      const emptyStatus: BatchQueueStatusSummary = {
        ...fakeQueueStatus,
        processing_count: 0,
      };
      mockInvoke.mockResolvedValueOnce(emptyStatus);

      await useBatchQueueStore.getState().loadQueueStatus('root_1');

      expect(useBatchQueueStore.getState().isProcessing).toBe(false);
    });
  });

  describe('queueGenerate', () => {
    it('calls queue_batch_generate and reloads status', async () => {
      mockInvoke.mockResolvedValueOnce(fakeQueueResult);
      mockInvoke.mockResolvedValueOnce(fakeQueueStatus);

      const result = await useBatchQueueStore.getState().queueGenerate(
        'root_1',
        'bs_roformer',
        'traktor',
        'alac'
      );

      expect(result.queued_count).toBe(3);
      expect(mockInvoke).toHaveBeenCalledWith('queue_batch_generate', {
        rootId: 'root_1',
        modelId: 'bs_roformer',
        djPreset: 'traktor',
        outputFormat: 'alac',
      });
    });

    it('sets queueError on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Queue full'));

      await expect(
        useBatchQueueStore.getState().queueGenerate('root_1', 'demucs')
      ).rejects.toThrow('Queue full');

      expect(useBatchQueueStore.getState().queueError).toBe('Queue full');
    });
  });

  describe('queueRegenerate', () => {
    it('calls queue_batch_regenerate with correct params', async () => {
      mockInvoke.mockResolvedValueOnce(fakeQueueResult);
      mockInvoke.mockResolvedValueOnce(fakeQueueStatus);

      await useBatchQueueStore.getState().queueRegenerate(
        'root_1',
        'htdemucs_ft',
        true,
        'rekordbox',
        'aac'
      );

      expect(mockInvoke).toHaveBeenCalledWith('queue_batch_regenerate', {
        rootId: 'root_1',
        modelId: 'htdemucs_ft',
        includeUnknownProvenance: true,
        djPreset: 'rekordbox',
        outputFormat: 'aac',
      });
    });
  });

  describe('startProcessor', () => {
    it('calls start_batch_processor', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await useBatchQueueStore.getState().startProcessor('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('start_batch_processor', { rootId: 'root_1' });
      expect(useBatchQueueStore.getState().isProcessing).toBe(true);
    });
  });

  describe('pauseQueue', () => {
    it('calls pause_batch_queue and sets isPaused', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await useBatchQueueStore.getState().pauseQueue('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('pause_batch_queue', { rootId: 'root_1' });
      expect(useBatchQueueStore.getState().isPaused).toBe(true);
    });
  });

  describe('resumeQueue', () => {
    it('calls resume_batch_queue and clears isPaused', async () => {
      useBatchQueueStore.setState({ isPaused: true });
      mockInvoke.mockResolvedValueOnce(undefined);

      await useBatchQueueStore.getState().resumeQueue('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('resume_batch_queue', { rootId: 'root_1' });
      expect(useBatchQueueStore.getState().isPaused).toBe(false);
    });
  });

  describe('cancelQueue', () => {
    it('calls cancel_batch_queue and reloads status', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      mockInvoke.mockResolvedValueOnce({ ...fakeQueueStatus, pending_count: 0, cancelled_count: 4 });

      await useBatchQueueStore.getState().cancelQueue('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('cancel_batch_queue', { rootId: 'root_1' });
    });
  });

  describe('clearCompleted', () => {
    it('calls clear_completed_queue and reloads status', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      mockInvoke.mockResolvedValueOnce({ ...fakeQueueStatus, done_count: 0, cancelled_count: 0 });

      await useBatchQueueStore.getState().clearCompleted('root_1');

      expect(mockInvoke).toHaveBeenCalledWith('clear_completed_queue', { rootId: 'root_1' });
    });
  });

  describe('initBatchQueueListener', () => {
    it('subscribes to batch_queue_progress event', async () => {
      const unlistenFn = vi.fn();
      mockListen.mockResolvedValueOnce(unlistenFn);

      await useBatchQueueStore.getState().initBatchQueueListener('root_1');

      expect(mockListen).toHaveBeenCalledWith('batch_queue_progress', expect.any(Function));
      expect(useBatchQueueStore.getState().unlisten).toBe(unlistenFn);
    });

    it('cleans up existing listener before subscribing new one', async () => {
      const oldUnlisten = vi.fn();
      useBatchQueueStore.setState({ unlisten: oldUnlisten });

      const newUnlisten = vi.fn();
      mockListen.mockResolvedValueOnce(newUnlisten);

      await useBatchQueueStore.getState().initBatchQueueListener('root_1');

      expect(oldUnlisten).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('calls unlisten and resets state', () => {
      const unlistenFn = vi.fn();
      useBatchQueueStore.setState({
        unlisten: unlistenFn,
        queueStatus: fakeQueueStatus,
        isProcessing: true,
        isPaused: true,
      });

      useBatchQueueStore.getState().cleanup();

      expect(unlistenFn).toHaveBeenCalled();
      expect(useBatchQueueStore.getState().queueStatus).toBeNull();
      expect(useBatchQueueStore.getState().isProcessing).toBe(false);
      expect(useBatchQueueStore.getState().isPaused).toBe(false);
    });
  });
});
