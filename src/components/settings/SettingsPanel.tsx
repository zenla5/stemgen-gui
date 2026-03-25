import { Settings, Cpu, Database, FolderOutput, Palette } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { AI_MODELS, DJ_SOFTWARE_PRESETS, OUTPUT_FORMATS, QUALITY_PRESETS } from '@/lib/types';
import type { AIModelId, DJSoftwarePreset, OutputFormat, QualityPreset } from '@/lib/types';

export function SettingsPanel() {
  const { settings, updateSettings } = useAppStore();
  const { maxParallelJobs, setMaxParallelJobs, outputDirectory, setOutputDirectory } = useSettingsStore();
  
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      
      {/* AI Model */}
      <SettingsSection icon={Cpu} title="AI Model" description="Select the stem separation model">
        <div className="space-y-2">
          {AI_MODELS.map((model) => (
            <label
              key={model.id}
              className={cn(
                'flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors',
                settings.model === model.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="model"
                  value={model.id}
                  checked={settings.model === model.id}
                  onChange={() => updateSettings({ model: model.id as AIModelId })}
                  className="h-4 w-4"
                />
                <div>
                  <p className="font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.speed} speed • {model.quality} quality
                  </p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </SettingsSection>
      
      {/* DJ Software Preset */}
      <SettingsSection icon={Database} title="DJ Software" description="Choose your DJ software for optimal stem format">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DJ_SOFTWARE_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-lg border p-3 text-center transition-colors',
                settings.djPreset === preset
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input
                type="radio"
                name="djPreset"
                value={preset}
                checked={settings.djPreset === preset}
                onChange={() => updateSettings({ djPreset: preset as DJSoftwarePreset })}
                className="sr-only"
              />
              <span className="capitalize">{preset}</span>
            </label>
          ))}
        </div>
      </SettingsSection>
      
      {/* Output Format */}
      <SettingsSection icon={FolderOutput} title="Output Format" description="Choose the audio encoding format">
        <div className="flex gap-2">
          {OUTPUT_FORMATS.map((format) => (
            <label
              key={format}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 transition-colors',
                settings.outputFormat === format
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input
                type="radio"
                name="outputFormat"
                value={format}
                checked={settings.outputFormat === format}
                onChange={() => updateSettings({ outputFormat: format as OutputFormat })}
                className="h-4 w-4"
              />
              <span className="font-medium uppercase">{format}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ALAC is lossless (larger files), AAC offers better compression with good quality.
        </p>
      </SettingsSection>
      
      {/* Quality Preset */}
      <SettingsSection icon={Palette} title="Quality Preset" description="Balance between speed and quality">
        <div className="space-y-2">
          {QUALITY_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                settings.qualityPreset === preset
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input
                type="radio"
                name="qualityPreset"
                value={preset}
                checked={settings.qualityPreset === preset}
                onChange={() => updateSettings({ qualityPreset: preset as QualityPreset })}
                className="h-4 w-4"
              />
              <div>
                <p className="font-medium capitalize">{preset}</p>
                <p className="text-xs text-muted-foreground">
                  {preset === 'draft' && 'Fast processing, lower quality'}
                  {preset === 'standard' && 'Balanced speed and quality'}
                  {preset === 'master' && 'Slowest processing, highest quality'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </SettingsSection>
      
      {/* Parallel Jobs */}
      <SettingsSection icon={Settings} title="Performance" description="Number of files to process simultaneously">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="4"
            value={maxParallelJobs}
            onChange={(e) => setMaxParallelJobs(parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="w-8 text-center font-mono">{maxParallelJobs}</span>
        </div>
      </SettingsSection>
      
      {/* Output Directory */}
      <SettingsSection icon={FolderOutput} title="Output Directory" description="Where to save processed files">
        <div className="flex gap-2">
          <input
            type="text"
            value={outputDirectory}
            onChange={(e) => setOutputDirectory(e.target.value)}
            placeholder="Same as source file"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2"
          />
          <Button variant="outline" size="sm">
            Browse
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}

interface SettingsSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingsSection({ icon: Icon, title, description, children }: SettingsSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
