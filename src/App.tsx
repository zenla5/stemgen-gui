import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    
    // Handle system theme detection
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(prefersDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <ErrorBoundary>
      <AppShell />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        theme={theme === 'dark' ? 'dark' : 'light'}
      />
    </ErrorBoundary>
  );
}

export default App;
