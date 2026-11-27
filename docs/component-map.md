# Where the big files went (R40)

R40 is about making the biggest files safe to change. This page records who owns
what now, so a new feature lands in one place instead of the middle of a
three-thousand-line component.

## The Analyst workspace

`src/components/AutoSyncWorkspace.tsx` used to be one file with everything in
it. It now hands the presentation to four components, each with its own props
and no hidden state.

| File | Owns |
| --- | --- |
| `src/components/AutoSyncWorkspace.tsx` | State, the chat turn runner, file ingest, decode target, and the wiring between the panels |
| `src/components/analyst/AnalystChatFeed.tsx` | The scrollable conversation: user turns, Analyst replies, the grounded-in chips, follow-up buttons and the stop button |
| `src/components/analyst/AnalystComposer.tsx` | The message box, attach and paste buttons, and the on-device and Fast Sync switches |
| `src/components/analyst/MobileHubTabs.tsx` | The four-tab strip that shows one panel at a time on a phone, plus the `MobileHubView` type |
| `src/components/analyst/HubFinancesPanel.tsx` | The Club Finances panel: cash and runway, the what-if sandboxes, the payroll breakdown and the sponsorship list |
| `src/utils/analystResponse.ts` | Parsing the model answer before anything trusts it (see `docs/type-safety.md`) |
| `src/utils/analystPayload.ts` | Payload diagnostics and pre-flight validation: section sizes, missing core fields, the report the Data Quality tab shows |
| `src/utils/tacticalAnalystContext.ts` | Building the context that is sent to the Analyst |

The rule that keeps it that way: the workspace owns state and passes props
down. A panel does not reach into the workspace, and a new panel gets its own
file under `src/components/analyst/`.

## What moved out of `tacticalAnalystContext.ts`

Payload diagnostics and pre-flight validation are about the payload, not about
building the context, so they now live in `src/utils/analystPayload.ts`. The
dependency runs one way: `analystPayload` imports from `tacticalAnalystContext`,
never the reverse. That keeps the two files free of circular imports.

If you change a payload field, edit `analystPayload.ts`. If you change what the
Analyst is told about the save, edit `tacticalAnalystContext.ts` and check the
row in `docs/data-parity-contract-map.md`.

## Sizes after this pass

| File | Before | After |
| --- | --- | --- |
| `src/components/AutoSyncWorkspace.tsx` | 3,257 | 2,655 |
| `src/utils/tacticalAnalystContext.ts` | 2,976 | 2,033 |
| `src/utils/analystPayload.ts` | — | 956 |
| `src/components/analyst/*` | — | 757 across four files |

## Still large, and next in line

| File | Lines | Why it is still one file | Plan |
| --- | --- | --- | --- |
| `src/App.tsx` | 2,296 | It is the app shell: launch URLs, tab routing, overlay history, persistence and restore all sit together | Pull persistence and restore into a `useFmHubPersistence` hook, then navigation into a `useHubNavigation` hook |
| `src/components/PlayerDetailModal.tsx` | 2,047 | One modal with several stacked panels | Split the role, attribute and contract panels into `src/components/player/` |
| `src/utils/fmSaveHydrator.ts` | 1,939 | Decoder output to UI records in one pass | Split by source table (club, squad, staff, fixtures) |
| `src/services/saveCache.ts` | 1,830 | IndexedDB snapshots plus journey reports | Split snapshot storage from journey reporting |

`src/App.tsx` changes most often after the workspace, so it is the next target.
The others are split as they are touched, not for their own sake.
