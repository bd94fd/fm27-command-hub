# GitHub repository health audit

Date: 25 November 2026
Repository: `bd94fd/fm27-command-hub`
Scope: branch protection, required checks, secrets, Dependabot, issue and pull request templates, release notes, and merge settings.

The audit used the authenticated GitHub CLI and the repository files. No secret values were read or printed.

## Summary

| Area | Finding | Status |
| --- | --- | --- |
| Branch protection | Ruleset `1` is active on all branches. It blocks deletions and force-pushes. See the 26 November re-audit below. | Fixed |
| Required checks | `roadmap` and `verify` are required status checks on all branches. | Fixed |
| Secrets | The repository-secrets API returned 403 with the available token. No `.env*` file is tracked except `.env.example`. A tracked-file pattern scan found no obvious API keys, tokens, or private keys. | Cannot fully verify; no leak found |
| Dependabot | `.github/dependabot.yml` covers npm, GitHub Actions, and Docker. The alert state still cannot be read with the automation token, so it needs owner confirmation. `npm audit` reports 4 moderate advisories and no high or critical advisories; R44 owns remediation. | Cannot verify |
| Issue templates | No issue templates existed. Bug report, feature request, and template chooser were added. | Fixed |
| Pull request template | A roadmap gate existed. Verification steps now cover type-check, tests, build, UI audit, and diff hygiene. | Fixed |
| Release notes | There are no tags or releases. `.github/release.yml` now groups generated notes by existing labels. Release automation remains part of R42. | Fixed configuration; R42 follow-up |
| Merge settings | `delete_branch_on_merge` is now true. Squash merging is on and rebase merging is off. Merge commits are still allowed, which is the last box to untick. | Almost fixed; one box remains |
| Actions hardening | The workflow already used `contents: read`. It now installs from the lockfile, does not persist checkout credentials, and runs the roadmap gate on edits and Dependabot PRs. | Fixed |
| Security policy | No `SECURITY.md` existed. A private-reporting policy was added. | Fixed |
| Licence | MIT licence is present. | Pass |
| Code scanning and secret scanning | The available token cannot read these alerts. | Cannot verify |

## Re-audit, 26 November 2026

The owner applied the branch rules, and the state below was read back with the
automation token after the change.

| Setting | Verified state |
| --- | --- |
| Ruleset `1` | `enforcement: active`, target `branch`, conditions `ref_name: ~ALL` |
| Rules | `deletion`, `non_fast_forward`, `required_status_checks` (`roadmap`, `verify`) |
| Strict up-to-date policy | Off, so a branch does not need to be rebased before merging |
| `delete_branch_on_merge` | `true` |
| Merge methods | `allow_merge_commit: true`, `allow_squash_merge: true`, `allow_rebase_merge: false` |
| Bypass list | Deploy key, repository roles `2`, `4`, `5`, and five integrations, all `bypass_mode: always` |
| Dependabot alerts | Still unreadable with this token (403) |

Reading back `GET /repos/{owner}/{repo}/rules/branches/main` returned exactly
three rules, all from ruleset `27718811`, so the checks are enforced rather than
merely configured.

What is still open:

- Squash-only merging. Squash is on and rebase is off. Merge commits are still allowed, so one box in repository settings is left.
- Dependabot alert and security-update state, which needs owner confirmation
  because the alerts endpoint is not readable with the automation token.
- The bypass list was deliberately kept as it is on 26 November 2026. The
  required checks therefore bind contributors who are not on that list, while
  the listed roles and integrations can still merge without them.

## What this means

The most important gap at the first audit was that `main` had no protection and no required checks: the CI checks were useful, but GitHub did not block a merge when they failed. That is now fixed, because ruleset `1` requires `roadmap` and `verify` before anything reaches `main`. Squash-only merging and the Dependabot alert switches are the remaining owner settings.

The available automation token can read the public repository state but cannot administer the repository. The branch-protection, Actions-permissions, repository-update, secret-list, and Dependabot-alert endpoints returned 403.

## Owner-only settings

These steps need a GitHub account with repository administration permission. They cannot be applied with the current automation token.

1. Branch rules for `main` — done through ruleset `1`.
   - Done: block force pushes and deletions.
   - Done: require status checks `roadmap` and `verify`.
   - Remaining: require a pull request before merging, require conversation resolution, and decide whether branches must be up to date before merging.
   - Remaining: decide whether to keep the repository roles and integrations on the bypass list.
2. Open `Settings > Code security and analysis`.
   - Enable Dependabot alerts.
   - Enable Dependabot security updates.
   - Enable secret scanning and push protection if the repository plan offers them.
   - State unconfirmed: the alerts endpoint is not readable with the automation token.
3. Open `Settings > General > Pull Requests`.
   - Done: automatic deletion of head branches after merge.
   - Remaining: allow squash merges only, to keep `main` history readable.
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
