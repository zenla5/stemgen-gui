import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';

export function useKeyboardShortcuts() {
  const { setActiveView, toggleSidebar, clearFiles, audioFiles, addJob, settings } = useAppStore();
  const { setTheme, theme } = useSettingsStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isAlt = e.altKey;
      const isShift = e.shiftKey;
      
      // File operations
      if (isCtrl && !isAlt && e.key === 'o') {
        e.preventDefault();
        setActiveView('files');
      }
      
      // Toggle sidebar
      if (isCtrl && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      
      // Toggle theme
      if (isCtrl && e.key === 't') {
        e.preventDefault();
        const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex]);
      }
      
      // View shortcuts
      if (e.key === '1' && !isCtrl && !isAlt) {
        e.preventDefault();
        setActiveView('files');
      }
      if (e.key === '2' && !isCtrl && !isAlt) {
        e.preventDefault();
        setActiveView('queue');
      }
      if (e.key === '3' && !isCtrl && !isAlt) {
        e.preventDefault();
        setActiveView('mixer');
      }
      if (e.key === '4' && !isCtrl && !isAlt) {
        e.preventDefault();
        setActiveView('settings');
      }
      
      // Escape to cancel/deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        clearFiles();
      }
      
      // Ctrl+Delete to clear all files
      if (isCtrl && e.key === 'Delete') {
        e.preventDefault();
        clearFiles();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme, setTheme, setActiveView, toggleSidebar, clearFiles, audioFiles, addJob, settings]);
}
