# Accessibility

Roadmap item R30. The app is used on phones, one-handed, often in poor light. Accessibility work here is not a compliance box: bigger targets, visible focus and named controls are the same fixes that make the app usable on a bus.

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

## Still manual

Automated checks catch roughly a third of real barriers. Before calling an accessibility pass done, walk these with a real keyboard and at least one screen reader (VoiceOver on iOS, TalkBack on Android):

1. Import a real save with the screen reader on. The half-written-save warning and the decode progress need to be announced, not just shown.
2. Tab through each section. Every control should say what it does, and the focus ring should never disappear.
3. Open and close the Analytics, Staff and player sheets with the keyboard only. Focus must go in, stay in, and come back to where it started.
4. Run a Full Sync and an Analyst question with the screen reader on. The result has to be announced.
5. Test text at 200% (Chrome's text-size setting, not browser zoom) on a 320px phone.

## The gate resets state before it measures

`npm run a11y:audit` starts each profile from a clean slate: local storage, Cache Storage and IndexedDB are cleared, the service worker is unregistered, and network emulation is reset to online. Without that, a save left behind by another gate made the "save loaded" check pass without an import, and a browser another gate left offline made it fail. A failed load now prints the text the page is showing, so the next failure explains itself.
