/**
 * Navigation tests — verify keyboard shortcuts and sidebar clicks
 * switch between views correctly.
 */

import { test, expect } from '@playwright/test';
import { readBinaryState, navigateSkippingWizard, navigateToView } from './helpers';

test.describe('Navigation', () => {
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

  test('sidebar click navigates to Files view', async ({ page }) => {
    await navigateToView(page, 'settings');
    await navigateToView(page, 'files');

    // Files view should show the drop zone
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
  });

  test('sidebar click navigates to Queue view', async ({ page }) => {
    await navigateToView(page, 'queue');

    // Queue view should show empty state
    await expect(page.locator('[data-testid="queue-empty"]')).toBeVisible();
  });

  test('sidebar click navigates to Mixer view', async ({ page }) => {
    await navigateToView(page, 'mixer');

    // Mixer view should show the no-stems message
    await expect(page.locator('[data-testid="no-stems-msg"]')).toBeVisible();
  });

  test('sidebar click navigates to Settings view', async ({ page }) => {
    await navigateToView(page, 'settings');

    // Settings view should show theme buttons
    await expect(page.locator('[data-testid="theme-btn-light"]')).toBeVisible();
  });

  test('keyboard shortcut 1 navigates to Files', async ({ page }) => {
    await navigateToView(page, 'settings');
    await page.keyboard.press('1');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
  });

  test('keyboard shortcut 2 navigates to Queue', async ({ page }) => {
    await page.keyboard.press('2');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="queue-empty"]')).toBeVisible();
  });

  test('keyboard shortcut 3 navigates to Mixer', async ({ page }) => {
    await page.keyboard.press('3');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="no-stems-msg"]')).toBeVisible();
  });

  test('keyboard shortcut 4 navigates to Settings', async ({ page }) => {
    await page.keyboard.press('4');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="theme-btn-light"]')).toBeVisible();
  });

  test('Ctrl+B toggles sidebar', async ({ page }) => {
    const sidebar = page.locator('aside');
    const initialWidth = await sidebar.boundingBox();

    // Toggle collapsed
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(300);

    const collapsedWidth = await sidebar.boundingBox();
    // Sidebar should be narrower when collapsed
    expect(collapsedWidth?.width).toBeLessThan(initialWidth?.width || 999);

    // Toggle back
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(300);

    const restoredWidth = await sidebar.boundingBox();
    expect(restoredWidth?.width).toBeGreaterThan(collapsedWidth?.width || 0);
  });

  test('view navigation updates sidebar active state', async ({ page }) => {
    // Navigate to Settings
    await navigateToView(page, 'settings');

    // The Settings nav button should have active styling
    const settingsBtn = page.locator('[data-testid="nav-settings"]');
    await expect(settingsBtn).toHaveClass(/bg-primary/);

    // Navigate to Files
    await navigateToView(page, 'files');

    // The Files nav button should now have active styling
    const filesBtn = page.locator('[data-testid="nav-files"]');
    await expect(filesBtn).toHaveClass(/bg-primary/);
  });
});
