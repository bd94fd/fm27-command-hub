# FM27 Command Hub & AI Tactical Co-Pilot

[![CI](https://github.com/bd94fd/fm27-command-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/bd94fd/fm27-command-hub/actions/workflows/ci.yml)
[![Live App](https://img.shields.io/badge/Live_App-Render-46E3B7?logo=render&logoColor=white)](https://fm27-command-hub.onrender.com)

A production-ready Football Manager 27 web application unifying:
- **Server-First Chunked `.fm` Save Decoder + Local Pyodide Fallback**: Handles `.fm` saves up to **1 GB** via 4 MB chunked streaming to native Python `fmsave` (`0.14.4+`) on Render / Cloud Run, with automatic fallback to in-browser **Pyodide 3.14 (`314.0.8`) + zero-copy `WORKERFS` (`?v=23`)** on static/serverless hosts.
- **Verified FM27 (Patch 27.1.0) Knowledge Base & Dual-Phase IP/OOP Engine**: Grounded in Patch 27.1.0 Dual-Phase In-Possession (IP) and Out-of-Possession (OOP) roles—never retired FM24 roles or legacy duties.
- **AI Tactical Analyst (Fast vs. Deep) & Multi-Save Journey Diffs**: Multi-turn tactical co-pilot powered by `gemini-3.5-flash-lite` (Fast / Fallback) and `gemini-3.6-flash` (Deep), with automatic failover, offline tactical briefings, and same-club save-to-save Journey diffs.
- **Dynamic Tactical War Room, Set Pieces, Training Planner (`fm27-trainer` JSON/CSV), Squad Analytics, Recruitment Pipeline, Staff Ratings (incl. FM27 secondary jobs & Preferred Jobs ratings) & Local `fm-cli` Live Bridge (`http://127.0.0.1:7777`)**.

---

## Core Architecture Guarantees

1. **Zero Fake or Pre-Filled Data**: Boots cleanly into `"Awaiting .fm Save"` with empty tables and `--` KPIs until a real `.fm` save or structured FM27 export is imported.
2. **Zero Raw CA/PA Guarantee**: Raw internal numeric CA/PA values are never displayed in any UI table, modal, receipt card, or AI prompt—only relative Star Ratings (`1.0★–5.0★`), qualitative Scout Report Badges, and custom FM27 Engine Metrics (Sprint Speed `m/s`, Aerial Jump Height, Physical Score `/100`, Role Fit %).
3. **FM27 Patch 27.1.0 Dual-Phase IP/OOP Compliance**: Every AI prompt and fact-checker enforces authentic FM27 IP/OOP role pairings (e.g., *Tracking Winger OOP*, *Inside Forward IP*) and flags retired FM24 roles or legacy duties.
4. **Cross-Session Persistence & Repo Map**: Persists squad, staff, matches, recruitment targets, shortlists, progression snapshots, and save history in IndexedDB + `localStorage`. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the subsystem map.

---

## Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Yes | Strictly server-side Google Gemini API key (never exposed via `VITE_*`). |
| `GEMINI_MODEL` | No | Optional Deep model override (defaults to `gemini-3.6-flash`). |
| `GEMINI_FAST_MODEL` | No | Optional Fast/fallback model override (defaults to `gemini-3.5-flash-lite`). |
| `HUB_ACCESS_TOKEN` | No | Optional bearer / `x-hub-access-token` guard for AI & decode endpoints. |
| `FMSAVE_PYTHON` | No | Optional path to Python binary with `fmsave` installed (auto-detects `/opt/fmsave-venv/bin/python3` or `python3`). |
| `PORT` | No | HTTP server port (default `3000`; `8080` in Render/Docker). |

---

## Running Locally

```bash
cp .env.example .env
# Set GEMINI_API_KEY in .env

npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

### Verification Commands

```bash
python3 -m py_compile public/*.py
python3 -m unittest discover -s tests/python -v
npm run lint   # TypeScript type-check (tsc --noEmit)
npm test       # Full unit test suite (src/ + server/)
npm run build  # Production Vite bundle (dist/)
```

---

## Deployment Options

### Option A: Render / Google Cloud Run (Recommended — Native Python `fmsave` + 1 GB Chunked Decode)
- **Render**: Choose **New → Blueprint** and select this repository (`render.yaml` and `Dockerfile` pre-install Python + `fmsave` in `/opt/fmsave-venv`). Set `GEMINI_API_KEY` and deploy.
- **Google Cloud Run / Docker**:
  ```bash
  docker build -t fm27-command-hub .
  docker run -p 8080:8080 -e GEMINI_API_KEY=your_key fm27-command-hub
  ```
- Health check endpoint: `GET /api/health` • Native decoder probe: `GET /api/fm27/decode-status`.

### Option B: Vercel / Static-Only Hosting (Browser Pyodide Fallback)
- When native Python `fmsave` is not available on the server (`503` from `/api/fm27/decode-save/init`), the client automatically falls back to local in-browser **Pyodide 3.14 (`314.0.8`) + `WORKERFS`** (`public/fm-save-worker.js?v=23`).
- On mobile browsers, Full Sync is the default with automatic Fast Sync fallback if memory pressure triggers a worker or server OOM (`507`).

---

## Tip: FM27 Save Compression

In Football Manager 27, go to **Preferences → General → Compress Save Game Files** and keep compression **ON** (default). Compressed `.fm` saves (Zstandard) are significantly smaller, upload faster over mobile connections, and decode faster in both native Python `fmsave` and Pyodide 3.14.
