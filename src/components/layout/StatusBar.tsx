import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertCircle, Cpu } from 'lucide-react';

export function StatusBar() {
  const { dependencies, dependenciesChecked, audioFiles, jobs } = useAppStore();
  
  const allDepsOk = dependenciesChecked && 
    dependencies.ffmpeg && 
    dependencies.python && 
    dependencies.models;
  
  const cpuGpu = dependencies.cuda ? 'CUDA' : dependencies.mps ? 'MPS' : 'CPU';
  
  return (
    <footer className="flex h-8 items-center justify-between border-t border-border bg-card px-4 text-xs text-muted-foreground">
      {/* Left side - Status */}
      <div className="flex items-center gap-4">
        {/* Dependency status */}
        {!dependenciesChecked ? (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 animate-pulse" />
            <span>Checking dependencies...</span>
          </div>
        ) : allDepsOk ? (
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-3 w-3" />
            <span>Ready</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertCircle className="h-3 w-3" />
            <span>Some dependencies missing</span>
          </div>
        )}
        
        {/* Dependency indicators */}
        <div className="flex items-center gap-2">
          <DependencyIndicator label="FFmpeg" ok={dependencies.ffmpeg} />
          <DependencyIndicator label="Python" ok={dependencies.python} />
          <DependencyIndicator label="Models" ok={dependencies.models} />
        </div>
      </div>
      
      {/* Right side - Info */}
      <div className="flex items-center gap-4">
        {/* File count */}
        <span>{audioFiles.length} file{audioFiles.length !== 1 ? 's' : ''} loaded</span>
        
        {/* Job count */}
        {jobs.length > 0 && (
          <span>{jobs.filter((j) => j.status === 'completed').length}/{jobs.length} jobs done</span>
        )}
        
        {/* Device */}
        <div className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          <span>{cpuGpu}</span>
        </div>
      </div>
    </footer>
  );
}

function DependencyIndicator({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5',
        ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      )}
    >
      {ok ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      <span>{label}</span>
    </div>
  );
}
