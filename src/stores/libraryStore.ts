/**
 * Library Store
 * 
 * Zustand store for stem library management state including:
 * - Library scan results
 * - Staleness reports
 * - Duplicate detection
 * - Export functionality
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  LibraryScanResult,
  LibraryScanFilter,
  StalenessRules,
  StalenessReport,
  DuplicateEntry,
  StemProvenance,
  ExportFormat,
  LibraryRoot,
  LibraryRootUpdate,
  LibraryIndexEntry,
  StemFileState,
  LibraryScanResultV2,
  OrphanedStemEntry,
  RelinkResult,
} from '@/lib/types/library';

// =============================================================================
// Store State Interface
// =============================================================================

interface LibraryState {
  // Library path
  libraryPath: string | null;
  setLibraryPath: (path: string | null) => void;

  // Library roots
  libraryRoots: LibraryRoot[];
  loadLibraryRoots: () => Promise<void>;
  addLibraryRoot: (path: string, outputStrategy: string, mirroredPath?: string, flatPath?: string) => Promise<string>;
  updateLibraryRoot: (id: string, updates: LibraryRootUpdate) => Promise<void>;
  deleteLibraryRoot: (id: string) => Promise<void>;

  // Scan results (v1 — legacy)
  scanResult: LibraryScanResult | null;
  isScanning: boolean;
  scanError: string | null;
  scanLibrary: (path: string, filter?: LibraryScanFilter) => Promise<void>;

  // Scan results (v2 — library root based)
  scanResultV2: LibraryScanResultV2 | null;
  scanLibraryRoot: (rootId: string, fullRescan?: boolean) => Promise<void>;

  // Library index
  libraryIndex: LibraryIndexEntry[];
  statusFilter: StemFileState[];
  searchQuery: string;
  groupBy: 'folder' | 'model' | 'status' | 'none';
  setStatusFilter: (states: StemFileState[]) => void;
  setSearchQuery: (query: string) => void;
  setGroupBy: (by: 'folder' | 'model' | 'status' | 'none') => void;

  // Staleness rules
  stalenessRules: StalenessRules;
  loadStalenessRules: () => Promise<void>;
  saveStalenessRules: (rules: StalenessRules) => Promise<void>;

  // Selected stems
  selectedStems: Set<string>;
  selectStem: (path: string) => void;
  deselectStem: (path: string) => void;
  toggleStemSelection: (path: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Duplicates
  duplicates: DuplicateEntry[];
  isFindingDuplicates: boolean;
  findDuplicates: (path: string) => Promise<void>;

  // Single stem provenance
  currentProvenance: StemProvenance | null;
  loadProvenance: (stemPath: string) => Promise<void>;

  // Export
  isExporting: boolean;
  exportError: string | null;
  exportLibrary: (path: string, outputPath: string, format: ExportFormat) => Promise<void>;

  // User notes
  saveNotes: (stemPath: string, notes: string) => Promise<void>;

  // Integrity check
  verifyIntegrity: (stemPath: string) => Promise<boolean>;

  // Orphan management
  orphans: OrphanedStemEntry[];
  loadOrphans: (rootId: string) => Promise<void>;
  deleteOrphan: (stemPath: string) => Promise<void>;
  relinkOrphan: (stemPath: string, sourcePath: string) => Promise<RelinkResult>;
  ignoreOrphan: (stemPath: string) => Promise<void>;

  // Reset
  reset: () => void;
}

// =============================================================================
// Default State
// =============================================================================

const defaultStalenessRules: StalenessRules = {
  check_source_modified: true,
  check_model_outdated: true,
  minimum_stemgen_gui_version: '1.0.0',
  check_parameters_changed: false,
  default_separation_params: undefined,
  flag_unknown_provenance: false,
};


// =============================================================================
// Store Implementation
// =============================================================================

export const useLibraryStore = create<LibraryState>((set, get) => ({
  // Library path
  libraryPath: null,
  setLibraryPath: (path) => set({ libraryPath: path }),

  // Library roots
  libraryRoots: [],

  loadLibraryRoots: async () => {
    try {
      const roots = await invoke<LibraryRoot[]>('list_library_roots');
      set({ libraryRoots: roots });
    } catch (error) {
      console.error('Failed to load library roots:', error);
    }
  },

  addLibraryRoot: async (path, outputStrategy, mirroredPath, flatPath) => {
    try {
      const id = await invoke<string>('add_library_root', {
        path,
        outputStrategy,
        mirroredPath: mirroredPath ?? null,
        flatPath: flatPath ?? null,
      });
      await get().loadLibraryRoots();
      return id;
    } catch (error) {
      console.error('Failed to add library root:', error);
      throw error;
    }
  },

  updateLibraryRoot: async (id, updates) => {
    try {
      await invoke('update_library_root', { id, updates });
      await get().loadLibraryRoots();
    } catch (error) {
      console.error('Failed to update library root:', error);
      throw error;
    }
  },

  deleteLibraryRoot: async (id) => {
    try {
      await invoke('delete_library_root', { id });
      await get().loadLibraryRoots();
    } catch (error) {
      console.error('Failed to delete library root:', error);
      throw error;
    }
  },

  // Scan results (v1 — legacy)
  scanResult: null,
  isScanning: false,
  scanError: null,

  scanLibrary: async (path, filter) => {
    set({ isScanning: true, scanError: null, libraryPath: path });
    try {
      const rules = get().stalenessRules;
      const result = await invoke<LibraryScanResult>('scan_library', {
        rootPath: path,
        filter: filter ?? null,
        rules,
      });
      set({ scanResult: result, isScanning: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ scanError: errorMessage, isScanning: false });
    }
  },

  // Scan results (v2 — library root based)
  scanResultV2: null,

  scanLibraryRoot: async (rootId, fullRescan = true) => {
    set({ isScanning: true, scanError: null });
    try {
      const result = await invoke<LibraryScanResultV2>('scan_library_root', {
        rootId,
        fullRescan,
      });
      set({
        scanResultV2: result,
        libraryIndex: result.entries,
        isScanning: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ scanError: errorMessage, isScanning: false });
    }
  },

  // Library index
  libraryIndex: [],
  statusFilter: [],
  searchQuery: '',
  groupBy: 'none',

  setStatusFilter: (states) => set({ statusFilter: states, selectedStems: new Set() }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setGroupBy: (by) => set({ groupBy: by }),

  // Staleness rules
  stalenessRules: defaultStalenessRules,

  loadStalenessRules: async () => {
    try {
      const rules = await invoke<StalenessRules>('get_staleness_rules');
      set({ stalenessRules: rules });
    } catch (error) {
      console.error('Failed to load staleness rules:', error);
    }
  },

  saveStalenessRules: async (rules) => {
    try {
      await invoke('save_staleness_rules', { rules });
      set({ stalenessRules: rules });
    } catch (error) {
      console.error('Failed to save staleness rules:', error);
      throw error;
    }
  },

  // Selected stems
  selectedStems: new Set<string>(),

  selectStem: (path) => {
    const newSelection = new Set(get().selectedStems);
    newSelection.add(path);
    set({ selectedStems: newSelection });
  },

  deselectStem: (path) => {
    const newSelection = new Set(get().selectedStems);
    newSelection.delete(path);
    set({ selectedStems: newSelection });
  },

  toggleStemSelection: (path) => {
    const current = get().selectedStems;
    if (current.has(path)) {
      get().deselectStem(path);
    } else {
      get().selectStem(path);
    }
  },

  clearSelection: () => {
    set({ selectedStems: new Set() });
  },

  selectAll: () => {
    const reports = get().scanResult?.reports ?? [];
    const allPaths = new Set(reports.map((r) => r.stem_path));
    set({ selectedStems: allPaths });
  },

  // Duplicates
  duplicates: [],
  isFindingDuplicates: false,

  findDuplicates: async (path) => {
    set({ isFindingDuplicates: true });
    try {
      const duplicates = await invoke<DuplicateEntry[]>('find_duplicate_stems', { rootPath: path });
      set({ duplicates, isFindingDuplicates: false });
    } catch (error) {
      console.error('Failed to find duplicates:', error);
      set({ isFindingDuplicates: false });
    }
  },

  // Single stem provenance
  currentProvenance: null,

  loadProvenance: async (stemPath) => {
    try {
      const provenance = await invoke<StemProvenance | null>('read_stem_provenance', {
        stemPath,
      });
      set({ currentProvenance: provenance });
    } catch (error) {
      console.error('Failed to load provenance:', error);
      set({ currentProvenance: null });
    }
  },

  // Export
  isExporting: false,
  exportError: null,

  exportLibrary: async (path, outputPath, format) => {
    set({ isExporting: true, exportError: null });
    try {
      await invoke<string>('export_library_report', {
        rootPath: path,
        outputPath,
        format,
      });
      set({ isExporting: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ exportError: errorMessage, isExporting: false });
      throw error;
    }
  },

  // User notes
  saveNotes: async (stemPath, notes) => {
    try {
      await invoke('save_user_notes', { stemPath, notes });
    } catch (error) {
      console.error('Failed to save notes:', error);
      throw error;
    }
  },

  // Integrity check
  verifyIntegrity: async (stemPath) => {
    try {
      return await invoke<boolean>('verify_stem_integrity', { stemPath });
    } catch (error) {
      console.error('Failed to verify integrity:', error);
      return false;
    }
  },

  // Orphan management
  orphans: [],

  loadOrphans: async (rootId) => {
    try {
      const entries = await invoke<OrphanedStemEntry[]>('get_library_orphans', { rootId });
      set({ orphans: entries });
    } catch (error) {
      console.error('Failed to load orphans:', error);
    }
  },

  deleteOrphan: async (stemPath) => {
    try {
      await invoke('delete_orphan_stem', { stemPath });
      set((state) => ({
        orphans: state.orphans.filter((o) => o.stem_path !== stemPath),
      }));
    } catch (error) {
      console.error('Failed to delete orphan:', error);
      throw error;
    }
  },

  relinkOrphan: async (stemPath, sourcePath) => {
    try {
      const result = await invoke<RelinkResult>('re_link_orphan', { stemPath, sourcePath });
      if (result.matched) {
        set((state) => ({
          orphans: state.orphans.filter((o) => o.stem_path !== stemPath),
        }));
      }
      return result;
    } catch (error) {
      console.error('Failed to relink orphan:', error);
      throw error;
    }
  },

  ignoreOrphan: async (stemPath) => {
    try {
      await invoke('ignore_orphan_stem', { stemPath });
      set((state) => ({
        orphans: state.orphans.filter((o) => o.stem_path !== stemPath),
      }));
    } catch (error) {
      console.error('Failed to ignore orphan:', error);
      throw error;
    }
  },

  // Reset
  reset: () => {
    set({
      scanResult: null,
      scanResultV2: null,
      libraryIndex: [],
      statusFilter: [],
      searchQuery: '',
      groupBy: 'none',
      isScanning: false,
      scanError: null,
      selectedStems: new Set(),
      duplicates: [],
      isFindingDuplicates: false,
      currentProvenance: null,
      isExporting: false,
      exportError: null,
      orphans: [],
    });
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const selectStaleReports = (state: LibraryState): StalenessReport[] => {
  return state.scanResult?.reports.filter(
    (r) => r.status.status === 'Stale'
  ) ?? [];
};

export const selectCurrentReports = (state: LibraryState): StalenessReport[] => {
  return state.scanResult?.reports.filter(
    (r) => r.status.status === 'Current'
  ) ?? [];
};

export const selectUnknownReports = (state: LibraryState): StalenessReport[] => {
  return state.scanResult?.reports.filter(
    (r) => r.status.status === 'Unknown'
  ) ?? [];
};

export const selectTotalSelected = (state: LibraryState): number => {
  return state.selectedStems.size;
};

export const selectSelectedReports = (state: LibraryState): StalenessReport[] => {
  const selected = state.selectedStems;
  return state.scanResult?.reports.filter((r) => selected.has(r.stem_path)) ?? [];
};

export const selectStaleSelectedCount = (state: LibraryState): number => {
  return selectSelectedReports(state).filter((r) => r.status.status === 'Stale').length;
};

// =============================================================================
// New Selectors (v2)
// =============================================================================

/**
 * Filter library index entries by status filter and search query.
 */
export const selectFilteredEntries = (state: LibraryState): LibraryIndexEntry[] => {
  let entries = state.libraryIndex;

  // Apply status filter
  if (state.statusFilter.length > 0) {
    entries = entries.filter((e) => state.statusFilter.includes(e.status));
  }

  // Apply search query
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.source_path.toLowerCase().includes(q) ||
        e.stem_path?.toLowerCase().includes(q)
    );
  }

  return entries;
};

/**
 * Group filtered entries by the current groupBy setting.
 */
export const selectGroupedEntries = (
  state: LibraryState
): Record<string, LibraryIndexEntry[]> => {
  const entries = selectFilteredEntries(state);

  if (state.groupBy === 'none') {
    return { all: entries };
  }

  const groups: Record<string, LibraryIndexEntry[]> = {};
  for (const entry of entries) {
    let key: string;
    switch (state.groupBy) {
      case 'folder': {
        const parts = entry.source_path.split(/[/\\]/);
        key = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
        break;
      }
      case 'model':
        key = entry.provenance_json
          ? JSON.parse(entry.provenance_json).separation_model ?? 'No Model'
          : 'No Model';
        break;
      case 'status':
        key = entry.status;
        break;
      default:
        key = 'all';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }

  return groups;
};

/**
 * Summary statistics for the current library index.
 */
export const selectSummaryStats = (
  state: LibraryState
): {
  total: number;
  noStem: number;
  current: number;
  outdated: number;
  unknown: number;
  orphaned: number;
  ignored: number;
} => {
  const entries = state.libraryIndex;
  return {
    total: entries.length,
    noStem: entries.filter((e) => e.status === 'NoStem').length,
    current: entries.filter((e) => e.status === 'HasStemCurrent').length,
    outdated: entries.filter((e) => e.status === 'HasStemOutdated').length,
    unknown: entries.filter((e) => e.status === 'HasStemUnknownProvenance').length,
    orphaned: entries.filter((e) => e.status === 'OrphanedStem').length,
    ignored: entries.filter((e) => e.status === 'Ignored').length,
  };
};
