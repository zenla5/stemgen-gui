/**
 * Navigation tests (Linux / WebdriverIO)
 *
 * Verify sidebar navigation works between views,
 * keyboard shortcuts switch views, Ctrl+B toggles sidebar,
 * and the active nav button gets the correct styling.
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
  it('sidebar click navigates to Files view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');
    await navigateToView('files');

    // Files view should show the drop zone
    expect(await $('[data-testid="drop-zone"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-files');
  });

  it('sidebar click navigates to Queue view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('queue');

    // Queue view should show empty state
    expect(await $('[data-testid="queue-empty"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-queue');
  });

  it('sidebar click navigates to Mixer view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('mixer');

    // Mixer view should show the no-stems message
    expect(await $('[data-testid="no-stems-msg"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-mixer');
  });

  it('sidebar click navigates to Settings view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');

    // Settings view should show theme buttons
    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-settings');
  });

  it('keyboard shortcut 1 navigates to Files', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');
    await browser.keys('1');
    await browser.pause(200);

    expect(await $('[data-testid="drop-zone"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-key-1');
  });

  it('keyboard shortcut 2 navigates to Queue', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await browser.keys('2');
    await browser.pause(200);

    expect(await $('[data-testid="queue-empty"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-key-2');
  });

  it('keyboard shortcut 3 navigates to Mixer', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await browser.keys('3');
    await browser.pause(200);

    expect(await $('[data-testid="no-stems-msg"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-key-3');
  });

  it('keyboard shortcut 4 navigates to Settings', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await browser.keys('4');
    await browser.pause(200);

    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-key-4');
  });

  it('Ctrl+B toggles sidebar', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    const sidebar = $('aside');
    const initialWidth = (await sidebar.getSize()).width;

    // Toggle collapsed
    await browser.keys(['Control', 'b']);
    await browser.pause(300);

    const collapsedWidth = (await sidebar.getSize()).width;
    // Sidebar should be narrower when collapsed
    expect(collapsedWidth).toBeLessThan(initialWidth);

    // Toggle back
    await browser.keys(['Control', 'b']);
    await browser.pause(300);

    const restoredWidth = (await sidebar.getSize()).width;
    expect(restoredWidth).toBeGreaterThan(collapsedWidth);
    await takeScreenshot('linux-nav-sidebar-toggle');
  });

  it('view navigation updates sidebar active state', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    // Navigate to Settings
    await navigateToView('settings');

    // The Settings nav button should have active styling
    const settingsClass = await $('[data-testid="nav-settings"]').getAttribute('class');
    expect(settingsClass).toMatch(/bg-primary/);

    // Navigate to Files
    await navigateToView('files');

    // The Files nav button should now have active styling
    const filesClass = await $('[data-testid="nav-files"]').getAttribute('class');
    expect(filesClass).toMatch(/bg-primary/);
    await takeScreenshot('linux-nav-active-state');
  });
});
