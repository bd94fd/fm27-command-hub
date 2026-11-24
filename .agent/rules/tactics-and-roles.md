---
trigger: glob
globs: "src/data/fm27Roles.json, src/utils/bestXiSolver.ts, src/utils/dualPhaseRoleEngine.ts, src/utils/transferAudit.ts, src/utils/tacticalAnalystContext.ts, src/utils/squadViewHelpers.ts, src/utils/cardIntelligenceEngine.ts, server/prompts.ts"
---

# FM27 Dual-Phase Tactics, Roles & Cross-Screen Consistency

- **Strict FM27 IP + OOP Roles:** Every tactical slot requires authentic FM27 In-Possession (IP) and Out-of-Possession (OOP) roles from `src/data/fm27Roles.json`. Never output retired FM24 duties (*Defend / Support / Attack*) or retired roles (*Mezzala, Enganche, Trequartista, Carrilero, Raumdeuter, Segundo Volante*).
- **Tactics Opens on Last Match XI:** Default the Tactics view to Last Match XI (with easy switching to Best XI / Rotated XI), clear Rest Defence explanations, and non-overlapping pitch markers.
- **Cross-Screen Consistency Law:** War Room Starting XI, 100%-Fit Best XI & Rotated B-Team, Transfers & Squad Advice depth chart/action plan, Set-Piece rankings, and AI Tactical Analyst must agree from the same deterministic context.
- **Positional Familiarity (`PosFam` 1–20) Gate & Striker Alias:** Never start or rank an out-of-position player ahead of natural options. Always alias `ST` ↔ `STC` when reading `positionRatings`.
- **Surplus & Promoted Youth Law:** Players marked `Surplus` / `Surplus To Requirements` (or `Sell / Transfer List`) take a `-22` selection penalty and must not be recommended as starters/preferred rotation when active cover exists. Youth marked `Promote to Backup (DO NOT LOAN OUT)` must never be recommended for loan.
- **Durability & Real Stats Citation:** Lead fitness displays with Durability (Stamina, Natural Fitness, injury risk, availability) over volatile single-day condition. When analysing form, cite concrete season metrics (Apps, Minutes, Goals vs xG & finishing delta, Assists vs xA, Avg Rating) — never Average Rating alone.
- **UX Invariants:** Preserve FM-style Squad presets with customisable columns, mobile cards, frozen-column table, plain-English Player Cards with squad-relative charts & PNG export, Youth Intake Radar, Screen Wake Lock, Cmd+K Command Palette, and React Error Boundaries.
