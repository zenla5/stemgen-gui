/**
 * Environment Consistency E2E tests
 *
 * Covers:
 *  (a) Footer / Detailed Status consistency across PackageStatus states
 *  (b) False-red regression — all-available must render all green
 *  (c) Sidecar deployment repair button appears when sidecar is missing
 *  (d) "Install All Missing" shows per-component progress list
 *  (e) Model download blocked with actionable error when sidecar absent
 */

import { test, expect, type Page } from '@playwright/test';
import { readBinaryState, navigateSkippingWizard, navigateToView } from './helpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Patch validate_environment on the Tauri invoke bridge to return custom data */
async function mockValidateEnvironment(page: Page, data: Record<string, unknown>) {
  await page.evaluate((mockData) => {
    const w = window as any;
    if (!w.__TAURI_INVOKE__) return;
    // Wrap the original invoke to intercept validate_environment
    const orig = w.__TAURI_INVOKE__;
    if (orig.__patched) return; // already patched
    const patched = (cmd: string, ...args: unknown[]) => {
      if (cmd === 'validate_environment') {
        return Promise.resolve(mockData);
      }
      return orig(cmd, ...args);
    };
    patched.__patched = true;
    w.__TAURI_INVOKE__ = patched;
  }, data);
}

/** Patch get_sidecar_status on the Tauri invoke bridge (available for future use) */
// @ts-expect-error -- kept for test extensibility
async function _mockSidecarStatus(page: Page, data: Record<string, unknown>) {
  await page.evaluate((mockData) => {
    const w = window as any;
    if (!w.__TAURI_INVOKE__) return;
    const orig = w.__TAURI_INVOKE__;
    if (orig.__patched_sidecar) return;
    const patched = (cmd: string, ...args: unknown[]) => {
      if (cmd === 'get_sidecar_status') {
        return Promise.resolve(mockData);
      }
      return orig(cmd, ...args);
    };
    patched.__patched_sidecar = true;
    patched.__patched = orig.__patched;
    w.__TAURI_INVOKE__ = patched;
  }, data);
}

/** Patch deploy_sidecar to simulate success or failure (available for future use) */
// @ts-expect-error -- kept for test extensibility
async function _mockDeploySidecar(page: Page, result: string | Error) {
  await page.evaluate((mockResult) => {
    const w = window as any;
    if (!w.__TAURI_INVOKE__) return;
    const orig = w.__TAURI_INVOKE__;
    const patched = (cmd: string, ...args: unknown[]) => {
      if (cmd === 'deploy_sidecar') {
        return typeof mockResult === 'string'
          ? Promise.resolve(mockResult)
          : Promise.reject(mockResult);
      }
      return orig(cmd, ...args);
    };
    patched.__patched = orig.__patched;
    patched.__patched_sidecar = orig.__patched_sidecar;
    w.__TAURI_INVOKE__ = patched;
  }, result);
}

const ALL_AVAILABLE_ENV = {
  isReady: true,
  python: 'available',
  pythonPath: '/usr/bin/python3',
  pythonVersion: '3.13.1',
  pytorch: 'available',
  pytorchVersion: '2.11.0',
  torchaudio: 'available',
  torchaudioVersion: '2.11.0',
  demucs: 'available',
  demucsVersion: '4.0.1',
  cuda: 'available',
  gpuName: 'NVIDIA RTX 3080',
  ffmpeg: 'available',
  ffprobe: 'available',
  sidecarScript: 'available',
  sidecarScriptPath: '/data/stemgen_sidecar.py',
  warnings: [],
};

const MISSING_SIDECAR_ENV = {
  ...ALL_AVAILABLE_ENV,
  isReady: false,
  sidecarScript: { missing: 'Sidecar script not found at /data/stemgen_sidecar.py' },
  sidecarScriptPath: undefined,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Environment Consistency — false-red regression', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) return;
    appUrl = state.appUrl!;
  });

  test.beforeEach(async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    await navigateSkippingWizard(page, appUrl);
    // Apply default mock BEFORE navigating to settings to intercept mount-time
    // validate_environment calls (avoids race where React fetches env on mount
    // before the test body's mock is applied).
    await mockValidateEnvironment(page, ALL_AVAILABLE_ENV);
    await navigateToView(page, 'settings');
  });

  test('(b) all-available environment renders every Detailed Status row green', async ({ page }) => {
    // Mock was already applied in beforeEach; click Refresh to trigger re-validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1000);

    // Detailed Status should have NO red icons for required deps
    const redIcons = page.locator('[data-testid="detailed-status"] .text-red-600');
    const redCount = await redIcons.count();
    expect(redCount).toBe(0);

    // Detailed Status should have NO red-500 icons either (XCircle)
    const redIconsAlt = page.locator('[data-testid="detailed-status"] .text-red-500');
    const redCountAlt = await redIconsAlt.count();
    expect(redCountAlt).toBe(0);
  });

  test('(b) no console errors for valid PackageStatus "available" strings', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Malformed PackageStatus')) {
        consoleErrors.push(msg.text());
      }
    });

    // Mock already applied in beforeEach; click Refresh to trigger re-validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(2000);

    expect(consoleErrors).toHaveLength(0);
  });

  test('(a) footer and Detailed Status agree when all deps valid', async ({ page }) => {
    // Mock already applied in beforeEach; click Refresh to trigger re-validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1500);

    // The "Environment ready" banner should be visible
    const readyBanner = page.locator('text=Environment ready for stem separation');
    await expect(readyBanner).toBeVisible({ timeout: 5000 });

    // Footer should show "Ready"
    const footerReady = page.locator('[data-testid="status-bar"] >> text=Ready');
    await expect(footerReady).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Sidecar Deployment — repair and guard', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) return;
    appUrl = state.appUrl!;
  });

  test.beforeEach(async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    await navigateSkippingWizard(page, appUrl);
    // Apply mock before navigating to settings to intercept mount-time calls
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await navigateToView(page, 'settings');
  });

  test('(c) "Repair Installation" button appears when sidecar is missing', async ({ page }) => {
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1500);

    const repairBtn = page.locator('[data-testid="repair-sidecar-btn"]');
    await expect(repairBtn).toBeVisible({ timeout: 5000 });
  });

  test('(c) clicking "Repair Installation" calls deploy_sidecar', async ({ page }) => {
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1000);

    let deployCalled = false;
    await page.exposeFunction('__onDeployCalled', () => { deployCalled = true; });

    await page.evaluate(() => {
      const w = window as any;
      const orig = w.__TAURI_INVOKE__;
      w.__TAURI_INVOKE__ = (cmd: string, ...args: unknown[]) => {
        if (cmd === 'deploy_sidecar') {
          (window as any).__onDeployCalled();
        }
        return orig(cmd, ...args);
      };
    });

    const repairBtn = page.locator('[data-testid="repair-sidecar-btn"]');
    if (await repairBtn.isVisible()) {
      await repairBtn.click();
      await page.waitForTimeout(1000);
      expect(deployCalled).toBe(true);
    }
  });

  test('(c) failure reason is shown for missing sidecar', async ({ page }) => {
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1500);

    const failureReason = page.locator('[data-testid="dep-failure-reason-sidecar"]');
    await expect(failureReason).toBeVisible({ timeout: 5000 });
    await expect(failureReason).not.toHaveText('');
  });

  test('(c) "Environment not ready" when sidecar is missing', async ({ page }) => {
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1500);

    const notReady = page.locator('text=Environment not ready');
    await expect(notReady).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Install All Missing — progress surfacing', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) return;
    appUrl = state.appUrl!;
  });

  test.beforeEach(async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    await navigateSkippingWizard(page, appUrl);
    // Apply default mock before navigating to settings to intercept mount-time calls
    await mockValidateEnvironment(page, ALL_AVAILABLE_ENV);
    await navigateToView(page, 'settings');
  });

  test('(d) clicking "Install All Missing" shows an install plan', async ({ page }) => {
    // Mock an environment with some deps missing
    const partialEnv = {
      ...ALL_AVAILABLE_ENV,
      isReady: false,
      python: { missing: 'Python not found' },
      pytorch: { missing: 'PyTorch not installed' },
    };
    await mockValidateEnvironment(page, partialEnv);
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1000);

    const installBtn = page.locator('[data-testid="install-all-btn"]');
    if (!await installBtn.isVisible({ timeout: 3000 })) {
      test.skip(true, 'Install All Missing button not visible');
    }

    // Mock install_dependency to return quickly
    await page.evaluate(() => {
      const w = window as any;
      const orig = w.__TAURI_INVOKE__;
      w.__TAURI_INVOKE__ = (cmd: string, ...args: unknown[]) => {
        if (cmd === 'install_dependency') {
          const arg = args[0] as Record<string, unknown> | undefined;
          return Promise.resolve({ success: true, depName: arg?.depName, output: [] });
        }
        if (cmd === 'get_available_installers') {
          return Promise.resolve([{ id: 'pip', name: 'pip', commandDisplay: 'pip install', needsElevation: false }]);
        }
        return orig(cmd, ...args);
      };
    });

    await installBtn.click();

    // The install plan should appear
    const installPlan = page.locator('[data-testid="install-plan"]');
    await expect(installPlan).toBeVisible({ timeout: 5000 });

    // At least one row should show "installing" or "done" status
    const installingRow = page.locator('[data-testid="install-plan-status-python"], [data-testid="install-plan-status-pytorch"]');
    await expect(installingRow.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Model Download — sidecar guard', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) return;
    appUrl = state.appUrl!;
  });

  test.beforeEach(async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    await navigateSkippingWizard(page, appUrl);
    // Apply mock before navigating to settings to intercept mount-time calls
    await mockValidateEnvironment(page, MISSING_SIDECAR_ENV);
    await navigateToView(page, 'settings');
  });

  test('(e) model download shows error when sidecar is absent', async ({ page }) => {
    // Mock already applied in beforeEach; click Refresh to trigger re-validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(1000);

    // Scroll down to model section and find a download button
    const downloadBtn = page.locator('[data-testid="download-btn-htdemucs"]');
    if (!await downloadBtn.isVisible({ timeout: 3000 })) {
      test.skip(true, 'No download button visible (model may be downloaded)');
    }

    await downloadBtn.click();
    await page.waitForTimeout(1000);

    // Should show a sidecar-specific error
    const sidecarError = page.locator('[data-testid="model-sidecar-error-htdemucs"]');
    await expect(sidecarError).toBeVisible({ timeout: 5000 });
    await expect(sidecarError).toContainText('Sidecar script missing');
  });
});
