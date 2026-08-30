# CI Gate & Branch Protection

`main` is protected so that a PR with red CI cannot be merged. The required
status check is the **"All Checks Passed"** aggregator job defined in
`.github/workflows/ci.yml` (the `check` job), which depends on and verifies the
result of every core CI job (`frontend`, `integration`, `backend`, `e2e`,
`e2e-binary`, `python`, `security`).

## Policy on `main`

- **Require status checks to pass** before merging — at minimum the
  `All Checks Passed` job.
- **Require a pull request** before merging, with **1 approving review**
  (no `CODEOWNERS` file is currently maintained, so no code-owner review).
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
