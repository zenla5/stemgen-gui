/**
 * LibraryView — top-level page component for the Library tab.
 *
 * Composes LibraryOverviewPanel, LibraryTable, and StemInfoPanel.
 * Shows an empty state CTA when no library roots are configured.
 */

import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import { Button } from '@/components/ui/Button';
import { LibraryRootSettings } from './LibraryRootSettings';
import { Plus, RefreshCw, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export function LibraryView() {
  const { libraryRoots, loadLibraryRoots, scanLibraryRoot, isScanning, scanResultV2 } =
    useLibraryStore();
  const [showSettings, setShowSettings] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  useEffect(() => {
    loadLibraryRoots();
  }, [loadLibraryRoots]);

  // Auto-select first root and trigger incremental scan
  useEffect(() => {
    if (libraryRoots.length > 0 && !selectedRootId) {
      const firstRoot = libraryRoots[0];
      setSelectedRootId(firstRoot.id);
      scanLibraryRoot(firstRoot.id, false);
    }
  }, [libraryRoots, selectedRootId, scanLibraryRoot]);

  const handleAddRoot = async () => {
    try {
      const selected = await invoke<string | null>('open', {
        options: { directory: true, multiple: false, title: 'Select Library Root' },
      });
      if (selected) {
        const { addLibraryRoot } = useLibraryStore.getState();
        const id = await addLibraryRoot(selected, 'alongside');
        setSelectedRootId(id);
      }
    } catch (error) {
      console.error('Failed to add library root:', error);
    }
  };

  const handleScan = () => {
    if (selectedRootId) {
      scanLibraryRoot(selectedRootId, true);
    }
  };

  // Empty state
  if (libraryRoots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Set up your Library</h2>
          <p className="mt-2 text-muted-foreground">
            Add a folder containing your music collection to get started with stem management.
          </p>
        </div>
        <Button onClick={handleAddRoot} size="lg">
          <Plus className="mr-2 h-5 w-5" />
          Add Library Folder
        </Button>
      </div>
    );
  }

  // Configured state
  const stats = scanResultV2;
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Library</h2>
          {selectedRootId && (
            <span className="text-sm text-muted-foreground">
              {libraryRoots.find((r) => r.id === selectedRootId)?.path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleScan} disabled={isScanning}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats overview */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 border-b p-4 sm:grid-cols-4 lg:grid-cols-7">
          <StatCard label="Total" value={stats.total_sources} />
          <StatCard label="No Stem" value={stats.no_stem_count} color="text-gray-500" />
          <StatCard label="Current" value={stats.has_stem_current_count} color="text-green-500" />
          <StatCard label="Outdated" value={stats.has_stem_outdated_count} color="text-yellow-500" />
          <StatCard label="Unknown" value={stats.has_stem_unknown_provenance_count} color="text-blue-500" />
          <StatCard label="Orphaned" value={stats.orphaned_stem_count} color="text-red-500" />
          <StatCard label="Ignored" value={stats.ignored_count} color="text-gray-400" />
        </div>
      )}

      {/* Library table placeholder */}
      <div className="flex-1 overflow-auto p-4">
        {stats && stats.entries.length > 0 ? (
          <div className="text-sm text-muted-foreground">
            {stats.entries.length} entries loaded. Full table view coming in TASK-026.
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {isScanning ? 'Scanning...' : 'No entries found. Click "Scan Now" to scan your library.'}
          </div>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && <LibraryRootSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

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
