import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StemMixer } from '../StemMixer';
import * as useMultiStemPlayerModule from '@/hooks/useMultiStemPlayer';
import * as appStoreModule from '@/stores/appStore';
import type { Stem, AudioFileMetadata, StemType, WaveformData } from '@/lib/types';

// Mock the hooks
vi.mock('@/hooks/useMultiStemPlayer');
vi.mock('@/stores/appStore');

const createMockPlayer = (overrides = {}) => ({
  state: {
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    isLoaded: true,
    loadingProgress: 1,
    loadedStems: ['drums', 'bass', 'other', 'vocals'] as StemType[],
    isLoading: false,
  },
  loadStems: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  setMasterVolume: vi.fn(),
  setStemVolume: vi.fn(),
  setStemMuted: vi.fn(),
  setStemSolo: vi.fn(),
  stemWaveforms: {
    drums: { points: [], sample_rate: 44100, duration_secs: 180 } as WaveformData,
    bass: { points: [], sample_rate: 44100, duration_secs: 180 } as WaveformData,
    other: { points: [], sample_rate: 44100, duration_secs: 180 } as WaveformData,
    vocals: { points: [], sample_rate: 44100, duration_secs: 180 } as WaveformData,
  } as Record<StemType, WaveformData | null>,
  cleanup: vi.fn(),
  ...overrides,
});

const createMockStems = (): Stem[] => [
  { id: 'drums', type: 'drums' as const, name: 'Drums', color: '#FF6B6B', volume: 1, muted: false, solo: false, file_path: '/audio/drums.wav' },
  { id: 'bass', type: 'bass' as const, name: 'Bass', color: '#4ECDC4', volume: 1, muted: false, solo: false, file_path: '/audio/bass.wav' },
  { id: 'other', type: 'other' as const, name: 'Other', color: '#FFE66D', volume: 1, muted: false, solo: false, file_path: '/audio/other.wav' },
  { id: 'vocals', type: 'vocals' as const, name: 'Vocals', color: '#95E1D3', volume: 1, muted: false, solo: false, file_path: '/audio/vocals.wav' },
];

const mockSelectedFile: AudioFileMetadata = {
  path: '/audio/test.mp3',
  name: 'test.mp3',
  size: 5000000,
  duration: 180,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  format: 'mp3',
  metadata: {},
};

describe('StemMixer — interaction tests', () => {
  let mockPlayer: ReturnType<typeof createMockPlayer>;
  let mockUpdateStem: ReturnType<typeof vi.fn>;
  let mockResetStemMixer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateStem = vi.fn();
    mockResetStemMixer = vi.fn();
    mockPlayer = createMockPlayer();

    vi.mocked(useMultiStemPlayerModule.useMultiStemPlayer).mockReturnValue(mockPlayer);
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      currentStems: createMockStems(),
      updateStem: mockUpdateStem,
      resetStemMixer: mockResetStemMixer,
      selectedFile: mockSelectedFile,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>);
  });

  it('renders all four stem controls', () => {
    render(<StemMixer />);
    
    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('Bass')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
  });

  it('calls setStemVolume when volume slider changes', () => {
    render(<StemMixer />);
    
    const volumeSlider = screen.getByRole('slider', { name: /drums volume/i });
    fireEvent.change(volumeSlider, { target: { value: '50' } });
    
    expect(mockPlayer.setStemVolume).toHaveBeenCalledWith('drums', 0.5);
    expect(mockUpdateStem).toHaveBeenCalledWith('drums', { volume: 0.5 });
  });

  it('calls setStemMuted when mute button is clicked', () => {
    render(<StemMixer />);
    
    const muteButton = screen.getByRole('button', { name: /mute drums/i });
    fireEvent.click(muteButton);
    
    expect(mockPlayer.setStemMuted).toHaveBeenCalledWith('drums', true);
    expect(mockUpdateStem).toHaveBeenCalledWith('drums', { muted: true });
  });

  it('calls setStemSolo when solo button is clicked', () => {
    render(<StemMixer />);
    
    const soloButton = screen.getByRole('button', { name: /solo drums/i });
    fireEvent.click(soloButton);
    
    expect(mockPlayer.setStemSolo).toHaveBeenCalledWith('drums', true);
    expect(mockUpdateStem).toHaveBeenCalledWith('drums', { solo: true });
  });

  it('calls togglePlay when play/pause button is clicked', () => {
    render(<StemMixer />);
    
    // Find the play button in the transport controls group
    const playButton = screen.getByRole('button', { name: /^(play|pause)$/i });
    fireEvent.click(playButton);
    
    expect(mockPlayer.togglePlay).toHaveBeenCalled();
  });

  it('calls seek when skip to start button is clicked', () => {
    render(<StemMixer />);
    
    const restartButton = screen.getByRole('button', { name: /restart playback/i });
    fireEvent.click(restartButton);
    
    expect(mockPlayer.seek).toHaveBeenCalledWith(0);
  });

  it('calls seek when skip to end button is clicked', () => {
    render(<StemMixer />);
    
    const skipEndButton = screen.getByRole('button', { name: /skip to end/i });
    fireEvent.click(skipEndButton);
    
    expect(mockPlayer.seek).toHaveBeenCalledWith(180);
  });

  it('calls resetStemMixer when reset button is clicked', () => {
    render(<StemMixer />);
    
    const resetButton = screen.getByRole('button', { name: /reset all stem mixer settings/i });
    fireEvent.click(resetButton);
    
    expect(mockResetStemMixer).toHaveBeenCalled();
  });

  it('renders master volume slider', () => {
    render(<StemMixer />);
    
    const masterVolumeSlider = screen.getByRole('slider', { name: /master volume/i });
    expect(masterVolumeSlider).toBeInTheDocument();
  });

  it('renders playback progress bar', () => {
    render(<StemMixer />);
    
    const progressBar = screen.getByRole('progressbar', { name: /playback progress/i });
    expect(progressBar).toBeInTheDocument();
  });

  it('renders time display', () => {
    render(<StemMixer />);
    
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('displays selected file name', () => {
    render(<StemMixer />);
    
    expect(screen.getByText('test.mp3')).toBeInTheDocument();
  });

  it('displays stems loaded count', () => {
    render(<StemMixer />);
    
    expect(screen.getByText(/4\/4 stems loaded/i)).toBeInTheDocument();
  });

  it('shows loading state when player is loading', () => {
    mockPlayer.state.isLoading = true;
    mockPlayer.state.loadingProgress = 0.5;
    mockPlayer.state.isLoaded = false;
    
    render(<StemMixer />);
    
    expect(screen.getByRole('status', { name: /loading stems/i })).toBeInTheDocument();
    expect(screen.getByText(/loading stems... 50%/i)).toBeInTheDocument();
  });

  it('shows empty state when no stems are loaded', () => {
    mockPlayer.stemWaveforms = {
      drums: null,
      bass: null,
      other: null,
      vocals: null,
    } as Record<StemType, WaveformData | null>;
    mockPlayer.state.isLoaded = false;
    mockPlayer.state.isLoading = false;
    
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      currentStems: createMockStems().map(s => ({ ...s, file_path: undefined })),
      updateStem: mockUpdateStem,
      resetStemMixer: mockResetStemMixer,
      selectedFile: null,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>);
    
    render(<StemMixer />);
    
    expect(screen.getByRole('status')).toHaveTextContent(/select a file and process it/i);
  });

  it('renders mute button with unmute label when muted', () => {
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      currentStems: createMockStems().map(s => 
        s.id === 'drums' ? { ...s, muted: true } : s
      ),
      updateStem: mockUpdateStem,
      resetStemMixer: mockResetStemMixer,
      selectedFile: mockSelectedFile,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>);
    
    render(<StemMixer />);
    
    const muteButton = screen.getByRole('button', { name: /unmute drums/i });
    expect(muteButton).toBeInTheDocument();
  });

  it('renders solo button highlighted when soloed', () => {
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      currentStems: createMockStems().map(s => 
        s.id === 'bass' ? { ...s, solo: true } : s
      ),
      updateStem: mockUpdateStem,
      resetStemMixer: mockResetStemMixer,
      selectedFile: mockSelectedFile,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>);
    
    render(<StemMixer />);
    
    const soloButton = screen.getByRole('button', { name: /solo bass/i });
    expect(soloButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('displays current playback time', () => {
    mockPlayer.state.currentTime = 65;
    mockPlayer.state.duration = 180;
    
    render(<StemMixer />);
    
    // Time should show 1:05 / 3:00
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
  });
});
