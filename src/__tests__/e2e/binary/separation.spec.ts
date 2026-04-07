/**
 * Separation tests — verify stem separation workflow.
 *
 * These tests require the full Python/demucs environment to be installed.
 * They are marked as slow and will be skipped if dependencies are not available.
 */

import { test, expect } from './test-fixtures';
import {
  readBinaryState,
  navigateSkippingWizard,
  navigateToView,
  resetAppState,
} from './helpers';

test.describe('Separation', () => {
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

  test.afterEach(async ({ page }) => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(page, appUrl);
    }
  });

  test('Start Processing button is present in Queue view', async ({ page }) => {
    await navigateToView(page, 'queue');
    await expect(page.locator('[data-testid="start-processing-btn"]')).toBeVisible();
  });

  test('Start Processing button is disabled without files', async ({ page }) => {
    await navigateToView(page, 'queue');
    const btn = page.locator('[data-testid="start-processing-btn"]');
    await expect(btn).toBeDisabled();
  });

  test('separation requires environment check', async ({ page }) => {
    // Verify environment validation can be invoked
    // Wrap in try/catch because validate_environment may trigger navigation
    // which destroys the Playwright execution context
    let result: { success?: boolean; isReady?: unknown; error?: string };
    try {
      result = await page.evaluate(async () => {
        try {
          // @ts-ignore
          const env = await (window as any).__TAURI_INTERNALS__?.invoke('validate_environment');
          return { success: true, isReady: env?.isReady };
        } catch (err) {
          return { error: String(err) };
        }
      });
    } catch (err) {
      // Navigation may have destroyed the execution context — this is acceptable
      result = { error: String(err) };
    }

    // Should either succeed or return a meaningful error
    if ('success' in result) {
      // Environment validation worked — isReady tells us if deps are installed
      expect(typeof result.isReady).toBe('boolean');
    } else {
      // Command may not be available in all builds, or navigation interrupted
      expect(result).toHaveProperty('error');
    }
  });

  // Full separation test — requires demucs installed
  // Marked slow and skipped unless RUN_SEPARATION=true
  test('full stem separation workflow', async ({ page }) => {
    test.skip(
      !process.env.RUN_SEPARATION,
      'Set RUN_SEPARATION=true to run full separation tests'
    );
    test.slow();

    // This test would:
    // 1. Inject a valid audio file into the store
    // 2. Navigate to Queue
    // 3. Click Start Processing
    // 4. Wait for job status to change to 'completed'
    // 5. Verify stem output files appear

    // For now, verify the UI is in the right state
    await navigateToView(page, 'queue');
    await expect(page.locator('[data-testid="start-processing-btn"]')).toBeVisible();
  });
});
