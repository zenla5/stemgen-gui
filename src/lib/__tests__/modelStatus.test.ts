import { describe, it, expect } from 'vitest';
import { formatInstalledVersion } from '../modelStatus';

describe('formatInstalledVersion', () => {
  it('joins revision and date with a middle dot', () => {
    expect(formatInstalledVersion('cbc8a9b1', '2026-09-02')).toBe('rev cbc8a9b1 · 2026-09-02');
  });

  it('returns only the revision when date is missing', () => {
    expect(formatInstalledVersion('cbc8a9b1', undefined)).toBe('rev cbc8a9b1');
  });

  it('returns only the date when revision is missing', () => {
    expect(formatInstalledVersion(undefined, '2026-09-02')).toBe('2026-09-02');
  });

  it('returns undefined when both are missing', () => {
    expect(formatInstalledVersion(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined when both are empty', () => {
    expect(formatInstalledVersion('', '')).toBeUndefined();
  });
});
