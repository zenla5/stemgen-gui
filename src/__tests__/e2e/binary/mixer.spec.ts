/**
 * Mixer tests — verify the stem mixer view renders correctly,
 * empty state shows, and playback controls are present.
 */

import { test, expect } from '@playwright/test';
import {
  readBinaryState,
  navigateSkippingWizard,
  navigateToView,
  resetAppState,
} from './helpers';

test.describe('Stem Mixer', () => {
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
    await navigateToView(page, 'mixer');
  });

  test.afterEach(async ({ page }) => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(page, appUrl);
    }
  });

  test('no stems message shows when nothing loaded', async ({ page }) => {
    await expect(page.locator('[data-testid="no-stems-msg"]')).toBeVisible();
    await expect(page.locator('[data-testid="no-stems-msg"]')).toContainText('Select a file');
  });

  test('reset button is present', async ({ page }) => {
    await expect(page.locator('[data-testid="reset-mixer-btn"]')).toBeVisible();
  });

  test('mixer heading is present', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Stem Mixer');
  });

  test('play/pause button is present but disabled when no stems', async ({ page }) => {
    const btn = page.locator('[data-testid="play-pause-btn"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('skip start button is not visible when no stems', async ({ page }) => {
    await expect(page.locator('[data-testid="skip-start-btn"]')).not.toBeVisible();
  });

  test('skip end button is not visible when no stems', async ({ page }) => {
    await expect(page.locator('[data-testid="skip-end-btn"]')).not.toBeVisible();
  });

  test('master volume slider is not visible when no stems', async ({ page }) => {
    await expect(page.locator('[data-testid="master-volume"]')).not.toBeVisible();
  });

  test('stem cards are not rendered when no stems', async ({ page }) => {
    await expect(page.locator('[data-testid="stem-card"]')).toHaveCount(0);
  });

  test('reset button is clickable', async ({ page }) => {
    const resetBtn = page.locator('[data-testid="reset-mixer-btn"]');
    await resetBtn.click();

    // App should still be functional (no crash)
    await expect(page.locator('[data-testid="no-stems-msg"]')).toBeVisible();
  });

  test('mixer has accessible region label', async ({ page }) => {
    const region = page.locator('[role="region"][aria-label="Stem Mixer"]');
    await expect(region).toBeVisible();
  });
});
