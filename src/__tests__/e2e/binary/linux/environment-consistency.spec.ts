/**
 * Environment Consistency E2E tests (Linux / WebdriverIO)
 *
 * Covers:
 *  (a) Footer / Detailed Status consistency across PackageStatus states
 *  (b) False-red regression — all-available must render all green
 *  (c) Sidecar deployment repair button appears when sidecar is missing
 *  (d) "Install All Missing" shows per-component progress list
 *  (e) Model download blocked with actionable error when sidecar absent
 *
 * Key adaptations from Windows (Playwright):
 *  - page.exposeFunction() replaced with window.__flag set via browser.execute()
 *  - page.on('console') replaced with DOM health check
 *  - mockValidateEnvironment ported to browser.execute() (in helpers.ts)
 */

import { readBinaryState } from '../helpers';
import {
  navigateSkippingWizard,
  navigateToView,
  mockValidateEnvironment,
  mockTauriCommand,
  setCommandFlag,
  getCommandFlag,
  isDisplayedSafe,
  takeScreenshot,
} from './helpers';

// ─── Test Data ────────────────────────────────────────────────────────────────

const ALL_AVAILABLE_ENV = {
  isReady: true,
  python: 'available',
  pythonPath: '/usr/bin/python3',
  pythonVersion: '3.13.1',
  pytorch: 'available',
  pytorchVersion: '2.11.0',
  torchaudio: 'available',
  torchaudioVersion: '2.11.0',
  demucs: 'available',
  demucsVersion: '4.0.1',
  cuda: 'available',
  gpuName: 'NVIDIA RTX 3080',
  ffmpeg: 'available',
  ffprobe: 'available',
  sidecarScript: 'available',
  sidecarScriptPath: '/data/stemgen_sidecar.py',
  warnings: [],
};

const MISSING_SIDECAR_ENV = {
  ...ALL_AVAILABLE_ENV,
  isReady: false,
  sidecarScript: { missing: 'Sidecar script not found at /data/stemgen_sidecar.py' },
  sidecarScriptPath: undefined,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Environment Consistency — false-red regression', () => {
  let appUrl: string;

  before(function () {
    const state = readBinaryState();
    if (!state?.available) {
      this.skip();
      return;
    }
    appUrl = state.appUrl!;
  });

  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    // Apply default mock BEFORE navigating to settings so the initial
    // validate_environment call on component mount is intercepted.
    await mockValidateEnvironment(ALL_AVAILABLE_ENV);
    await navigateToView('settings');
  });

  it('(b) all-available environment renders every Detailed Status row green', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Mock already applied in beforeEach — click Refresh to trigger re-validation
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1000);

    // Detailed Status should have NO red icons for required deps
    const redIcons = await $$('[data-testid="detailed-status"] .text-red-600');
    expect(redIcons.length).toBe(0);

    // Detailed Status should have NO red-500 icons either (XCircle)
    const redIconsAlt = await $$('[data-testid="detailed-status"] .text-red-500');
    expect(redIconsAlt.length).toBe(0);
    await takeScreenshot('linux-env-all-green');
  });

  // NOTE: Windows test checks console.error for "Malformed PackageStatus" via
  // page.on('console'). WebKit/tauri-driver does not expose the console stream.
  // This test verifies the DOM state is correct instead — no red icons should
  // appear when all deps report "available".
  it('(b) valid PackageStatus strings render without DOM error indicators', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Mock already applied in beforeEach
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(2000);

    // After mocking all-available and refreshing, no red icons should appear
    const redIcons = await $$('[data-testid="detailed-status"] .text-red-600');
    expect(redIcons.length).toBe(0);
    await takeScreenshot('linux-env-no-dom-errors');
  });

  it('(a) footer and Detailed Status agree when all deps valid', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Mock already applied in beforeEach
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1500);

    // The "Environment ready" banner should be visible
    const bodyText = await $('body').getText();
    expect(bodyText).toContain('Environment ready for stem separation');

    // Footer should show "Ready"
    expect(bodyText).toContain('Ready');
    await takeScreenshot('linux-env-footer-agree');
  });
});

describe('Sidecar Deployment — repair and guard', () => {
  let appUrl: string;

  before(function () {
    const state = readBinaryState();
    if (!state?.available) {
      this.skip();
      return;
    }
    appUrl = state.appUrl!;
  });

  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    // Default mock — tests override with MISSING_SIDECAR_ENV as needed
    await mockValidateEnvironment(ALL_AVAILABLE_ENV);
    await navigateToView('settings');
  });

  it('(c) "Repair Installation" button appears when sidecar is missing', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await mockValidateEnvironment(MISSING_SIDECAR_ENV);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1500);

    expect(await $('[data-testid="repair-sidecar-btn"]').isDisplayed()).toBe(true);
    await takeScreenshot('linux-env-repair-btn');
  });

  it('(c) clicking "Repair Installation" calls deploy_sidecar', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await mockValidateEnvironment(MISSING_SIDECAR_ENV);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1000);

    // Use setCommandFlag instead of exposeFunction (not available in WebdriverIO).
    // This patches __TAURI_INTERNALS__ via Proxy to set a flag when deploy_sidecar is called.
    await setCommandFlag('deploy_sidecar');

    if (await isDisplayedSafe('[data-testid="repair-sidecar-btn"]')) {
      await $('[data-testid="repair-sidecar-btn"]').click();
      await browser.pause(1000);

      const deployCalled = await getCommandFlag('deploy_sidecar');
      expect(deployCalled).toBe(true);
    }
    await takeScreenshot('linux-env-repair-call');
  });

  it('(c) failure reason is shown for missing sidecar', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await mockValidateEnvironment(MISSING_SIDECAR_ENV);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1500);

    const failureReason = $('[data-testid="dep-failure-reason-sidecar"]');
    expect(await failureReason.isDisplayed()).toBe(true);
    expect(await failureReason.getText()).not.toBe('');
    await takeScreenshot('linux-env-failure-reason');
  });

  it('(c) "Environment not ready" when sidecar is missing', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await mockValidateEnvironment(MISSING_SIDECAR_ENV);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1500);

    const bodyText = await $('body').getText();
    expect(bodyText).toContain('Environment not ready');
    await takeScreenshot('linux-env-not-ready');
  });
});

describe('Install All Missing — progress surfacing', () => {
  let appUrl: string;

  before(function () {
    const state = readBinaryState();
    if (!state?.available) {
      this.skip();
      return;
    }
    appUrl = state.appUrl!;
  });

  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await mockValidateEnvironment(ALL_AVAILABLE_ENV);
    await navigateToView('settings');
  });

  it('(d) clicking "Install All Missing" shows an install plan', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    // Mock an environment with some deps missing
    const partialEnv = {
      ...ALL_AVAILABLE_ENV,
      isReady: false,
      python: { missing: 'Python not found' },
      pytorch: { missing: 'PyTorch not installed' },
    };
    await mockValidateEnvironment(partialEnv);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1000);

    if (!await isDisplayedSafe('[data-testid="install-all-btn"]')) {
      return; // Install All Missing button not visible
    }

    // Mock install_dependency and get_available_installers to return quickly
    await mockTauriCommand('install_dependency', { success: true, depName: 'mock', output: [] });
    await mockTauriCommand('get_available_installers', [{ id: 'pip', name: 'pip', commandDisplay: 'pip install', needsElevation: false }]);

    await $('[data-testid="install-all-btn"]').click();

    // The install plan should appear
    await browser.waitUntil(
      async () => isDisplayedSafe('[data-testid="install-plan"]'),
      { timeout: 5000, timeoutMsg: 'Install plan did not appear' }
    );

    // At least one row should show status
    const pythonStatus = await isDisplayedSafe('[data-testid="install-plan-status-python"]');
    const pytorchStatus = await isDisplayedSafe('[data-testid="install-plan-status-pytorch"]');
    expect(pythonStatus || pytorchStatus).toBe(true);
    await takeScreenshot('linux-env-install-plan');
  });
});

describe('Model Download — sidecar guard', () => {
  let appUrl: string;

  before(function () {
    const state = readBinaryState();
    if (!state?.available) {
      this.skip();
      return;
    }
    appUrl = state.appUrl!;
  });

  beforeEach(async () => {
    const state = readBinaryState();
    if (!state?.available) return;
    await navigateSkippingWizard(appUrl);
    await mockValidateEnvironment(ALL_AVAILABLE_ENV);
    await navigateToView('settings');
  });

  it('(e) model download shows error when sidecar is absent', async () => {
    const state = readBinaryState();
    if (!state?.available) return;

    await mockValidateEnvironment(MISSING_SIDECAR_ENV);
    await $('[data-testid="refresh-env-btn"]').click();
    await browser.pause(1000);

    if (!await isDisplayedSafe('[data-testid="download-btn-htdemucs"]')) {
      return; // No download button visible (model may be downloaded)
    }

    await $('[data-testid="download-btn-htdemucs"]').click();
    await browser.pause(1000);

    // Should show a sidecar-specific error
    const sidecarError = $('[data-testid="model-sidecar-error-htdemucs"]');
    await sidecarError.waitForDisplayed({ timeout: 5000 });
    const errorText = await sidecarError.getText();
    expect(errorText).toContain('Sidecar script missing');
    await takeScreenshot('linux-env-sidecar-error');
  });
});
