# Data parity + UI audit — 2026-11-25

Read-only audit. **No application, parser, or UI code was changed.** Every item below is a
finding for review, with the file and line that produces it.

Method: traced each user-visible value from its source (`public/fm-save-mapper.py` →
`src/utils/fmSaveHydrator.ts` → UI selector → component) and compared it against the value the
Hub & Analyst prompt actually receives (`src/utils/tacticalAnalystContext.ts`,
`src/utils/fmfShortlistExporter.ts`).

Severity: **P1** = the UI and the Analyst can show different numbers for the same club.
**P2** = formatting or scope drift that invites a wrong answer. **P3** = cosmetic/hygiene.

---

## P1 — same question, two answers

### 1. Three wage formatters, two of them exported under the same name — FIXED (TypeScript parity PR #31)

| Where | Output for 14250 | Output for missing/0 |
| --- | --- | --- |
| `src/utils/squadViewHelpers.ts:329` `formatWeeklyWage` | `£14.3k/wk` | `—` |
| `src/utils/clubFinances.ts:108` `formatWeeklyWage` | `£14,250/wk` | `--` |
| Raw interpolation (`tacticalAnalystContext.ts` ×20, `fmSaveHydrator.ts:1622`, `StaffDirectory.tsx:407,484`, `SquadCompareView.tsx:43,60`, `PlayerDetailModal.tsx:470`) | `£14250/wk` | `£undefined/wk` |

`clubFinances.formatWeeklyWage` has no production consumer — only `clubFinances.test.ts:45-47`.
`squadViewHelpers.test.ts:245-246` locks the other variant. Both suites pass, so the divergence
is enshrined in tests. Pick one formatter, delete the other, and make the analyst use it.

### 2. Three different squad counts — FIXED (TypeScript parity PR #31)

- `Squad` tab defaults to first team only: `SquadAnalyticsTable.tsx:111` (`'FIRST_TEAM'`), `:182`.
- Hub header counts everyone: `AutoSyncWorkspace.tsx:1635` (`${players.length} players`).
- Analyst counts everyone but profiles 26: `tacticalAnalystContext.ts:1607,1629` (`X OF ${players.length}`), `:1543` (`slice(0, 26)`).

A 24-man first team inside a 31-player pool yields 24 / 31 / "26 OF 31" on three surfaces.

### 3. The squad table is sent twice, with different caps and different formats — FIXED (TypeScript parity PR #31)

- `fmSaveHydrator.ts:1561,1622,1840` — `=== FULL MANAGED SQUAD (N PLAYERS …) ===` built from
  `decoded.players.slice(0, 28)`, one long line per player, raw `£{wagePw}` and `exp {expires}`.
- `tacticalAnalystContext.ts:1543,1607` — `=== SQUAD PROFILES & SEASON STATS (X OF N) ===` built from
  `slice(0, 26)`, different field order and placeholders.

Both blocks reach the model (`AutoSyncWorkspace.tsx:574` sends `promptContext`; `:745` sends the
live context). Players 27–28 appear only in the first block; players 27–31 appear in neither
profile table. Two overlapping tables also double the context budget pressure that causes P2 #4.

### 4. Two payroll numbers under near-identical labels — FIXED (TypeScript parity PR #31)

- UI/Recruitment header: canonical `wagePayrollWeekly` from the save's finance table
  (`clubFinances.ts:252-267`, rendered at `recruitment/RecruitmentHeader.tsx:242`).
- Analyst: `Player Basic Wages £{sum(wagePw)}/wk` — `tacticalAnalystContext.ts:447,454`, computed
  inline over every player including youth, next to `Club Payroll {wageSpendLabel}` at `:871`.

The two numbers differ by scope (game payroll vs squad wage sum) and by rounding, and both are in
the prompt, so the model can quote either.

### 5. Staff payroll has no total anywhere — FIXED (fmsave 0.14.4 PR)

`StaffDirectory.tsx:407,484` show per-row `£{s.wagePw}/wk` only; the analyst payload has no staff
wage figure at all. Asked "what is my staff payroll", the UI cannot answer and the Analyst must
invent. `staffRatings.ts` already computes backroom summaries — the total belongs there, consumed
by both.

Fixed: `computeWeeklyStaffPayroll` + `formatWeeklyStaffPayroll` in `staffRatings.ts` are the one
total. The Staff tab header and the Analyst `backroom_staff` block both call them, and an unreadable
wage makes the total `--` (with a count) instead of folding in a fake £0.

### 6. Staff "expiring soon" uses two different windows — FIXED (fmsave 0.14.4 PR)

- UI: `staffRatings.ts:406-412` — `diffDays <= 190`.
- Analyst: `tacticalAnalystContext.ts:1231-1240` — own date parse, `monthsLeft <= 12`.

A coach expiring in 200 days is invisible in the Staff tab and listed as expiring to the Analyst.

Fixed: the Analyst's local date parser and 12-month window are gone; both sides call
`isStaffContractExpiringSoon` with `STAFF_CONTRACT_EXPIRY_WINDOW_DAYS` (190).

### 7. Best Fit % exists only in the UI — FIXED (TypeScript parity PR #31)

`PlayerDetailModal.tsx:649,774` render `analysis.bestIpRole.fitPct` from
`analyzePlayerCard` → `scorePlayerForFm27Role`. The analyst has no per-player fit percentage; it
carries `combinedFitPct` from `solveBestXi` (`tacticalAnalystContext.ts:825`) — a different metric
on a different scale. When a user asks why a player shows "Best Fit 72%", the prompt has no such
number.

### 8. Match points/PPG include friendlies when the filter is "All" — FIXED (TypeScript parity PR #31)

- `MatchLogArchive.tsx:337-341` compute W-D-L, points and PPG from `filteredMatches`; `:477` renders
  `{ppg} PPG · {winPct}% Win` with no scope label.
- `:274` defaults the filter to `'all'` whenever there are no competitive matches — i.e. exactly in
  pre-season, when every match is a friendly.
- Analyst: `fmSyncEngine.ts:84` excludes friendlies, and `tacticalAnalystContext.ts:1354-1366`
  explicitly forbids mixing them.

Good news: the Hub KPI (`App.tsx:630`) uses the same `computeCompetitiveSummary` as the analyst, so
Hub and Analyst agree. Only the Matches tab drifts, and only when "All" is active.

---

## P2 — placeholder and default drift

### 9. Five placeholder vocabularies — FIXED (TypeScript parity PR #31)

`—` (`squadBadges.tsx:310`), `-` (`tacticalAnalystContext.ts:1455`), `--` (`clubFinances.ts:113`),
`N/A` (`fmSaveHydrator.ts:1530`), and literal `undefined` wherever a raw `${p.wagePw}` /
`${p.expires}` is unguarded (`fmSaveHydrator.ts:1622`, `StaffDirectory.tsx:407,484`,
`PlayerDetailModal.tsx:470,709,799,1775`, `SquadCompareView.tsx:43,60`).

The analyst's own validator, `isPlaceholderString` (`tacticalAnalystContext.ts:2562-2568`),
recognises `--`, `n/a`, `null`, `undefined`, `unknown` but **not** `—` or `-`, so its own expiry
placeholder counts as real data during pre-flight validation.

### 10. Invented defaults, with conflicting magic numbers — FIXED (decoder follow-up)

| Field | Decoder | Hydrator | Analyst fallback |
| --- | --- | --- | --- |
| Player age | `null` when absent | keeps `null` | `--` |
| Staff age | `null` when absent | keeps `null` | `--` |
| Wage | `null` when absent | keeps `null` | `--` |
| Nation | `null` when absent (empty string on generated targets) | keeps the gap | `--` |
| Name | unnamed non-manager staff rows are skipped; no invented name | `--` | `--` |
| Staff role | `null` when the job code is unknown; no `"Coach"` fallback | `--` | `--` |

The active decoder path no longer fabricates `22`, `35`, `0`, `"Unknown"`, `"N/A"`, or
`"Coach"`. `_resolve_player_nationality()` now returns `None` unless a caller explicitly asks for
a display default. In-game shortlist targets keep an unknown age as `null`; the recruitment scan
skips generated candidates whose age cannot be read, because it cannot rank them honestly.
`RecruitmentTarget.age` and `ageDelta` are nullable, and the UI/Analyst render `--` or an explicit
"Age not decoded" note instead of an age-based claim.

Staff wages remain fixed from PR #43: `_staff_contract_fields()` reads the flat fmsave `Staff`
contract (`has_contract`/`wage`/`contract_end`), and an unreadable wage stays `null` so the shared
payroll total prints `-- (n of m wages unreadable)` rather than a partial sum.

The unused legacy `extract_pass_0_data()` helper still carries its old local defaults; it is not on
the active payload path. Remove or migrate it before anyone calls it again.

### 11. Two "has played" predicates — FIXED (TypeScript parity PR #31)

- UI: `squadViewHelpers.ts:294-302` — minutes > 0, apps ≠ "0", goals, assists, or rating > 0.
- Analyst: `tacticalAnalystContext.ts:1595-1599` — minutes > 0, `rating !== null`, goals, assists.

Disagree when `apps > 0` with 0 recorded minutes (analyst prints a zeroed stat line where the UI
shows no stats) and when `rating` is `0` (UI: no stats, analyst: prints `0.00rt`).

### 12. Meta current/potential is shared, but its ranking scope is not — FIXED (TypeScript parity PR #31)

`evaluatePlayerMetaScore` is the single engine on both sides (good). The analyst's "Top Squad Meta
Scores" list (`fmfShortlistExporter.ts:135-143`) ranks the 26-player profile subset and keeps 8,
while the UI ranks the full pool; the block is P3 and dropped first under budget
(`tacticalAnalystContext.ts` P2/P3 assembly). The highest-meta player in the club can therefore be
absent from the prompt's "top" list.

---

## Verified consistent — no action

- Competitive record and points: `App.tsx:630` and `tacticalAnalystContext.ts:430` both call
  `computeCompetitiveSummary`.
- Meta current/potential values: one engine, `evaluatePlayerMetaScore`.
- Star ratings: `toFixed(1)` on both sides (`fmSaveHydrator.ts:1622`,
  `tacticalAnalystContext.ts:1063`, `PlayerDetailModal.tsx:643`).
- `squadUnit`: derived once from `teamSlot` (`fmSaveHydrator.ts:53-61`), not decoder-sourced.
- Player contract status: `transferAudit.ts:1054,1062` used by both.
- Friendly classification: one helper, `matchScopeHelpers.classifyMatchCompetitionBucket`.

---

## UI review against the Vercel Web Interface Guidelines

Run with the newly installed `.agents/skills/web-design-guidelines` checklist.

### Destructive action without confirmation

`AutoSyncWorkspace.tsx:1719-1729` — **Clear Chat** immediately calls `clearClubChatHistory`
(`:1721`) and drops `turns`. No confirm, no undo, and it sits directly beside **Copy Chat**
(`:1700-1702`), so a
mis-tap on mobile destroys the club's analyst history. Add a confirm step or a 5-second undo toast.

### Modal focus management

`MobileSheetFrame.tsx:130-190` — correct `role="dialog"`, `aria-modal`, Escape handling, and
`overscroll-contain` on the body, but **no focus trap, no initial focus, and no focus restore**, and
the page behind is not scroll-locked. Keyboard and screen-reader users can tab into the page behind
a sheet that claims to be modal. Every detail modal (`PlayerDetailModal`, `StaffDetailModal`,
`ScoutTargetDetailModal`) inherits this.

### Contrast on muted informational text

`text-slate-500` (#64748b) on `slate-900` (#0f172a) is **3.75:1** — below the 4.5:1 AA floor for
normal text, and these are 10-11px. Affected informational (non-decorative) instances:
`recruitment/PositionalDepthView.tsx:228`, `squad/SquadProgressionView.tsx:146,157,168,179`,
`SaveSnapshotDiffPanel.tsx:480,782,811`, `MatchLogArchive.tsx:448,518`.
Move informational muted text to `text-slate-400` (6.96:1) and keep `slate-500` for separators.

### Focus visibility

`LastMatchTacticBlueprintCard.tsx:566,671`, `KnowledgeBasePanel.tsx:171,202,289`,
`recruitment/ScoutTargetFilters.tsx:267,292` use `focus:outline-none` with only a border-colour
change. `StaffDirectory.tsx:141-147` has no focus style at all. Use `focus-visible:ring-2`.

### Typography

Six placeholders end in `...` while the rest of the app uses `…`:
`SquadListToolbar.tsx:135`, `CommandPaletteModal.tsx:344`, `AutoSyncWorkspace.tsx:2337`,
`StaffDirectory.tsx:144`, `recruitment/SquadAdviceView.tsx:97`, `recruitment/ShortlistView.tsx:174`.

### Transition scope

`transition-all` on `FmUploadProgressCard.tsx:132`, `charts/MultiPlayerComparisonChart.tsx:255`,
`SetPiecesAndTraining.tsx:463` (progress fills — should be `transition-[width]`) and
`InteractivePitchBuilder.tsx:858` (slot chip — list the properties).

### Passing

Skip-to-content and `aria-current` on the bottom nav (`MobileBottomNav.tsx:101`); 44-52px tap
targets in the nav and More sheet; `tabular-nums` on numeric cells (181 uses); `prefers-reduced-motion`
block in `src/index.css:47`; `theme-color` and a zoom-permitting viewport in `index.html`; 80
`aria-label`s and 8 `aria-live` regions; squad list capped at 35 rows with load-more, so no
virtualisation needed.

---

## Suggested fix order (not applied)

1. One wage formatter (§1) — smallest change, removes the most `£undefined` surfaces.
2. Placeholder contract (§9) + drop invented defaults (§10) — DONE: gaps are explicit in decoder,
   hydrator, UI, and analyst.
3. Staff payroll total and one expiring window (§5, §6) via `staffRatings`, consumed by both.
4. One squad count and one squad table in the prompt (§2, §3) — pick 26, label the cap, and
   stop sending `analystPromptContext`'s duplicate squad block.
5. Best Fit % into the analyst payload (§7) — reuse `scorePlayerForFm27Role`, do not add a
   second scorer.
6. Matches-tab PPG scope label (§8) and the Clear Chat confirmation (UI section).

---

## Save-based verification — 27.0.1 vs 27.1.0 (2026-11-25)

Three real KVV Zelzate saves from the same career were decoded with `fmsave 0.14.4` and
compared through the hydrator, the Staff/Finances selectors, and the live Analyst context.

| File | Build | In-game date | Squad | Staff | Player Wage Bill | Staff Payroll |
| --- | --- | --- | --- | --- | --- | --- |
| `auto_save_v03_.fm` | 27.0.1+2503222 | 11/08/2027 | 49 | 38 | £10,604 / £10,203 | £10,643/wk known (5 of 37 without wage) |
| `auto_save.fm` | 27.1.0+2505117 | 15/09/2027 | 47 | 40 | £10,257 / £10,203 | £11,171/wk known (5 of 39 without wage) |
| `last_save_overwrite_backup.fm` | 27.1.0+2505117 | 15/09/2027 | 47 | 40 | £10,257 / £10,203 | £11,171/wk known (5 of 39 without wage) |

The third file is an overwrite backup, not a third career: it has the same build/date but
an older league record and missing `tactics`/`selections`/`setPieces`, so the two canonical
comparison saves are `auto_save_v03_.fm` and `auto_save.fm`.

### Fixed in this pass

1. **Staff block was dropped from dense Analyst contexts.** `backroom_staff` was P2 with a
   compact form that only contained expiring contracts. On a full 47/49-player save the
   budget assembler removed it, so the Analyst could not quote the Staff tab's payroll,
   department ratings, or Preferred Job Affinity caption. It is now P0, and its compact
   form keeps payroll, department leads, and the affinity guardrail. Verified with a
   32-player dense-context test.
2. **fmsave sponsorship rows were filtered out.** The decoder emits `annual_value`, `end`,
   and `dates_reordered`; the app read `annualValue`, `expires`, and `dates_reordered`.
   Every real deal therefore looked empty and the Hub showed “No decoded sponsorship
   amounts”. `normalizeSponsorshipDeal` now bridges the fields at the hydrator/finance
   boundary; the real saves render `£227K/yr` and `£2K/yr` with the correct end dates.
3. **Every real job vacancy was hidden.** The decoder emits `club_name`,
   `competition_name`, and the job code inside `unknown.role`; the Staff tab expected
   `club`/`role`, so all 25 feed rows became “Staff · Club” placeholders and were filtered
   out. `normalizeJobVacancy` now maps the confirmed fmsave `StaffJob` codes (for example
   20 = Assistant Manager, 14 = Scout, 2 = Coach) and the snake_case club/league fields at
   the hydrator, Staff tab, and Analyst boundary. The live club snapshot carries the
   count and first two roles, labelled “may include filled”. Verified on all three saves:
   `Assistant Manager @ Clube Náutico Capibaribe`, `Coach @ Leicester City`,
   `Fitness Coach @ Tottenham Hotspur`.
4. **Sponsorship rows reached the Hub but not the live Analyst.** The Hub rendered
   `£227K/yr` and `£2K/yr`, while the live prompt only mentioned the date-order reader
   note. `buildSponsorshipPanelRows` is now the one row formatter for the Hub panel and
   the Analyst, and the live club snapshot carries
   `Sponsors: £227K/yr (to 2030-05-23), £2K/yr (to 2032-08-31)` plus the first two
   job-centre roles. The import prompt also reports the same deals. The
   `dates_reordered` warning travels with the row instead of living only in reader notes.

### Confirmed unchanged / expected

- `auto_save_v03_.fm` is pre-season: 15 friendlies, no league table, 0 competitive matches.
  `auto_save.fm` has 4 league matches, #6 of 16, 6 points. The UI and Analyst both use the
  same competitive-scope helper for those labels.
- `last_save_overwrite_backup.fm` is an overwrite backup with the same 27.1.0 staff,
  finances, sponsorships, and 25 job-centre rows as `auto_save.fm`. It lacks the tactic
  and selection payloads and has a different league/fixture snapshot, so its live context
  is shorter, but the Staff and Finances parity strings match exactly.
- The Staff tab's 38 vs 40 staff count and £10,643 vs £11,171 payroll difference match the
  save dates; both surfaces quote the same string for each save.
- The 27.0.1 save has 15 friendlies but only 14 `teamMatchStats` rows; the missing row is
  an honest decode gap, not a zeroed value.
