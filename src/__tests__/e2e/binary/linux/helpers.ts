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
 * register their interceptors on `window.__mockRegistry`. The shim checks the
 * registry before forwarding to the original invoke, so multiple mock calls
 * coexist without overwriting each other.
 */
/**
 * Write a diagnostic line to a persistent log file on disk.
 * This survives across browser.execute() calls and is uploaded as CI artifact.
 */
function diagLog(message: string): void {
  try {
    const logPath = path.join(PROJECT_ROOT, 'test-results', 'mock-diag.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* best effort */ }
}

async function ensureMockProxy(): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await browser.execute(() => {
      try {
        const w = window as any;
        if (!w.__TAURI_INTERNALS__?.invoke) {
          return { ok: false, reason: 'no __TAURI_INTERNALS__.invoke' };
        }
        if (w.__mockProxyInstalled) return { ok: true };

        const origInternals = w.__TAURI_INTERNALS__;
        const origInvoke = origInternals.invoke;
        if (typeof origInvoke !== 'function') {
          return { ok: false, reason: 'invoke is not a function: ' + typeof origInvoke };
        }

        // Diagnostic info
        const isExt = Object.isExtensible(origInternals);
        const isFrozen = Object.isFrozen(origInternals);
        const desc = Object.getOwnPropertyDescriptor(origInternals, 'invoke');
        const diag = `ext=${isExt},frozen=${isFrozen},invoke:writable=${desc?.writable},configurable=${desc?.configurable}`;

        w.__mockRegistry = w.__mockRegistry || {};
        w.__mockFlags = w.__mockFlags || {};

        function mockInvoke(cmd: string, args?: Record<string, unknown>) {
          if (w.__mockFlags[cmd] !== undefined) w.__mockFlags[cmd] = true;
          if (w.__mockRegistry[cmd] !== undefined) return Promise.resolve(w.__mockRegistry[cmd]);
          return origInvoke.call(origInternals, cmd, args);
        }

        let e1msg = '';
        // Strategy 1: Direct assignment (may silently fail on non-writable properties)
        try {
          origInternals.invoke = mockInvoke;
          if (origInternals.invoke === mockInvoke) {
            w.__mockProxyInstalled = true;
            return { ok: true, method: 'direct', diag };
          }
          // Assignment silently failed (non-writable property in non-strict mode)
          e1msg = 'silent fail (writable=false)';
        } catch (e1: any) {
          e1msg = e1?.message || String(e1);
        }

        // Strategy 2: Object.defineProperty (matching existing descriptor)
        let e2msg = '';
        try {
          Object.defineProperty(origInternals, 'invoke', {
            value: mockInvoke,
            writable: !!desc?.writable,
            configurable: !!desc?.configurable,
            enumerable: !!desc?.enumerable,
          });
          w.__mockProxyInstalled = true;
          return { ok: true, method: 'defineProp', diag };
        } catch (e2: any) {
          e2msg = e2?.message || String(e2);
        }

        // Strategy 3: Delete and re-add
        try {
          delete origInternals.invoke;
          origInternals.invoke = mockInvoke;
          w.__mockProxyInstalled = true;
          return { ok: true, method: 'delete+assign', diag };
        } catch (e3: any) {
          return {
            ok: false,
            reason: `all failed [${diag}]: assign=${e1msg}, defProp=${e2msg}, delete=${e3?.message}`,
          };
        }
      } catch (innerErr: any) {
        return { ok: false, reason: 'inner: ' + (innerErr?.message || innerErr) };
      }
    });
  } catch (outerErr: any) {
    return { ok: false, reason: 'execute: ' + (outerErr?.message || outerErr) };
  }
}

/**
 * Patch validate_environment on the Tauri invoke bridge to return custom data.
 *
 * Uses a shared registry (installed by ensureMockProxy) so that multiple mock
 * calls and setCommandFlag calls coexist without overwriting each other.
 */
export async function mockValidateEnvironment(data: Record<string, unknown>): Promise<void> {
  const proxyResult = await ensureMockProxy();
  diagLog(`[mockValidateEnvironment] proxyResult: ${JSON.stringify(proxyResult)}`);
  if (!proxyResult.ok) {
    console.error(`[MOCK_FAIL] mockValidateEnvironment: ${proxyResult.reason}`);
    return;
  }
  diagLog(`[mockValidateEnvironment] proxy installed via ${JSON.stringify(proxyResult)}, applying mock`);
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
  if (!proxyResult.ok) {
    console.error(`[mockTauriCommand] FAILED for ${command}: ${proxyResult.reason}`);
    return;
  }
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
  if (!proxyResult.ok) {
    console.error(`[setCommandFlag] FAILED for ${command}: ${proxyResult.reason}`);
    return;
  }
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
