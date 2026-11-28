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

## The app shell

`src/App.tsx` used to hold the whole page: the header, the save receipt above
the tabs, the sync pill, the tab panels and every overlay. The chrome now lives
in `src/components/shell/`, so the shell component keeps state and routing.

| File | Owns |
| --- | --- |
| `src/App.tsx` | Launch URLs, tab routing, chat state, overlay history, persistence wiring and restore |
| `src/hooks/useCampaignState.ts` | The campaign bundle — squad, matches, staff, recruitment lists, header labels, the decoded save and the plan fields — and the three whole-campaign writes |
| `src/components/shell/AppMainContent.tsx` | The section container under the header: the executive strip, the sync pill and one lazy view per section |
| `src/components/shell/AppOverlays.tsx` | Everything that floats over the workspace: the bottom navigation, the More sheet, the share sheet, the shared view, the toast and the five modals |
| `src/components/shell/AppHeader.tsx` | Skip link, brand, desktop section nav, the header actions and the hidden file inputs |
| `src/components/shell/ClubBaselineStrip.tsx` | The save receipt: date and file name, the club title, the four headline numbers, the verification card and the governance banner |
| `src/components/shell/BackgroundSyncPill.tsx` | The "still reading your save" pill shown on the other tabs |
| `src/components/shell/backgroundSync.ts` | The `BackgroundSyncStatus` shape shared by the header button and the pill |

`src/components/MobileBottomNav.tsx` was already its own file and stays the
owner of the phone tab bar; `MobileMoreSheet` owns the sheet behind it.

The same rule applies: a shell component takes props and holds no app state.
The header does not read the save; it is told the counts and the callbacks.

## What moved out of `tacticalAnalystContext.ts`

Payload diagnostics and pre-flight validation are about the payload, not about
building the context, so they now live in `src/utils/analystPayload.ts`. The
dependency runs one way: `analystPayload` imports from `tacticalAnalystContext`,
never the reverse. That keeps the two files free of circular imports.

If you change a payload field, edit `analystPayload.ts`. If you change what the
Analyst is told about the save, edit `tacticalAnalystContext.ts` and check the
row in `docs/data-parity-contract-map.md`.

## Sizes after these passes

| File | Before R40 | Now |
| --- | --- | --- |
| `src/components/AutoSyncWorkspace.tsx` | 3,257 | 2,655 |
| `src/utils/tacticalAnalystContext.ts` | 2,976 | 2,033 |
| `src/utils/analystPayload.ts` | — | 956 |
| `src/components/analyst/*` | — | 757 across four files |
| `src/App.tsx` | 2,296 | 674 |
| `src/components/shell/*` | — | 1,479 across six files |
| `src/hooks/useAppNavigation.ts` | — | 208 |
| `src/hooks/useSavePersistence.ts` | — | 163 |
| `src/hooks/useShareSummary.ts` | — | 45 |
| `src/utils/saveJourneyTimeline.ts` | — | 58 |
| `src/hooks/useBackupTransfer.ts` | — | 92 |
| `src/hooks/useSquadDeltaUpdates.ts` | — | 54 |
| `src/utils/hydratedLabels.ts` | — | 40 |
| `src/hooks/useFmSaveImport.ts` | — | 205 |
| `src/hooks/useRecruitmentState.ts` | — | 165 |
| `src/utils/recruitmentLists.ts` | — | 77 |
| `src/utils/scoutTargetFromPlayer.ts` | — | 42 |
| `src/utils/saveHistoryPoint.ts` | — | 120 |
| `src/components/player-detail/AttributesTab.tsx` | — | 319 (attributes tab, extracted from `PlayerDetailModal.tsx`) |
| `src/components/player-detail/RolesTab.tsx` | — | 92 (roles and pitch tab) |
| `src/components/player-detail/EngineTab.tsx` | — | 154 (engine and charts tab) |
| `src/utils/pitchFamiliarity.ts` | — | 69 (pitch slot map and familiarity score) |
| `src/components/player-detail/OverviewTab.tsx` | — | 426 (overview tab: KPI strip, verdict, strengths, role fit, DNA) |
| `src/components/player-detail/ContractTab.tsx` | — | 365 (stats and contract tab: production, clauses, season history) |
| `src/utils/playerCardExport.ts` | — | 227 (player card PNG model and canvas drawing) |
| `src/utils/hydrateAvailability.ts` | — | 72 (bans deduplicated by uid, injuries by uid or normalised name) |
| `src/utils/hydrateAnalystContext.ts` | — | 338 (the analyst's save briefing, competition rules and reader warnings) |
| `src/utils/hydratePlayerMerge.ts` | — | 699 (squad matching, stale removal, new signings, and the status/attribute helpers that feed them) |
| `src/utils/hydrateMatchLog.ts` | — | 160 (match log build: save rows, team match stats enrichment, existing-report merge) |
| `src/utils/hydrateStaff.ts` | — | 56 (staff directory rows, neutral attributes, placeholder text) |
| `src/utils/hydrateFinances.ts` | — | 102 (canonical balance, wage summary, financial runway) |
| `src/utils/hydrateExecutiveLabels.ts` | — | 149 (executive strip: save date, next fixture, league record and standing, squad output, tactic headline) |
| `src/utils/saveJourneyReport.ts` | — | 942 (snapshot diff, journey findings, timeline and the AI payload) |
| `src/utils/playerDetailFormat.ts` | — | 52 |
| `src/utils/campaignState.ts` | — | 157 (the campaign shape, the opening and cleared states, the stored-snapshot and backup rules, and the persisted snapshot) |
| `src/hooks/useCampaignState.ts` | — | 189 (the campaign state owner) |

## Still large, and next in line

| File | Lines | Why it is still one file | Plan |
| --- | --- | --- | --- |
| `src/App.tsx` | 674 | Chrome, routing, persistence, backup, squad deltas, the `.fm` import pipeline, the tab workspace, the overlays, the recruitment domain and the campaign state are out; what remains is the chat and overlay state, the derived summaries and the callbacks that join them | Split the chat state, then the derived summaries |
| `src/components/PlayerDetailModal.tsx` | 608 | The sheet chrome, the derived model, the tab bar and the shortlist action | Nothing left to split; the five panels and the PNG export are out |
| `src/utils/fmSaveHydrator.ts` | 634 | Decoder output to UI records: availability, squad merge, match log, labels, staff, finances, governance and the payload it hands on | Nothing left to split; the hydrator now delegates every build to its own module |
| `src/services/saveCache.ts` | 917 | IndexedDB payload caches and snapshot history; the journey report now lives in `src/utils/saveJourneyReport.ts` | Split the payload caches from snapshot history |

`src/App.tsx` changes most often after the workspace, so it stays the next
target. Nine passes have taken the chrome, the section routing, the save
persistence, the backup and squad-delta handlers, the `.fm` import pipeline, the
tab workspace, the overlays, the recruitment domain and the campaign state out
of it; what is left is the chat state, the derived summaries and the callbacks
that join them, so the next move is the chat state.
The others are split as they are touched, not for their own sake.

## Where the App logic lives now

| Concern | Owner |
| --- | --- |
| Active tab, hub panel, tactics panel, recent views, URL and Back behaviour | `src/hooks/useAppNavigation.ts` |
| The tab workspace markup, the executive strip and the per-section lazy views | `src/components/shell/AppMainContent.tsx` |
| The bottom navigation, the More sheet, the share sheet, the toast and the five modals | `src/components/shell/AppOverlays.tsx` |
| Cold-start restore, IndexedDB recency check, debounced auto-save, reset pause/cancel | `src/hooks/useSavePersistence.ts` |
| `?share=` token, decoded share summary, leaving the shared view | `src/hooks/useShareSummary.ts` |
| Which two saves a Journey report compares | `src/utils/saveJourneyTimeline.ts` |
| Overlay Back entries for the More sheet, knowledge base and calibration lab | `src/hooks/useHistoryNavigation.ts` |
| Campaign backup out and back in, and the backup file name | `src/hooks/useBackupTransfer.ts` |
| Parsed squad merges and Analyst player write-back | `src/hooks/useSquadDeltaUpdates.ts` |
| Which header labels an interim checkpoint may write | `src/utils/hydratedLabels.ts` |
| Turning a decoded `.fm` payload into app state, interim pass and final pass | `src/hooks/useFmSaveImport.ts` |
| Recruitment cases, shortlists and tracked scout targets, and the handlers that change them | `src/hooks/useRecruitmentState.ts` |
| Which fields a Journey snapshot keeps from one save | `src/utils/saveHistoryPoint.ts` |
| The campaign bundle and its three whole-campaign writes: restore a stored snapshot, restore a backup, clear everything | `src/hooks/useCampaignState.ts` |
| The campaign shape, the opening and cleared states, and the rule for each field a stored snapshot may or may not replace | `src/utils/campaignState.ts` |
