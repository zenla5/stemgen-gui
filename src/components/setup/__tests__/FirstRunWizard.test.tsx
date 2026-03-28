import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders the wizard header with emoji', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/🎛️ Welcome to Stemgen GUI/i)).toBeInTheDocument();
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
