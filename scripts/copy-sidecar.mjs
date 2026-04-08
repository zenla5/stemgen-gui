/**
 * Copies the Python sidecar script into the Tauri resource tree so that
 * Tauri v2 bundles it reliably (paths outside src-tauri/ via ../ are unreliable).
 *
 * Usage: node scripts/copy-sidecar.mjs
 * Registered as: npm run copy-sidecar
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const src = join(projectRoot, "python", "stemgen_sidecar.py");
const dest = join(projectRoot, "src-tauri", "resources", "stemgen_sidecar.py");

if (!existsSync(src)) {
  console.error(`ERROR: Source sidecar not found at: ${src}`);
  console.error(
    "Ensure python/stemgen_sidecar.py exists before running this script."
  );
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);

console.log(`Sidecar copied: ${src} -> ${dest}`);
