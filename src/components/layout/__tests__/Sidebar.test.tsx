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
    expect(screen.getByText('nav.files')).toBeInTheDocument();
  });

  it('renders Queue navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('nav.queue')).toBeInTheDocument();
  });

  it('renders Mixer navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('nav.mixer')).toBeInTheDocument();
  });

  it('renders Settings navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('nav.settings')).toBeInTheDocument();
  });

  it('renders Library navigation button', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('nav.library')).toBeInTheDocument();
  });

  it('hides navigation labels when collapsed', () => {
    render(<Sidebar collapsed={true} />);
    expect(screen.queryByText('nav.files')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.queue')).not.toBeInTheDocument();
  });

  it('shows keyboard hint when not collapsed', () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText('nav.shortcutHint')).toBeInTheDocument();
  });

  it('calls setActiveView when Files button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('nav.files').click();
    expect(useAppStore.getState().activeView).toBe('files');
  });

  it('calls setActiveView when Queue button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('nav.queue').click();
    expect(useAppStore.getState().activeView).toBe('queue');
  });

  it('calls setActiveView when Mixer button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('nav.mixer').click();
    expect(useAppStore.getState().activeView).toBe('mixer');
  });

  it('calls setActiveView when Settings button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('nav.settings').click();
    expect(useAppStore.getState().activeView).toBe('settings');
  });

  it('calls setActiveView when Library button is clicked', () => {
    render(<Sidebar collapsed={false} />);
    screen.getByText('nav.library').click();
    expect(useAppStore.getState().activeView).toBe('library');
  });

  it('resolves the mobile drawer below the header and above the backdrop', () => {
    useAppStore.setState({ mobileSidebarOpen: true });
    render(<Sidebar collapsed={false} />);
    // The off-canvas drawer mounts beneath the fixed header (top-14) so nav items
    // are not hidden behind it, and sits above the backdrop (z-30).
    const drawerAsides = screen.getAllByRole('complementary');
    const mobileDrawer = drawerAsides.find((el) => el.className.includes('fixed'));
    expect(mobileDrawer).toBeTruthy();
    expect(mobileDrawer).toHaveClass('top-14');
    expect(mobileDrawer).toHaveClass('z-40');
    const backdrop = screen.getByTestId('sidebar-backdrop');
    expect(backdrop).toBeTruthy();
  });
});