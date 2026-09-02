# CI Gate & Branch Protection

`main` is protected so that a PR with red CI cannot be merged. The required
status check is the **"All Checks Passed"** aggregator job defined in
`.github/workflows/ci.yml` (the `check` job), which depends on and verifies the
result of every core CI job.

The canonical set of core CI jobs is defined once as the `check` job's `needs`
list in `.github/workflows/ci.yml` and consumed by the `check` aggregator.
All core jobs are gating (i.e. contribute to the "All Checks Passed" merge
gate). Do not edit the list in multiple places: change the `check` job's
`needs` in `ci.yml` and re-run `.github/scripts/verify-core-job-list.sh`, which
also checks the references in `AGENT_GUIDE.md`.

core job ids: frontend, integration, backend, e2e, e2e-binary, security, python, changelog, msrv, validate-core-job-list

## When the gate runs

To avoid burning ~22–38 minutes of CI on the same code multiple times, the
**expensive test/build core jobs** (frontend, integration, backend, e2e,
e2e-binary, security, python, msrv) plus the `check` aggregator run **only on**:

- **pull requests** (any base branch), and
- **pushes to `main`** (post-merge safety + status badge).

Feature-branch pushes do **not** run those jobs. Instead they run the
**non-gating** `fast-feedback` job (`npm run check` + `lint` + unit tests +
`cargo fmt --check`, ~3–4 min) so push-time feedback is still quick. The
`fast-feedback` job is deliberately **not** in the `check` job's `needs` list
and never blocks a merge.

The two lightweight validation jobs — `changelog` (structure check, ~5 s) and
`validate-core-job-list` (CI-config drift guard, ~2 min) — run on **every**
push/PR so a workflow or changelog edit is validated immediately on the branch,
not only at PR time.

`e2e-binary` builds its own release binary and runs in **parallel** with
`backend` (no `needs: [backend]`), keeping the gate's critical path short. The
`check` aggregator still gates on both.

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

### 2026-08-30 — automate drift detection (issue #204)

Previously the live `main` policy was only verified by hand, once. That left no
signal if it ever drifted from the scripted policy (e.g. a required status check
renamed, `strict` toggled, or approval count changed) without a maintainer
re-checking. Added:

- `.github/scripts/verify-branch-protection.sh` — GETs the live policy via the
  GitHub API and compares it against the expected policy **parsed from
  `apply-branch-protection.sh`** (that script remains the single source of
  truth). Exits non-zero on mismatch, with a readable diff.
- `.github/workflows/verify-branch-protection.yml` — runs it manually
  (`workflow_dispatch`) and weekly on a schedule. Uses the
  `BRANCH_PROTECTION_PAT` repository secret, which needs `repo` / `admin:repo`
  scope to read live protection. If a mismatch is detected, the run fails.
  Scheduled runs are skipped until the secret is present so a missing secret
  doesn't turn the weekly run red.

To re-verify by hand this is the one-liner used by CI:

```bash
.github/scripts/verify-branch-protection.sh
```

## Applying / re-applying

Branch protection is a repository-settings change and cannot be configured via
a merged file. To (re)apply the exact policy, run:

```bash
.github/scripts/apply-branch-protection.sh
```

The script is idempotent. Requires `gh` authenticated with admin scope and
`jq`.
