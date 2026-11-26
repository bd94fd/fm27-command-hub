# Search, remembered filters and recent views

R24. Three things that save time every session, without learning anything new.

## Search

The quick-jump palette already listed players, staff, scout targets, tabs and formation presets. What it did not do was put the right one first: results were filtered by "contains", then kept in build order. Type `kane` and a command whose description happens to mention Kane could sit above Kane.

Ranking is now scored, in `src/utils/paletteSearch.ts`:

| Match | Score |
| --- | --- |
| The name is exactly what you typed | 120 |
| The name starts with what you typed | 100 |
| A word in the name starts with what you typed | 80 |
| The name contains what you typed | 60 |
| The description contains what you typed | 30 |
| The category contains what you typed | 15 |

Ties go to the shorter name, so `Kane` comes before `Kane Smith`. There is a cap of eight results per category and 35 overall, so a twenty-player match cannot bury the tabs you were actually reaching for.

Shortcuts in the palette's Recent list are only shown when the box is empty. Once you type, every row is a real result.

## Remembered filters

Three choices are remembered between sessions, in `fm27_view_prefs_v1`:

- Squad: the view you were on (table, analytics, compare, progress).
- Transfers: the audit view (advice, loans, contracts, depth, shortlist).
- Matches: the season you were reading.

A remembered value that the app no longer recognises falls back to the default rather than showing a blank view. Nothing is written if the value looks wrong (longer than 40 characters, empty), so a corrupt entry cannot brick a tab.

## Recent views

The last six sections you visited appear at the top of the palette, newest first, with plain names: "Squad ratings", "Tactics & Corners · Match prep". Choosing one takes you back there and closes the palette, using the same in-app navigation as everything else, so the back button keeps working.

Storage is `fm27_recent_views_v1`. One entry per location, so moving between two tabs does not fill the list with duplicates. Entries older than the six newest are dropped.

## Where this lives, and what it never touches

`viewPreferences.ts` is a separate store from the save state blob (`fm27_command_hub_state_v1`) and from save history. Clearing, corrupting or blocking these preferences cannot affect a save, a restore or a re-sync. Values are read back through a whitelist, so a hand-edited localStorage entry cannot inject anything into a view.

Two other modules are pure and fully tested: `paletteSearch.ts` (ranking) and `sectionLabels.ts` (readable names and in-app hrefs for a location).

## Verification

- Ranking, storage, labels and the palette wiring: 567 tests pass, 0 fail. New files `paletteSearch.test.ts`, `viewPreferences.test.ts`, `sectionLabels.test.ts`.
- Phone 390×844, production build, service worker and caches cleared:
  - Squad switched to Analytics survives a reload (stored as `{"squadView":"analytics"}`, restored on load).
  - Visiting Matches, Tactics, then Tactics · Match prep produced three recent entries, newest first, with plain names.
  - The palette shows them above the tabs; choosing "Tactics & Corners" landed on `?tab=tactics&panel=pitch` and closed the palette.
  - With text typed, no Recent rows appear; `corner` returns Set Pieces & Training.
  - Rows measure 44px; screenshots at phone width show no overflow.
- `npx tsc --noEmit` clean, `npm run build` clean, `npm run ui:audit` PASS.

## What was not measured

Player, staff and scout-target search needs a loaded save. In this session the browser had no save, so those rows were not exercised live. The indexing that produces them is unchanged from before this change; what changed is the order they appear in, which is covered by unit tests with real-shaped names. Live checks with a real save are the remaining gap, and belong with R28, the device matrix.

## Left alone on purpose

- Competition filter on the matches tab is not remembered. Season is; a competition value that is no longer in the save would silently show an empty list, so it needs its own handling.
- Search text is not remembered, because a stale name filter reads as a broken tab.
- The Staff nav shortcut only appears when a save with staff is loaded. Unchanged behaviour.
