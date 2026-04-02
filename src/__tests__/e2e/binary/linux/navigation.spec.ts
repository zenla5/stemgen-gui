/**
 * Navigation tests (Linux / WebdriverIO)
 *
 * Verify sidebar navigation works between views.
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

describe('Navigation', () => {
  it('navigates to Files view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('files');

    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-files');
  });

  it('navigates to Queue view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('queue');

    expect(await $('[data-testid="nav-queue"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-queue');
  });

  it('navigates to Mixer view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('mixer');

    expect(await $('[data-testid="nav-mixer"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-mixer');
  });

  it('navigates to Settings view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    expect(await $('[data-testid="nav-settings"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-settings');
  });
});
