/**
 * Navigation tests (Linux / WebdriverIO)
 *
 * Verify sidebar navigation works between views,
 * keyboard shortcuts switch views, Ctrl+B toggles sidebar,
 * and the active nav button gets the correct styling.
 */

import { readBinaryState } from '../helpers';
import { navigateSkippingWizard, navigateToView, takeScreenshot, waitForStableWidth } from './helpers';

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

  it('keyboard shortcut 5 navigates to Settings', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await browser.keys('5');
    await browser.pause(200);

    expect(await $('[data-testid="theme-btn-light"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-key-5');
  });

  it('Ctrl+B toggles sidebar', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    const sidebarSelector = 'aside';
    const initialWidth = (await $(sidebarSelector).getSize()).width;

    // Toggle collapsed
    await browser.keys(['Control', 'b']);
    // Wait for the collapse animation to settle, not a fixed pause.
    const collapsedWidth = await waitForStableWidth(sidebarSelector);
    // Sidebar should be narrower when collapsed
    expect(collapsedWidth).toBeLessThan(initialWidth);

    // Toggle back
    await browser.keys(['Control', 'b']);
    // Wait for the expand animation to finish before measuring.
    const restoredWidth = await waitForStableWidth(sidebarSelector);
    expect(restoredWidth).toBeGreaterThan(collapsedWidth);
    // It should return to (approximately) the expanded width, catching
    // cases where the expand animation was interrupted mid-transition.
    expect(restoredWidth).toBeLessThanOrEqual(initialWidth + 1);
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
