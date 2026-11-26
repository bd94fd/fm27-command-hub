# Progressive first paint (R16)

Status: verified as already delivered by the stage 2 checkpoint; no further
paint slicing is worth building.

R16 asks the Hub to show squad, staff and finances as soon as each part is
ready, with the rest behind skeletons. The mechanism already exists, twice over,
and it sits in the decoder rather than in React.

## Where the early paint comes from

`public/fm-save-mapper.py` runs the extraction in four stages and emits a
`stage_2_club_core` checkpoint straight after stage 2:

| Stage | Work | Checkpoint |
| --- | --- | --- |
| 1 | Open the save, squad and 52 attributes | - |
| 2 | Finances and 12-month runway, club staff, tactics and mentoring | `stage_2_club_core` |
| 3 | Injuries, facilities, contracts, suspensions, shortlist (Full Sync only) | - |
| 4 | Fixtures, league table, team xG, player season stats and history | - |

So the checkpoint already carries squad, staff, finances and tactics. Stage 3
and stage 4 are what remain on screen as loading state.

Both decode paths deliver it:

- the phone worker (`public/fm-save-worker.js`) posts a `checkpoint` message
  after the same stage;
- the server path (`src/services/fmSaveReader.ts`) polls the decode job and
  reports `checkpointStage` and `checkpointPayload` while the job is still
  running.

`src/components/AutoSyncWorkspace.tsx` validates the checkpoint with
`assertValidDecodedFmSavePayload(payload, { mode: 'checkpoint' })` and applies it
through `onApplyDecodedFmSave(..., { isInterimCheckpoint: true })`. `src/App.tsx`
then sets squad, staff, finances and date labels but leaves matches alone until
real results arrive, so nothing is invented on the early screen.

## Why there is nothing left to slice

R14 measured the load in stages on real 250–265 MB saves. Decode dominates by a
wide margin, and transfer, hydration and render together are under 130 ms. See
`docs/decode-stage-profiling.md` and `docs/save-load-baseline.md`.

Splitting a 130 ms window into three paints would not be perceptible, and it
would add state churn to the hydration path. The user-visible win in R16 was
always "show the club before the fixtures finish", and that is the stage 2
checkpoint. The largest remaining wait is stage 1 decode, which R14 and R17 own.

## What is now guarded

`src/utils/progressiveFirstPaint.test.ts` locks the behaviour that matters:

- a stage 2 shaped payload passes checkpoint validation, so the early apply is
  not silently skipped;
- hydrating it produces a usable squad, staff and balance, with no matches and
  an honest "no league table" label rather than a made-up position;
- a checkpoint with no squad is rejected instead of painting an empty screen.

The interim status copy now names finances, because they arrive in the same
checkpoint as squad, staff and tactics.

## Not measured

The real-device confirmation still stands from R05 and R14: the numbers above
come from a mobile-sized Chromium proxy and a desktop server run, not a physical
Android phone. No save file was available in the workspace for this change, so
nothing here is a new phone timing.
