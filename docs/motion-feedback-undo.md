# Motion, feedback and undo

R27. What the app says when something happens, and how it lets you take it back.

## Why

Before this, the app had one toast: a green box with a tick and a string, five
characters of code, no action, no way to dismiss it, and the same green tick for
"Synced KVZ Zelzate" and "Invalid FM27 backup file format." It also vanished
after 3.2 seconds, which is not enough to read an error, and it intercepted
nothing, so a message about a failure looked like a confirmation.

## The feedback bus

`src/utils/feedbackBus.ts` is a tiny typed emitter. Any component can post a
message without having a callback threaded down to it:

```ts
import { feedback } from '../utils/feedbackBus';

feedback.success('Progression archive cleared');
feedback.error('Could not delete that snapshot — storage is unavailable.');
feedback.undo('Snapshot from 2026-11-24 deleted', async () => { /* restore */ });
```

`App` subscribes once and renders `src/components/FeedbackToast.tsx`.

### Tones

| Tone | Role | `aria-live` | Icon and colour | Lifetime |
| --- | --- | --- | --- | --- |
| `success` | `status` | polite | tick, emerald | 5s |
| `info` | `status` | polite | i, sky | 6s |
| `error` | `alert` | assertive | triangle, rose | 9s |
| any tone with an action | `status` | polite | as above | 10s |

An action without an explicit tone is `info`, never `success`: a message with
an Undo button is not a claim that everything went well.

Errors get the extra time because they carry a cause, and often a next step. A
toast that disappears before it is read is worse than no toast.

### Behaviour

- Pauses on hover and on focus, and starts with at least one second left, so a
  keyboard user can Tab to Undo without racing the timer.
- Dismiss button has an accessible name and is 36px; the action button is 44px
  on phones and 36px on desktop.
- The action dismisses the toast first, then runs. The action may re-render or
  unmount the surface that raised it, and a toast frozen over stale content
  reads as a bug.
- Sits above the mobile bottom nav (`bottom: calc(5rem + safe-area)`), clears it
  at every width, and stays out of the tab order until focused.

## What can be undone

| Action | Undo | Why |
| --- | --- | --- |
| Delete one save snapshot | Yes, writes the point back with `putSaveHistoryPoint` | The record is in memory at the moment of deletion |
| Remove an attached `.fm` file before sync | Yes, re-attaches it | One tap away from losing a 250MB selection |
| Remove a screenshot before sync | Yes, re-adds it | Same |
| Remove a player or target from the Shortlist | Yes, restores the previous list | Reversible local state |
| Clear all snapshot history | No, explicit success message | The same call drops cached full saves, so restoring the points alone would rebuild a broken history |
| Clear the progression archive | No, explicit success message | Same reason |
| Reset all saved state | No, arm-then-confirm already exists | Irreversible by design |

The rule: offer undo when the state is still in hand at the moment of the
action. When the action also destroys data that the restored state depends on,
say plainly what was removed instead of offering a half-undo.

## Motion

- One entrance animation, `--animate-feedback-in` (180ms), applied as
  `motion-safe:animate-feedback-in`, so it does not exist at all under
  `prefers-reduced-motion: reduce`.
- A global reduced-motion block in `src/index.css` collapses every transition
  and animation to 0.01ms, caps iteration count at one, and forces
  `scroll-behavior: auto`.
- Nothing in the app animates for longer than 180ms, and nothing loops.

## Verification

Measured in a real browser at 390×844 and 1440×900 against the production build:

- Undo toast from a real file removal: `role="status"`, text
  `Removed tactic-shot.png`, Undo button 44px tall. Clicking Undo restored the
  attached screenshot and dismissed the toast.
- Error toast from restoring an invalid backup: `role="alert"`,
  `aria-live="assertive"`, `aria-atomic="true"`, rose border and text, still on
  screen after 6 seconds, gone by 10.
- With `prefers-reduced-motion: reduce` emulated, the toast's computed
  `animation-duration` is `1e-05s` and `animation-name` is `none`.
- `npm test` 591 pass. `npx tsc --noEmit` clean. `npm run build` clean.
- `npm run ui:audit` PASS, no target under 36px, no overflow on any tab.
- Lighthouse accessibility 1.00 on Squad, Staff, Sync and Hub.

## Not covered

- Screen-reader announcement was verified through ARIA attributes, not a live
  TalkBack or VoiceOver session. That belongs with R28.
- The Chrome DevTools MCP server returns "Target closed" in this environment, so
  no trace-based motion measurement was possible; the numbers above come from
  computed styles via Playwright.
