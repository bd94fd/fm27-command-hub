# Mobile Overhaul Sprint Tracker & Quota Rules (Android-First)

Use this file to pick up any fresh mobile sprint chat in 1 turn without re-reading large files.

## Locked-In Specs
- **Primary device:** Android Chrome (frequent phone `.fm` uploads + installed PWA). Zero extra runtime libraries.
- **Upload recovery:** Auto-pause on signal drop + auto-resume when signal returns (up to 15 min server hold via `GET /api/fm27/decode-save/upload/:uploadId/status`), manual Pause/Resume, manual "Decode on phone instead" button, progress bar + MB/s + ETA, automatic Screen Wake Lock, `beforeunload` warning, Google Drive stall tip, and 1-tap "Sync .fm" button on mobile.
- **Navigation:** 5 roomy bottom tabs (`Hub`, `Squad`, `Tactics`, `Transfers`, `More`) + slide-up `More` sheet (`Matches`, `Staff`, `FM27 KB`, `Local Cache Status`, `Install App`, `Backup/Restore`, `Reset`) + tap active tab to scroll to top.
- **Mobile Hub & Chat:** Split `< md` Hub into `Analyst Chat` | `Save Journey`, persist chat `turns` per club locally, `16px` mobile inputs, `dvh` heights, hide bottom bar when keyboard opens (`visualViewport`).
- **Modals & Touch:** Bottom-anchored mobile sheets (`max-h-[92dvh]`) with sticky `44px` close bars for Player/Scout/Staff/Compare/CommandPalette; `44px+` tap targets; zero horizontal overflow at `360px`.
- **Visual Data Redesign:** Non-overlapping compact mobile pitch nodes + docked Tap-to-Inspect IP/OOP strip + swipeable/2-row bench; tap-to-select tooltips + `Chart | Ranked List` toggle on dense analytics charts; complete KPI blocks on Squad/Transfer/Match cards.

## Quota-Saving Sprint Protocol
- **1 fresh chat per sprint**; single agent only (never spawn subagents).
- Extract new mobile UI/logic into **small 100–250 line files** and wire into big files via `rg -n` + bounded 40–120 line slices.
- Run **targeted tests** while coding; run the full 5-step pre-push verification **once** per sprint, push to `origin main`, and give Bobby a 3-bullet Android test checklist.

## Sprint Status
- [x] **Sprint 1A:** Android PWA icons (`180/192/512/maskable`), `manifest.json` shortcuts + `.fm` `file_handlers`, `index.html` viewport/safe areas, `vite.config.ts` `registerType: 'prompt'`, `usePwaLifecycle`, `PwaStatusBanners` (Offline / Safe Update / Install), `App.tsx` safe-area header & launch hooks.
- [x] **Sprint 1B:** Resumable `.fm` uploads (`GET /upload/:uploadId/status`, `fmSaveReader.ts` pause/auto-pause/resume + speed/ETA), `useUploadWakeLock`, visual progress bar, `beforeunload`, Google Drive stall tip, always-visible mobile 1-tap "Sync .fm" button + tests.
- [x] **Sprint 2A:** `MobileBottomNav` (5 tabs, tap-active-to-scroll-top), `MobileMoreSheet` (Matches, Staff, KB, Local Cache Status, Install, Backup/Reset), simplified mobile header.
- [ ] **Sprint 2B:** `chatStorage.ts` (per-club offline chat history), `useMobileKeyboard.ts`, mobile `Analyst Chat | Save Journey` toggle, `16px` inputs, `dvh` heights, `MobileSheetFrame` across all 5 modals + tests.
- [ ] **Sprint 3A:** `PitchInspectStrip`, compact non-overlapping mobile pitch + bench rail in `InteractivePitchBuilder.tsx`, complete-KPI mobile cards in Squad/Transfers/Matches + sticky-col table cue.
- [ ] **Sprint 3B:** `ChartRankedListToggle`, tap-to-select tooltips & mobile viewBoxes in `FootballAnalyticsCharts.tsx`, Player Card mobile visual polish in `PlayerDetailModal.tsx`, final `360px` overflow audit.
