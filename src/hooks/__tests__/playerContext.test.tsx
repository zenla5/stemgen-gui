import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PlayerProvider, usePlayerContext } from '@/hooks/playerContext';
import type { PlayerContextType } from '@/hooks/playerContext';

describe('PlayerContext', () => {
  it('provides value from PlayerProvider', () => {
    const fakeValue: PlayerContextType = {
      state: null,
      togglePlay: null,
      seek: null,
      isLoaded: false,
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlayerProvider value={fakeValue}>{children}</PlayerProvider>
    );

    const { result } = renderHook(() => usePlayerContext(), { wrapper });

    expect(result.current).toMatchObject({
      isLoaded: false,
    });
  });

  it('usePlayerContext returns undefined outside provider', () => {
    const { result } = renderHook(() => usePlayerContext());

    expect(result.current).toBeUndefined();
  });
});
