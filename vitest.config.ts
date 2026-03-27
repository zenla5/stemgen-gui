/// <reference types="vitest/globals" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
        'node_modules/',
        'src/vitest-setup.ts',
        'src/__tests__/e2e/**',
        'src/__tests__/integration/**',
        '*.config.*',
        '*.d.ts',
        // Entry points — no testable logic
        'src/main.tsx',
        'src/App.tsx',
        // Type-only files — zero runtime code
        'src/lib/types.ts',
        // i18n bootstrapping — config only
        'src/i18n/index.ts',
        // UI primitives — thin wrappers, tested via parent component
        'src/components/ui/**',
        // Audio visualization — wavesurfer.js DOM dependency
        'src/components/audio/**',
        // History barrel — re-exports only
        'src/components/history/index.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
