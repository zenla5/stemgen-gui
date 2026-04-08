/**
 * Batch Queue Store
 *
 * Zustand store for batch processing queue state including:
 * - Queue status monitoring
 * - Queue control (pause, resume, cancel)
 * - Progress event subscription
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BatchQueueStatusSummary,
  BatchQueueResult,
} from '@/lib/types/library';

// =============================================================================
// Store State Interface
// =============================================================================

interface BatchQueueState {
  queueStatus: BatchQueueStatusSummary | null;
  isProcessing: boolean;
  isPaused: boolean;
  queueError: string | null;
  unlisten: UnlistenFn | null;

  loadQueueStatus: (rootId: string) => Promise<void>;
  queueGenerate: (
    rootId: string,
    modelId: string,
    djPreset?: string,
    outputFormat?: string
  ) => Promise<BatchQueueResult>;
  queueRegenerate: (
    rootId: string,
    modelId: string,
    includeUnknown: boolean,
    djPreset?: string,
    outputFormat?: string
  ) => Promise<BatchQueueResult>;
  startProcessor: (rootId: string) => Promise<void>;
  pauseQueue: (rootId: string) => Promise<void>;
  resumeQueue: (rootId: string) => Promise<void>;
  cancelQueue: (rootId: string) => Promise<void>;
  clearCompleted: (rootId: string) => Promise<void>;
  initBatchQueueListener: (rootId: string) => Promise<void>;
  cleanup: () => void;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useBatchQueueStore = create<BatchQueueState>((set, get) => ({
  queueStatus: null,
  isProcessing: false,
  isPaused: false,
  queueError: null,
  unlisten: null,

  loadQueueStatus: async (rootId) => {
    try {
      const status = await invoke<BatchQueueStatusSummary>('get_batch_queue_status', { rootId });
      set({
        queueStatus: status,
        isProcessing: status.processing_count > 0,
      });
    } catch (error) {
      console.error('Failed to load queue status:', error);
    }
  },

  queueGenerate: async (rootId, modelId, djPreset, outputFormat) => {
    set({ queueError: null });
    try {
      const result = await invoke<BatchQueueResult>('queue_batch_generate', {
        rootId,
        modelId,
        djPreset: djPreset ?? null,
        outputFormat: outputFormat ?? null,
      });
      await get().loadQueueStatus(rootId);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ queueError: errorMessage });
      throw error;
    }
  },

  queueRegenerate: async (rootId, modelId, includeUnknown, djPreset, outputFormat) => {
    set({ queueError: null });
    try {
      const result = await invoke<BatchQueueResult>('queue_batch_regenerate', {
        rootId,
        modelId,
        includeUnknownProvenance: includeUnknown,
        djPreset: djPreset ?? null,
        outputFormat: outputFormat ?? null,
      });
      await get().loadQueueStatus(rootId);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ queueError: errorMessage });
      throw error;
    }
  },

  startProcessor: async (rootId) => {
    try {
      await invoke('start_batch_processor', { rootId });
      set({ isProcessing: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ queueError: errorMessage });
      throw error;
    }
  },

  pauseQueue: async (rootId) => {
    try {
      await invoke('pause_batch_queue', { rootId });
      set({ isPaused: true });
    } catch (error) {
      console.error('Failed to pause queue:', error);
    }
  },

  resumeQueue: async (rootId) => {
    try {
      await invoke('resume_batch_queue', { rootId });
      set({ isPaused: false });
    } catch (error) {
      console.error('Failed to resume queue:', error);
    }
  },

  cancelQueue: async (rootId) => {
    try {
      await invoke('cancel_batch_queue', { rootId });
      await get().loadQueueStatus(rootId);
    } catch (error) {
      console.error('Failed to cancel queue:', error);
    }
  },

  clearCompleted: async (rootId) => {
    try {
      await invoke('clear_completed_queue', { rootId });
      await get().loadQueueStatus(rootId);
    } catch (error) {
      console.error('Failed to clear completed:', error);
    }
  },

  initBatchQueueListener: async (rootId) => {
    // Clean up existing listener
    const existing = get().unlisten;
    if (existing) {
      existing();
    }

    const unlisten = await listen('batch_queue_progress', (event) => {
      const payload = event.payload as { root_id: string; status: string };
      if (payload.root_id === rootId) {
        // Reload queue status on any progress event
        get().loadQueueStatus(rootId);
      }
    });

    set({ unlisten });
  },

  cleanup: () => {
    const unlisten = get().unlisten;
    if (unlisten) {
      unlisten();
    }
    set({
      queueStatus: null,
      isProcessing: false,
      isPaused: false,
      queueError: null,
      unlisten: null,
    });
  },
}));
