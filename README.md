# FM27 Command Hub & AI Assistant

A unified, high-performance web application designed for Football Manager 2027 managers, combining deep tactical analysis, live save synchronisation, and AI-powered management workflows.

---

## 🌟 Key Features

### 1. Mobile-Safe Pyodide 3.14 Save Reader (`.fm`)
- **Pyodide 3.14 (`v314.0.7`) + `fmsave==0.14.1`**: Leverages native Python 3.14 `compression.zstd` without broken C-extension overhead.
- **Zero-Copy `WORKERFS`**: Mounts save files directly into the virtual filesystem (`/mnt_save`) in a dedicated Web Worker without reading 200MB+ into JavaScript `ArrayBuffer` or WASM memory.
- **Club-Scoped Queries & Memory Optimization**: Scopes queries via `.where(club_uid=...)`, reuses a single `game_db` section borrow across extraction steps, and releases memory prior to fixtures and standings to prevent mobile WebAssembly OOM crashes.
- **Resilient Fallbacks**: Safely catches unmapped FM27 binary variants (e.g. `tactics_man` set-piece marker shifts) without failing the extraction of squad, fixtures, finances, or league tables.

### 2. Zero Fake Data Guarantee
- **Clean Boot**: Boots into an `"Awaiting .fm Save"` state with empty tables and `--` KPI placeholders.
- **Zero Pre-Filled Mock Data**: All hardcoded seed players, fictitious match logs, and mock calendars have been removed.
- **Tactical Reference Intact**: The complete **Bobby Dean Portable FM27 Playbook v2.0** reference tab remains permanently accessible as static strategic guidance.

### 3. Authentic FM27 Dual-Phase Tactical Engine
- **In-Possession (IP) & Out-of-Possession (OOP)**: Maps player positions and attributes to separate, authentic FM27 roles from the canonical 51-role catalog.
- **Zero Retired FM24 Duties**: No legacy duties (*Defend / Support / Attack*) or retired roles (*Mezzala, Enganche, Trequartista*).

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ (Node 22 or 24 LTS recommended)
- Modern web browser (Chrome, Safari, Firefox, Edge) with WebAssembly and Web Worker support

### Installation
```bash
npm install --legacy-peer-deps
```

### Verification & Testing
```bash
# Run unit test suite (12 tests)
npm test

# Run TypeScript type check
npm run lint

# Build production bundle
npm run build
```

### Running Locally
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## 📁 Repository Structure
```
├── public/
│   ├── fm-save-worker.js     # Web Worker initializing Pyodide 3.14 + WORKERFS
│   ├── fm-save-mapper.py     # 6-step Python extraction pipeline with fmsave
│   ├── fmsave-worker.js      # Compatibility shim
│   └── assets/               # Real FM27 export files and tactical assets
├── src/
│   ├── components/           # UI components (TacticalWarRoom, SquadAuditTable, etc.)
│   ├── data/
│   │   ├── fm27Roles.json    # Canonical 51-role FM27 IP/OOP catalog
│   │   ├── squadData.ts      # Empty baseline squad definitions
│   │   └── matchAndTacticsData.ts # Empty match logs & Bobby Dean Playbook v2.0
│   ├── services/             # fmSaveReader.ts (Web Worker bridge)
│   ├── utils/
│   │   ├── fm27RoleMatcher.ts# Dual-phase IP/OOP role inference
│   │   ├── fmFileImporter.ts # CSV/HTML/RTF export file parser
│   │   ├── fmSaveHydrator.ts # In-memory state hydration from save payload
│   │   └── fmSyncEngine.ts   # Workload calculation & doc/sheet sync prompts
│   ├── App.tsx               # Main application shell with dynamic club KPIs
│   └── main.tsx              # React entry point
└── package.json
```

---

## 🛡️ License & Credits
Built for Bobby Dean's FM27 managerial campaign.
Powered by Pyodide, `fmsave`, React 19, Tailwind CSS, and Vite.
