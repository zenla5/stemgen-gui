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
 * so this config only re-exports it under a self-documenting name.
 */

import { config as baseConfig } from "./wdio.conf";

export const config: typeof baseConfig = baseConfig;
