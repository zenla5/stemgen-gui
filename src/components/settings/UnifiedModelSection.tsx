import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { HardDrive, RefreshCw } from 'lucide-react';
import { ModelCard, type ModelCardData } from './ModelCard';
import { useAppStore, useDownloadedModels } from '@/stores/appStore';
import { hasPackageStatusKey } from '@/lib/types';

interface DownloadProgress {
  model_id: string;
  status: string;
  progress: number;
  downloaded_mb: number;
  total_mb: number;
  error?: string;
}

export function UnifiedModelSection() {
  const [models, setModels] = useState<ModelCardData[]>([]);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Use appStore for persisted downloaded models
  const downloadedModels = useDownloadedModels();
  const { setDownloadedModels, addDownloadedModel, removeDownloadedModel } = useAppStore();

  // Load models and check availability on mount
  const loadModels = useCallback(async () => {
    setLoading(true);
    setChecking(true);
    try {
      // Get available models
      const availableModels = await invoke<ModelCardData[]>('get_models');
      setModels(availableModels);

      // Check which models are downloaded and update appStore
      const available = await invoke<string[]>('list_downloaded_models');
      setDownloadedModels(available);
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, [setDownloadedModels]);

  useEffect(() => {
    loadModels();

    // Listen for download progress events
    const unlisten = listen<DownloadProgress>('model-download-progress', (event) => {
      const { model_id, status, progress: prog, error } = event.payload;

      if (status === 'complete') {
        setDownloading(null);
        setDownloadProgress(0);
        addDownloadedModel(model_id);
        setDownloadErrors(prev => { const next = { ...prev }; delete next[model_id]; return next; });
      } else if (status === 'downloading') {
        setDownloading(model_id);
        setDownloadProgress(prog);
      } else if (status === 'error') {
        setDownloading(null);
        setDownloadProgress(0);
        if (error) {
          setDownloadErrors(prev => ({ ...prev, [model_id]: error }));
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadModels]);

  const downloadModel = async (modelId: string) => {
    // Guard: ensure sidecar is available before attempting download
    const { environmentValidation } = useAppStore.getState();
    if (!environmentValidation?.sidecarScript ||
        !hasPackageStatusKey(environmentValidation.sidecarScript, 'available')) {
      setDownloadErrors(prev => ({
        ...prev,
        [modelId]: 'Sidecar script missing — click \'Repair Installation\' in Settings > System Status to fix.',
      }));
      return;
    }

    setDownloading(modelId);
    setDownloadProgress(0);
    setDownloadErrors(prev => { const next = { ...prev }; delete next[modelId]; return next; });

    try {
      await invoke('download_model', { modelId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to download model:', msg);
      setDownloadErrors(prev => ({ ...prev, [modelId]: msg }));
      setDownloading(null);
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      await invoke('delete_model', { modelId });
      removeDownloadedModel(modelId);
    } catch (err) {
      console.error('Failed to delete model:', err);
    }
  };

  const retryDownload = (modelId: string) => {
    downloadModel(modelId);
  };

  if (loading) {
    return (
      <section className="space-y-3 rounded-lg border border-muted p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          AI Models
        </h3>
        <div className="flex items-center justify-center p-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-muted p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          AI Models
        </h3>
        <button
          data-testid="refresh-models-btn"
          onClick={loadModels}
          className="flex items-center gap-1 rounded-md border border-muted px-2 py-1 text-xs hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Download and manage AI models for stem separation. Downloaded models are stored locally.
      </p>

      <div className="space-y-3">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            isDownloaded={downloadedModels.includes(model.id)}
            isChecking={checking}
            isDownloading={downloading === model.id}
            downloadProgress={downloading === model.id ? downloadProgress : 0}
            downloadError={downloadErrors[model.id] || null}
            onDownload={downloadModel}
            onDelete={deleteModel}
            onRetry={retryDownload}
          />
        ))}
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
    </section>
  );
}