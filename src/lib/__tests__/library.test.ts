import { describe, it, expect } from 'vitest';
import {
  isStemCurrent,
  isStemStale,
  isStemUnknown,
  getStalenessReasonDescription,
  formatFileSize,
  formatTimestamp,
  formatDuration,
  formatBitdepth,
  PROVENANCE_SCHEMA_VERSION,
} from '@/lib/types/library';
import type { StalenessStatus, StalenessReason } from '@/lib/types/library';

describe('library types', () => {
  describe('PROVENANCE_SCHEMA_VERSION', () => {
    it('is set to 1', () => {
      expect(PROVENANCE_SCHEMA_VERSION).toBe(1);
    });
  });

  describe('isStemCurrent', () => {
    it('returns true for Current status', () => {
      const status: StalenessStatus = { status: 'Current' };
      expect(isStemCurrent(status)).toBe(true);
    });

    it('returns false for Stale status', () => {
      const status: StalenessStatus = { status: 'Stale', reasons: [] };
      expect(isStemCurrent(status)).toBe(false);
    });

    it('returns false for Unknown status', () => {
      const status: StalenessStatus = { status: 'Unknown', reason: 'no provenance' };
      expect(isStemCurrent(status)).toBe(false);
    });
  });

  describe('isStemStale', () => {
    it('returns true for Stale status', () => {
      const status: StalenessStatus = {
        status: 'Stale',
        reasons: [{ type: 'SourceModified' }],
      };
      expect(isStemStale(status)).toBe(true);
    });

    it('returns false for Current status', () => {
      const status: StalenessStatus = { status: 'Current' };
      expect(isStemStale(status)).toBe(false);
    });
  });

  describe('isStemUnknown', () => {
    it('returns true for Unknown status', () => {
      const status: StalenessStatus = { status: 'Unknown', reason: 'test' };
      expect(isStemUnknown(status)).toBe(true);
    });

    it('returns false for Current status', () => {
      const status: StalenessStatus = { status: 'Current' };
      expect(isStemUnknown(status)).toBe(false);
    });
  });

  describe('getStalenessReasonDescription', () => {
    it('describes SourceModified reason', () => {
      const reason: StalenessReason = { type: 'SourceModified' };
      expect(getStalenessReasonDescription(reason)).toBe('Source file has been modified');
    });

    it('describes NewerModelVersion reason', () => {
      const reason: StalenessReason = {
        type: 'NewerModelVersion',
        current: 'v1',
        available: 'v2',
      };
      expect(getStalenessReasonDescription(reason)).toBe(
        'Newer model version available (v1 → v2)'
      );
    });

    it('describes StemgenGuiOutdated reason', () => {
      const reason: StalenessReason = {
        type: 'StemgenGuiOutdated',
        current: '1.0.0',
        minimum: '1.1.0',
      };
      expect(getStalenessReasonDescription(reason)).toBe(
        'stemgen-gui version outdated (1.0.0 < 1.1.0)'
      );
    });

    it('describes ParametersChanged reason', () => {
      const reason: StalenessReason = { type: 'ParametersChanged' };
      expect(getStalenessReasonDescription(reason)).toBe(
        'Separation parameters differ from current defaults'
      );
    });
  });

  describe('formatFileSize', () => {
    it('formats 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500.0 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(5_000_000)).toBe('4.8 MB');
    });

    it('formats gigabytes', () => {
      expect(formatFileSize(3_500_000_000)).toBe('3.3 GB');
    });
  });

  describe('formatTimestamp', () => {
    it('formats a valid ISO timestamp', () => {
      const result = formatTimestamp('2026-03-28T12:00:00Z');
      // Result depends on locale, but should not be the raw string
      expect(result).not.toBe('2026-03-28T12:00:00Z');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a string for invalid timestamp (no throw)', () => {
      const result = formatTimestamp('not-a-date');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatDuration', () => {
    it('formats seconds only', () => {
      expect(formatDuration(45)).toBe('45s');
      expect(formatDuration(0)).toBe('0s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(94.3)).toBe('1m 34s');
      expect(formatDuration(120)).toBe('2m 0s');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(3665)).toBe('1h 1m');
      expect(formatDuration(7200)).toBe('2h 0m');
    });

    it('handles negative values', () => {
      expect(formatDuration(-1)).toBe('0s');
    });
  });

  describe('formatBitdepth', () => {
    it('formats a valid bit depth', () => {
      expect(formatBitdepth(16)).toBe('16-bit');
      expect(formatBitdepth(24)).toBe('24-bit');
      expect(formatBitdepth(32)).toBe('32-bit');
    });

    it('returns em dash for undefined', () => {
      expect(formatBitdepth(undefined)).toBe('\u2014');
    });
  });
});
