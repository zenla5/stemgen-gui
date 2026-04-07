/**
 * Binary E2E test helpers for Playwright CDP-based testing.
 * These helpers manage the Tauri binary lifecycle, CDP connection,
 * and app state manipulation for tests that drive the compiled binary.
 */

import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Project root (4 levels up from this file: binary/ -> e2e/ -> __tests__/ -> src/ -> root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// CDP port — configurable via env, defaults to 9515
export const CDP_PORT = parseInt(process.env.CDP_PORT || '9515', 10);
export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

// State file written by global-setup
export const STATE_FILE = path.join(PROJECT_ROOT, 'test-results', 'binary-state.json');

// Fixture paths
export const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'audio');

// Screenshots directory for E2E tests
export const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'test-results', 'screenshots');

/**
 * Take a named screenshot and save it to the test results directory.
 * Uses the label to construct a unique filename.
 */
export async function takeScreenshot(page: Page, label: string): Promise<void> {
  const sanitized = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = SCREENSHOTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sanitized}.png`);
  await page.screenshot({ path: filePath });
  console.log(`[screenshot] Saved: ${filePath}`);
}

/**
 * Resolve the platform-specific binary path.
 * Returns null if no binary is found.
 */
export function getBinaryPath(): string | null {
  // Workspace root target/ takes precedence over src-tauri/target/
  const candidates: Record<string, string[]> = {
    win32: [
      path.join('target', 'release', 'stemgen-gui.exe'),
      path.join('target', 'release', 'stemgen_gui.exe'),
      path.join('src-tauri', 'target', 'release', 'stemgen-gui.exe'),
      path.join('src-tauri', 'target', 'release', 'stemgen_gui.exe'),
    ],
    linux: [
      path.join('target', 'release', 'stemgen-gui'),
      path.join('target', 'release', 'stemgen_gui'),
      path.join('src-tauri', 'target', 'release', 'stemgen-gui'),
      path.join('src-tauri', 'target', 'release', 'stemgen_gui'),
    ],
    darwin: [
      path.join('target', 'release', 'bundle', 'macos', 'Stemgen GUI.app', 'Contents', 'MacOS', 'stemgen-gui'),
      path.join('target', 'release', 'stemgen-gui'),
      path.join('src-tauri', 'target', 'release', 'bundle', 'macos', 'Stemgen GUI.app', 'Contents', 'MacOS', 'stemgen-gui'),
      path.join('src-tauri', 'target', 'release', 'stemgen-gui'),
    ],
  };

  const platformCandidates = candidates[process.platform] || [];
  for (const rel of platformCandidates) {
    const abs = path.join(PROJECT_ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Interface for the state file written by global-setup.
 */
export interface BinaryState {
  available: boolean;
  reason?: string;
  wsUrl?: string;
  appUrl?: string;
  pid?: number;
}

/**
 * Read the binary state file. Returns null if file doesn't exist.
 */
export function readBinaryState(): BinaryState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Skip test if binary is not available. Call in beforeAll/beforeEach.
 */
export function skipIfNoBinary(): void {
  const state = readBinaryState();
  if (!state || !state.available) {
    // Playwright's test.skip() must be called within a test context
    // This function should be used with: test.skip(!state?.available, 'reason')
    return;
  }
}

/**
 * The zustand persist key for settings storage.
 */
const SETTINGS_KEY = 'stemgen-settings-storage';

/**
 * Build a valid zustand persist value with hasSeenFirstRun set to true.
 */
function buildSettingsStorage(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    state: {
      hasSeenFirstRun: true,
      theme: 'system',
      language: 'en',
      ...overrides,
    },
    version: 0,
  });
}

/**
 * Ensure the page viewport is large enough for Playwright visibility checks.
 * On CI, the WebView2 window may start at 0x0, causing all elements to report
 * as "hidden". This must be called AFTER every page.goto() and page.reload().
 */
export async function ensureViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  // Force html/body dimensions and visibility via DOM manipulation.
  // On Windows WebView2, the window may have 0x0 dimensions, making
  // Playwright report all elements as hidden.
  try {
    await page.evaluate(() => {
      document.documentElement.style.minHeight = '100vh';
      document.documentElement.style.minWidth = '100vw';
      document.documentElement.style.visibility = 'visible';
      document.documentElement.style.display = 'block';
      document.body.style.minHeight = '100vh';
      document.body.style.minWidth = '100vw';
      document.body.style.visibility = 'visible';
      document.body.style.display = 'block';
    });
  } catch { /* page may not be loaded yet */ }
}

/**
 * Wait for the nav-files element to appear, with a retry on failure.
 * On Windows CI, the WebView2 may need an extra reload to render properly.
 */
async function waitForNavFiles(page: Page): Promise<void> {
  const selector = '[data-testid="nav-files"]';
  try {
    await page.waitForSelector(selector, { timeout: 15000 });
  } catch {
    // First attempt failed — retry with a reload
    console.warn('[waitForNavFiles] nav-files not found after 15s, retrying with reload...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureViewport(page);
    await page.waitForSelector(selector, { timeout: 15000 });
  }
}

export async function navigateSkippingWizard(page: Page, appUrl: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      // Force body visibility immediately on page load (WebView2 0x0 fix)
      const style = document.createElement('style');
      style.textContent = 'html, body { min-height: 100vh !important; min-width: 100vw !important; visibility: visible !important; display: block !important; }';
      (document.head || document.documentElement).appendChild(style);
    },
    { key: SETTINGS_KEY, value: buildSettingsStorage() }
  );
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureViewport(page);
  await waitForNavFiles(page);
}

/**
 * Reset app state between tests. Clears localStorage, re-injects
 * hasSeenFirstRun, and navigates back to the app.
 */
export async function resetAppState(page: Page, appUrl: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.clear();
      localStorage.setItem(key, value);
      // Force body visibility immediately on page load (WebView2 0x0 fix)
      const style = document.createElement('style');
      style.textContent = 'html, body { min-height: 100vh !important; min-width: 100vw !important; visibility: visible !important; display: block !important; }';
      (document.head || document.documentElement).appendChild(style);
    },
    { key: SETTINGS_KEY, value: buildSettingsStorage() }
  );
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureViewport(page);
  await waitForNavFiles(page);
}

/**
 * Navigate to a specific view by clicking the sidebar nav button.
 */
export async function navigateToView(
  page: Page,
  view: 'files' | 'queue' | 'mixer' | 'settings'
): Promise<void> {
  await page.click(`[data-testid="nav-${view}"]`);
  // Wait a tick for React state update
  await page.waitForTimeout(100);
}

/**
 * Capture the most recent toast/notification message.
 * Uses sonner's data attributes.
 */
export async function getToastMessage(page: Page): Promise<string | null> {
  const toast = page.locator('[data-sonner-toaster] [data-title]').first();
  try {
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    return await toast.textContent();
  } catch {
    return null;
  }
}

/**
 * Wait for a queue item with the given filename to appear.
 */
export async function waitForQueueItem(
  page: Page,
  fileName: string,
  timeout = 10000
): Promise<void> {
  await page
    .locator('[data-testid="job-item"]')
    .filter({ hasText: fileName })
    .waitFor({ state: 'visible', timeout });
}

/**
 * Wait for stem output files to appear on disk.
 * Polls the output directory until expected files exist or timeout.
 */
export async function waitForStemOutputs(
  outputDir: string,
  baseFileName: string,
  timeoutMs = 120000
): Promise<string[]> {
  const startTime = Date.now();
  const expectedExtensions = ['.stem.mp4'];

  while (Date.now() - startTime < timeoutMs) {
    const found: string[] = [];
    for (const ext of expectedExtensions) {
      const filePath = path.join(outputDir, `${baseFileName}${ext}`);
      if (fs.existsSync(filePath)) {
        found.push(filePath);
      }
    }
    if (found.length > 0) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    `Timed out waiting for stem outputs in ${outputDir} after ${timeoutMs}ms`
  );
}

/**
 * Get fixture file path by name.
 */
export function getFixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

/**
 * Mock audio file metadata for store injection tests.
 * This mimics the AudioFileMetadata type returned by get_audio_info.
 */
export function mockAudioFile(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    path: getFixturePath('test-short.wav'),
    name: 'test-short',
    format: 'wav',
    duration: 2.0,
    sample_rate: 44100,
    channels: 1,
    bit_depth: 16,
    size: 176478,
    ...overrides,
  };
}
