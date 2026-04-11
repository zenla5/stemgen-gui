import { useState } from 'react';
import { Play, Trash2, Music, CheckCircle, XCircle, Loader2, StopCircle, Layers, Cloud, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { SETUP_WIZARD_HINT } from '@/lib/errorHints';
import type { ProcessingJob, ProcessingStatus } from '@/lib/types';

export function ProcessingQueue() {
  const { 
    jobs, 
    audioFiles, 
    removeJob, 
    clearJobs, 
    startProcessing, 
    cancelProcessing,
    cancelAllProcessing,
    isProcessing,
    activeJobCount,
    maxParallelJobs,
  } = useAppStore();

  const handleStartProcessing = () => {
    startProcessing(audioFiles);
  };

  const handleCancelAll = () => {
    cancelAllProcessing();
  };

  const hasJobs = jobs.length > 0;
  const processingJobs = jobs.filter((j) => j.status === 'processing');
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed');

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Processing Queue</h2>
        <div className="flex gap-2">
          {hasJobs && (
            <button
              data-testid="clear-jobs-btn"
              onClick={clearJobs}
              className="flex items-center gap-2 rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Batch Processing Status (Phase 5) */}
      {isProcessing && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-medium">Batch Processing</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="flex h-2 w-2">
                  {processingJobs.map((_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  ))}
                </span>
                <span className="text-muted-foreground">
                  {activeJobCount} active / {maxParallelJobs} max
                </span>
              </span>
              <span className="text-muted-foreground">
                {pendingJobs.length} pending
              </span>
            </div>
          </div>
          <button
            data-testid="cancel-all-btn"
            onClick={handleCancelAll}
            className="flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            <StopCircle className="h-4 w-4" />
            Cancel All
          </button>
        </div>
      )}

      {!hasJobs ? (
        <div data-testid="queue-empty" className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <Music className="mb-4 h-16 w-16 opacity-50" />
          <p className="text-lg font-medium">No jobs in queue</p>
          <p className="text-sm">Add audio files and start processing</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Job stats */}
          <div className="mb-3 flex gap-4 text-sm">
            {completedJobs.length > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                {completedJobs.length} completed
              </span>
            )}
            {failedJobs.length > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" />
                {failedJobs.length} failed
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobItem
                key={job.id}
                job={job}
                onRemove={() => removeJob(job.id)}
                onCancel={() => cancelProcessing(job.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto border-t pt-4">
        {isProcessing ? (
          <button
            onClick={handleCancelAll}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-3 font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            <StopCircle className="h-5 w-5" />
            Cancel All Processing ({jobs.filter(j => j.status === 'pending' || j.status === 'processing').length} remaining)
          </button>
        ) : (
          <button
            data-testid="start-processing-btn"
            onClick={handleStartProcessing}
            disabled={pendingJobs.length === 0}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90',
              pendingJobs.length === 0 && 'cursor-not-allowed opacity-50'
            )}
          >
            <Play className="h-5 w-5" />
            Start Processing {pendingJobs.length > 0 && `(${pendingJobs.length} file${pendingJobs.length !== 1 ? 's' : ''})`}
          </button>
        )}
      </div>
    </div>
  );
}

function JobItem({
  job,
  onRemove,
  onCancel,
}: {
  job: ProcessingJob;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const getStatusIcon = (status: ProcessingStatus) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: ProcessingStatus) => {
    switch (status) {
      case 'pending':
        return 'Waiting';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
    }
  };

  return (
    <div data-testid="job-item" className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex-shrink-0">{getStatusIcon(job.status)}</div>
      
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {job.input_path.split(/[/\\]/).pop() || 'Unknown file'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">{job.model}</span>
          <span className="text-muted-foreground/50">•</span>
          <span className={cn(
            job.status === 'completed' && 'text-green-600',
            job.status === 'failed' && 'text-red-600',
          )}>
            {getStatusText(job.status)}
          </span>
        </div>
        {job.status === 'failed' && job.error && (
          <div className="mt-1">
            <button
              data-testid="error-details-toggle"
              onClick={() => setErrorExpanded(!errorExpanded)}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              {errorExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Details
            </button>
            {errorExpanded && (
              <div
                data-testid="error-details"
                className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300 whitespace-pre-wrap"
              >
                {job.error.endsWith(SETUP_WIZARD_HINT) ? (
                  <div className="flex items-center gap-2">
                    <span>{job.error.slice(0, -SETUP_WIZARD_HINT.length)}</span>
                    <button
                      data-testid="open-setup-wizard-btn"
                      onClick={() => useAppStore.getState().setActiveView('settings')}
                      className="flex items-center gap-1 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-300"
                    >
                      <Settings className="h-3 w-3" />
                      Open Setup Wizard
                    </button>
                  </div>
                ) : (
                  job.error
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {job.status === 'processing' && (() => {
        const isCloud = useSettingsStore.getState().activeProvider !== 'local';
        return (
        <div className="w-24">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full bg-primary transition-all duration-200',
                isCloud && 'animate-pulse'
              )}
              style={{ width: isCloud ? '100%' : `${job.progress * 100}%` }}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            {isCloud && <Cloud className="h-2.5 w-2.5" />}
            {isCloud ? 'Cloud' : `${Math.round(job.progress * 100)}%`}
          </div>
        </div>
        );
      })()}

      {(job.status === 'processing' || job.status === 'pending') && (
        <button
          data-testid="cancel-job-btn"
          onClick={onCancel}
          className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          title="Cancel"
        >
          <StopCircle className="h-4 w-4" />
        </button>
      )}

      {job.status !== 'processing' && job.status !== 'pending' && (
        <button
          data-testid="remove-job-btn"
          onClick={onRemove}
          className="flex-shrink-0 rounded-md p-1 hover:bg-muted"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
