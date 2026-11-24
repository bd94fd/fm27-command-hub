---
trigger: glob
globs: "public/*.py, public/fm-save-worker.js, server/routes/fmDecodeRoutes.ts, src/workers/**, src/services/fmSaveReader.ts, src/utils/fmSaveHydrator.ts"
---

# FM27 Binary `.fm` Save Parser & Hydration Guardrails

## 1. Mobile-Safe Pyodide & Native Python Decoding
- **Pyodide 3.14 Native Zstd + `WORKERFS`:** Use Pyodide 3.14 (`314.0.8+`) native `compression.zstd` (never `backports.zstd`) and mount browser `File` objects via zero-copy `WORKERFS`. When falling back to `BUFFER_TMP`, unlink temp files in `finally` and refuse ArrayBuffers > 64 MB on MEMFS.
- **Single-Pass `game_db` & Peak-RAM Hygiene:** Hold one shared `game_db` borrow across Steps 2–3, never open `span` (`save.league_tables()`) while `game_db_cm` is still open, scope queries strictly to `club_uid=managed_club_uid`, call `_evict_finished_player_phase_cache` / `_evict_finished_span_phase_cache` + `gc.collect()` between stages, and destroy PyProxies (`destroy?.()`).
- **Zero Double-Parsing & Clean State:** `_finalize_payload_dict()` produces the scrubbed dict once; CLI streams `json.dump(payload, sys.stdout)`; server `fmDecodeRoutes.ts` stores `rawPayloadJson` without retaining duplicate V8 object graphs and clears buffers on all error/exit paths. Always clear `_STATE["player_match_stats_raw"]` and `_STATE["players_fast_decoded"]` in `step_close()`, and call `_layout_patcher.reset_patch_telemetry()` in `step_open()`.
- **Full Sync Default on Mobile:** Default to Full Sync on mobile devices, preserving the hidden-tab watchdog, extraction manifest, 20s fixtures cap, `fmsave 0.14.3+` `people_management` staff mapping, Render `507` OOM fallback, and `fm_layout_patcher.py` diagnostics.
- **Cache Buster Sync:** If bumping `WORKER_CACHE_BUSTER` / `MAPPER_CACHE_BUSTER` (`?v=22`), update all synced references (`public/fm-save-mapper.py`, `public/fm-save-worker.js`, `src/workers/fmSaveWorkerClient.ts`, `src/utils/fmSaveHydrator.test.ts`).

## 2. Competitive Stats, Values, Injuries & Suspensions
- **Competitive Stats Only:** Strip friendlies, non-competitive, reserve/U21/U19/U18/youth, calendar-year, and international rows from current-season stats, Last-5 form, and career history. Filter current-season match stats from `season_start` (1 July of the active season).
- **No Fabricated Fallbacks When Season Stats Exist:** Only fall back to recent-match aggregates when the whole squad lacks season stats (e.g. Fast Sync). When `squadHasSeasonStats` is true, 0-app players stay at `0` / `null` rating.
- **Real Transfer Values & Injuries:** Extract real `transfer_value` and `transfer_value_state`; distinguish `£0` from unknown (`—`/`null`). Hydrate `decoded.activeInjuries` onto matching players as `status: 'Injured'` and normalize `positionRatings` keys uppercase.
- **Competition-Specific Suspensions:** Track bans per competition (e.g. `[CUP-BAN-ONLY]` for a cup ban ahead of a league match).
