import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProcessingHistory } from '../ProcessingHistory';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessingHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component without crashing', async () => {
    mockInvoke.mockResolvedValue([]);

    render(<ProcessingHistory />);

    // Component should render something (either list or empty state)
    await waitFor(() => {
      // Should show either the empty state or the history heading
      const hasEmptyState = screen.queryByText('No processing history');
      const hasHeading = screen.queryByText('Processing History');
      expect(hasEmptyState || hasHeading).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders history entries when data is returned', async () => {
    mockInvoke.mockResolvedValue([
      {
        id: 'test-id-1',
        source_path: '/test/input.mp3',
        output_path: '/test/input.stem.mp4',
        model: 'bs_roformer',
        dj_preset: 'traktor',
        processed_at: '2026-03-28T00:00:00Z',
        duration_ms: 120000,
        file_size: 5000000,
        metadata: {},
      },
    ]);

    render(<ProcessingHistory />);

    await waitFor(() => {
      // Should render the input filename
      expect(screen.getByText('input.mp3')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
