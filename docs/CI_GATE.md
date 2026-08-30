# CI Gate & Branch Protection

`main` is protected so that a PR with red CI cannot be merged. The required
status check is the **"All Checks Passed"** aggregator job defined in
`.github/workflows/ci.yml` (the `check` job), which depends on and verifies the
result of every core CI job.

The canonical set of core CI jobs is defined once as the `x-core-jobs` YAML
anchor in `.github/workflows/ci.yml` and consumed by the `check` aggregator.
All core jobs are gating (i.e. contribute to the "All Checks Passed" merge
gate). Do not edit the list in multiple places: change the anchor and re-run
`.github/scripts/verify-core-job-list.sh`, which also checks the references in
`AGENT_GUIDE.md`.

core job ids: frontend, integration, backend, e2e, e2e-binary, security, python, changelog, msrv

## Policy on `main`

- **Require status checks to pass** before merging — at minimum the
  `All Checks Passed` job.
- **Require a pull request** before merging, with a **required approving review
  count of 0** (no `CODEOWNERS` file is currently maintained, so no code-owner
  review). Since the repo has a single author/reviewer account (`zenla5`) and
  GitHub does not count an author's own review toward the requirement, requiring
  1 approval would make every self-authored PR unmergeable — so the effective
  gate is the **"All Checks Passed"** status check. The maintainer has decided
  **not** to add a second reviewer identity for now (see "Decision log" below),
  so this value deliberately stays at `0`. If a second reviewer identity (a BOT
  App or maintainer account) is ever added, raise this back to `1` and re-apply
  via the script.
- **Enforce for admins** — these rules apply to everyone.
- Force pushes and branch deletions are **disabled**.
- `strict` mode is **off** — branch does not need to be up to date before
  merging. This avoids friction on npm dependabot `package-lock.json` churn
  (see the trade-off discussed in issue #194).
- Automated review tooling can rely on the `mergeable`/CI state of a PR.

## Decision log

### 2026-08-30 — keep `required_approving_review_count` at `0` (issue #199)

Issue #199 asked to revisit the approval count once a second reviewer identity
is available. The maintainer has decided **not** to introduce a second reviewer
identity at this time — the repo stays solo-maintained (`zenla5`). The effective
merge gate therefore remains the **"All Checks Passed"** status check, and
`required_approving_review_count` stays at `0`.

The live branch-protection policy was verified against this document and the
script's default on this date (approvals `0`, status check `All Checks Passed`,
enforced for admins, force-pushes/deletions disabled), so no re-application was
needed. If a second reviewer identity is added later, flip the value to `1` in
`.github/scripts/apply-branch-protection.sh`, re-run the script, and update this
log.

## Applying / re-applying

Branch protection is a repository-settings change and cannot be configured via
a merged file. To (re)apply the exact policy, run:

```bash
.github/scripts/apply-branch-protection.sh
```

The script is idempotent. Requires `gh` authenticated with admin scope and
`jq`.
