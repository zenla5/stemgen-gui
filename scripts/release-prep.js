#!/usr/bin/env node
/**
 * Release Preparation Script
 *
 * This script automates the version bump process for new releases.
 * It updates all version strings in the project and updates the README
 * download links with the new version.
 *
 * Usage:
 *   node scripts/release-prep.js <new-version>
 *   node scripts/release-prep.js 1.0.11
 *
 * Files updated:
 *   - package.json                      (version field)
 *   - Cargo.toml                        (workspace.package.version)
 *   - src-tauri/Cargo.toml              (package.version)
 *   - src-tauri/tauri.conf.json         (version field)
 *   - src/lib/constants.ts              (APP_VERSION constant)
 *   - README.md                         (download links)
 *   - src/__tests__/regression.test.ts  (hardcoded APP_VERSION assertion)
 *   - CHANGELOG.md                      (new entry prepended)
 *
 * Note: README download link filenames are hardcoded because GitHub Actions
 * produces artifacts with version numbers in the filenames. The script updates
 * them based on Tauri's standard artifact naming convention.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Files that contain version strings
const FILES_TO_UPDATE = [
  {
    path: 'package.json',
    pattern: /"version": "([^"]+)"/,
    replacement: (_, old) => `  "version": "${VERSION}"`,
    detect: '"version":',
  },
  {
    path: 'Cargo.toml',
    pattern: /^version = "([^"]+)"$/m,
    replacement: (_, old) => `version = "${VERSION}"`,
    detect: 'version = "',
  },
  {
    path: 'src-tauri/Cargo.toml',
    pattern: /^version = "([^"]+)"$/m,
    replacement: (_, old) => `version = "${VERSION}"`,
    detect: 'version = "',
  },
  {
    path: 'src-tauri/tauri.conf.json',
    pattern: /"version": "([^"]+)"/,
    replacement: (_, old) => `"version": "${VERSION}"`,
    detect: '"version":',
  },
  {
    path: 'src/lib/constants.ts',
    pattern: /export const APP_VERSION = '([^']+)'/,
    replacement: (_, old) => `export const APP_VERSION = '${VERSION}'`,
    detect: 'export const APP_VERSION =',
  },
];

// Changelog entry template
const CHANGELOG_ENTRY = (version, date) => `## [${version}] — ${date} — Version Bump

### Changed

- **Version consistency** — All version strings bumped to ${version}: \`package.json\`, \`Cargo.toml\` (workspace), \`src-tauri/Cargo.toml\`, \`src/lib/constants.ts\` (\`APP_VERSION\`), and \`src-tauri/tauri.conf.json\`.
`;

let VERSION;

function read(path) {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function write(path, content) {
  writeFileSync(join(ROOT, path), 'utf-8', content);
}

function updateVersionStrings() {
  console.log(`\n📦 Updating version strings to ${VERSION}...\n`);

  for (const file of FILES_TO_UPDATE) {
    const content = read(file.path);

    if (!content.includes(file.detect)) {
      console.error(`  ❌ ${file.path}: Could not find pattern "${file.detect}"`);
      process.exit(1);
    }

    const newContent = content.replace(file.pattern, file.replacement);
    write(file.path, newContent);
    console.log(`  ✅ ${file.path}`);
  }
}

function updateReadmeLinks() {
  console.log(`\n🔗 Updating README.md download links...\n`);

  const content = read('README.md');

  // README download link patterns (Windows .exe, .msi; macOS .dmg; Linux .AppImage, .deb, .rpm)
  // NOTE: defined inside the function so VERSION is in scope.
  const README_PATTERNS = [
    // Windows NSIS
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_x64-setup\.exe/g, `Stemgen-GUI_${VERSION}_x64-setup.exe`],
    // Windows MSI
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_x64-setup\.msi/g, `Stemgen-GUI_${VERSION}_x64-setup.msi`],
    // macOS
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_aarch64\.dmg/g, `Stemgen-GUI_${VERSION}_aarch64.dmg`],
    // Linux AppImage
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_amd64\.AppImage/g, `Stemgen-GUI_${VERSION}_amd64.AppImage`],
    // Linux DEB
    [/stemgen-gui_(\d+\.\d+\.\d+)_amd64\.deb/g, `stemgen-gui_${VERSION}_amd64.deb`],
    // Linux RPM
    [/stemgen-gui-(\d+\.\d+\.\d+)-1\.x86_64\.rpm/g, `stemgen-gui-${VERSION}-1.x86_64.rpm`],
    // Verification examples in README (AppImage)
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_amd64\.AppImage/g, `Stemgen-GUI_${VERSION}_amd64.AppImage`],
    // Verification examples in README (exe)
    [/Stemgen-GUI_(\d+\.\d+\.\d+)_x64-setup\.exe/g, `Stemgen-GUI_${VERSION}_x64-setup.exe`],
  ];

  // Section header pattern
  const headerPattern = /### Latest Release \(v\d+\.\d+\.\d+\)/;

  // Apply all replacements
  let updated = content;
  for (const [pattern, replacement] of README_PATTERNS) {
    updated = updated.replace(pattern, replacement);
  }

  // Update the section header
  updated = updated.replace(headerPattern, `### Latest Release (v${VERSION})`);

  write('README.md', updated);
  console.log(`  ✅ README.md`);
}

function updateRegressionTest() {
  console.log(`\n🧪 Updating regression.test.ts...\n`);

  const content = read('src/__tests__/regression.test.ts');

  // Update the hardcoded APP_VERSION assertion inside the v1.0.8 Coverage Enhancement describe block.
  // This test hardcodes the version string to guard against accidental version regressions.
  // Pattern: it('APP_VERSION should be 1.0.x', () => { expect(APP_VERSION).toBe('1.0.x'); });
  const pattern = /it\('APP_VERSION should be (\d+\.\d+\.\d+)', \(\) => \{\s*expect\(APP_VERSION\)\.toBe\('(\d+\.\d+\.\d+)'\);/;

  if (!pattern.test(content)) {
    console.error('  ❌ src/__tests__/regression.test.ts: Could not find hardcoded APP_VERSION assertion');
    process.exit(1);
  }

  const updated = content.replace(
    /it\('APP_VERSION should be (\d+\.\d+\.\d+)', \(\) => \{\s*expect\(APP_VERSION\)\.toBe\('(\d+\.\d+\.\d+)'\);/,
    `it('APP_VERSION should be ${VERSION}', () => { expect(APP_VERSION).toBe('${VERSION}');`
  );

  write('src/__tests__/regression.test.ts', updated);
  console.log(`  ✅ src/__tests__/regression.test.ts`);
}

function updateChangelog() {
  console.log(`\n📝 Updating CHANGELOG.md...\n`);

  const content = read('CHANGELOG.md');
  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).replace(/,/g, '');

  const entry = CHANGELOG_ENTRY(VERSION, formattedDate);
  const newContent = content.replace(/(## \[Unreleased\]|\n## \[)/, `${entry}\n$1`);

  write('CHANGELOG.md', newContent);
  console.log(`  ✅ CHANGELOG.md`);
}

function gitCommit() {
  console.log(`\n📤 Committing changes...\n`);

  try {
    execSync('git add package.json Cargo.toml src-tauri/Cargo.toml src-tauri/tauri.conf.json src/lib/constants.ts README.md src/__tests__/regression.test.ts CHANGELOG.md', {
      cwd: ROOT,
      stdio: 'inherit',
    });

    execSync(`git commit -m "chore: bump version to ${VERSION}"`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    execSync(`git tag v${VERSION}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    const hash = execSync('git rev-parse HEAD | cut -c1-7', { cwd: ROOT, encoding: 'utf-8' }).trim();
    console.log(`\n  ✅ Commit: ${hash}`);
    console.log(`  ✅ Tag: v${VERSION}`);
    console.log(`\n⚠️  Run 'git push && git push --tags' to push the release.`);
  } catch (error) {
    console.error('\n  ⚠️  Git commit/tag failed. Changes are staged. Run manually:');
    console.error(`    git commit -m "chore: bump version to ${VERSION}"`);
    console.error(`    git tag v${VERSION}`);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length !== 1 || !/^\d+\.\d+\.\d+$/.test(args[0])) {
  console.error('Usage: node scripts/release-prep.js <version>');
  console.error('Example: node scripts/release-prep.js 1.0.11');
  console.error('Version must be in semver format (e.g., 1.0.11)');
  process.exit(1);
}

VERSION = args[0];

console.log('═══════════════════════════════════════════════════════════════');
console.log(`   Release Preparation: v${VERSION}`);
console.log('═══════════════════════════════════════════════════════════════');

updateVersionStrings();
updateReadmeLinks();
updateRegressionTest();
updateChangelog();
gitCommit();

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('   Done! Review changes with: git diff HEAD~1');
console.log('═══════════════════════════════════════════════════════════════\n');
