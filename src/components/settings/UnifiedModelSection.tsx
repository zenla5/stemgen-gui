import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Debug: track render count
  const renderCount = useRef(0);
  renderCount.current++;
  const _renderN = renderCount.current;
  const [models, setModels] = useState<ModelCardData[]>([]);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listModelsError, setListModelsError] = useState<string | null>(null);

  // Use appStore for persisted downloaded models
  const downloadedModels = useDownloadedModels();
  const addDownloadedModel = useAppStore(state => state.addDownloadedModel);
  const removeDownloadedModel = useAppStore(state => state.removeDownloadedModel);

  // Debug: track effect invocations to detect infinite loops
  const effectRunCount = useRef(0);
  // Debug: store human-readable state for DOM-based diagnostics (CDP can't capture webview console)
  const debugInfo = useRef<string>('init');

  // Load models and check availability on mount
  const loadModels = useCallback(async () => {
    const t0 = performance.now();
    console.log(`[UnifiedModelSection] loadModels START t=${t0.toFixed(0)}ms`);
    debugInfo.current = `loadModels-started@${Math.round(t0)}ms`;
    setLoading(true);
    setChecking(true);
    setError(null);
    setListModelsError(null);

    try {
      // Get available models — this is fast (static data), so clear the primary spinner first.
      // Race against a timeout so the spinner can't hang indefinitely if the IPC stalls.
      console.log('[UnifiedModelSection] invoking get_models...');
      debugInfo.current = `invoking-get_models@${Math.round(performance.now())}ms`;
      const tInvoke = performance.now();

      const GET_MODELS_TIMEOUT_MS = 5000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`get_models timed out after ${GET_MODELS_TIMEOUT_MS}ms`)), GET_MODELS_TIMEOUT_MS)
      );
      const availableModels = await Promise.race([
        invoke<ModelCardData[]>('get_models'),
        timeoutPromise,
      ]);

      const invokeMs = Math.round(performance.now() - tInvoke);
      console.log(`[UnifiedModelSection] get_models resolved in ${invokeMs}ms, models=${availableModels.length}`);
      debugInfo.current = `get_models-resolved@${invokeMs}ms models=${availableModels.length}`;
      setModels(availableModels);
      setLoading(false);
      console.log(`[UnifiedModelSection] setLoading(false) called, total so far=${(performance.now() - t0).toFixed(0)}ms`);

      // Check which models are downloaded and update appStore
      // Use independent try/catch so list_downloaded_models failure doesn't prevent showing models
      try {
        console.log('[UnifiedModelSection] invoking list_downloaded_models...');
        debugInfo.current = `invoking-list_downloaded_models@${Math.round(performance.now())}ms`;
        const tList = performance.now();
        const available = await invoke<string[]>('list_downloaded_models');
        const listMs = Math.round(performance.now() - tList);
        console.log(`[UnifiedModelSection] list_downloaded_models resolved in ${listMs}ms, count=${available.length}`);
        debugInfo.current = `list_done@${listMs}ms count=${available.length}`;
        // Use getState() to avoid stale closure — Zustand action refs are stable
        useAppStore.getState().setDownloadedModels(available);
      } catch (listErr) {
        console.error('[UnifiedModelSection] Failed to list downloaded models:', listErr);
        debugInfo.current = `list_error: ${listErr instanceof Error ? listErr.message : String(listErr)}`;
        setListModelsError(
          listErr instanceof Error ? listErr.message : String(listErr)
        );
      }
    } catch (err) {
      console.error('[UnifiedModelSection] Failed to load models:', err);
      debugInfo.current = `get_models_error: ${err instanceof Error ? err.message : String(err)}`;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
      setLoading(false);
      const totalMs = Math.round(performance.now() - t0);
      console.log(`[UnifiedModelSection] loadModels DONE total=${totalMs}ms`);
      if (debugInfo.current.startsWith('loadModels-started') || debugInfo.current.startsWith('invoking-get_models')) {
        debugInfo.current += ` | finally@${totalMs}ms (get_models never resolved!)`;
      } else {
        debugInfo.current += ` | finally@${totalMs}ms`;
      }
    }
  }, []);

  useEffect(() => {
    effectRunCount.current++;
    console.log(`[UnifiedModelSection] useEffect run #${effectRunCount.current} — calling loadModels`);
    debugInfo.current = `effect-run#${effectRunCount.current}`;
    if (effectRunCount.current > 1) {
      console.warn(`[UnifiedModelSection] WARNING: useEffect ran ${effectRunCount.current} times — possible infinite loop!`);
      debugInfo.current += ` WARNING: infinite-loop-detected`;
    }
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
  }, [loadModels, addDownloadedModel]);

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
    console.log(`[UnifiedModelSection] RENDER #${_renderN}: loading=true, showing spinner`);
    return (
      <section className="space-y-3 rounded-lg border border-muted p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          AI Models
        </h3>
        <div className="flex items-center justify-center p-8">
          <div data-testid="models-loading-spinner" className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        {/* Debug info for CI diagnostics — invisible but readable via page.evaluate */}
        <div data-testid="debug-model-section" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
          render={_renderN};effectRuns={effectRunCount.current};loading=true;state={debugInfo.current}
        </div>
      </section>
    );
  }

  console.log(`[UnifiedModelSection] RENDER #${_renderN}: loading=false, showing ${models.length} models`);
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

      {/* Warning banner when list_downloaded_models fails but get_models succeeded */}
      {listModelsError && !error && (
        <div data-testid="models-list-warning" className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          Could not check downloaded models — Python or sidecar not available.
        </div>
      )}

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