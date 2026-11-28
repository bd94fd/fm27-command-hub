# Accessibility

Roadmap items R30 and R25. The app is used on phones, one-handed, often in poor light. Accessibility work here is not a compliance box: bigger targets, visible focus and named controls are the same fixes that make the app usable on a bus.

## Run the audit

```bash
npm run build
NODE_ENV=production PORT=12000 npm start   # in another shell
npm run a11y:audit                         # first run only, about 20s
npm run a11y:audit -- --save=/path/to/fm.save   # also every tab with a save
npm run a11y:audit -- --profile=mobile     # one profile only
npm run a11y:audit -- --json               # machine-readable result
```

The audit drives Chromium over the DevTools protocol, loads the shipped bundle with the HTTP cache and any service worker removed, then:

- runs axe-core 4.14.1 with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` rule sets against the first-run screen, all six sections and the two sheets (mobile More, player profile);
- checks what axe cannot see: a skip link that actually reaches `main`, one `h1`, named landmarks, no positive `tabindex`, nothing focusable inside `aria-hidden`, and a visible focus ring on each of the first twelve real Tab stops;
- opens the mobile More sheet and the player profile and checks the dialog contract: named dialog, focus moves inside, Tab never leaves, Escape closes, and focus returns to the control that opened it.

A failure prints the selector or the focused element and exits non-zero. There are no silent skips: if the save does not load, or a control the check needs is missing, the run fails.

Add `--save=...` for the dense screens. Without a save the audit only sees the first-run screen, which is a much weaker check.

## What R30 fixed

| Finding | Where | Fix |
| --- | --- | --- |
| Small `slate-500` labels were 4.1:1 on the dark surfaces, below the 4.5:1 AA minimum | KPI cards, squad cards, tactics lists, everywhere `text-slate-500` is used in dark mode | Dark mode now resolves `text-slate-500` to `slate-400` (~6.5:1) in `src/index.css` |
| No skip link, so keyboard users tabbed through the whole header on every screen | Shell | "Skip to main content" link, visible on focus, focuses `#main-content` without leaving a hash in the URL |
| Two header buttons announced a name that did not contain their visible text | FM27 KB, Reset | Accessible names now start with the visible label |
| Three `<select>` controls in the pitch builder had no programmatic label | Tactics | `htmlFor`/`id` pairs on Assigned Player, IP role and OOP role |
| The guardrail warning list scrolled but could not be reached by keyboard | Tactics | Region with `tabIndex={0}` and an accessible name |
| The mobile More sheet moved no focus into itself and left focus on `<body>` when closed | Mobile More sheet | Initial focus, Tab trap, Escape and focus returned to the More button |
| The player sheet could leave focus on the page behind it | Sheet frame | Focus is set synchronously, hidden controls are skipped, and focus that escapes is pulled back |

The last one was the subtle one. `getFocusableElements` used to return controls that were not rendered (inside collapsed sections), so `focus()` was called on an element that could not take focus and nothing happened. It now skips anything with no layout box or inside `aria-hidden`.

## Run the keyboard sweep

R30 fixed the focus rings and the sheets. R25 asks a different question: can a
keyboard reach every control on every screen, not just the first twelve stops of
the first view? `npm run keyboard:audit` answers it.

```bash
npm run build
NODE_ENV=production PORT=12000 npm start   # in another shell
npm run keyboard:audit -- --save=.agents_tmp/uploads/auto_save_v03_.fm
npm run keyboard:audit -- --profile=desktop   # one profile only
npm run keyboard:audit                        # first-run screen only, no save
```

For each profile it starts from a clean store, checks the skip link, then for
each of the six sections:

- opens the section with Enter on its navigation button, so the navigation itself is on test;
- walks up to 80 Tab stops and fails if any stop has no visible focus ring, sits inside `aria-hidden`, or has no layout box;
- scans the whole section for controls that answer a pointer but not the keyboard, ignoring SVG chart marks (a chart's bars sit beside real buttons for the same selection) and the `<label>` that wraps a focusable input;
- clicks each alternate view inside the section (Squad's presets, Matches' list, Transfers' Sign/Sell/Release and so on, six per section) and repeats the scan, so a screen the other gate never opens cannot hide a gap;
- opens the player profile from a squad row on desktop and from a squad card on mobile with Enter alone, then Escape, and requires focus back on the player control;
- opens the share sheet, the knowledge base and the command palette (the last two from the More sheet on mobile), and requires each to be a named dialog that takes focus, keeps Tab inside, closes on Escape and hands focus back to the page.

A clean run is 151 checks. It takes about four minutes with a save because it
imports once per profile; run it on its own, like the other browser gates.

## What R25 found

| Finding | Where | Fix |
| --- | --- | --- |
| A clickable squad row could not be opened without a mouse: 29 rows had a click handler and no focus stop, so a keyboard user could reach the compare toggle but never the player | Squad, list view (desktop and the dense presets) | Rows take focus, open on Enter or Space, carry `aria-haspopup="dialog"`, and a screen-reader caption says so. `shouldActivateRowFromKey` keeps a nested toggle from also opening the row |
| The knowledge base drawer was an overlay with no dialog semantics: opening it left focus on the header button behind it, Tab walked the page underneath, and Escape did nothing | Knowledge base | It is now a named dialog with the same focus, Tab trap, Escape and restore contract as the sheets |
| Closing the share sheet or the knowledge base on a phone dropped focus onto `<body>`, because the button that opened it (inside the More sheet) had been unmounted | Sheet frame | Focus returns to the opener when it is still on screen, and otherwise to the current section's navigation button, never to `<body>` |

The three share one cause: the dialog contract lived inside `MobileSheetFrame`,
so only the seven overlays built on it got it. It now lives in
`src/hooks/useModalDialog.ts` and `src/utils/focusTrap.ts`, and any overlay can
take it without borrowing the sheet layout.

Two things the sweep looked at and left alone, both recorded here so nobody
re-opens them without a reason:

- the xG momentum chart draws clickable bars that Tab cannot reach, but the
  Previous and Next match buttons beside the chart change the same selection and
  are focusable, so the chart is a pointer shortcut, not the only route;
- the toggle labels beside the import and Fast Sync switches are pointer
  targets that wrap a real checkbox, which is where focus goes.

## Still manual

Automated checks catch roughly a third of real barriers. Before calling an accessibility pass done, walk these with a real keyboard and at least one screen reader (VoiceOver on iOS, TalkBack on Android):

1. Import a real save with the screen reader on. The half-written-save warning and the decode progress need to be announced, not just shown.
2. Tab through each section. Every control should say what it does, and the focus ring should never disappear.
3. Open and close the Analytics, Staff and player sheets with the keyboard only. Focus must go in, stay in, and come back to where it started.
6. Open a player from the squad list with Enter, close it, and confirm the row still has focus, on both the table and the card list.
4. Run a Full Sync and an Analyst question with the screen reader on. The result has to be announced.
5. Test text at 200% (Chrome's text-size setting, not browser zoom) on a 320px phone.

## The gate resets state before it measures

`npm run a11y:audit` starts each profile from a clean slate: local storage, Cache Storage and IndexedDB are cleared, the service worker is unregistered, and network emulation is reset to online. Without that, a save left behind by another gate made the "save loaded" check pass without an import, and a browser another gate left offline made it fail. A failed load now prints the text the page is showing, so the next failure explains itself. The clear runs from the browser side after leaving the page, because deleting IndexedDB from inside the page left the app's own connection half-closed and the import could not save. The shared client also answers the beforeunload prompt a live upload guard raises, or the next profile's navigation never completes.
