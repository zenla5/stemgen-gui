import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Upload, FolderOpen, FileAudio, Trash2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { cn, formatDuration, formatFileSize } from '@/lib/utils';
import type { AudioFileMetadata } from '@/lib/types';
import { SUPPORTED_AUDIO_FORMATS } from '@/lib/types';

export function FileBrowser() {
  const { audioFiles, addFiles, removeFile, clearFiles, selectFile, selectedFile } = useAppStore();
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Process dropped files
    const newFiles: AudioFileMetadata[] = [];
    
    for (const file of acceptedFiles) {
      try {
        // Get audio info via Tauri command
        const info = await invoke<AudioFileMetadata>('get_audio_info', { path: (file as any).path || file.name });
        newFiles.push(info);
      } catch (error) {
        console.error('Failed to get audio info:', error);
      }
    }
    
    if (newFiles.length > 0) {
      addFiles(newFiles);
    }
  }, [addFiles]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': SUPPORTED_AUDIO_FORMATS.map((ext) => ext.replace('.', '')),
    },
  });
  
  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Audio',
            extensions: SUPPORTED_AUDIO_FORMATS.map((ext) => ext.replace('.', '')),
          },
        ],
      });
      
      if (selected && Array.isArray(selected)) {
        const newFiles: AudioFileMetadata[] = [];
        for (const path of selected) {
          try {
            const info = await invoke<AudioFileMetadata>('get_audio_info', { path });
            newFiles.push(info);
          } catch (error) {
            console.error('Failed to get audio info for:', path, error);
          }
        }
        if (newFiles.length > 0) {
          addFiles(newFiles);
        }
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };
  
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Audio Files</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Folder
          </Button>
          {audioFiles.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFiles}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>
      
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className={cn('mb-4 h-12 w-12', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
        <p className="mb-2 text-lg font-medium">
          {isDragActive ? 'Drop audio files here' : 'Drag & drop audio files'}
        </p>
        <p className="text-sm text-muted-foreground">
          Supports MP3, FLAC, WAV, OGG, AIFF, M4A, AAC
        </p>
      </div>
      
      {/* File list */}
      {audioFiles.length > 0 && (
        <div className="flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/50 text-left text-sm font-medium">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Sample Rate</th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {audioFiles.map((file) => (
                <tr
                  key={file.path}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-accent/50',
                    selectedFile?.path === file.path && 'bg-primary/10'
                  )}
                  onClick={() => selectFile(file)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileAudio className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        {file.artist && (
                          <p className="text-xs text-muted-foreground">{file.artist}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {formatDuration(file.duration)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                      {file.format.replace('.', '')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatFileSize(file.size)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {(file.sampleRate / 1000).toFixed(1)} kHz
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.path);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
