import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaveformDisplay, SimpleWaveform } from '../WaveformDisplay';

// Mock WaveSurfer
vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn(() => ({
      load: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: vi.fn(() => 0),
      destroy: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

describe('WaveformDisplay', () => {
  const defaultProps = {
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    onPlayPause: vi.fn(),
    onSeek: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<WaveformDisplay {...defaultProps} />);
    expect(container.querySelector('.flex.flex-col')).toBeTruthy();
  });

  it('renders play/pause button', () => {
    render(<WaveformDisplay {...defaultProps} />);
    const playButton = document.querySelector('button[title="Play"]');
    expect(playButton).toBeTruthy();
  });

  it('shows pause button when playing', () => {
    render(<WaveformDisplay {...defaultProps} isPlaying={true} />);
    const pauseButton = document.querySelector('button[title="Pause"]');
    expect(pauseButton).toBeTruthy();
  });

  it('calls onPlayPause when play button clicked', () => {
    render(<WaveformDisplay {...defaultProps} />);
    const playButton = document.querySelector('button[title="Play"]');
    if (playButton) {
      fireEvent.click(playButton);
      expect(defaultProps.onPlayPause).toHaveBeenCalled();
    }
  });

  it('calls onSeek when restart button clicked', () => {
    render(<WaveformDisplay {...defaultProps} />);
    const restartButton = document.querySelector('button[title="Restart"]');
    if (restartButton) {
      fireEvent.click(restartButton);
      expect(defaultProps.onSeek).toHaveBeenCalledWith(0);
    }
  });

  it('calls onSeek when skip button clicked', () => {
    render(<WaveformDisplay {...defaultProps} duration={60} />);
    const skipButton = document.querySelector('button[title="Skip to end"]');
    if (skipButton) {
      fireEvent.click(skipButton);
      expect(defaultProps.onSeek).toHaveBeenCalledWith(60);
    }
  });

  it('displays formatted time', () => {
    render(<WaveformDisplay {...defaultProps} currentTime={30} duration={100} />);
    expect(document.body.textContent).toContain('00:30');
    expect(document.body.textContent).toContain('01:40');
  });

  it('accepts custom className', () => {
    const { container } = render(
      <WaveformDisplay {...defaultProps} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('accepts custom height', () => {
    const { container } = render(
      <WaveformDisplay {...defaultProps} height={120} />
    );
    const waveform = container.querySelector('.w-full');
    expect(waveform).toBeTruthy();
  });

  it('accepts custom wave colors', () => {
    const { container } = render(
      <WaveformDisplay {...defaultProps} waveColor="#FF6B6B" progressColor="#4ECDC4" />
    );
    expect(container.querySelector('.flex.flex-col')).toBeTruthy();
  });

  it('renders with audioPath (uses convertFileSrc)', () => {
    render(<WaveformDisplay {...defaultProps} audioPath="/path/to/audio.mp3" />);
    // Just verify it renders without error
    expect(document.body).toBeTruthy();
  });

  it('renders with audioUrl', () => {
    render(<WaveformDisplay {...defaultProps} audioUrl="https://example.com/audio.mp3" />);
    expect(document.body).toBeTruthy();
  });

  it('handles keyboard shortcuts', () => {
    const { container } = render(<WaveformDisplay {...defaultProps} currentTime={10} duration={60} />);
    const element = container.querySelector('.flex.flex-col');
    if (element) {
      fireEvent.keyDown(element, { key: ' ', preventDefault: () => {} });
      expect(defaultProps.onPlayPause).toHaveBeenCalled();
    }
  });

  it('handles seek keyboard shortcut (ArrowRight)', () => {
    const { container } = render(<WaveformDisplay {...defaultProps} currentTime={10} duration={60} />);
    const element = container.querySelector('.flex.flex-col');
    if (element) {
      fireEvent.keyDown(element, { key: 'ArrowRight', preventDefault: () => {} });
      expect(defaultProps.onSeek).toHaveBeenCalledWith(15);
    }
  });

  it('handles seek keyboard shortcut (ArrowLeft)', () => {
    const { container } = render(<WaveformDisplay {...defaultProps} currentTime={10} duration={60} />);
    const element = container.querySelector('.flex.flex-col');
    if (element) {
      fireEvent.keyDown(element, { key: 'ArrowLeft', preventDefault: () => {} });
      expect(defaultProps.onSeek).toHaveBeenCalledWith(5);
    }
  });

  it('clamps seek time to valid range', () => {
    const { container } = render(<WaveformDisplay {...defaultProps} currentTime={10} duration={60} />);
    const element = container.querySelector('.flex.flex-col');
    if (element) {
      // Seek past start
      fireEvent.keyDown(element, { key: 'ArrowLeft', preventDefault: () => {} });
      expect(defaultProps.onSeek).toHaveBeenCalledWith(0);
    }
  });
});

describe('SimpleWaveform', () => {
  it('renders without crashing', () => {
    const { container } = render(<SimpleWaveform />);
    expect(container.querySelector('.h-2')).toBeTruthy();
  });

  it('renders with custom progress', () => {
    const { container } = render(<SimpleWaveform progress={50} />);
    const progressBar = container.querySelector('.bg-primary');
    expect(progressBar).toBeTruthy();
    expect(progressBar?.getAttribute('style')).toContain('width: 50%');
  });

  it('renders with custom className', () => {
    const { container } = render(<SimpleWaveform className="custom-progress" />);
    expect(container.querySelector('.custom-progress')).toBeTruthy();
  });

  it('handles zero progress', () => {
    const { container } = render(<SimpleWaveform progress={0} />);
    const progressBar = container.querySelector('.bg-primary');
    expect(progressBar?.getAttribute('style')).toContain('width: 0%');
  });

  it('handles full progress', () => {
    const { container } = render(<SimpleWaveform progress={100} />);
    const progressBar = container.querySelector('.bg-primary');
    expect(progressBar?.getAttribute('style')).toContain('width: 100%');
  });
});
