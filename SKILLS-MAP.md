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
| `security` | Reviews data handling, permissions, secrets, logs and input validation. | R06, R08, R32, R37, R39, R44, R46 |
| `release-notes` | Turns merged work into a clear changelog. | R42 |
| `technical-writing` | Keeps engineering explanations direct and useful. | R04, R11, R43 |
| `prd` | Turns a feature idea into a short product requirements document before coding. | R33, R34, R36, R46 |
| `agent-memory` | Keeps decisions and project knowledge in `AGENTS.md`. | R43 and roadmap upkeep |

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
| 1 | R01 Backup and restore drill | `qa-changes` | `fm27-data-parity`, `security` | A dedicated save-safety skill would help. |
| 2 | R02 GitHub repository health audit | `github` | `github-actions`, `security` | None. |
| 3 | R03 Real-save regression set | `fm27-data-parity` | `qa-changes`, `github-actions` | None. |
| 4 | R04 Data parity contract map | `fm27-data-parity` | `technical-writing`, `show-me` | None. |
| 5 | R05 Save-load benchmark baseline | `qa-changes` | `fm27-data-parity` | A performance-audit skill would help. |
| 6 | R06 Error reporting with redaction | `security` | `qa-changes`, `github-actions` | None. |
| 7 | R07 Decoder field coverage audit | `fm27-data-parity` | `qa-changes` | None. |
| 8 | R08 Schema validation and clear failures | `fm27-data-parity` | `security` | None. |
| 9 | R09 Data quality dashboard | `fm27-data-parity` | `fm27-ui-ux-review`, `web-design-guidelines` | None. |
| 10 | R10 Cross-tab consistency tests | `fm27-data-parity` | `qa-changes` | None. |
| 11 | R11 Save version compatibility matrix | `fm27-data-parity` | `technical-writing` | None. |
| 12 | R12 Re-sync safety and merge rules | `fm27-data-parity` | `qa-changes` | A save-safety skill would help. |
| 13 | R13 Analyst grounding audit | `fm27-data-parity` | `qa-changes` | None. |
| 14 | R14 Decode stage profiling on Android | `qa-changes` | `fm27-data-parity` | A performance-audit skill would help. |
| 15 | R15 Mobile memory and fallback tuning | `qa-changes` | `fm27-data-parity` | A performance-audit skill would help. |
| 16 | R16 Progressive first paint | `fm27-ui-ux-review` | `web-design-guidelines`, `qa-changes` | None. |
| 17 | R17 Content-fingerprint cache | `fm27-data-parity` | `code-simplifier` | A performance-audit skill would help. |
| 18 | R18 Bundle and startup audit | `code-simplifier` | `qa-changes` | A performance-audit skill would help. |
| 19 | R19 Large-list and chart rendering | `fm27-ui-ux-review` | `web-design-guidelines`, `code-simplifier` | None. |
| 20 | R20 PWA cache freshness and offline update | `qa-changes` | `fm27-data-parity` | None. |
| 21 | R21 Navigation and information architecture review | `fm27-ui-ux-review` | `web-design-guidelines`, `show-me` | None. |
| 22 | R22 First-run onboarding | `fm27-ui-ux-review` | `web-design-guidelines`, `plain-english-content` | None. |
| 23 | R23 Loading, empty and error states | `fm27-ui-ux-review` | `qa-changes` | None. |
| 24 | R24 Search, filters and saved views | `fm27-ui-ux-review` | `code-simplifier` | None. |
| 25 | R25 Mobile touch, contrast and focus audit | `fm27-ui-ux-review` | `web-design-guidelines` | None. |
| 26 | R26 Design system and visual consistency | `fm27-ui-ux-review` | `web-design-guidelines`, `code-simplifier` | None. |
| 27 | R27 Motion, feedback and undo | `fm27-ui-ux-review` | `web-design-guidelines` | None. |
| 28 | R28 Browser and device matrix | `qa-changes` | `fm27-ui-ux-review` | None. |
| 29 | R29 End-to-end smoke tests | `qa-changes` | `github-actions` | None. |
| 30 | R30 Accessibility audit | `web-design-guidelines` | `fm27-ui-ux-review`, `qa-changes` | None. |
| 31 | R31 Offline behaviour | `qa-changes` | `fm27-data-parity` | None. |
| 32 | R32 Security and privacy review | `security` | `github`, `qa-changes` | None. |
| 33 | R33 Finance forecasting and what-if | `fm27-data-parity` | `prd`, `show-me` | None. |
| 34 | R34 Contract expiry alert centre | `fm27-data-parity` | `prd`, `fm27-ui-ux-review` | None. |
| 35 | R35 Staff organisation chart | `fm27-ui-ux-review` | `fm27-data-parity`, `show-me` | None. |
| 36 | R36 Save comparison and what-if scenarios | `fm27-data-parity` | `prd`, `fm27-ui-ux-review` | None. |
| 37 | R37 Share and export reports | `fm27-data-parity` | `security`, `fm27-ui-ux-review` | None. |
| 38 | R38 Dead code and duplicate utility audit | `code-simplifier` | `security` | None. |
| 39 | R39 Type safety and runtime validation | `security` | `code-simplifier` | None. |
| 40 | R40 Large component split | `code-simplifier` | `fm27-ui-ux-review` | None. |
| 41 | R41 Test coverage and quality | `qa-changes` | `code-simplifier` | None. |
| 42 | R42 CI and release automation | `github-actions` | `github`, `release-notes` | None. |
| 43 | R43 Documentation refresh | `agent-memory` | `technical-writing`, `plain-english-content` | None. |
| 44 | R44 Dependency and licence health | `security` | `github` | None. |
| 45 | R45 Performance budgets | `github-actions` | `qa-changes` | A performance-audit skill would help. |
| 46 | R46 Privacy-friendly usage signals | `security` | `prd`, `qa-changes` | A privacy-review skill would help. |

## Gaps worth filling

Two custom skills would cover most of the gaps:

- `fm27-save-safety` for R01, R03 and R12. It would define backup, restore, fixture handling and re-sync checks.
- `fm27-performance-audit` for R05, R14 to R20 and R45. It would define Android benchmarks, memory checks, bundle checks and reporting.

A third optional skill, `fm27-release-check`, would cover R42 by running the exact project checks and guarding cache busters, decoder changes and generated files.

## Skills deliberately not added

- `code-review` — the existing `fm27-data-parity` skill already owns `/codereview` and the parity review workflow.
- `iterate` — it requires draft pull requests, which conflicts with the project ready-PR and auto-merge rules.
- `frontend-design` — it would compete with the FM27 design language and existing UI rules.
- `datadog`, `vercel` and `docker` — the project does not use these as primary workflows today. Add them only when that changes.
