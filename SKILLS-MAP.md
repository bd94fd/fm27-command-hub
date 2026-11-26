# FM27 skill map

Last updated: 25 November 2026

This map links each roadmap item to the skills that should be used. Every skill below lives in `.agents/skills`, so OpenHands and Google Antigravity read the same files.

## How to use this map

- Start with the primary skill for the item.
- Add a supporting skill only when the work needs it.
- If an item has no good match, do not force a skill. Use the closest one and record the gap.
- When a new skill is added, update this map and the roadmap.

## Skills added for the roadmap

| Skill | Why it is useful | Roadmap items |
| --- | --- | --- |
| `github` | Works with GitHub issues, pull requests, branches, secrets and workflow status through the API and `gh`. | R02, R42, R44 |
| `github-actions` | Builds, debugs and improves CI workflows. | R02, R03, R29, R42, R45 |
| `security` | Reviews data handling, permissions, secrets, logs and input validation. | R02, R06, R08, R32, R37, R39, R44, R46 |
| `release-notes` | Turns merged work into a clear changelog. | R02, R42 |
| `technical-writing` | Keeps engineering explanations direct and useful. | R04, R11, R43 |
| `prd` | Turns a feature idea into a short product requirements document before coding. | R33, R34, R36, R46 |
| `agent-memory` | Keeps decisions and project knowledge in `AGENTS.md`. | R43 and roadmap upkeep |
| `playwright-skill` | Runs repeatable browser scripts, screenshots and interaction checks. | R05, R14, R18, R28, R29, R41, R45 |
| `web-quality-audit` | Runs an evidence-led Lighthouse and web quality review. | R05, R18, R30 |
| `performance` | Covers load measurement, traces and runtime performance fixes. | R05, R14, R15, R18, R20, R45 |
| `accessibility` | Covers WCAG 2.2, keyboard, screen reader and focus checks. | R25, R30 |
| `core-web-vitals` | Covers LCP, INP and CLS diagnosis and fixes. | R05, R18, R45 |
| `best-practices` | Covers security, modern APIs and code quality patterns. | R38, R39, R44 |
| `seo` | Covers crawlability, metadata and structured data. | R37, R43 |
| `ui-ux-audit` | Optional measured rubric for contrast, tap targets, spacing, alignment, motion and focus. It is not the primary audit engine. | R25, R26, R27, R30 |
| `impeccable` | Design critique, audit, polish, layout, adapt, onboarding and anti-slop detection. Use with a pinned engine and no live mode. | R21, R22, R23, R24, R26, R27, R35, R37 |

### Custom project skills

| Skill | Why it is useful | Roadmap items |
| --- | --- | --- |
| `fm27-save-safety` | Defines backup, restore, fixture and re-sync checks for real saves. | R01, R03, R12 |
| `fm27-performance-audit` | Defines the Android-first 250–265 MB save benchmark and memory checks. | R05, R14, R15, R17, R18, R20, R45 |
| `fm27-release-check` | Runs the full project gate and guards cache busters, Python files and generated files. | R42 |

Existing skills that also support the roadmap:

- `fm27-data-parity` for save data, decoder, hydrator, UI and Analyst agreement.
- `fm27-ui-ux-review` for mobile layout, touch targets, overlays and flow.
- `web-design-guidelines` for accessibility, contrast, focus and interface quality.
- `qa-changes` for exercising the real app and browser, not just unit tests.
- `code-simplifier` for reuse, quality and efficiency reviews.
- `show-me` for small diagrams and visual explanations.
- `plain-english-content` for user-facing reports and summaries.
- `skill-creator` for turning a repeated fix into a new project skill.

## Item-by-item map

| Rank | Item | Primary skill | Supporting skills | Gap |
| ---: | --- | --- | --- | --- |
| 1 | R01 Backup and restore drill | `fm27-save-safety` | `qa-changes`, `fm27-data-parity` | None. |
| 2 | R02 GitHub repository health audit | `github` | `github-actions`, `security` | None. |
| 3 | R03 Real-save regression set | `fm27-save-safety` | `fm27-data-parity`, `github-actions`, `security` | None. |
| 4 | R04 Data parity contract map | `fm27-data-parity` | `technical-writing`, `show-me` | None. |
| 5 | R05 Save-load benchmark baseline | `fm27-performance-audit` | `qa-changes`, `playwright-skill` | None. |
| 6 | R06 Error reporting with redaction | `security` | `qa-changes`, `github-actions` | None. |
| 7 | R07 Decoder field coverage audit | `fm27-data-parity` | `qa-changes` | None. |
| 8 | R08 Schema validation and clear failures | `fm27-data-parity` | `security` | None. |
| 9 | R09 Data quality dashboard | `fm27-data-parity` | `fm27-ui-ux-review`, `web-design-guidelines` | None. |
| 10 | R10 Cross-tab consistency tests | `fm27-data-parity` | `qa-changes` | None. |
| 11 | R11 Save version compatibility matrix | `fm27-data-parity` | `technical-writing` | None. |
| 12 | R12 Re-sync safety and merge rules | `fm27-save-safety` | `fm27-data-parity`, `qa-changes` | None. |
| 13 | R13 Analyst grounding audit | `fm27-data-parity` | `qa-changes` | None. |
| 14 | R14 Decode stage profiling on Android | `fm27-performance-audit` | `qa-changes`, `playwright-skill` | None. |
| 15 | R15 Mobile memory and fallback tuning | `fm27-performance-audit` | `qa-changes` | None. |
| 16 | R16 Progressive first paint | `fm27-ui-ux-review` | `web-design-guidelines`, `qa-changes` | None. |
| 17 | R17 Content-fingerprint cache | `fm27-performance-audit` | `fm27-data-parity`, `code-simplifier` | None. |
| 18 | R18 Bundle and startup audit | `fm27-performance-audit` | `code-simplifier`, `playwright-skill` | None. |
| 19 | R19 Large-list and chart rendering | `fm27-ui-ux-review` | `web-design-guidelines`, `code-simplifier` | None. |
| 20 | R20 PWA cache freshness and offline update | `fm27-performance-audit` | `qa-changes`, `fm27-data-parity` | None. |
| 21 | R21 Navigation and information architecture review | `fm27-ui-ux-review` | `impeccable`, `web-design-guidelines`, `show-me` | None. |
| 22 | R22 First-run onboarding | `fm27-ui-ux-review` | `impeccable`, `web-design-guidelines`, `plain-english-content` | None. |
| 23 | R23 Loading, empty and error states | `fm27-ui-ux-review` | `impeccable`, `qa-changes` | None. |
| 24 | R24 Search, filters and saved views | `fm27-ui-ux-review` | `impeccable`, `code-simplifier` | None. |
| 25 | R25 Mobile touch, contrast and focus audit | `fm27-ui-ux-review` | `accessibility`, `ui-ux-audit` | None. |
| 26 | R26 Design system and visual consistency | `fm27-ui-ux-review` | `impeccable`, `web-design-guidelines`, `ui-ux-audit` | None. |
| 27 | R27 Motion, feedback and undo | `fm27-ui-ux-review` | `impeccable`, `ui-ux-audit`, `web-design-guidelines` | None. |
| 28 | R28 Browser and device matrix | `playwright-skill` | `qa-changes`, `fm27-ui-ux-review` | None. |
| 29 | R29 End-to-end smoke tests | `playwright-skill` | `qa-changes`, `github-actions` | None. |
| 30 | R30 Accessibility audit | `accessibility` | `web-quality-audit`, `ui-ux-audit`, `qa-changes` | None. |
| 31 | R31 Offline behaviour | `qa-changes` | `fm27-data-parity`, `playwright-skill` | None. |
| 32 | R32 Security and privacy review | `security` | `github`, `qa-changes` | None. |
| 33 | R33 Finance forecasting and what-if | `fm27-data-parity` | `prd`, `show-me` | None. |
| 34 | R34 Contract expiry alert centre | `fm27-data-parity` | `prd`, `fm27-ui-ux-review` | None. |
| 35 | R35 Staff organisation chart | `fm27-ui-ux-review` | `fm27-data-parity`, `impeccable`, `show-me` | None. |
| 36 | R36 Save comparison and what-if scenarios | `fm27-data-parity` | `prd`, `fm27-ui-ux-review` | None. |
| 37 | R37 Share and export reports | `fm27-data-parity` | `security`, `fm27-ui-ux-review`, `impeccable` | None. |
| 38 | R38 Dead code and duplicate utility audit | `code-simplifier` | `security`, `best-practices` | None. |
| 39 | R39 Type safety and runtime validation | `security` | `code-simplifier`, `best-practices` | None. |
| 40 | R40 Large component split | `code-simplifier` | `fm27-ui-ux-review` | None. |
| 41 | R41 Test coverage and quality | `qa-changes` | `playwright-skill`, `code-simplifier` | None. |
| 42 | R42 CI and release automation | `fm27-release-check` | `github-actions`, `github`, `release-notes` | None. |
| 43 | R43 Documentation refresh | `agent-memory` | `technical-writing`, `plain-english-content` | None. |
| 44 | R44 Dependency and licence health | `security` | `github`, `best-practices` | None. |
| 45 | R45 Performance budgets | `fm27-performance-audit` | `github-actions`, `playwright-skill` | None. |
| 46 | R46 Privacy-friendly usage signals | `security` | `prd`, `qa-changes` | None. |

## External skills and sources

| Skill | Source | Licence |
| --- | --- | --- |
| `playwright-skill` | https://github.com/lackeyjb/playwright-skill | MIT |
| `web-quality-audit` | https://github.com/addyosmani/web-quality-skills | MIT |
| `performance` | https://github.com/addyosmani/web-quality-skills | MIT |
| `accessibility` | https://github.com/addyosmani/web-quality-skills | MIT |
| `core-web-vitals` | https://github.com/addyosmani/web-quality-skills | MIT |
| `best-practices` | https://github.com/addyosmani/web-quality-skills | MIT |
| `seo` | https://github.com/addyosmani/web-quality-skills | MIT |
| `ui-ux-audit` | https://github.com/imYChaudhary22/ui-ux-audit | MIT |
| `impeccable` | https://github.com/pbakaus/impeccable | Apache-2.0 |

The `ui-ux-audit` text was edited to use Playwright or the available browser tools. The measurement script is unchanged.

## Which UI/UX audit is best

Use them in this order:

1. `fm27-ui-ux-review` for the project's mobile layout, touch, overlay and flow rules.
2. `impeccable` for design critique, audit, polish, layout, adapt and anti-slop checks. Read `.agents/skills/impeccable/FM27-SETUP.md` first.
3. `accessibility` for WCAG 2.2, keyboard, screen reader and focus checks.
4. `web-quality-audit` for Lighthouse evidence and page quality.
5. `ui-ux-audit` as an optional measured rubric for contrast, spacing and alignment.

`ui-ux-audit` is useful, but its source repository is small. Keep it as a supporting rubric, not the only audit. For automated checks, use Playwright with axe-core or Pa11y when those tools are added.

Impeccable is pinned to skill v4.11.0 and engine 0.1.30. The launcher verifies the engine SHA-256 against `scripts/engine-checksums.txt`. Do not run its live mode or installer hooks without explicit approval. A first trial on the loaded Staff and Hub screens found real small-text and contrast problems, but the detector repeats findings once per card. Use `--json` and dedupe; do not make it a blocking CI gate yet.

## Skills deliberately not added

- `code-review` — the existing `fm27-data-parity` skill already owns `/codereview` and the parity review workflow.
- `iterate` — it requires draft pull requests, which conflicts with the project ready-PR and auto-merge rules.
- `frontend-design` — it would compete with the FM27 design language and existing UI rules.
- `datadog`, `vercel` and `docker` — the project does not use these as primary workflows today. Add them only when that changes.
- `plugin87/ux-ui-agent-skills` — strong design QA and accessibility gates, but they need its full kit installed; the copied skill alone runs in guidance-only mode.
- `nextlevelbuilder/ui-ux-pro-max-skill` — a design-generation skill, not an audit skill.
- `Nutlope/hallmark` — an anti-AI-slop design skill, not a measured audit.
- `emilkowalski/skills` — strong motion and interaction guidance. Worth adding later for R27, not needed for a general audit.
