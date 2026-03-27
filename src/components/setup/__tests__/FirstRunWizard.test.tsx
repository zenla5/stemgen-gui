import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FirstRunWizard } from '../FirstRunWizard';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    ffmpeg: { available: null },
    ffprobe: { available: null },
    python: { available: null },
    pythonVersion: '3.10.0',
    pytorch: { available: null },
    pytorchVersion: '2.0.0',
    demucs: { available: null },
    cuda: { available: null },
    gpuName: 'NVIDIA RTX 3080',
  }),
}));

describe('FirstRunWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('welcome step', () => {
    it('renders welcome screen with title', () => {
      render(<FirstRunWizard />);
      expect(screen.getByText(/welcome to stemgen gui/i)).toBeInTheDocument();
    });

    it('renders dependency list', () => {
      render(<FirstRunWizard />);
      expect(screen.getByText(/ffmpeg/i)).toBeInTheDocument();
      expect(screen.getByText(/python/i)).toBeInTheDocument();
      expect(screen.getByText(/pytorch/i)).toBeInTheDocument();
      expect(screen.getByText(/demucs/i)).toBeInTheDocument();
      expect(screen.getByText(/cuda/i)).toBeInTheDocument();
    });

    it('renders Start Check button', () => {
      render(<FirstRunWizard />);
      expect(screen.getByRole('button', { name: /start check/i })).toBeInTheDocument();
    });

    it('renders Skip button', () => {
      render(<FirstRunWizard />);
      expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
    });

    it('calls onSkip when Skip button is clicked', () => {
      const onSkip = vi.fn();
      render(<FirstRunWizard onSkip={onSkip} />);
      screen.getByRole('button', { name: /skip/i }).click();
      expect(onSkip).toHaveBeenCalled();
    });

    it('renders footer with instructions', () => {
      render(<FirstRunWizard />);
      expect(screen.getByText(/you can re-run this check anytime/i)).toBeInTheDocument();
    });
  });

  describe('check step interaction', () => {
    it('shows checking text after clicking Start Check', async () => {
      render(<FirstRunWizard />);

      await act(async () => {
        screen.getByRole('button', { name: /start check/i }).click();
      });

      expect(screen.getByText(/checking dependencies/i)).toBeInTheDocument();
    });
  });

  describe('results step', () => {
    it('renders dependency items after check completes', async () => {
      render(<FirstRunWizard />);

      await act(async () => {
        screen.getByRole('button', { name: /start check/i }).click();
      });

      // Wait for the check to complete (with async mock delays)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });

      // Check for completed status icons (use getAllByText since there are multiple)
      expect(screen.getAllByText(/✅/).length).toBeGreaterThan(0);
    });

    it('renders success message when all dependencies are available', async () => {
      render(<FirstRunWizard />);

      await act(async () => {
        screen.getByRole('button', { name: /start check/i }).click();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });

      expect(screen.getByText(/everything is set up correctly/i)).toBeInTheDocument();
    });

    it('shows Start Using Stemgen button when ready', async () => {
      render(<FirstRunWizard />);

      await act(async () => {
        screen.getByRole('button', { name: /start check/i }).click();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });

      expect(screen.getByRole('button', { name: /start using stemgen/i })).toBeInTheDocument();
    });

    it('calls onComplete when Continue button is clicked', async () => {
      const onComplete = vi.fn();
      render(<FirstRunWizard onComplete={onComplete} />);

      await act(async () => {
        screen.getByRole('button', { name: /start check/i }).click();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });

      await act(async () => {
        screen.getByRole('button', { name: /start using stemgen/i }).click();
      });

      expect(onComplete).toHaveBeenCalled();
    });
  });

  // Note: Testing missing dependencies requires dynamic module mocking
  // which is complex with Vitest. This scenario is covered by integration tests.

  describe('accessibility', () => {
    it('renders with proper structure', () => {
      render(<FirstRunWizard />);
      expect(screen.getByRole('heading', { name: /welcome to stemgen gui/i })).toBeInTheDocument();
    });

    it('renders buttons as accessible elements', () => {
      render(<FirstRunWizard />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
