# FM27 Command Hub

Unified Football Manager 27 tactical command, scouting, squad analytics, and Google Workspace auto-sync hub—built with React 19, TypeScript, Vite 8, Tailwind CSS v4, Express, Gemini (`@google/genai`), and Pyodide 3.14 (`fmsave==0.14.1`) WebAssembly `.fm` save parsing.

## Core Architecture

- **Zero Fake / Mock Data:** Boots cleanly into an `Awaiting .fm Save` state with empty tables and `--` KPIs. Missing save metrics (such as match xG/possession or unexposed club facilities/coefficients) remain `null` / `--` rather than being fabricated.
- **Mobile-Safe `.fm` Binary Parsing (`public/fm-save-worker.js` + `public/fm-save-mapper.py`):**
  - Runs Python 3.14 (`Pyodide 314.0.7` with native `zstd`) + `fmsave==0.14.1` inside a dedicated browser Web Worker.
  - Mounts local `.fm` files zero-copy via `WORKERFS` at `/mnt` (never reading multi-hundred-MB files into JS `ArrayBuffer`).
  - Uses a single shared `game_db` section borrow, club-scoped queries (`managed_only` default on mobile, optional `scouting_pool` / `extended_pool`), cache eviction, and `gc.collect()` before streaming `span_records`.
- **FM27 Dual-Phase Tactical & Analytics Engine:**
  - Exact 68 In-Possession / Out-of-Possession roles (`src/data/fm27Roles.json`) with zero legacy FM24 duties.
  - Patch 27.1.0 physical metrics (`topSpeedMps`, `jumpHeightMeters`, `sprintDrainRate`), 9-role coaching star calculator (`src/domain/staffRatings.ts`), and 180-minute Double-GW load monitoring (`src/domain/fmEngine.ts`).
  - Static **Bobby Dean — Portable FM27 Tactics & Journeyman Playbook v2.0** reference tab (`src/data/playbookV2.ts`).
- **AI Tactical Co-Pilot & Google Workspace Auto-Sync:**
  - Slash commands (`/squad`, `/lineup`, `/opposition`, `/recruit`, `/compare`, `/staff`, `/club`) grounded strictly in the loaded snapshot (`src/domain/fmTools.ts` + `server.ts`).
  - Explicit-confirmation Google Docs & Google Sheets sync (`src/services/googleWorkspace.ts`) plus `.csv`, Ctrl+P `.html`, `.rtf`, and `.json` export support.

## Commands

```bash
npm install
npm run dev      # Express + Vite middleware on http://localhost:3000
npm run lint     # tsc --noEmit
npm run test     # node --import tsx --test src/**/*.test.ts
npm run build    # vite build
npm run start    # Production server (NODE_ENV=production)
```
