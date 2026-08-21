import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InferenceSection } from '../InferenceSection';
import { useSettingsStore } from '@/stores/settingsStore';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

function resetStore() {
  useSettingsStore.setState({
    activeProvider: 'local',
    falConfigured: false,
    replicateConfigured: false,
    privacyNoticeShown: false,
    replicateVersionHash: null,
    batchParallel: false,
    defaultModel: 'demucs',
    setActiveProvider: vi.fn(async (p) => {
      useSettingsStore.setState({ activeProvider: p });
    }) as never,
    setBatchParallel: vi.fn((v) => useSettingsStore.setState({ batchParallel: v })),
    setReplicateVersionHash: vi.fn((h) => useSettingsStore.setState({ replicateVersionHash: h })),
    markPrivacyNoticeShown: vi.fn(),
  });
}

describe('InferenceSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all three provider radios', () => {
    render(<InferenceSection />);
    expect(screen.getByDisplayValue('local')).toBeInTheDocument();
    expect(screen.getByDisplayValue('fal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('replicate')).toBeInTheDocument();
  });

  it('renders not-configured badges for unconfigured cloud providers', () => {
    render(<InferenceSection />);
    expect(screen.getAllByText('Not configured').length).toBeGreaterThanOrEqual(2);
  });

  it('hides the API key input when local is active', () => {
    render(<InferenceSection />);
    expect(screen.queryByPlaceholderText('••••••••••••')).not.toBeInTheDocument();
  });

  it('shows the API key input when a cloud provider is active', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    render(<InferenceSection />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    });
  });

  it('switches provider when a radio is selected', async () => {
    render(<InferenceSection />);
    fireEvent.click(screen.getByDisplayValue('replicate'));

    await waitFor(() => {
      expect(useSettingsStore.getState().activeProvider).toBe('replicate');
    });
  });

  it('saves the API key when clicking Save with a filled input', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockResolvedValue(null);
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'sk-123' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_provider_api_key', {
        provider: 'fal',
        key: 'sk-123',
      });
    });
  });

it('clears the API key when clicking Clear', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockResolvedValue(null);
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'inference.clearKey' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('clear_provider_api_key', { provider: 'fal' });
    });
  });

  it('shows success after testing the connection', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'test_provider_connection') return { ok: true };
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'inference.testConnection' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'inference.testConnection' }));

    await waitFor(() => {
      expect(screen.getByText('inference.connectionOk')).toBeInTheDocument();
    });
  });

  it('shows failure result when connection test returns ok:false', async () => {
    useSettingsStore.setState({ activeProvider: 'replicate' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'test_provider_connection') {
        return { ok: false, error: 'Bad key' };
      }
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'inference.testConnection' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'inference.testConnection' }));

    await waitFor(() => {
      expect(screen.getByText('inference.connectionFailed')).toBeInTheDocument();
      expect(screen.getByText(/Bad key/)).toBeInTheDocument();
    });
  });

  it('shows failure when connection test throws', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'test_provider_connection') throw new Error('timeout');
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'inference.testConnection' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'inference.testConnection' }));

    await waitFor(() => {
      expect(screen.getByText('inference.connectionFailed')).toBeInTheDocument();
    });
  });

  it('renders replicate version options when versions are fetched', async () => {
    useSettingsStore.setState({ activeProvider: 'replicate' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_provider_api_key') return 'sk-key';
      if (cmd === 'fetch_replicate_versions') {
        return [
          { id: 'aaaaaaaa', created_at: '2024-01-01', is_latest: true },
          { id: 'bbbbbbbb', created_at: '2023-01-01', is_latest: false },
        ];
      }
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.queryByText(/\(latest\)/)).toBeInTheDocument();
    });
  });

  it('shows an error when the replicate API key is missing', async () => {
    useSettingsStore.setState({ activeProvider: 'replicate' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_provider_api_key') return null;
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByText('No API key configured')).toBeInTheDocument();
    });
  });

  it('shows an error when fetching versions throws', async () => {
    useSettingsStore.setState({ activeProvider: 'replicate' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_provider_api_key') return 'sk-key';
      if (cmd === 'fetch_replicate_versions') throw new Error('backend down');
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByText(/backend down/)).toBeInTheDocument();
    });
  });

  it('selecting a version updates the replicate version hash', async () => {
    useSettingsStore.setState({ activeProvider: 'replicate' });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_provider_api_key') return 'sk-key';
      if (cmd === 'fetch_replicate_versions') {
        return [{ id: 'aaaaaaaa', created_at: '2024-01-01', is_latest: true }];
      }
      return null;
    });
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByText(/\(latest\)/)).toBeInTheDocument();
    });

    const select = globalThis.document.querySelector('select');
    expect(select).not.toBeNull();
    fireEvent.change(select as HTMLSelectElement, { target: { value: 'aaaaaaaa' } });

    await waitFor(() => {
      expect(useSettingsStore.getState().replicateVersionHash).toBe('aaaaaaaa');
    });
  });

  it('shows the cost estimate for a cloud provider', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockResolvedValue(null);
    render(<InferenceSection />);
    await waitFor(() => {
      expect(screen.getByText(/inference.costEstimate/)).toBeInTheDocument();
    });
  });

  it('toggles batch mode between sequential and parallel', async () => {
    useSettingsStore.setState({ activeProvider: 'fal' });
    mockInvoke.mockResolvedValue(null);
    render(<InferenceSection />);

    await waitFor(() => {
      expect(screen.getByText('inference.batchMode.label')).toBeInTheDocument();
    });

    const radios = Array.from(
      globalThis.document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="batch-mode"]')
    );
    expect(radios).toHaveLength(2);

    fireEvent.click(radios[1]);
    await waitFor(() => {
      expect(useSettingsStore.getState().batchParallel).toBe(true);
    });

    fireEvent.click(radios[0]);
    await waitFor(() => {
      expect(useSettingsStore.getState().batchParallel).toBe(false);
    });
  });
});
