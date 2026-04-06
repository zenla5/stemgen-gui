/**
 * Stem Mixer tests (Linux / WebdriverIO)
 *
 * Verify the stem mixer view renders correctly,
 * empty state shows, and playback controls are present.
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

describe('Stem Mixer', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await navigateToView('mixer');
  });

  afterEach(async () => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(appUrl);
    }
  });

  it('no stems message shows when nothing loaded', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const noStems = $('[data-testid="no-stems-msg"]');
    expect(await noStems.isDisplayed()).toBe(true);
    expect(await noStems.getText()).toContain('Select a file');
    await takeScreenshot('linux-mixer-empty-state');
  });

  it('reset button is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="reset-mixer-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-mixer-reset-btn');
  });

  it('mixer heading is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('h2').getText()).toContain('Stem Mixer');
    await takeScreenshot('linux-mixer-heading');
  });

  it('play/pause button is present but disabled when no stems', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const btn = $('[data-testid="play-pause-btn"]');
    expect(await btn.isDisplayed()).toBe(true);
    expect(await btn.isEnabled()).toBe(false);
    await takeScreenshot('linux-mixer-play-pause');
  });

  it('skip start button is not visible when no stems', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="skip-start-btn"]').isDisplayed()).toBe(false);
  });

  it('skip end button is not visible when no stems', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="skip-end-btn"]').isDisplayed()).toBe(false);
  });

  it('master volume slider is not visible when no stems', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="master-volume"]').isDisplayed()).toBe(false);
  });

  it('stem cards are not rendered when no stems', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const stemCards = await $$('[data-testid="stem-card"]');
    expect(stemCards.length).toBe(0);
  });

  it('reset button is clickable', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await $('[data-testid="reset-mixer-btn"]').click();

    // App should still be functional (no crash)
    expect(await $('[data-testid="no-stems-msg"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-mixer-reset-click');
  });

  it('mixer has accessible region label', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const region = $('[role="region"][aria-label="Stem Mixer"]');
    expect(await region.isDisplayed()).toBe(true);
    await takeScreenshot('linux-mixer-accessible');
  });
});
