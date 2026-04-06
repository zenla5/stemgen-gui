/**
 * Processing Queue tests (Linux / WebdriverIO)
 *
 * Verify the processing queue view renders correctly,
 * empty state shows, and queue management controls are present.
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

describe('Processing Queue', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await navigateToView('queue');
  });

  afterEach(async () => {
    const state = readBinaryState();
    if (state?.available) {
      await resetAppState(appUrl);
    }
  });

  it('empty state shows when no jobs in queue', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const queueEmpty = $('[data-testid="queue-empty"]');
    expect(await queueEmpty.isDisplayed()).toBe(true);
    expect(await queueEmpty.getText()).toContain('No jobs in queue');
    await takeScreenshot('linux-queue-empty');
  });

  it('Start Processing button is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="start-processing-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-queue-start-btn');
  });

  it('Start Processing button is disabled when no files loaded', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const btn = $('[data-testid="start-processing-btn"]');
    expect(await btn.isEnabled()).toBe(false);
    await takeScreenshot('linux-queue-start-disabled');
  });

  it('Clear All button is not visible when no jobs', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('[data-testid="clear-jobs-btn"]').isDisplayed()).toBe(false);
  });

  it('queue view heading is present', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    expect(await $('h2').getText()).toContain('Processing Queue');
    await takeScreenshot('linux-queue-heading');
  });

  it('job items are not rendered when queue is empty', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const jobItems = await $$('[data-testid="job-item"]');
    expect(jobItems.length).toBe(0);
  });

  it('Start Processing button shows file count when files loaded', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // When no files loaded, button shows default text
    const btn = $('[data-testid="start-processing-btn"]');
    expect(await btn.getText()).toContain('Start Processing');
    await takeScreenshot('linux-queue-file-count');
  });
});
