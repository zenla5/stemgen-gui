import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

describe('useNetworkStatus', () => {
  afterEach(() => {
    window.ononline = null;
    window.onoffline = null;
    vi.unstubAllGlobals();
  });

  it('returns true when navigator reports online', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
  });

  it('returns false when navigator reports offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);
  });

  it('sets online when the window offline event fires', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
