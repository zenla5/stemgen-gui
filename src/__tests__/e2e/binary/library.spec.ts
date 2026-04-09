/**
 * Library navigation tests — verify Library tab navigation
 * in the built binary (Windows).
 */

import { test, expect } from './test-fixtures';
import { readBinaryState, navigateSkippingWizard, navigateToView } from './helpers';

test.describe('Library Navigation (Binary)', () => {
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
  });

  test('sidebar click navigates to Library view', async ({ page }) => {
    await navigateToView(page, 'library');

    // Library view should render — either empty state or overview panel
    const libraryContent = page.locator('[data-testid="library-overview-panel"], [data-testid="empty-add-root-btn"]');
    await expect(libraryContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut 4 navigates to Library view', async ({ page }) => {
    // Press '4' to navigate to Library
    await page.keyboard.press('4');
    await page.waitForTimeout(500);

    // Verify the Library view is active
    const navItem = page.locator('[data-testid="nav-library"]');
    await expect(navItem).toHaveClass(/bg-primary|text-primary/);
  });
});