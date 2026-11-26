# GitHub repository health audit

Date: 25 November 2026
Repository: `bd94fd/fm27-command-hub`
Scope: branch protection, required checks, secrets, Dependabot, issue and pull request templates, release notes, and merge settings.

The audit used the authenticated GitHub CLI and the repository files. No secret values were read or printed.

## Summary

| Area | Finding | Status |
| --- | --- | --- |
| Branch protection | `main` is unprotected (`protected: false`). The repository ruleset `1` exists but is disabled. | Owner action |
| Required checks | CI defines `roadmap` and `verify`, but branch protection does not require either one. | Owner action |
| Secrets | The repository-secrets API returned 403 with the available token. No `.env*` file is tracked except `.env.example`. A tracked-file pattern scan found no obvious API keys, tokens, or private keys. | Cannot fully verify; no leak found |
| Dependabot | `.github/dependabot.yml` covers npm, GitHub Actions, and Docker. The alerts API reports that Dependabot alerts are disabled. `npm audit` reports 4 moderate advisories and no high or critical advisories; R44 owns remediation. | Owner action |
| Issue templates | No issue templates existed. Bug report, feature request, and template chooser were added. | Fixed |
| Pull request template | A roadmap gate existed. Verification steps now cover type-check, tests, build, UI audit, and diff hygiene. | Fixed |
| Release notes | There are no tags or releases. `.github/release.yml` now groups generated notes by existing labels. Release automation remains part of R42. | Fixed configuration; R42 follow-up |
| Merge settings | `delete_branch_on_merge` is false and merge commits, rebase merges, and squash merges are all enabled. The available token cannot change repository settings. | Owner action |
| Actions hardening | The workflow already used `contents: read`. It now installs from the lockfile, does not persist checkout credentials, and runs the roadmap gate on edits and Dependabot PRs. | Fixed |
| Security policy | No `SECURITY.md` existed. A private-reporting policy was added. | Fixed |
| Licence | MIT licence is present. | Pass |
| Code scanning and secret scanning | The available token cannot read these alerts. | Cannot verify |

## What this means

The most important gap is that `main` has no protection and no required checks. The CI checks are useful, but GitHub does not block a merge when they fail. That must be fixed in repository settings, not in a file in the repository.

The available automation token can read the public repository state but cannot administer the repository. The branch-protection, Actions-permissions, repository-update, secret-list, and Dependabot-alert endpoints returned 403.

## Owner-only settings

These steps need a GitHub account with repository administration permission. They cannot be applied with the current automation token.

1. Open `Settings > Branches` and add a branch protection rule for `main`.
   - Require a pull request before merging.
   - Require status checks `roadmap` and `verify` after both have run at least once.
   - Require conversation resolution before merging.
   - Block force pushes and deletions.
   - Consider requiring branches to be up to date before merging.
   - Consider including administrators so the rule cannot be bypassed.
2. Open `Settings > Code security and analysis`.
   - Enable Dependabot alerts.
   - Enable Dependabot security updates.
   - Enable secret scanning and push protection if the repository plan offers them.
3. Open `Settings > General > Pull Requests`.
   - Enable automatic deletion of head branches after merge.
   - Consider allowing squash merges only, to keep `main` history readable.
4. Open `Settings > Actions > General`.
   - Keep the default workflow token read-only.
   - Disable the option for Actions to create and approve pull requests unless a workflow needs it.
5. Create the first release when the release process is ready.
   - Tag a tested commit on `main` as `vX.Y.Z`.
   - Publish a GitHub release and let GitHub generate notes from `.github/release.yml`.
   - A tag-triggered release workflow is part of R42, not this audit.

## Repository-side changes in this audit

- Added bug-report and feature-request issue forms, plus a template chooser that disables blank issues.
- Added `SECURITY.md` with private vulnerability reporting and safe-handling rules.
- Added `.github/release.yml` with release-note categories for the labels already used by the repository.
- Expanded the pull request template with type-check, UI-audit, and diff-hygiene checks.
- Changed CI dependency installation from `npm install` to `npm ci`.
- Removed the CI path ignore so required checks run for documentation-only pull requests.
- Made the roadmap gate run when a pull request is edited, so adding `Roadmap: Rxx` after opening a PR re-runs the check.
- Made the roadmap gate pass explicitly for Dependabot PRs instead of skipping the job, so the job can be a required check.
- Disabled checkout credential persistence in CI.

## Verification

- `npm ci --legacy-peer-deps`
- `npm audit` (4 moderate, 0 high, 0 critical)
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

## Follow-ups

- R42 owns tag-triggered release automation and generated release publishing.
- Re-run this audit after the owner-only settings are applied and record the new state.
