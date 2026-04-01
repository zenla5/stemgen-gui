import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryScanResult, StalenessRules, DuplicateEntry } from '@/lib/types/library';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = vi.mocked(invoke);

// ─── Fixtures ─────────────────────────────────────────────────────────────

const fakeScanResult: LibraryScanResult = {
  total_scanned: 3,
  current_count: 1,
  stale_count: 1,
  unknown_count: 1,
  reports: [
    {
      stem_path: '/music/track1.stem.mp4',
      stem_name: 'track1.stem.mp4',
      source_path: '/music/track1.mp3',
      status: { status: 'Current' },
      reasons: [],
      source_exists: true,
      source_hash_matches: true,
      stem_created_at: '2026-03-01T10:00:00Z',
      separation_model: 'bs_roformer',
      model_version: 'v1.0',
      stemgen_gui_version: '1.1.0',
    },
    {
      stem_path: '/music/track2.stem.mp4',
      stem_name: 'track2.stem.mp4',
      source_path: '/music/track2.mp3',
      status: { status: 'Stale', reasons: [{ type: 'SourceModified' }] },
      reasons: [{ type: 'SourceModified' }],
      source_exists: true,
      source_hash_matches: false,
      stem_created_at: '2026-02-15T08:00:00Z',
      separation_model: 'htdemucs',
      stemgen_gui_version: '1.0.0',
    },
    {
      stem_path: '/music/track3.stem.mp4',
      stem_name: 'track3.stem.mp4',
      status: { status: 'Unknown', reason: 'no provenance' },
      reasons: [],
      source_exists: false,
    },
  ],
  errors: [],
};

const fakeStalenessRules: StalenessRules = {
  check_source_modified: true,
  check_model_outdated: true,
  minimum_stemgen_gui_version: '1.0.0',
  check_parameters_changed: false,
};

const fakeDuplicates: DuplicateEntry[] = [
  {
    source_hash: 'abc123',
    source_path: '/music/track.mp3',
    stems: [
      {
        path: '/music/track_v1.stem.mp4',
        model: 'bs_roformer',
        model_version: 'v1.0',
        created_at: '2026-01-01T00:00:00Z',
        file_size: 5_000_000,
      },
      {
        path: '/music/track_v2.stem.mp4',
        model: 'htdemucs',
        model_version: 'v2.0',
        created_at: '2026-03-01T00:00:00Z',
        file_size: 6_000_000,
      },
    ],
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe('libraryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      libraryPath: null,
      scanResult: null,
      isScanning: false,
      scanError: null,
      stalenessRules: fakeStalenessRules,
      selectedStems: new Set(),
      duplicates: [],
      isFindingDuplicates: false,
      currentProvenance: null,
      isExporting: false,
      exportError: null,
    });
  });

  describe('scanLibrary', () => {
    it('sets scan result on success', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);

      await useLibraryStore.getState().scanLibrary('/music');

      const state = useLibraryStore.getState();
      expect(state.isScanning).toBe(false);
      expect(state.scanError).toBeNull();
      expect(state.scanResult).toEqual(fakeScanResult);
      expect(state.libraryPath).toBe('/music');
      expect(mockInvoke).toHaveBeenCalledWith('scan_library', {
        rootPath: '/music',
        filter: null,
        rules: fakeStalenessRules,
      });
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Path not found'));

      await useLibraryStore.getState().scanLibrary('/bad/path');

      const state = useLibraryStore.getState();
      expect(state.isScanning).toBe(false);
      expect(state.scanError).toBe('Path not found');
      expect(state.scanResult).toBeNull();
    });

    it('passes filter when provided', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);

      const filter = { model: 'bs_roformer', stale_only: true, current_only: false };
      await useLibraryStore.getState().scanLibrary('/music', filter);

      expect(mockInvoke).toHaveBeenCalledWith('scan_library', {
        rootPath: '/music',
        filter,
        rules: fakeStalenessRules,
      });
    });
  });

  describe('stalenessRules', () => {
    it('loads staleness rules from backend', async () => {
      const rules: StalenessRules = {
        check_source_modified: false,
        check_model_outdated: true,
        minimum_stemgen_gui_version: '1.1.0',
        check_parameters_changed: true,
      };
      mockInvoke.mockResolvedValueOnce(rules);

      await useLibraryStore.getState().loadStalenessRules();

      expect(useLibraryStore.getState().stalenessRules).toEqual(rules);
      expect(mockInvoke).toHaveBeenCalledWith('get_staleness_rules');
    });

    it('saves staleness rules to backend', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const newRules: StalenessRules = {
        check_source_modified: false,
        check_model_outdated: false,
        check_parameters_changed: true,
      };
      await useLibraryStore.getState().saveStalenessRules(newRules);

      expect(mockInvoke).toHaveBeenCalledWith('save_staleness_rules', { rules: newRules });
      expect(useLibraryStore.getState().stalenessRules).toEqual(newRules);
    });
  });

  describe('selection management', () => {
    it('selects a stem', () => {
      useLibraryStore.getState().selectStem('/music/track1.stem.mp4');
      expect(useLibraryStore.getState().selectedStems.has('/music/track1.stem.mp4')).toBe(true);
    });

    it('deselects a stem', () => {
      useLibraryStore.getState().selectStem('/music/track1.stem.mp4');
      useLibraryStore.getState().deselectStem('/music/track1.stem.mp4');
      expect(useLibraryStore.getState().selectedStems.has('/music/track1.stem.mp4')).toBe(false);
    });

    it('toggles stem selection', () => {
      useLibraryStore.getState().toggleStemSelection('/music/track1.stem.mp4');
      expect(useLibraryStore.getState().selectedStems.has('/music/track1.stem.mp4')).toBe(true);

      useLibraryStore.getState().toggleStemSelection('/music/track1.stem.mp4');
      expect(useLibraryStore.getState().selectedStems.has('/music/track1.stem.mp4')).toBe(false);
    });

    it('clears selection', () => {
      useLibraryStore.getState().selectStem('/a');
      useLibraryStore.getState().selectStem('/b');
      useLibraryStore.getState().clearSelection();
      expect(useLibraryStore.getState().selectedStems.size).toBe(0);
    });

    it('selectAll selects all reports', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');

      useLibraryStore.getState().selectAll();
      const state = useLibraryStore.getState();
      expect(state.selectedStems.size).toBe(3);
      expect(state.selectedStems.has('/music/track1.stem.mp4')).toBe(true);
      expect(state.selectedStems.has('/music/track2.stem.mp4')).toBe(true);
      expect(state.selectedStems.has('/music/track3.stem.mp4')).toBe(true);
    });
  });

  describe('findDuplicates', () => {
    it('finds duplicates on success', async () => {
      mockInvoke.mockResolvedValueOnce(fakeDuplicates);

      await useLibraryStore.getState().findDuplicates('/music');

      const state = useLibraryStore.getState();
      expect(state.isFindingDuplicates).toBe(false);
      expect(state.duplicates).toEqual(fakeDuplicates);
      expect(mockInvoke).toHaveBeenCalledWith('find_duplicate_stems', { rootPath: '/music' });
    });

    it('handles errors gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('scan failed'));

      await useLibraryStore.getState().findDuplicates('/music');

      expect(useLibraryStore.getState().isFindingDuplicates).toBe(false);
    });
  });

  describe('loadProvenance', () => {
    it('loads provenance for a stem', async () => {
      const provenance = {
        schema_version: 1,
        separation_model: 'bs_roformer',
        stemgen_gui_version: '1.1.0',
        separation_timestamp: '2026-03-28T12:00:00Z',
        source_path: '/music/track.mp3',
        source_content_hash: 'abc123',
        source_duration_secs: 180.0,
        source_sample_rate: 44100,
        job_id: 'job_001',
      };
      mockInvoke.mockResolvedValueOnce(provenance);

      await useLibraryStore.getState().loadProvenance('/music/track.stem.mp4');

      expect(useLibraryStore.getState().currentProvenance).toEqual(provenance);
      expect(mockInvoke).toHaveBeenCalledWith('read_stem_provenance', {
        stemPath: '/music/track.stem.mp4',
      });
    });

    it('sets null when provenance not found', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('not found'));

      await useLibraryStore.getState().loadProvenance('/missing.stem.mp4');

      expect(useLibraryStore.getState().currentProvenance).toBeNull();
    });
  });

  describe('exportLibrary', () => {
    it('exports library report', async () => {
      mockInvoke.mockResolvedValueOnce('/output/report.csv');

      await useLibraryStore.getState().exportLibrary('/music', '/output/report.csv', 'Csv');

      const state = useLibraryStore.getState();
      expect(state.isExporting).toBe(false);
      expect(state.exportError).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('export_library_report', {
        rootPath: '/music',
        outputPath: '/output/report.csv',
        format: 'Csv',
      });
    });

    it('sets error on export failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('export failed'));

      await expect(
        useLibraryStore.getState().exportLibrary('/music', '/out.csv', 'Csv')
      ).rejects.toThrow('export failed');

      const state = useLibraryStore.getState();
      expect(state.isExporting).toBe(false);
      expect(state.exportError).toBe('export failed');
    });
  });

  describe('saveNotes', () => {
    it('saves user notes', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await useLibraryStore.getState().saveNotes('/music/track.stem.mp4', 'my notes');

      expect(mockInvoke).toHaveBeenCalledWith('save_user_notes', {
        stemPath: '/music/track.stem.mp4',
        notes: 'my notes',
      });
    });
  });

  describe('verifyIntegrity', () => {
    it('returns true for valid stem', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await useLibraryStore.getState().verifyIntegrity('/music/track.stem.mp4');

      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('verify_stem_integrity', {
        stemPath: '/music/track.stem.mp4',
      });
    });

    it('returns false on error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('failed'));

      const result = await useLibraryStore.getState().verifyIntegrity('/bad.stem.mp4');

      expect(result).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');
      useLibraryStore.getState().selectStem('/music/track1.stem.mp4');

      useLibraryStore.getState().reset();

      const state = useLibraryStore.getState();
      expect(state.scanResult).toBeNull();
      expect(state.selectedStems.size).toBe(0);
      expect(state.duplicates).toEqual([]);
      expect(state.currentProvenance).toBeNull();
      expect(state.isExporting).toBe(false);
      expect(state.exportError).toBeNull();
    });
  });
});
