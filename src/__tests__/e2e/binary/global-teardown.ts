/**
 * Global teardown for binary E2E tests.
 *
 * Kills the Tauri binary process started by global-setup and cleans up.
 */

import fs from 'fs';
import { STATE_FILE } from './helpers';

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }

  let state: { pid?: number; available?: boolean };
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    console.warn('[binary-teardown] Could not parse state file');
    return;
  }

  if (state.pid && state.available) {
    console.log(`[binary-teardown] Terminating binary (PID: ${state.pid})`);

    try {
      // Send SIGTERM first
      process.kill(state.pid, 'SIGTERM');

      // Wait up to 5 seconds for graceful exit
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          // Check if process is still alive (signal 0 = no-op check)
          process.kill(state.pid, 0);
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          // Process no longer exists
          console.log('[binary-teardown] Binary exited gracefully');
          break;
        }
      }

      // Force kill if still alive
      try {
        process.kill(state.pid, 0); // Check if still alive
        console.warn('[binary-teardown] Binary did not exit, force killing');
        process.kill(state.pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    } catch (err) {
      console.warn(`[binary-teardown] Error killing binary: ${err}`);
    }
  }

  // Clean up state file
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // May already be deleted
  }

  console.log('[binary-teardown] Done');
}
