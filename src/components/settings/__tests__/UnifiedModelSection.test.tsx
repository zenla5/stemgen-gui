import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedModelSection } from '../UnifiedModelSection';

// ─── Mock Tauri APIs ───────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn());
const mockSetDownloadedModels = vi.hoisted(() => vi.fn());
const mockAddDownloadedModel = vi.hoisted(() => vi.fn());
const mockRemoveDownloadedModel = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

// ─── Mock Zustand store ────────────────────────────────────────────────────────

vi.mock('@/stores/appStore', () => {
  const storeState = {
    setDownloadedModels: mockSetDownloadedModels,
    addDownloadedModel: mockAddDownloadedModel,
    removeDownloadedModel: mockRemoveDownloadedModel,
    environmentValidation: {
      sidecarScript: 'available',
    },
  };
  return {
    useAppStore: Object.assign(
      (selector?: (state: typeof storeState) => unknown) =>
        selector ? selector(storeState) : storeState,
      {
        getState: () => storeState,
      }
    ),
    useDownloadedModels: () => [],
  };
});

// ─── Mock lucide-react icons ───────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
  HardDrive: () => <span data-testid="icon-harddrive" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
}));

// ─── Mock ModelCard ────────────────────────────────────────────────────────────

vi.mock('../ModelCard', () => ({
  ModelCard: ({ model, isDownloaded, downloadError, onDownload, onDelete, onRetry }: {
    model: { id: string; name: string };
    isDownloaded: boolean;
    downloadError: string | null;
    onDownload: (id: string) => void;
    onDelete: (id: string) => void;
    onRetry: (id: string) => void;
  }) => (
    <div data-testid={`model-card-${model.id}`}>
      <span>{model.name}</span>
      <span data-testid={`downloaded-${model.id}`}>{isDownloaded ? 'downloaded' : 'not-downloaded'}</span>
      {downloadError && <span data-testid={`error-${model.id}`}>{downloadError}</span>}
      <button data-testid={`download-btn-${model.id}`} onClick={() => onDownload(model.id)}>Download</button>
      <button data-testid={`delete-btn-${model.id}`} onClick={() => onDelete(model.id)}>Delete</button>
      <button data-testid={`retry-btn-${model.id}`} onClick={() => onRetry(model.id)}>Retry</button>
    </div>
  ),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UnifiedModelSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListen.mockResolvedValue(vi.fn());
  });

  // ── Test 1: Loading spinner renders on mount ──

  it('renders loading spinner on mount', () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return new Promise(() => {}); // Never resolves to keep loading
      }
      return null;
    });

    render(<UnifiedModelSection />);

    expect(screen.getByText('AI Models')).toBeInTheDocument();
    // Spinner should be present
    expect(screen.getByTestId('models-loading-spinner')).toBeInTheDocument();
  });

  // ── Test 2: Loading spinner disappears after models load ──

  it('loading spinner disappears after models load', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        return [];
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      expect(screen.queryByTestId('models-loading-spinner')).not.toBeInTheDocument();
    });
  });

  // ── Test 3: Model cards render when get_models succeeds ──

  it('renders model cards when get_models succeeds', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
          { id: 'htdemucs', name: 'HTDemucs', description: 'Good all-around', quality: 'high', speed: 'slow', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        return [];
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      expect(screen.getByTestId('model-card-bs_roformer')).toBeInTheDocument();
      expect(screen.getByTestId('model-card-htdemucs')).toBeInTheDocument();
    });

    // Verify invoke was called exactly once for get_models (not re-firing on re-render)
    const getModelsCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'get_models');
    expect(getModelsCalls).toHaveLength(1);
  });

  // ── Test 4: Error banner renders when get_models throws ──

  it('renders error banner when get_models throws', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        throw new Error('Failed to fetch models');
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      expect(screen.getByTestId('models-load-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch models')).toBeInTheDocument();
    });

    // Loading spinner should be gone
    expect(screen.queryByTestId('models-loading-spinner')).not.toBeInTheDocument();
  });

  // ── Test 5: Warning banner renders when list_downloaded_models throws ──

  it('renders warning banner when list_downloaded_models throws', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        throw new Error('Python not available');
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      // Model cards should still be rendered
      expect(screen.getByTestId('model-card-bs_roformer')).toBeInTheDocument();
      // Warning banner should be visible
      expect(screen.getByTestId('models-list-warning')).toBeInTheDocument();
    });

    // Error banner should NOT be visible (only warning)
    expect(screen.queryByTestId('models-load-error')).not.toBeInTheDocument();
  });

  // ── Test 6: Retry button calls loadModels again ──

  it('Retry button calls loadModels again', async () => {
    let callCount = 0;
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        callCount++;
        if (callCount === 1) {
          throw new Error('Failed to fetch models');
        }
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        return [];
      }
      return null;
    });

    render(<UnifiedModelSection />);

    // Wait for error banner
    await waitFor(() => {
      expect(screen.getByTestId('models-load-error')).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByText('Retry'));

    // Wait for models to load on second attempt
    await waitFor(() => {
      expect(screen.getByTestId('model-card-bs_roformer')).toBeInTheDocument();
    });

    // Error banner should be gone
    expect(screen.queryByTestId('models-load-error')).not.toBeInTheDocument();
  });

  // ── Test 7: Download button triggers download_model invoke ──

  it('Download button triggers download_model invoke', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        return [];
      }
      if (cmd === 'download_model') {
        return null;
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      expect(screen.getByTestId('model-card-bs_roformer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('download-btn-bs_roformer'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('download_model', { modelId: 'bs_roformer' });
    });
  });

  // ── Test 8: Sidecar missing guard shows error on download ──

  it('shows sidecar error when sidecar is missing on download', async () => {
    // Override the mock to return missing sidecar
    const { useAppStore } = await import('@/stores/appStore');
    (useAppStore as unknown as { getState: () => Record<string, unknown> }).getState = vi.fn(() => ({
      setDownloadedModels: mockSetDownloadedModels,
      environmentValidation: {
        sidecarScript: { missing: 'Sidecar not found' },
      },
    }));

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_models') {
        return [
          { id: 'bs_roformer', name: 'BS-RoFormer', description: 'High quality', quality: 'high', speed: 'medium', gpuRequired: true },
        ];
      }
      if (cmd === 'list_downloaded_models') {
        return [];
      }
      return null;
    });

    render(<UnifiedModelSection />);

    await waitFor(() => {
      expect(screen.getByTestId('model-card-bs_roformer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('download-btn-bs_roformer'));

    // Should NOT call download_model
    expect(mockInvoke).not.toHaveBeenCalledWith('download_model', { modelId: 'bs_roformer' });

    // Should show error on the model card
    await waitFor(() => {
      expect(screen.getByTestId('error-bs_roformer')).toBeInTheDocument();
    });
  });
});