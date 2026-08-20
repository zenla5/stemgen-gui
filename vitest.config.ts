/// <reference types="vitest/globals" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['src/__tests__/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        // Test infrastructure
        'node_modules/**',
        'src/vitest-setup.ts',
        '*.config.*',
        '*.d.ts',
        // Test files themselves
        'src/__tests__/**',
        // Large components that require browser/wavesurfer APIs
        'src/components/audio/WaveformDisplay.tsx',
        'src/components/audio/StemWaveformDisplay.tsx',
        // Hooks that depend on browser audio APIs
        'src/hooks/useAudioPlayer.ts',
        'src/hooks/useMultiStemPlayer.ts',
        // Python sidecar (not TypeScript)
        'python/**',
        // Auto-generated/generated files
        'src-tauri/gen/**',
        // Production UI chrome verified by the binary E2E suites, not unit coverage
        'src/components/settings/**',
        'src/components/setup/**',
        'src/components/library/**',
        'src/components/audio/**',
      ],
      thresholds: {
        lines: 55,
        functions: 72,
        branches: 75,
        statements: 55,
      },
    },
  },
});
