import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export function useKeyboardShortcuts() {
  const { setActiveView, toggleSidebar } = useAppStore();

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

      // Navigation shortcuts (1-4)
      if (e.key === '1') {
        e.preventDefault();
        setActiveView('files');
      }
      if (e.key === '2') {
        e.preventDefault();
        setActiveView('queue');
      }
      if (e.key === '3') {
        e.preventDefault();
        setActiveView('mixer');
      }
      if (e.key === '4') {
        e.preventDefault();
        setActiveView('settings');
      }

      // Toggle sidebar (Ctrl+B)
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveView, toggleSidebar]);
}
