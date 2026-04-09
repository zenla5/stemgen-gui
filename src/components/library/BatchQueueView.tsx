/**
 * BatchQueueView — progress UI shown as an overlay while a batch job is active.
 *
 * Displays a progress bar, item list, pause/resume, and cancel controls.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { formatDuration } from '@/lib/types/library';
import type { BatchQueueItem, BatchQueueStatus } from '@/lib/types/library';
import { Pause, Play, X, CheckCircle2, AlertCircle, XCircle, Clock, Loader2 } from 'lucide-react';

interface BatchQueueViewProps {
  rootId: string;
  onClose: () => void;
}

export function BatchQueueView({ rootId, onClose }: BatchQueueViewProps) {
  const { t } = useTranslation();
  const {
    queueStatus,
    isPaused,
    pauseQueue,
    resumeQueue,
    cancelQueue,
    initBatchQueueListener,
    cleanup,
  } = useBatchQueueStore();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    initBatchQueueListener(rootId);
    useBatchQueueStore.getState().loadQueueStatus(rootId);
    return () => cleanup();
  }, [rootId, initBatchQueueListener, cleanup]);

  const completed = (queueStatus?.done_count ?? 0) + (queueStatus?.error_count ?? 0);
  const total = queueStatus?.total_count ?? 0;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  const isDone = total > 0 && completed >= total;

  const handleCancelAll = async () => {
    setShowCancelConfirm(false);
    await cancelQueue(rootId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="batch-queue-overlay"
    >
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isDone ? t('library.batchComplete') : t('library.processingStems')}
          </h2>
          {isDone && (
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="batch-close-btn">
              {t('library.close')}
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <Progress value={progressPercent} data-testid="batch-progress-bar" />
        </div>
        <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('library.filesProgress', { completed, total })}
          </span>
          {!isDone && total > 0 && (
            <span data-testid="batch-remaining">
              {formatEstimatedRemaining(queueStatus, t)}
            </span>
          )}
        </div>

        {/* Done summary */}
        {isDone && (
          <div className="mb-4 flex gap-4 text-sm" data-testid="batch-done-summary">
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              {t('library.doneCount', { count: queueStatus?.done_count ?? 0 })}
            </span>
            {(queueStatus?.error_count ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="h-4 w-4" />
                {t('library.errorsCount', { count: queueStatus?.error_count })}
              </span>
            )}
            {(queueStatus?.cancelled_count ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-gray-500">
                <XCircle className="h-4 w-4" />
                {t('library.cancelledCount', { count: queueStatus?.cancelled_count })}
              </span>
            )}
          </div>
        )}

        {/* Item list */}
        <div className="mb-4 max-h-64 overflow-y-auto rounded border" data-testid="batch-item-list">
          {(queueStatus?.next_items ?? []).length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t('library.noItems')}</p>
          ) : (
            (queueStatus?.next_items ?? []).map((item) => (
              <BatchItemRow key={item.id} item={item} />
            ))
          )}
        </div>

        {/* Controls */}
        {!isDone && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (isPaused ? resumeQueue(rootId) : pauseQueue(rootId))}
              data-testid="batch-pause-resume-btn"
            >
              {isPaused ? (
                <>
                  <Play className="mr-2 h-3 w-3" /> {t('library.resume')}
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-3 w-3" /> {t('library.pause')}
                </>
              )}
            </Button>

            {showCancelConfirm ? (
              <div className="flex items-center gap-2 text-sm">
                <span>{t('library.cancelAllQuestion')}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelAll}
                  data-testid="batch-cancel-confirm-btn"
                >
                  {t('library.yesCancel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelConfirm(false)}
                  data-testid="batch-cancel-dismiss-btn"
                >
                  {t('library.no')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCancelConfirm(true)}
                data-testid="batch-cancel-all-btn"
              >
                <X className="mr-2 h-3 w-3" />
                {t('library.cancelAll')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BatchItemRow({ item }: { item: BatchQueueItem }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0" data-testid={`batch-item-${item.id}`}>
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={item.source_path}>
          {item.source_path.split(/[/\\]/).pop()}
        </p>
      </div>
      <StatusBadge status={item.status} />
      {item.status === 'processing' && item.started_at && (
        <span className="text-xs text-muted-foreground">
          {formatElapsed(item.started_at)}
        </span>
      )}
      {item.error_message && (
        <span className="text-xs text-red-500" title={item.error_message}>
          {item.error_message}
        </span>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: BatchQueueStatus }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-400" />;
  }
}

function StatusBadge({ status }: { status: BatchQueueStatus }) {
  const { t } = useTranslation();
  const styles: Record<BatchQueueStatus, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
      data-testid="status-badge"
    >
      {t(`library.${status}`)}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  return formatDuration(secs);
}

function formatEstimatedRemaining(
  status: { done_count: number; processing_count: number; pending_count: number } | null,
  t: TFunction
): string {
  if (!status || status.done_count === 0) return '';
  const remaining = status.pending_count + status.processing_count;
  if (remaining === 0) return '';
  // Rough estimate: assume similar time per item
  return t('library.remaining', { count: remaining });
}
