/**
 * Error message formatting helpers for job failure display.
 * Extracted from appStore.ts for testability.
 */

export const SETUP_WIZARD_HINT = ' — Open Setup Wizard to install missing dependencies.';

/** Keywords in error messages that indicate missing Python deps. */
const DEPENDENCY_KEYWORDS = [
  'No module named',
  'ModuleNotFoundError',
  'ImportError',
  'Python not found',
  'python3: can\'t open file',
  'torch',
  'demucs',
  'soundfile',
];

/**
 * Parse an error string and append an actionable hint when it matches
 * known dependency-related patterns. Returns the original message unchanged
 * if no keywords match.
 */
export function formatJobError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (DEPENDENCY_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) {
    return rawError + SETUP_WIZARD_HINT;
  }
  return rawError;
}
