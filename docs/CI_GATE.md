# CI Gate & Branch Protection

`main` is protected so that a PR with red CI cannot be merged. The required
status check is the **"All Checks Passed"** aggregator job defined in
`.github/workflows/ci.yml` (the `check` job), which depends on and verifies the
result of every core CI job (`frontend`, `integration`, `backend`, `e2e`,
`e2e-binary`, `python`, `security`, `changelog`).

## Policy on `main`

- **Require status checks to pass** before merging — at minimum the
  `All Checks Passed` job.
- **Require a pull request** before merging, with a **required approving review
  count of 0** (no `CODEOWNERS` file is currently maintained, so no code-owner
  review). Since the repo has a single author/reviewer account (`zenla5`) and
  GitHub does not count an author's own review toward the requirement, requiring
  1 approval would make every self-authored PR unmergeable — so the effective
  gate is the **"All Checks Passed"** status check. Raise this back to 1 if a
  second reviewer identity (a BOT App or maintainer account) is added.
- **Enforce for admins** — these rules apply to everyone.
- Force pushes and branch deletions are **disabled**.
- `strict` mode is **off** — branch does not need to be up to date before
  merging. This avoids friction on npm dependabot `package-lock.json` churn
  (see the trade-off discussed in issue #194).
- Automated review tooling can rely on the `mergeable`/CI state of a PR.

## Applying / re-applying

Branch protection is a repository-settings change and cannot be configured via
a merged file. To (re)apply the exact policy, run:

```bash
.github/scripts/apply-branch-protection.sh
```

The script is idempotent. Requires `gh` authenticated with admin scope and
`jq`.
