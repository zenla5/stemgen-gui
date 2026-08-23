import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/Header';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

function resetStores() {
  useAppStore.setState({ sidebarCollapsed: false });
  useSettingsStore.setState({ theme: 'system' });
}

describe('Header', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('renders Stemgen-GUI title', () => {
    render(<Header />);
    expect(screen.getByText('Stemgen-GUI')).toBeInTheDocument();
  });

  it('renders app version number', () => {
    render(<Header />);
    expect(screen.getByText(/v[\d.]+/)).toBeInTheDocument();
  });

  it('renders GitHub link with correct href', () => {
    render(<Header />);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://github.com/zenla5/stemgen-gui');
  });

  it('renders theme toggle buttons', () => {
    render(<Header />);
    const buttons = screen.getAllByRole('button');
    // Should have at least 3 theme buttons (light, dark, system)
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the header above the mobile drawer backdrop', () => {
    render(<Header />);
    const header = screen.getByText('Stemgen-GUI').closest('header');
    expect(header).toBeTruthy();
    expect(header).toHaveClass('relative');
    expect(header).toHaveClass('z-50');
  });

  it.each(['light', 'dark', 'system'] as const)(
    'renders without error when theme is %s',
    (theme) => {
      useSettingsStore.setState({ theme });
      const { container } = render(<Header />);
      expect(container).toBeDefined();
    }
  );

  it('calls setTheme on theme button clicks', () => {
    const setThemeSpy = vi.fn();
    useSettingsStore.setState({ setTheme: setThemeSpy });
    render(<Header />);
    // Last three buttons are light/dark/system (after the mobile-menu and github buttons)
    const buttons = screen.getAllByRole('button');
    const themeButtons = buttons.slice(-3);

    fireEvent.click(themeButtons[0]);
    expect(setThemeSpy).toHaveBeenCalledWith('light');
    fireEvent.click(themeButtons[1]);
    expect(setThemeSpy).toHaveBeenCalledWith('dark');
    fireEvent.click(themeButtons[2]);
    expect(setThemeSpy).toHaveBeenCalledWith('system');
  });
});
