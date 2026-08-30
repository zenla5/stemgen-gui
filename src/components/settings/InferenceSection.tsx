import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, AlertCircle, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { useSettingsStore, type ActiveProvider } from '@/stores/settingsStore';
import { estimateCost } from '@/lib/cloudCostEstimate';
import { CloudPrivacyModal } from './CloudPrivacyModal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

export interface ReplicateVersion {
  id: string;
  created_at: string;
  is_latest: boolean;
}

interface ReplicateVersionDropdownProps {
  onVersionSelected: (hash: string | null) => void;
  selectedVersion: string | null;
}

// Build date from environment variable (set during build via VITE_BUILD_DATE)
// If not available (e.g., in dev without the env var), comparisons are skipped
const BUILD_DATE: string | undefined = (import.meta as { env?: { VITE_BUILD_DATE?: string } }).env?.VITE_BUILD_DATE;

function isVersionNewerThanBuild(versionDate: string, buildDate: string): boolean {
  try {
    return new Date(versionDate) > new Date(buildDate);
  } catch {
    return false;
  }
}

function ReplicateVersionDropdown({ onVersionSelected, selectedVersion }: ReplicateVersionDropdownProps) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<ReplicateVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = await invoke<string | null>('get_provider_api_key', { provider: 'replicate' }).catch(() => null);
      if (!apiKey) {
        setError('No API key configured');
        return;
      }
      const result = await invoke<ReplicateVersion[]>('fetch_replicate_versions', { apiKey });
      setVersions(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Fetch versions when the component mounts
  useEffect(() => {
    fetchVersions();
  }, []);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || null;
    onVersionSelected(value);
  };

  const selectedVersionData = versions.find(v => v.id === selectedVersion);
  const isOlderVersion = selectedVersionData && !selectedVersionData.is_latest;
  const isNewerThanBuild = selectedVersionData && BUILD_DATE && isVersionNewerThanBuild(selectedVersionData.created_at, BUILD_DATE);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{t('inference.versionDropdown.label')}</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchVersions}
          disabled={loading}
          className="h-6 px-2 text-xs"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading versions...
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <select
          value={selectedVersion || ''}
          onChange={handleSelect}
          className="w-full rounded-md border border-muted px-3 py-2 text-sm text-foreground"
        >
          <option value="">Select version...</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.id.slice(0, 8)} — {new Date(version.created_at).toLocaleDateString()}
              {version.is_latest ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      )}

      {isOlderVersion && (
        <p className="text-xs text-amber-600">{t('inference.versionDropdown.olderVersionWarning')}</p>
      )}

      {isNewerThanBuild && (
        <p className="text-xs text-amber-600">{t('inference.versionDropdown.newerVersionWarning')}</p>
      )}
    </div>
  );
}

export function InferenceSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [testingConnection, setTestingConnection] = useState<Record<string, boolean>>({});
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionTestResult | null>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyProvider, setPrivacyProvider] = useState<'fal' | 'replicate'>('fal');
  const previousProvider = useRef<ActiveProvider>(settings.activeProvider);

  // Show privacy modal when provider changes from local to cloud
  useEffect(() => {
    const prev = previousProvider.current;
    const current = settings.activeProvider;

    if (prev === 'local' && (current === 'fal' || current === 'replicate')) {
      if (!settings.privacyNoticeShown) {
        setPrivacyProvider(current);
        setShowPrivacyModal(true);
      }
    }

    previousProvider.current = current;
  }, [settings.activeProvider, settings.privacyNoticeShown]);

  const handleProviderChange = async (provider: ActiveProvider) => {
    await settings.setActiveProvider(provider);
  };

  const handleTestConnection = async (provider: string) => {
    setTestingConnection(prev => ({ ...prev, [provider]: true }));
    setConnectionResults(prev => ({ ...prev, [provider]: null }));
    try {
      const result = await invoke<ConnectionTestResult>('test_provider_connection', { provider });
      setConnectionResults(prev => ({ ...prev, [provider]: result }));
    } catch (error) {
      setConnectionResults(prev => ({
        ...prev,
        [provider]: { ok: false, error: String(error) }
      }));
    } finally {
      setTestingConnection(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleClearKey = async (provider: string) => {
    await invoke('clear_provider_api_key', { provider });
    setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
    setConnectionResults(prev => ({ ...prev, [provider]: null }));
  };

  const handleSaveApiKey = async (provider: string) => {
    const key = apiKeyInputs[provider];
    if (!key) return;
    await invoke('set_provider_api_key', { provider, key });
  };

  const providers: Array<{ id: ActiveProvider; label: string; configured: boolean }> = [
    { id: 'local', label: t('inference.providers.local'), configured: true },
    { id: 'fal', label: t('inference.providers.fal'), configured: settings.falConfigured },
    { id: 'replicate', label: t('inference.providers.replicate'), configured: settings.replicateConfigured },
  ];

  const showApiKeyInput = settings.activeProvider === 'fal' || settings.activeProvider === 'replicate';
  const showTestConnection = settings.activeProvider === 'fal' || settings.activeProvider === 'replicate';
  const showVersionDropdown = settings.activeProvider === 'replicate';

  return (
    <section className="space-y-3 rounded-lg border border-muted p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Cloud className="h-4 w-4" />
        {t('inference.sectionTitle')}
      </h3>

      {/* Provider Selection Radio Group */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('inference.providerLabel')}</label>
        <div className="flex flex-col gap-2">
          {providers.map((provider) => (
            <label
              key={provider.id}
              className={cn(
                'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                settings.activeProvider === provider.id
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:bg-muted/50'
              )}
            >
              <input
                type="radio"
                name="inference-provider"
                value={provider.id}
                checked={settings.activeProvider === provider.id}
                onChange={() => handleProviderChange(provider.id)}
                className="accent-primary"
              />
              <span className="text-sm flex-1">{provider.label}</span>
              {!provider.configured && provider.id !== 'local' && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Not configured
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* API Key Input (shown for fal and replicate) */}
      {showApiKeyInput && (
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t(`inference.apiKeyLabel.${settings.activeProvider}`)}
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInputs[settings.activeProvider] || ''}
              onChange={(e) => setApiKeyInputs(prev => ({
                ...prev,
                [settings.activeProvider]: e.target.value
              }))}
              placeholder="••••••••••••"
              className="flex-1 rounded-md border border-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSaveApiKey(settings.activeProvider)}
              disabled={!apiKeyInputs[settings.activeProvider]}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Test Connection (shown for fal and replicate) */}
      {showTestConnection && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTestConnection(settings.activeProvider)}
            disabled={testingConnection[settings.activeProvider]}
          >
            {testingConnection[settings.activeProvider] ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('inference.testConnection')
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleClearKey(settings.activeProvider)}
          >
            {t('inference.clearKey')}
          </Button>
          {connectionResults[settings.activeProvider] && (
            connectionResults[settings.activeProvider]!.ok ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {t('inference.connectionOk')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <XCircle className="h-4 w-4" />
                {t('inference.connectionFailed')}
                {connectionResults[settings.activeProvider]!.error && (
                  <span className="text-xs text-muted-foreground">
                    — {connectionResults[settings.activeProvider]!.error}
                  </span>
                )}
              </span>
            )
          )}
        </div>
      )}

      {/* Replicate Version Dropdown */}
      {showVersionDropdown && (
        <ReplicateVersionDropdown
          onVersionSelected={(hash) => settings.setReplicateVersionHash(hash)}
          selectedVersion={settings.replicateVersionHash}
        />
      )}

      {/* Cost Estimate */}
      {showApiKeyInput && (
        <p className="text-xs text-muted-foreground">
          {t('inference.costEstimate', { cost: estimateCost(settings.activeProvider as 'fal' | 'replicate', settings.defaultModel) })}
        </p>
      )}

      {/* Batch Mode (shown for cloud providers) */}
      {showApiKeyInput && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inference.batchMode.label')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="batch-mode"
                checked={!settings.batchParallel}
                onChange={() => settings.setBatchParallel(false)}
                className="accent-primary"
              />
              <span className="text-sm">{t('inference.batchMode.sequential')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="batch-mode"
                checked={settings.batchParallel}
                onChange={() => settings.setBatchParallel(true)}
                className="accent-primary"
              />
              <span className="text-sm">{t('inference.batchMode.parallel')}</span>
            </label>
          </div>
        </div>
      )}

      {/* Privacy Modal */}
      <CloudPrivacyModal
        open={showPrivacyModal}
        onOpenChange={setShowPrivacyModal}
        provider={privacyProvider}
      />
    </section>
  );
}
