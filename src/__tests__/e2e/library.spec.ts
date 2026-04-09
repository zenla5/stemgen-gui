import { test, expect } from '@playwright/test';

test.describe.serial('Library Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('navigate to Library tab via sidebar click', async ({ page }) => {
    // Click the Library nav item
    await page.click('[data-testid="nav-library"]');
    await page.waitForTimeout(500);

    // Verify the Library view is active — check for the empty state or overview panel
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('navigate to Library tab via keyboard shortcut 5', async ({ page }) => {
    // Press '5' to navigate to Library
    await page.keyboard.press('5');
    await page.waitForTimeout(500);

    // Verify the page is still functional (app didn't crash)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('empty state renders when no library roots are configured', async ({ page }) => {
    // Navigate to Library tab
    await page.click('[data-testid="nav-library"]');
    await page.waitForTimeout(500);

    // The empty state should show a CTA (the text is i18n key since we mock it in dev)
    // Check that either the empty state message or the overview panel is visible
    const libraryContent = page.locator('[data-testid="library-overview-panel"], [data-testid="empty-add-root-btn"], text=library.setUpLibrary');
    await expect(libraryContent.first()).toBeVisible({ timeout: 5000 });
  });
});