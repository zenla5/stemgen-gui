import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';

export function useHealthCheck() {
  const { 
    checkDependencies, 
    dependenciesChecked,
    checkSidecarHealth,
    sidecarHealth,
    validateEnvironment,
    environmentValidation,
    refreshDownloadedModels,
  } = useAppStore();

  // Refresh the downloaded-models list exactly once, when the sidecar first
  // becomes available, so the footer "Models" indicator reflects the real
  // backend state (HF cache + app models dir) rather than a possibly stale
  // persisted list. Subsequent refreshes are driven by the UnifiedModelSection
  // after download/delete.
  const modelsRefreshed = useRef(false);

  useEffect(() => {
    // Check basic dependencies if not done
    if (!dependenciesChecked) {
      checkDependencies();
    }
    
    // Check sidecar health (Phase 3)
    if (!sidecarHealth) {
      checkSidecarHealth();
    }
    
    // Full environment validation on first load
    if (sidecarHealth && !environmentValidation) {
      validateEnvironment();
    }

    // Refresh the set of locally downloaded models once the sidecar is
    // available (guarded so it only runs once per mount).
    if (sidecarHealth && !modelsRefreshed.current) {
      modelsRefreshed.current = true;
      refreshDownloadedModels();
    }
  }, [dependenciesChecked, checkDependencies, sidecarHealth, checkSidecarHealth, environmentValidation, validateEnvironment, refreshDownloadedModels]);
}