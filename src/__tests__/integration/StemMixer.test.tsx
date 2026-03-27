import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StemMixer } from '@/components/mixer/StemMixer';
import { useAppStore } from '@/stores/appStore';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock useMultiStemPlayer hook — return isLoaded=true so hasStems=true
vi.mock('@/hooks/useMultiStemPlayer', () => ({
  useMultiStemPlayer: () => ({
    state: {
      isPlaying: false,
      currentTime: 0,
      duration: 180,
      isLoaded: true,
      loadingProgress: 1,
      loadedStems: ['drums', 'bass', 'other', 'vocals'],
      isLoading: false,
    },
    loadStems: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setMasterVolume: vi.fn(),
    setStemVolume: vi.fn(),
    setStemMuted: vi.fn(),
    setStemSolo: vi.fn(),
    stemWaveforms: {
      drums: { points: [], sample_rate: 44100, duration_secs: 180 },
      bass: { points: [], sample_rate: 44100, duration_secs: 180 },
      other: { points: [], sample_rate: 44100, duration_secs: 180 },
      vocals: { points: [], sample_rate: 44100, duration_secs: 180 },
    },
    cleanup: vi.fn(),
  }),
}));

// Mock StemWaveformDisplay
vi.mock('@/components/audio', () => ({
  StemWaveformDisplay: () => <div data-testid="stem-waveform">StemWaveform</div>,
}));

// ─── Store reset helper ────────────────────────────────────────────────────────

function resetStore() {
  act(() => {
    useAppStore.setState({
      currentStems: [
        { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 1, muted: false, solo: false, file_path: '/test/drums.wav' },
        { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false, file_path: '/test/bass.wav' },
        { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false, file_path: '/test/other.wav' },
        { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false, file_path: '/test/vocals.wav' },
      ],
      selectedFile: null,
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StemMixer', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('renders four stem track labels (drums, bass, other, vocals)', () => {
    render(<StemMixer />);

    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('Bass')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
  });

  it('renders volume sliders for each stem', () => {
    render(<StemMixer />);

    const volumeSliders = screen.getAllByRole('slider');
    // 4 stem volume sliders + 1 master volume slider = 5
    expect(volumeSliders).toHaveLength(5);
  });

  it('renders mute and solo buttons for each stem', () => {
    render(<StemMixer />);

    const soloButtons = screen.getAllByTitle('Solo');
    const muteButtons = screen.getAllByTitle('Mute');

    expect(soloButtons).toHaveLength(4);
    expect(muteButtons).toHaveLength(4);
  });

  it('renders the Reset button', () => {
    render(<StemMixer />);
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders the Master Preview section', () => {
    render(<StemMixer />);
    expect(screen.getByText('Master Preview')).toBeInTheDocument();
  });

  it('renders the Master Volume slider in the Preview section', () => {
    render(<StemMixer />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThan(0);
  });

  it('shows placeholder when no stems are loaded', async () => {
    // Override store to have no stems with file paths
    await act(async () => {
      useAppStore.setState({
        currentStems: [
          { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 1, muted: false, solo: false },
          { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false },
          { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false },
          { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false },
        ],
      });
    });

    render(<StemMixer />);

    expect(screen.getByText(/Select a file and process it to generate stems/i)).toBeInTheDocument();
  });

  it('renders stem labels with correct colors', () => {
    render(<StemMixer />);

    // Check that the color indicators are rendered
    const colorIndicators = document.querySelectorAll('[style*="background-color"]');
    expect(colorIndicators.length).toBeGreaterThanOrEqual(4);
  });

  it('renders play/pause controls in Preview section', () => {
    render(<StemMixer />);

    // Play button
    expect(screen.getByTitle('Play')).toBeInTheDocument();
    // Skip buttons
    expect(screen.getByTitle('Restart')).toBeInTheDocument();
    expect(screen.getByTitle('Skip to end')).toBeInTheDocument();
  });
});
