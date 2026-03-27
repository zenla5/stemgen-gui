import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export function useHealthCheck() {
  const { 
    checkDependencies, 
    dependenciesChecked,
    checkSidecarHealth,
    sidecarHealth,
    validateEnvironment,
    environmentValidation,
  } = useAppStore();

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
  }, [dependenciesChecked, checkDependencies, sidecarHealth, checkSidecarHealth, environmentValidation, validateEnvironment]);
}
