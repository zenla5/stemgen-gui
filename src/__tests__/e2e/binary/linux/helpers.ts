/**
 * Linux binary E2E test helpers for WebdriverIO + tauri-driver.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-export shared utilities
export {
  getBinaryPath,
  readBinaryState,
  CDP_PORT,
  STATE_FILE,
  FIXTURES_DIR,
  getFixturePath,
  mockAudioFile,
  waitForStemOutputs,
  type BinaryState,
} from '../helpers';

// Local import for diagnostic logging
import { PROJECT_ROOT } from '../helpers';

// Settings key for zustand persist
const SETTINGS_KEY = 'stemgen-settings-storage';

/**
 * Navigate to the app, skipping the first-run wizard by pre-injecting
 * localStorage before React loads.
 * Preserves the current theme setting across the reload.
 */
export async function navigateSkippingWizard(appUrl: string): Promise<void> {
  await browser.url(appUrl);
  // Read current theme from browser localStorage, then re-inject with hasSeenFirstRun=true
  await browser.execute((key: string) => {
    let theme = 'system';
    try {
      const raw = localStorage.getItem(key);
      if (raw) theme = JSON.parse(raw)?.state?.theme || 'system';
    } catch { /* ignore */ }
    localStorage.setItem(key, JSON.stringify({
      state: { hasSeenFirstRun: true, theme, language: 'en' },
      version: 0,
    }));
  }, SETTINGS_KEY);
  await browser.refresh();
  // Ensure viewport is large enough for element visibility in xvfb
  try { await browser.setWindowSize(1280, 720); } catch { /* tauri-driver may not support this */ }
  await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 15000 });
}

/**
 * Reset app state between tests.
 * Preserves the current theme so theme persistence tests work correctly.
 *
 * This is used in `afterEach` hooks, so it must be resilient under CI load:
 * - Dismiss any native file dialog that a previous test may have left open
 *   (e.g. after pressing Enter on the drop zone), otherwise WebDriver commands
 *   block indefinitely behind the modal.
 * - Retry the navigation + render wait, since a single page load can be slow
 *   or interrupted on a busy runner.
 */
export async function resetAppState(appUrl: string): Promise<void> {
  // Dismiss any potentially-open native dialog first.
  try { await browser.keys('Escape'); } catch { /* not currently focused */ }

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      await browser.execute(
        (key: string) => {
          // Preserve theme before clearing
          let theme = 'system';
          try {
            const raw = localStorage.getItem(key);
            if (raw) theme = JSON.parse(raw)?.state?.theme || 'system';
          } catch { /* ignore */ }

          localStorage.clear();
          localStorage.setItem(key, JSON.stringify({
            state: { hasSeenFirstRun: true, theme, language: 'en' },
            version: 0,
          }));
        },
        SETTINGS_KEY
      );

      await browser.url(appUrl);
      try { await browser.setWindowSize(1280, 720); } catch { /* tauri-driver may not support this */ }
      await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 5000 });
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await browser.pause(1000);
    }
  }
}

/**
 * Navigate to a specific view by clicking the sidebar nav button.
 */
export async function navigateToView(
  view: 'files' | 'queue' | 'mixer' | 'library' | 'settings'
): Promise<void> {
  await $(`[data-testid="nav-${view}"]`).click();
  await browser.pause(100);
}

/**
 * Wait until an element's width stabilizes across consecutive reads.
 *
 * WebdriverIO has no built-in "wait for a CSS transition to finish", so an
 * animated layout (e.g. the sidebar expand/collapse) must not be sampled at a
 * fixed instant — under CI load the width can be mid-animation. This polls the
 * element's width and treats it as settled once unchanged for `stableReads`
 * consecutive samples. Resolves with the final settled width.
 */
export async function waitForStableWidth(
  selector: string,
  opts: { timeoutMs?: number; intervalMs?: number; stableReads?: number } = {}
): Promise<number> {
  const { timeoutMs = 8000, intervalMs = 80, stableReads = 3 } = opts;
  const start = Date.now();
  let lastWidth: number | null = null;
  let stable = 0;

  while (Date.now() - start < timeoutMs) {
    const width = (await $(selector).getSize()).width;
    if (lastWidth !== null && width === lastWidth) {
      stable += 1;
    } else {
      stable = 0;
    }
    lastWidth = width;
    if (stable >= stableReads) return width;
    await browser.pause(intervalMs);
  }

  throw new Error(
    `Element "${selector}" width did not stabilize within ${timeoutMs}ms ` +
      `(last width: ${lastWidth ?? 'n/a'})`
  );
}

/**
 * Capture the most recent toast/notification message.
 */
export async function getToastMessage(): Promise<string | null> {
  const toast = $('[data-sonner-toaster] [data-title]');
  try {
    await toast.waitForDisplayed({ timeout: 5000 });
    return await toast.getText();
  } catch {
    return null;
  }
}

/**
 * Navigate to the app with the first-run wizard visible
 * (clears localStorage so the wizard triggers on load).
 *
 * NOTE: We navigate to appUrl first (not about:blank) because WebKit2GTK
 * blocks localStorage operations from cross-origin pages.
 */
export async function navigateWithWizard(appUrl: string): Promise<void> {
  await browser.url(appUrl);
  await browser.execute(() => localStorage.clear());
  await browser.refresh();
  await $('[data-testid="wizard-step"]').waitForDisplayed({ timeout: 15000 });
}

/**
 * Check if an element is displayed, returning false if it doesn't exist.
 */
export async function isDisplayedSafe(selector: string): Promise<boolean> {
  try {
    return await $(selector).isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Take a named screenshot.
 */
export async function takeScreenshot(label: string): Promise<void> {
  const sanitized = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(__dirname, '..', '..', '..', '..', 'test-results', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sanitized}.png`);
  await browser.saveScreenshot(filePath);
  console.log(`[screenshot] Saved: ${filePath}`);
}
