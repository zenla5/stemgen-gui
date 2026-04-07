/**
 * Error handling tests — verify the app handles errors gracefully,
 * including corrupt files and invalid invocations.
 */

import { test, expect } from './test-fixtures';
import path from 'path';
import {
  readBinaryState,
  navigateSkippingWizard,
  getFixturePath,
  takeScreenshot,
} from './helpers';

test.describe('Error Handling', () => {
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

  test('app does not crash on invalid Tauri invoke', async ({ page }) => {
    // Try to call a non-existent Tauri command
    const result = await page.evaluate(async () => {
      try {
        // @ts-ignore - accessing Tauri internals
        await (window as any).__TAURI_INTERNALS__?.invoke('nonexistent_command');
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    });

    // Should get an error, not a crash
    expect(result).toHaveProperty('error');

    // App should still be functional
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await takeScreenshot(page, 'error-handling-invalid-invoke');
  });

  test('corrupt WAV file invoke returns error gracefully', async ({ page }) => {
    const corruptPath = getFixturePath('corrupt.wav');

    // Try to get audio info for corrupt file
    const result = await page.evaluate(async (filePath) => {
      try {
        // @ts-ignore - accessing Tauri internals
        const info = await (window as any).__TAURI_INTERNALS__?.invoke('get_audio_info', { path: filePath });
        return { success: true, info };
      } catch (err) {
        return { error: String(err) };
      }
    }, corruptPath);

    // Should return an error for corrupt file
    expect(result).toHaveProperty('error');

    // App should still be functional
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await takeScreenshot(page, 'error-handling-corrupt-file');
  });

  test('non-existent file invoke returns error gracefully', async ({ page }) => {
    const nonExistentPath = path.join(getFixturePath(''), 'does-not-exist.wav');

    const result = await page.evaluate(async (filePath) => {
      try {
        // @ts-ignore - accessing Tauri internals
        const info = await (window as any).__TAURI_INTERNALS__?.invoke('get_audio_info', { path: filePath });
        return { success: true, info };
      } catch (err) {
        return { error: String(err) };
      }
    }, nonExistentPath);

    expect(result).toHaveProperty('error');

    // App should still be functional
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await takeScreenshot(page, 'error-handling-nonexistent-file');
  });

  test('app recovers after error without restart', async ({ page }) => {
    // Trigger an error
    await page.evaluate(async () => {
      try {
        // @ts-ignore
        await (window as any).__TAURI_INTERNALS__?.invoke('nonexistent_command');
      } catch {
        // Expected
      }
    });

    // Navigate between views to verify full functionality
    await page.click('[data-testid="nav-queue"]');
    await expect(page.locator('[data-testid="queue-empty"]')).toBeVisible();

    await page.click('[data-testid="nav-mixer"]');
    await expect(page.locator('[data-testid="no-stems-msg"]')).toBeVisible();

    await page.click('[data-testid="nav-settings"]');
    await expect(page.locator('[data-testid="theme-btn-light"]')).toBeVisible();
    await takeScreenshot(page, 'error-handling-recovery');
  });
});
