import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StemInfoPanel } from '@/components/library/StemInfoPanel';
import type { StemProvenance } from '@/lib/types/library';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fullProvenance: StemProvenance = {
  schema_version: 1,
  separation_model: 'bs_roformer',
  model_version: 'v1.0',
  stemgen_version: '0.9.0',
  stemgen_gui_version: '1.2.0',
  separation_timestamp: '2026-03-28T12:00:00Z',
  source_path: '/music/track1.mp3',
  source_content_hash: 'abc123def456',
  source_duration_secs: 240.5,
  source_sample_rate: 44100,
  separation_quality_preset: 'master',
  job_id: 'job-001',
  batch_id: 'batch-005',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StemInfoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // invoke never resolves → component stays in loading state
    mockInvoke.mockReturnValue(new Promise(() => {}));

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    // Loader2 renders as an svg with animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders error state when provenance load fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('File not found'));

    render(<StemInfoPanel stemPath="/bad.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Stem Info')).toBeInTheDocument();
    });
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });

  it('renders error state with string error', async () => {
    mockInvoke.mockRejectedValueOnce('disk error');

    render(<StemInfoPanel stemPath="/bad.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('disk error')).toBeInTheDocument();
    });
  });

  it('renders full provenance with all sections visible', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Stem Information')).toBeInTheDocument();
    });

    // Separation Model section
    expect(screen.getByText('bs_roformer')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('0.9.0')).toBeInTheDocument();
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText('master')).toBeInTheDocument();

    // Source File section
    expect(screen.getByText('/music/track1.mp3')).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
    expect(screen.getByText('4m 0s')).toBeInTheDocument();
    // Sample rate uses toLocaleString() which may format differently per environment
    expect(screen.getByText(/Hz/)).toBeInTheDocument();

    // Job Information section
    expect(screen.getByText('job-001')).toBeInTheDocument();
    expect(screen.getByText('batch-005')).toBeInTheDocument();
  });

  it('renders "No provenance" empty state when provenance is null', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return null;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/unknown.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('No provenance metadata found')).toBeInTheDocument();
    });
    expect(
      screen.getByText('This stem file may have been created with an older version of stemgen-gui.')
    ).toBeInTheDocument();
  });

  it('renders "ok" integrity status icon and text', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Source Verified')).toBeInTheDocument();
    });
  });

  it('renders "modified" integrity status icon and text', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return false;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Source Modified')).toBeInTheDocument();
    });
  });

  it('renders "missing" integrity status icon and text when no provenance', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return null;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Source Missing')).toBeInTheDocument();
    });
  });

  it('renders source hash in a code element with copy button', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('abc123def456')).toBeInTheDocument();
    });

    // The hash should be in a code element
    const hashEl = screen.getByText('abc123def456');
    expect(hashEl.tagName).toBe('CODE');
  });

  it('renders copy buttons next to copyable fields', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Stem Information')).toBeInTheDocument();
    });

    // Find copy buttons by their ghost variant class pattern (h-6 w-6 p-0)
    const allButtons = screen.getAllByRole('button');
    const copyButtons = allButtons.filter((btn) =>
      btn.className.includes('h-6') && btn.className.includes('w-6')
    );
    // At least version copy + source path copy + content hash copy + job id copy
    expect(copyButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('"Save Notes" button calls save_user_notes invoke', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return 'existing note';
      if (cmd === 'save_user_notes') return undefined;
      return null;
    });

    const user = userEvent.setup();
    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Stem Information')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Notes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_user_notes', {
        stemPath: '/music/track1.stem.mp4',
        notes: 'existing note',
      });
    });
  });

  it('handleSaveNotes shows error on failure', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      if (cmd === 'save_user_notes') throw new Error('Write failed');
      return null;
    });

    const user = userEvent.setup();
    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Stem Information')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Notes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Stem Info')).toBeInTheDocument();
    });
    expect(screen.getByText('Write failed')).toBeInTheDocument();
  });

  it('shows filename in truncated path display', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return fullProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/track1.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('track1.stem.mp4')).toBeInTheDocument();
    });
  });

  it('does not render optional fields when they are absent', async () => {
    const minimalProvenance: StemProvenance = {
      schema_version: 1,
      separation_model: 'htdemucs',
      stemgen_gui_version: '1.2.0',
      separation_timestamp: '2026-03-28T12:00:00Z',
      source_path: '/music/minimal.mp3',
      source_content_hash: 'xyz789',
      source_duration_secs: 180.0,
      source_sample_rate: 44100,
      job_id: 'job-min',
    };

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_stem_provenance') return minimalProvenance;
      if (cmd === 'verify_stem_integrity') return true;
      if (cmd === 'read_stem_notes') return null;
      return null;
    });

    render(<StemInfoPanel stemPath="/music/minimal.stem.mp4" />);

    await waitFor(() => {
      expect(screen.getByText('Stem Information')).toBeInTheDocument();
    });

    // Required fields visible
    expect(screen.getByText('htdemucs')).toBeInTheDocument();
    expect(screen.getByText('job-min')).toBeInTheDocument();

    // Optional fields should not be present
    expect(screen.queryByText('Version')).not.toBeInTheDocument();
    expect(screen.queryByText('stemgen Version')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality Preset')).not.toBeInTheDocument();
    expect(screen.queryByText('Batch ID')).not.toBeInTheDocument();
  });
});
