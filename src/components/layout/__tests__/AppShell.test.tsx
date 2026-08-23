import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/stores/appStore';
import type { ProcessingJob } from '@/lib/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/components/layout/Header', () => ({
  Header: () => <div data-testid="header" />,
}));
vi.mock('@/components/layout/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));
vi.mock('@/components/file-browser/FileBrowser', () => ({
  FileBrowser: () => <div data-testid="files" />,
}));
vi.mock('@/components/processing/ProcessingQueue', () => ({
  ProcessingQueue: () => <div data-testid="queue" />,
}));
vi.mock('@/components/mixer/StemMixer', () => ({
  StemMixer: () => <div data-testid="mixer" />,
}));
vi.mock('@/components/settings/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings" />,
}));
vi.mock('@/components/library/LibraryView', () => ({
  LibraryView: () => <div data-testid="library" />,
}));
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({ activeProvider: 'local' }),
}));

const JOB: ProcessingJob = {
  id: 'job-1',
  input_path: '/tmp/audio.wav',
  output_path: '/tmp/audio.stem.mp4',
  model: 'bs_roformer',
  status: 'processing',
  progress: 0.42,
  started_at: new Date().toISOString(),
  dj_software: 'traktor',
};

describe('AppShell processing indicator', () => {
  beforeEach(() => {
    useAppStore.setState({
      isProcessing: false,
      currentJobId: null,
      jobs: [],
      activeView: 'files',
    });
    vi.clearAllMocks();
  });

  it('renders the floating indicator on non-queue views while processing', () => {
    useAppStore.setState({ isProcessing: true, currentJobId: 'job-1', jobs: [JOB] });
    render(<AppShell />);
    expect(screen.getByText(/Processing with /)).toBeInTheDocument();
  });

  it('omits the floating indicator on the queue view (queue shows its own batch status)', () => {
    useAppStore.setState({ isProcessing: true, currentJobId: 'job-1', jobs: [JOB], activeView: 'queue' });
    render(<AppShell />);
    expect(screen.queryByText(/Processing with /)).not.toBeInTheDocument();
  });

  it('omits the indicator when nothing is processing', () => {
    useAppStore.setState({ isProcessing: false, currentJobId: null, jobs: [] });
    render(<AppShell />);
    expect(screen.queryByText(/Processing with /)).not.toBeInTheDocument();
  });
});