import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Toaster } from 'sonner';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FirstRunWizard } from './components/setup/FirstRunWizard';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const { theme, hasSeenFirstRun, completeFirstRun } = useSettingsStore();
  const { checkDependencies } = useAppStore();
  const [sidecarError, setSidecarError] = useState<string | null>(null);

  // Health check hook
  useHealthCheck();

  // Keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize app
  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  // Listen for sidecar deployment errors
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ error?: string }>('sidecar-deploy-error', (event) => {
      if (event.payload?.error) {
        setSidecarError(event.payload.error);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

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

  // Show first-run wizard on first launch
  if (!hasSeenFirstRun) {
    return (
      <FirstRunWizard
        onComplete={completeFirstRun}
        onSkip={completeFirstRun}
      />
    );
  }

  return (
    <ErrorBoundary>
      {sidecarError && (
        <div
          data-testid="sidecar-error-banner"
          className="fixed top-0 left-0 right-0 z-50 bg-destructive px-4 py-3 text-center text-sm text-destructive-foreground"
        >
          {sidecarError}
        </div>
      )}
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
