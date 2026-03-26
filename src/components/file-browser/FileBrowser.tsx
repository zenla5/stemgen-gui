import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, Upload, Music, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { SUPPORTED_AUDIO_FORMATS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { AudioFileMetadata } from '@/lib/types';

interface DragDropPayload {
  paths: string[];
}

export function FileBrowser() {
  const { audioFiles, addFiles, removeFile, selectFile, selectedFile } = useAppStore();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Listen for Tauri's native drag-drop events
  useEffect(() => {
    const unlistenDrop = listen<DragDropPayload>('tauri://drag-drop', async (event) => {
      setIsDraggingOver(false);
      const paths = event.payload.paths;
      
      if (paths && paths.length > 0) {
        const newFiles: AudioFileMetadata[] = [];
        
        for (const path of paths) {
          // Check if it's an audio file
          const ext = path.split('.').pop()?.toLowerCase();
          if (ext && SUPPORTED_AUDIO_FORMATS.includes(ext)) {
            try {
              const info = await invoke<AudioFileMetadata>('get_audio_info', { path });
              newFiles.push(info);
            } catch (error) {
              console.error('Failed to get audio info:', error);
            }
          }
        }
        
        if (newFiles.length > 0) {
          addFiles(newFiles);
        }
      }
    });

    const unlistenDragEnter = listen('tauri://drag-enter', () => {
      setIsDraggingOver(true);
    });

    const unlistenDragLeave = listen('tauri://drag-leave', () => {
      setIsDraggingOver(false);
    });

    return () => {
      unlistenDrop.then((fn) => fn());
      unlistenDragEnter.then((fn) => fn());
      unlistenDragLeave.then((fn) => fn());
    };
  }, [addFiles]);

  const handleOpenFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Audio',
            extensions: SUPPORTED_AUDIO_FORMATS,
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles: AudioFileMetadata[] = [];

        for (const path of paths) {
          try {
            const info = await invoke<AudioFileMetadata>('get_audio_info', { path });
            newFiles.push(info);
          } catch (error) {
            console.error('Failed to get audio info:', error);
          }
        }

        if (newFiles.length > 0) {
          addFiles(newFiles);
        }
      }
    } catch (error) {
      console.error('Failed to open files:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Drop zone */}
      <div
        className={cn(
          'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDraggingOver
            ? 'border-primary bg-primary/10'
            : 'border-muted hover:border-primary/50 hover:bg-muted/50'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
        }}
      >
        <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="mb-2 text-lg font-medium">
          {isDraggingOver ? 'Drop audio files here' : 'Drag & drop audio files'}
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          or click to browse
        </p>
        <button
          type="button"
          onClick={handleOpenFiles}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <FolderOpen className="h-4 w-4" />
          Open Files
        </button>
      </div>

      {/* File list */}
      {audioFiles.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {audioFiles.length} file{audioFiles.length !== 1 ? 's' : ''} selected
            </h3>
            <button
              onClick={() => audioFiles.forEach((f) => removeFile(f.path))}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-2">
            {audioFiles.map((file) => (
              <div
                key={file.path}
                onClick={() => selectFile(file)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                  selectedFile?.path === file.path
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-muted/50'
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Music className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.format.toUpperCase()} • {formatDuration(file.duration)} •{' '}
                    {formatFileSize(file.size)} • {file.sample_rate / 1000}kHz
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.path);
                  }}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
