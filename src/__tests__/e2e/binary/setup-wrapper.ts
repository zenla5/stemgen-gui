/**
 * Conditional global setup wrapper for Playwright.
 *
 * Only runs the binary setup when a binary project (`binary` or
 * `binary-smoke`) is passed on the command line, so non-binary test runs
 * don't spawn a Tauri binary.
 */

import type { FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (
    !process.argv.includes('--project=binary') &&
    !process.argv.includes('--project=binary-smoke')
  ) {
    return;
  }

  const { default: binarySetup } = await import('./global-setup');
  await binarySetup(config);
}
