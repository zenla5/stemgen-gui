/**
 * Error handling tests (Linux / WebdriverIO)
 *
 * Verify the app handles errors gracefully,
 * including corrupt files and invalid invocations.
 *
 * NOTE: Uses browser.executeAsync() because Tauri invoke calls return promises
 * and browser.execute() cannot return promise values.
 */

import path from 'path';
import { readBinaryState, getFixturePath } from '../helpers';
import { navigateSkippingWizard, navigateToView, takeScreenshot } from './helpers';

let appUrl: string;

before(function () {
  const state = readBinaryState();
  if (!state?.available) {
    this.skip();
    return;
  }
  appUrl = state.appUrl!;
});

describe('Error Handling', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
  });

  it('app does not crash on invalid Tauri invoke', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Try to call a non-existent Tauri command
    const result = await browser.executeAsync((done: (result: { success?: boolean; error?: string }) => void) => {
      try {
        // @ts-ignore - accessing Tauri internals
        (window as any).__TAURI_INTERNALS__?.invoke('nonexistent_command')
          .then(() => done({ success: true }))
          .catch((err: Error) => done({ error: String(err) }));
      } catch (err) {
        done({ error: String(err) });
      }
    });

    // Should get an error, not a crash
    expect(result).toHaveProperty('error');

    // App should still be functional
    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-error-invalid-invoke');
  });

  it('corrupt WAV file invoke returns error gracefully', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const corruptPath = getFixturePath('corrupt.wav');

    const result = await browser.executeAsync(
      (filePath: string, done: (result: { success?: boolean; info?: unknown; error?: string }) => void) => {
        try {
          // @ts-ignore - accessing Tauri internals
          (window as any).__TAURI_INTERNALS__?.invoke('get_audio_info', { path: filePath })
            .then((info: unknown) => done({ success: true, info }))
            .catch((err: Error) => done({ error: String(err) }));
        } catch (err) {
          done({ error: String(err) });
        }
      },
      corruptPath
    );

    // Should return an error for corrupt file
    expect(result).toHaveProperty('error');

    // App should still be functional
    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-error-corrupt-file');
  });

  it('non-existent file invoke returns error gracefully', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const nonExistentPath = path.join(getFixturePath(''), 'does-not-exist.wav');

    const result = await browser.executeAsync(
      (filePath: string, done: (result: { success?: boolean; info?: unknown; error?: string }) => void) => {
        try {
          // @ts-ignore - accessing Tauri internals
          (window as any).__TAURI_INTERNALS__?.invoke('get_audio_info', { path: filePath })
            .then((info: unknown) => done({ success: true, info }))
            .catch((err: Error) => done({ error: String(err) }));
        } catch (err) {
          done({ error: String(err) });
        }
      },
      nonExistentPath
    );

    expect(result).toHaveProperty('error');

    // App should still be functional
    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-error-nonexistent-file');
  });

  it('app recovers after error without restart', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Trigger an error
    await browser.executeAsync((done: () => void) => {
      try {
        // @ts-ignore
        (window as any).__TAURI_INTERNALS__?.invoke('nonexistent_command')
          .catch(() => { /* expected */ })
          .finally(() => done());
      } catch {
        done();
      }
    });

    // Navigate between views to verify full functionality
    await navigateToView('queue');
    expect(await $('[data-testid="queue-empty"]').isDisplayed()).toBe(true);

    await navigateToView('mixer');
    expect(await $('[data-testid="no-stems-msg"]').isDisplayed()).toBe(true);

    await navigateToView('settings');
    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-error-recovery');
  });
});
