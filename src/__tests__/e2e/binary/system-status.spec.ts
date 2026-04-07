/**
 * System Status & Model Download E2E tests
 *
 * Covers:
 *  (a) No visible process windows during dependency probe (structural/timing check)
 *  (b) Correct colour per component state
 *  (c) Footer ↔ Detailed Status agreement
 *  (d) "Install All Missing" triggers a status refresh
 *  (e) Model download surfaces a clear error for unsupported models
 */

import { test, expect } from './test-fixtures';
import { readBinaryState, navigateSkippingWizard, navigateToView } from './helpers';

test.describe('System Status — colour and consistency', () => {
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
    await navigateToView(page, 'settings');
  });

  // ── (a) No visible window: structural check ──────────────────────────────
  test('refresh completes without hanging (proxy for no blocking window)', async ({ page }) => {
    // Click Refresh and assert the button is re-enabled within 15 s.
    // A blocking console window on Windows would prevent this from completing.
    const refreshBtn = page.locator('[data-testid="refresh-env-btn"]');
    await refreshBtn.click();

    // The button should not be in a permanently disabled/loading state
    await expect(refreshBtn).toBeEnabled({ timeout: 15_000 });
  });

  // ── (b) Colour per component state ───────────────────────────────────────
  test('detected components render green check icons', async ({ page }) => {
    // After environment validation, any row with version text should be green
    await page.waitForTimeout(2000); // allow validation to complete

    // Check that at least one green icon appears in Detailed Status
    const greenIcons = page.locator('[data-testid="detailed-status"] .text-green-600, [data-testid="detailed-status"] .text-green-500');
    await expect(greenIcons.first()).toBeVisible({ timeout: 10_000 });
  });

  test('CUDA unavailable does not render as error red', async ({ page }) => {
    await page.waitForTimeout(2000);

    // The CUDA row value text should NOT be red-600 when CUDA is simply absent
    const cudaRow = page.locator('text=CUDA').locator('..');
    // If CUDA shows "CUDA not available, will use CPU" — it must NOT have text-red-600
    const cudaText = cudaRow.locator('.text-red-600');
    await expect(cudaText).not.toBeVisible({ timeout: 5_000 });
  });

  // ── (c) Footer ↔ Detailed Status agreement ───────────────────────────────
  test('footer "ready" status agrees with Detailed Status icons', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Determine footer state
    const footerReady = page.locator('text=Environment ready for stem separation');

    const isReady = await footerReady.isVisible();

    if (isReady) {
      // No required rows should show a red icon
      const redIcons = page.locator('[data-testid="detailed-status"] .text-red-600');
      const count = await redIcons.count();
      expect(count).toBe(0);
    } else {
      // Footer says not ready → at least one required dep must be red
      const redIcons = page.locator('[data-testid="detailed-status"] .text-red-600, [data-testid="detailed-status"] .text-red-500');
      const count = await redIcons.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  // ── (d) Install All Missing triggers refresh ──────────────────────────────
  test('"Install All Missing" button triggers a status refresh', async ({ page }) => {
    const installBtn = page.locator('[data-testid="install-all-btn"]');

    // Skip if button is not present (all deps already installed)
    if (!await installBtn.isVisible()) {
      test.skip(true, 'All dependencies already installed — nothing to test');
    }

    // Intercept the validate_environment invoke to verify it's called
    let validateCalled = false;
    await page.exposeFunction('__onValidateCalled', () => { validateCalled = true; });

    // Patch the store action via window injection
    await page.evaluate(() => {
      const w = window as any;
      if (!w.__TAURI_INTERNALS__?.invoke) return;
      const origInternals = w.__TAURI_INTERNALS__;
      const origInvoke = origInternals.invoke;
      const mockInternals = Object.create(origInternals);
      mockInternals.invoke = (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'validate_environment') {
          w.__onValidateCalled();
        }
        return origInvoke.call(origInternals, cmd, args);
      };
      try { w.__TAURI_INTERNALS__ = mockInternals; } catch { /* best effort */ }
    });

    await installBtn.click();

    // Wait for the install flow to complete (generous timeout)
    await page.waitForTimeout(5000);

    expect(validateCalled).toBe(true);
  });
});

test.describe('Model Download — error surfacing', () => {
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
    await navigateToView(page, 'settings');
  });

  // ── (e) Each model download resolves or surfaces a clear error ────────────
  for (const modelId of ['htdemucs', 'htdemucs_ft', 'bs_roformer', 'demucs']) {
    test(`${modelId}: download button does not silently reset bar`, async ({ page }) => {
      // Locate the model's download button
      const downloadBtn = page.locator(`[data-testid="download-btn-${modelId}"]`);
      if (!await downloadBtn.isVisible()) {
        test.skip(true, `${modelId} download button not visible (model may already be downloaded)`);
      }

      await downloadBtn.click();

      // Within 30 s, either the progress bar shows > 0 % or an error message appears
      await expect(async () => {
        const progressBar = page.locator(`[data-testid="progress-bar-${modelId}"]`);
        const errorMsg    = page.locator(`[data-testid="download-error-${modelId}"]`);

        const hasProgress = await progressBar.isVisible() &&
          parseFloat(await progressBar.getAttribute('aria-valuenow') ?? '0') > 0;
        const hasError = await errorMsg.isVisible();

        expect(hasProgress || hasError).toBe(true);
      }).toPass({ timeout: 30_000 });
    });
  }
});
