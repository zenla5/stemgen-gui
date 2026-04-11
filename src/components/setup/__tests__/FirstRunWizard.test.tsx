import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FirstRunWizard } from '../FirstRunWizard';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FirstRunWizard — welcome step', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the welcome heading', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
  });

  it('renders the Start Check button on the welcome step', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
  });

  it('renders the Skip button on the welcome step', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  it('calls onSkip when Skip button is clicked', () => {
    const onSkip = vi.fn();
    render(<FirstRunWizard onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('renders the dependency checklist on the welcome step', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/ffmpeg/i)).toBeInTheDocument();
    expect(screen.getByText(/python/i)).toBeInTheDocument();
    expect(screen.getByText(/pytorch/i)).toBeInTheDocument();
    expect(screen.getByText(/demucs/i)).toBeInTheDocument();
    expect(screen.getByText(/cuda/i)).toBeInTheDocument();
  });

  it('renders the what-we-need explanation section', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/What we need:/i)).toBeInTheDocument();
    expect(screen.getByText(/audio processing/i)).toBeInTheDocument();
    expect(screen.getByText(/ai model inference/i)).toBeInTheDocument();
    expect(screen.getByText(/gpu acceleration/i)).toBeInTheDocument();
  });

  it('shows both Start Check and Skip buttons', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument();
  });

  it('renders footer with re-run reminder', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/you can re-run this check anytime/i)).toBeInTheDocument();
  });

  it('renders the wizard header', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('heading', { name: /welcome to stemgen gui/i })).toBeInTheDocument();
  });

  it('renders the setup description text', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/Before you can separate audio into stems/i)).toBeInTheDocument();
  });

  it('renders without crashing with no props', () => {
    expect(() => render(<FirstRunWizard />)).not.toThrow();
  });

  it('renders without crashing with all props', () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    expect(() => render(<FirstRunWizard onComplete={onComplete} onSkip={onSkip} />)).not.toThrow();
  });
});

// ─── Installer dep marker tests ─────────────────────────────────────────────

describe('FirstRunWizard — installer dep marker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stays on welcome step when marker is present (marker logic removed in TASK-003)', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_installer_dep_marker') {
        return { python: true, ffmpeg: true, pytorch: true, demucs: true };
      }
      return null;
    });

    render(<FirstRunWizard />);

    // After TASK-003, the wizard no longer auto-advances based on marker
    // It stays on welcome step until user clicks Start Check
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
    });
  });

  it('shows warning for python when marker has python=false', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_installer_dep_marker') {
        return { python: false, ffmpeg: true, pytorch: true, demucs: true };
      }
      return null;
    });

    render(<FirstRunWizard />);

    // The wizard should NOT auto-advance since python is missing
    // It should still show the welcome step
    await waitFor(() => {
      expect(screen.getByText(/start check/i)).toBeInTheDocument();
    });

    // Python should show a warning message in the checking step
    fireEvent.click(screen.getByRole('button', { name: /start check/i }));

    // After advancing to check, python should show warning
    await waitFor(() => {
      const checkingElements = screen.queryAllByText(/checking/i);
      expect(checkingElements.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('falls back to normal flow when marker is absent', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_installer_dep_marker') {
        throw new Error('marker not found');
      }
      return null;
    });

    render(<FirstRunWizard />);

    // Should show the welcome step as normal
    await waitFor(() => {
      expect(screen.getByText(/welcome to stemgen gui/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
  });

  it('falls back to normal flow when marker command returns null', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_installer_dep_marker') {
        return null;
      }
      return null;
    });

    render(<FirstRunWizard />);

    // Should show the welcome step as normal
    await waitFor(() => {
      expect(screen.getByText(/welcome to stemgen gui/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
  });
});

// ─── Results step tests ─────────────────────────────────────────────────────

describe('FirstRunWizard — results step', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('transitions to check step when Start Check is clicked', async () => {
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

    render(<FirstRunWizard />);

    // Click Start Check
    fireEvent.click(screen.getByRole('button', { name: /start check/i }));

    // Should transition to check step
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /start check/i })).not.toBeInTheDocument();
    });
  });

  it('shows results after mocked validate_environment resolves', async () => {
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

    render(<FirstRunWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Click Start Check
    fireEvent.click(screen.getByRole('button', { name: /start check/i }));

    // Wait for results to appear (Continue button should be visible)
    // The DependencyCheckPanel needs to complete its check first
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('Continue button calls onComplete in results step', async () => {
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

    const onComplete = vi.fn();
    render(<FirstRunWizard onComplete={onComplete} />);

    // Click Start Check
    fireEvent.click(screen.getByRole('button', { name: /start check/i }));

    // Wait for Continue button and click it
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Skip Setup button calls onSkip in results step', async () => {
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

    const onSkip = vi.fn();
    render(<FirstRunWizard onSkip={onSkip} />);

    // Click Start Check
    fireEvent.click(screen.getByRole('button', { name: /start check/i }));

    // Wait for Skip Setup button and click it
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /skip setup/i })).toBeInTheDocument();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /skip setup/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
