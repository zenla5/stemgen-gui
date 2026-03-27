import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, FolderOpen, Loader2, Music, Disc } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StemFileMetadata } from '@/lib/types';

interface HistoryEntry {
  id: string;
  source_path: string;
  output_path: string;
  model: string;
  dj_preset: string;
  processed_at: string;
  duration_ms: number;
  file_size: number;
}

interface ExtendedHistoryEntry extends HistoryEntry {
  metadata?: StemFileMetadata;
}

export function ProcessingHistory() {
  const [entries, setEntries] = useState<ExtendedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<HistoryEntry[]>('get_processing_history', { limit: 50 });
      
      // Load metadata for each entry with output_path
      const extendedEntries: ExtendedHistoryEntry[] = await Promise.all(
        result.map(async (entry) => {
          if (entry.output_path) {
            try {
              const metadata = await invoke<StemFileMetadata>('read_stem_metadata', {
                path: entry.output_path,
              });
              return { ...entry, metadata };
            } catch {
              return entry as ExtendedHistoryEntry;
            }
          }
          return entry as ExtendedHistoryEntry;
        })
      );
      
      setEntries(extendedEntries);
    } catch (err) {
      console.error('Failed to load history:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  const formatBpm = (bpm?: number) => {
    if (!bpm) return null;
    return bpm % 1 === 0 ? bpm.toString() : bpm.toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        <p>Failed to load history: {error}</p>
        <button 
          onClick={loadHistory}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-medium">No processing history</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your processed files will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Processing History</h2>
        <span className="text-sm text-muted-foreground">
          {entries.length} items
        </span>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* Cover art thumbnail */}
                  {entry.metadata?.audio.cover_art_path && (
                    <img
                      src={`asset://localhost/${entry.metadata.audio.cover_art_path}`}
                      alt="Cover"
                      className="h-10 w-10 rounded object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="truncate font-medium">
                      {entry.metadata?.audio.title || getFileName(entry.source_path)}
                    </span>
                    {entry.metadata?.audio.artist && (
                      <span className="text-sm text-muted-foreground">
                        {entry.metadata.audio.artist}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-xs',
                    entry.output_path ? 
                      'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  )}>
                    {entry.output_path ? 'Success' : 'Failed'}
                  </span>
                </div>
                
                {/* Metadata row: BPM, key, format */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {entry.metadata?.audio.bpm && (
                    <span className="flex items-center gap-1" title="BPM">
                      <Music className="h-3 w-3" />
                      {formatBpm(entry.metadata.audio.bpm)} BPM
                    </span>
                  )}
                  {entry.metadata?.audio.key && (
                    <span className="flex items-center gap-1" title="Key">
                      <Disc className="h-3 w-3" />
                      {entry.metadata.audio.key}
                    </span>
                  )}
                  {entry.metadata?.dj_software && (
                    <span className="flex items-center gap-1">
                      {entry.metadata.dj_software}
                    </span>
                  )}
                  {entry.metadata?.track_count && entry.metadata.track_count > 1 && (
                    <span className="flex items-center gap-1">
                      {entry.metadata.track_count} tracks
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(entry.processed_at)}
                  </span>
                  <span>{entry.model}</span>
                  <span>{entry.dj_preset}</span>
                  <span>{formatDuration(entry.duration_ms)}</span>
                  {entry.file_size > 0 && (
                    <span>{formatFileSize(entry.file_size)}</span>
                  )}
                </div>
                
                {entry.output_path && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    → {getFileName(entry.output_path)}
                  </p>
                )}
              </div>
              
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {entry.output_path && (
                  <button
                    onClick={() => {
                      invoke('plugin:shell|open', { path: entry.output_path }).catch(console.error);
                    }}
                    className="rounded p-1.5 hover:bg-muted"
                    title="Open folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
