import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchConfirmDialog } from '@/components/library/BatchConfirmDialog';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const defaultProps = {
  open: true,
  mode: 'generate' as const,
  fileCount: 5,
  estimatedDurationSecs: 120,
  modelName: 'BS-RoFormer',
  djPreset: 'traktor',
  outputFormat: 'alac',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BatchConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with "Generate Missing Stems" title in generate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="generate" />);

    expect(screen.getByText('Generate Missing Stems')).toBeInTheDocument();
  });

  it('renders with "Regenerate Outdated Stems" title in regenerate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="regenerate" />);

    expect(screen.getByText('Regenerate Outdated Stems')).toBeInTheDocument();
  });

  it('shows file count with correct singular/plural', () => {
    render(<BatchConfirmDialog {...defaultProps} fileCount={1} />);

    expect(screen.getByText(/1/)).toBeInTheDocument();
    // "1 file will be processed"
    expect(screen.getByText(/file/)).toBeInTheDocument();
  });

  it('shows file count with plural form', () => {
    render(<BatchConfirmDialog {...defaultProps} fileCount={5} />);

    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/files/)).toBeInTheDocument();
  });

  it('displays estimated duration in human-readable format', () => {
    render(<BatchConfirmDialog {...defaultProps} estimatedDurationSecs={94} />);

    expect(screen.getByText(/1m 34s/)).toBeInTheDocument();
  });

  it('does not show duration when 0', () => {
    render(<BatchConfirmDialog {...defaultProps} estimatedDurationSecs={0} />);

    expect(screen.queryByText(/Estimated time/)).not.toBeInTheDocument();
  });

  it('displays model name, preset, and output format', () => {
    render(<BatchConfirmDialog {...defaultProps} />);

    expect(screen.getByText('BS-RoFormer')).toBeInTheDocument();
    expect(screen.getByText('traktor')).toBeInTheDocument();
    expect(screen.getByText('ALAC')).toBeInTheDocument();
  });

  it('shows replacement warning in regenerate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="regenerate" />);

    expect(screen.getByText(/existing stem files will be replaced/i)).toBeInTheDocument();
  });

  it('does not show replacement warning in generate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="generate" />);

    expect(screen.queryByText(/replaced/i)).not.toBeInTheDocument();
  });

  it('shows "Include unknown-provenance stems" checkbox in regenerate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="regenerate" />);

    expect(screen.getByTestId('include-unknown-checkbox')).toBeInTheDocument();
  });

  it('does not show checkbox in generate mode', () => {
    render(<BatchConfirmDialog {...defaultProps} mode="generate" />);

    expect(screen.queryByTestId('include-unknown-checkbox')).not.toBeInTheDocument();
  });

  it('Cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<BatchConfirmDialog {...defaultProps} onCancel={onCancel} />);
    await user.click(screen.getByTestId('batch-cancel-btn'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('Start button calls onConfirm with includeUnknown=false by default', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<BatchConfirmDialog {...defaultProps} mode="regenerate" onConfirm={onConfirm} />);
    await user.click(screen.getByTestId('batch-start-btn'));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('Start button passes includeUnknown=true when checkbox is checked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<BatchConfirmDialog {...defaultProps} mode="regenerate" onConfirm={onConfirm} />);
    await user.click(screen.getByTestId('include-unknown-checkbox'));
    await user.click(screen.getByTestId('batch-start-btn'));

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('does not render when open is false', () => {
    render(<BatchConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId('batch-confirm-dialog')).not.toBeInTheDocument();
  });
});
