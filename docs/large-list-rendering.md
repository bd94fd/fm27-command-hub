# Large lists and chart rendering (R19)

Long saves have long lists. A career can hold hundreds of played matches, and an in-game
shortlist can hold hundreds of scouted players. Rendering every row at once puts thousands
of nodes in the DOM and blocks the main thread, which is felt most on an Android phone.

This note records what was measured, what changed, and what was deliberately left alone.

## What was measured

Measurements ran against a synthetic save seeded into `localStorage`: 300 players, 400
matches and 24 staff, loaded through the normal restore path in the dev server. Numbers
come from a desktop-class Chromium container, timed from the tab click until the DOM node
count stopped changing, with `PerformanceObserver` long tasks recorded alongside.

Matches tab, 400 played matches, before any change:

- 380 ms to settle
- 3960 DOM nodes
- one 188 ms long task

Matches tab, same data, after the change:

- 285 ms to settle
- 1954 DOM nodes
- one 76 ms long task

A phone runs the same work several times slower, so a 188 ms task on this container is the
kind of stall that shows up as a dropped frame or a freeze on a mid-range Android device.

## What changed

Windowing, in the shape the squad list already used. Each list renders one page of items
and grows on request, with a footer that says how many are shown and offers
`Show 30 More` and `Show All (N)`.

- `src/components/MatchLogArchive.tsx` windows the match cards. The page resets when the
  season or competition filter changes, so a new filter never opens on a stale page.
- `src/components/charts/MatchXgMomentumChart.tsx` windows the chart's match list view.
- `src/components/recruitment/ShortlistView.tsx` windows the shortlist card grid. The page
  resets when the tier filter, position filter or search text changes.

Lighter chart data. The xG momentum chart plots at most 60 markers on desktop and 30 on
mobile, keeping the most recent matches. Hundreds of markers in a 350 px wide SVG overlap
into an unreadable band, and each one costs four SVG nodes plus a touch strip, so nothing
is lost by drawing the recent window. Totals, the ranked list and the match cards above
still cover every match in scope, and a line under the chart states the window explicitly
so nobody mistakes the chart for the full history.

Shared helpers. `src/utils/listWindow.ts` holds `takeLeadingWindow`, `takeTrailingWindow`
and `nextWindowLimit`, used by all three lists, with tests in
`src/utils/listWindow.test.ts`.

## What was left alone

- The squad table and cards already windowed their rows (`SquadListFooter`), so they were
  not touched.
- The squad tab still spends about 68 ms on a 300-player squad in this container, most of
  it enriching every player before the first page is drawn. A real squad is closer to 50
  players, where that cost is small, so re-plumbing enrichment was not worth the risk in
  this change. It is a candidate for a later roadmap item if user saves prove large.
- No true virtual scrolling was introduced. Pages of 30 keep the DOM small, keep the code
  simple, and avoid the scroll-position bugs that virtual lists bring to a mobile layout
  with sticky headers and a bottom nav.

## Limits

- The data was synthetic and the browser was a container, not a phone. Real-device numbers
  are not claimed here.
- The shortlist pager was checked by typecheck and by the same windowing rule as the two
  lists that were exercised live. Seeing it with real content needs a save that carries 30
  or more shortlisted players.
