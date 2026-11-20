# FM27 Command Hub & AI Tactical Co-Pilot

One dedicated, production-ready Football Manager 27 web application unifying:
- **Mobile-Safe Local `.fm` Save Reader** (Pyodide 3.14 + zero-copy `WORKERFS` + `fmsave==0.14.1`)
- **Verified FM27 (Patch 27.1.0) Knowledge Base & Fact-Checker**
- **AI Tactical Analyst & Google Docs/Sheets Auto-Sync**
- **Dynamic Tactical War Room, Set Pieces & Training Generators**
- **Squad Analytics, Recruitment Pipeline, Shortlists, Staff Ratings & Detail Modals**

---

## Core Architecture Guarantees

1. **Zero Fake or Pre-Filled Data**: Boots cleanly into `"Awaiting .fm Save"` with empty tables and `--` KPIs (only the static *Bobby Dean Portable FM27 Playbook v2.0* and *FM27 Verified Knowledge Base* are pre-loaded).
2. **Zero Raw CA/PA Exposure**: Raw internal numeric CA/PA values are never displayed in any UI table, modal, receipt card, or AI prompt—only relative Star Ratings (`1.0★–5.0★`) and custom FM27 Engine Metrics (Sprint Speed `m/s`, Aerial Jump Height, Physical Score `/100`, Role Fit).
3. **Verified FM27 Knowledge Base & Fact-Checker**: Every AI Analyst prompt is grounded in verified Patch 27.1.0 mechanics and every AI reply is automatically verified against retired FM24 roles (*Mezzala, Enganche, Trequartista, etc.*), legacy duties (*Defend/Support/Attack*), and raw CA/PA leaks.
4. **Cross-Session Memory & Portable Backups**: Automatically persists squad, staff, matches, recruitment targets, and shortlists in `localStorage` with one-click JSON Backup / Restore.

---

## Running Locally

```bash
cp .env.example .env
# Add your GEMINI_API_KEY inside .env

npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`.

## Verification Commands

```bash
npm run lint   # TypeScript type-check (tsc --noEmit)
npm test       # Full unit test suite
npm run build  # Production Vite bundle (dist/)
```

---

## Cloud Deployment (Mobile + Desktop Access)

### Option A: Render (One-Click Blueprint)
1. Push this repo to GitHub (`bd94fd/fm27-command-hub`).
2. In Render, choose **New → Blueprint** and select this repository (`render.yaml` is already configured).
3. Add your `GEMINI_API_KEY` environment variable and deploy.

### Option B: Google Cloud Run / Docker
```bash
docker build -t fm27-command-hub .
docker run -p 8080:8080 -e GEMINI_API_KEY=your_key fm27-command-hub
```
Health check endpoint: `GET /api/health`.
