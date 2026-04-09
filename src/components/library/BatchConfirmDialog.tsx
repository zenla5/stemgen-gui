/**
 * BatchConfirmDialog — confirmation dialog before starting a batch operation.
 *
 * Shows stats (file count, estimated duration, model, preset, format)
 * and a "Start" / "Cancel" pair of actions.
 */

import { useState } from 'react';
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
  const [includeUnknown, setIncludeUnknown] = useState(false);

  const title =
    mode === 'generate' ? 'Generate Missing Stems' : 'Regenerate Outdated Stems';

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent data-testid="batch-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-medium text-foreground">{fileCount}</span>{' '}
                file{fileCount !== 1 ? 's' : ''} will be processed.
              </p>

              {estimatedDurationSecs > 0 && (
                <p className="text-sm">
                  Estimated time: {formatDuration(estimatedDurationSecs)}
                </p>
              )}

              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Model:</span>{' '}
                  <span className="text-foreground">{modelName}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Preset:</span>{' '}
                  <span className="text-foreground">{djPreset}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Format:</span>{' '}
                  <span className="text-foreground">{outputFormat.toUpperCase()}</span>
                </p>
              </div>

              {mode === 'regenerate' && (
                <>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Existing stem files will be replaced.
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnknown}
                      onChange={(e) => setIncludeUnknown(e.target.checked)}
                      data-testid="include-unknown-checkbox"
                    />
                    Include unknown-provenance stems
                  </label>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="batch-cancel-btn" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="batch-start-btn"
            onClick={() => onConfirm(includeUnknown)}
          >
            Start
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
