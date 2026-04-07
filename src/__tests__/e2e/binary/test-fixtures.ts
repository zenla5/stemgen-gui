/**
 * Custom Playwright fixtures for binary E2E tests.
 *
 * Overrides the `browser` and `page` fixtures so that:
 * 1. `browser` connects to the running Tauri WebView2 via CDP
 * 2. `page` returns the existing Tauri app page (not a new blank page)
 *
 * Without this override, `page.evaluate()` calls that access localStorage
 * fail with "SecurityError: Access is denied for this document" because
 * about:blank has no accessible document.
 *
 * NOTE: We override `browser` because Playwright's built-in connectOptions
 * fails with WebView2 — the CDP /json/version endpoint doesn't return
 * webSocketDebuggerUrl, causing Playwright to crash on undefined.startsWith().
 * We handle this by reading the WS URL directly from the state file.
 */

import { test as base, type Page, type Browser, chromium } from '@playwright/test';
import http from 'http';
import { readBinaryState } from './helpers';

/**
 * Retrieve the WebSocket debugger URL from a CDP HTTP endpoint.
 * WebView2's /json/version may not include webSocketDebuggerUrl,
 * so we query it directly and fall back to constructing the URL.
 */
async function getWebSocketUrl(httpEndpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${httpEndpoint}/json/version`;
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          if (info.webSocketDebuggerUrl) {
            resolve(info.webSocketDebuggerUrl);
          } else {
            // WebView2 may not return webSocketDebuggerUrl.
            // Try /json/list for a page target with WS URL.
            reject(new Error(
              `CDP /json/version missing webSocketDebuggerUrl. Response: ${data.slice(0, 200)}`
            ));
          }
        } catch {
          reject(new Error(`Failed to parse CDP response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('CDP /json/version request timed out'));
    });
  });
}

export const test = base.extend<{ browser: Browser; page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  browser: async ({}, use) => {
    const state = readBinaryState();
    if (!state?.available || !state.wsUrl) {
      throw new Error(
        `Binary not available: ${state?.reason || 'no state file'}`
      );
    }

    let wsUrl = state.wsUrl;

    // If wsUrl is an HTTP URL (not ws://), we need to get the actual WS URL.
    // WebView2's CDP /json/version may not include webSocketDebuggerUrl,
    // so Playwright's built-in HTTP→WS discovery fails.
    if (!wsUrl.startsWith('ws://')) {
      wsUrl = await getWebSocketUrl(wsUrl);
    }

    const browser = await chromium.connectOverCDP(wsUrl);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(browser);
    await browser.close();
  },

  page: async ({ browser }, use) => {
    const state = readBinaryState();
    const appUrl = state?.appUrl || 'http://tauri.localhost/';

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

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(appPage);
    // Don't close — the page is the running Tauri app, shared across serial tests.
  },
});

export { expect } from '@playwright/test';
