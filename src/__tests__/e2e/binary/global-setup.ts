/**
 * Global setup for binary E2E tests.
 *
 * Spawns the compiled Tauri binary with CDP enabled, waits for the
 * debugging endpoint to become reachable, and writes state to a file
 * so individual tests can connect.
 */

import { type FullConfig } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { getBinaryPath, CDP_PORT, PROJECT_ROOT, STATE_FILE } from './helpers';

const LOG_FILE = path.join(PROJECT_ROOT, 'test-results', 'binary.log');

/**
 * Poll the CDP endpoint until it responds or timeout is reached.
 * Returns the webSocketDebuggerUrl if available, otherwise the base URL.
 */
async function waitForCDP(port: number, timeoutMs = 75000): Promise<string> {
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const wsUrl = await checkCDPPort(port);
      if (wsUrl) return wsUrl;
    } catch {
      // Not ready yet, continue polling
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(
    `CDP not available on port ${port} after ${timeoutMs}ms. ` +
    `Ensure the binary was built with --features devtools.`
  );
}

/**
 * Query the CDP /json/list endpoint to find the app page URL.
 * Returns the URL of the first non-blank target, or null.
 */
function getAppUrlFromCDP(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const targets: Array<{ url: string; type: string; id?: string }> = JSON.parse(data);
          // Log all targets for diagnostics
          console.log(`[binary-setup] CDP targets (${targets.length}):`);
          for (const t of targets) {
            console.log(`[binary-setup]   - type=${t.type} url=${t.url} id=${t.id || '?'}`);
          }
          // Find the first page-type target that isn't about:blank
          for (const t of targets) {
            if (t.type === 'page' && t.url && t.url !== 'about:blank') {
              resolve(t.url);
              return;
            }
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check if the CDP endpoint is responding.
 */
function checkCDPPort(port: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          // Return the WebSocket URL or the HTTP base URL
          resolve(info.webSocketDebuggerUrl || `http://127.0.0.1:${port}`);
        } catch {
          console.warn(
            `[binary-setup] CDP parse error on port ${port}. ` +
            `HTTP ${res.statusCode}. Raw body (first 500 chars): ` +
            data.slice(0, 500)
          );
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

  const binaryPath = getBinaryPath();

  if (!binaryPath) {
    const reason = `Binary not found for platform ${process.platform}. ` +
      `Run 'cd src-tauri && cargo build --release --features devtools' first.`;
    console.warn(`[binary-setup] ${reason}`);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ available: false, reason }));

    // On CI, fail loudly instead of silently skipping all tests
    if (process.env.CI) {
      throw new Error(`[binary-setup] FATAL: Binary not found on CI. ${reason}`);
    }
    return;
  }

  console.log(`[binary-setup] Found binary: ${binaryPath}`);
  console.log(`[binary-setup] CDP port: ${CDP_PORT}`);

  // Prepare environment variables for CDP.
  // Windows WebView2 does NOT use the env var here: the app opens the CDP port
  // itself via `additional_browser_args` (devtools builds, see src-tauri/src/lib.rs),
  // which is reliable across WebView2 Evergreen runtime versions. The env-var
  // mechanism regressed on newer runtimes.
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (process.platform === 'linux') {
    // WebKit2GTK on Linux
    env.WEBKIT_INSPECTOR_SERVER = `127.0.0.1:${CDP_PORT}`;
  }
  // macOS: WKWebView does not support CDP — binary tests will be skipped

  // Open log file
  const logStream = fs.createWriteStream(LOG_FILE);

  // Spawn the binary
  let child: ChildProcess;
  try {
    // On Linux, wrap with xvfb-run to provide a virtual display
    const isLinux = process.platform === 'linux';
    const command = isLinux ? 'xvfb-run' : binaryPath;
    const args = isLinux ? ['--auto-servernum', binaryPath] : [];

    child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (err) {
    const reason = `Failed to spawn binary: ${err}`;
    console.error(`[binary-setup] ${reason}`);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ available: false, reason }));
    if (process.env.CI) {
      throw new Error(`[binary-setup] FATAL: Could not spawn binary on CI. ${reason}`);
    }
    return;
  }

  // Pipe stdout to log file; buffer stderr for diagnostics
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  // Track early exits with stderr output
  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });
  child.on('exit', (code, signal) => {
    console.error(`[binary-setup] Binary exited early with code ${code}, signal ${signal}`);
    if (stderrBuf) {
      console.error(`[binary-setup] Binary stderr (last 2000 chars): ${stderrBuf.slice(-2000)}`);
    }
  });

  if (!child.pid) {
    const reason = 'Binary spawned but no PID assigned';
    console.error(`[binary-setup] ${reason}`);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ available: false, reason }));
    return;
  }

  try {
    // Wait for CDP endpoint
    const wsUrl = await waitForCDP(CDP_PORT);
    console.log(`[binary-setup] CDP available at: ${wsUrl}`);

    // Detect the app URL by polling the CDP /json/list endpoint and
    // also checking Playwright's page list. The Tauri WebView page
    // may take a moment to appear alongside the about:blank target.
    const fallbackUrl = process.platform === 'win32' ? 'http://tauri.localhost' : 'tauri://localhost';
    const APP_URL_TIMEOUT = 20000;
    const APP_URL_POLL = 1000;

    let appUrl: string | null = null;
    const start = Date.now();
    while (Date.now() - start < APP_URL_TIMEOUT) {
      // Method 1: CDP /json/list
      appUrl = await getAppUrlFromCDP(CDP_PORT);
      if (appUrl) break;

      // Method 2: Playwright page list
      try {
        const { chromium } = await import('@playwright/test');
        const browser = await chromium.connectOverCDP(wsUrl);
        for (const ctx of browser.contexts()) {
          for (const page of ctx.pages()) {
            const url = page.url();
            if (url && url !== 'about:blank') {
              appUrl = url;
              break;
            }
          }
          if (appUrl) break;
        }
        await browser.close();
      } catch {
        // Playwright connection may fail intermittently
      }
      if (appUrl) break;

      await new Promise((r) => setTimeout(r, APP_URL_POLL));
    }

    if (appUrl) {
      console.log(`[binary-setup] App URL: ${appUrl}`);
    } else {
      console.warn('[binary-setup] Could not determine app URL, will use fallback');
      appUrl = fallbackUrl;
    }

    // Diagnostic: connect via Playwright and dump page state at setup time
    try {
      const { chromium: pw } = await import('@playwright/test');
      const browser = await pw.connectOverCDP(wsUrl);
      for (const ctx of browser.contexts()) {
        for (const page of ctx.pages()) {
          const url = page.url();
          console.log(`[binary-setup] CDP page: url=${url}`);
          if (url === appUrl || url === 'http://tauri.localhost/' || url === 'tauri://localhost') {
            const title = await page.title().catch(() => '<error>');
            const bodyLen = await page.evaluate(() => document.body?.innerHTML?.length || 0).catch(() => -1);
            const hasRoot = await page.evaluate(() => !!document.getElementById('root')).catch(() => false);
            console.log(`[binary-setup] Page state: title="${title}" bodyLen=${bodyLen} hasRoot=${hasRoot}`);
          }
        }
      }
      await browser.close();
    } catch (diagErr) {
      console.warn(`[binary-setup] Page state diagnostic failed: ${diagErr}`);
    }

    // Write success state
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({
        available: true,
        wsUrl,
        appUrl,
        pid: child.pid,
      })
    );

    console.log(`[binary-setup] Binary ready (PID: ${child.pid})`);
  } catch (err) {
    const reason = `CDP connection failed: ${err}`;
    console.error(`[binary-setup] ${reason}`);

    // Kill the binary
    try {
      child.kill('SIGTERM');
    } catch {
      // Process may have already exited
    }

    fs.writeFileSync(STATE_FILE, JSON.stringify({ available: false, reason }));

    // On CI, fail loudly instead of silently skipping all tests
    if (process.env.CI) {
      throw new Error(`[binary-setup] FATAL: CDP connection failed on CI. ${reason}`);
    }
    // Don't throw — let tests skip gracefully
  }
}
