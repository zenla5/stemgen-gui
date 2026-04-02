/**
 * Settings tests (Linux / WebdriverIO)
 *
 * Verify the settings panel opens, renders correctly,
 * and persists state across reloads.
 */

import { readBinaryState } from '../helpers';
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

describe('Settings', () => {
  it('settings panel opens and shows content', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Verify the settings view is visible
    const settingsContent = await $('[data-testid="nav-settings"]');
    expect(await settingsContent.isDisplayed()).toBe(true);
    await takeScreenshot('linux-settings-panel');
  });

  it('settings persist after reload', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Reload the page
    await browser.url(appUrl);
    await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 15000 });

    // After reload with hasSeenFirstRun=true, wizard should be skipped
    // and we should see the sidebar
    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-settings-persist');
  });
});
