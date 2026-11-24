# FM27 Command Hub — Antigravity Porting Blueprint & Final Verification Report

> **Status:** Code-Frozen & Verified (Phases 1–6 Complete)  
> **Scope:** Full sandbox optimisation cycle for **FM27 Command Hub** (`fm-command-hub`), Android Chrome & installed PWA first, prepared for staged porting into Antigravity and the main production repository.  
> **Sandbox-Only Edits to Exclude:** **None** across Phases 1–5 (see Section 3 for standing hygiene exclusions).

---

## 0. Antigravity Kickoff Prompt (Copy-Paste Ready)

Paste the block below directly into Antigravity when opening the main `fm-command-hub` repository alongside the synced sandbox branch/files:

```text
You are porting a verified 5-phase optimisation cycle from my AI Studio sandbox into the main fm-command-hub repository. Read docs/ANTIGRAVITY_HANDOFF.md in full first.

Non-negotiable guardrails:
1. Respect every rule in .agent/rules/ (core.md, fm-save-parser.md, mobile-overhaul.md, tactics-and-roles.md, server-and-deploy.md). Plain UK English, zero fake/seeded data, zero raw numeric CA/PA exposed anywhere, authentic FM27 dual-phase IP/OOP roles only.
2. Preserve pinned Gemini model IDs (gemini-3.6-flash Deep / gemini-3.5-flash-lite Fast & Fallback), Dockerfile, render.yaml, the Render 512 MB RAM ceiling, Express 5 named splats, and ?v=22 cache-buster alignment.
3. Exclude any sandbox-only environment artefacts (.env, .aistudio/, DISABLE_HMR overrides, local public/__pycache__/*.pyc). All Phases 1–5 source/test files in the manifest are clean and portable.

Execution plan:
- Port the files strictly in the 5 Staged Merge Batches defined in Section 4 of docs/ANTIGRAVITY_HANDOFF.md (Batch 1 -> Batch 2 -> Batch 3 -> Batch 4 -> Batch 5), resolving cross-batch dependencies and shared files (App.tsx, AutoSyncWorkspace.tsx, SquadAnalyticsTable.tsx) cleanly in order.
- After each batch, run the 5-step CI gate (py_compile, python unittest, npm run lint, npm test, npm run build) and confirm zero regressions before moving to the next batch.
- After Batch 5 is merged and green, execute the Consolidated Verification Runbook in Section 6 in exact order: (a) 5-step CI + un-skipping all 11 local private .fm Python tests, (b) Playwright mobile/desktop Dark+Light + offline PWA audit, (c) live GEMINI_API_KEY 4-endpoint + Deep->Fast failover smoke tests, and (d) real large .fm save (50–250 MB) on Render 512 MB + physical Android Chrome Wake Lock / signal-drop resume / Pyodide WORKERFS fallback.

First, inspect the diff against main and present a concise batch-by-batch merge plan for my approval before modifying main.
```

---

## 1. Executive Baseline vs. Final Scorecard

Comparison of the untouched Pre-Phase 1 baseline against the code-frozen Post-Phase 5 / Phase 6 final state (all metrics independently re-verified during Phase 6):

| Dimension / Metric | Pre-Phase 1 Baseline | Post-Phase 5 Final (Phase 6 Audited) | Net Improvement / Verdict |
| --- | ---: | ---: | --- |
| **Initial Entry JS (`dist/assets/index-*.js`)** | `1,029.61 kB` (`289.32 kB` gz) | **`378.84 kB` (`108.24 kB` gz)** | **`-650.77 kB` (`-63.2%` raw / `-62.6%` gz)** |
| **Hub Cold-Start JS (`index` + `AutoSyncWorkspace`)** | `1,059.54 kB` (`299.24 kB` gz) | **`429.64 kB` (`123.23 kB` gz)** | **`-629.90 kB` (`-59.5%` raw / `-58.8%` gz)** |
| **`jsx-dev-runtime` + Dev React in `dist/`** | `29.93 kB` + dev React bundle | **`0 B` (Eliminated)** | **`-100%`** (`NODE_ENV=production` locked on prod build) |
| **`dist/__pycache__/*.pyc` Bloat** | `~501 kB` (`2` `.pyc` files) | **`0 B` (Eliminated)** | **`-100%`** (stripped from `dist/` & `dist/sw.js`) |
| **Total `dist/` Output Size** | `3.3 MB` | **`2.3 MB`** | **`-1.0 MB` (`-30.3%`)** |
| **PWA Workbox Precache (`dist/sw.js`)** | `45` entries (`2,226.14 KiB`) | **`89` entries (`1,830.46 KiB`)** | **`-395.68 KiB` (`-17.8%`)**; all lazy chunks precached |
| **Global CSS (`dist/assets/index-*.css`)** | `123.23 kB` (`21.79 kB` gz) | **`130.99 kB` (`22.82 kB` gz)** | `+1.03 kB` gz for reduced-motion, 44px targets & Light/Dark parity |
| **Vite / Rolldown Build Warnings** | `1` (`>500 kB` chunk warning) | **`0` warnings** | Clean build in `1.43s` |
| **Mobile Sticky Chrome (`360×800`)** | `~127.6px` (`15.95%`) | **`112.4px` (`14.05%`)** | **`-15.2px`** — strictly inside **`≤ 15%`** cap (`12.28%` at `412×915`) |
| **Mobile Touch Hitbox Floor & Reduced Motion** | `36px` PWA banners; no reduced-motion rule | **`≥ 44×44px`** mobile hitboxes + global `prefers-reduced-motion` | Full Light + Dark parity + geometry-matched skeletons |
| **Python→Node Decode Peak Memory (12 MB Synthetic)** | In-memory `stdoutChunks[]` + full V8 `JSON.parse` | **Disk-streamed (`269.64 MB` RSS / `41.43 MB` heap)** | O(1)-RAM streaming validator + piped delivery + `0` temp leaks |
| **Chunked Upload I/O (24 MB 4-Way Parallel)** | Per-chunk open/close + naive offset sum | **Pooled `FileHandle` + interval-merged byte ranges (`221.47 MB` RSS / `16.22 MB` heap)** | Strictly idempotent retries + `x-fm-chunk-length` truncation check |
| **Android Storage Persistence** | `localStorage`/IDB timestamp drift; 2-tier fallback | **Canonical `syncedAt` + 4-tier `QuotaExceededError` ladder + coalesced IDB queue** | Zero lost targets on reload; `180ms` debounced save + `pagehide` flush |
| **AI Context Builder (`18,000`-char cap)** | Brute-force tail `.slice()` truncation | **`P0`–`P3` deterministic priority assembler (`≤ 15,500` chars)** | Zero P0 truncation on 65p/65m saves + final CA/PA scrubber |
| **AI JSON Unwrap & Failover** | Direct `JSON.parse` only | **4-stage resilient extractor across all 4 endpoints + alternation + Deep→Fast failover** | Verified HTTP `502` on malformed replies; pinned models intact |
| **Cross-Screen Domain Agreement** | Offline briefing drifted on manual swaps/injuries/set-pieces | **100% deterministic alignment across 5 surfaces** | War Room, Transfers, Set-Pieces, Offline Briefing & AI Context |
| **Node / TypeScript Unit Tests (`npm test`)** | `250` pass / `0` fail (`11` suites) | **`327` pass / `0` fail (`16` suites)** | **`+77` tests (`+30.8%`)** |
| **Python Tests (`unittest`)** | `35` ran (`24` pass, `11` skipped) | **`35` ran (`24` pass, `11` skipped)** | PASS (`0.054s`); 11 local `.fm` tests un-skip in Antigravity |
| **TypeScript Strict Lint (`npm run lint`)** | `0` errors | **`0` errors** | PASS (`strict: true`) |
| **Live Server Endpoints & Pinned Models** | HTTP `200` (`gemini-3.6-flash` / `gemini-3.5-flash-lite`) | **HTTP `200` on `/`, `/manifest.json`, `/api/health`, `/api/fm27/decode-status`** | Pinned models & `?v=22` cache-buster 100% intact |

---

## 2. Locked Guardrails & Non-Negotiable Invariants

Every change in this blueprint was audited in Phase 6 against the following production contracts:

- **Gemini AI Models (Unchanged):**
  - Fast / Fallback: `gemini-3.5-flash-lite`
  - Deep / Full Analysis: `gemini-3.6-flash`
  - Verified live via `GET /api/health` (`analystTimeoutMs: 45000`, `deepAnalystTimeoutMs: 60000`).
- **Render Deployment & 512 MB Ceiling (Unchanged):**
  - `Dockerfile`, `render.yaml`, `PORT=8080` default in production, Express 5 named splats (`/{*splat}`), `/api/health`, single-concurrent-job locking (`503`), and `507` OOM fallback remain intact.
- **CORS & Custom Upload Header (`x-fm-chunk-length`) Audit (Phase 6 Verified):**
  - Inspected `server.ts` and `server/middleware/securityGuard.ts`: **FM27 Command Hub runs as a same-origin Express 5 SPA with no `cors` middleware** (`helmet` only). Same-origin browser `fetch()` sends `x-fm-chunk-length`, `x-fm-chunk-offset`, `x-fm-upload-id`, and `x-hub-access-token` natively with zero CORS preflight block — no `server.ts` edit is required.
  - **Future-proofing note:** If a reverse proxy or future `cors(...)` middleware with an explicit `allowedHeaders` list is ever placed in front of `/api/fm27/decode-save/*`, ensure `x-fm-chunk-length` is included alongside `x-fm-chunk-offset`, `x-fm-upload-id`, and `x-hub-access-token`.
- **Cache-Buster Sync (`?v=22`):**
  - Verified 100% aligned across `public/fm-save-worker.js`, `public/fm-save-mapper.py`, and `src/utils/fmSaveHydrator.ts` (`public/*.py` and `public/fm-save-worker.js` were not modified in Phases 1–6).
- **Project Rules (`.agent/rules/`):**
  - `core.md`: Plain UK English, zero fake/seeded clubs or players, zero raw numeric CA/PA exposed in UI/JSON/AI prompts, strict TypeScript (`"strict": true`), **zero new runtime dependencies added**.
  - `fm-save-parser.md`: All Python `fmsave` private-surface invariants and 4-stage progressive decode architecture preserved.
  - `mobile-overhaul.md`: Android Chrome & installed PWA first; desktop `1440px` war-room capability preserved.
  - `tactics-and-roles.md`: Authentic FM27 dual-phase (IP + OOP) roles only (`src/data/fm27Roles.json`); zero retired FM24 role names (`Mezzala`, `Enganche`, `Trequartista`, `Carrilero`, `Raumdeuter`, `Segundo Volante`).
  - `server-and-deploy.md`: Full 5-step CI parity (`py_compile`, Python `unittest`, `npm run lint`, `npm test`, `npm run build`).

---

## 3. Sandbox-Only Edits to Exclude in Antigravity

> **CRITICAL FOR ANTIGRAVITY MERGE:** Never cherry-pick anything listed as a standing sandbox exclusion into the main production repository.

- **Phase 1:** **None.** All 14 test files + `docs/ANTIGRAVITY_HANDOFF.md` are clean and portable.
- **Phase 2:** **None.** Build config (`vite.config.ts`), code-splitting, and chart modules are portable across Antigravity, GitHub Actions CI, and Render Docker builds (`DISABLE_HMR` dev guard left untouched).
- **Phase 3:** **None.** All CSS, mobile hitbox, Light+Dark parity, hairline framing, Suspense skeleton, and automated invariant tests are standard production code.
- **Phase 4:** **None.** All server streaming/pooled-FD/idempotent-upload code, Android storage hardening, and synthetic stress tests are standard production code.
- **Phase 5:** **None.** All JSON extraction, chat alternation, priority-budgeted context, offline briefing alignment, mobile chat polish, and domain tests are standard production code.
- **Phase 6:** **None.** Strict code freeze — only `docs/ANTIGRAVITY_HANDOFF.md` was finalised after full hygiene verification.
- **Standing Sandbox Hygiene Exclusions (All Phases):**
  - Never port local `.env` files, AI Studio runtime metadata (`.aistudio/`), or preview-only `DISABLE_HMR` environment overrides.
  - Local `public/__pycache__/*.pyc` files created by running `py_compile` are `.gitignore`d and automatically stripped from `dist/` and `dist/sw.js` by `vite.config.ts`.

---

## 4. Complete File Manifest — 5 Staged Merge Batches

Port changes into the main repository in exact batch order (**Batch 1 → Batch 2 → Batch 3 → Batch 4 → Batch 5**). All **67 unique touched/added files** (plus 7 untouched guardrail files) were verified present on disk in Phase 6 (`74/74` verified, `0` missing).

### Cross-Batch Dependencies & Shared Multi-Phase Files

Pay special attention to these dependency edges when cherry-picking batch by batch:

| Dependency / Shared File | Touched In Batches | Porting Rule |
| --- | --- | --- |
| **`src/App.tsx`** | Batch 2, Batch 3, Batch 4 | Merge sequentially: Batch 2 (lazy routes + dynamic imports) → Batch 3 (sticky header chrome + `TabWorkspaceSkeleton`) → Batch 4 (`180ms` debounced auto-save + `pagehide` flush). |
| **`src/components/AutoSyncWorkspace.tsx`** | Batch 2, Batch 3, Batch 5 | Merge sequentially: Batch 2 (lazy `SaveSnapshotDiffPanel` + `FmUploadProgressCard` + dynamic imports) → Batch 3 (hitboxes + `UploadProgressSkeleton`/`JourneyPanelSkeleton`) → Batch 5 (mobile chat `min-w-0 break-words` + 44px follow-ups + Light/Dark contrast). |
| **`src/components/SquadAnalyticsTable.tsx`** | Batch 2, Batch 3 | Batch 3's `SquadSubViewSkeleton` depends on Batch 2's lazy `SquadAnalyticsView`/`SquadCompareView`/`SquadProgressionView` splits. |
| **`src/components/charts/MatchXgMomentumChart.tsx` & `SquadScatterAndPlannerCharts.tsx`** | Batch 2, Batch 3 | Created in Batch 2; mobile 44px hitbox/16px select polish applied in Batch 3. |
| **`src/components/WorkspaceSkeletons.tsx`** | Batch 3 | **Depends on Batch 2** (`React.lazy` Suspense boundaries in `App.tsx`, `AutoSyncWorkspace.tsx`, `SquadAnalyticsTable.tsx`). |
| **`server/routes/fmDecodeRoutes.ts` & `src/services/fmSaveReader.ts`** | Batch 4 | Port together as one atomic pair: client sends `x-fm-chunk-length` and reads `receivedRanges`; server validates `x-fm-chunk-length` and returns `receivedRanges` (backwards-compatible with `receivedOffsets`). Same-origin Express requires no CORS edit. |
| **`src/services/fmStorage.ts` & `src/utils/persistedStateRecency.ts`** | Batch 4 | Port together as one atomic pair: `fmStorage.ts` emits `localStorageCompacted: true` + canonical `syncedAt`; `persistedStateRecency.ts` upgrades compacted same-timestamp shells from IndexedDB. |
| **`src/utils/tacticalAnalystContext.ts` & `src/utils/offlineBriefingEngine.ts`** | Batch 5 | **Relies on Batch 2** dynamic `import()` boundaries in `App.tsx` and `AutoSyncWorkspace.tsx` to preserve `0.00 kB` entry JS delta (`index-*.js`). |

---

### Batch 1 — Baseline Test Coverage Hardening & Handoff Ledger (15 Added, 0 Modified)

- **Risk:** Very Low (zero production code touched).
- **Dependencies:** None. Safe to merge first independently.
- **Verification after Batch 1:** `npm test` → `304` pass / `0` fail; `npm run lint` → `0` errors.

| Action | File Path | Summary |
| :---: | --- | --- |
| Added | `src/utils/apiResponse.test.ts` | Safe JSON / HTML error parsing tests |
| Added | `src/utils/clubFinances.test.ts` | Canonical balance priority, wage compliance & runway tests |
| Added | `src/utils/matchScopeHelpers.test.ts` | July 1 European season boundary & cup/friendly isolation tests |
| Added | `src/utils/metaScoreEngine.test.ts` | GK/outfield meta scores, PA age tapering & loanee exclusion tests |
| Added | `src/utils/squadPlannerHelper.test.ts` | 27-slot pitch resolution, `ST`/`CF`→`STC` & FM27 role brief tests |
| Added | `src/utils/dualPhaseRoleEngine.test.ts` | FM27 IP/OOP role catalog integrity & `PosFam >= 15` gate tests |
| Added | `src/utils/cardIntelligenceEngine.test.ts` | Squad/recruitment card scoring, age risk & promise breach tests |
| Added | `src/utils/fm27TacticRoleInference.test.ts` | 4-tier role precedence & zero retired FM24 role tests |
| Added | `src/utils/clubGovernanceAndTactics.test.ts` | Zero grade fabrication, promise audits & blueprint null-safety tests |
| Added | `src/utils/fmfShortlistExporter.test.ts` | RFC 4180 CSV escaping, UID manifest & zero raw CA/PA tests |
| Added | `src/hooks/useUploadWakeLock.test.ts` | Android WakeLock acquire/re-acquire & `beforeunload` guard tests |
| Added | `src/services/liveBridge.test.ts` | Live bridge polling & graceful degradation tests |
| Added | `src/services/saveCache.test.ts` | IndexedDB cache contract & storage fallback tests |
| Added | `src/services/fmSaveReader.test.ts` | Decode status probe, `507` OOM fallback & Stage 2 checkpoint tests |
| Added | `docs/ANTIGRAVITY_HANDOFF.md` | Living handoff blueprint & benchmark ledger |

---

### Batch 2 — Android PWA Cold-Start, Code-Splitting & Build Hygiene (8 Added, 16 Modified)

- **Risk:** Low (build config + lazy/dynamic splitting + chart modularisation; zero visual/CSS rewrites).
- **Dependencies:** Batch 1.
- **Verification after Batch 2:** `npm test` → `306` pass; `npm run build` → `0` warnings, `index-*.js` ≈ `367 kB`, `0` `.pyc` in `dist/`, `0` `jsx-dev-runtime` / `react-dom.development` in `dist/`, `89` PWA precache entries.

| Action | File Path | Summary |
| :---: | --- | --- |
| Modified | `vite.config.ts` | Lock `NODE_ENV=production` on prod build; strip `__pycache__`/`.pyc` from `dist/` & Workbox |
| Modified | `src/App.tsx` | Lazy-load Hub/Proof/Governance/MoreSheet & dynamic-import save/analyst modules while preserving immediate cold-start restore |
| Modified | `src/components/AutoSyncWorkspace.tsx` | Lazy-load `SaveSnapshotDiffPanel` (Journey-gated on mobile) & `FmUploadProgressCard`; dynamic-import upload/analyst engines |
| Modified | `src/components/AppErrorBoundary.tsx` | Dynamic import for `saveCache` inside async reset handler |
| Modified | `src/utils/mobileNavHelpers.ts` | Dynamic imports for `saveCache` / `progressionDiff` inside diagnostics |
| Modified | `src/components/LiveFmSaveProofCard.tsx` | Switch to lightweight `fmSaveUiHelpers` |
| Modified | `src/utils/fmSaveHydrator.ts` | Re-export `fmSaveUiHelpers` for backwards compatibility |
| Modified | `src/data/fm27KnowledgeBase.ts` | Re-export `fm27AccuracyCheck` for backwards compatibility |
| Modified | `src/components/FootballAnalyticsCharts.tsx` | Thin backwards-compatible barrel re-exporting `src/components/charts/*` |
| Modified | `src/components/SquadAnalyticsTable.tsx` | Lazy-load `SquadAnalyticsView`, `SquadCompareView`, `SquadProgressionView` |
| Modified | `src/components/MatchLogArchive.tsx` | Direct import of `MatchXgMomentumChart` |
| Modified | `src/components/PlayerDetailModal.tsx` | Direct import of `PlayerRadarAndPizzaCharts` |
| Modified | `src/components/ScoutTargetDetailModal.tsx` | Direct import of `PlayerRadarAndPizzaCharts` |
| Modified | `src/components/squad/SquadAnalyticsView.tsx` | Direct import of `SquadScatterAndPlannerCharts` |
| Modified | `src/components/squad/SquadCompareView.tsx` | Direct import of `MultiPlayerComparisonChart` |
| Modified | `src/components/recruitment/SelectionCompareDock.tsx` | Direct import of `MultiPlayerComparisonChart` |
| Added | `src/utils/fmSaveUiHelpers.ts` | Zero-dependency UI helper subset extracted from `fmSaveHydrator` |
| Added | `src/utils/fm27AccuracyCheck.ts` | Zero-dependency FM27 accuracy helper extracted from knowledge base |
| Added | `src/utils/fm27AccuracyCheck.test.ts` | Unit tests for `fm27AccuracyCheck` |
| Added | `src/components/charts/chartScaleHelpers.ts` | Shared chart scale helpers |
| Added | `src/components/charts/PlayerRadarAndPizzaCharts.tsx` | Player radar & pizza charts module |
| Added | `src/components/charts/MultiPlayerComparisonChart.tsx` | Multi-player comparison chart module |
| Added | `src/components/charts/MatchXgMomentumChart.tsx` | Match xG momentum chart module |
| Added | `src/components/charts/SquadScatterAndPlannerCharts.tsx` | Squad scatter & planner charts module |

---

### Batch 3 — Android-First UI Polish, Accessibility & Suspense Skeletons (2 Added, 17 Modified)

- **Risk:** Low (surgical CSS/JSX polish + skeletons; zero changes to `FmUploadProgressCard.tsx` or upload state logic).
- **Dependencies:** **Requires Batch 2** (`WorkspaceSkeletons.tsx` plugs into Batch 2 lazy boundaries; chart polish modifies Batch 2 `src/components/charts/*`).
- **Verification after Batch 3:** `npm test` → `312` pass (`+6` automated polish invariant tests); `npm run build` → `0` warnings.

| Action | File Path | Summary |
| :---: | --- | --- |
| Added | `src/components/WorkspaceSkeletons.tsx` | Geometry-matched `TabWorkspaceSkeleton`, `JourneyPanelSkeleton`, `UploadProgressSkeleton`, `SquadSubViewSkeleton` |
| Added | `src/utils/mobilePolishInvariants.test.ts` | 6 automated tests enforcing reduced-motion, 44px targets, hairline framing & skeleton wiring |
| Modified | `src/index.css` | Global `@media (prefers-reduced-motion: reduce)` rule (keeping `@custom-variant dark` intact) |
| Modified | `src/App.tsx` | Tightened mobile `<header>` (`≤ 15%` sticky chrome), 44px controls, Light/Dark parity, `TabWorkspaceSkeleton` |
| Modified | `src/components/MobileBottomNav.tsx` | Tightened bottom nav chrome (`112.4px` total = `14.05%`), Light/Dark parity, `whitespace-nowrap`, `motion-reduce` |
| Modified | `src/components/PwaStatusBanners.tsx` | Upgraded all 4 banner buttons from `36px` to `≥ 44×44px` mobile hitboxes + Light/Dark parity |
| Modified | `src/components/MatchLogCard.tsx` | Replaced `border-l-4` & static pills with `1px` hairline framing, unboxed metadata, 44px CTA & Light/Dark parity |
| Modified | `src/components/ChartRankedListToggle.tsx` | `≥ 44px` mobile hitboxes + Light/Dark parity |
| Modified | `src/components/PitchInspectStrip.tsx` | `≥ 44px` mobile `Edit Role` trigger |
| Modified | `src/components/InteractivePitchBuilder.tsx` | `≥ 44px` IP/OOP/Rest Defence phase controls + `whitespace-nowrap` |
| Modified | `src/components/CommandPaletteModal.tsx` | `16px` mobile search input floor & touch ergonomics |
| Modified | `src/components/SquadAnalyticsTable.tsx` | `≥ 44px` 4-tab bar + wired `SquadSubViewSkeleton` |
| Modified | `src/components/squad/SquadListToolbar.tsx` | `≥ 44px` hitboxes, 16px mobile inputs, crisp `rounded-lg` tabs, Light/Dark parity |
| Modified | `src/components/AutoSyncWorkspace.tsx` | UI-only 44px hitboxes, `whitespace-nowrap`, `motion-reduce`, wired `UploadProgressSkeleton` & `JourneyPanelSkeleton` |
| Modified | `src/components/SaveSnapshotDiffPanel.tsx` | `≥ 44px` mobile tabs/buttons + `whitespace-nowrap` + `motion-reduce` |
| Modified | `src/components/charts/MatchXgMomentumChart.tsx` | `≥ 44px` season/scope/prev-next controls + 16px mobile selects |
| Modified | `src/components/charts/SquadScatterAndPlannerCharts.tsx` | `≥ 44px` pos/preset chips & `Open Profile` button |
| Modified | `src/components/recruitment/RecruitmentHeader.tsx` | `≥ 44px` scope toggle & 5-tab bar + `whitespace-nowrap` |
| Modified | `src/components/recruitment/ScoutTargetFilters.tsx` | `≥ 44px` filter chips + `whitespace-nowrap` |

---

### Batch 4 — `.fm` Save Parser, Upload & Android Storage Hardening (2 Added, 7 Modified)

- **Risk:** Low–Medium (server I/O streaming + client upload/storage resilience; `public/*.py` & `public/fm-save-worker.js` untouched so `?v=22` stays synced).
- **Dependencies:** Batch 1–3 (`App.tsx` builds on Batch 3). Port `fmDecodeRoutes.ts` + `fmSaveReader.ts` together and `fmStorage.ts` + `persistedStateRecency.ts` together.
- **Verification after Batch 4:** `npm test` → `320` pass (`+8` stress/hardening tests including RSS/heap logs); `npm run build` → `0` warnings.

| Action | File Path | Summary |
| :---: | --- | --- |
| Added | `server/fmDecodeStress.test.ts` | 4 synthetic stress tests (24 MB parallel upload, 12 MB Python→Node streaming handoff, `507` OOM, orphan sweep) |
| Added | `src/services/fmStorageHardening.test.ts` | 4 synthetic tests (120p/60m/500t hydration + CA/PA scrub, 4-tier quota compaction, IDB queue, `receivedRanges` retry) |
| Modified | `server/routes/fmDecodeRoutes.ts` | Pooled `FileHandle`, interval-merged byte ranges, `x-fm-chunk-length` validation, disk-streamed Python `stdout`, O(1)-RAM JSON validator, piped HTTP delivery, `fm27-out-*` orphan sweep |
| Modified | `src/services/fmSaveReader.ts` | `receivedRanges` full-coverage reconciliation, once-per-chunk `Blob` allocation, `x-fm-chunk-length` header |
| Modified | `src/services/fmStorage.ts` | Canonical shared `syncedAt`, 4-tier `QuotaExceededError` compaction ladder, latest-wins coalesced IDB write queue |
| Modified | `src/utils/persistedStateRecency.ts` | Allow full-fidelity IndexedDB snapshot to upgrade same-timestamp `localStorageCompacted` shell |
| Modified | `src/services/saveCache.ts` | Cursor-based `putSaveHistoryPoint` pruning + 1-shot `QuotaExceededError` cache eviction retry |
| Modified | `src/App.tsx` | `180ms` debounced auto-save with immediate `pagehide` / `visibilitychange` (`hidden`) flush |
| Modified | `src/utils/fmSaveHydrator.test.ts` | Updated server decode guardrail assertion to verify disk-streamed `outStream.write(` |

---

### Batch 5 — AI Tactical Analyst & Cross-Screen Domain Depth (3 Added, 4 Modified)

- **Risk:** Low (server JSON unwrapping + priority-budgeted context + offline briefing alignment + mobile chat wrap polish; pinned Gemini models untouched).
- **Dependencies:** Batch 2–4 (`AutoSyncWorkspace.tsx` builds on Batch 3; lazy import of `tacticalAnalystContext` & `offlineBriefingEngine` relies on Batch 2).
- **Verification after Batch 5:** `npm test` → **`327` pass / `0` fail**; `npm run build` → `0` warnings, `index-*.js` = **`378.84 kB`** (`0.00 kB` delta vs Batch 4).

| Action | File Path | Summary |
| :---: | --- | --- |
| Added | `server/jsonExtractor.ts` | Pure `extractStructuredJsonObject()` (BOM/fences/prose/balanced-brace/minor repair) & `normalizeTacticalChatHistory()` |
| Added | `server/jsonExtractor.test.ts` | 5 server unit & HTTP tests (JSON unwrap, chat alternation, HTTP `502` on all 4 endpoints, Deep→Fast timeout failover) |
| Added | `src/utils/phase5AnalystAndConsistency.test.ts` | 65p/65m priority-budgeted stress test (`<= 15,500`/`18,000`, zero P0 truncation, zero CA/PA) & 5-screen deterministic agreement test |
| Modified | `server/routes/fm27Routes.ts` | Wired `extractStructuredJsonObject()` across all 4 AI endpoints & `normalizeTacticalChatHistory()` in `/api/fm27/tactical-chat` |
| Modified | `src/utils/tacticalAnalystContext.ts` | Added `assemblePriorityBudgetedContext()` (`P0`–`P3` tiers, line-safe squad sizing) & final `scrubRawCaPaTokens()` guard |
| Modified | `src/utils/offlineBriefingEngine.ts` | Reconciled manual `customSlots.playerId` swaps, `decoded.activeInjuries`, `Promote to Backup`, Starting XI & `Set-Piece Specialists` |
| Modified | `src/components/AutoSyncWorkspace.tsx` | Surgical mobile chat polish (`min-w-0 break-words`, `min-h-[44px]` follow-up buttons, Light/Dark contrast parity) |

---

## 5. Detailed Phase-by-Phase Diff Log & Benchmarks

### Baseline Diagnostic Findings (Pre-Phase 1)

- **Bundle & Build:** Initial `index-*.js` was `1,029.61 kB` (`289.32 kB` gz) with a Vite `>500 kB` warning; `jsx-dev-runtime` (`29.93 kB`) + `react-dom.development` leaked into production when `NODE_ENV=development` was inherited; `dist/__pycache__/*.pyc` added `~501 kB` of dead bytecode.
- **Mobile UI:** `PwaStatusBanners` used `36px` buttons; sticky chrome at `360×800` was `~127.6px` (`15.95%`); `MatchLogCard` used thick `border-l-4`; no global `prefers-reduced-motion: reduce` rule existed.
- **Parser & Storage:** `fmDecodeRoutes.ts` opened/closed FDs per chunk and ran full-tree `JSON.parse()` on Python `stdout` in Node V8 heap; `fmStorage.ts` had a `localStorage`/IDB timestamp drift bug on compacted saves.
- **AI Analyst:** Context builder used brute-force tail `.slice()`; endpoints used bare `JSON.parse()`; offline briefing drifted on manual swaps, decoded injuries, and set-piece specialists.

### Phase 1 — Baseline Benchmark & Test Coverage Hardening (Complete)
- Added `14` test suites covering previously untested utils, hooks, and services (`250 -> 304` pass, `+54` tests, `0` prod files modified).

### Phase 2 — Android PWA Cold-Start, Code-Splitting & Render Speed (Complete)
- Locked `NODE_ENV=production` on production builds (`vite.config.ts`), eliminating `jsx-dev-runtime` (`29.93 kB`) and `react-dom.development` (`+247.7 kB`) without touching dev HMR.
- Stripped `public/__pycache__/*.pyc` (`~501 kB`) from `dist/` and `dist/sw.js` while leaving `py_compile` and `Dockerfile` intact.
- Deferred `AutoSyncWorkspace`, `SaveSnapshotDiffPanel`, `FmUploadProgressCard`, `.fm` reader/hydrator/importer, `tacticalAnalystContext`, `offlineBriefingEngine`, `saveCache`, `progressionDiff`, `LiveFmSaveProofCard`, `ClubGovernanceBanner`, and `MobileMoreSheet` while keeping immediate cold-start club restore from `localStorage`/`IndexedDB`.
- Split 3,041-line `FootballAnalyticsCharts.tsx` into 5 focused modules under `src/components/charts/` and lazy-loaded `SquadAnalyticsTable` secondary sub-views.
- Cut `index-*.js` from `1,029.61 kB` -> `366.98 kB` (`-64.4%` raw), total `dist/` from `3.3 MB` -> `2.3 MB`, and Workbox precache from `2,226.14 KiB` -> `1,799.85 KiB` across `89` entries (`0` warnings; `306` tests pass).

### Phase 3 — Android-First UI Polish & Workflow Clarity (Complete)
- Added `WorkspaceSkeletons.tsx` (geometry-matched dark/light Suspense skeletons replacing bare `"Loading..."` fallbacks).
- Upgraded mobile hitboxes across 16 components (including `PwaStatusBanners` `36px -> 44px`), added explicit `16px` mobile input floors and `whitespace-nowrap` labels.
- Tightened mobile sticky chrome (`header` + `MobileBottomNav`) to `112.4px` (`14.05%` at `360×800`, `12.28%` at `412×915`, `12.06%` at `430×932` — strictly `≤ 15%`).
- Added global `@media (prefers-reduced-motion: reduce)` in `src/index.css` + `motion-reduce:animate-none` guards, replaced `MatchLogCard` `border-l-4` / boxed pills with `1px` hairline framing, and enforced Light + Dark parity (`312` tests pass; `FmUploadProgressCard.tsx` untouched).

### Phase 4 — `.fm` Save Parser, Upload & Hydration Hardening (Complete)
- Eliminated V8 heap amplification in `server/routes/fmDecodeRoutes.ts` via disk-streamed Python `stdout` (`0o600` `fm27-out-<jobId>.json` in `os.tmpdir()`), O(1)-RAM streaming JSON validator (`validateJsonObjectFileStreaming`), piped HTTP delivery, raw-string Stage 2 checkpoints, active-child tracking, and `fm27-out-*` orphan sweeping.
- Added pooled `FileHandle` I/O (`inFlightWrites` ref-count + `closeUploadHandle` drain), pure interval-merged byte-range accounting (`mergeByteRanges`, `computeCoveredBytes`, `isContiguousRangeCovered`), `x-fm-chunk-length` truncation check, and `receivedRanges` reconciliation in `fmSaveReader.ts`.
- Fixed `fmStorage.ts` canonical `syncedAt` drift, implemented 4-tier `QuotaExceededError` compaction + latest-wins coalesced IDB write queue + `saveCache.ts` cursor pruning/quota eviction retry + `180ms` debounced `App.tsx` auto-save with `pagehide`/`visibilitychange` flush.
- Synthetic stress benchmarks (`320` tests pass):
  - **24 MB 4-way parallel upload + retries/overlaps/abort:** `862 ms`, peak RSS **`221.47 MB`**, peak V8 heap **`16.22 MB`**, `0` temp leaks.
  - **12 MB Python→Node streaming handoff + checkpoint + `503` lock:** `781 ms`, peak RSS **`269.64 MB`**, peak V8 heap **`41.43 MB`**, `0` temp leaks.
  - **120p / 60m / 500t hydration + 220 KB `localStorage` cap:** `84 ms`, peak RSS **`106.13 MB`**, peak V8 heap **`12.35 MB`**, zero raw CA/PA.

### Phase 5 — AI Tactical Analyst & Domain Engine Depth (Complete)
- Implemented 4-tier deterministic priority context assembler (`P0`–`P3`) in `src/utils/tacticalAnalystContext.ts` (`≤ 15,500` chars under `18,000` ceiling, zero P0 truncation on 65p/65m stress save, final `scrubRawCaPaTokens()` guard).
- Added `server/jsonExtractor.ts` (`extractStructuredJsonObject()` + `normalizeTacticalChatHistory()`) wired across all 4 AI endpoints in `server/routes/fm27Routes.ts`, and verified Deep (`gemini-3.6-flash`) → Fast (`gemini-3.5-flash-lite`) timeout failover.
- Reconciled `offlineBriefingEngine.ts` with War Room, Transfers, Set-Pieces, and AI Context for 100% deterministic 5-screen agreement (`customSlots`, `decoded.activeInjuries`, `PosFam` gate, competition-scoped bans, Surplus `-22`, `Promote to Backup`, Set-Piece specialists, authentic FM27 IP/OOP roles only).
- Added mobile chat bubble wrapping (`min-w-0 break-words`), `44px` follow-up buttons, and Light/Dark contrast in `AutoSyncWorkspace.tsx` (`0.00 kB` entry JS delta; `327` tests pass).

### Phase 6 — Final Hygiene & Code-Freeze Audit (Complete)
- **Strict Code Freeze Maintained:** `0` production source/test files edited (audit confirmed `0` hygiene issues and no CORS header edit needed in same-origin `server.ts`).
- **All 5 CI Steps Re-Verified:**
  1. `python3 -m py_compile public/*.py` → **PASS**
  2. `python3 -m unittest discover -s tests/python -v` → **PASS** (`35` ran, `24` pass, `11` skipped private local `.fm` fixtures, `0.054s`)
  3. `npm run lint` (`tsc --noEmit`) → **PASS** (`0` errors)
  4. `npm test` → **PASS** (`327` pass / `0` fail / `16` suites, `11.9s`)
  5. `npm run build` → **PASS** (`1.43s`, `0` warnings, `index-*.js` = `378.84 kB` / `108.24 kB` gz, `index-*.css` = `130.99 kB` / `22.82 kB` gz, `dist/` = `2.3 MB`, `89` Workbox precache entries = `1,830.46 KiB`)
- **Dist, Tree & Live Endpoint Hygiene Re-Verified:**
  - `PYC_IN_DIST = 0`, `DEV_RUNTIME_HITS = 0`, `STRAY_FILES = 0`.
  - Live HTTP `200` on `/`, `/manifest.json`, `/api/health` (`gemini-3.6-flash` / `gemini-3.5-flash-lite`), and `/api/fm27/decode-status`.
  - `?v=22` cache-buster 100% aligned across `public/fm-save-worker.js`, `public/fm-save-mapper.py`, and `src/utils/fmSaveHydrator.ts`.
  - Zero raw CA/PA fields in UI components, context builder, offline briefing, or AI routes.
  - All `74/74` manifest + guardrail files verified present on disk.

---

## 6. Consolidated Antigravity & Physical Android Verification Runbook

Execute these 4 stages in exact order after porting Batches 1–5 in Antigravity:

### (a) 5-Step CI Gate + Un-Skipping the 11 Local Private `.fm` Python Tests

- [ ] Run all 5 CI commands cleanly from the repo root:
  ```bash
  python3 -m py_compile public/*.py
  python3 -m unittest discover -s tests/python -v
  npm run lint
  npm test
  npm run build
  ```
- [ ] Confirm **all 35 Python tests execute and pass (0 skipped)** with your local private `.fm` save fixtures present in Antigravity (un-skipping the 11 sandbox-skipped fixture tests).
- [ ] Confirm `npm test` passes all **`327+`** tests (`0` failures) and `npm run build` produces **`0` warnings**, **`0` `.pyc`/`__pycache__`** in `dist/`, **`0` `jsx-dev-runtime`/`react-dom.development`** references in `dist/`, `index-*.js ≈ 379 kB`, and `89` Workbox precache entries in `dist/sw.js`.
- [ ] Confirm `GET /api/health` returns HTTP `200` with `model: "gemini-3.6-flash"`, `fastModel: "gemini-3.5-flash-lite"`, and `fallbackModel: "gemini-3.5-flash-lite"`.

### (b) Playwright Mobile & Desktop Dark + Light + Offline PWA Audit

Serve the production build (`npm run build && npm start`) and run Playwright / Chromium DevTools audits across **`360×800`**, **`412×915`**, and **`1440×900`** in both **Dark mode** (`html.dark`) and **Light mode** (`html` without `.dark`):

- [ ] **Cold-Start & Lazy Navigation:** Verify zero console/network errors, immediate restoration of the last synced club from `localStorage`/`IndexedDB`, and smooth lazy chunk loading across `Hub`, `Squad` (`List`, `Analytics`, `Compare`, `Progression`), `Tactics`, `Transfers`, `Matches`, `Staff`, `More` sheet, and mobile `Journey` tab.
- [ ] **Offline PWA Precache Verification:** Wait for `dist/sw.js` activation, toggle **Offline** (DevTools / Airplane Mode), reload the app, and confirm every lazy tab, modal, and split chart module opens cleanly from the Workbox precache.
- [ ] **Mobile Sticky Chrome Cap (≤ 15%):** Measure `header.getBoundingClientRect().height + nav[aria-label="Mobile navigation"].getBoundingClientRect().height` at `360×800` and `412×915`; assert total is `≤ 120px` at `800px` height (`≤ 15%`, expected `~112–114px`).
- [ ] **Touch Hitbox Floor (≥ 44×44px) & Single-Line Labels:** Verify all mobile buttons, dismiss `×` icons, segmented controls, and filter/tab triggers on `PwaStatusBanners`, `MobileBottomNav`, `SquadListToolbar`, `ChartRankedListToggle`, `PitchInspectStrip`, `MatchLogCard`, `AutoSyncWorkspace` (including Analyst follow-up buttons), `SaveSnapshotDiffPanel`, `RecruitmentHeader`, and `ScoutTargetFilters` report `height >= 44px` (and icon-only buttons `width >= 44px`), with `whitespace-nowrap` preventing awkward 2-line wraps.
- [ ] **Zero Horizontal Overflow & 16px Mobile Inputs:** Assert `document.documentElement.scrollWidth <= window.innerWidth` at `360px`, `412px`, and `1440px` across all tabs (including long AI Analyst chat messages). Focus search inputs, selects, and the Analyst composer on mobile and verify computed `font-size >= 16px` (zero iOS/Android auto-zoom).
- [ ] **Reduced-Motion & Skeleton Shift (≤ 2px):** Toggle `prefers-reduced-motion: reduce` in DevTools Rendering and confirm pulse/spin animations freeze. Throttle Network to `Slow 3G` and switch lazy tabs/sub-views to confirm `WorkspaceSkeletons` align within `≤ 2px` vertical shift.
- [ ] **FM27 UX Invariants:** Verify frozen player column horizontal scroll in `SquadDataTable`, mobile tap-to-inspect pitch strip in `TacticalWarRoom`, bottom sheets capped at `max-h-[92dvh]`, and `1px` hairline framing (zero `border-l-4`) on `MatchLogCard`.

### (c) Live `GEMINI_API_KEY` 4-Endpoint + Deep→Fast Failover Smoke Tests

Run against a live `GEMINI_API_KEY` on a real hydrated 50+ player `.fm` save:

- [ ] **`POST /api/fm27/tactical-chat` (Deep & Fast modes):** Send a multi-turn tactical query (including a follow-up referencing a specific player's `PosFam` and competition ban) in both Deep (`gemini-3.6-flash`) and Fast (`gemini-3.5-flash-lite`) modes; verify structured JSON unwraps cleanly, quotes exact squad data, uses authentic FM27 IP/OOP roles only, and contains zero raw numeric CA/PA.
- [ ] **`POST /api/fm27/analyze-screenshot`:** Upload a real FM27 tactics or squad screenshot and confirm clean structured JSON extraction.
- [ ] **`POST /api/fm27/match-debrief`:** Trigger a Deep AI Debrief from `MatchLogCard` and verify structured debrief cards render cleanly.
- [ ] **`POST /api/fm27/journey-report`:** Trigger a Save-to-Save Journey AI Briefing between two real snapshots and verify KPI/player deltas render cleanly.
- [ ] **Deep→Fast Timeout Failover Smoke Test:** Temporarily lower `DEEP_ANALYST_TIMEOUT_MS` (or simulate a slow Deep response in staging) to verify automatic failover from `gemini-3.6-flash` to `gemini-3.5-flash-lite` completes without returning a 500/HTML error.

### (d) Real Large `.fm` Save on Render `512 MB` + Physical Android Chrome Installed PWA

- [ ] **Render `512 MB` Large `.fm` Save (`50–250 MB`):** Run the Docker image under a hard 512 MB ceiling (`docker run --memory=512m ...`) or Render staging and upload a real multi-season `.fm` save:
  - Verify Stage 2 progressive checkpoint hydrates the UI while Stages 3/4 finish.
  - Verify peak Node RSS stays flat during disk-streamed Python `stdout` delivery (no premature V8 OOM; immediate `507` `SERVER_OOM` + automatic browser fallback if a huge save triggers cgroup SIGKILL).
  - Verify `ls /tmp/fm27-*` shows **0 leftover** `fm27-save-*.fm`, `fm27-cp-*.json`, or `fm27-out-*.json` files after completion, after mid-upload cancel, and after a simulated error.
  - Verify zero raw numeric CA/PA fields appear anywhere in hydrated JSON, UI, or Analyst prompts.
- [ ] **Physical Android Chrome Installed PWA — Signal-Drop Pause/Resume:** Start uploading a real `50–150 MB` `.fm` save in the installed Android PWA; toggle Airplane Mode mid-upload → confirm clean auto-pause; restore signal → confirm `GET /upload/:id/status` reconciles `receivedRanges` and resumes without re-uploading completed chunks.
- [ ] **Physical Android Chrome — Screen Wake Lock:** Lock/switch away from Chrome mid-upload (and during a Matchday Companion session), then return → confirm Screen Wake Lock re-acquires cleanly on `visibilitychange`.
- [ ] **Physical Android Chrome — 1-Tap Pyodide `WORKERFS` Fallback:** Tap *"Decode on phone instead"* mid-upload (and test when server decode is disabled) → confirm partial server upload is `DELETE`d cleanly, `?v=22` worker & mapper load fresh without stale SW cache, and local Pyodide `WORKERFS` completes decode cleanly with Fast Sync enabled on mobile.
- [ ] **Physical Android Chrome — Google Drive Picker & Reload Persistence:** Pick a `.fm` save directly from Google Drive (`content://`) → verify the 5s stall tip appears if Drive download stalls; once hydrated, close and reopen the installed PWA to confirm instant cold-start shell restoration + full IndexedDB hydration (all 500 scout targets & full squad intact, zero `QuotaExceededError` crashes).
