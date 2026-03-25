import { Settings, Moon, Sun, Monitor, Globe, Cpu, Sparkles } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { THEMES, AI_MODELS, DJ_SOFTWARE_PRESETS, OUTPUT_FORMATS, QUALITY_PRESETS, DEVICE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function SettingsPanel() {
  const settings = useSettingsStore();
  const appSettings = useAppStore();
  const { updateSettings } = appSettings;
  const { dependencies } = appSettings;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h2 className="text-xl font-semibold">Settings</h2>
      </div>

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
          value={settings.language}
          onChange={(e) => settings.setLanguage(e.target.value)}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="es">Español</option>
          <option value="ja">日本語</option>
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
