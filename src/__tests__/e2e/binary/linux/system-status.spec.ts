/**
 * System Status tests (Linux / WebdriverIO)
 *
 * Covers:
 *  (a) Refresh completes without hanging
 *  (b) Correct colour per component state
 *  (c) Footer ↔ Detailed Status agreement
 *  (d) "Install All Missing" triggers a status refresh (adapted — no exposeFunction)
 *  (e) Model download surfaces progress or error
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

describe('System Status — colour and consistency', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');
  });

  it('refresh completes without hanging (proxy for no blocking window)', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const refreshBtn = $('[data-testid="refresh-env-btn"]');
    await refreshBtn.click();

    // The button should not be in a permanently disabled/loading state
    await refreshBtn.waitForEnabled({ timeout: 15000 });
    await takeScreenshot('linux-sys-refresh');
  });

  it('detected components render green check icons', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await browser.pause(2000); // allow validation to complete

    // Check that at least one green icon appears in Detailed Status
    const greenIcons = await $$('[data-testid="detailed-status"] .text-green-600, [data-testid="detailed-status"] .text-green-500');
    expect(greenIcons.length).toBeGreaterThan(0);
    await takeScreenshot('linux-sys-green-icons');
  });

  it('CUDA unavailable does not render as error red', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await browser.pause(2000);

    // Find the CUDA row and check it has no red error icons
    const cudaText = await $('body').getText();
    if (cudaText.includes('CUDA')) {
      // XPath: find element containing "CUDA" text, then check its parent for red icons
      const redInCuda = await $$('//*[contains(text(),"CUDA")]/ancestor::*[1]//*[contains(@class,"text-red-600")]');
      expect(redInCuda.length).toBe(0);
    }
    await takeScreenshot('linux-sys-cuda');
  });

  it('footer "ready" status agrees with Detailed Status icons', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await browser.pause(3000);

    const bodyText = await $('body').getText();
    const isReady = bodyText.includes('Environment ready for stem separation');

    if (isReady) {
      // No required rows should show a red icon
      const redIcons = await $$('[data-testid="detailed-status"] .text-red-600');
      expect(redIcons.length).toBe(0);
    } else {
      // Footer says not ready → at least one required dep must be red
      const redIcons = await $$('[data-testid="detailed-status"] .text-red-600, [data-testid="detailed-status"] .text-red-500');
      expect(redIcons.length).toBeGreaterThan(0);
    }
    await takeScreenshot('linux-sys-footer-agreement');
  });

  it('"Install All Missing" button triggers a status refresh', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    const installBtn = $('[data-testid="install-all-btn"]');

    // Skip if button is not present (all deps already installed)
    const isPresent = await installBtn.isDisplayed().catch(() => false);
    if (!isPresent) {
      return; // no missing deps — nothing to test
    }

    await installBtn.click();

    // Wait for the install flow to complete, then verify refresh-env-btn
    // re-enables (observable proxy for validate_environment being called).
    // NOTE: Windows test uses exposeFunction to verify the invoke was called;
    // WebdriverIO/tauri-driver does not support exposeFunction.
    const refreshBtn = $('[data-testid="refresh-env-btn"]');
    await browser.waitUntil(
      async () => {
        try {
          return await refreshBtn.isEnabled();
        } catch {
          return false;
        }
      },
      { timeout: 15000, interval: 500, timeoutMsg: 'refresh-env-btn did not re-enable after Install All Missing' }
    );
    await takeScreenshot('linux-sys-install-all');
  });
});

describe('Model Download — error surfacing', () => {
  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await navigateToView('settings');
  });

  for (const modelId of ['htdemucs', 'htdemucs_ft', 'bs_roformer', 'demucs']) {
    it(`${modelId}: download button does not silently reset bar`, async () => {
      const state = readBinaryState();
      if (!state?.available) return;

      const downloadBtn = $(`[data-testid="download-btn-${modelId}"]`);
      const isPresent = await downloadBtn.isDisplayed().catch(() => false);
      if (!isPresent) {
        return; // model may already be downloaded
      }

      await downloadBtn.click();

      // Within 30s, either the progress bar shows > 0% or an error message appears
      await browser.waitUntil(
        async () => {
          try {
            const progressBar = $(`[data-testid="progress-bar-${modelId}"]`);
            const errorMsg = $(`[data-testid="download-error-${modelId}"]`);

            const progressDisplayed = await progressBar.isDisplayed().catch(() => false);
            const hasProgress = progressDisplayed &&
              parseFloat(await progressBar.getAttribute('aria-valuenow') ?? '0') > 0;
            const hasError = await errorMsg.isDisplayed().catch(() => false);

            return hasProgress || hasError;
          } catch {
            return false;
          }
        },
        { timeout: 30000, interval: 500, timeoutMsg: `${modelId} download made no progress or error within 30s` }
      );
      await takeScreenshot(`linux-sys-download-${modelId}`);
    });
  }
});
