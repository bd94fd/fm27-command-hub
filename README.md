# FM27 Command Hub & AI Tactical Co-Pilot

[![CI](https://github.com/bd94fd/fm27-command-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/bd94fd/fm27-command-hub/actions/workflows/ci.yml)
[![Live App](https://img.shields.io/badge/Live_App-Render-46E3B7?logo=render&logoColor=white)](https://fm27-command-hub.onrender.com)

A production-ready Football Manager 27 web application unifying:
- **Server-First Chunked `.fm` Save Decoder + Local Pyodide Fallback**: Handles `.fm` saves up to **1 GB** via 4 MB chunked streaming to native Python `fmsave` on Render / Cloud Run, with automatic fallback to in-browser **Pyodide 3.14 + zero-copy `WORKERFS` (`?v=15`)** on static/serverless hosts.
- **Verified FM27 (Patch 27.1.0) Knowledge Base & Dual-Phase IP/OOP Engine**: Grounded in Patch 27.1.0 Dual-Phase In-Possession (IP) and Out-of-Possession (OOP) roles—never retired FM24 roles or legacy duties.
- **AI Tactical Analyst (Fast vs. Deep) & Google Workspace Audit Sync**: Multi-turn tactical co-pilot powered by `gemini-3.5-flash-lite` (Fast) and `gemini-3.5-flash` (Deep) with diff-preview confirmation modals and a 100-entry `localStorage` Workspace Audit Log.
- **Dynamic Tactical War Room, Set Pieces, Squad Analytics, Recruitment Pipeline & Staff Ratings**.

---

## Core Architecture Guarantees

1. **Zero Fake or Pre-Filled Data**: Boots cleanly into `"Awaiting .fm Save"` with empty tables and `--` KPIs until a real `.fm` save or structured FM27 export is imported.
2. **Zero Raw CA/PA Guarantee**: Raw internal numeric CA/PA values are never displayed in any UI table, modal, receipt card, or AI prompt—only relative Star Ratings (`1.0★–5.0★`) and custom FM27 Engine Metrics (Sprint Speed `m/s`, Aerial Jump Height, Physical Score `/100`, Role Fit %).
3. **FM27 Patch 27.1.0 Dual-Phase IP/OOP Compliance**: Every AI prompt and fact-checker enforces authentic FM27 IP/OOP role pairings (e.g., *Tracking Winger OOP*, *Inside Forward IP*) and flags retired FM24 roles or legacy duties.
4. **Cross-Session Memory & Audited Workspace Sync**: Persists squad, staff, matches, recruitment targets, shortlists, and a 100-entry Google Docs/Sheets audit log in `localStorage`.

---

## Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Yes | Strictly server-side Google Gemini API key (never exposed via `VITE_*`). |
| `GEMINI_MODEL` | No | Optional active model override (defaults to `gemini-3.5-flash` for Deep, `gemini-3.5-flash-lite` for Fast/fallback). |
| `HUB_ACCESS_TOKEN` | No | Optional bearer / `x-hub-access-token` guard for AI endpoints. |
| `FMSAVE_PYTHON` | No | Optional path to Python binary with `fmsave` installed (auto-detects `/opt/fmsave-venv/bin/python3` or `python3`). |
| `PORT` | No | HTTP server port (default `3000`). |

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
python3 -m py_compile public/fm-save-mapper.py
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
- When native Python `fmsave` is not available on the server (`503` from `/api/fm27/decode-save/init`), the client automatically falls back to local in-browser **Pyodide 3.14 + `WORKERFS`** (`public/fm-save-worker.js?v=15`).
- On mobile browsers using the Pyodide fallback, **Fast Sync** is enabled automatically to stay within mobile RAM limits.

---

## Tip: FM27 Save Compression

In Football Manager 27, go to **Preferences → General → Compress Save Game Files** and keep compression **ON** (default). Compressed `.fm` saves (Zstandard) are significantly smaller, upload faster over mobile connections, and decode faster in both native Python `fmsave` and Pyodide 3.14.
