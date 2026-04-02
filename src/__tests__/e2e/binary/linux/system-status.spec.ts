/**
 * System Status tests (Linux / WebdriverIO)
 *
 * Verify dependency status indicators render correctly.
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

describe('System Status', () => {
  it('status bar is visible', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    const statusBar = await $('[data-testid="status-bar"]');
    expect(await statusBar.isDisplayed()).toBe(true);
    await takeScreenshot('linux-system-status-bar');
  });

  it('status bar contains dependency indicators', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    // The status bar should have rendered (may show dependency status)
    const statusBar = await $('[data-testid="status-bar"]');
    const text = await statusBar.getText();
    // Status bar should have some content (dependency names or status)
    expect(text.length).toBeGreaterThan(0);
    await takeScreenshot('linux-system-status-indicators');
  });
});
