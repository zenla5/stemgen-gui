/**
 * Windows binary E2E — reduced "smoke" suite.
 *
 * The full Playwright binary suite is reliably green on Linux, but on Windows the
 * WebView2 renderer is slow enough (~1 min per test, dominated by full `page.reload`
 * cycles) that the ~86-test suite cannot finish inside a GitHub job timeout. This
 * file is a small, representative subset (launch + nav + key views) that stays well
 * within CI limits. It runs via the `binary-smoke` Playwright project on Windows.
 *
 * Uses the same CDP/WebView2 fixtures (`../test-fixtures`) and helpers as the full
 * suite, so a passing run is real proof the compiled binary + WebView2 work.
 */

import { test, expect } from '../test-fixtures';
import { readBinaryState, navigateSkippingWizard, navigateToView } from '../helpers';

test.describe('Windows binary smoke', () => {
  test('binary launches and app shell renders', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/Stemgen/i);
  });

  test('wizard can be skipped and sidebar renders', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, state!.appUrl!);
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-queue"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-mixer"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-library"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
  });

  test('status bar renders with dependency indicators', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, state!.appUrl!);
    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
  });

  test('files view drop zone renders', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, state!.appUrl!);
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
  });

  test('sidebar navigation reaches settings view', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, state!.appUrl!);
    await navigateToView(page, 'settings');
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    await expect(page.locator('[data-testid="refresh-env-btn"]')).toBeVisible();
  });
});
