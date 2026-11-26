# Navigation and information architecture

R21. Where every destination lives, what the address bar says, and what Back does.

## The map

Six tabs, and on phones a fifth slot that holds the two that do not fit.

| Tab | URL | Panels inside it |
| --- | --- | --- |
| Hub & Analyst | `?tab=sync` | Analyst Chat, Finances, Save Journey, Data Quality |
| Squad | `?tab=squad` | — |
| Tactics & Corners | `?tab=tactics` | Pitch XI, Match Prep, Corners & Training, Playbook v2.0 |
| Transfers | `?tab=recruitment` | — |
| Matches | `?tab=matches` | — |
| Staff | `?tab=staff` | — |

On a phone the bottom bar shows Hub, Squad, Tactics, Transfers and More. Matches and Staff sit in the More sheet. The bar highlights More while either of them is open, so the bar never looks unselected.

Panels are addressable with `?panel=`:

```
/?tab=sync&panel=finances        Hub opens on Finances
/?tab=tactics&panel=setpieces    Tactics opens on Corners & Training
/?tab=setpieces                  same place, kept working for old links and shortcuts
```

Panel ids are checked against the tab that owns them. An id that does not belong there, or a tab that does not exist, is dropped and the URL is rewritten rather than left lying. `?tab=matches&panel=finances` becomes `?tab=matches`.

## What Back does

Back unwinds what the user opened, in order, and then leaves the app:

1. A nested sheet closes.
2. A panel returns to the previous panel.
3. A tab returns to the previous tab.
4. The next Back leaves the app.

Each step is one history entry, so the browser's own Back button, Android's system Back and the swipe gesture all behave the same way. A section changed by the app itself, such as a finished import jumping to the Hub, replaces the current entry instead of stacking one the user did not ask for.

## What R21 changed

Before this item, the tab was in the URL but the panel was not. That had three effects: a shared link could not open Finances or Set Pieces, a reload dropped the panel and returned to Analyst Chat or Pitch XI, and Back left the tab entirely instead of returning to the panel the user was on. In-app, `?tab=setpieces` looked like a valid destination but was silently ignored and dumped the user on the Hub.

Now:

- `/src/utils/navigationUrl.ts` is the one place that decides what a URL means: valid tabs, valid panels per tab, defaults, and the `setpieces` alias.
- `useSectionHistory` keeps `{tab, panel}` together in one history entry and one URL. It replaces the old tab-only hook.
- App owns the Hub panel and the Tactics panel, so a panel click and a URL change go through the same path. `AutoSyncWorkspace` and `TacticalWarRoom` report panel changes up rather than keeping their own quiet copy.

## Verification

Measured on the phone-size viewport (390×844) against the production build, after clearing the service worker so the fresh bundle was in use:

| Check | Result |
| --- | --- |
| `?tab=sync&panel=finances` | Finances selected on first paint, URL unchanged |
| Click Save Journey | URL becomes `?tab=sync&panel=journey` |
| Back | Returns to `?tab=sync&panel=finances` with Finances selected |
| `?tab=setpieces` | URL becomes `?tab=tactics&panel=setpieces`, Corners & Training selected, Tactics highlighted in the bottom bar |
| `?tab=matches&panel=finances` | URL becomes `?tab=matches`, no panel claimed |

Automated: `src/utils/navigationUrl.test.ts` covers parsing, the alias, invalid values, URL building and the Hub panel id mapping; `src/hooks/useHistoryNavigation.test.ts` covers the wiring between App, the Hub and the tactics room. `npm run ui:audit` still passes at both viewports.

## Limits

- On a desktop viewport all four Hub panels are laid out on the page at once, so `?panel=` mostly matters on phones and for where a link lands. It is not a desktop sub-page.
- Standing on a panel for a while and then reloading returns to that panel, but scroll position inside a long panel is not restored.
- The More sheet is still a sheet rather than a tab, so on a phone Matches and Staff are one tap further away than the other four. That is a deliberate trade for a five-slot bar, not an oversight.
