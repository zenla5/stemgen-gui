import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
