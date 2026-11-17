# CI gates and branch protection

This checklist makes a failing CI job block merges into `dev` and `main` in all
three repos. Do the setup in this order: if a required check is configured
before its workflow is merged into the branch, every PR will wait forever for a
check that cannot run.

## 1. Merge the workflow PRs first

| Repo | Workflow | Required check name | Status |
|---|---|---|---|
| Node backend | `.github/workflows/security.yml` | `gitleaks (secret scan)` | on `dev` |
| Node backend | `.github/workflows/backend-ci.yml` | `backend tests (Node 20)` | PR #17 |
| Frontend | `.github/workflows/security.yml` | `gitleaks (secret scan)` | PR #2 |
| Frontend | `.github/workflows/frontend-ci.yml` | `frontend tests (Node 20)` | PR for D2-27 |
| Setu Guide | `.github/workflows/security.yml` | `gitleaks (secret scan)` | PR #46 |
| Setu Guide | `.github/workflows/ci.yml` | `test` | on `dev` |

Do not require `Vercel Preview Comments`: it is a deployment integration, not a
test gate, and it is not stable enough to be a required status check.

The frontend currently has known TypeScript errors in app code, so
`npm run typecheck` is not a required CI gate yet. Those errors are tracked as
app bugs; the blocking frontend check is `frontend tests (Node 20)`.

## Current evidence (2026-11-17)

| PR | Required check | Result |
|---|---|---|
| Backend #17 | `backend tests (Node 20)` | success |
| Backend #17 | `gitleaks (secret scan)` | success |
| Frontend #4 | `frontend tests (Node 20)` | success |
| Guide #46 | `test` | success |
| Guide #46 | `gitleaks (secret scan)` | success |

`gh api repos/<owner>/<repo>/branches/dev/protection` still returns 404 for all
three repos. Treat branch protection as **not configured or not visible to this
token** until an admin confirms it in the GitHub UI.

The failing-check proof in section 3 is therefore **not executed yet**. It
requires an admin to enable the rules first; a PR cannot prove a block while the
branch is unprotected.

The frontend typecheck baseline is 19 errors; it is tracked separately and is not
a required check in this gate.

## 2. Configure branch protection (manual, GitHub UI)

For each repo, open **Settings -> Branches -> Branch protection rules -> Add
rule** and create one rule for `dev` and one for `main`.

Use these settings:

- [ ] Branch name pattern: `dev` (repeat for `main`)
- [ ] Require a pull request before merging
- [ ] Required approvals: `1`
- [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] Require status checks to pass before merging
- [ ] Require branches to be up to date before merging
- [ ] Required status checks: the exact names in the table above for that repo
- [ ] Do not allow force pushes
- [ ] Do not allow deletions
- [ ] Do not allow bypassing the above settings (including administrators, if
      the org allows it)

Repeat for all three repos:

- `Bharathgoud07/Sambandh-Setu`
- `karanpandeyklk/Setu_app`
- `ujala100/setu-guide`

If a check name does not appear in the search box, the workflow has not run on
that branch yet. Merge the workflow PR first, open any small PR, and then add the
check name.

## 3. Prove a failing check blocks the merge

Do this only after branch protection is enabled on `dev`:

1. Create a throwaway branch from `dev`, for example
   `ci-gate-proof-YYYYMMDD`.
2. Make one existing test fail on purpose. Use a test file only; do not touch app
   code, API contracts, or the database.
3. Commit and push the branch.
4. Open a PR into `dev` with the title `DO NOT MERGE: CI gate proof`.
5. Confirm:
   - the required check is red;
   - GitHub shows `Merging is blocked` / `Required status check is expected`;
   - the merge button is disabled.
6. Add a screenshot or PR link to the Day 2 evidence.
7. Close the PR and delete the throwaway branch. Never merge it.

Repeat the proof for backend, frontend, and Guide if the lead wants per-repo
evidence. One screenshot per repo is enough.

## 4. Merge order for open PRs

The current open workflow PRs should merge before branch protection is enabled:

1. Backend PR #17 (`backend tests (Node 20)` and `gitleaks (secret scan)`).
2. Frontend PR #2 (`gitleaks (secret scan)`).
3. Guide PR #46 (`gitleaks (secret scan)`).
4. Frontend D2-27 PR #4 (`frontend tests (Node 20)`).
5. Backend D2-27 PR #20 (this checklist) after the gate workflow is on `dev`.

Backend D1-08, D1-10, D1-09 follow-up and D1-11 are separate from this gate.
