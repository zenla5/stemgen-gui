import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';

// ─── Mock ModelManager to avoid Tauri listen() complexity ──────────────────────
vi.mock('../ModelManager', () => ({
  ModelManager: () => <div data-testid="model-manager">ModelManager</div>,
}));

// ─── Reset helpers ──────────────────────────────────────────────────────────────

function resetStores() {
  useAppStore.setState({
    settings: {
      model: 'bs_roformer',
      device: 'cpu',
      djPreset: 'traktor',
      outputFormat: 'aac',
      qualityPreset: 'standard',
      inferenceProvider: 'local',
      customStemColors: true,
      normalizeAudio: true,
      preserveOriginal: true,
      cpuThreads: 4,
      gpuEnabled: true,
    },
    updateSettings: vi.fn(),
    checkSidecarHealth: vi.fn(),
    validateEnvironment: vi.fn(),
    sidecarHealth: {
      isHealthy: true,
      pythonFound: true,
      pythonVersion: '3.10.0',
      pytorchVersion: '2.0.0',
      gpuAvailable: true,
      gpuDevice: 'NVIDIA RTX 3080',
      modelCount: 4,
      errors: [],
      demucsAvailable: true,
      bsRoformerAvailable: true,
      sidecarScriptFound: true,
      modelDirectory: '/models',
    },
    environmentValidation: {
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
    },
    dependencies: {
      ffmpeg: true,
      sox: true,
      python: true,
      cuda: true,
      mps: false,
      models: true,
    },
    setMaxParallelJobs: vi.fn(),
  });

  useSettingsStore.setState({
    theme: 'dark',
    language: 'en',
    gpuEnabled: true,
    cpuThreads: 4,
    maxParallelJobs: 2,
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    setGpuEnabled: vi.fn(),
    setCpuThreads: vi.fn(),
    setMaxParallelJobs: vi.fn(),
  });
}

// ─── Basic render tests ────────────────────────────────────────────────────────

describe('SettingsPanel — basic render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it('renders Settings title', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders Refresh button', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('renders GPU checkbox', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders language select', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders AI Model section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /AI Model/i })).toBeInTheDocument();
  });

  it('renders Device section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Processing Device/i })).toBeInTheDocument();
  });

  it('renders Output Format section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Output Format/i })).toBeInTheDocument();
  });

  it('renders Quality Preset section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Quality Preset/i })).toBeInTheDocument();
  });

  it('renders GPU Acceleration section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /GPU Acceleration/i })).toBeInTheDocument();
  });

  it('renders CPU Threads section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /CPU Threads/i })).toBeInTheDocument();
  });

  it('renders Parallel Jobs section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Parallel Jobs/i })).toBeInTheDocument();
  });

  it('renders Model Downloads section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Model Downloads/i })).toBeInTheDocument();
  });

  it('renders the ModelManager component', () => {
    render(<SettingsPanel />);
    expect(screen.getByTestId('model-manager')).toBeInTheDocument();
  });

  it('renders the Target DJ Software section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Target DJ Software/i })).toBeInTheDocument();
  });

  it('renders the Appearance section', () => {
    render(<SettingsPanel />);
    expect(screen.getByRole('heading', { name: /Appearance/i })).toBeInTheDocument();
  });
});

// ─── Interaction tests ─────────────────────────────────────────────────────────

describe('SettingsPanel — interaction tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it('clicking Dark theme button calls setTheme("dark")', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /dark/i }));
    expect(useSettingsStore.getState().setTheme).toHaveBeenCalledWith('dark');
  });

  it('clicking Light theme button calls setTheme("light")', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /light/i }));
    expect(useSettingsStore.getState().setTheme).toHaveBeenCalledWith('light');
  });

  it('clicking System theme button calls setTheme("system")', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /system/i }));
    expect(useSettingsStore.getState().setTheme).toHaveBeenCalledWith('system');
  });

  it('clicking Refresh button calls checkSidecarHealth and validateEnvironment', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(useAppStore.getState().checkSidecarHealth).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().validateEnvironment).toHaveBeenCalledTimes(1);
  });

  it('clicking the GPU checkbox calls setGpuEnabled', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(useSettingsStore.getState().setGpuEnabled).toHaveBeenCalledWith(false);
  });

  it('changing the language select calls setLanguage', () => {
    render(<SettingsPanel />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } });
    expect(useSettingsStore.getState().setLanguage).toHaveBeenCalledWith('de');
  });

  it('clicking HT-Demucs model card calls updateSettings with htdemucs', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('HT-Demucs'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ model: 'htdemucs' });
  });

  it('clicking HT-Demucs FT model card calls updateSettings with htdemucs_ft', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('HT-Demucs FT'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ model: 'htdemucs_ft' });
  });

  it('clicking Demucs model card calls updateSettings with demucs', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Demucs'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ model: 'demucs' });
  });

  it('clicking BS-RoFormer model card calls updateSettings with bs_roformer', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('BS-RoFormer'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ model: 'bs_roformer' });
  });

  it('clicking Serato DJ preset calls updateSettings with serato', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Serato DJ'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ djPreset: 'serato' });
  });

  it('clicking Rekordbox preset calls updateSettings with rekordbox', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Rekordbox'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ djPreset: 'rekordbox' });
  });

  it('clicking Mixxx preset calls updateSettings with mixxx', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Mixxx'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ djPreset: 'mixxx' });
  });

  it('clicking ALAC output format calls updateSettings with alac', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('ALAC'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ outputFormat: 'alac' });
  });

  it('clicking AAC output format calls updateSettings with aac', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('AAC'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ outputFormat: 'aac' });
  });

  it('clicking Draft quality preset calls updateSettings with draft', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Draft'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ qualityPreset: 'draft' });
  });

  it('clicking Standard quality preset calls updateSettings with standard', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Standard'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ qualityPreset: 'standard' });
  });

  it('clicking Master quality preset calls updateSettings with master', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByText('Master'));
    expect(useAppStore.getState().updateSettings).toHaveBeenCalledWith({ qualityPreset: 'master' });
  });
});

// ─── Conditional rendering tests ────────────────────────────────────────────────

describe('SettingsPanel — conditional rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it('renders CUDA device as disabled when dependencies.cuda is false', () => {
    useAppStore.setState({
      dependencies: {
        ffmpeg: true,
        sox: true,
        python: true,
        cuda: false,
        mps: false,
        models: true,
      },
    });

    render(<SettingsPanel />);

    const cudaButton = screen.getByRole('button', { name: /nvidia cuda/i });
    expect(cudaButton).toBeDisabled();
    expect(cudaButton).toHaveTextContent('(unavailable)');
  });

  it('renders MPS device as disabled when dependencies.mps is false', () => {
    useAppStore.setState({
      dependencies: {
        ffmpeg: true,
        sox: true,
        python: true,
        cuda: false,
        mps: false,
        models: true,
      },
    });

    render(<SettingsPanel />);

    const mpsButton = screen.getByRole('button', { name: /apple silicon/i });
    expect(mpsButton).toBeDisabled();
    expect(mpsButton).toHaveTextContent('(unavailable)');
  });

  it('renders CUDA device as enabled when dependencies.cuda is true', () => {
    useAppStore.setState({
      dependencies: {
        ffmpeg: true,
        sox: true,
        python: true,
        cuda: true,
        mps: false,
        models: true,
      },
    });

    render(<SettingsPanel />);

    const cudaButton = screen.getByRole('button', { name: /nvidia cuda/i });
    expect(cudaButton).not.toBeDisabled();
  });

  it('renders CUDA detection message when cuda is available', () => {
    useAppStore.setState({
      dependencies: {
        ffmpeg: true,
        sox: true,
        python: true,
        cuda: true,
        mps: false,
        models: true,
      },
    });

    render(<SettingsPanel />);
    expect(screen.getByText(/nvidia cuda detected/i)).toBeInTheDocument();
  });

  it('shows ready status when environment is ready', () => {
    useAppStore.setState({
      environmentValidation: {
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
      },
    });

    render(<SettingsPanel />);
    expect(screen.getByText(/environment ready/i)).toBeInTheDocument();
  });

  it('shows warnings when environment has warnings', () => {
    useAppStore.setState({
      environmentValidation: {
        isReady: false,
        ffmpeg: { available: null },
        ffprobe: { available: null },
        python: { available: null },
        pytorch: { available: null },
        torchaudio: { available: null },
        demucs: { available: null },
        cuda: { available: null },
        sidecarScript: { available: null },
        warnings: ['Python 3.8 may not be compatible'],
      },
    });

    render(<SettingsPanel />);
    expect(screen.getByText(/python 3\.8 may not be compatible/i)).toBeInTheDocument();
  });
});
