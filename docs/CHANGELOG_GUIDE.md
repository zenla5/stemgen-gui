# Changelog Guide

Convention for editing `CHANGELOG.md`. Adopted to fix the recurring merge
conflicts described in issue #200 (two PRs independently inserting a new
`### Internal` heading at the same spot under `## [Unreleased]`).

## Goal

Keep `[Unreleased]` edits conflict-friendly so concurrent PRs usually touch
**different lines**. Do not insert entries at the top of the `[Unreleased]`
section.

## How to add an entry

1. **Pick the right category subsection.** Each change goes under exactly one
   `### <Category>` subsection in `[Unreleased]`.

   Canonical subsection order within `[Unreleased]`:

   ```
   ### Added
   ### Changed
   ### Fixed
   ### Removed
   ### Security
   ### Internal
   ```

2. **Append, don't prepend.** Add your bullet at the **bottom** of the chosen
   subsection's list — immediately above the next `###` heading or, for the
   last subsection, above the next `## [version]` release heading. Never insert
   a bullet above existing bullets in a subsection, and never insert anything
   directly under `## [Unreleased]` outside a subsection.

3. **Create a missing subsection at the end.** If the category subsection does
   not exist yet in `[Unreleased]`, create it as the **last** subsection in
   canonical order (i.e. appended after all existing subsections, not inserted
   at the top). This is what stops two PRs from both creating e.g.
   `### Internal` in the same top-of-section spot.

4. **One bullet per change** starting with `- `; prefix with a bracketed tag
   (e.g. `[FOO]`) when the change has a feature/area label. Keep to a single
   paragraph per bullet.

## Merge-time guidance

If two concurrent PRs still touch the same lines (e.g. both create the same new
subsection), resolve the conflict by **keeping both bullets** — the entries are
independent. This is expected and is the reason the convention only reduces
conflicts, it does not eliminate them.

## Enforcement

`.github/workflows/ci.yml` runs `.github/scripts/check-changelog.mjs` (the
`changelog` job), which fails the build if:

- `[Unreleased]` is not the first section,
- a bullet appears in `[Unreleased]` outside any `###` subsection,
- a `###` subsection uses an unknown category, or
- `[Unreleased]` subsections are not in canonical order.

## Scope

The canonical ordering rules above apply only to `[Unreleased]`. Historical
release sections are left as they were written.
