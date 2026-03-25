import { Play, Trash2, Music, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import type { ProcessingJob, ProcessingStatus } from '@/lib/types';

export function ProcessingQueue() {
  const { jobs, removeJob, clearJobs, selectedFile } = useAppStore();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Processing Queue</h2>
        <div className="flex gap-2">
          {jobs.length > 0 && (
            <button
              onClick={clearJobs}
              className="flex items-center gap-2 rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <Music className="mb-4 h-16 w-16 opacity-50" />
          <p className="text-lg font-medium">No jobs in queue</p>
          <p className="text-sm">Add audio files and start processing</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobItem
                key={job.id}
                job={job}
                onRemove={() => removeJob(job.id)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedFile && jobs.length > 0 && (
        <div className="mt-auto border-t pt-4">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-5 w-5" />
            Start Processing
          </button>
        </div>
      )}
    </div>
  );
}

function JobItem({
  job,
  onRemove,
}: {
  job: ProcessingJob;
  onRemove: () => void;
}) {
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
    <div className="flex items-center gap-3 rounded-lg border p-3">
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
      </div>

      {job.status === 'processing' && (
        <div className="w-24">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${job.progress * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            {Math.round(job.progress * 100)}%
          </p>
        </div>
      )}

      <button
        onClick={onRemove}
        className="flex-shrink-0 rounded-md p-1 hover:bg-muted"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
