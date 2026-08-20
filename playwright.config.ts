import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000, // Increase global timeout
  expect: {
    timeout: 10000, // Increase expect timeout
  },
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  globalSetup: './src/__tests__/e2e/binary/setup-wrapper.ts',
  globalTeardown: './src/__tests__/e2e/binary/teardown-wrapper.ts',
  projects: [
    {
      // Dev-server project: tests against Vite dev server (fast, no binary needed)
      name: 'chromium',
      testIgnore: '**/binary/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Windows binary smoke: the compiled-binary Playwright suite, reduced to a
      // small representative set. WebView2 is too slow on CI for the full suite
      // to finish within a job timeout, so Windows runs this; Linux runs the full
      // suite via WebdriverIO (see wdio.conf.ts). Uses ../test-fixtures + helpers.
      name: 'binary-smoke',
      testDir: './src/__tests__/e2e/binary/windows',
      fullyParallel: false,
      timeout: 120000,
      expect: { timeout: 15000 },
      retries: 0,
      outputDir: './test-results/binary-screenshots',
      use: {
        trace: 'on-first-retry',
        screenshot: 'on',
      },
    },
  ],
  // Skip webServer for binary-only runs — the Tauri binary serves its own app
  webServer: process.argv.some((a) => a.startsWith('--project=binary'))
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:1420',
        reuseExistingServer: true,
        timeout: 180 * 1000, // 3 minutes to start
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
