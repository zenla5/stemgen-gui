/**
 * LibraryView — top-level page component for the Library tab.
 *
 * Composes LibraryOverviewPanel, LibraryTable, and StemInfoPanel.
 * Shows an empty state CTA when no library roots are configured.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/libraryStore';
import { Button } from '@/components/ui/Button';
import { LibraryRootSettings } from './LibraryRootSettings';
import { LibraryOverviewPanel } from './LibraryOverviewPanel';
import { LibraryTable } from './LibraryTable';
import { Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export function LibraryView() {
  const { t } = useTranslation();
  const { libraryRoots, loadLibraryRoots, scanLibraryRoot, isScanning } =
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
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('library.selectRoot'),
    });
    if (selected && typeof selected === 'string') {
      const { addLibraryRoot } = useLibraryStore.getState();
      const id = await addLibraryRoot(selected, 'alongside');
      setSelectedRootId(id);
    }
  };

  // Empty state
  if (libraryRoots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">{t('library.setUpLibrary')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('library.setUpDescription')}
          </p>
        </div>
        <Button onClick={handleAddRoot} size="lg">
          <Plus className="mr-2 h-5 w-5" />
          {t('library.addLibraryFolder')}
        </Button>
      </div>
    );
  }

  // Configured state
  return (
    <div className="flex h-full flex-col">
      {/* Overview panel */}
      {selectedRootId && (
        <LibraryOverviewPanel
          selectedRootId={selectedRootId}
          onOpenSettings={() => setShowSettings(!showSettings)}
        />
      )}

      {/* Library table */}
      <div className="flex-1 overflow-hidden">
        {isScanning ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {t('library.scanning')}
          </div>
        ) : (
          <LibraryTable />
        )}
      </div>

      {/* Settings panel */}
      {showSettings && <LibraryRootSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
