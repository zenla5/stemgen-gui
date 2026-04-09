import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useLibraryStore,
  selectStaleReports,
  selectCurrentReports,
  selectUnknownReports,
  selectTotalSelected,
  selectSelectedReports,
  selectStaleSelectedCount,
  selectFilteredEntries,
  selectGroupedEntries,
  selectSummaryStats,
} from '@/stores/libraryStore';
import type { LibraryScanResult, StalenessRules, DuplicateEntry, LibraryScanResultV2, LibraryIndexEntry } from '@/lib/types/library';

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
  flag_unknown_provenance: false,
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
      libraryRoots: [],
      scanResult: null,
      scanResultV2: null,
      libraryIndex: [],
      statusFilter: [],
      searchQuery: '',
      groupBy: 'none',
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
        flag_unknown_provenance: false,
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
        flag_unknown_provenance: false,
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

  describe('setLibraryPath', () => {
    it('sets library path directly', () => {
      useLibraryStore.getState().setLibraryPath('/my/music');
      expect(useLibraryStore.getState().libraryPath).toBe('/my/music');
    });

    it('clears library path with null', () => {
      useLibraryStore.getState().setLibraryPath('/my/music');
      useLibraryStore.getState().setLibraryPath(null);
      expect(useLibraryStore.getState().libraryPath).toBeNull();
    });
  });

  describe('loadStalenessRules error path', () => {
    it('logs error and keeps default rules on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockInvoke.mockRejectedValueOnce(new Error('DB error'));

      await useLibraryStore.getState().loadStalenessRules();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load staleness rules:', expect.any(Error));
      // Rules remain at defaults
      expect(useLibraryStore.getState().stalenessRules).toEqual(fakeStalenessRules);
      consoleSpy.mockRestore();
    });
  });

  describe('saveStalenessRules error path', () => {
    it('throws error on save failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Permission denied'));

      const newRules: StalenessRules = {
        check_source_modified: false,
        check_model_outdated: false,
        check_parameters_changed: false,
        flag_unknown_provenance: false,
      };

      await expect(
        useLibraryStore.getState().saveStalenessRules(newRules)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('selectAll with no scan result', () => {
    it('selects nothing when scanResult is null', () => {
      useLibraryStore.getState().selectAll();
      expect(useLibraryStore.getState().selectedStems.size).toBe(0);
    });
  });

  describe('loadProvenance with null result', () => {
    it('sets provenance to null when invoke returns null', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      await useLibraryStore.getState().loadProvenance('/no-prov.stem.mp4');

      expect(useLibraryStore.getState().currentProvenance).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('read_stem_provenance', {
        stemPath: '/no-prov.stem.mp4',
      });
    });
  });

  describe('saveNotes error path', () => {
    it('throws on save failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Disk full'));

      await expect(
        useLibraryStore.getState().saveNotes('/track.stem.mp4', 'notes')
      ).rejects.toThrow('Disk full');
    });
  });

  describe('selectors', () => {
    it('selectStaleReports returns only stale reports', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');

      const stale = selectStaleReports(useLibraryStore.getState());
      expect(stale).toHaveLength(1);
      expect(stale[0].stem_path).toBe('/music/track2.stem.mp4');
    });

    it('selectCurrentReports returns only current reports', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');

      const current = selectCurrentReports(useLibraryStore.getState());
      expect(current).toHaveLength(1);
      expect(current[0].stem_path).toBe('/music/track1.stem.mp4');
    });

    it('selectUnknownReports returns only unknown reports', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');

      const unknown = selectUnknownReports(useLibraryStore.getState());
      expect(unknown).toHaveLength(1);
      expect(unknown[0].stem_path).toBe('/music/track3.stem.mp4');
    });

    it('selectors return empty arrays when no scan result', () => {
      expect(selectStaleReports(useLibraryStore.getState())).toEqual([]);
      expect(selectCurrentReports(useLibraryStore.getState())).toEqual([]);
      expect(selectUnknownReports(useLibraryStore.getState())).toEqual([]);
    });

    it('selectTotalSelected returns count of selected stems', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');
      useLibraryStore.getState().selectStem('/music/track1.stem.mp4');
      useLibraryStore.getState().selectStem('/music/track2.stem.mp4');

      expect(selectTotalSelected(useLibraryStore.getState())).toBe(2);
    });

    it('selectSelectedReports returns reports matching selected paths', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');
      useLibraryStore.getState().selectStem('/music/track2.stem.mp4');

      const selected = selectSelectedReports(useLibraryStore.getState());
      expect(selected).toHaveLength(1);
      expect(selected[0].stem_path).toBe('/music/track2.stem.mp4');
    });

    it('selectStaleSelectedCount counts only stale selected reports', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');
      useLibraryStore.getState().selectStem('/music/track1.stem.mp4'); // Current
      useLibraryStore.getState().selectStem('/music/track2.stem.mp4'); // Stale
      useLibraryStore.getState().selectStem('/music/track3.stem.mp4'); // Unknown

      expect(selectStaleSelectedCount(useLibraryStore.getState())).toBe(1);
    });

    it('selectStaleSelectedCount returns 0 when no selection', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResult);
      await useLibraryStore.getState().scanLibrary('/music');

      expect(selectStaleSelectedCount(useLibraryStore.getState())).toBe(0);
    });
  });

  // ─── New v2 Tests ────────────────────────────────────────────────────────

  const fakeLibraryIndex: LibraryIndexEntry[] = [
    {
      id: 'idx_1',
      root_id: 'root_1',
      source_path: '/music/track1.mp3',
      status: 'HasStemCurrent',
      ignored: false,
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'idx_2',
      root_id: 'root_1',
      source_path: '/music/track2.mp3',
      status: 'NoStem',
      ignored: false,
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'idx_3',
      root_id: 'root_1',
      source_path: '/music/subdir/track3.mp3',
      status: 'HasStemOutdated',
      ignored: false,
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'idx_4',
      root_id: 'root_1',
      source_path: '/music/orphan.stem.mp4',
      status: 'OrphanedStem',
      ignored: false,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const fakeScanResultV2: LibraryScanResultV2 = {
    root_id: 'root_1',
    total_sources: 4,
    no_stem_count: 1,
    has_stem_current_count: 1,
    has_stem_outdated_count: 1,
    has_stem_unknown_provenance_count: 0,
    orphaned_stem_count: 1,
    ignored_count: 0,
    entries: fakeLibraryIndex,
  };

  describe('libraryRoots', () => {
    it('loads library roots from backend', async () => {
      const fakeRoots = [
        { id: 'r1', path: '/music', output_strategy: 'alongside', scan_policy: 'manual', created_at: '2026-01-01' },
      ];
      mockInvoke.mockResolvedValueOnce(fakeRoots);

      await useLibraryStore.getState().loadLibraryRoots();

      expect(useLibraryStore.getState().libraryRoots).toHaveLength(1);
      expect(useLibraryStore.getState().libraryRoots[0].path).toBe('/music');
    });

    it('adds a library root', async () => {
      mockInvoke.mockResolvedValueOnce('new_root_id');
      mockInvoke.mockResolvedValueOnce([{ id: 'new_root_id', path: '/new', output_strategy: 'alongside', scan_policy: 'manual', created_at: '2026-01-01' }]);

      const id = await useLibraryStore.getState().addLibraryRoot('/new', 'alongside');

      expect(id).toBe('new_root_id');
      expect(useLibraryStore.getState().libraryRoots).toHaveLength(1);
    });
  });

  describe('scanLibraryRoot', () => {
    it('calls scan_library_root and updates state', async () => {
      mockInvoke.mockResolvedValueOnce(fakeScanResultV2);

      await useLibraryStore.getState().scanLibraryRoot('root_1', true);

      expect(mockInvoke).toHaveBeenCalledWith('scan_library_root', { rootId: 'root_1', fullRescan: true });
      expect(useLibraryStore.getState().scanResultV2).toEqual(fakeScanResultV2);
      expect(useLibraryStore.getState().libraryIndex).toHaveLength(4);
      expect(useLibraryStore.getState().isScanning).toBe(false);
    });

    it('handles scan error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Root not found'));

      await useLibraryStore.getState().scanLibraryRoot('bad_root');

      expect(useLibraryStore.getState().scanError).toBe('Root not found');
      expect(useLibraryStore.getState().isScanning).toBe(false);
    });
  });

  describe('selectFilteredEntries', () => {
    beforeEach(async () => {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValueOnce(fakeScanResultV2);
      await useLibraryStore.getState().scanLibraryRoot('root_1');
    });

    it('returns all entries when no filter is set', () => {
      const entries = selectFilteredEntries(useLibraryStore.getState());
      expect(entries).toHaveLength(4);
    });

    it('filters by status', () => {
      useLibraryStore.getState().setStatusFilter(['NoStem']);
      const entries = selectFilteredEntries(useLibraryStore.getState());
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('NoStem');
    });

    it('filters by search query', () => {
      useLibraryStore.getState().setSearchQuery('subdir');
      const entries = selectFilteredEntries(useLibraryStore.getState());
      expect(entries).toHaveLength(1);
      expect(entries[0].source_path).toContain('subdir');
    });

    it('combines status filter and search query', () => {
      useLibraryStore.getState().setStatusFilter(['HasStemCurrent', 'HasStemOutdated']);
      useLibraryStore.getState().setSearchQuery('track1');
      const entries = selectFilteredEntries(useLibraryStore.getState());
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('idx_1');
    });
  });

  describe('selectGroupedEntries', () => {
    beforeEach(async () => {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValueOnce(fakeScanResultV2);
      await useLibraryStore.getState().scanLibraryRoot('root_1');
    });

    it('groups by status', () => {
      useLibraryStore.getState().setGroupBy('status');
      const groups = selectGroupedEntries(useLibraryStore.getState());
      expect(groups['HasStemCurrent']).toHaveLength(1);
      expect(groups['NoStem']).toHaveLength(1);
      expect(groups['HasStemOutdated']).toHaveLength(1);
      expect(groups['OrphanedStem']).toHaveLength(1);
    });

    it('returns all entries under "all" when groupBy is none', () => {
      useLibraryStore.getState().setGroupBy('none');
      const groups = selectGroupedEntries(useLibraryStore.getState());
      expect(groups['all']).toHaveLength(4);
    });
  });

  describe('selectSummaryStats', () => {
    beforeEach(async () => {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValueOnce(fakeScanResultV2);
      await useLibraryStore.getState().scanLibraryRoot('root_1');
    });

    it('returns correct counts', () => {
      const stats = selectSummaryStats(useLibraryStore.getState());
      expect(stats.total).toBe(4);
      expect(stats.noStem).toBe(1);
      expect(stats.current).toBe(1);
      expect(stats.outdated).toBe(1);
      expect(stats.orphaned).toBe(1);
      expect(stats.unknown).toBe(0);
      expect(stats.ignored).toBe(0);
    });
  });

  describe('reset clears v2 state', () => {
    it('resets all v2 state', async () => {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValueOnce(fakeScanResultV2);
      await useLibraryStore.getState().scanLibraryRoot('root_1');
      useLibraryStore.getState().setStatusFilter(['NoStem']);
      useLibraryStore.getState().setSearchQuery('test');

      useLibraryStore.getState().reset();

      expect(useLibraryStore.getState().scanResultV2).toBeNull();
      expect(useLibraryStore.getState().libraryIndex).toHaveLength(0);
      expect(useLibraryStore.getState().statusFilter).toHaveLength(0);
      expect(useLibraryStore.getState().searchQuery).toBe('');
    });
  });
});
