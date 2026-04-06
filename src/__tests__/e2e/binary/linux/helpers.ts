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
  PROJECT_ROOT,
  CDP_PORT,
  STATE_FILE,
  FIXTURES_DIR,
  getFixturePath,
  mockAudioFile,
  waitForStemOutputs,
  type BinaryState,
} from '../helpers';

// Settings key for zustand persist
const SETTINGS_KEY = 'stemgen-settings-storage';

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
  await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 15000 });
}

/**
 * Reset app state between tests.
 * Preserves the current theme so theme persistence tests work correctly.
 */
export async function resetAppState(appUrl: string): Promise<void> {
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
  await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 15000 });
}

/**
 * Navigate to a specific view by clicking the sidebar nav button.
 */
export async function navigateToView(
  view: 'files' | 'queue' | 'mixer' | 'settings'
): Promise<void> {
  await $(`[data-testid="nav-${view}"]`).click();
  await browser.pause(100);
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
 * Ensure the Tauri invoke bridge has a shared mock shim installed.
 *
 * All mock helpers (mockValidateEnvironment, mockTauriCommand, setCommandFlag)
 * register their interceptors on `window.__mockRegistry`. A cloned
 * __TAURI_INTERNALS__ object checks the registry before forwarding to the
 * original invoke. This avoids the Proxy-chaining problem where each helper
 * replaced the previous Proxy and lost earlier mocks.
 */
async function ensureMockProxy(): Promise<{ ok: boolean; reason?: string }> {
  return browser.execute(() => {
    const w = window as any;
    if (!w.__TAURI_INTERNALS__?.invoke) {
      return { ok: false, reason: 'no __TAURI_INTERNALS__.invoke' };
    }
    // Already installed — nothing to do
    if (w.__mockProxyInstalled) return { ok: true };

    const origInternals = w.__TAURI_INTERNALS__;
    const origInvoke = origInternals.invoke;
    w.__mockRegistry = w.__mockRegistry || {};
    w.__mockFlags = w.__mockFlags || {};

    // Clone the internals object and replace invoke directly.
    // This avoids Proxy compatibility issues on WebKit2GTK where the
    // get trap may not fire for __TAURI_INTERNALS__ property access.
    const newInternals = Object.create(Object.getPrototypeOf(origInternals));
    Object.defineProperties(newInternals, Object.getOwnPropertyDescriptors(origInternals));

    newInternals.invoke = function(cmd: string, args?: Record<string, unknown>) {
      // Flag tracking
      if (w.__mockFlags[cmd] !== undefined) {
        w.__mockFlags[cmd] = true;
      }
      // Command mock
      if (w.__mockRegistry[cmd] !== undefined) {
        return Promise.resolve(w.__mockRegistry[cmd]);
      }
      return origInvoke.call(origInternals, cmd, args);
    };

    Object.defineProperty(w, '__TAURI_INTERNALS__', {
      value: newInternals,
      writable: true,
      configurable: true,
    });
    w.__mockProxyInstalled = true;
    return { ok: true };
  });
}

/**
 * Patch validate_environment on the Tauri invoke bridge to return custom data.
 *
 * Uses a shared Proxy + registry (installed by ensureMockProxy) so that
 * multiple mock calls and setCommandFlag calls coexist without overwriting
 * each other.
 */
export async function mockValidateEnvironment(data: Record<string, unknown>): Promise<void> {
  const proxyResult = await ensureMockProxy();
  if (!proxyResult.ok) {
    console.warn(`[mockValidateEnvironment] skipped: ${proxyResult.reason}`);
    return;
  }
  await browser.execute((mockData: Record<string, unknown>) => {
    (window as any).__mockRegistry['validate_environment'] = mockData;
  }, data);
}

/**
 * Patch a specific Tauri command to return a custom result.
 * Useful for mocking install_dependency, deploy_sidecar, etc.
 */
export async function mockTauriCommand(
  command: string,
  mockResult: unknown
): Promise<void> {
  const proxyResult = await ensureMockProxy();
  if (!proxyResult.ok) return;
  await browser.execute(
    (cmd: string, result: unknown) => {
      (window as any).__mockRegistry[cmd] = result;
    },
    command,
    mockResult
  );
}

/**
 * Set a flag on window when a specific Tauri command is invoked.
 * Use with getCommandFlag() instead of page.exposeFunction() (not available in WebdriverIO).
 */
export async function setCommandFlag(command: string): Promise<void> {
  const proxyResult = await ensureMockProxy();
  if (!proxyResult.ok) return;
  await browser.execute((cmd: string) => {
    (window as any).__mockFlags[cmd] = false;
  }, command);
}

/**
 * Read back a command invocation flag set by setCommandFlag.
 */
export async function getCommandFlag(command: string): Promise<boolean> {
  return browser.execute((cmd: string) => {
    return (window as any).__mockFlags?.[cmd] === true;
  }, command);
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
