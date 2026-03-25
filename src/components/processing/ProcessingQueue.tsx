import { ListMusic, Play, Pause, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { useAppStore } from '@/stores/appStore';
import { cn, formatDuration } from '@/lib/utils';
import type { ProcessingJob, JobStatus } from '@/lib/types';
import { STEM_COLORS } from '@/lib/types';

export function ProcessingQueue() {
  const { jobs, isProcessing, clearJobs, removeJob, setIsProcessing } = useAppStore();
  
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed');
  const processingJobs = jobs.filter((j) => ['converting', 'separating', 'encoding', 'packing', 'tagging'].includes(j.status));
  
  const handleStartProcessing = () => {
    setIsProcessing(true);
    // TODO: Implement job processing
  };
  
  const handleStopProcessing = () => {
    setIsProcessing(false);
    // TODO: Cancel current job
  };
  
  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'pending':
        return 'text-muted-foreground';
      default:
        return 'text-primary';
    }
  };
  
  const getStatusLabel = (status: JobStatus) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };
  
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Processing Queue</h2>
        <div className="flex gap-2">
          {isProcessing ? (
            <Button variant="destructive" size="sm" onClick={handleStopProcessing}>
              <Pause className="mr-2 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleStartProcessing}
              disabled={pendingJobs.length === 0}
            >
              <Play className="mr-2 h-4 w-4" />
              Start Processing
            </Button>
          )}
          {jobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearJobs}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>
      
      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ListMusic className="mb-4 h-16 w-16 text-muted-foreground/50" />
          <p className="text-lg font-medium">No jobs in queue</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add audio files to start processing
          </p>
        </div>
      )}
      
      {/* Processing jobs */}
      {processingJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Processing</h3>
          {processingJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
      
      {/* Pending jobs */}
      {pendingJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
          {pendingJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
      
      {/* Completed jobs */}
      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
          {completedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
      
      {/* Failed jobs */}
      {failedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-red-600">Failed</h3>
          {failedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: ProcessingJob }) {
  const { removeJob } = useAppStore();
  
  const isActive = ['converting', 'separating', 'encoding', 'packing', 'tagging'].includes(job.status);
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isActive && 'border-primary bg-primary/5',
        isCompleted && 'border-green-500/50 bg-green-500/5',
        isFailed && 'border-red-500/50 bg-red-500/5',
        !isActive && !isCompleted && !isFailed && 'border-border bg-card'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{job.sourceFile.name}</p>
            <span
              className={cn(
                'text-xs font-medium',
                isActive && 'text-primary',
                isCompleted && 'text-green-600',
                isFailed && 'text-red-600',
                !isActive && !isCompleted && !isFailed && 'text-muted-foreground'
              )}
            >
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.progressMessage || `${job.model} • ${job.outputFormat.toUpperCase()} • ${job.djPreset}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => removeJob(job.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Progress bar */}
      {isActive && (
        <div className="mt-3">
          <Progress value={job.progress} className="h-2 bg-gradient-stem" />
          <p className="mt-1 text-xs text-muted-foreground">
            {Math.round(job.progress)}% complete
          </p>
        </div>
      )}
      
      {/* Stem mini visualization */}
      <div className="mt-3 flex gap-1">
        {job.stems.map((stem) => (
          <div
            key={stem.id}
            className="h-8 flex-1 rounded"
            style={{ backgroundColor: stem.color }}
            title={stem.name}
          />
        ))}
      </div>
      
      {/* Error message */}
      {isFailed && job.error && (
        <p className="mt-2 text-sm text-red-600">{job.error}</p>
      )}
    </div>
  );
}
