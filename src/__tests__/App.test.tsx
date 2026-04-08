import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ReactElement } from 'react';

// Track event listeners registered via mock
const mockListeners: Record<string, (event: { payload: unknown }) => void> = {};

// Mock @tauri-apps/api/event BEFORE importing App
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    mockListeners[event] = handler;
    return Promise.resolve(() => {
      delete mockListeners[event];
    });
  }),
}));

// Mock all dependencies BEFORE importing App
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    theme: 'system',
    hasSeenFirstRun: true,
    completeFirstRun: vi.fn(),
  })),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: vi.fn(() => ({
    checkDependencies: vi.fn(),
  })),
}));

vi.mock('@/hooks/useHealthCheck', () => ({
  useHealthCheck: vi.fn(),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: vi.fn(() => <div data-testid="app-shell">AppShell</div>),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: vi.fn(({ children }: { children: ReactElement }) => children),
}));

vi.mock('@/components/setup/FirstRunWizard', () => ({
  FirstRunWizard: vi.fn(() => <div data-testid="first-run-wizard">First Run Wizard</div>),
}));

// Mock matchMedia for theme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Import App AFTER all mocks are set up
import App from '@/App';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset theme class
    document.documentElement.classList.remove('light', 'dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('light', 'dark');
  });

  describe('first-run wizard', () => {
    it('shows first-run wizard when hasSeenFirstRun is false', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: false,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      expect(screen.getByTestId('first-run-wizard')).toBeInTheDocument();
    });

    it('shows main app when hasSeenFirstRun is true', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    });

    it('calls completeFirstRun when wizard is skipped', async () => {
      const mockCompleteFirstRun = vi.fn();
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: false,
        completeFirstRun: mockCompleteFirstRun,
      });

      const { FirstRunWizard } = await import('@/components/setup/FirstRunWizard');
      vi.mocked(FirstRunWizard).mockImplementationOnce(
        ({ onSkip }: { onSkip?: () => void }) => {
          // Only call onSkip when it exists
          if (onSkip) onSkip();
          return <div data-testid="first-run-wizard">First Run Wizard</div>;
        }
      );

      render(<App />);

      expect(mockCompleteFirstRun).toHaveBeenCalledTimes(1);
    });
  });

  describe('theme application', () => {
    it('applies light theme class when theme is light', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'light',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('light')).toBe(true);
      });
    });

    it('applies dark theme class when theme is dark', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'dark',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
    });

    it('applies dark theme when system prefers dark and theme is system', async () => {
      // Override matchMedia for this test
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
    });

    it('applies light theme when system prefers light and theme is system', async () => {
      // Override matchMedia for this test
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false, // Always return false (light mode)
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('light')).toBe(true);
      });
    });

    it('removes previous theme class before applying new one', async () => {
      // Start with dark class
      document.documentElement.classList.add('dark');

      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'light',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });
    });
  });

  describe('dependency checking', () => {
    it('calls checkDependencies on mount', async () => {
      const mockCheckDependencies = vi.fn();
      const { useAppStore } = await import('@/stores/appStore');
      vi.mocked(useAppStore).mockReturnValueOnce({
        checkDependencies: mockCheckDependencies,
      });

      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(mockCheckDependencies).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('hooks initialization', () => {
    it('initializes useHealthCheck hook', async () => {
      const { useHealthCheck } = await import('@/hooks/useHealthCheck');
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      expect(useHealthCheck).toHaveBeenCalled();
    });

    it('initializes useKeyboardShortcuts hook', async () => {
      const { useKeyboardShortcuts } = await import('@/hooks/useKeyboardShortcuts');
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      expect(useKeyboardShortcuts).toHaveBeenCalled();
    });
  });

  describe('Toaster integration', () => {
    it('renders Toaster component', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'dark',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      // Toaster section should be in the document (checking for notification area)
      await waitFor(() => {
        const section = document.querySelector('section[aria-live="polite"]');
        expect(section).toBeInTheDocument();
      });
    });
  });

  describe('ErrorBoundary integration', () => {
    it('wraps AppShell in ErrorBoundary', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      const { ErrorBoundary } = await import('@/components/ErrorBoundary');

      render(<App />);

      // ErrorBoundary should wrap the children
      expect(ErrorBoundary).toHaveBeenCalled();
    });
  });

  describe('sidecar-deploy-error event handling', () => {
    it('registers a listener for sidecar-deploy-error on mount', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(mockListeners['sidecar-deploy-error']).toBeDefined();
      });
    });

    it('displays error banner when sidecar-deploy-error event is received', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      // Wait for the listener to be registered
      await waitFor(() => {
        expect(mockListeners['sidecar-deploy-error']).toBeDefined();
      });

      // Simulate the event
      mockListeners['sidecar-deploy-error']({
        payload: { error: 'Sidecar script not found in /some/path. Please reinstall.' },
      });

      await waitFor(() => {
        const banner = screen.getByTestId('sidecar-error-banner');
        expect(banner).toBeInTheDocument();
        expect(banner).toHaveTextContent('Sidecar script not found');
      });
    });

    it('does not show error banner when no error has been received', async () => {
      const { useSettingsStore } = await import('@/stores/settingsStore');
      vi.mocked(useSettingsStore).mockReturnValueOnce({
        theme: 'system',
        hasSeenFirstRun: true,
        completeFirstRun: vi.fn(),
      });

      render(<App />);

      // Banner should not be in the DOM without an event
      expect(screen.queryByTestId('sidecar-error-banner')).not.toBeInTheDocument();
    });
  });
});
