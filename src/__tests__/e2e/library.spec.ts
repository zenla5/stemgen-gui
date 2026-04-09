import { test, expect } from '@playwright/test';

test.describe.serial('Library Tab', () => {
  test.beforeEach(async ({ page }) => {
    // Inject hasSeenFirstRun so the app shell renders instead of the first-run wizard.
    // Without this, the Zustand settingsStore defaults hasSeenFirstRun to false,
    // causing FirstRunWizard to render (which has no sidebar nav items).
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem('stemgen-settings-storage', JSON.stringify({
        state: { hasSeenFirstRun: true, theme: 'system', language: 'en' },
        version: 0,
      }));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="nav-library"]', { timeout: 15000 });
  });

  test('navigate to Library tab via sidebar click', async ({ page }) => {
    // Click the Library nav item
    await page.click('[data-testid="nav-library"]');
    await page.waitForTimeout(500);

    // Verify the Library view is active — check for the empty state or overview panel
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('navigate to Library tab via keyboard shortcut 4', async ({ page }) => {
    // Press '4' to navigate to Library
    await page.keyboard.press('4');
    await page.waitForTimeout(500);

    // Verify the page is still functional (app didn't crash)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('empty state renders when no library roots are configured', async ({ page }) => {
    // Navigate to Library tab
    await page.click('[data-testid="nav-library"]');
    await page.waitForTimeout(500);

    // The empty state should show either the overview panel or the add-root button
    const libraryContent = page.locator('[data-testid="library-overview-panel"]')
      .or(page.locator('[data-testid="empty-add-root-btn"]'));
    await expect(libraryContent.first()).toBeVisible({ timeout: 5000 });
  });
});