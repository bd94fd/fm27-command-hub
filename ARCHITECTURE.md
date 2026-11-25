# FM27 Command Hub — Architecture Map

Quick file index so developers and AI agents can jump directly to the right module without scanning the repository.

## 1. Entrypoints & Deployment
- `server.ts` — Express 5 app entrypoint (`trust proxy`, Helmet, gzip, JSON `/api/{*splat}` 404, Vite dev / static `dist/` SPA fallback).
- `src/App.tsx` — Root React 19 shell, tab navigation, IndexedDB + `localStorage` state hydration, save history Journey diffing, and modals.
- `Dockerfile` / `render.yaml` — 2-stage container with `/opt/fmsave-venv` (`fmsave`), `PORT=8080`, `GET /api/health`.
- `.github/workflows/ci.yml` — Runs `py_compile`, `tests/python`, `npm run lint`, `npm test`, `npm run build`.

## 2. `.fm` Save Decoding Pipeline (Large-Save & Mobile-Safe)
- `public/fm-save-mapper.py` — Pass 0 Python extractor (`fmsave 0.14.4+`): single-pass `game_db` borrow, club-scoped fast extractors, `_finalize_payload_dict()` + `deep_scrub_ca_pa()`, CLI JSON streaming, `step_*` API. **Large file (~8.8k lines): always search with `rg -n` before reading bounded ranges.**
- `public/fm_layout_patcher.py` — Runtime FM27 layout patcher + dynamic build registration + per-save telemetry reset (`reset_patch_telemetry()`).
- `public/fm-save-worker.js` — Browser Web Worker running Pyodide `314.0.8` (native `compression.zstd`, zero-copy `WORKERFS`, 64 MB MEMFS cap, `?v=23`).
- `server/routes/fmDecodeRoutes.ts` — Chunked upload (`/init`, `/chunk`, `/finish`, `/job/:jobId`), 1 GB upload cap, 8 MB chunk cap, JSON `413`/`400` handler, single-job `503` guard, `507` OOM fallback, raw JSON passthrough (`rawPayloadJson`).
- `src/services/fmSaveReader.ts` & `src/workers/fmSaveWorkerClient.ts` — Server-first chunked upload client with automatic Pyodide Web Worker fallback.
- `src/utils/fmSaveHydrator.ts` — Converts decoded `.fm` payloads into app state (`PlayerRecord`, `StaffRecord`, `MatchLogEntry`, injuries, governance, finances).

## 3. Server AI & Prompts
- `server/config.ts` — Env loading (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `45s`/`60s` timeouts).
- `server/geminiService.ts` — `gemini-3.5-flash-lite` (Fast/Fallback) & `gemini-3.6-flash` (Deep), retired-model filter, 5-min discovery cache, 503/429 retry + Fast failover.
- `server/routes/fm27Routes.ts` — `/tactical-chat` (with history role normalization), `/analyze-screenshot`, `/match-debrief`, `/journey-report`.
- `server/middleware/securityGuard.ts` — Rate limiting, optional `HUB_ACCESS_TOKEN`, payload checks.
- `server/prompts.ts` & `server/schemas.ts` — FM27 Patch 27.1.0 prompts and structured JSON response schemas.

## 4. FM27 Domain Engines (`src/utils/` & `src/data/`)
- `src/data/fm27Roles.json` & `src/data/fm27KnowledgeBase.ts` — Authentic Patch 27.1.0 IP + OOP role definitions and tactical playbook.
- `src/utils/dualPhaseRoleEngine.ts` & `src/utils/bestXiSolver.ts` — Dual-phase role scoring (`ST`↔`STC` aliased), Best XI / Rotated XI solver, `PosFam` gate, Surplus `-22` penalty.
- `src/utils/clubDnaEngine.ts`, `src/utils/metaScoreEngine.ts`, `src/utils/cardIntelligenceEngine.ts` — Club DNA pillars, squad benchmarks (loanee-excluded median value), inline card verdicts.
- `src/utils/transferAudit.ts` & `src/utils/recruitmentHelpers.ts` — Squad transfer verdicts, depth gaps, financial strategy, recruitment target scoring.
- `src/utils/tacticalAnalystContext.ts` & `src/utils/offlineBriefingEngine.ts` — Live 18k-char AI Analyst prompt builder, pre-flight validator, and offline tactical briefing fallback.
- `src/utils/squadViewHelpers.ts`, `src/utils/progressionDiff.ts`, `src/utils/saveSnapshotDiff.ts` — Squad filtering/sorting, 120-save progression diffs, multi-save Journey diffs.
- `src/utils/trainingPlanner.ts`, `src/utils/staffRatings.ts`, `src/utils/seasonInsights.ts`, `src/utils/restDefenseEngine.ts` — Training planner (`fm27-trainer` JSON/CSV), staff ratings (UK/ISO dates), partial-xG season insights, Rest Defence audit.

## 5. Persistence, Bridge & UI (`src/services/` & `src/components/`)
- `src/services/fmStorage.ts` & `src/services/saveCache.ts` — `localStorage` + IndexedDB persistence with cursor-based cache pruning and `onblocked`/`onabort` guards.
- `src/services/liveBridge.ts` — Local `fm-cli` bridge (`http://127.0.0.1:7777`, `/state`, `/status`, `/health`).
- `src/components/AutoSyncWorkspace.tsx` — Save/export upload hub & AI Tactical Analyst chat.
- `src/components/TacticalWarRoom.tsx` & `src/components/InteractivePitchBuilder.tsx` — Last Match XI / Best XI / Rotated XI pitch & Rest Defence view.
- `src/components/SquadAnalyticsTable.tsx` & `src/components/squad/` — FM-style table, mobile cards, analytics, compare, progression.
- `src/components/RecruitmentWorkspace.tsx` & `src/components/recruitment/` — Transfer audit, scout market (`VList`), shortlist, compare dock.
- `src/components/MatchLogArchive.tsx`, `src/components/SaveSnapshotDiffPanel.tsx`, `src/components/SetPiecesAndTraining.tsx`, `src/components/StaffDirectory.tsx` — Match archive, save Journey diffs, set pieces/training, staff.

## 6. Verification & Tests
- `tests/python/` — Python unit tests for `fm-save-mapper.py` and `fm_layout_patcher.py`.
- `server/*.test.ts` — Server config, Gemini failover, decode & AI route tests.
- `src/**/*.test.ts` — Client engine, hydrator, storage, mobile/regression tests (`npm test`).
