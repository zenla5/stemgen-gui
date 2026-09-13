/** Format an installed model's version line, e.g. "rev cbc8a9b1 · 2026-09-02". */
export function formatInstalledVersion(
  revision?: string,
  lastModified?: string,
): string | undefined {
  const parts: string[] = [];
  if (revision) {
    parts.push(`rev ${revision}`);
  }
  if (lastModified) {
    parts.push(lastModified);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
