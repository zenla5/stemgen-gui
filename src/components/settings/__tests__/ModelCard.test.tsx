import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelCard, type ModelCardData } from '../ModelCard';
import { useSettingsStore } from '@/stores/settingsStore';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

const MODEL: ModelCardData = {
  id: 'demucs',
  name: 'Demucs',
  description: 'Medium quality, faster.',
  quality: 'medium',
  speed: 'fast',
  gpu_required: false,
  size_mb: 830,
};

const GPU_MODEL: ModelCardData = {
  ...MODEL,
  id: 'htdemucs',
  name: 'HTDemucs',
  gpu_required: true,
  quality: 'high',
  speed: 'slow',
};

const HIGHEST_MODEL: ModelCardData = {
  ...MODEL,
  id: 'htdemucs_ft',
  quality: 'highest',
  speed: 'very_slow',
};

function resetStore() {
  useSettingsStore.setState({ defaultModel: 'demucs' });
}

describe('ModelCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(null);
    resetStore();
  });

  it('renders the checking skeleton when status is checking', () => {
    render(
      <ModelCard
        model={MODEL}
        status="checking"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('model-card-demucs')).toBeInTheDocument();
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('renders model name, description, quality and speed labels', () => {
    render(
      <ModelCard
        model={MODEL}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('Demucs')).toBeInTheDocument();
    expect(screen.getByText('Medium quality, faster.')).toBeInTheDocument();
    expect(screen.getByText('Medium quality')).toBeInTheDocument();
    expect(screen.getByText('Fast')).toBeInTheDocument();
    expect(screen.getByText('~830 MB')).toBeInTheDocument();
  });

  it('omits size when not provided', () => {
    const model: ModelCardData = { ...MODEL, size_mb: undefined };
    render(
      <ModelCard
        model={model}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.queryByText(/MB/)).not.toBeInTheDocument();
  });

  it('shows a Download button when not downloaded and not downloading', () => {
    const onDownload = vi.fn();
    render(
      <ModelCard
        model={MODEL}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={onDownload}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('download-btn-demucs'));
    expect(onDownload).toHaveBeenCalledWith('demucs');
  });

  it('renders Select and Delete buttons when downloaded but not selected', () => {
    const onDelete = vi.fn();
    const model: ModelCardData = { ...MODEL, id: 'htdemucs' };
    render(
      <ModelCard
        model={model}
        status="available"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={onDelete}
        onRetry={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('select-model-htdemucs'));
    expect(useSettingsStore.getState().defaultModel).toBe('htdemucs');

    fireEvent.click(screen.getByTestId('delete-model-htdemucs'));
    expect(onDelete).toHaveBeenCalledWith('htdemucs');

    expect(screen.queryByTestId('download-btn-htdemucs')).not.toBeInTheDocument();
  });

  it('does not render Select when already selected', () => {
    useSettingsStore.setState({ defaultModel: 'demucs' });
    render(
      <ModelCard
        model={MODEL}
        status="available"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('model-selected-badge-demucs')).toBeInTheDocument();
    expect(screen.queryByTestId('select-model-demucs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-model-demucs')).toBeInTheDocument();
  });

  it('does not allow selecting a model that is not downloaded', () => {
    useSettingsStore.setState({ defaultModel: 'bs_roformer' });
    render(
      <ModelCard
        model={{ ...MODEL, id: 'bs_roformer' } as ModelCardData}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.queryByTestId('model-selected-badge-bs_roformer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-model-bs_roformer')).not.toBeInTheDocument();
  });

  it('renders GPU badge and CPU icon when gpu is required', () => {
    render(
      <ModelCard
        model={GPU_MODEL}
        status="gpu-warning"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('GPU Required')).toBeInTheDocument();
  });

  it('shows the BS-RoFormer warning only when selected and downloaded', () => {
    useSettingsStore.setState({ defaultModel: 'bs_roformer' });
    render(
      <ModelCard
        model={{ ...MODEL, id: 'bs_roformer' } as ModelCardData}
        status="available"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('bs-roformer-warning')).toBeInTheDocument();
  });

  it('renders download progress and cancel while downloading', () => {
    render(
      <ModelCard
        model={MODEL}
        status="unavailable"
        isDownloading
        downloadProgress={42}
        downloadError={null}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('progress-bar-demucs')).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancel-download-demucs'));
    expect(mockInvoke).toHaveBeenCalledWith('cancel_download', { modelId: 'demucs' });
  });

  it('renders the download error and calls retry', () => {
    const onRetry = vi.fn();
    render(
      <ModelCard
        model={MODEL}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError="Disk full"
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Disk full')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('retry-download-demucs'));
    expect(onRetry).toHaveBeenCalledWith('demucs');
  });

  it('maps quality and speed labels across all branches', () => {
    const onDownload = vi.fn();
    render(
      <ModelCard
        model={HIGHEST_MODEL}
        status="unavailable"
        isDownloading={false}
        downloadProgress={0}
        downloadError={null}
        onDownload={onDownload}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('Highest quality')).toBeInTheDocument();
    expect(screen.getByText('Very Slow')).toBeInTheDocument();
  });
});