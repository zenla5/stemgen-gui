#!/usr/bin/env node
/**
 * issue-dedup.cjs — file_issues() dedup helper (tools/bug-hunt).
 *
 * Reads a gh search result file (a JSON array of {number,title,body}) and tells
 * the harness whether the candidate title/description already exists among the
 * open issues. Matches the candidate by:
 *   - exact, case-insensitive TITLE against any open issue, OR
 *   - the candidate DESCRIPTION appearing in an issue BODY (the filed body
 *     embeds `[DESCRIPTION] …`, so a reworded title with the same root cause is
 *     caught).
 *
 * Input comes via env to survive newlines / non-ASCII content (argv is not
 * reliable for model-generated descriptions):
 *   DEDUP_FILE  path to the JSON array of {number,title,body}
 *   DEDUP_TITLE the sanitized candidate title
 *   DEDUP_DESC  the raw candidate [SEVERITY .. DESCRIPTION] finding
 *
 * Prints "DUP:<number>" when a duplicate is found, else "NONE". Promotes body-
 * only matches to a number too (the same root cause reworded). Never falls back
 * to creating on error — callers treat any non-zero exit as non-clean.
 */

const fs = require('node:fs');

const file = process.env.DEDUP_FILE || '';
const title = (process.env.DEDUP_TITLE || '').toLowerCase();
const desc = (process.env.DEDUP_DESC || '').toLowerCase();

try {
  const issues = JSON.parse(fs.readFileSync(file, 'utf8')) || [];
  for (const it of issues) {
    const t = (it.title || '').toLowerCase();
    const b = (it.body || '').toLowerCase();
    if (t === title || (desc && b.includes(desc))) {
      process.stdout.write(`DUP:${it.number}\n`);
      process.exit(0);
    }
  }
} catch {
  // Malformed search output — report an error so the caller skips, never creates.
  process.stdout.write('ERROR\n');
  process.exitCode = 2;
}
process.stdout.write('NONE\n');