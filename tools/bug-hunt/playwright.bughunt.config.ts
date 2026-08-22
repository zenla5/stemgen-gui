/**
 * Playwright config override used by the bug-hunt harness.
 *
 * On NixOS the bundled Playwright chromium binary cannot run ("NixOS cannot run
 * dynamically linked executables..."). This config runs the repo's E2E suite
 * (same testDir, timeouts, webServer) but launches the system Chromium via the
 * `chromium` channel, which works. Test/QA tooling only — it does not modify
 * app code or the repo's canonical playwright.config.ts.
 */
import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');

// Prefer the NixOS system Chromium when present — the bundled Playwright
// binaries cannot run on NixOS ("NixOS cannot run dynamically linked
// executables..."). launchOptions.executablePath (not use.executablePath) is
// what Playwright's test runner honors for the browser binary on NixOS.
const CHROMIUM_PATH = '/run/current-system/sw/bin/chromium';
const sysChromium = existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: resolve(ROOT, 'src/__tests__/e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: false,
    launchOptions: sysChromium,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/binary/**',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: sysChromium,
      },
    },
  ],
});
