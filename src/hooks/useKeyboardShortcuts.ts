import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { usePlayerContext } from './playerContext';

export function useKeyboardShortcuts() {
  const { setActiveView, toggleSidebar } = useAppStore();
  const playerContext = usePlayerContext();
  
  // Use refs to avoid re-creating the handler
  const playerContextRef = useRef(playerContext);
  playerContextRef.current = playerContext;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in form elements
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.tagName === 'SELECT' ||
                      target.isContentEditable;
      
      if (isInput) {
        return;
      }

      // Playback shortcuts (only when player is loaded)
      const ctx = playerContextRef.current;
      if (ctx?.isLoaded && ctx.state) {
        // Spacebar - Toggle play/pause
        if (e.code === 'Space') {
          e.preventDefault();
          ctx.togglePlay?.();
          return;
        }

        // Arrow Left - Seek backward 5 seconds
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          const newTime = Math.max(0, ctx.state.currentTime - 5);
          ctx.seek?.(newTime);
          return;
        }

        // Arrow Right - Seek forward 5 seconds
        if (e.code === 'ArrowRight') {
          e.preventDefault();
          const newTime = Math.min(ctx.state.duration, ctx.state.currentTime + 5);
          ctx.seek?.(newTime);
          return;
        }

        // Home - Seek to beginning
        if (e.code === 'Home') {
          e.preventDefault();
          ctx.seek?.(0);
          return;
        }

        // End - Seek to end
        if (e.code === 'End') {
          e.preventDefault();
          ctx.seek?.(ctx.state.duration);
          return;
        }
      }

      // Navigation shortcuts (1-4)
      if (e.key === '1') {
        e.preventDefault();
        setActiveView('files');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setActiveView('queue');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setActiveView('mixer');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        setActiveView('settings');
        return;
      }

      // Toggle sidebar (Ctrl+B or Cmd+B on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveView, toggleSidebar]);
}
