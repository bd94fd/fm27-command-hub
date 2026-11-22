# FM27 Command Hub — Workspace Rules & Engineering Guardrails

These rules capture all hard-won lessons, architecture invariants, and quality standards for `bd94fd/fm27-command-hub`. Follow them on every task.

---

## 1. Communication & Delivery Workflow
- **Plain English for Bobby:** In replies to the user, explain what changed, confirm that all checks passed, and confirm it was pushed live. Skip technical jargon (library names, compiler flags, internal APIs) unless explicitly asked.
- **Always Explain "Why" in the App:** Tactical recommendations, Rest Defence notes, Player Card scouting summaries, and AI Analyst replies must explain *why* in clear, actionable football terms.
- **Mandatory Pre-Push Verification (in order):**
  1. `npm run lint` (`tsc --noEmit`)
  2. `npm test` (full client + server test suite)
  3. `npm run build` (`vite build`)
- **Auto-Push Policy:** If all three checks pass, commit cleanly and push straight to `origin main` (Render auto-deploys from `main`). Never push failing code.

---

## 2. Environment, Dependencies & Server Stack
- **Peer-Dependency Conflicts:** If `npm ci` or plain `npm install` hits `ERESOLVE` in a fresh sandbox/container, immediately run `npm install --legacy-peer-deps`.
- **Express 5 Wildcard Syntax:** This repo runs `express@5.x`. Always use Express 5 named splat syntax (`/{*splat}`, `/api/{*splat}`), never legacy `*` or `/api/*`.
- **Render & Docker Deployment:** Preserve the 2-stage `Dockerfile`, `render.yaml` (`PORT=8080`, `/api/health`), Helmet security headers, HTTP gzip compression, and JSON 404 handling for unmatched `/api/{*splat}` routes.

---

## 3. Zero Fake Data & Clean Empty States
- **Awaiting `.fm` Save:** Before a real `.fm` save or CSV is loaded, every screen must boot cleanly into an `"Awaiting .fm Save"` state with empty tables and `--` KPIs (except the static *Bobby Dean FM27 Playbook v2.0* reference tab).
- **Never Fall Back to Mock Players:** Never populate hardcoded KVV Zelzate, Feyenoord, or placeholder seed squads when real data is absent.
- **No Spreadsheet Export Clutter:** Keep the UI focused on live save intelligence; do not reintroduce removed spreadsheet export buttons.

---

## 4. Mobile-Safe `.fm` Binary Save Parsing
Applies to `public/fm-save-worker.js`, `public/fm-save-mapper.py`, `src/workers/fmSaveWorkerClient.ts`, and `src/services/fmSaveReader.ts`:
- **Pyodide 3.14 Native Zstd + Zero-Copy `WORKERFS`:** Use Pyodide 3.14 native `compression.zstd` (never C-extension `backports.zstd`) and mount browser `File` objects via `WORKERFS`. When falling back to `BUFFER_TMP`, always unlink temp files in `finally`.
- **Single-Pass `game_db` Decode & Memory Hygiene:** Keep single-pass `game_db` decoding for large saves, scope queries strictly to `club_uid=managed_club_uid`, call `gc.collect()` between stages, and destroy PyProxies (`destroy?.()`).
- **Full Sync Default on Mobile:** Default to Full Sync (not Fast Sync) on mobile devices.
- **Mobile Resilience Guardrails:** Preserve the mobile tab-resume watchdog, extraction manifest, 20s fixtures cap, `fmsave 0.14.3+` staff attribute scaling, and squad pagination.

---

## 5. Data Accuracy: Competitive Stats, Transfer Values & Fitness
Applies to `public/fm-save-mapper.py`, `src/utils/fmSaveHydrator.ts`, `src/utils/squadViewHelpers.ts`, and `src/components/PlayerDetailModal.tsx`:
- **Competitive Stats Only (Strip Friendlies):** Exclude friendlies, non-competitive, reserve/U21/U19/U18/youth, calendar-year, and international rows from current-season stats, Last-5 form, and career history. Filter current-season match stats from `season_start` (1 July of the active season).
- **No Stale/Fabricated Fallbacks When Season Stats Exist:** Only aggregate recent-match fallback stats when the entire squad lacks season stats (e.g. Fast Sync). When `squadHasSeasonStats` is true, players with 0 apps/minutes must remain at 0 / `null` rating — never carry over stale ratings or per-90s.
- **Real Transfer Values:** Extract real `transfer_value` and `transfer_value_state`; distinguish a genuine `£0` valuation from an unknown value (`—`).
- **Durability Over Volatile Condition:** Lead fitness/selection displays with **Durability** (Stamina, Natural Fitness, injury risk, availability) rather than volatile single-day condition, while keeping Condition / Sharpness available in the Durability & Selection preset.
- **Competition-Specific Suspensions:** Track bans per competition (e.g. `[CUP-BAN-ONLY]` for a cup ban ahead of a league fixture) so players are never falsely marked suspended for league matches.

---

## 6. FM27 Dual-Phase Tactics & Cross-Screen Consistency
Applies to `src/data/fm27Roles.json`, `src/utils/bestXiSolver.ts`, `src/utils/transferAudit.ts`, `src/utils/tacticalAnalystContext.ts`, and `server/prompts.ts`:
- **Strict FM27 IP + OOP Roles:** Every slot requires authentic FM27 In-Possession (IP) and Out-of-Possession (OOP) roles from `src/data/fm27Roles.json`. Never output retired FM24 duties (*Defend / Support / Attack*) or retired roles (*Mezzala, Enganche, Trequartista, Carrilero, Raumdeuter, Segundo Volante*).
- **Tactics Opens on Last Match XI:** Start the Tactics view on the Last Match XI (with easy access to Best XI / Rotated XI), clear Rest Defence explanations, and non-overlapping pitch markers.
- **Cross-Screen Consistency Law:** War Room Starting XI, 100%-Fit Best XI & Rotated B-Team, Transfers & Squad Advice depth chart/action plan, Set-Piece rankings, and the AI Tactical Analyst MUST strictly agree from the same deterministic context.
- **Positional Familiarity (`PosFam` 1–20) Gate:** Never start or rank an out-of-position player ahead of natural positional options.
- **Surplus & Promoted Youth Law:** Players marked `Surplus` / `Surplus To Requirements` (or on `Sell / Transfer List`) carry a heavy selection penalty (`-22`) and must never be recommended as starters or preferred bench/rotation when active cover exists. Youth marked `Promote to Backup (DO NOT LOAN OUT)` must never be recommended for loan.
- **Full Season Stats Citation Law:** Whenever analysing players or form, the AI Analyst must cite concrete numbers (**Apps, Minutes, Goals vs xG & finishing delta, Assists vs xA, Avg Rating**) — never Average Rating alone.

---

## 7. AI Service, UX & Reliability Guardrails
- **Gemini Timeouts & Failover (`server/config.ts`, `server/geminiService.ts`):** Preserve `45s` standard / `60s` deep Analyst timeouts, 503 overload retry delays, and automatic Fast-model failover (~67% primary budget / ~33% reserved for Fast failover).
- **Silent Firebase Domain Errors:** Silently ignore Firebase `auth/unauthorized-domain` in the UI (console only — never show a user-facing error banner).
- **Core UX Features to Preserve:** FM-style Squad view presets with customisable columns, mobile cards, and frozen-column table; plain-English Player Cards with squad-relative charts and PNG export; Youth Intake Radar & Succession Gap flags; offline PWA Service Worker, Screen Wake Lock, Cmd+K Command Palette, and React Error Boundaries.
