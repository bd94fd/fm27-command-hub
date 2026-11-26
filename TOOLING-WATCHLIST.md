# FM27 tooling watchlist

Last updated: 25 November 2026
Purpose: remember tools and skills worth adding later, so we do not search for them again.

## How to use this list

- Read it at the start of every task, before planning or changing code.
- Check the available MCP tools each session. No MCP server is installed by default; candidates are listed below with their roadmap item.
- Move an item to **In use** only after it is installed and checked.
- Keep the roadmap item and the reason for the timing.
- Add new candidates with a source, licence and risk note.
- Do not add a tool just because it is popular. Add it when a roadmap item needs it.

## In use

| Tool or skill | Type | Use it for | Added |
| --- | --- | --- | --- |
| `playwright-skill` | Skill | Repeatable browser runs, screenshots, end-to-end checks. | 25 Nov 2026 |
| `web-quality-audit` | Skill | Lighthouse evidence and page quality. | 25 Nov 2026 |
| `performance` | Skill | Load measurement, traces and runtime performance. | 25 Nov 2026 |
| `accessibility` | Skill | WCAG 2.2, keyboard, screen reader and focus checks. | 25 Nov 2026 |
| `core-web-vitals` | Skill | LCP, INP and CLS diagnosis. | 25 Nov 2026 |
| `best-practices` | Skill | Security and modern code-quality checks. | 25 Nov 2026 |
| `seo` | Skill | Crawlability, metadata and structured data. | 25 Nov 2026 |
| `ui-ux-audit` | Skill | Optional measured rubric for contrast, spacing and alignment. | 25 Nov 2026 |
| `impeccable` | Skill | Design critique, audit, polish, layout, adapt and anti-slop detection. | 25 Nov 2026 |
| `fm27-save-safety` | Project skill | Backup, restore, fixture and re-sync checks. | 25 Nov 2026 |
| `fm27-performance-audit` | Project skill | Android-first save benchmark and memory checks. | 25 Nov 2026 |
| `fm27-release-check` | Project skill | Full release gate and file-scope guard. | 25 Nov 2026 |

## Add at a specific roadmap item

| Tool or skill | Add when | Why | Source | Licence | Risk or note |
| --- | --- | --- | --- | --- | --- |
| `@axe-core/playwright` | R30 Accessibility audit | Industry-standard automated WCAG checks inside Playwright. | https://github.com/dequelabs/axe-core-npm | MPL-2.0 | Adds a dev dependency. Run against real pages, not mocks. |
| `Pa11y` or `pa11y-ci` | R30, if axe is not enough | CI accessibility checks and simple HTML reports. | https://github.com/pa11y/pa11y | LGPL-3.0 | Choose one engine with axe; do not duplicate every check. |
| Lighthouse CI | R45 Performance budgets | Fails CI when performance or accessibility drops below a budget. | https://github.com/GoogleChrome/lighthouse-ci | Apache-2.0 | Needs a stable preview URL and a budget file. |
| `size-limit` | R45 Performance budgets | Fails CI when the bundle grows past a limit. | https://github.com/ai/size-limit | MIT | Set limits after the R18 baseline, not before. |
| `web-vitals` | R05 and R45 | Real-user LCP, INP and CLS from the app. | https://github.com/GoogleChrome/web-vitals | Apache-2.0 | Needs a privacy-safe reporting endpoint. |
| `vite-bundle-visualizer` or `rollup-plugin-visualizer` | R18 Bundle and startup audit | Shows what is in the production bundle. | https://github.com/btd/rollup-plugin-visualizer | MIT | Use once for the baseline; do not keep it in the runtime bundle. |
| `knip` | R38 Dead code audit | Finds unused files, exports and dependencies. | https://github.com/webpro-nl/knip | ISC | Expect noise in a large app. Review findings, do not delete blindly. |
| `dependency-cruiser` | R38 and R40 | Shows dependency cycles and layering problems. | https://github.com/sverweij/dependency-cruiser | MIT | Add rules only after the first graph review. |
| `unlighthouse` | R18 or R45 | Runs Lighthouse across many routes. | https://github.com/harlan-zw/unlighthouse | MIT | Useful after the single-page baseline is stable. |
| Chromatic, Percy or BackstopJS | R29 or R30 | Visual regression across screens and states. | https://github.com/garris/BackstopJS | MIT for BackstopJS | Hosted tools cost money. Start with Playwright screenshots if possible. |
| Storybook and its a11y addon | R26, if a component library grows | Component states and accessibility in one place. | https://storybook.js.org/addons/@storybook/addon-a11y | MIT | Only worth it if shared components become a real system. |
| Sentry or OpenTelemetry | R06 Error reporting | Real error reports with redaction. | https://github.com/getsentry/sentry-javascript | MIT for the SDK | Do a privacy review before sending any save data. |
| Playwright MCP | R28 or R29, if the skill is not enough | Lets the agent drive a live browser through MCP. | https://github.com/microsoft/playwright-mcp | Apache-2.0 | The Playwright skill already covers most needs. Add only if live MCP control is useful. |
| Chrome DevTools MCP | R05, R14 or R45, if available | Performance traces and insight analysis. | https://github.com/ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | Check that the runtime supports it before relying on it. |
| `verify-regression-tests` | R03 and R41 | Counterfactual check that a regression guard fails for the intended drift and passes again after restore. | https://github.com/aiopshwang/verify-regression-tests | MIT | Skill-only, no runtime dependency. Use when a new regression guard is added; the manual known-bad check is enough for the current fingerprint test. |
| `emilkowalski/skills` | R27 Motion and feedback | Motion review, animation performance and mobile-native guidance. | https://github.com/emilkowalski/skills | MIT | Add only the motion skills, not the whole design set. |
| Vercel `react-best-practices` | R18, R39 and R40 | React performance and bundle rules from Vercel Engineering. | https://github.com/vercel-labs/agent-skills | MIT | Some rules target Next.js and do not apply to Vite. Filter them. |
| Vercel `composition-patterns` | R39 and R40 | Compound components and cleaner component APIs. | https://github.com/vercel-labs/agent-skills | MIT | Useful during the large-component split. |
| Vercel `react-view-transitions` | R27, if we add page transitions | Native view transitions without a heavy animation library. | https://github.com/vercel-labs/agent-skills | MIT | Only use where motion communicates a real spatial change. |
| `plugin87/ux-ui-agent-skills` | R26 or R30, only if we adopt the full kit | Strong design QA and accessibility gates. | https://github.com/plugin87/ux-ui-agent-skills | MIT | The copied skill alone is guidance-only. The gates need the full kit. |
| `nextlevelbuilder/ui-ux-pro-max-skill` | R26, for new design work | Design generation and styling intelligence. | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | MIT | It generates designs; it does not audit an existing screen. |
| `Nutlope/hallmark` | R22 or R26 | Anti-AI-slop design guidance. | https://github.com/Nutlope/hallmark | MIT | A style skill, not a measured audit. |

## Decision log

- 25 Nov 2026: added Playwright, the addyosmani web quality set and the small UI/UX audit rubric.
- 25 Nov 2026: made `fm27-ui-ux-review`, `accessibility` and `web-quality-audit` the primary UI path. Kept `ui-ux-audit` as a supporting rubric.
- 25 Nov 2026: reviewed `pbakaus/impeccable`. It is popular and capable, so it was added with a pinned engine, checksum verification, no hook and no live mode. See `.agents/skills/impeccable/FM27-SETUP.md`.
- 25 Nov 2026: trialled Impeccable on the loaded Staff and Hub screens. Staff had 135 mobile and 106 desktop findings, mostly the same 9px card labels repeated. Hub had 12 findings. Verdict: useful for targeted audits with JSON and dedupe, not yet a blocking CI gate.
- 25 Nov 2026: searched for regression-test skills while starting R03. Added `verify-regression-tests` to the candidate list. It was not installed because the real-save fingerprint guard needed a small manual known-bad check, not a new runtime dependency.

## Rejected for now

| Tool or skill | Why not now |
| --- | --- |
| `datadog`, `vercel`, `docker` | Not primary workflows for this project. |
| `code-review` | `fm27-data-parity` already owns the project review workflow. |
| `iterate` | Requires draft pull requests and conflicts with the ready-PR rule. |
| `frontend-design` | Would compete with the FM27 design language. |
| Full `impeccable` hook and live mode | Too much write access and agent autonomy for the current stage. Revisit after the data-safety work. |
