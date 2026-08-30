#!/usr/bin/env node
/**
 * check-changelog.mjs
 *
 * Structural lint for CHANGELOG.md enforcing the convention documented in
 * docs/CHANGELOG_GUIDE.md (adopted for issue #200).
 *
 * Checks:
 *   1. [Unreleased] is the first top-level section (after the title).
 *   2. Every bullet in [Unreleased] belongs to a `### <Category>` subsection
 *      (no orphan bullets directly under `## [Unreleased]`).
 *   3. [Unreleased] subsections use only the canonical categories and appear
 *      in canonical order (Added, Changed, Fixed, Removed, Security, Internal).
 *   4. Every other top-level section is a versioned `## [x.y.z]` release
 *      heading (ordering is NOT enforced — history predates the convention).
 *
 * Scope: the canonical-order rule applies only to [Unreleased]; historical
 * release sections are not reordered.
 *
 * Usage:
 *   node .github/scripts/check-changelog.mjs [path/to/CHANGELOG.md]
 *
 * Exits non-zero on the first failure with a line number.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DEFAULT_PATH = join(ROOT, 'CHANGELOG.md');
const FILE = process.argv[2] || DEFAULT_PATH;

const CANONICAL = ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Internal'];

let failed = false;

function fail(line, msg) {
  console.error(`check-changelog: ${FILE}:${line}: ${msg}`);
  failed = true;
}

const lines = readFileSync(FILE, 'utf-8').split('\n');

// Index top-level (##) sections with their line numbers.
const sections = [];
lines.forEach((line, i) => {
  if (/^##\s/.test(line)) sections.push({ line: i + 1, text: line });
});

// 1. [Unreleased] must be the first section after the title (line 1).
const unreleasedIdx = sections.findIndex((s) => s.text.includes('[Unreleased]'));
if (unreleasedIdx === -1) {
  fail(1, 'no `## [Unreleased]` section found');
} else {
  if (unreleasedIdx !== 0) {
    fail(sections[unreleasedIdx].line, '`## [Unreleased]` must be the first section after the title');
  }

  const start = sections[unreleasedIdx].line; // 1-based
  const end = sections[unreleasedIdx + 1] ? sections[unreleasedIdx + 1].line : lines.length + 1;

  const subheads = [];
  for (let i = start; i < end; i++) {
    const line = lines[i - 1];
    const m = line.match(/^###\s+(.+)$/);
    if (m) {
      subheads.push({ line: i, name: m[1].trim() });
    } else if (/^-\s+/.test(line)) {
      if (subheads.length === 0) {
        fail(i, 'bullet appears outside any `###` subsection in [Unreleased]');
      }
    }
  }

  // 2. subsections use only canonical categories...
  for (const h of subheads) {
    if (!CANONICAL.includes(h.name)) {
      fail(h.line, `unknown category "${h.name}" in [Unreleased] (expected one of ${CANONICAL.join(', ')})`);
    }
  }

  // 3. ...in canonical order.
  let expectedIdx = 0;
  for (const h of subheads) {
    const ci = CANONICAL.indexOf(h.name);
    if (ci < expectedIdx) {
      fail(h.line, `subsection "${h.name}" out of canonical order (expected ${CANONICAL[expectedIdx]} or later)`);
    }
    expectedIdx = ci;
  }
}

// 4. Release sections must have a parseable `## [x.y.z]` heading. Ordering of
//    historical release sections is intentionally NOT enforced — the file
//    predates the canonical-order convention and already contains non-descending
//    sequences (e.g. 1.1.x). Only `[Unreleased]` ordering is enforced.
for (const s of sections) {
  if (s.text.includes('[Unreleased]')) continue;
  if (!/^##\s+\[\d+\.\d+\.\d+\]/.test(s.text)) {
    fail(s.line, `release heading is not a versioned \`## [x.y.z]\` section`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('check-changelog: OK');
}
