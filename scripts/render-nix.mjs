#!/usr/bin/env node
/**
 * Render Nix packaging metadata.
 *
 * Computes the SHA-256 (nixpkgs SRI format) of a built AppImage and writes it,
 * along with the release version, into pkgs/stemgen-gui/default.nix.
 *
 * Usage:
 *   node scripts/render-nix.mjs <version> <path-to-AppImage>
 *   node scripts/render-nix.mjs 1.4.7 target/release/bundle/appimage/Stemgen-GUI_1.4.7_amd64.AppImage
 *
 * This keeps the NixOS derivation pointing at the exact GitHub release URL and
 * hash so NixOS users can install it reproducibly.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const NIX_FILE = join(ROOT, "pkgs", "stemgen-gui", "default.nix");

function toSRI(buf) {
  const base64 = buf.toString("base64");
  return `sha256-${base64}`;
}

const [version, appImagePath] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("Usage: node scripts/render-nix.mjs <version> <path-to-AppImage>");
  process.exit(1);
}

if (!appImagePath) {
  console.error("ERROR: AppImage path required");
  process.exit(1);
}

const data = readFileSync(appImagePath);
const sri = toSRI(createHash("sha256").update(data).digest());

let content = readFileSync(NIX_FILE, "utf-8");

content = content.replace(
  /version \? "[^\"]*"/,
  `version ? "${version}"`
);

if (content.includes("amd64Hash ? null")) {
  content = content.replace(
    "amd64Hash ? null",
    `amd64Hash ? "${sri}"`
  );
} else {
  content = content.replace(
    /(amd64Hash \? ")[^"]*(")/,
    `$1${sri}$2`
  );
}

writeFileSync(NIX_FILE, content);
console.log(`✅ pkgs/stemgen-gui/default.nix updated`);
console.log(`   version:    ${version}`);
console.log(`   amd64Hash:  ${sri}`);
