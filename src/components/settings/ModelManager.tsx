import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Download, Trash2, Check, AlertCircle, Cpu, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  quality: string;
  speed: string;
  gpu_required: boolean;
  size_mb?: number;
}

interface DownloadProgress {
  model_id: string;
  status: string;
  progress: number;
  downloaded_mb: number;
  total_mb: number;
}

export function ModelManager() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load models on mount
  useEffect(() => {
    loadModels();
    
    // Listen for download progress events
    const unlisten = listen<DownloadProgress>('model-download-progress', (event) => {
      const { model_id, status, progress: prog } = event.payload;
      
      if (status === 'complete') {
        setDownloading(null);
        setProgress(0);
        setDownloadedModels(prev => new Set([...prev, model_id]));
      } else if (status === 'downloading') {
        setProgress(prog);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get available models
      const availableModels = await invoke<ModelInfo[]>('get_models');
      setModels(availableModels);
      
      // Check which models are downloaded
      // For now, we'll track them in state
    } catch (err) {
      console.error('Failed to load models:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadModel = async (modelId: string) => {
    setDownloading(modelId);
    setProgress(0);
    setError(null);
    
    try {
      await invoke('download_model', { modelId });
    } catch (err) {
      console.error('Failed to download model:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDownloading(null);
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      await invoke('delete_model', { modelId });
      setDownloadedModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete model:', err);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Models</h2>
        <button
          onClick={loadModels}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {models.map((model) => {
          const isDownloaded = downloadedModels.has(model.id);
          const isDownloading = downloading === model.id;
          
          return (
            <div
              key={model.id}
              className={cn(
                "flex items-start gap-4 rounded-lg border p-4 transition-colors",
                isDownloaded && "border-green-500/30 bg-green-500/5",
                isDownloading && "border-primary/30 bg-primary/5"
              )}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {isDownloaded ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                    <Check className="h-5 w-5 text-green-500" />
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
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span>Downloading...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex-shrink-0">
                {isDownloaded ? (
                  <button
                    onClick={() => deleteModel(model.id)}
                    className="rounded-md border p-2 text-muted-foreground hover:border-destructive hover:text-destructive"
                    title="Delete model"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : !isDownloading ? (
                  <button
                    onClick={() => downloadModel(model.id)}
                    className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      invoke('cancel_download', { modelId: model.id }).catch(console.error);
                      setDownloading(null);
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <h4 className="text-sm font-medium">Model Information</h4>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>• <strong>BS-RoFormer:</strong> Best for vocal separation, requires GPU</li>
          <li>• <strong>HTDemucs:</strong> Good all-around performer with high quality</li>
          <li>• <strong>HTDemucs FT:</strong> Fine-tuned model for best results (largest)</li>
          <li>• <strong>Demucs:</strong> Can run on CPU, faster but lower quality</li>
        </ul>
      </div>
    </div>
  );
}
