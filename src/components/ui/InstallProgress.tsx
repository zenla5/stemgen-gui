/**
 * Install Progress Component
 *
 * Shows live output from a dependency installation with elapsed time,
 * scrollable log, cancel button, and success/failure state.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, XCircle, CheckCircle, Copy, Check } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface InstallProgressProps {
  /** Lines of output from the install process */
  lines: string[];
  /** Whether the install is currently running */
  isRunning: boolean;
  /** Install result once finished (null while running) */
  result?: { success: boolean; alreadyInstalled: boolean; error?: string } | null;
  /** Human-readable command string for copy-to-clipboard */
  commandDisplay?: string;
  /** Called when user clicks Cancel */
  onCancel?: () => void;
  /** Called when install completes (success or failure) */
  onComplete?: () => void;
}

export function InstallProgress({
  lines,
  isRunning,
  result,
  commandDisplay,
  onCancel,
  onComplete,
}: InstallProgressProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  // Track elapsed time while running
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      setElapsed(0);
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  // Call onComplete when result arrives
  useEffect(() => {
    if (result && onComplete) {
      onComplete();
    }
  }, [result, onComplete]);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleCopy = async () => {
    if (commandDisplay) {
      await navigator.clipboard.writeText(commandDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isFinished = result !== null && result !== undefined;
  const isSuccess = result?.success;
  const isAlreadyInstalled = result?.alreadyInstalled;

  return (
    <div className="rounded-lg border border-muted bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-muted bg-muted/50">
        <div className="flex items-center gap-2">
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {isFinished && isSuccess && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {isFinished && !isSuccess && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium">
            {isRunning && `Installing... (${formatElapsed(elapsed)})`}
            {isFinished && isAlreadyInstalled && 'Already installed'}
            {isFinished && isSuccess && !isAlreadyInstalled && 'Installation complete'}
            {isFinished && !isSuccess && 'Installation failed'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {commandDisplay && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs"
              title="Copy install command"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          )}
          {isRunning && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Log output */}
      {lines.length > 0 && (
        <div
          ref={logRef}
          className={cn(
            'max-h-40 overflow-y-auto p-3 font-mono text-xs leading-relaxed',
            'bg-slate-950 text-slate-100 dark:bg-slate-900'
          )}
        >
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {isFinished && !isSuccess && result?.error && (
        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 border-t border-muted bg-red-50 dark:bg-red-950/30">
          {result.error}
        </div>
      )}
    </div>
  );
}
