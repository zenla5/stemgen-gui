import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DependencyCheckPanel } from '../DependencyCheckPanel';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// ─── Mock Zustand store ────────────────────────────────────────────────────────

const mockFetchInstallManifest = vi.fn();
const mockGetAvailableInstallers = vi.fn();
const mockInstallDependency = vi.fn();
const mockValidateEnvironment = vi.fn();

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    () => ({
      fetchInstallManifest: mockFetchInstallManifest,
      getAvailableInstallers: mockGetAvailableInstallers,
      installDependency: mockInstallDependency,
      validateEnvironment: mockValidateEnvironment,
    }),
    {
      setState: vi.fn(),
    }
  ),
}));

// ─── Mock lucide-react icons ───────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
  CheckCircle: () => <span data-testid="icon-ok" />,
  XCircle: () => <span data-testid="icon-missing" />,
  AlertCircle: () => <span data-testid="icon-warning" />,
  Download: () => <span data-testid="icon-download" />,
  Loader2: () => <span data-testid="icon-loading" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DependencyCheckPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchInstallManifest.mockResolvedValue(undefined);
    mockGetAvailableInstallers.mockResolvedValue([]);
    mockValidateEnvironment.mockResolvedValue(undefined);
  });

  // ── Test 1: Renders all five dependency rows in pending state by default ──

  it('renders all five dependency rows in pending state by default', () => {
    render(<DependencyCheckPanel />);

    expect(screen.getByText('FFmpeg')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('PyTorch')).toBeInTheDocument();
    expect(screen.getByText('demucs')).toBeInTheDocument();
    expect(screen.getByText('CUDA')).toBeInTheDocument();
  });

  // ── Test 2: autoCheckOnMount=true triggers validate_environment on mount ──

  it('autoCheckOnMount=true triggers validate_environment on mount', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: 'available',
          python: 'available',
          pythonVersion: '3.12.0',
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: { unavailable: 'CUDA not available' },
        };
      }
      return null;
    });

    render(<DependencyCheckPanel autoCheckOnMount />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('validate_environment');
    });
  });

  // ── Test 3: Rows show correct status icons after a completed check ──

  it('rows show correct status icons after a completed check', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: { missing: 'FFmpeg not found' },
          python: 'available',
          pythonVersion: '3.12.0',
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: { unavailable: 'CUDA not available' },
        };
      }
      return null;
    });

    render(<DependencyCheckPanel autoCheckOnMount />);

    // Wait for check to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
    });

    // FFmpeg should show missing status
    const ffmpegStatus = screen.getAllByTestId('wizard-dep-status').find(
      el => el.closest('[data-dep-key="ffmpeg"]')
    );
    expect(ffmpegStatus).toHaveTextContent('FFmpeg not found');
  });

  // ── Test 4: Run Check button triggers validate_environment ──

  it('Run Check button triggers validate_environment', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: 'available',
          python: 'available',
          pythonVersion: '3.12.0',
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: 'available',
          gpuName: 'NVIDIA RTX 3080',
        };
      }
      return null;
    });

    render(<DependencyCheckPanel />);

    // Click Run Check button
    fireEvent.click(screen.getByRole('button', { name: /run check/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('validate_environment');
    });
  });

  // ── Test 5: Install button appears for a missing dep when an installer is available ──

  it('Install button appears for a missing dep when an installer is available', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: 'available',
          python: { missing: 'Python not found' },
          pythonVersion: null,
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: 'available',
          gpuName: 'NVIDIA RTX 3080',
        };
      }
      return null;
    });

    mockGetAvailableInstallers.mockResolvedValue([
      { id: 'python-pip', name: 'pip install python', needsElevation: false, commandDisplay: 'pip install python' },
    ]);

    render(<DependencyCheckPanel autoCheckOnMount />);

    // Wait for check to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
    });

    // Install button should appear for Python
    await waitFor(() => {
      expect(screen.getByTestId('install-btn-python')).toBeInTheDocument();
    });
  });

  // ── Test 6: Install button does NOT appear for CUDA ──

  it('Install button does NOT appear for CUDA', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: 'available',
          python: 'available',
          pythonVersion: '3.12.0',
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: { missing: 'CUDA not installed' },
          gpuName: 'No GPU',
        };
      }
      return null;
    });

    mockGetAvailableInstallers.mockResolvedValue([
      { id: 'cuda-installer', name: 'Install CUDA', needsElevation: false, commandDisplay: 'install cuda' },
    ]);

    render(<DependencyCheckPanel autoCheckOnMount />);

    // Wait for check to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
    });

    // Install button should NOT appear for CUDA
    expect(screen.queryByTestId('install-btn-cuda')).not.toBeInTheDocument();
  });

  // ── Test 7: Summary banner "All dependencies are installed" appears ──

  it('shows "All dependencies are installed" when all statuses are ok', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        return {
          ffmpeg: 'available',
          python: 'available',
          pythonVersion: '3.12.0',
          pytorch: 'available',
          pytorchVersion: '2.1.0',
          demucs: 'available',
          cuda: 'available',
          gpuName: 'NVIDIA RTX 3080',
        };
      }
      return null;
    });

    render(<DependencyCheckPanel autoCheckOnMount />);

    // Wait for check to complete
    await waitFor(() => {
      expect(screen.getByText('All dependencies are installed.')).toBeInTheDocument();
    });
  });

  // ── Test 8: Error fallback: mock validate_environment to throw ──

  it('shows warning status for all deps when validate_environment throws', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'validate_environment') {
        throw new Error('Environment check failed');
      }
      return null;
    });

    render(<DependencyCheckPanel autoCheckOnMount />);

    // Wait for check to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
    });

    // All deps should show warning
    const statusElements = screen.getAllByTestId('wizard-dep-status');
    statusElements.forEach(el => {
      expect(el).toHaveTextContent('Could not check dependency');
    });
  });
});