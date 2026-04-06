/**
 * First-Run Wizard tests (Linux / WebdriverIO)
 *
 * Verify the setup wizard appears on first launch,
 * shows dependency checks, and allows skipping to the main app.
 */

import { readBinaryState } from '../helpers';
import { navigateWithWizard, takeScreenshot } from './helpers';

let appUrl: string;

before(function () {
  const state = readBinaryState();
  if (!state?.available) {
    this.skip();
    return;
  }
  appUrl = state.appUrl!;
});

describe('First Run Wizard', () => {
  it('wizard shows welcome step by default', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    expect(await $('[data-testid="wizard-step"]').isDisplayed()).toBe(true);
    // Look for welcome text in the body
    const bodyText = await $('body').getText();
    expect(bodyText).toContain('Welcome to Stemgen GUI');
    await takeScreenshot('linux-wizard-welcome');
  });

  it('wizard shows Start Check and Skip buttons', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    // Start Check button (text-based selector)
    expect(await $('button=Start Check').isDisplayed()).toBe(true);
    expect(await $('[data-testid="wizard-skip"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-wizard-buttons');
  });

  it('wizard shows dependency list on welcome step', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    const bodyText = await $('body').getText();
    expect(bodyText).toContain('FFmpeg');
    expect(bodyText).toContain('Python');
    expect(bodyText).toContain('PyTorch');
    await takeScreenshot('linux-wizard-dep-list');
  });

  it('wizard navigates to check step on Start Check click', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    await $('button=Start Check').click();
    const bodyText = await $('body').getText();
    // Wait for checking state
    await browser.waitUntil(
      async () => (await $('body').getText()).includes('Checking dependencies'),
      { timeout: 10000, timeoutMsg: 'Wizard did not enter checking state' }
    );
    await takeScreenshot('linux-wizard-checking');
  });

  it('wizard shows results after dependency check completes', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    await $('button=Start Check').click();
    // Wait up to 60s for check to complete
    await browser.waitUntil(
      async () => (await $('body').getText()).includes('Dependency Check Complete'),
      { timeout: 60000, timeoutMsg: 'Dependency check did not complete within 60s' }
    );
    await takeScreenshot('linux-wizard-results');
  });

  it('wizard results show dependency rows with status', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    await $('button=Start Check').click();
    await browser.waitUntil(
      async () => (await $('body').getText()).includes('Dependency Check Complete'),
      { timeout: 60000, timeoutMsg: 'Dependency check did not complete within 60s' }
    );

    // All 5 dependency rows should be visible
    const depRows = await $$('[data-testid="wizard-dep-row"]');
    expect(depRows.length).toBe(5);

    // Each row should have a status element
    const statusElements = await $$('[data-testid="wizard-dep-status"]');
    expect(statusElements.length).toBe(5);

    await takeScreenshot('linux-wizard-results-rows');
  });

  it('wizard skip button navigates to main app', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateWithWizard(appUrl);

    await $('[data-testid="wizard-skip"]').click();
    await $('[data-testid="nav-files"]').waitForDisplayed({ timeout: 10000 });
    await takeScreenshot('linux-wizard-skipped');
  });
});
