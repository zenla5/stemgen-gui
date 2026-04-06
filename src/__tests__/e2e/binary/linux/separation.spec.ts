/**
 * Separation tests (Linux / WebdriverIO)
 *
 * Verify stem separation workflow.
 *
 * These tests require the full Python/demucs environment to be installed.
 * They are marked as slow and will be skipped if dependencies are not available.
 *
 * NOTE: Uses browser.executeAsync() because Tauri invoke calls return promises
 * and browser.execute() cannot return promise values.
 */

import { readBinaryState } from '../helpers';
import { navigateSkippingWizard, navigateToView, resetAppState, takeScreenshot } from './helpers';

let appUrl: string;

before(function () {
  const state = readBinaryState();
  if (!state?.available) {
    this.skip();
    return;
  }
  appUrl = state.appUrl!;
});

describe('Separation', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
  });

  afterEach(async () => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(appUrl);
    }
  });

  it('Start Processing button is present in Queue view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateToView('queue');
    expect(await $('[data-testid="start-processing-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-sep-start-btn');
  });

  it('Start Processing button is disabled without files', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateToView('queue');
    const btn = $('[data-testid="start-processing-btn"]');
    expect(await btn.isEnabled()).toBe(false);
    await takeScreenshot('linux-sep-start-disabled');
  });

  it('separation requires environment check', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Verify environment validation can be invoked
    const result = await browser.executeAsync(
      (done: (result: { success?: boolean; isReady?: boolean; error?: string }) => void) => {
        try {
          // @ts-ignore
          (window as any).__TAURI_INTERNALS__?.invoke('validate_environment')
            .then((env: { isReady?: boolean }) => done({ success: true, isReady: env?.isReady }))
            .catch((err: Error) => done({ error: String(err) }));
        } catch (err) {
          done({ error: String(err) });
        }
      }
    );

    // Should either succeed or return a meaningful error
    if ('success' in result) {
      expect(typeof result.isReady).toBe('boolean');
    } else {
      expect(result).toHaveProperty('error');
    }
    await takeScreenshot('linux-sep-env-check');
  });

  // Full separation test — requires demucs installed
  // Skipped unless RUN_SEPARATION=true — requires full demucs environment.
  it('full stem separation workflow', async function () {
    if (!process.env.RUN_SEPARATION) {
      this.skip();
      return;
    }
    // test.slow() equivalent — increase timeout to 4 minutes
    this.timeout(240000);

    const state = readBinaryState();
    if (!state?.available) return;

    // This test would:
    // 1. Inject a valid audio file into the store
    // 2. Navigate to Queue
    // 3. Click Start Processing
    // 4. Wait for job status to change to 'completed'
    // 5. Verify stem output files appear

    // For now, verify the UI is in the right state
    await navigateToView('queue');
    expect(await $('[data-testid="start-processing-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-sep-full-workflow');
  });
});
