/**
 * App Launch tests — verify the compiled Tauri binary starts,
 * the window appears, and the app shell renders correctly.
 */

import { test, expect } from '@playwright/test';
import { readBinaryState, navigateSkippingWizard, takeScreenshot } from './helpers';

test.describe('App Launch', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) {
      // Tests will be skipped via the skip below
      return;
    }
    appUrl = state.appUrl!;
  });

  test('binary starts and window appears', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page.locator('body')).toBeVisible();
    await takeScreenshot(page, 'app-launch-initial-load');
  });

  test('window title matches product name', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(page).toHaveTitle(/Stemgen/i);
    await takeScreenshot(page, 'app-launch-title');
  });

  test('app shell renders with sidebar after wizard skip', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, appUrl);

    // Verify sidebar navigation buttons are present
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-queue"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-mixer"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    await takeScreenshot(page, 'app-launch-sidebar');
  });

  test('status bar renders with dependency indicators', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, appUrl);

    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
    await takeScreenshot(page, 'app-launch-status-bar');
  });

  test('no console errors on startup', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await navigateSkippingWizard(page, appUrl);

    // Filter out known benign errors (e.g., network errors in test env)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('NetworkError') &&
        !e.includes('health check') &&
        !e.includes('sidecar')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
