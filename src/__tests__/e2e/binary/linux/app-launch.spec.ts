/**
 * App Launch tests (Linux / WebdriverIO)
 *
 * Verify the compiled Tauri binary starts, the window appears,
 * and the app shell renders correctly.
 */

import { readBinaryState } from '../helpers';
import { navigateSkippingWizard, takeScreenshot } from './helpers';

let appUrl: string;

before(function () {
  const state = readBinaryState();
  if (!state?.available) {
    this.skip();
    return;
  }
  appUrl = state.appUrl!;
});

describe('App Launch', () => {
  it('binary starts and window appears', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await browser.url(appUrl);
    const body = await $('body');
    expect(await body.isDisplayed()).toBe(true);
    await takeScreenshot('linux-app-launch-initial');
  });

  it('window title matches product name', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await browser.url(appUrl);
    const title = await browser.getTitle();
    expect(title.toLowerCase()).toContain('stemgen');
    await takeScreenshot('linux-app-launch-title');
  });

  it('app shell renders with sidebar after wizard skip', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="nav-queue"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="nav-mixer"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="nav-settings"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-app-launch-sidebar');
  });

  it('status bar renders with dependency indicators', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    expect(await $('[data-testid="status-bar"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-app-launch-status-bar');
  });

  // NOTE: Windows test checks console.error events via page.on('console', ...).
  // WebKit/tauri-driver does not expose the console stream.
  // This test asserts DOM health as an equivalent observable proxy.
  it('app starts without visible error state', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    // Verify sidebar and status bar are present (app booted correctly)
    expect(await $('[data-testid="nav-files"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="status-bar"]').isDisplayed()).toBe(true);

    // Verify no obvious error text leaked into the DOM
    const bodyText = await $('body').getText();
    expect(bodyText).not.toContain('Unhandled');
    expect(bodyText).not.toContain('Cannot read');

    await takeScreenshot('linux-app-launch-no-errors');
  });
});
