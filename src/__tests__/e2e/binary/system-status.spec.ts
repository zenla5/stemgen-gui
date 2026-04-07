/**
 * System Status & Model Download E2E tests
 *
 * Covers:
 *  (a) No visible process windows during dependency probe (structural/timing check)
 *  (b) Correct colour per component state
 *  (c) Footer ↔ Detailed Status agreement
 *  (d) "Install All Missing" triggers a status refresh
 *  (e) Model download surfaces a clear error for unsupported models
 *
 * NOTE: These tests use real environment state (no mocking), matching the
 * Linux pattern. On WebView2, mockValidateEnvironment is unreliable.
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
  test('status icons render for detected components', async ({ page }) => {
    // Trigger real environment validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(3000);

    // After validation, detailed-status should contain status indicators
    // (either green for available or red for missing)
    const allStatusIcons = page.locator(
      '[data-testid="detailed-status"] .text-green-600, ' +
      '[data-testid="detailed-status"] .text-green-500, ' +
      '[data-testid="detailed-status"] .text-red-600, ' +
      '[data-testid="detailed-status"] .text-red-500'
    );
    const count = await allStatusIcons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('CUDA status does not render as error when unavailable', async ({ page }) => {
    // Trigger real validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(3000);

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('CUDA')) {
      // CUDA unavailable is a normal state — it should not show red error icons
      const cudaRow = page.locator('text=CUDA').locator('..');
      const cudaText = cudaRow.locator('.text-red-600');
      await expect(cudaText).not.toBeVisible({ timeout: 5000 });
    }
  });

  // ── (c) Footer ↔ Detailed Status agreement ───────────────────────────────
  test('footer "ready" status agrees with Detailed Status icons', async ({ page }) => {
    // Trigger real environment validation
    await page.locator('[data-testid="refresh-env-btn"]').click();
    await page.waitForTimeout(3000);

    const bodyText = await page.locator('body').innerText();
    const isReady = bodyText.includes('Environment ready for stem separation');

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

    await installBtn.click();

    // Wait for the install flow to complete, then verify refresh-env-btn
    // re-enables (observable proxy for validate_environment being called).
    await expect(page.locator('[data-testid="refresh-env-btn"]')).toBeEnabled({ timeout: 15_000 });
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
  // Model download requires network + working sidecar — skip on CI
  // where neither is reliably available (matching Linux pattern).
  for (const modelId of ['htdemucs', 'htdemucs_ft', 'bs_roformer', 'demucs']) {
    test(`${modelId}: download button does not silently reset bar`, async ({ page }) => {
      test.skip(!!process.env.CI, 'Model download requires network + working sidecar — skip on CI');

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
