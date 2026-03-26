import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { StemMixer } from '@/components/mixer/StemMixer';
import { useAppStore } from '@/stores/appStore';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAudioPlayer hook
vi.mock('@/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    state: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLoaded: false,
    },
    loadAudio: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(),
    seek: vi.fn(),
    togglePlay: vi.fn(),
  }),
}));

// Mock WaveformDisplay
vi.mock('@/components/audio', () => ({
  WaveformDisplay: () => <div data-testid="waveform-mock">WaveformDisplay</div>,
}));

// ─── Store reset helper ────────────────────────────────────────────────────────

function resetStore() {
  useAppStore.setState({
    currentStems: [
      { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 1, muted: false, solo: false },
      { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false },
      { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false },
      { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false },
    ],
    selectedFile: null,
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

  it('renders four stem tracks (drums, bass, other, vocals)', () => {
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

    // Each stem has a mute and solo button (2 per stem = 8)
    // We can check for the title attributes
    const soloButtons = screen.getAllByTitle('Solo');
    const muteButtons = screen.getAllByTitle('Mute');

    expect(soloButtons).toHaveLength(4);
    expect(muteButtons).toHaveLength(4);
  });

  it('renders the Reset button', () => {
    render(<StemMixer />);
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders the Preview section', () => {
    render(<StemMixer />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders the Master Volume slider in the Preview section', () => {
    render(<StemMixer />);
    const sliders = screen.getAllByRole('slider');
    // At least one slider (master) should be in the preview area
    expect(sliders.length).toBeGreaterThan(0);
  });
});
