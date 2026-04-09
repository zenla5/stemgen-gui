/**
 * OrphanedStemsView — cleanup UI for orphaned stem files.
 *
 * Shows a filterable list of orphaned stems with per-row actions
 * (Delete, Re-link, Ignore) and bulk "Delete All" with confirmation.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/libraryStore';
import { Button } from '@/components/ui/Button';
import { formatTimestamp } from '@/lib/types/library';
import type { OrphanedStemEntry } from '@/lib/types/library';
import { Trash2, Link2, EyeOff, AlertTriangle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface OrphanedStemsViewProps {
  rootId: string;
}

export function OrphanedStemsView({ rootId }: OrphanedStemsViewProps) {
  const { t } = useTranslation();
  const { orphans, loadOrphans, deleteOrphan, relinkOrphan, ignoreOrphan } = useLibraryStore();
  const [search, setSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [relinkResult, setRelinkResult] = useState<{
    stemPath: string;
    matched: boolean;
  } | null>(null);

  useEffect(() => {
    loadOrphans(rootId);
  }, [rootId, loadOrphans]);

  const filtered = orphans.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.stem_path.toLowerCase().includes(q) ||
      o.last_known_source_path.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (stemPath: string) => {
    setDeleteConfirmId(null);
    await deleteOrphan(stemPath);
  };

  const handleRelink = async (stemPath: string) => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: t('library.selectReplacementSource'),
    });
    if (selected && typeof selected === 'string') {
      const result = await relinkOrphan(stemPath, selected);
      setRelinkResult({ stemPath, matched: result.matched });
      setTimeout(() => setRelinkResult(null), 3000);
    }
  };

  const handleIgnore = async (stemPath: string) => {
    await ignoreOrphan(stemPath);
  };

  const handleBulkDelete = async () => {
    setBulkDeleteConfirm(false);
    for (const orphan of orphans) {
      await deleteOrphan(orphan.stem_path);
    }
  };

  if (orphans.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground" data-testid="orphans-empty">
        {t('library.noOrphans')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="orphans-view">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-medium">{t('library.orphanedStems')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('library.orphanedStemsCount', { count: orphans.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('library.filter')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="orphans-search"
          />
          {bulkDeleteConfirm ? (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>{t('library.deleteAllQuestion', { count: orphans.length })}</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                data-testid="bulk-delete-confirm-btn"
              >
                {t('library.yes')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteConfirm(false)}
                data-testid="bulk-delete-cancel-btn"
              >
                {t('library.no')}
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteConfirm(true)}
              data-testid="bulk-delete-btn"
            >
              <Trash2 className="mr-2 h-3 w-3" />
              {t('library.deleteAll')}
            </Button>
          )}
        </div>
      </div>

      {/* Relink result toast */}
      {relinkResult && (
        <div
          className={`mx-4 mt-2 rounded px-3 py-2 text-sm ${
            relinkResult.matched
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
          data-testid="relink-result-toast"
        >
          {relinkResult.matched
            ? t('library.relinkSuccess')
            : t('library.relinkFailed')}
        </div>
      )}

      {/* Orphan list */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('library.noOrphansMatchFilter')}
          </div>
        ) : (
          filtered.map((orphan) => (
            <OrphanRow
              key={orphan.id}
              orphan={orphan}
              isDeleteConfirming={deleteConfirmId === orphan.id}
              onDeleteConfirm={() => handleDelete(orphan.stem_path)}
              onDeleteRequest={() => setDeleteConfirmId(orphan.stem_path)}
              onDeleteCancel={() => setDeleteConfirmId(null)}
              onRelink={() => handleRelink(orphan.stem_path)}
              onIgnore={() => handleIgnore(orphan.stem_path)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function OrphanRow({
  orphan,
  isDeleteConfirming,
  onDeleteConfirm,
  onDeleteRequest,
  onDeleteCancel,
  onRelink,
  onIgnore,
}: {
  orphan: OrphanedStemEntry;
  isDeleteConfirming: boolean;
  onDeleteConfirm: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onRelink: () => void;
  onIgnore: () => void;
}) {
  const { t } = useTranslation();
  const stemFilename = orphan.stem_path.split(/[/\\]/).pop() ?? orphan.stem_path;
  const sourceFilename =
    orphan.last_known_source_path.split(/[/\\]/).pop() ?? orphan.last_known_source_path;

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent/30"
      data-testid={`orphan-row-${orphan.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={orphan.stem_path}>
          {stemFilename}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={orphan.last_known_source_path}>
          {t('library.was', { filename: sourceFilename })}
        </p>
        <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
          {orphan.file_size != null && (
            <span>{formatFileSize(orphan.file_size)}</span>
          )}
          {orphan.last_modified && <span>{formatTimestamp(orphan.last_modified)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {isDeleteConfirming ? (
          <>
            <span className="text-xs text-muted-foreground mr-1">{t('library.deleteQuestion')}</span>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onDeleteConfirm}
              data-testid="delete-confirm-btn"
            >
              {t('library.yes')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onDeleteCancel}
              data-testid="delete-cancel-btn"
            >
              {t('library.no')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={onRelink}
              title={t('library.relinkToSource')}
              aria-label={t('library.relinkToSource')}
              data-testid="relink-btn"
            >
              <Link2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={onIgnore}
              title={t('library.ignore')}
              aria-label={t('library.ignore')}
              data-testid="ignore-btn"
            >
              <EyeOff className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={onDeleteRequest}
              title={t('library.delete')}
              aria-label={t('library.delete')}
              data-testid="delete-btn"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
