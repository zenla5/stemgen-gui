/**
 * LibraryOverviewPanel — summary dashboard for a library root.
 *
 * Shows scan stats, status breakdown bar, and batch action buttons.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/libraryStore';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { formatTimestamp } from '@/lib/types/library';
import type { LibraryScanResultV2 } from '@/lib/types/library';
import { BatchConfirmDialog, type BatchMode } from './BatchConfirmDialog';
import { RefreshCw, Settings, Play, RotateCw } from 'lucide-react';

interface LibraryOverviewPanelProps {
  selectedRootId: string;
  onOpenSettings: () => void;
}

export function LibraryOverviewPanel({
  selectedRootId,
  onOpenSettings,
}: LibraryOverviewPanelProps) {
  const { libraryRoots, isScanning, scanLibraryRoot, scanResultV2 } = useLibraryStore();
  const { queueGenerate, queueRegenerate } = useBatchQueueStore();
  const { defaultModel, defaultDjSoftware, defaultOutputFormat } = useSettingsStore();
  const { t } = useTranslation();

  const root = libraryRoots.find((r) => r.id === selectedRootId);
  const stats = scanResultV2;

  const [batchDialog, setBatchDialog] = useState<{
    mode: BatchMode;
    fileCount: number;
  } | null>(null);

  const handleScan = () => {
    scanLibraryRoot(selectedRootId, true);
  };

  const handleGenerateMissing = () => {
    if (!stats || stats.no_stem_count === 0) return;
    setBatchDialog({ mode: 'generate', fileCount: stats.no_stem_count });
  };

  const handleRegenerateOutdated = () => {
    if (!stats || stats.has_stem_outdated_count === 0) return;
    setBatchDialog({ mode: 'regenerate', fileCount: stats.has_stem_outdated_count });
  };

  const handleBatchConfirm = async (includeUnknown: boolean) => {
    if (!batchDialog) return;
    setBatchDialog(null);
    if (batchDialog.mode === 'generate') {
      await queueGenerate(selectedRootId, defaultModel, defaultDjSoftware, defaultOutputFormat);
    } else {
      await queueRegenerate(selectedRootId, defaultModel, includeUnknown, defaultDjSoftware, defaultOutputFormat);
    }
    await useBatchQueueStore.getState().startProcessor(selectedRootId);
  };

  const handleBatchCancel = () => setBatchDialog(null);

  return (
    <div className="border-b space-y-4" data-testid="library-overview-panel">
      {/* Header: root path + actions */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={root?.path}>
            {root?.path ?? t('library.unknownRoot')}
          </p>
          {root?.last_scanned_at && (
            <p className="text-xs text-muted-foreground">
              {t('library.lastScanned', { timestamp: formatTimestamp(root.last_scanned_at) })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={isScanning}
            data-testid="scan-now-btn"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? t('library.scanning') : t('library.scanNow')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label={t('library.settings')}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scanning progress */}
      {isScanning && (
        <div className="flex items-center gap-2 px-4 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('library.scanningLibrary')}
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label={t('library.total')} value={stats.total_sources} />
            <StatCard label={t('library.noStem')} value={stats.no_stem_count} color="text-gray-500" />
            <StatCard label={t('library.current')} value={stats.has_stem_current_count} color="text-green-500" />
            <StatCard
              label={t('library.outdated')}
              value={stats.has_stem_outdated_count}
              color="text-yellow-500"
            />
            <StatCard
              label={t('library.unknown')}
              value={stats.has_stem_unknown_provenance_count}
              color="text-blue-500"
            />
            <StatCard label={t('library.orphaned')} value={stats.orphaned_stem_count} color="text-red-500" />
            <StatCard label={t('library.ignored')} value={stats.ignored_count} color="text-gray-400" />
          </div>

          {/* Status breakdown bar */}
          {stats.total_sources > 0 && <StatusBar stats={stats} />}

          {/* Batch action buttons */}
          <div className="flex items-center gap-2 px-4 pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateMissing}
              disabled={stats.no_stem_count === 0}
              data-testid="generate-missing-btn"
            >
              <Play className="mr-2 h-3 w-3" />
              {t('library.generateMissing', { count: stats.no_stem_count })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateOutdated}
              disabled={stats.has_stem_outdated_count === 0}
              data-testid="regenerate-outdated-btn"
            >
              <RotateCw className="mr-2 h-3 w-3" />
              {t('library.regenerateOutdated', { count: stats.has_stem_outdated_count })}
            </Button>
          </div>
        </>
      )}

      {/* Batch confirmation dialog */}
      <BatchConfirmDialog
        open={batchDialog !== null}
        mode={batchDialog?.mode ?? 'generate'}
        fileCount={batchDialog?.fileCount ?? 0}
        estimatedDurationSecs={0}
        modelName={defaultModel}
        djPreset={defaultDjSoftware}
        outputFormat={defaultOutputFormat}
        onConfirm={handleBatchConfirm}
        onCancel={handleBatchCancel}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color ?? ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusBar({ stats }: { stats: LibraryScanResultV2 }) {
  const { t } = useTranslation();
  const total = stats.total_sources;
  if (total === 0) return null;

  const segments = [
    { count: stats.has_stem_current_count, color: 'bg-green-500', label: t('library.current') },
    { count: stats.has_stem_outdated_count, color: 'bg-yellow-500', label: t('library.outdated') },
    { count: stats.has_stem_unknown_provenance_count, color: 'bg-blue-500', label: t('library.unknown') },
    { count: stats.orphaned_stem_count, color: 'bg-red-500', label: t('library.orphaned') },
    { count: stats.no_stem_count, color: 'bg-gray-400', label: t('library.noStem') },
    { count: stats.ignored_count, color: 'bg-gray-300', label: t('library.ignored') },
  ].filter((s) => s.count > 0);

  return (
    <div className="px-4" data-testid="status-bar">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} h-full transition-all`}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.label}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-3">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`inline-block h-2 w-2 rounded-full ${seg.color}`}
            />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}