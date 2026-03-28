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
} from '@/lib/types/library';

// =============================================================================
// Store State Interface
// =============================================================================

interface LibraryState {
  // Library path
  libraryPath: string | null;
  setLibraryPath: (path: string | null) => void;

  // Scan results
  scanResult: LibraryScanResult | null;
  isScanning: boolean;
  scanError: string | null;
  scanLibrary: (path: string, filter?: LibraryScanFilter) => Promise<void>;

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
};

const defaultScanResult: LibraryScanResult = {
  total_scanned: 0,
  current_count: 0,
  stale_count: 0,
  unknown_count: 0,
  reports: [],
  errors: [],
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useLibraryStore = create<LibraryState>((set, get) => ({
  // Library path
  libraryPath: null,
  setLibraryPath: (path) => set({ libraryPath: path }),

  // Scan results
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

  // Reset
  reset: () => {
    set({
      scanResult: null,
      isScanning: false,
      scanError: null,
      selectedStems: new Set(),
      duplicates: [],
      isFindingDuplicates: false,
      currentProvenance: null,
      isExporting: false,
      exportError: null,
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
