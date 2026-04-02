/**
 * Conditional global teardown wrapper for Playwright.
 *
 * Only runs the binary teardown when `--project=binary` is passed on the
 * command line.
 */

export default async function globalTeardown(): Promise<void> {
  if (!process.argv.includes('--project=binary')) {
    return;
  }

  const { default: binaryTeardown } = await import('./global-teardown');
  await binaryTeardown();
}
