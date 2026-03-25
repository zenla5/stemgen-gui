import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { AppShell } from './components/layout/AppShell';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const { theme } = useSettingsStore();
  const { checkDependencies } = useAppStore();

  // Health check hook
  useHealthCheck();

  // Keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize app
  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <>
      <AppShell />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        theme={theme === 'dark' ? 'dark' : 'light'}
      />
    </>
  );
}

export default App;
