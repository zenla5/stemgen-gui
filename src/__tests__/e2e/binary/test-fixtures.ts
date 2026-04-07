/**
 * Custom Playwright fixtures for binary E2E tests.
 *
 * Overrides the default `page` fixture so that instead of creating a new
 * blank page (about:blank), it returns the existing Tauri app page from
 * the CDP-connected WebView2 browser.
 *
 * Without this override, `page.evaluate()` calls that access localStorage
 * fail with "SecurityError: Access is denied for this document" because
 * about:blank has no accessible document.
 */

import { test as base, type Page } from '@playwright/test';
import { readBinaryState } from './helpers';

export const test = base.extend<{ page: Page }>({
  page: async ({ browser }, use) => {
    const state = readBinaryState();
    const appUrl = state?.appUrl || 'http://tauri.localhost/';

    // The browser is connected via CDP to the Tauri WebView2.
    // Find the existing Tauri app page in the default context
    // instead of creating a new blank page.
    const defaultContext = browser.contexts()[0];
    let appPage: Page | undefined;
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
      appPage = defaultContext?.pages().find((p) => {
        const url = p.url();
        return (
          url === appUrl ||
          url.startsWith('http://tauri.localhost') ||
          url.startsWith('tauri://localhost')
        );
      });
      if (appPage) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!appPage) {
      // Fallback: first non-blank page
      appPage = defaultContext?.pages().find((p) => p.url() !== 'about:blank');
    }

    if (!appPage) {
      const urls = defaultContext?.pages().map((p) => p.url()) ?? [];
      throw new Error(
        `Tauri app page not found. Available pages: ${urls.join(', ')}`
      );
    }

    await use(appPage);
    // Don't close — the page is the running Tauri app, shared across serial tests.
  },
});

export { expect } from '@playwright/test';
