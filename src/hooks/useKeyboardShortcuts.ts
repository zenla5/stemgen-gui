import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export function useKeyboardShortcuts() {
  const { setActiveView, toggleSidebar } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Navigation shortcuts
      if (e.key === '1') setActiveView('files');
      if (e.key === '2') setActiveView('queue');
      if (e.key === '3') setActiveView('mixer');
      if (e.key === '4') setActiveView('settings');

      // Toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveView, toggleSidebar]);
}
