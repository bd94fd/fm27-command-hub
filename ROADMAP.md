# FM27 Command Hub roadmap

Last updated: 25 November 2026
Status: living backlog

## How to use this list

- Work from the top down. Trust and data safety come before speed and polish.
- Take one item at a time unless two items are clearly one change.
- Change the status to Proposed, In progress, Done or Parked.
- Add new ideas to the matching wave. Re-rank only when the new idea changes trust, speed or safety.
- This is a map of options, not a promise to build everything.

See `SKILLS-MAP.md` for the skills to use on each item. See `TOOLING-WATCHLIST.md` for tools to add at a later stage.

## Ranking method

The order follows this rule:

1. Protect the user's data.
2. Prove the data is correct.
3. Make the slow parts faster.
4. Make the app easier to understand.
5. Make it reliable on real devices.
6. Add product features.
7. Keep the code and release process healthy.

Within a wave, higher user impact and lower risk come first.

## Current baseline

A quick scan on 25 November 2026 found:

- 193 source files and 67 test files.
- 420 JavaScript and TypeScript tests, plus 52 Python tests.
- CI runs type-check, tests and production build.
- Dependabot is active.
- No issue templates, pull request template, end-to-end browser tests, coverage report, linter beyond TypeScript, or automated accessibility check.
- The repository has several very large files, including the Analyst context, save hydrator, Hub workspace and player modal.
- Branch protection could not be checked with the current GitHub token.

## Current target and constraints

- Android Chrome and the installed PWA come first. Desktop still matters, but it is second.
- The benchmark set is the three existing saves in `.agents_tmp/uploads/`:
  - `auto_save.fm` at 264.5 MB, the latest save.
  - `last_save_overwrite_backup.fm` at 263.4 MB.
  - `auto_save_v03_.fm` at 253.8 MB.
- These are the sizes supplied to the app. Compression is not confirmed, so do not assume it.
- More save files will be added later when the game is available again.
- The roadmap stays in this file. GitHub issues and milestones are not used for now.

## Wave 0: Protect the data

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 1 | R01 | Backup and restore drill | Prove that export, import, IndexedDB and save history can restore a real save after a failure. Data loss would damage trust more than any visual bug. | S |
| 2 | R02 | GitHub repository health audit | Check branch protection, required checks, secrets, Dependabot, issue and PR templates, and release notes. This stops bad merges before they reach main. | S |
| 3 | R03 | Real-save regression set | Keep a small set of real saves from different clubs, sizes and FM27 patches. Run them through the decoder in CI. This catches drift that synthetic tests miss. | M |
| 4 | R04 | Data parity contract map | Write one table showing every important field from decoder to hydrator to UI to Analyst. This is the fastest way to stop mismatched values. | M |
| 5 | R05 | Save-load benchmark baseline | Measure upload, decode, hydrate and first render time and memory on Android Chrome and the installed PWA, using the three 250–265 MB saves. You cannot improve speed without a baseline. | S |
| 6 | R06 | Error reporting with redaction | Capture client and server failures without sending save files, player data or API keys. This turns user reports into fixable evidence. | M |

## Wave 1: Prove the data

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 7 | R07 | Decoder field coverage audit | List every field the app expects, whether the decoder supplies it, and whether it is missing, guessed or stale. This finds silent data gaps. | M |
| 8 | R08 | Schema validation and clear failures | Reject malformed decoded payloads with a clear message instead of letting bad data reach the UI. | M |
| 9 | R09 | Data quality dashboard | Show missing wages, ages, contracts, staff roles and other gaps per save. This makes data quality visible to you and to the Analyst. | M |
| 10 | R10 | Cross-tab consistency tests | Test that staff ratings, finance totals, squad counts and expiry windows agree across Hub, Squad, Staff and Analyst. | M |
| 11 | R11 | Save version compatibility matrix | Record which FM27 patches and save formats work, which fields changed, and what happens with an unsupported save. | M |
| 12 | R12 | Re-sync safety and merge rules | Prove that importing the same save twice does not duplicate players, lose history or overwrite newer data. | M |
| 13 | R13 | Analyst grounding audit | Check that every fact in the Analyst prompt matches the current UI and save date. The Analyst should never sound confident about missing data. | M |

## Wave 2: Make loading faster

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 14 | R14 | Decode stage profiling on Android | Time each stage separately on Android Chrome and the installed PWA: upload, Python decode, JSON transfer, hydration and render. This shows the real bottleneck. | S |
| 15 | R17 | Mobile memory and fallback tuning | Tune chunk size, worker memory and the native-to-browser fallback for 250–265 MB saves. Large saves must not crash the tab. | M |
| 16 | R15 | Content-fingerprint cache | Reuse a decoded save by file fingerprint instead of only save name and in-game date. This avoids decoding the same 250–265 MB file again. | M |
| 17 | R16 | Progressive first paint | Show squad, staff and finances as soon as each part is ready. Keep the rest loading behind skeletons. This makes a big save feel faster. | M |
| 18 | R18 | Bundle and startup audit | Review code splitting, fonts, icons and chart imports. Less JavaScript means a faster first open on Android. | M |
| 19 | R19 | Large-list and chart rendering | Use virtual lists, memoisation and lighter chart data for large squads and shortlists. This keeps scrolling smooth on phones. | M |
| 20 | R20 | PWA cache freshness and offline update | Make sure an installed app updates cleanly and never serves an old decoder or old UI after a deploy. | M |

## Wave 3: Make the app easier to understand

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 21 | R21 | Navigation and information architecture review | Review the seven tabs, Hub sub-tabs, mobile bottom bar and deep links. A user should always know where they are and how to get back. | M |
| 22 | R22 | First-run onboarding | Explain what to upload, what the app will show, and what to do first. A guided empty state makes the first session much easier. | M |
| 23 | R23 | Loading, empty and error states | Give every panel a clear loading state, empty state, retry action and helpful error message. No dead ends. | M |
| 24 | R24 | Search, filters and saved views | Add global search, remembered filters and recent views. This saves time on every session. | M |
| 25 | R25 | Mobile touch, contrast and focus audit | Check 44px targets, readable muted text, visible focus rings and keyboard behaviour across the app. | S |
| 26 | R26 | Design system and visual consistency | Unify spacing, type, colours, cards, tables and badges. Consistency makes the app feel calmer and more trustworthy. | L |
| 27 | R27 | Motion, feedback and undo | Add small transitions, clear success and failure messages, and undo for destructive actions. This makes the app feel responsive and safe. | M |

## Wave 4: Make it reliable everywhere

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 28 | R28 | Browser and device matrix | Test Android Chrome, iPhone Safari, desktop Chrome and the installed PWA. Real devices expose problems that desktop tests miss. | M |
| 29 | R29 | End-to-end smoke tests | Use a browser test to upload a save, open each tab, send a chat message and export a report. This catches broken flows before users do. | L |
| 30 | R30 | Accessibility audit | Run an automated accessibility check and a manual keyboard and screen-reader pass. This helps every user, not only disabled users. | M |
| 31 | R31 | Offline behaviour | Decide what works offline, what is queued, and what is clearly marked as stale. Mobile users lose signal often. | M |
| 32 | R32 | Security and privacy review | Review upload retention, access tokens, logs, error reports and any place a save file could leak. | M |

## Wave 5: Product improvements

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 33 | R33 | Finance forecasting and what-if | Show runway under different wage, transfer and sponsorship scenarios. This turns finance data into decisions. | L |
| 34 | R34 | Contract expiry alert centre | Put expiring players and staff in one place with renew, sell and release actions. This prevents avoidable losses. | M |
| 35 | R35 | Staff organisation chart | Show who reports to whom, which department each person covers, and where the gaps are. This makes the staff tab easier to read. | M |
| 36 | R36 | Save comparison and what-if scenarios | Compare two saves or simulate a transfer, sale or wage change without touching the real save. This supports planning. | L |
| 37 | R37 | Share and export reports | Export a clean report as PDF, PNG or CSV, or share a read-only link. This makes the work useful outside the app. | M |

## Wave 6: Keep the code and release process healthy

| Rank | ID | Option | Why it matters | Effort |
| ---: | --- | --- | --- | --- |
| 38 | R38 | Dead code and duplicate utility audit | Find unused files, repeated formatters, selectors and constants. Fewer copies mean fewer places for bugs to hide. | M |
| 39 | R39 | Type safety and runtime validation | Reduce `any`, tighten boundaries and validate data at the edges. This turns runtime surprises into build-time errors. | L |
| 40 | R40 | Large component split | Break the biggest files into smaller pieces with clear ownership. This makes future changes safer and easier to review. | L |
| 41 | R41 | Test coverage and quality | Add a coverage report and target the engines with the least coverage. Focus on real behaviour, not test count. | M |
| 42 | R42 | CI and release automation | Add linting, formatting, bundle budgets, preview deploys and release notes. This raises quality without slowing delivery. | M |
| 43 | R43 | Documentation refresh | Bring README, architecture notes, the Antigravity handoff and skill rules in line with the current code. | S |
| 44 | R44 | Dependency and licence health | Review outdated packages, security advisories and licences. This keeps the app safe and deployable. | S |
| 45 | R45 | Performance budgets | Fail CI when the bundle, first load or memory use crosses an agreed limit. This stops speed regressions. | M |
| 46 | R46 | Privacy-friendly usage signals | Measure which tabs and features are used and where errors happen, without collecting save data. This helps choose the next work. | M |

## Recommended first three

1. R01 Backup and restore drill. It is small and protects the thing users care about most.
2. R02 GitHub repository health audit. It is cheap and prevents avoidable merge risk.
3. R05 Save-load benchmark baseline. It gives real numbers before any speed work starts.

## Decisions already made

- Android Chrome and the installed PWA are the first target.
- The first benchmark uses the three existing saves, all between 250 MB and 265 MB.
- More saves will be added later.
- GitHub issues and milestones are not used. This file is the single backlog.

## Decisions still open

- Whether adding browser test tools and accessibility tools as development dependencies is acceptable.
- Whether Render's 512 MB limit is still the main deployment constraint.

## Status

- R25 Mobile touch, contrast and focus audit: In progress. Staff, Hub finances and the audited controls pass; the app-wide keyboard sweep remains.
- R26 Design system and visual consistency: In progress. Staff and Hub finances typography are aligned; the remaining screens are pending.
- R27 Motion, feedback and undo: In progress. Clear Chat has a confirmation step and a 5-second undo window; other destructive actions are pending.
- R42 CI and release automation: In progress. A roadmap-reference gate is in place; broader release automation is pending.
- R43 Documentation refresh: In progress. Roadmap discipline is recorded in `AGENTS.md`; the remaining documentation refresh is pending.

All other items are proposed.
