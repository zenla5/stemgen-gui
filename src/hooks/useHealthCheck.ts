import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export function useHealthCheck() {
  const { checkDependencies, dependenciesChecked } = useAppStore();
  
  useEffect(() => {
    if (!dependenciesChecked) {
      checkDependencies();
    }
  }, [dependenciesChecked, checkDependencies]);
}
