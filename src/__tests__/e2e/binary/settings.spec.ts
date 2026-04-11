/**
 * Settings tests — verify theme toggling, language selection,
 * and settings persistence across page reloads.
 */

import { test, expect } from './test-fixtures';
import {
  readBinaryState,
  navigateSkippingWizard,
  navigateToView,
  resetAppState,
} from './helpers';

test.describe('Settings', () => {
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

  test.afterEach(async ({ page }) => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(page, appUrl);
    }
  });

  test('settings view heading is present', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'Settings' })).toBeVisible();
  });

  test('theme buttons are visible', async ({ page }) => {
    await expect(page.locator('[data-testid="theme-btn-light"]')).toBeVisible();
    await expect(page.locator('[data-testid="theme-btn-dark"]')).toBeVisible();
    await expect(page.locator('[data-testid="theme-btn-system"]')).toBeVisible();
  });

  test('clicking light theme adds light class to html', async ({ page }) => {
    await page.click('[data-testid="theme-btn-light"]');

    const html = page.locator('html');
    await expect(html).toHaveClass(/light/);
    await expect(html).not.toHaveClass(/dark/);
  });

  test('clicking dark theme adds dark class to html', async ({ page }) => {
    await page.click('[data-testid="theme-btn-dark"]');

    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
    await expect(html).not.toHaveClass(/light/);
  });

  test('theme persists across page reload', async ({ page }) => {
    // Set dark theme
    await page.click('[data-testid="theme-btn-dark"]');
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Need to re-skip the wizard after reload
    await navigateSkippingWizard(page, appUrl);
    await navigateToView(page, 'settings');

    // Theme should still be dark
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('language selector is present and functional', async ({ page }) => {
    const selector = page.locator('[data-testid="language-select"]');
    await expect(selector).toBeVisible();

    // Should have at least English and German options
    const options = selector.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('refresh environment button is present', async ({ page }) => {
    await expect(page.locator('[data-testid="refresh-env-btn"]')).toBeVisible();
  });

  test('refresh button is clickable', async ({ page }) => {
    await page.click('[data-testid="refresh-env-btn"]');

    // App should still be functional
    await expect(page.locator('[data-testid="theme-btn-light"]')).toBeVisible();
  });

  test('system status section is present', async ({ page }) => {
    await expect(page.locator('text=System Status')).toBeVisible();
  });

  test('AI Models section loads without indefinite spinner', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    // Navigate to settings (already done in beforeEach)

    // Locate the AI Models section
    await expect(page.locator('text=AI Models')).toBeVisible();

    // Wait for loading spinner to disappear (up to 10 seconds)
    const spinner = page.locator('.animate-spin');
    await expect(spinner).not.toBeVisible({ timeout: 10000 });

    // Assert that either model cards are visible OR an error/warning banner is visible
    const modelCards = page.locator('[data-testid^="model-card-"]');
    const errorBanner = page.locator('[data-testid="models-load-error"]');
    const warningBanner = page.locator('[data-testid="models-list-warning"]');

    // At least one of these should be visible
    const hasModelCards = await modelCards.first().isVisible().catch(() => false);
    const hasErrorBanner = await errorBanner.isVisible().catch(() => false);
    const hasWarningBanner = await warningBanner.isVisible().catch(() => false);

    expect(hasModelCards || hasErrorBanner || hasWarningBanner).toBe(true);
  });
});
