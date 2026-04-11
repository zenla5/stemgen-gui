/**
 * Reusable Dependency Check Panel
 *
 * Self-contained component that runs environment validation, displays
 * results in a table, and offers auto-install suggestions for missing
 * dependencies. Used inside FirstRunWizard and can be embedded in
 * Settings or any other view.
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';
import { InstallProgress } from '@/components/ui/InstallProgress';
import { Button } from '@/components/ui/Button';
import type { PackageStatus, AvailableInstaller } from '@/lib/types';
import { getDepStatus } from '@/lib/depStatus';
import { CheckCircle, XCircle, AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A single dependency row in the results table. */
interface DepRow {
  name: string;
  manifestKey: string;
  status: 'ok' | 'missing' | 'warning' | 'checking' | 'pending';
  message?: string;
}

/** Props for the DependencyCheckPanel component. */
interface DependencyCheckPanelProps {
  /** Called when all required dependencies are satisfied. */
  onAllDependenciesOk?: () => void;
  /** Whether to show the "Run Check" button (default: true). */
  showCheckButton?: boolean;
  /** Whether to auto-run the check on mount (default: false). */
  autoCheckOnMount?: boolean;
}

const DEPENDENCY_DEFS: Array<{ name: string; manifestKey: string; description: string; canInstall?: boolean }> = [
  { name: 'FFmpeg', manifestKey: 'ffmpeg', description: 'Audio/video processing — required' },
  { name: 'Python', manifestKey: 'python', description: 'AI model inference — required' },
  { name: 'PyTorch', manifestKey: 'pytorch', description: 'Machine learning framework — required' },
  { name: 'demucs', manifestKey: 'demucs', description: 'AI stem separation model — required' },
  { name: 'CUDA', manifestKey: 'cuda', description: 'GPU acceleration — optional', canInstall: false },
];

const STATUS_ICON: Record<DepRow['status'], () => ReactNode> = {
  ok: () => <CheckCircle className="h-4 w-4 text-green-500" />,
  missing: () => <XCircle className="h-4 w-4 text-red-500" />,
  warning: () => <AlertCircle className="h-4 w-4 text-yellow-500" />,
  checking: () => <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  pending: () => <span className="h-4 w-4 inline-block rounded-full border-2 border-muted-foreground/30" />,
};

export function DependencyCheckPanel({
  onAllDependenciesOk,
  showCheckButton = true,
  autoCheckOnMount = false,
}: DependencyCheckPanelProps) {
  const [deps, setDeps] = useState<DepRow[]>(
    DEPENDENCY_DEFS.map(d => ({ name: d.name, manifestKey: d.manifestKey, status: 'pending' }))
  );
  const [installersMap, setInstallersMap] = useState<Record<string, AvailableInstaller[]>>({});
  const [installingDep, setInstallingDep] = useState<string | null>(null);
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [installResult, setInstallResult] = useState<{ success: boolean; alreadyInstalled: boolean; error?: string } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const hasRunCheckRef = useRef(false);
  const { getAvailableInstallers, installDependency, fetchInstallManifest, validateEnvironment } = useAppStore();

  const updateDep = useCallback((name: string, status: DepRow['status'], message?: string) => {
    setDeps(prev => prev.map(d => d.name === name ? { ...d, status, message } : d));
  }, []);

  const runCheck = useCallback(async () => {
    setIsChecking(true);
    hasRunCheckRef.current = true;

    // Mark all as checking
    setDeps(prev => prev.map(d => ({ ...d, status: 'checking' as const })));

    try {
      await fetchInstallManifest();
      const env = await invoke<Record<string, PackageStatus | unknown>>('validate_environment');

      // Track missing deps for installer pre-fetch (computed from fresh results, not stale state)
      const missingManifestKeys = new Set<string>();

      for (const depDef of DEPENDENCY_DEFS) {
        let pkg: PackageStatus | unknown;
        let successMsg: string | undefined;

        if (depDef.name === 'FFmpeg') {
          pkg = (env as Record<string, unknown>).ffmpeg;
          successMsg = 'Found and ready';
        } else if (depDef.name === 'Python') {
          pkg = (env as Record<string, unknown>).python;
          successMsg = `v${(env as Record<string, unknown>).pythonVersion ?? 'unknown'}`;
        } else if (depDef.name === 'PyTorch') {
          pkg = (env as Record<string, unknown>).pytorch;
          successMsg = `v${(env as Record<string, unknown>).pytorchVersion ?? 'unknown'}`;
        } else if (depDef.name === 'demucs') {
          pkg = (env as Record<string, unknown>).demucs;
          successMsg = 'Ready';
        } else if (depDef.name === 'CUDA') {
          pkg = (env as Record<string, unknown>).cuda;
          successMsg = String((env as Record<string, unknown>).gpuName ?? 'GPU available');
        }

        const { status, message } = getDepStatus(pkg, successMsg);
        updateDep(depDef.name, status, message);

        // Track missing/warning deps for installer pre-fetch
        if (status === 'missing' || status === 'warning') {
          missingManifestKeys.add(depDef.manifestKey);
        }
      }

      // Pre-fetch installers for missing deps using fresh results
      for (const key of missingManifestKeys) {
        if (!installersMap[key]) {
          const installers = await getAvailableInstallers(key);
          setInstallersMap(prev => ({ ...prev, [key]: installers }));
        }
      }

      // Invalidate app store cache and re-validate
      useAppStore.setState({ environmentValidatedAt: null });
      await validateEnvironment();
    } catch (_err) {
      for (const depDef of DEPENDENCY_DEFS) {
        updateDep(depDef.name, 'warning', 'Could not check dependency');
      }
    } finally {
      setIsChecking(false);
    }
  }, [fetchInstallManifest, getAvailableInstallers, installersMap, updateDep, validateEnvironment]);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheckOnMount && !hasRunCheckRef.current) {
      runCheck();
    }
  }, [autoCheckOnMount, runCheck]);

  // Notify parent when all required deps are OK
  useEffect(() => {
    if (!isChecking && hasRunCheckRef.current) {
      const allOk = deps.filter(d => d.name !== 'CUDA').every(d => d.status === 'ok');
      if (allOk) {
        onAllDependenciesOk?.();
      }
    }
  }, [deps, isChecking, onAllDependenciesOk]);

  const handleInstall = async (manifestKey: string) => {
    const installers = installersMap[manifestKey];
    if (!installers || installers.length === 0) return;

    setInstallingDep(manifestKey);
    setInstallLines([]);
    setInstallResult(null);

    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<{ depName: string; line: string }>('install-progress', (event) => {
      if (event.payload.depName === manifestKey) {
        setInstallLines(prev => [...prev, event.payload.line]);
      }
    });

    try {
      const result = await installDependency(manifestKey, installers[0].id);
      setInstallResult(result);
      if (!result.success) {
        const dep = deps.find(d => d.manifestKey === manifestKey);
        if (dep) updateDep(dep.name, 'warning', result.error || 'Installation failed');
      }
      // Auto re-check after install
      await runCheck();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setInstallResult({ success: false, alreadyInstalled: false, error: msg });
      const dep = deps.find(d => d.manifestKey === manifestKey);
      if (dep) updateDep(dep.name, 'warning', `Install failed: ${msg}`);
    } finally {
      unlisten();
      setInstallingDep(null);
    }
  };

  const missingCount = deps.filter(d => d.status === 'missing').length;
  const warningCount = deps.filter(d => d.status === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Dependencies</h3>
        {showCheckButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={runCheck}
            disabled={isChecking}
            className="h-7 text-xs"
          >
            {isChecking ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking...</>
            ) : (
              <><RefreshCw className="h-3 w-3 mr-1" /> Run Check</>
            )}
          </Button>
        )}
      </div>

      {/* Results table */}
      <div className="space-y-1">
        {deps.map(dep => {
          const depDef = DEPENDENCY_DEFS.find(d => d.name === dep.name);
          const installers = installersMap[dep.manifestKey] || [];
          const isInstalling = installingDep === dep.manifestKey;
          const canInstall = dep.status === 'missing' && installers.length > 0 && depDef?.canInstall !== false;
          const Icon = STATUS_ICON[dep.status];

          return (
            <div key={dep.name} data-testid="wizard-dep-row" data-dep-key={dep.manifestKey} className="rounded-lg bg-muted/30">
              <div className="flex items-center gap-3 p-2">
                <Icon />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{dep.name}</span>
                    <span data-testid="wizard-dep-status" className={cn(
                      'text-xs',
                      dep.status === 'ok' && 'text-green-600',
                      dep.status === 'missing' && 'text-red-600',
                      dep.status === 'warning' && 'text-yellow-600',
                    )}>
                      {dep.status === 'checking' ? 'Checking...' : dep.message ?? ''}
                    </span>
                  </div>
                </div>
                {canInstall && !isInstalling && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInstall(dep.manifestKey)}
                    className="h-6 px-2 text-xs"
                    data-testid={`install-btn-${dep.manifestKey}`}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Install
                  </Button>
                )}
                {isInstalling && (
                  <span className="flex items-center gap-1 text-xs text-blue-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Installing...
                  </span>
                )}
              </div>
              {isInstalling && installLines.length > 0 && (
                <div className="px-2 pb-2">
                  <InstallProgress
                    lines={installLines}
                    isRunning={!installResult}
                    result={installResult}
                    commandDisplay={installers[0]?.commandDisplay}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {!isChecking && hasRunCheckRef.current && (
        <>
          {missingCount === 0 && warningCount === 0 && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-3 text-sm text-green-700 dark:text-green-300">
              All dependencies are installed.
            </div>
          )}
          {missingCount > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 text-sm text-amber-700 dark:text-amber-300">
              {missingCount} required dependenc{missingCount > 1 ? 'ies are' : 'y is'} missing.
              Click "Install" for one-click installation.
            </div>
          )}
          {missingCount === 0 && warningCount > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 text-sm text-blue-700 dark:text-blue-300">
              All required dependencies are installed. {warningCount} optional component{warningCount > 1 ? 's have' : ' has'} warnings.
            </div>
          )}
        </>
      )}
    </div>
  );
}
