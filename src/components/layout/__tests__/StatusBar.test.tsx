import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';
import { useAppStore } from '@/stores/appStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));

function resetStore() {
  useAppStore.setState({
    environmentValidation: null,
    environmentValidated: false,
    dependencies: { ffmpeg: false, sox: false, python: false, cuda: false, mps: false, models: false },
    audioFiles: [],
    jobs: [],
  });
}

const allAvailableValidation = {
  isReady: true,
  ffmpeg: { available: null },
  ffprobe: { available: null },
  python: { available: null },
  pytorch: { available: null },
  torchaudio: { available: null },
  demucs: { available: null },
  cuda: { available: null },
  sidecarScript: { available: null },
  warnings: [],
};

describe('StatusBar', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders dependency status indicator', () => {
    render(<StatusBar />);
    // Should show "Checking dependencies..." when not validated
    expect(screen.getByText(/checking dependencies/i)).toBeInTheDocument();
  });

  it('shows Ready when all dependencies are met', () => {
    useAppStore.setState({
      environmentValidated: true,
      environmentValidation: allAvailableValidation,
      dependencies: { ffmpeg: true, sox: true, python: true, cuda: false, mps: false, models: true },
    });
    render(<StatusBar />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows warning when some dependencies are missing', () => {
    useAppStore.setState({
      environmentValidated: true,
      environmentValidation: {
        ...allAvailableValidation,
        isReady: false,
        python: { missing: 'Python not found' },
      },
      dependencies: { ffmpeg: true, sox: false, python: false, cuda: false, mps: false, models: false },
    });
    render(<StatusBar />);
    expect(screen.getByText(/some dependencies missing/i)).toBeInTheDocument();
  });

  it('renders CPU device label', () => {
    useAppStore.setState({
      environmentValidated: true,
      environmentValidation: {
        ...allAvailableValidation,
        cuda: { unavailable: 'No GPU' },
        pythonVersion: '3.13.1',
      },
    });
    render(<StatusBar />);
    expect(screen.getByText('CPU')).toBeInTheDocument();
  });

  it('renders CUDA device label when GPU is available', () => {
    useAppStore.setState({
      environmentValidated: true,
      environmentValidation: allAvailableValidation,
      dependencies: { ffmpeg: true, sox: true, python: true, cuda: true, mps: false, models: true },
    });
    render(<StatusBar />);
    expect(screen.getByText('CUDA')).toBeInTheDocument();
  });

  it('renders file count when files are loaded', () => {
    useAppStore.setState({
      audioFiles: [
        { path: '/a.mp3', name: 'a.mp3', size: 0, duration: 0, sample_rate: 0, bit_depth: 16, channels: 0, format: 'mp3', metadata: {} },
        { path: '/b.mp3', name: 'b.mp3', size: 0, duration: 0, sample_rate: 0, bit_depth: 16, channels: 0, format: 'mp3', metadata: {} },
      ],
    });
    render(<StatusBar />);
    expect(screen.getByText('2 files loaded')).toBeInTheDocument();
  });

  it('renders singular "1 file loaded"', () => {
    useAppStore.setState({
      audioFiles: [
        { path: '/a.mp3', name: 'a.mp3', size: 0, duration: 0, sample_rate: 0, bit_depth: 16, channels: 0, format: 'mp3', metadata: {} },
      ],
    });
    render(<StatusBar />);
    expect(screen.getByText('1 file loaded')).toBeInTheDocument();
  });
});
