import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

describe('useNetworkStatus', () => {
  afterEach(() => {
    window.ononline = null;
    window.onoffline = null;
  });

  it('returns true when navigator reports online', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { result } = renderHook(() => useNetworkStatus());
    vi.unstubAllGlobals();
    expect(result.current).toBe(true);
  });

  it('returns false when navigator reports offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { result } = renderHook(() => useNetworkStatus());
    vi.unstubAllGlobals();
    expect(result.current).toBe(false);
  });
});