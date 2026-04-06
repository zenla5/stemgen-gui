/**
 * Settings tests (Linux / WebdriverIO)
 *
 * Verify the settings panel opens, renders correctly,
 * theme toggling works, language selector is present,
 * and state persists across reloads.
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

describe('Settings', () => {
  afterEach(async () => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(appUrl);
    }
  });

  it('settings view heading is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    expect(await $('h2').getText()).toContain('Settings');
    await takeScreenshot('linux-settings-heading');
  });

  it('theme buttons are visible', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="theme-btn-dark"]').isDisplayed()).toBe(true);
    expect(await $('[data-testid="theme-btn-system"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-settings-theme-btns');
  });

  it('clicking light theme adds light class to html', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    await $('[data-testid="theme-btn-light"]').click();
    const htmlClass = await $('html').getAttribute('class');
    expect(htmlClass).toMatch(/light/);
    await takeScreenshot('linux-settings-light');
  });

  it('clicking dark theme adds dark class to html', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    await $('[data-testid="theme-btn-dark"]').click();
    const htmlClass = await $('html').getAttribute('class');
    expect(htmlClass).toMatch(/dark/);
    await takeScreenshot('linux-settings-dark');
  });

  it('theme persists across page reload', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Set dark theme
    await $('[data-testid="theme-btn-dark"]').click();
    const htmlClassBefore = await $('html').getAttribute('class');
    expect(htmlClassBefore).toMatch(/dark/);

    // Reload — re-skip wizard
    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Theme should still be dark
    const htmlClassAfter = await $('html').getAttribute('class');
    expect(htmlClassAfter).toMatch(/dark/);
    await takeScreenshot('linux-settings-persist');
  });

  it('language selector is present and functional', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    const selector = $('[data-testid="language-select"]');
    expect(await selector.isDisplayed()).toBe(true);

    // Should have at least one option
    const options = await $$('select[data-testid="language-select"] option');
    expect(options.length).toBeGreaterThanOrEqual(1);
    await takeScreenshot('linux-settings-language');
  });

  it('refresh environment button is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    expect(await $('[data-testid="refresh-env-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-settings-refresh-btn');
  });

  it('refresh button is clickable', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    await $('[data-testid="refresh-env-btn"]').click();

    // App should still be functional
    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-settings-refresh-click');
  });

  it('system status section is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Look for System Status text
    const bodyText = await $('body').getText();
    expect(bodyText).toContain('System Status');
    await takeScreenshot('linux-settings-system-status');
  });
});
