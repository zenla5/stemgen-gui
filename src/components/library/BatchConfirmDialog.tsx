/**
 * BatchConfirmDialog — confirmation dialog before starting a batch operation.
 *
 * Shows stats (file count, estimated duration, model, preset, format)
 * and a "Start" / "Cancel" pair of actions.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/AlertDialog';
import { formatDuration } from '@/lib/types/library';

export type BatchMode = 'generate' | 'regenerate';

interface BatchConfirmDialogProps {
  open: boolean;
  mode: BatchMode;
  fileCount: number;
  estimatedDurationSecs: number;
  modelName: string;
  djPreset: string;
  outputFormat: string;
  onConfirm: (includeUnknown: boolean) => void;
  onCancel: () => void;
}

export function BatchConfirmDialog({
  open,
  mode,
  fileCount,
  estimatedDurationSecs,
  modelName,
  djPreset,
  outputFormat,
  onConfirm,
  onCancel,
}: BatchConfirmDialogProps) {
  const { t } = useTranslation();
  const [includeUnknown, setIncludeUnknown] = useState(false);

  const title =
    mode === 'generate' ? t('library.generateMissingTitle') : t('library.regenerateOutdatedTitle');

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent data-testid="batch-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-medium text-foreground">{fileCount}</span>{' '}
                {t('library.filesWillBeProcessed', { count: fileCount })}
              </p>

              {estimatedDurationSecs > 0 && (
                <p className="text-sm">
                  {t('library.estimatedTime', { duration: formatDuration(estimatedDurationSecs) })}
                </p>
              )}

              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">{t('library.modelLabel')}</span>{' '}
                  <span className="text-foreground">{modelName}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t('library.presetLabel')}</span>{' '}
                  <span className="text-foreground">{djPreset}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t('library.formatLabel')}</span>{' '}
                  <span className="text-foreground">{outputFormat.toUpperCase()}</span>
                </p>
              </div>

              {mode === 'regenerate' && (
                <>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    {t('library.existingStemsReplaced')}
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnknown}
                      onChange={(e) => setIncludeUnknown(e.target.checked)}
                      data-testid="include-unknown-checkbox"
                    />
                    {t('library.includeUnknownProvenance')}
                  </label>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="batch-cancel-btn" onClick={onCancel}>
            {t('library.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="batch-start-btn"
            onClick={() => onConfirm(includeUnknown)}
          >
            {t('library.start')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
