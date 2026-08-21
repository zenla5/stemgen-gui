import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAppStore } from '@/stores/appStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const togglePlay = vi.fn();
const seek = vi.fn();
const loadedPlayer = {
  state: { currentTime: 30, duration: 100, isPlaying: false },
  togglePlay,
  seek,
  isLoaded: true,
};

vi.mock('@/hooks/playerContext', () => ({
  usePlayerContext: () => loadedPlayer,
}));

function resetStore() {
  useAppStore.setState({
    sidebarCollapsed: false,
    activeView: 'files',
  });
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Remove any lingering listeners
    window.onkeydown = null;
  });

  const press = (init?: ConstructorParameters<typeof KeyboardEvent>[1]) => {
    window.dispatchEvent(new KeyboardEvent('keydown', init));
  };

  it('sets activeView to files when 1 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

    expect(useAppStore.getState().activeView).toBe('files');
  });

  it('sets activeView to queue when 2 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));

    expect(useAppStore.getState().activeView).toBe('queue');
  });

  it('sets activeView to mixer when 3 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));

    expect(useAppStore.getState().activeView).toBe('mixer');
  });

  it('sets activeView to library when 4 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));

    expect(useAppStore.getState().activeView).toBe('library');
  });

  it('sets activeView to settings when 5 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }));

    expect(useAppStore.getState().activeView).toBe('settings');
  });

  it('toggles sidebar when Ctrl+B is pressed', () => {
    renderHook(() => useKeyboardShortcuts());

    expect(useAppStore.getState().sidebarCollapsed).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('ignores shortcuts when typing in INPUT elements', () => {
    renderHook(() => useKeyboardShortcuts());

    // Start from a non-default view so "ignored" is distinguishable from "never fired"
    useAppStore.setState({ activeView: 'settings' });

    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(useAppStore.getState().activeView).toBe('settings');

    document.body.removeChild(input);
  });

  it('ignores shortcuts when typing in TEXTAREA elements', () => {
    renderHook(() => useKeyboardShortcuts());

    useAppStore.setState({ activeView: 'settings' });

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(useAppStore.getState().activeView).toBe('settings');

    document.body.removeChild(textarea);
  });

  describe('playback shortcuts when player is loaded', () => {
    beforeEach(() => {
      loadedPlayer.state.currentTime = 30;
      renderHook(() => useKeyboardShortcuts());
    });

    it('toggles play/pause on Space', () => {
      press({ code: 'Space' });
      expect(togglePlay).toHaveBeenCalled();
    });

    it('seeks backward 5 seconds on ArrowLeft with clamping at zero', () => {
      press({ code: 'ArrowLeft' });
      expect(seek).toHaveBeenCalledWith(25);

      loadedPlayer.state.currentTime = 3;
      press({ code: 'ArrowLeft' });
      expect(seek).toHaveBeenCalledWith(0);
    });

    it('seeks forward 5 seconds on ArrowRight with clamping at duration', () => {
      press({ code: 'ArrowRight' });
      expect(seek).toHaveBeenCalledWith(35);

      loadedPlayer.state.currentTime = 98;
      press({ code: 'ArrowRight' });
      expect(seek).toHaveBeenCalledWith(100);
    });

    it('seeks to the beginning on Home', () => {
      press({ code: 'Home' });
      expect(seek).toHaveBeenCalledWith(0);
    });

    it('seeks to the end on End', () => {
      press({ code: 'End' });
      expect(seek).toHaveBeenCalledWith(100);
    });
  });
});
