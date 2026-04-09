/**
 * LibraryTable — filterable, sortable table for library entries.
 *
 * Shows one row per source file from the library index with
 * sorting, filtering, grouping, multi-select, and context menu.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import { StemInfoPanel } from './StemInfoPanel';
import { Button } from '@/components/ui/Button';
import {
  stemStateLabel,
  stemStateColor,
  formatTimestamp,
} from '@/lib/types/library';
import type { LibraryIndexEntry, StemFileState, StemProvenance } from '@/lib/types/library';
import { ChevronUp, ChevronDown, MoreHorizontal, X } from 'lucide-react';

type SortField = 'status' | 'source_path' | 'stem_date' | 'stem_model';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const ALL_STATUSES: StemFileState[] = [
  'NoStem',
  'HasStemCurrent',
  'HasStemOutdated',
  'HasStemUnknownProvenance',
  'OrphanedStem',
  'Ignored',
];

function parseProvenance(entry: LibraryIndexEntry): StemProvenance | null {
  if (!entry.provenance_json) return null;
  try {
    return JSON.parse(entry.provenance_json) as StemProvenance;
  } catch {
    return null;
  }
}

function filenameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? path;
}

// ─── Context Menu ────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  entry: LibraryIndexEntry;
}

function ContextMenu({
  state,
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, entry: LibraryIndexEntry) => void;
}) {
  const items = [
    { label: 'Regenerate', action: 'regenerate' },
    { label: 'Mark as Ignored', action: 'ignore' },
    { label: 'Delete Stem', action: 'delete' },
  ];

  return (
    <div
      className="fixed z-50 min-w-40 rounded-md border bg-popover p-1 shadow-md"
      style={{ left: state.x, top: state.y }}
      data-testid="context-menu"
      onMouseLeave={onClose}
    >
      {items.map((item) => (
        <button
          key={item.action}
          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          onClick={() => {
            onAction(item.action, state.entry);
            onClose();
          }}
          data-testid={`context-${item.action}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LibraryTable() {
  const {
    libraryIndex,
    statusFilter,
    searchQuery,
    groupBy,
    selectedStems,
    toggleStemSelection,
    clearSelection,
    setStatusFilter,
    setSearchQuery,
    setGroupBy,
  } = useLibraryStore();

  const [sortField, setSortField] = useState<SortField>('source_path');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = libraryIndex;

    if (statusFilter.length > 0) {
      entries = entries.filter((e) => statusFilter.includes(e.status));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.source_path.toLowerCase().includes(q) ||
          (e.stem_path?.toLowerCase().includes(q) ?? false)
      );
    }

    return entries;
  }, [libraryIndex, statusFilter, searchQuery]);

  // Sort entries
  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'source_path':
          cmp = filenameFromPath(a.source_path).localeCompare(
            filenameFromPath(b.source_path)
          );
          break;
        case 'stem_date': {
          const da = parseProvenance(a)?.separation_timestamp ?? '';
          const db = parseProvenance(b)?.separation_timestamp ?? '';
          cmp = da.localeCompare(db);
          break;
        }
        case 'stem_model': {
          const ma = parseProvenance(a)?.separation_model ?? '';
          const mb = parseProvenance(b)?.separation_model ?? '';
          cmp = ma.localeCompare(mb);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredEntries, sortField, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const pageEntries = sortedEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Clamp page
  const safePage = Math.min(page, totalPages - 1);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setPage(0);
    },
    [setSearchQuery]
  );

  const handleStatusToggle = (status: StemFileState) => {
    const current = statusFilter;
    if (current.includes(status)) {
      setStatusFilter(current.filter((s) => s !== status));
    } else {
      setStatusFilter([...current, status]);
    }
    setPage(0);
  };

  const handleRowClick = (entry: LibraryIndexEntry, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Range select
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        const e = sortedEntries[i];
        if (e && !selectedStems.has(e.id)) {
          toggleStemSelection(e.id);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      toggleStemSelection(entry.id);
    } else {
      setSelectedEntryId(entry.id);
    }
    setLastSelectedIndex(index);
  };

  const handleContextMenu = (e: React.MouseEvent, entry: LibraryIndexEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleContextAction = (action: string, _entry: LibraryIndexEntry) => {
    // Actions are placeholders for now — actual implementations come in later tasks
    console.log(`Context action: ${action}`);
  };

  const handleSelectAll = () => {
    if (selectedStems.size === sortedEntries.length) {
      clearSelection();
    } else {
      const allIds = new Set(sortedEntries.map((e) => e.id));
      useLibraryStore.setState({ selectedStems: allIds });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  };

  // Empty state
  if (libraryIndex.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground" data-testid="library-table-empty">
        No entries found. Scan your library to see entries here.
      </div>
    );
  }

  const selectedEntry = selectedEntryId
    ? libraryIndex.find((e) => e.id === selectedEntryId) ?? null
    : null;

  return (
    <div className="flex h-full" data-testid="library-table">
      {/* Main table area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-8 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="search-input"
          />

          {/* Status filter checkboxes */}
          <div className="flex items-center gap-1">
            {ALL_STATUSES.map((status) => (
              <label
                key={status}
                className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                  statusFilter.includes(status) ? 'bg-accent' : ''
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={statusFilter.length === 0 || statusFilter.includes(status)}
                  onChange={() => handleStatusToggle(status)}
                  data-testid={`filter-${status}`}
                />
                <span className={stemStateColor(status)}>{stemStateLabel(status)}</span>
              </label>
            ))}
          </div>

          {/* Grouping selector */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            data-testid="group-select"
          >
            <option value="none">No grouping</option>
            <option value="folder">Group by folder</option>
            <option value="model">Group by model</option>
            <option value="status">Group by status</option>
          </select>

          {/* Selection info */}
          {selectedStems.size > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {selectedStems.size} selected
            </span>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={selectedStems.size === sortedEntries.length && sortedEntries.length > 0}
                    onChange={handleSelectAll}
                    data-testid="select-all-checkbox"
                  />
                </th>
                <th className="px-2 py-2 text-left">
                  <button
                    className="flex items-center font-medium"
                    onClick={() => handleSort('status')}
                    data-testid="sort-status"
                  >
                    Status <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button
                    className="flex items-center font-medium"
                    onClick={() => handleSort('source_path')}
                    data-testid="sort-source-path"
                  >
                    File <SortIcon field="source_path" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button
                    className="flex items-center font-medium"
                    onClick={() => handleSort('stem_model')}
                    data-testid="sort-stem-model"
                  >
                    Model <SortIcon field="stem_model" />
                  </button>
                </th>
                <th className="px-2 py-2 text-left">
                  <button
                    className="flex items-center font-medium"
                    onClick={() => handleSort('stem_date')}
                    data-testid="sort-stem-date"
                  >
                    Stem Date <SortIcon field="stem_date" />
                  </button>
                </th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry, idx) => {
                const prov = parseProvenance(entry);
                const globalIndex = safePage * PAGE_SIZE + idx;
                const isSelected = selectedStems.has(entry.id);
                const isDetailOpen = selectedEntryId === entry.id;

                return (
                  <tr
                    key={entry.id}
                    className={`cursor-pointer border-b hover:bg-accent/50 ${
                      isSelected ? 'bg-accent/30' : ''
                    } ${isDetailOpen ? 'bg-accent/20' : ''}`}
                    onClick={(e) => handleRowClick(entry, globalIndex, e)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                    data-testid={`row-${entry.id}`}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={isSelected}
                        onChange={() => toggleStemSelection(entry.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-${entry.id}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${stemStateColor(entry.status)}`}
                        data-testid={`status-badge-${entry.id}`}
                      >
                        {stemStateLabel(entry.status)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5" title={entry.source_path}>
                      {filenameFromPath(entry.source_path)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {prov?.separation_model ?? '\u2014'}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {prov?.separation_timestamp
                        ? formatTimestamp(prov.separation_timestamp)
                        : '\u2014'}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e as unknown as React.MouseEvent, entry);
                        }}
                        aria-label="Actions"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              {sortedEntries.length} entries &middot; Page {safePage + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => p - 1)}
                data-testid="prev-page"
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                data-testid="next-page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel for StemInfoPanel */}
      {selectedEntry && (
        <div className="w-80 border-l overflow-auto" data-testid="detail-panel">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium truncate" title={selectedEntry.source_path}>
              {filenameFromPath(selectedEntry.source_path)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setSelectedEntryId(null)}
              aria-label="Close detail"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {selectedEntry.stem_path ? (
            <StemInfoPanel stemPath={selectedEntry.stem_path} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              No stem file for this entry.
            </div>
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <ContextMenu
            state={contextMenu}
            onClose={() => setContextMenu(null)}
            onAction={handleContextAction}
          />
        </>
      )}
    </div>
  );
}
