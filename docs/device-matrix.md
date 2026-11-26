# Browser and device matrix

Roadmap: R28

Real devices expose problems that a desktop browser never shows: a control that
only appears once a save is loaded, a native dropdown that ignores the dark theme,
a target that is fine with a mouse and awkward with a thumb. This document records
what is measured on each browser and engine, and what the first full run found and
fixed.

## What runs

Two harnesses, because one engine cannot stand in for the other.

| Harness | Engine | Command | Needs |
| --- | --- | --- | --- |
| `scripts/device-matrix.mjs` | Chromium (Chrome, Android Chrome, installed PWA) | `npm run device:matrix` | Node >= 22, a Chromium binary |
| `scripts/webkit-matrix.mjs` | WebKit (iPhone and iPad Safari) | `npm run device:webkit` | Playwright plus `npx playwright install --with-deps webkit` |

Playwright is deliberately not a project dependency. It exists for the Safari leg
only, and making every install and CI run download a second engine is not worth it.
The WebKit harness says so and exits with instructions when Playwright is missing.

Both take a seeded state, so the dense screens are measured with real data rather
than empty states:

```bash
npm run build
NODE_ENV=production PORT=12000 npm start

npm run device:matrix -- --seed=.agents_tmp/seed-r28.json
npm run device:webkit -- --seed=.agents_tmp/seed-r28.json
```

`--seed` is a JSON copy of `fm27_command_hub_state_v1` from a browser that has
decoded a real save. It lives in `.agents_tmp/`, which is gitignored; no save data
enters the repository. Without `--seed` the harness still runs but only measures
empty states, which is a much weaker signal.

Other flags: `--json` for machine-readable output, `--only=<profile>` to run one
profile, `--screenshots=<dir>` to capture every tab, `--url` and `--cdp` to point at
a different build or an already running browser.

## Profiles

Chromium (`device:matrix`):

| Profile | Viewport | Notes |
| --- | --- | --- |
| `desktop-chrome` | 1440×900, 1x | Mouse and keyboard |
| `android-chrome` | 412×915, 2.625x | Pixel 7 portrait, touch, Android Chrome UA |
| `android-small` | 320×568, 2x | Smallest common Android, and iPhone SE class |
| `android-landscape` | 844×390, 2.625x | Phone landscape, short viewport, `md:` layout |
| `pwa-standalone` | 412×915, 2.625x | Installed app, no browser chrome |
| `text-200` | 390×844, 2x | Root font at 200%, the WCAG 1.4.4 resize case |

WebKit (`device:webkit`):

| Profile | Viewport | Notes |
| --- | --- | --- |
| `iphone-safari` | 390×844, 3x | iPhone portrait, iOS 18 UA |
| `iphone-se-safari` | 320×568, 2x | Smallest iPhone still in use, iOS 17 UA |
| `ipad-safari` | 820×1180, 2x | iPad portrait, `md:` layout on a finger |

## What each profile is checked for

Measured on every tab (Hub & Analyst, Squad, Tactics & Corners, Transfers, Matches,
Staff), after waiting for webfonts and with any stale service worker removed so the
numbers describe the current `dist/`:

- Horizontal overflow: `documentElement.scrollWidth` against the viewport width.
- Touch targets under 36px on phones, under 32px on tablets, under 24px with a mouse.
  The 36px phone floor is this project's own rule; 32px is the tolerance for `md:`
  layouts that shrink controls for a tablet; 24px is the WCAG 2.2 SC 2.5.8 floor and
  applies everywhere, including the desktop.
- Form controls under 16px font, because iOS zooms the page when one is focused.
- Clipped text: overflow hidden with no ellipsis, which means words are cut rather
  than shortened. Deliberate truncation with an ellipsis is not counted.
- Console errors and any HTTP 4xx or 5xx.
- Navigation is verified: the harness clicks the real bottom bar or the More sheet
  and then reads `main[data-active-tab]`. A probe that cannot confirm which tab
  rendered reports a failure instead of measuring the wrong screen.

Once per profile: service worker registered, manifest `display`, `start_url`, icon
sizes, theme colour and the viewport meta. In the standalone profile the install
banner must not appear.

## Two limits worth knowing

- **`display-mode: standalone` cannot be emulated by the DevTools protocol.** The
  standalone profile answers the two queries the app itself uses (the media query and
  `navigator.standalone`) with a shim, and the harness asserts the app reports
  standalone. Everything else about that profile is real.
- **The Analyst API needs `GEMINI_API_KEY`.** A local build has none, so
  `/api/fm27/tactical-chat` answers 500. Both harnesses separate that from device
  findings and print "Analyst chat not exercised", rather than failing a device for
  a missing secret or hiding the request.

## What the first run found, and the fixes

All fixed in R28 unless stated.

1. **Squad / All toggle on Tactics was 24px tall.** The `First Team (29)` and
   `All (49)` segmented buttons only exist when a save is loaded, which is why the
   empty-state audits missed them. Now `min-h-[36px]` with horizontal padding.
2. **The two Analyst transcript Copy buttons were 18px and 22px.** Both are in the
   chat history, so they never appeared in an empty-state run. They are now 36px on
   touch and not below 24px with a mouse.
3. **Squad summary chips were 20px.** `1 Banned`, `N Injured` and `N Expiring ≤6m`
   are filters, not decoration. Now 36px tall with padded sides.
4. **The "Inspect Raw Decoded .fm Data" and "Save Reader Info" toggles were 30px and
   26px.** Only visible with a save. Now 36px.
5. **Native controls rendered light in a permanently dark app.** `<html>` carries
   `class="dark"` but never set `color-scheme`, so the squad role select, native date
   pickers, checkboxes and scrollbars painted in the light palette. iOS showed a
   white select in the middle of the Squad toolbar. `html { color-scheme: dark }` fixes
   it on both engines and is visible in the Safari screenshots.

The harness itself was wrong twice before it was trusted, which is the reason the
checks above are strict about it: it first clicked any button whose text started with
the tab name (matching suggestion chips instead of navigation, so it measured the Hub
while claiming to measure Squad), and it measured through a service worker from an
earlier build, so it reported the pre-fix heights.

## Result at the end of R28

- `npm run device:matrix` with a loaded save: 6 of 6 profiles clean.
- `npm run device:webkit` with a loaded save: 3 of 3 profiles clean.
- `npm run ui:audit`: PASS, no overflow, no mobile target under 36px.
- 591 node tests pass, `tsc --noEmit` clean, production build clean.

## Gaps

- Not tested on physical hardware. Every profile is an emulated viewport on a
  desktop engine: it catches layout, target size and engine differences, not real
  scroll physics, memory pressure or GPU behaviour. Real-phone timings remain the
  job of `docs/mobile-memory-budget.md`.
- Safe-area insets are zero in emulation, so the notch and home indicator only get
  a code review (`env(safe-area-inset-*)` is used in the bottom nav and `main`), not
  a measurement.
- Firefox and Samsung Internet are not covered.
- Sideways scrolling chip rows are allowed by the overflow check because they are
  scroll containers by design; the check only fails when the page itself overflows.
