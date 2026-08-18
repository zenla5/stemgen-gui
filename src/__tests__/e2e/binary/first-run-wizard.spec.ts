/**
 * First-Run Wizard tests — verify the setup wizard appears on first launch,
 * shows dependency checks, and allows skipping to the main app.
 */

import { test, expect } from './test-fixtures';
import { readBinaryState, takeScreenshot, ensureViewport, logPageDiagnostics } from './helpers';

test.describe('First Run Wizard', () => {
  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) return;
  });

  /**
   * Navigate to the app with localStorage cleared so the wizard shows.
   *
   * Uses addInitScript to clear localStorage before React initializes,
   * avoiding a reload (which is unreliable on Windows custom protocol).
   */
  async function navigateWithWizard(page: import('@playwright/test').Page) {
    await page.setViewportSize({ width: 1280, height: 720 });
    // Don't use page.goto() — it destroys the existing page on Windows custom protocol.
    // Clear localStorage and reload the existing page instead.
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureViewport(page);
    try {
      await page.waitForSelector('[data-testid="wizard-step"]', { timeout: 15000 });
    } catch (err) {
      await logPageDiagnostics(page, 'navigateWithWizard');
      throw err;
    }
  }

  test('wizard shows welcome step by default', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    await expect(page.locator('[data-testid="wizard-step"]')).toBeVisible();
    await expect(page.locator('text=Welcome to Stemgen GUI')).toBeVisible();
    await takeScreenshot(page, 'wizard-welcome');
  });

  test('wizard shows Start Check and Skip buttons', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    await expect(page.locator('button', { hasText: 'Start Check' })).toBeVisible();
    await expect(page.locator('[data-testid="wizard-skip"]')).toBeVisible();
    await takeScreenshot(page, 'wizard-buttons');
  });

  test('wizard shows dependency list on welcome step', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    // Should list the required dependencies
    await expect(page.locator('text=FFmpeg')).toBeVisible();
    await expect(page.locator('text=Python')).toBeVisible();
    await expect(page.locator('text=PyTorch')).toBeVisible();
    await takeScreenshot(page, 'wizard-dep-list');
  });

  test('wizard navigates to check step on Start Check click', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    await page.click('button:has-text("Start Check")');
    // Accept either the brief "checking" state or the results state — with onCheckComplete the
    // wizard may transition through 'check' faster than the browser paints the heading in CI.
    await expect(
      page.locator('text=Checking dependencies').or(page.locator('text=Dependency Check Complete'))
    ).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'wizard-checking');
  });

  test('wizard shows results after dependency check completes', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    test.skip(!!process.env.CI && process.platform === 'win32', 'validate_environment hangs on Windows CI (no Python); WebView2 throttles setTimeout in background');

    await navigateWithWizard(page);

    await page.click('button:has-text("Start Check")');
    await expect(page.locator('text=Dependency Check Complete')).toBeVisible({ timeout: 60000 });
    await takeScreenshot(page, 'wizard-results');
  });

  test('wizard results show dependency rows with status', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    test.skip(!!process.env.CI && process.platform === 'win32', 'validate_environment hangs on Windows CI (no Python); WebView2 throttles setTimeout in background');

    await navigateWithWizard(page);

    await page.click('button:has-text("Start Check")');
    await expect(page.locator('text=Dependency Check Complete')).toBeVisible({ timeout: 60000 });

    // All 5 dependency rows should be visible
    const depRows = page.locator('[data-testid="wizard-dep-row"]');
    await expect(depRows).toHaveCount(5);

    // Each row should have a status element
    const statusElements = page.locator('[data-testid="wizard-dep-status"]');
    await expect(statusElements).toHaveCount(5);

    await takeScreenshot(page, 'wizard-results-rows');
  });

  test('wizard skip button navigates to main app', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    await page.click('[data-testid="wizard-skip"]');
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'wizard-skipped-to-app');
  });

  test('wizard shows coloured dep indicators after check', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');
    test.skip(!!process.env.CI && process.platform === 'win32', 'validate_environment hangs on Windows CI (no Python); WebView2 throttles setTimeout in background');

    await navigateWithWizard(page);

    await page.click('button:has-text("Start Check")');

    // Wait for all status elements to contain non-empty text (not blank pending state)
    const statusElements = page.locator('[data-testid="wizard-dep-status"]');
    await expect(statusElements.first()).not.toHaveText('', { timeout: 60000 });

    // Wait for dependency check to complete
    await expect(page.locator('text=Dependency Check Complete')).toBeVisible({ timeout: 60000 });

    // Assert that at least one dep-status element has a non-grey colour
    // (green-600, red-600, or yellow-600)
    const colouredStatus = page.locator('[data-testid="wizard-dep-status"]').filter({
      has: page.locator('.text-green-600, .text-red-600, .text-yellow-600'),
    });
    await expect(colouredStatus.first()).toBeVisible();

    await takeScreenshot(page, 'wizard-coloured-indicators');
  });
});
