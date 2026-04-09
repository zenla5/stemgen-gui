/**
 * LibraryOverviewPanel — summary dashboard for a library root.
 *
 * Shows scan stats, status breakdown bar, and batch action buttons.
 */

import { useLibraryStore } from '@/stores/libraryStore';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { formatTimestamp } from '@/lib/types/library';
import type { LibraryScanResultV2 } from '@/lib/types/library';
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

  const root = libraryRoots.find((r) => r.id === selectedRootId);
  const stats = scanResultV2;

  const handleScan = () => {
    scanLibraryRoot(selectedRootId, true);
  };

  const handleGenerateMissing = async () => {
    if (!stats || stats.no_stem_count === 0) return;
    await queueGenerate(selectedRootId, defaultModel, defaultDjSoftware, defaultOutputFormat);
    await useBatchQueueStore.getState().startProcessor(selectedRootId);
  };

  const handleRegenerateOutdated = async () => {
    if (!stats || stats.has_stem_outdated_count === 0) return;
    await queueRegenerate(selectedRootId, defaultModel, false, defaultDjSoftware, defaultOutputFormat);
    await useBatchQueueStore.getState().startProcessor(selectedRootId);
  };

  return (
    <div className="border-b space-y-4" data-testid="library-overview-panel">
      {/* Header: root path + actions */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={root?.path}>
            {root?.path ?? 'Unknown root'}
          </p>
          {root?.last_scanned_at && (
            <p className="text-xs text-muted-foreground">
              Last scanned {formatTimestamp(root.last_scanned_at)}
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
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scanning progress */}
      {isScanning && (
        <div className="flex items-center gap-2 px-4 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Scanning library...
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Total" value={stats.total_sources} />
            <StatCard label="No Stem" value={stats.no_stem_count} color="text-gray-500" />
            <StatCard label="Current" value={stats.has_stem_current_count} color="text-green-500" />
            <StatCard
              label="Outdated"
              value={stats.has_stem_outdated_count}
              color="text-yellow-500"
            />
            <StatCard
              label="Unknown"
              value={stats.has_stem_unknown_provenance_count}
              color="text-blue-500"
            />
            <StatCard label="Orphaned" value={stats.orphaned_stem_count} color="text-red-500" />
            <StatCard label="Ignored" value={stats.ignored_count} color="text-gray-400" />
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
              Generate Missing ({stats.no_stem_count})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateOutdated}
              disabled={stats.has_stem_outdated_count === 0}
              data-testid="regenerate-outdated-btn"
            >
              <RotateCw className="mr-2 h-3 w-3" />
              Regenerate Outdated ({stats.has_stem_outdated_count})
            </Button>
          </div>
        </>
      )}
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
  const total = stats.total_sources;
  if (total === 0) return null;

  const segments = [
    { count: stats.has_stem_current_count, color: 'bg-green-500', label: 'Current' },
    { count: stats.has_stem_outdated_count, color: 'bg-yellow-500', label: 'Outdated' },
    { count: stats.has_stem_unknown_provenance_count, color: 'bg-blue-500', label: 'Unknown' },
    { count: stats.orphaned_stem_count, color: 'bg-red-500', label: 'Orphaned' },
    { count: stats.no_stem_count, color: 'bg-gray-400', label: 'No Stem' },
    { count: stats.ignored_count, color: 'bg-gray-300', label: 'Ignored' },
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
