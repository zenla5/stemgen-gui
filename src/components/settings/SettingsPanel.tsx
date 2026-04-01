import { Settings, Moon, Sun, Monitor, Globe, Cpu, Sparkles, RefreshCw, CheckCircle, XCircle, AlertCircle, Package, HardDrive, Download, ChevronDown, Copy, Check } from 'lucide-react';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSettingsStore, supportedLanguages } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { THEMES, AI_MODELS, DJ_SOFTWARE_PRESETS, OUTPUT_FORMATS, QUALITY_PRESETS, DEVICE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ModelManager } from './ModelManager';
import { InstallProgress } from '@/components/ui/InstallProgress';
import { Button } from '@/components/ui/Button';
import type { AvailableInstaller } from '@/lib/types';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SettingsPanel() {
  const settings = useSettingsStore();
  const appSettings = useAppStore();
  const {
    updateSettings, checkSidecarHealth, validateEnvironment,
    sidecarHealth, environmentValidation, environmentValidatedAt,
    fetchInstallManifest,
    getAvailableInstallers, installDependency,
    activeInstallLines, installResults,
  } = appSettings;
  const { dependencies } = appSettings;

  // Local state for install UI
  const [installingDep, setInstallingDep] = useState<string | null>(null);
  const [installersMap, setInstallersMap] = useState<Record<string, AvailableInstaller[]>>({});

  // Fetch manifest on mount
  useEffect(() => {
    fetchInstallManifest();
  }, [fetchInstallManifest]);

  // Load available installers for missing deps
  const loadInstallersForDep = useCallback(async (depKey: string) => {
    if (installersMap[depKey]) return;
    const installers = await getAvailableInstallers(depKey);
    setInstallersMap(prev => ({ ...prev, [depKey]: installers }));
  }, [getAvailableInstallers, installersMap]);

  // Map dependency display names to manifest keys
  const depKeyMap: Record<string, string> = {
    'FFmpeg': 'ffmpeg',
    'FFprobe': 'ffmpeg',  // FFprobe comes with FFmpeg
    'Python': 'python',
    'PyTorch': 'pytorch',
    'torchaudio': 'pytorch',  // Installed together with PyTorch
    'demucs': 'demucs',
    'CUDA': 'pytorch',  // CUDA is part of PyTorch install
    'Sidecar Script': '',  // Cannot auto-install
  };

  const handleInstall = async (depKey: string, installerId: string) => {
    setInstallingDep(depKey);
    try {
      await installDependency(depKey, installerId);
    } finally {
      setInstallingDep(null);
    }
  };

  const handleInstallAllMissing = async () => {
    // Install in order: Python first, then PyTorch, then demucs, then FFmpeg
    const installOrder = ['python', 'pytorch', 'demucs', 'ffmpeg'];
    for (const depKey of installOrder) {
      const validation = environmentValidation;
      // Check if this dep is missing
      const isMissing = depKey === 'ffmpeg'
        ? (!validation?.ffmpeg || !('available' in validation.ffmpeg))
        : depKey === 'python'
        ? (!validation?.python || !('available' in validation.python))
        : depKey === 'pytorch'
        ? (!validation?.pytorch || !('available' in validation.pytorch))
        : depKey === 'demucs'
        ? (!validation?.demucs || !('available' in validation.demucs))
        : false;

      if (!isMissing) continue;

      const installers = installersMap[depKey] || await getAvailableInstallers(depKey);
      if (installers.length === 0) continue;

      setInstallingDep(depKey);
      try {
        await installDependency(depKey, installers[0].id);
      } finally {
        setInstallingDep(null);
      }
    }
  };

  // Count missing required dependencies
  const missingDeps = [
    environmentValidation?.ffmpeg,
    environmentValidation?.python,
    environmentValidation?.pytorch,
    environmentValidation?.demucs,
  ].filter(s => s && !('available' in s)).length;

  const isPackageAvailable = (status?: { available: null } | { unavailable: string } | { warning: string } | { missing: string } | null) => {
    if (!status) return false;
    return 'available' in status;
  };

  const getPackageIcon = (status?: { available: null } | { unavailable: string } | { warning: string } | { missing: string } | null): ReactNode => {
    if (!status) return <XCircle className="h-4 w-4 text-muted-foreground" />;
    if (isPackageAvailable(status)) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if ('warning' in status) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    if ('unavailable' in status) return <AlertCircle className="h-4 w-4 text-orange-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getPackageLabel = (status?: { available: null } | { unavailable: string } | { warning: string } | { missing: string } | null): string => {
    if (!status) return 'Not checked';
    if ('available' in status) return 'Available';
    if ('warning' in status) return status.warning;
    if ('unavailable' in status) return status.unavailable;
    if ('missing' in status) return status.missing;
    return 'Unknown';
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h2 className="text-xl font-semibold">Settings</h2>
      </div>

      {/* System Status (Phase 3) */}
      <section className="space-y-3 rounded-lg border border-muted p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4" />
            System Status
          </h3>
          <div className="flex gap-2">
            {missingDeps > 0 && (
              <Button
                data-testid="install-all-btn"
                variant="default"
                size="sm"
                onClick={handleInstallAllMissing}
                disabled={installingDep !== null}
                className="h-7 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Install All Missing
              </Button>
            )}
            <button
              data-testid="refresh-env-btn"
              onClick={() => {
                useAppStore.setState({ environmentValidatedAt: null });
                checkSidecarHealth();
                validateEnvironment();
              }}
              className="flex items-center gap-1 rounded-md border border-muted px-2 py-1 text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
        {environmentValidatedAt && (
          <p className="text-xs text-muted-foreground">
            Last checked {formatTimeAgo(environmentValidatedAt)}
          </p>
        )}

        {/* Sidecar Health Summary */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatusBadge
            label="Python"
            value={sidecarHealth?.pythonVersion || (sidecarHealth?.pythonFound ? 'Found' : 'Not found')}
            healthy={sidecarHealth?.pythonFound}
            icon={getPackageIcon(environmentValidation?.python)}
          />
          <StatusBadge
            label="PyTorch"
            value={sidecarHealth?.pytorchVersion || getPackageLabel(environmentValidation?.pytorch)}
            healthy={!!sidecarHealth?.pytorchVersion}
            icon={getPackageIcon(environmentValidation?.pytorch)}
          />
          <StatusBadge
            label="GPU"
            value={sidecarHealth?.gpuDevice || (sidecarHealth?.gpuAvailable ? 'CUDA' : 'CPU only')}
            healthy={sidecarHealth?.gpuAvailable}
            icon={getPackageIcon(environmentValidation?.cuda)}
          />
          <StatusBadge
            label="Models"
            value={`${sidecarHealth?.modelCount || 0} downloaded`}
            healthy={!!sidecarHealth?.modelCount && (sidecarHealth?.modelCount ?? 0) > 0}
            icon={<CheckCircle className={cn("h-4 w-4", (sidecarHealth?.modelCount ?? 0) > 0 ? "text-green-500" : "text-muted-foreground")} />}
          />
        </div>

        {/* Detailed Package List */}
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Detailed Status</h4>
          <div className="grid gap-2 text-sm">
            <InstallablePackageRow
              label="FFmpeg"
              status={getPackageIcon(environmentValidation?.ffmpeg)}
              value={getPackageLabel(environmentValidation?.ffmpeg)}
              healthy={isPackageAvailable(environmentValidation?.ffmpeg)}
              depKey="ffmpeg"
              depKeyMap={depKeyMap}
              installersMap={installersMap}
              installingDep={installingDep}
              activeInstallLines={activeInstallLines}
              installResults={installResults}
              loadInstallersForDep={loadInstallersForDep}
              handleInstall={handleInstall}
            />
            <PackageRow
              label="FFprobe"
              status={getPackageIcon(environmentValidation?.ffprobe)}
              value={getPackageLabel(environmentValidation?.ffprobe)}
              healthy={isPackageAvailable(environmentValidation?.ffprobe)}
            />
            <InstallablePackageRow
              label="Python"
              status={getPackageIcon(environmentValidation?.python)}
              value={`${environmentValidation?.pythonPath || 'Not found'} (${environmentValidation?.pythonVersion || 'unknown'})`}
              healthy={isPackageAvailable(environmentValidation?.python)}
              depKey="python"
              depKeyMap={depKeyMap}
              installersMap={installersMap}
              installingDep={installingDep}
              activeInstallLines={activeInstallLines}
              installResults={installResults}
              loadInstallersForDep={loadInstallersForDep}
              handleInstall={handleInstall}
            />
            <InstallablePackageRow
              label="PyTorch"
              status={getPackageIcon(environmentValidation?.pytorch)}
              value={environmentValidation?.pytorchVersion || getPackageLabel(environmentValidation?.pytorch)}
              healthy={isPackageAvailable(environmentValidation?.pytorch)}
              depKey="pytorch"
              depKeyMap={depKeyMap}
              installersMap={installersMap}
              installingDep={installingDep}
              activeInstallLines={activeInstallLines}
              installResults={installResults}
              loadInstallersForDep={loadInstallersForDep}
              handleInstall={handleInstall}
            />
            <PackageRow
              label="torchaudio"
              status={getPackageIcon(environmentValidation?.torchaudio)}
              value={environmentValidation?.torchaudioVersion || getPackageLabel(environmentValidation?.torchaudio)}
              healthy={isPackageAvailable(environmentValidation?.torchaudio)}
            />
            <InstallablePackageRow
              label="demucs"
              status={getPackageIcon(environmentValidation?.demucs)}
              value={environmentValidation?.demucsVersion || getPackageLabel(environmentValidation?.demucs)}
              healthy={isPackageAvailable(environmentValidation?.demucs)}
              depKey="demucs"
              depKeyMap={depKeyMap}
              installersMap={installersMap}
              installingDep={installingDep}
              activeInstallLines={activeInstallLines}
              installResults={installResults}
              loadInstallersForDep={loadInstallersForDep}
              handleInstall={handleInstall}
            />
            <PackageRow
              label="CUDA"
              status={getPackageIcon(environmentValidation?.cuda)}
              value={environmentValidation?.gpuName || getPackageLabel(environmentValidation?.cuda)}
              healthy={isPackageAvailable(environmentValidation?.cuda)}
            />
            <PackageRow
              label="Sidecar Script"
              status={getPackageIcon(environmentValidation?.sidecarScript)}
              value={environmentValidation?.sidecarScriptPath || getPackageLabel(environmentValidation?.sidecarScript)}
              healthy={isPackageAvailable(environmentValidation?.sidecarScript)}
            />
          </div>
        </div>

        {/* Warnings */}
        {environmentValidation?.warnings && environmentValidation.warnings.length > 0 && (
          <div className="mt-3 rounded-md bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Warnings</span>
            </div>
            <ul className="mt-1 text-xs text-yellow-700">
              {environmentValidation.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sidecar Errors */}
        {sidecarHealth?.errors && sidecarHealth.errors.length > 0 && (
          <div className="mt-3 rounded-md bg-red-500/10 p-3">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Errors</span>
            </div>
            <ul className="mt-1 text-xs text-red-700">
              {sidecarHealth.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Ready Status */}
        {environmentValidation?.isReady ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>Environment ready for stem separation</span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-sm text-orange-600">
            <AlertCircle className="h-4 w-4" />
            <span>Environment not ready — some dependencies are missing</span>
          </div>
        )}
      </section>

      {/* Theme */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {settings.theme === 'dark' ? <Moon className="h-4 w-4" /> : 
           settings.theme === 'light' ? <Sun className="h-4 w-4" /> : 
           <Monitor className="h-4 w-4" />}
          Appearance
        </h3>
        <div className="flex gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => settings.setTheme(theme.id)}
              data-testid={`theme-btn-${theme.id}`}
              className={cn(
                'flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors',
                settings.theme === theme.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted hover:border-primary/50'
              )}
            >
              {theme.id === 'light' && <Sun className="h-4 w-4" />}
              {theme.id === 'dark' && <Moon className="h-4 w-4" />}
              {theme.id === 'system' && <Monitor className="h-4 w-4" />}
              {theme.name}
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" />
          Language
        </h3>
        <select
          data-testid="language-select"
          value={settings.language}
          onChange={(e) => settings.setLanguage(e.target.value)}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName}
            </option>
          ))}
        </select>
      </section>

      {/* AI Model */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          AI Model
        </h3>
        <div className="grid gap-2">
          {AI_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => updateSettings({ model: model.id })}
              className={cn(
                'flex flex-col items-start rounded-md border p-3 text-left transition-colors',
                appSettings.settings.model === model.id
                  ? 'border-primary bg-primary/10'
                  : 'border-muted hover:border-primary/50'
              )}
            >
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-muted-foreground">{model.description}</span>
              <div className="mt-1 flex gap-2">
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  model.quality === 'draft' && 'bg-yellow-500/20 text-yellow-600',
                  model.quality === 'standard' && 'bg-green-500/20 text-green-600',
                  model.quality === 'master' && 'bg-purple-500/20 text-purple-600',
                )}>
                  {model.quality}
                </span>
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-600">
                  {model.speed}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Model Downloads */}
      <section className="space-y-3 rounded-lg border border-muted p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          Model Downloads
        </h3>
        <p className="text-xs text-muted-foreground">
          Download and manage AI models for stem separation. Downloaded models are stored locally.
        </p>
        <ModelManager />
      </section>

      {/* Device */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-4 w-4" />
          Processing Device
        </h3>
        <div className="flex gap-2">
          {DEVICE_OPTIONS.map((device) => {
            const isDisabled = device.id === 'cuda' && !dependencies.cuda ||
                             device.id === 'mps' && !dependencies.mps;
            return (
              <button
                key={device.id}
                onClick={() => updateSettings({ device: device.id })}
                disabled={isDisabled}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors',
                  appSettings.settings.device === device.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted hover:border-primary/50',
                  isDisabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {device.name}
                {isDisabled && <span className="text-xs">(unavailable)</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* DJ Software */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Target DJ Software</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DJ_SOFTWARE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => updateSettings({ djPreset: preset.id })}
              className={cn(
                'flex flex-col items-start rounded-md border p-3 text-left transition-colors',
                appSettings.settings.djPreset === preset.id
                  ? 'border-primary bg-primary/10'
                  : 'border-muted hover:border-primary/50'
              )}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-xs text-muted-foreground">Codec: {preset.codec.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Output Format */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Output Format</h3>
        <div className="flex gap-2">
          {OUTPUT_FORMATS.map((format) => (
            <button
              key={format.id}
              onClick={() => updateSettings({ outputFormat: format.id })}
              className={cn(
                'flex flex-col items-start rounded-md border p-3 text-left transition-colors',
                appSettings.settings.outputFormat === format.id
                  ? 'border-primary bg-primary/10'
                  : 'border-muted hover:border-primary/50'
              )}
            >
              <span className="font-medium">{format.name}</span>
              <span className="text-xs text-muted-foreground">{format.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Quality Preset */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Quality Preset</h3>
        <div className="flex gap-2">
          {QUALITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => updateSettings({ qualityPreset: preset.id })}
              className={cn(
                'flex flex-col items-start rounded-md border p-3 text-left transition-colors',
                appSettings.settings.qualityPreset === preset.id
                  ? 'border-primary bg-primary/10'
                  : 'border-muted hover:border-primary/50'
              )}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-xs text-muted-foreground">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* GPU Settings */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">GPU Acceleration</h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.gpuEnabled}
            onChange={(e) => settings.setGpuEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm">Enable GPU acceleration for faster processing</span>
        </label>
        {dependencies.cuda && (
          <p className="text-xs text-green-600">✓ NVIDIA CUDA detected</p>
        )}
        {dependencies.mps && (
          <p className="text-xs text-green-600">✓ Apple Silicon MPS detected</p>
        )}
      </section>

      {/* CPU Threads */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">CPU Threads</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="16"
            value={settings.cpuThreads}
            onChange={(e) => settings.setCpuThreads(parseInt(e.target.value))}
            className="w-48"
          />
          <span className="text-sm">{settings.cpuThreads} threads</span>
        </div>
      </section>

      {/* Parallel Jobs */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Parallel Jobs</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="4"
            value={settings.maxParallelJobs}
            onChange={(e) => settings.setMaxParallelJobs(parseInt(e.target.value))}
            className="w-48"
          />
          <span className="text-sm">{settings.maxParallelJobs} job(s) at a time</span>
        </div>
      </section>
    </div>
  );
}

// Helper components
function StatusBadge({ label, value, healthy, icon }: { label: string; value: string; healthy?: boolean; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      {icon}
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn(
          "text-sm font-medium",
          healthy === undefined ? "text-muted-foreground" :
          healthy ? "text-green-600" : "text-orange-600"
        )}>
          {value}
        </span>
      </div>
    </div>
  );
}

function PackageRow({ label, status, value, healthy }: { label: string; status: ReactNode; value: string; healthy?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded px-2 py-1">
      <div className="flex items-center gap-2">
        {status}
        <span className="text-sm">{label}</span>
      </div>
      <span className={cn(
        "text-xs",
        healthy === undefined ? "text-muted-foreground" :
        healthy ? "text-green-600" : "text-red-600"
      )}>
        {value}
      </span>
    </div>
  );
}

interface InstallablePackageRowProps {
  label: string;
  status: ReactNode;
  value: string;
  healthy?: boolean;
  depKey: string;
  depKeyMap: Record<string, string>;
  installersMap: Record<string, AvailableInstaller[]>;
  installingDep: string | null;
  activeInstallLines: Record<string, string[]>;
  installResults: Record<string, import('@/lib/types').InstallResult>;
  loadInstallersForDep: (depKey: string) => Promise<void>;
  handleInstall: (depKey: string, installerId: string) => Promise<void>;
}

function InstallablePackageRow({
  label, status, value, healthy, depKey,
  installersMap, installingDep, activeInstallLines, installResults,
  loadInstallersForDep, handleInstall,
}: InstallablePackageRowProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const manifestKey = depKey;
  const installers = installersMap[manifestKey] || [];
  const isInstalling = installingDep === manifestKey;
  const lines = activeInstallLines[manifestKey] || [];
  const result = installResults[manifestKey];

  // Load installers when unhealthy
  useEffect(() => {
    if (!healthy && manifestKey) {
      loadInstallersForDep(manifestKey);
    }
  }, [healthy, manifestKey, loadInstallersForDep]);

  const handleCopyCommand = async () => {
    if (installers.length > 0) {
      await navigator.clipboard.writeText(installers[0].commandDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded px-2 py-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status}
          <span className="text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn(
            "text-xs",
            healthy === undefined ? "text-muted-foreground" :
            healthy ? "text-green-600" : "text-red-600"
          )}>
            {value}
          </span>
          {!healthy && installers.length > 0 && !isInstalling && !(result?.success) && (
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleInstall(manifestKey, installers[0].id)}
                className="h-6 px-2 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Install
              </Button>
              {installers.length > 1 && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="h-6 px-1 text-xs"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  {showDropdown && (
                    <div className="absolute right-0 top-7 z-10 rounded-md border bg-popover p-1 shadow-md min-w-[120px]">
                      {installers.map((installer) => (
                        <button
                          key={installer.id}
                          onClick={() => {
                            handleInstall(manifestKey, installer.id);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent"
                        >
                          {installer.name}
                          {installer.needsElevation && ' (elevated)'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCommand}
                className="h-6 px-1 text-xs"
                title="Copy install command"
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Show install progress if this dep is installing or has recent output */}
      {(isInstalling || lines.length > 0) && (
        <div className="mt-2">
          <InstallProgress
            lines={lines}
            isRunning={isInstalling}
            result={isInstalling ? null : result}
            commandDisplay={installers[0]?.commandDisplay}
          />
        </div>
      )}
    </div>
  );
}
