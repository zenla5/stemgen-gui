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
      include: [
        // Only measure coverage on source files, not tests
        'src/lib/constants.ts',
        'src/lib/utils.ts',
        'src/lib/plugin.ts',
        'src/lib/remote.ts',
      ],
      exclude: [
        'node_modules/**',
        'src/vitest-setup.ts',
        // Config files
        '*.config.*',
        '*.d.ts',
        // Exclude test files from coverage
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
      thresholds: {
        // Lines and statements are low because constants.ts is mostly
        // type declarations (not executable code). Focus on functions
        // and branches which show true test coverage of runtime logic.
        lines: 45,
        functions: 85,
        branches: 85,
        statements: 45,
      },
    },
  },
});
