/**
 * WebdriverIO configuration for Windows binary E2E tests.
 *
 * Windows uses WebView2, which is driven through Microsoft Edge WebDriver
 * (`msedgedriver`). tauri-driver locates that driver on PATH, so the CI
 * workflow must ensure it is available before running these tests (see the
 * `edgedriver` devDependency and the `e2e-binary` Windows steps in ci.yml).
 *
 * The specs under `binary/linux/**` are platform-agnostic WebdriverIO specs,
 * so the same suite is reused for both Linux and Windows. The base config is
 * already cross-platform (it resolves the Windows `.exe` binary via
 * `getBinaryPath()` and finds `tauri-driver` under `USERPROFILE` on Windows),
 * so this config only overrides the connection retry behaviour to fail fast.
 */

import { config as baseConfig } from './wdio.conf';

export const config: typeof baseConfig = {
  ...baseConfig,
  // Fail fast on CI: we do NOT want session-creation failures to burn the full
  // job timeout retrying once per spec file. Stop at the first failing spec and
  // reduce the per-session retry window so a broken WebDriver session surfaces
  // in seconds, not ~45 minutes.
  bail: 1,
  connectionRetryTimeout: 20000,
  connectionRetryCount: 1,
};
