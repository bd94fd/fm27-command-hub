# AGENTS.md

## Working with this user

- The user does not code and does not want to be a relay between tools. Do not ask them to edit files, run commands, read stack traces, or paste code between assistants.
- Handle implementation, verification, commits, pushes, and PR updates end-to-end.
- Report in plain English: what changed, what it means for the app, and what the user needs to do. Usually that is nothing.
- Keep code snippets, raw logs, and low-level technical detail out of the main answer unless the user asks for them.
- Merge pull requests automatically once checks pass, unless the user says otherwise. Ask only for genuinely destructive actions such as deleting data, force-pushing, or rewriting history.
- The latest explicit instruction about which files to touch wins. Do not keep re-asking or re-raising files the user has already allowed or excluded.
- Treat file bans as scoped to the request that stated them, not permanent permissions. If the current message and a background task summary disagree, stop and ask which is current; do not let the background summary override the message.
- Python save-decoder files and cache busters are in scope by default. When a mapper change ships, bump every synced cache-buster reference in the same PR so phones do not keep the old decoder. A task-level instruction may exclude them; that exclusion does not carry into later tasks.
- Open pull requests as ready for review, not drafts, unless the user asks for a draft.
- Use the real save files already available in the workspace (`.agents_tmp/decoded/`, `.agents_tmp/uploads/`) for parity checks. Do not ask the user to decode or inspect saves manually.
- The user cannot attach files in chat. To receive a save, run a temporary token-gated upload page on the work host (port 12001, `https://work-2-<id>.prod-runtime.all-hands.dev/u/<token>`) that writes into `.agents_tmp/uploads/`, then stop it as soon as the file lands. Keep the file out of Git and keep only the fingerprint manifest.
- A save the user "believes" is new may be byte-identical to one already in the corpus. Compare SHA-256 against `tests/fixtures/real-saves/manifest.json` before treating it as new coverage.
- When the user describes a problem in plain language, translate it into the technical investigation yourself. Do not require them to diagnose it first.

## Decode performance priorities

- Full Sync on the user's phone is the primary path. Server decoding is a backup, not the default goal.
- When asked to speed up Full Sync, optimise the phone/browser Pyodide decoder first. A server-only change is not an answer; state which path changed and whether the phone improved.
- Phones default to `On this phone` decoding without uploading. Server upload is opt-in. Do not silently prefer the server on mobile.
- Free Render is CPU-limited. Do not suggest paid hosting unless the user asks, and do not present desktop or server timings as proof of phone speed.
- If the change was not measured on a real phone, say so plainly.

## Start-of-task gate

- Before planning or changing code, read `ROADMAP.md`, `TOOLING-WATCHLIST.md`, `docs/mcp-setup.md`, and the available skill/MCP list.
- Name the applicable skills and MCP servers in one line, and invoke every matching skill. If none applies, say why once.
- Use `playwright` MCP for live UI interaction, `chrome-devtools` MCP for performance traces, and the Playwright skill for repeatable scripted checks. Do not use two of them for the same check.
- Prefer an installed skill or MCP tool over an ad-hoc script when it covers the job.
- If a missing tool would clearly help, add it to `TOOLING-WATCHLIST.md` with the roadmap item, source, licence and risk. When the roadmap item needs it, add it to the repo in the same PR or a small prep PR, with lockfile and tests. Do not stop at a note.
- For host-level tools such as MCP servers, check whether they are available. If they are not, record the exact setup step and tell the user once; do not pretend to use them.
- Every PR body and final summary includes `Skills applied:` and `MCP checked:` lines.

## Skills

- Before changing code, run a skill check: name the skills that apply and invoke them. Do not silently skip a matching skill.
- Save data, Analyst, staff, finances, or decoder work: use `fm27-data-parity`. Before changing a core field, read `docs/data-parity-contract-map.md` and update its row in the same change.
- Finance projections (scenarios, what-if, forecasting): start from `buildClubFinancesPanel` values and put the arithmetic in one pure selector under `src/utils/`. The "before" side of a projection must show the same runway label the card shows, and the panel must say why when the two bases differ. Scenarios are user input, not save data: do not send them to the Analyst.
- Staff hierarchy surfaces: FM27 stores a job title, not a reporting line. Build any org view from `buildStaffOrgChart` (`src/utils/staffOrgChart.ts`), which heads each department by its most senior job title and says so on screen. Never present an inferred head to the Analyst as decoded fact, and never flag a one-person board or a missing board job as a gap. See `docs/staff-org-chart.md`.
- Export surfaces: a report is an output, never an input. Build it with `buildReportRows` / `buildReportCsv` / `buildReportCardModel` (`src/utils/reportExport.ts`) and share it with `buildShareSummary` (`src/utils/shareSummary.ts`). Finance figures must come from `buildFinancesPanelFromSave`, so the report and the Finances panel cannot disagree. A value the save lacks prints blank, never zero, and a `0` weekly wage counts as missing. A read-only link carries counts, club totals and the top five ratings only, never per-player wages or contracts. See `docs/share-and-export.md`.
- Planning surfaces: a plan (transfer, sale, release, wage change) is the user's intention, not save data. Build the numbers with `buildPlanImpact` (`src/utils/transferPlan.ts`), which delegates every money figure to `projectFinanceScenario`, and keep the plan in its own key (`fm27_command_hub_transfer_plan_v1`). A plan must never be merged into, or cleared with, the decoded save state. A planned fee is the user's estimate and the UI must say so. See `docs/transfer-plan.md`.
- Type boundaries: data the app creates is typed; data from outside is parsed before it is trusted. The Analyst answer goes through `parseAnalystChatResponse` (`src/utils/analystResponse.ts`) — never read model output directly, and keep its `issues` warning. New edges get a parser plus a garbage-input test. No `any` in `src/` or `server/`; `src/utils/typeSafety.test.ts` enforces that and the strict compiler flags. See `docs/type-safety.md`.
- Money and attribute formatting: one formatter per shape, all in `src/utils/clubFinances.ts` — `formatClubMoney` for compact (`£12K`), `formatSignedClubMoney` for change labels (`+£12K`), `formatWeeklyAmount` for exact weekly (`£1,234/wk`), and `formatWeeklyWage` (`src/utils/squadViewHelpers.ts`) for compact table wages. Use `clampAttributeValue` (`src/types/fmSave.ts`) for the 1–20 clamp. Do not add a private copy: `clubFinances.test.ts` fails if one appears. See `docs/dead-code-audit.md`.
- Wage direction in finance projections: a weekly wage rise must move the monthly net down and a wage saving must move it up. `financeScenarios.test.ts` asserts this direction, so do not flip the sign back.
- Contract expiry surfaces: reuse `PlayerTransferAdvice` and `staffContractDaysRemaining`; never re-derive a verdict or a date. The Transfers centre plans 12 months ahead for players and staff, while the Staff tab keeps its 190 day "expiring soon" badge — different questions, so do not merge the two windows. A missing expiry or wage is left out and said out loud, never defaulted. Plans (renew/sell/release) are user intentions in `fm27_contract_plan_v1`, keyed per club via `resolveChatClubKey`, validated on read, and never sent to the Analyst. See `docs/contract-expiry-centre.md`.
- Backup, restore, fixture or re-sync work: use `fm27-save-safety`.
- Real-save regression work: use `fm27-save-safety` and `docs/real-save-regression.md`. Never commit `.fm` files or decoded payloads; keep only the safe fingerprint manifest.
- Save-load speed, memory, bundle or performance-budget work: use `fm27-performance-audit`.
- Any screen, layout, or mobile change: use `fm27-ui-ux-review` and `web-design-guidelines`.
- Measured UI audit for contrast, tap targets, spacing or alignment: use `ui-ux-audit` as a supporting rubric after `fm27-ui-ux-review` and `accessibility`.
- Design critique, audit, polish, layout, adapt or anti-slop work: use `impeccable` after reading `.agents/skills/impeccable/FM27-SETUP.md`. Do not run its live mode or installer hooks without explicit approval.
- Accessibility or WCAG work: use `accessibility`.
- Lighthouse, Core Web Vitals or page quality work: use `web-quality-audit`, `performance` and `core-web-vitals`.
- Browser automation, screenshots or end-to-end checks: use `playwright-skill` for repeatable scripts, or the `playwright` MCP server for live interaction.
- Performance traces, long tasks or memory checks: use the `chrome-devtools` MCP server and `fm27-performance-audit`.
- GitHub repository, PR, issue or workflow work: use `github` and `github-actions`.
- Security, privacy, secrets or data handling: use `security` and `best-practices`.
- Feature planning before code: use `prd`.
- Release notes or changelogs: use `release-notes`.
- Before pushing or merging a code change: use `fm27-release-check`.
- User-visible behavior changes: use `qa-changes` to exercise the real app, not just the test suite.
- Multi-file cleanup or refactor: use `code-simplifier`.
- Explaining a technical topic to the user: use `show-me` for a small visual, and `plain-english-content` for the prose.
- Engineering explanations and design discussion: use `technical-writing`.
- A recurring fix or workflow: use `skill-creator` to capture it as a reusable skill.
- Updating project memory or `AGENTS.md`: use `agent-memory`.
- Before searching for a new tool or skill, read `TOOLING-WATCHLIST.md`. When you find a useful candidate, add it there with the roadmap item, source, licence and risk. Do not search for the same thing twice.
- Do not invoke unrelated skills just to fill the list. Say which skills apply and why the others do not.
- Priority when instructions conflict: latest explicit user instruction, then this file, then the task-specific skill, then general guidance. State the conflict once and record any partial work.
- Every PR body and final summary includes a short `Skills applied:` line.

## Planning

- `ROADMAP.md` is the only work queue. Before starting, name the roadmap item and its current status. Do not create a parallel numbered list in chat or the task tracker; task-tracker titles may only mirror roadmap items with the `Rxx` prefix.
- If a request does not map to a roadmap item, stop and ask whether to add it to `ROADMAP.md` before doing the work. Do not do adjacent "while I am here" work.
- Update the item status in `ROADMAP.md` in the same PR when work starts or finishes.
- Every PR title or body must include `Roadmap: Rxx`. Before suggesting a next step, read `ROADMAP.md` and name the next item by ID.
- Add new ideas to the right roadmap wave instead of keeping them only in chat.

## Where code goes

- Analyst UI goes in `src/components/analyst/`. The workspace passes props down; a panel does not reach back into it, and a new panel gets its own file.
- Payload diagnostics and pre-flight validation live in `src/utils/analystPayload.ts`, which imports from `tacticalAnalystContext.ts` and never the reverse. Do not re-export across the two, or the cycle comes back.
- App chrome goes in `src/components/shell/`: header, save receipt strip, the background sync pill, `AppMainContent` (the tab workspace) and `AppOverlays` (the navigation, sheets and modals that float over it). `App.tsx` keeps state, routing and persistence, and passes counts and callbacks down.
- `docs/component-map.md` says which file owns what, and which big files are still unsplit. Read it before adding to a large component.

## Verification on this machine

- A browser gate must clear storage from the browser side (`Storage.clearDataForOrigin`). Deleting IndexedDB from inside the page leaves the app's own connection half-closed, and the import that follows cannot save. A save left by another gate also makes a save-load check pass without an import.
- A page with a live upload guard raises a beforeunload prompt, and the navigation that follows never completes until it is answered. `scripts/lib/browser.mjs` accepts that prompt for every gate; do not remove it.
- Browser gates read `dist/` from a production server on port 12000. Both harnesses now disable the HTTP cache; before that, a cached bundle could pass for a build that no longer existed.
- `npm test` shows one failure here that CI does not see: `fm_layout_patcher classifies tested vs untested 27.x builds without fmsave` asserts no fmsave is installed, and this container has it so server decode works. Do not "fix" the assertion; check it still fails with your changes stashed.
- `npm run smoke:e2e` is the flow gate (see `docs/e2e-smoke.md`). It needs the newest `.fm` in `.agents_tmp/uploads/` and about 40 seconds per profile.
- `npm run a11y:audit` is the accessibility gate (see `docs/accessibility.md`). Run it with `-- --save=<newest .fm>`: without a save it only sees the first-run screen.
- `npm run keyboard:audit` is the keyboard gate (see `docs/accessibility.md`). It walks every section and up to six views inside each one on desktop and mobile, opens a player with Enter alone, and checks every overlay's dialog contract. Needs the production build served and about four minutes with `-- --save=<newest .fm>`.
- `npm run offline:check` cuts the network in Chromium and proves the shell, the sections, the Analyst, backup and a phone decode still work. Needs the production build served and a real save; see `docs/offline-behaviour.md`.
- Production sends a strict Content-Security-Policy (`server/contentSecurityPolicy.ts`). Any new external fetch must be added there too, or the phone decoder stops working silently. `npm run offline:check` is the proof it is complete: it decodes a real save on the emulated phone.
- `HUB_ACCESS_TOKEN` is optional and off unless set. The browser sends it through `src/utils/hubAuth.ts`, which asks once per device and stores it in localStorage. Never build it into the bundle.
- `npm run verify:precache` guards the service worker: it fails when `dist/sw.js` precaches nothing or misses the shell. CI runs it after the build. The reason it exists is in `docs/dependency-security.md`.
- A "still broken" reading after a change usually means the old bundle is cached, not that the fix failed. The service worker keeps serving the previous build until it is replaced. Before believing a measurement, unregister the worker (`navigator.serviceWorker.getRegistrations()`), delete the caches (`caches.keys()`), reload, then measure again. This has already produced one false "the fix did not work" report on a tap-target change that was in fact live.
- `npm run parity:snapshot` then `npm run parity:compare` is the layout gate for a refactor that must not change behaviour: it captures the rendered element tree, classes, roles, aria labels and heading text of every section and overlay for two builds and diffs them. See `docs/dom-parity.md` for the second-port recipe and for what it deliberately normalises.
- Run one browser gate at a time. They all drive the same Chromium on port 9222, so parallel runs produce fake failures (tabs that "could not be opened", targets that vanish).
