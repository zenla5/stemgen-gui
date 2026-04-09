/**
 * Library navigation tests (Linux / WebdriverIO)
 *
 * Verify Library tab navigation works via sidebar click.
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

describe('Library Navigation', () => {
  it('sidebar click navigates to Library view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);
    await navigateToView('library');

    // Library view should render — either empty state or overview panel
    const libraryContent = await $('[data-testid="library-overview-panel"], [data-testid="empty-add-root-btn"]');
    expect(await libraryContent.isDisplayed()).toBe(true);
    await takeScreenshot('linux-nav-library');
  });

  it('keyboard shortcut 4 navigates to Library view', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await navigateSkippingWizard(appUrl);

    // Press '4' to navigate to Library
    await browser.keys('4');
    await browser.pause(500);

    // Library view should be active
    const activeNav = await $('[data-testid="nav-library"].bg-primary\\/10, [data-testid="nav-library"].text-primary');
    expect(await activeNav.isExisting()).toBe(true);
    await takeScreenshot('linux-nav-library-keyboard');
  });
});