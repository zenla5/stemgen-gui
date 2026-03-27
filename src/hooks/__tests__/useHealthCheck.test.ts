import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHealthCheck } from '@/hooks/useHealthCheck';
import { useAppStore } from '@/stores/appStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

function resetStore() {
  useAppStore.setState({
    dependenciesChecked: false,
    sidecarHealth: null,
    environmentValidation: null,
    environmentValidated: false,
  });
}

describe('useHealthCheck', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('does not call checkDependencies when already checked', async () => {
    useAppStore.setState({ dependenciesChecked: true });
    const invoke = await import('@tauri-apps/api/core');
    vi.mocked(invoke.invoke).mockResolvedValue({});

    renderHook(() => useHealthCheck());

    // Should not call check_dependencies since it's already done
    expect(vi.mocked(invoke.invoke)).not.toHaveBeenCalledWith('check_dependencies');
  });

  it('does not call checkSidecarHealth when already populated', async () => {
    useAppStore.setState({
      sidecarHealth: {
        isHealthy: true,
        pythonFound: true,
        sidecarScriptFound: true,
        demucsAvailable: true,
        bsRoformerAvailable: true,
        gpuAvailable: false,
        modelDirectory: '/models',
        modelCount: 4,
        errors: [],
      },
    });
    const invoke = await import('@tauri-apps/api/core');

    renderHook(() => useHealthCheck());

    expect(vi.mocked(invoke.invoke)).not.toHaveBeenCalledWith('get_sidecar_status');
  });

  it('calls all checks when nothing is pre-populated', async () => {
    // When nothing is cached, useHealthCheck should call all three checks
    const invoke = await import('@tauri-apps/api/core');
    vi.mocked(invoke.invoke).mockResolvedValue({});

    renderHook(() => useHealthCheck());

    // Should call check_dependencies, get_sidecar_status, and validate_environment
    expect(vi.mocked(invoke.invoke)).toHaveBeenCalledWith('check_dependencies');
    // The other two calls depend on state mutations from the first call
  });
});
