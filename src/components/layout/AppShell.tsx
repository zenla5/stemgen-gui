import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { FileBrowser } from '../file-browser/FileBrowser';
import { ProcessingQueue } from '../processing/ProcessingQueue';
import { StemMixer } from '../mixer/StemMixer';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { activeView, sidebarCollapsed, isProcessing, currentJobId } = useAppStore();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    // Handle dropped files - will be implemented in file browser
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      console.log('Dropped files:', files);
    }
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <Header />
      
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar collapsed={sidebarCollapsed} />
        
        {/* Main content */}
        <main
          className={cn(
            'flex-1 overflow-auto transition-all duration-200',
            isDraggingOver && 'bg-primary/5'
          )}
        >
          {activeView === 'files' && <FileBrowser />}
          {activeView === 'queue' && <ProcessingQueue />}
          {activeView === 'mixer' && <StemMixer />}
          {activeView === 'settings' && <SettingsPanel />}
        </main>
      </div>
      
      {/* Status bar */}
      <StatusBar />
      
      {/* Drop overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="animate-dropzone-pulse rounded-xl border-4 border-dashed border-primary p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <svg
                className="h-16 w-16 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-xl font-semibold text-foreground">
                  Drop audio files here
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supports MP3, FLAC, WAV, OGG, and more
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Processing indicator */}
      {isProcessing && currentJobId && (
        <div className="fixed bottom-16 right-4 z-40">
          <ProcessingIndicator />
        </div>
      )}
    </div>
  );
}

function ProcessingIndicator() {
  const { jobs, currentJobId } = useAppStore();
  const currentJob = jobs.find((j) => j.id === currentJobId);
  
  if (!currentJob) return null;
  
  return (
    <div className="glass flex items-center gap-3 rounded-lg border border-border px-4 py-3 shadow-lg">
      <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
      <div>
        <p className="text-sm font-medium">{currentJob.progressMessage}</p>
        <p className="text-xs text-muted-foreground">
          {Math.round(currentJob.progress)}%
        </p>
      </div>
    </div>
  );
}
