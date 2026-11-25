---
name: fm27-ui-ux-review
description: Mobile-first UI/UX audit and polish guidelines for fm27-command-hub. Use when reviewing or revising UI in this repo, checking touch targets, overlay stacking, bottom-nav clearance, or horizontal overflow.
triggers:
- /ui-review
- /qa-changes
---

# fm27-command-hub UI/UX Review Standards

When auditing or revising UI/UX in `bd94fd/fm27-command-hub`:

## 1. Mobile-First Layout (390×844 Viewport)
- **Touch Targets:** Ensure all interactive buttons, pills, and toggles measure at least `36px` tall (`44×44px` preferred for primary actions) with adequate spacing.
- **Portals & Stacking (`z-index`):** Never render `position: fixed` bottom sheets, modals, or tooltips inside ancestors using `backdrop-blur`, `transform`, or `overflow-hidden`. Portal overlays to `document.body` with explicit `z-index` layering above parent sheets (`z-50` base sheet, `z-[80]` nested sheet/popover).
- **Bottom Navigation Clearance:** Floating docks (such as the Compare Tray) must sit cleanly above the mobile bottom navigation bar without overlapping tabs or action buttons.
- **Horizontal Overflow:** Verify zero horizontal page scroll (`document.documentElement.scrollWidth <= window.innerWidth`) across the top-level tabs: `Hub & Analyst`, `Squad`, `Tactics & Corners`, `Transfers`, `Matches`, `Staff`, and the `More` sheet that holds the remaining destinations on narrow layouts. There is no separate "Career Journey" tab — that content lives inside the Hub/analyst panels.

## 2. Data Density & Clarity
- **Empty & Loading States:** Keep `--` placeholders for missing KPIs; never inject mock or placeholder player/match figures.
- **Scannability:** Keep stat pills, star ratings, role fit percentages, and Meta badges visually distinct with consistent colour coding and accessible contrast on dark surfaces.

## 3. Verification Method
- Build `dist/` (`npm run build`) and serve the production bundle on port `12000` (avoiding Vite dev-server host blocks and stale Service Worker caches) before running visual checks at both `1920×1080` and `390×844`.
- The standard check is `npm run ui:audit` (`scripts/ui-audit.mjs`). It launches headless Chromium when no DevTools endpoint is listening, clears the service worker so the fresh build is measured, walks every tab at `390×844` and `1920×1080`, and fails on any touch target under `36px` or any horizontal overflow:

  ```bash
  npm run build
  NODE_ENV=production PORT=12000 npm start &
  npm run ui:audit                        # PASS/FAIL summary
  npm run ui:audit -- --json              # machine-readable report
  npm run ui:audit -- --seed=seed.json    # also exercise the Compare Tray dock
  ```

  `--seed` takes a saved `fm27_command_hub_state_v1` payload so the dock check has squad rows to toggle; without it the dock measurement is skipped.
