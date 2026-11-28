# Touch, contrast and keyboard focus

R25. The app is used on a phone, one-handed, often in poor light. Three things were measured and fixed.

## What the measurements said before

Lighthouse accessibility on the Hub: 0.94. Two contrast failures, and the tab strip in the desktop header measured 22px tall — under the 24px minimum target size in WCAG 2.2 AA.

## Target sizes

- Desktop header tabs: 22px tall, brand link 28px. Both now carry a 36px floor with a little horizontal padding, so they measure 36px and still fit the 56px header.
- Phone: the bottom bar and the tab rows already met 44px. `npm run ui:audit` reports no target under 36px on any of the six tabs at 390px.

## Contrast

Three changes, all small:

- Filled emerald pills used white text on emerald-600, which is 3.65:1 at 11–12px. Light theme now uses emerald-700, dark theme emerald-500 with near-black text. Fixed in 14 places, including the update-banner Refresh button and the Squad view tabs, where it was the visible offender.
- Emerald text on emerald tint measured 4.41:1. Light theme moves from emerald-700 to emerald-800 in those pills. 25 places.
- The empty-state hint line under the "Open the Hub to import" button was slate-500 at 11px on a slate-900 card: 3.7:1. Now slate-600 in light, slate-400 in dark.

Result: Lighthouse accessibility 1.00 on all six tabs (Hub, Squad, Tactics, Transfers, Matches, Staff). axe-core reports no `color-contrast` or `target-size` violations on any tab in the shipped dark theme.

## Keyboard focus

The app had no focus styling of its own, and eight controls used `focus:outline-none`, which removes the browser's ring. There is now one rule in `index.css`:

```css
:focus-visible {
  outline: 2px solid #059669;
  outline-offset: 2px;
}
```

It is deliberately not inside `@layer base`. Utilities like `focus:outline-none` live in a later cascade layer, so only an unlayered rule can override them; the sidebar comment in the file says this, and a test fails if the rule is ever moved into a layer. Dark theme gets emerald-400, and forced-colours mode gets the system Highlight colour at 3px. The rule sets no `border-radius`, so focused pills keep their own shape.

Walking the tab key from the top of the page: brand, six tabs, search, knowledge base, restore, then the Squad view tabs. Every stop showed a 2px ring, and every stop was inside the viewport. Palette keyboard behaviour (arrows, Enter, Escape) was unchanged and still works.

## One real bug this found

The Hub's chat send button hides its "Send" text below 640px and had no `aria-label`, so on a phone it was announced as an unlabelled button. It now has `aria-label="Send message"`.

## What is dark only, and why light was probed

`index.html` ships `<html class="dark">` and nothing toggles it, so the shipped theme is dark. Probing the light variant by removing the class produced hybrid results and is not a real state; the emerald token changes above were still chosen so the light pair stays readable if a light theme is ever added.

## Verification

- 572 tests pass, 0 fail. New `src/utils/accessibilityContract.test.ts` locks in: the focus rule exists, is 2px, is unlayered, has a dark and forced-colours variant, the header targets keep their 36px floor, no `bg-emerald-600 text-white` is reintroduced, the hint colour stays, and the send button keeps its label.
- `npx tsc --noEmit` clean, `npm run build` clean, `npm run ui:audit` PASS on all six tabs at 390px.
- Phone 390×844 screenshots in the shipped theme: focus ring visible around the Sync .fm button; active view pill is emerald-500 with near-black text.

## Not covered by the first pass

Screens that only appear with a loaded save — the player table rows, transfer cards, match cards — were not measured in the first pass, since the browser had no save. Their colours come from the same tokens fixed here, but the specific combinations were unchecked.

## The save-dependent sweep

The second pass loaded a real save and answered the gap. `npm run keyboard:audit` now walks every section, up to 80 Tab stops per section, and six views inside each section on desktop and on a phone. It found three things the first pass could not see, all fixed:

- a clickable squad row with no focus stop, so the player profile could not be opened without a mouse;
- a knowledge base drawer that was not a dialog at all: no focus move, no Tab trap, no Escape;
- focus falling to `<body>` when the share or knowledge base sheet closed on a phone, because the button that opened it had been unmounted with the More sheet.

The full list, the fixes and the reasoning for what was left alone are in `docs/accessibility.md`. The gate is 151 checks and runs in about four minutes with a save.

The colours on those save-dependent rows came through the same tokens and did not need a change.
