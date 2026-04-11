import { invoke } from '@tauri-apps/api/core';
import { Download, Trash2, Check, Cpu, Zap, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AIModel } from '@/lib/types';

export interface ModelCardData {
  id: string;
  name: string;
  description: string;
  quality: string;
  speed: string;
  gpu_required: boolean;
  size_mb?: number;
}

interface ModelCardProps {
  model: ModelCardData;
  isDownloaded: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  onDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onRetry: (modelId: string) => void;
}

export function ModelCard({
  model,
  isDownloaded,
  isChecking,
  isDownloading,
  downloadProgress,
  downloadError,
  onDownload,
  onDelete,
  onRetry,
}: ModelCardProps) {
  const settings = useSettingsStore();
  const isSelected = settings.defaultModel === model.id;

  const getQualityIcon = (quality: string) => {
    switch (quality) {
      case 'highest':
        return <Zap className="h-4 w-4 text-purple-500" />;
      case 'high':
        return <Zap className="h-4 w-4 text-green-500" />;
      case 'medium':
        return <Zap className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getSpeedLabel = (speed: string) => {
    switch (speed) {
      case 'very_slow': return 'Very Slow';
      case 'slow': return 'Slow';
      case 'medium': return 'Medium';
      case 'fast': return 'Fast';
      default: return speed;
    }
  };

  const handleSelect = () => {
    if (isDownloaded) {
      settings.setDefaultModel(model.id as AIModel);
    }
  };

  // Checking state skeleton
  if (isChecking) {
    return (
      <div
        data-testid={`model-card-${model.id}`}
        className="flex items-start gap-4 rounded-lg border border-muted p-4 animate-pulse"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <div className="h-5 w-5 rounded bg-muted-foreground/20" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-muted-foreground/20" />
          <div className="h-3 w-48 rounded bg-muted-foreground/20" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`model-card-${model.id}`}
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 transition-colors",
        isSelected && isDownloaded && "border-primary bg-primary/5",
        isDownloaded && !isSelected && "border-green-500/30 bg-green-500/5",
        isDownloading && "border-primary/30 bg-primary/5",
        !isDownloaded && !isDownloading && "border-muted hover:border-primary/50",
      )}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {isDownloaded ? (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full cursor-pointer",
              isSelected ? "bg-primary/20" : "bg-green-500/20"
            )}
            onClick={handleSelect}
            title={isSelected ? "Selected" : "Click to select"}
          >
            <Check className={cn("h-5 w-5", isSelected ? "text-primary" : "text-green-500")} />
          </div>
        ) : isDownloading ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <Download className="h-5 w-5 animate-pulse text-primary" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {model.gpu_required ? (
              <Cpu className="h-5 w-5 text-muted-foreground" />
            ) : (
              getQualityIcon(model.quality)
            )}
          </div>
        )}
      </div>

      {/* Model Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{model.name}</h3>
          {model.gpu_required && (
            <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-600">
              GPU Required
            </span>
          )}
          {isSelected && isDownloaded && (
            <span
              data-testid={`model-selected-badge-${model.id}`}
              className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary"
            >
              Selected
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          {model.description}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {getQualityIcon(model.quality)}
            {model.quality.charAt(0).toUpperCase() + model.quality.slice(1)} quality
          </span>
          <span>{getSpeedLabel(model.speed)}</span>
          {model.size_mb && (
            <span>~{model.size_mb} MB</span>
          )}
        </div>

        {/* Download Progress */}
        {isDownloading && (
          <div className="mt-3" data-testid={`progress-bar-${model.id}`}>
            <div className="flex items-center justify-between text-xs">
              <span>Downloading...</span>
              <span>{Math.round(downloadProgress)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {downloadError && (
          <div
            className="mt-2 flex items-start gap-2 rounded-md bg-red-500/10 p-2"
            data-testid={`model-error-${model.id}`}
          >
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-red-600 break-all">{downloadError}</p>
              <button
                data-testid={`retry-download-${model.id}`}
                onClick={() => onRetry(model.id)}
                className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* BS-RoFormer not-yet-supported warning */}
        {model.id === 'bs_roformer' && isSelected && isDownloaded && (
          <div
            data-testid="bs-roformer-warning"
            className="mt-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-300"
          >
            BS-RoFormer local inference is not yet supported. Choose Demucs, HT-Demucs, or HT-Demucs FT for local processing, or enable a cloud provider.
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="flex-shrink-0">
        {isDownloaded ? (
          <div className="flex items-center gap-1">
            {!isSelected && (
              <button
                data-testid={`select-model-${model.id}`}
                onClick={handleSelect}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Select
              </button>
            )}
            <button
              data-testid={`delete-model-${model.id}`}
              onClick={() => onDelete(model.id)}
              className="rounded-md border p-2 text-muted-foreground hover:border-destructive hover:text-destructive"
              title="Delete model"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : !isDownloading ? (
          <button
            data-testid={`download-btn-${model.id}`}
            onClick={() => onDownload(model.id)}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        ) : (
          <button
            data-testid={`cancel-download-${model.id}`}
            onClick={() => invoke('cancel_download', { modelId: model.id }).catch(console.error)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}