/**
 * WebdriverIO configuration for Linux binary E2E tests.
 *
 * Uses tauri-driver (W3C WebDriver) to drive the compiled Tauri binary
 * via WebKit2GTK's native WebDriver support.
 */

import type { Options } from '@wdio/types';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = __dirname;

function getBinaryPath(): string | null {
  const candidates = [
    path.join(PROJECT_ROOT, 'target', 'release', 'stemgen-gui'),
    path.join(PROJECT_ROOT, 'target', 'release', 'stemgen_gui'),
    path.join(PROJECT_ROOT, 'src-tauri', 'target', 'release', 'stemgen-gui'),
    path.join(PROJECT_ROOT, 'src-tauri', 'target', 'release', 'stemgen_gui'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const TAURI_DRIVER_PORT = 4444;
const TAURI_NATIVE_PORT = 4445;

let tauriDriverProcess: ChildProcess | null = null;

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    tsNodeOpts: {
      project: path.join(PROJECT_ROOT, 'tsconfig.json'),
    },
  },
  specs: ['./src/__tests__/e2e/binary/linux/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,
  // Use raw WebDriver protocol (connect to tauri-driver)
  automationProtocol: 'webdriver',
  hostname: '127.0.0.1',
  port: TAURI_DRIVER_PORT,
  path: '/',
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: '', // set in beforeSession
      },
    } as unknown as WebdriverIO.Capabilities,
  ],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  reporters: ['spec'],

  /**
   * Start tauri-driver before the test session.
   */
  beforeSession: async function () {
    const binaryPath = getBinaryPath();
    if (!binaryPath) {
      const reason = `Binary not found. Run 'cd src-tauri && cargo build --release --features devtools' first.`;
      if (process.env.CI) {
        throw new Error(`FATAL on CI: ${reason}`);
      }
      console.warn(`[wdio] ${reason}`);
      return;
    }

    console.log(`[wdio] Found binary: ${binaryPath}`);

    // Update capability with the actual binary path
    const caps = config.capabilities?.[0] as Record<string, unknown>;
    if (caps) {
      caps['tauri:options'] = { application: binaryPath };
    }

    // Start tauri-driver
    const tauriDriverBin =
      process.env.TAURI_DRIVER_BIN ||
      path.join(process.env.HOME || '', '.cargo', 'bin', 'tauri-driver');

    if (!fs.existsSync(tauriDriverBin)) {
      throw new Error(
        `tauri-driver not found at ${tauriDriverBin}. Install with: cargo install tauri-driver --locked`
      );
    }

    console.log(
      `[wdio] Starting tauri-driver: ${tauriDriverBin} (port ${TAURI_DRIVER_PORT}, native ${TAURI_NATIVE_PORT})`
    );
    tauriDriverProcess = spawn(
      tauriDriverBin,
      ['--port', String(TAURI_DRIVER_PORT), '--native-port', String(TAURI_NATIVE_PORT)],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    tauriDriverProcess.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[tauri-driver] ${msg}`);
    });

    tauriDriverProcess.stdout?.on('data', (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[tauri-driver] ${msg}`);
    });

    // Wait for tauri-driver to be ready
    const maxWait = 15000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const { default: http } = await import('http');
        await new Promise<void>((resolve, reject) => {
          const req = http.get(
            `http://127.0.0.1:${TAURI_DRIVER_PORT}/status`,
            (res) => {
              if (res.statusCode === 200) {
                resolve();
              } else {
                reject(new Error(`Status: ${res.statusCode}`));
              }
            }
          );
          req.on('error', reject);
          req.setTimeout(2000, () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });
        console.log('[wdio] tauri-driver is ready');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('tauri-driver did not start within timeout');
  },

  /**
   * Stop tauri-driver after the test session.
   */
  afterSession: function () {
    if (tauriDriverProcess) {
      console.log('[wdio] Stopping tauri-driver');
      tauriDriverProcess.kill('SIGTERM');
      tauriDriverProcess = null;
    }
  },
};
