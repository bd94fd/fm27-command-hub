---
trigger: always_on
---

# FM27 Command Hub — Core Rules & Quota-Saving Workflow

## 1. Communication & Delivery
- **Start-of-Task Tool Check:** Read `ROADMAP.md`, `TOOLING-WATCHLIST.md`, and the available skill/MCP list before planning. Name applicable skills and MCP tools, invoke matching skills, and record `Skills applied:` plus `MCP checked:` in every PR and final summary. If a useful tool is missing, add it to `TOOLING-WATCHLIST.md`; do not silently go without it.
- **Plain English for Bobby (UK English):** Explain clearly what changed, confirm all verification checks passed, and confirm it was pushed live. Skip dense technical jargon unless explicitly asked.
- **Explain "Why" in the App:** Tactical recommendations, Rest Defence notes, Player Cards, and AI Analyst replies must explain *why* in actionable football terms.
- **Pre-Push Verification (in order):**
  1. `python3 -m py_compile public/*.py`
  2. `python3 -m unittest discover -s tests/python -v`
  3. `npm run lint` (`tsc --noEmit`)
  4. `npm test`
  5. `npm run build`
- **Delivery Policy:** Work on a feature branch, open a ready-for-review PR against `main`, wait for required checks, then merge. Never push failing code directly to `main`. If `npm install` hits `ERESOLVE`, run `npm install --legacy-peer-deps`.
- **Scope Permission:** Python decoder files and cache busters are editable when the roadmap item needs them. A task-level file ban applies only to that task; state the conflict once if a background summary disagrees, and follow the current user message.

## 2. Zero Fake Data & Zero Raw CA/PA
- **Clean Empty State:** Before a real `.fm` save or export is loaded, every screen must boot cleanly into `"Awaiting .fm Save"` with empty tables and `--` KPIs (except the static *Bobby Dean FM27 Playbook v2.0* reference tab). Never seed mock clubs or fake players.
- **Zero Raw CA/PA:** Never expose raw numeric CA/PA or raw hidden attributes in UI tables, modals, JSON outputs, or AI prompts — use relative stars (`1.0★–5.0★`) and qualitative Scout Report Badges only.
- **No Spreadsheet Export Clutter:** Keep the UI focused on live save intelligence; do not reintroduce removed spreadsheet export buttons.

## 3. Antigravity Token & Quota-Saving Workflow
- **Read `ARCHITECTURE.md` First:** Jump straight to exact subsystem paths instead of exploring directories or scanning the whole repository.
- **Never Read Large/Generated Files:** Never open `package-lock.json`, `dist/`, `node_modules/`, `src/utils/__fixtures__/`, or `public/fm-save-mapper.py` wholesale. Always locate symbols with `rg -n` / `grep -n` first, then read bounded 40–120 line slices.
- **Batch Independent Reads:** Issue read-only lookups in parallel in a single turn. Do not spawn multi-agent swarms for small or medium tasks.
- **Targeted Tests While Iterating:** Run only the relevant test file (`node --experimental-strip-types --test <file>` or `python3 -m unittest <module>`) during iteration, then run the full verification sequence once before pushing.
- **Keep Context Tight:** Avoid pasting whole files or verbose logs into responses; preserve `"strict": true` in `tsconfig.json`.
