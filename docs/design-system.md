# Design system

R26. What the app is allowed to use, and what a test will stop you adding.

The point is not a rewrite. It is that six near-identical card backgrounds and
870 hand-written pixel font sizes made the app feel noisy without anyone being
able to say why. They are now a small named scale.

## Type

Tailwind's scale stops at `text-xs` (12px), but most of this app's labels sit
below it: 9, 10 and 11px. Those were written as `text-[10px]` in 870 places.
Three named tokens replace them, defined in `@theme` in `src/index.css`.

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `text-3xs` | 9px | 12px | Pitch canvas labels, chips inside fixed-width cards, chart axis ticks |
| `text-2xs` | 10px | 14px | Dense table cells, badge text, chart callouts |
| `text-micro` | 11px | 16px | Uppercase section labels, helper lines, meta rows |
| `text-xs` | 12px | 16px | Body text in dense panels (Tailwind default) |
| `text-sm` | 14px | 20px | Default body (Tailwind default) |
| `text-base` | 16px | 24px | Headings, mobile inputs, article copy |
| `text-lg` and up | | | Screen titles and headline numbers |

Rules:

- No `text-[13px]`, no `text-[9.5px]`. If a size is not in the table, use the nearest one.
- `text-3xs` is reserved. If you reach for it on a normal button, the button is too crowded.
- Inputs are forced to 16px below 768px so Android and iOS do not zoom on focus. That rule lives in `index.css` and is not part of the scale.

## Surfaces

The dark theme had six card backgrounds that all looked the same until you put
two next to each other. Five roles remain, all slate, differing only in opacity.

| Role | Class | Used for |
| --- | --- | --- |
| Surface | `bg-slate-950/60` | Cards, panels, empty states |
| Raised | `bg-slate-900/70` | Wells and tab rows inside a card |
| Recess | `bg-slate-900/50` | Dashed inner panels, nested detail blocks |
| Control | `bg-slate-800/70` | Buttons and chips sitting on a raised surface |
| Opaque | `bg-slate-900/95` | Modal panels, sticky table headers, error cards |
| Overlay | `bg-slate-950/85` | Chart tooltips and callouts floating over content |
| Scrim | `bg-slate-950/75` | Modal backdrops only. Always with `inset-0` |

The scrim is deliberately its own value: a test fails if it appears without
`inset-0`, because that means someone used the backdrop colour as a card.

## Radius

Five roles, in Tailwind terms:

| Role | Class | Used for |
| --- | --- | --- |
| Chip | `rounded-md` | Badges, tags, keyboard hints, small inline chips |
| Control | `rounded-lg` | Buttons, inputs, small panels |
| Card | `rounded-xl` | Cards, panels, chart frames |
| Sheet | `rounded-2xl` | Modals, sheets, large hero blocks |
| Pill | `rounded-full` | Avatars, toggle pills, counters |

Bare `rounded` and `rounded-sm` are retired. They measured 4px and read as a
mistake next to 8px controls. Both now resolve to `rounded-md`.

## Weight

`font-medium`, `font-semibold`, `font-bold`. Nothing thinner, nothing heavier.
The app had four `font-extrabold` headings; they are now `font-bold` like every
other heading.

## Spacing

Stays on the Tailwind scale (`0.5` steps). Pixel literals such as `p-[13px]`
are banned; the guard test fails on them. Card padding roles:

- `p-3` dense stat cards
- `p-4` standard cards
- `px-4 py-3` panel headers with a title and a hint

Half steps such as `p-3.5` and `px-2.5` are still in the codebase. They are
legacy, not a target. Do not add new ones, and prefer the role values when
touching a card anyway.

## The guard

`src/utils/designSystem.test.ts` scans the source on every `npm test` and fails
on:

- any `text-[Npx]` or `text-[Nrem]` literal
- a bare `rounded`, or `rounded-sm` / `rounded-xs` / `rounded-3xl` / `rounded-[…]`
- a surface opacity outside the table above
- the scrim class without `inset-0`
- `font-thin` … `font-extrabold`, `font-black`
- pixel spacing literals

It scans files that contain `className`, so a local variable called `rounded`
in a helper is not a false alarm.

## What changed, measured

| | Before | After |
| --- | --- | --- |
| Pixel-literal font sizes | 874 | 0 |
| Distinct card background families | 6 | 2 (surface, raised) |
| Distinct surface opacity values | 14 | 7, each with a named role |
| Radius values in use | 7 | 5 |
| Font weights in use | 6 | 3 |

Verified with `npm test` (579 pass), `npx tsc --noEmit`, `npm run build`,
`npm run ui:audit` (PASS, no target under 36px, no horizontal overflow on any of
the six tabs at 360 and 390px), and Lighthouse accessibility 1.00 on Squad,
Staff, Transfers and Hub after the change. No horizontal overflow at 1440px
either. Screenshots reviewed at 390×844 and 1440×900.

## Not covered

Screens that need a loaded save (player table rows, match cards, charts with
data) were not rendered in this session, so their exact combinations are
unverified even though they use the same tokens. That belongs with R28, where a
save is loaded on a real device.

Light theme is still not a shipped state: `index.html` hard-codes
`class="dark"`. Tokens here are written so a light theme would only need a
`@theme` override of the surface colours, but nothing depends on that yet.
