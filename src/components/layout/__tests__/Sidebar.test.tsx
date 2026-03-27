import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAppStore } from '@/stores/appStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

function resetStore() {
  useAppStore.setState({ activeView: 'files' });
}

describe('Sidebar', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders Files navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('renders Queue navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('Queue')).toBeInTheDocument();
  });

  it('renders Mixer navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('Mixer')).toBeInTheDocument();
  });

  it('renders Settings navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides navigation labels when collapsed', () => {
    render(<Sidebar collapsed={true} />);
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();
  });

  it('shows keyboard hint when not collapsed', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText(/press 1-4 to navigate/i)).toBeInTheDocument();
  });

  it('calls setActiveView when Files button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('Files').click();
    expect(useAppStore.getState().activeView).toBe('files');
  });

  it('calls setActiveView when Queue button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('Queue').click();
    expect(useAppStore.getState().activeView).toBe('queue');
  });

  it('calls setActiveView when Mixer button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('Mixer').click();
    expect(useAppStore.getState().activeView).toBe('mixer');
  });

  it('calls setActiveView when Settings button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('Settings').click();
    expect(useAppStore.getState().activeView).toBe('settings');
  });
});
