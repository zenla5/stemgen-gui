/**
 * Conditional global teardown wrapper for Playwright.
 *
 * Only runs the binary teardown when a binary project (`binary` or
 * `binary-smoke`) is passed on the command line.
 */

export default async function globalTeardown(): Promise<void> {
  if (
    !process.argv.includes('--project=binary') &&
    !process.argv.includes('--project=binary-smoke')
  ) {
    return;
  }

  const { default: binaryTeardown } = await import('./global-teardown');
  await binaryTeardown();
}
