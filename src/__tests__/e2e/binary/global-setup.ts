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
async function waitForCDP(port: number, timeoutMs = 30000): Promise<string> {
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

  // Prepare environment variables for CDP
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (process.platform === 'win32') {
    // WebView2 on Windows
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${CDP_PORT}`;
  } else if (process.platform === 'linux') {
    // WebKit2GTK on Linux
    env.WEBKIT_INSPECTOR_SERVER = `127.0.0.1:${CDP_PORT}`;
  }
  // macOS: WKWebView does not support CDP — binary tests will be skipped

  // Open log file
  const logStream = fs.createWriteStream(LOG_FILE);

  // Spawn the binary
  let child: ChildProcess;
  try {
    child = spawn(binaryPath, [], {
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

  // Pipe stdout/stderr to log file
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  // Track early exits
  child.on('exit', (code) => {
    console.error(`[binary-setup] Binary exited early with code ${code}`);
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

    // Connect briefly to capture the app URL
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.connectOverCDP(wsUrl);
    const contexts = browser.contexts();

    let appUrl: string | undefined;
    if (contexts.length > 0 && contexts[0].pages().length > 0) {
      appUrl = contexts[0].pages()[0].url();
      console.log(`[binary-setup] App URL: ${appUrl}`);
    } else {
      // The app might still be loading — wait a bit and retry
      await new Promise((r) => setTimeout(r, 2000));
      if (contexts.length > 0 && contexts[0].pages().length > 0) {
        appUrl = contexts[0].pages()[0].url();
      }
      if (!appUrl) {
        console.warn('[binary-setup] Could not determine app URL, will use fallback');
        appUrl = `http://localhost:${CDP_PORT}`;
      }
    }

    await browser.close();

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
