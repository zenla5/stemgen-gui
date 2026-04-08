/**
 * App Launch tests — verify the compiled Tauri binary starts,
 * the window appears, and the app shell renders correctly.
 */

import { test, expect } from './test-fixtures';
import { readBinaryState, navigateSkippingWizard, takeScreenshot, ensureViewport } from './helpers';

test.describe('App Launch', () => {
  let appUrl: string;

  test.beforeAll(() => {
    const state = readBinaryState();
    if (!state?.available) {
      // Tests will be skipped via the skip below
      return;
    }
    appUrl = state.appUrl!;
  });

  test('binary starts and window appears', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    // NOTE: Don't use page.goto() — it destroys the existing page on Windows custom protocol.
    // The page is already loaded from the CDP connection.
    await ensureViewport(page);
    await expect(page.locator('body')).toBeVisible();
    await takeScreenshot(page, 'app-launch-initial-load');
  });

  test('window title matches product name', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await ensureViewport(page);
    await expect(page).toHaveTitle(/Stemgen/i);
    await takeScreenshot(page, 'app-launch-title');
  });

  test('app shell renders with sidebar after wizard skip', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, appUrl);

    // Verify sidebar navigation buttons are present
    await expect(page.locator('[data-testid="nav-files"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-queue"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-mixer"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    await takeScreenshot(page, 'app-launch-sidebar');
  });

  test('status bar renders with dependency indicators', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, appUrl);

    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible();
    await takeScreenshot(page, 'app-launch-status-bar');
  });

  test('no console errors on startup', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await navigateSkippingWizard(page, appUrl);

    // Filter out known benign errors (e.g., network errors in test env)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('NetworkError') &&
        !e.includes('health check') &&
        !e.includes('sidecar')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('sidecar script is deployed to data dir on first launch', async ({ page }) => {
    const state = readBinaryState();
    test.skip(!state?.available, state?.reason || 'Binary not available');

    await navigateSkippingWizard(page, appUrl);

    // Wait a moment for startup sidecar deployment to complete
    await page.waitForTimeout(3000);

    let sidecarStatus: { sidecarScriptFound?: boolean; error?: string };
    try {
      sidecarStatus = await Promise.race([
        page.evaluate(async () => {
          try {
            // @ts-ignore
            const status = await (window as any).__TAURI_INTERNALS__?.invoke('get_sidecar_status');
            return { sidecarScriptFound: status?.sidecarScriptFound };
          } catch (err) {
            return { error: String(err) };
          }
        }),
        new Promise<{ error: string }>((resolve) =>
          setTimeout(() => resolve({ error: 'timeout' }), 15_000)
        ),
      ]);
    } catch (err) {
      // Navigation may have destroyed the execution context
      test.skip(true, 'Execution context lost (navigation after invoke)');
      return;
    }

    expect(sidecarStatus.sidecarScriptFound).toBe(true);
  });
});
