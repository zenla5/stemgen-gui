import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { HardDrive, RefreshCw } from 'lucide-react';
import { ModelCard, type ModelCardData } from './ModelCard';
import { useAppStore, computeEnvironmentReadiness } from '@/stores/appStore';
import { hasPackageStatusKey, type ModelCheckStatus, type ModelStatus } from '@/lib/types';
import { formatInstalledVersion } from '@/lib/modelStatus';

interface DownloadProgress {
  model_id: string;
  status: string;
  progress: number;
  downloaded_mb: number;
  total_mb: number;
  message?: string;
  error?: string;
}

export function UnifiedModelSection() {
  const [models, setModels] = useState<ModelCardData[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelCheckStatus>>({});
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use appStore for persisted downloaded models
  const addDownloadedModel = useAppStore(state => state.addDownloadedModel);
  const removeDownloadedModel = useAppStore(state => state.removeDownloadedModel);
  const refreshDownloadedModels = useAppStore(state => state.refreshDownloadedModels);

  /**
   * Resolve per-model availability + installed version from the backend's
   * unified `get_model_statuses` command (HF cache + direct .onnx merged),
   * so the panel always shows the same installed set as the footer indicator.
   */
  const loadModelStatuses = useCallback(async (modelList: ModelCardData[]) => {
    // Initialise all rows to 'checking' so the panel renders instantly with spinners
    const initialStatuses: Record<string, ModelCheckStatus> = {};
    for (const m of modelList) {
      initialStatuses[m.id] = 'checking';
    }
    setModelStatuses(initialStatuses);

    // Determine GPU presence from the store (fast path) or fall back to IPC
    const { environmentValidation } = useAppStore.getState();
    const { gpuStatus } = computeEnvironmentReadiness(environmentValidation);
    let gpuPresent = gpuStatus === 'cuda';
    if (gpuStatus === 'unknown') {
      try {
        const gpu = await invoke<{ gpuPresent: boolean }>('get_gpu_status');
        gpuPresent = gpu.gpuPresent;
      } catch {
        // If GPU probe fails, assume no GPU — safe default
        gpuPresent = false;
      }
    }

    try {
      const statuses = await invoke<ModelStatus[]>('get_model_statuses');
      const nextStatuses: Record<string, ModelCheckStatus> = {};
      const nextVersions: Record<string, string> = {};
      for (const status of statuses) {
        if (!status.available) {
          nextStatuses[status.id] = 'unavailable';
          continue;
        }
        const model = modelList.find(m => m.id === status.id);
        if (model?.gpu_required && !gpuPresent) {
          nextStatuses[status.id] = 'gpu-warning';
        } else {
          nextStatuses[status.id] = 'available';
          addDownloadedModel(status.id);
        }
        const version = formatInstalledVersion(status.revision, status.lastModified);
        if (version) {
          nextVersions[status.id] = version;
        }
      }
      setModelStatuses(nextStatuses);
      setVersions(nextVersions);
    } catch (err) {
      console.error('Failed to load model statuses:', err);
    }
  }, [addDownloadedModel]);

  // Load models and check availability on mount
  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const availableModels = await invoke<ModelCardData[]>('get_models');
      setModels(availableModels);
      setLoading(false);

      await loadModelStatuses(availableModels);
    } catch (err) {
      console.error('Failed to load models:', err);
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [loadModelStatuses]);

  useEffect(() => {
    loadModels();

    // Listen for download progress events
    const unlisten = listen<DownloadProgress>('model-download-progress', (event) => {
      const { model_id, status, progress: prog, message, error } = event.payload;

      if (status === 'complete') {
        setDownloading(null);
        setDownloadProgress(0);
        setDownloadMessage(null);
        addDownloadedModel(model_id);
        setModelStatuses(prev => ({ ...prev, [model_id]: 'available' }));
        setDownloadErrors(prev => { const next = { ...prev }; delete next[model_id]; return next; });
        refreshDownloadedModels();
        toast.success(`${model_id} downloaded`);
      } else if (status === 'downloading') {
        setDownloading(model_id);
        setDownloadProgress(prog);
        setDownloadMessage(message || null);
      } else if (status === 'error') {
        setDownloading(null);
        setDownloadProgress(0);
        setDownloadMessage(null);
        const errMsg = error || 'Model download failed';
        setDownloadErrors(prev => ({ ...prev, [model_id]: errMsg }));
        toast.error(errMsg);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadModels, addDownloadedModel, refreshDownloadedModels]);

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
    setDownloadMessage(null);
    setDownloadErrors(prev => { const next = { ...prev }; delete next[modelId]; return next; });

    try {
      await invoke('download_model', { modelId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to download model:', msg);
      setDownloadErrors(prev => ({ ...prev, [modelId]: msg }));
      setDownloading(null);
      setDownloadMessage(null);
      toast.error(msg);
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      await invoke('delete_model', { modelId });
      removeDownloadedModel(modelId);
      setModelStatuses(prev => ({ ...prev, [modelId]: 'unavailable' }));
      refreshDownloadedModels();
      toast.success(`${modelId} deleted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to delete model:', msg);
      toast.error(msg);
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
          <div data-testid="models-loading-spinner" className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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

      {/* Error banner when get_models fails */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2" data-testid="models-load-error">
          <span className="flex-1">{error}</span>
          <button onClick={loadModels} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      <div className="space-y-3">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            status={modelStatuses[model.id] ?? 'checking'}
            isDownloading={downloading === model.id}
            downloadProgress={downloading === model.id ? downloadProgress : 0}
            downloadMessage={downloading === model.id ? downloadMessage : null}
            downloadError={downloadErrors[model.id] || null}
            version={versions[model.id]}
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
