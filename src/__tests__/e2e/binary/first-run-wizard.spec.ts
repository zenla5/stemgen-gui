/**
 * First-Run Wizard tests — verify the setup wizard appears on first launch,
 * shows dependency checks, and allows skipping to the main app.
 */

import { test, expect } from '@playwright/test';
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
    await expect(page.locator('text=Checking dependencies')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'wizard-checking');
  });

  test('wizard shows results after dependency check completes', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateWithWizard(page);

    await page.click('button:has-text("Start Check")');
    await expect(page.locator('text=Dependency Check Complete')).toBeVisible({ timeout: 60000 });
    await takeScreenshot(page, 'wizard-results');
  });

  test('wizard results show dependency rows with status', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

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
});
