# Contract expiry alert centre

Roadmap: R34. Surface: Transfers → Expiring.

## What it answers

"Who is running out of contract, and what am I going to do about each one?"

The centre lists every player and staff member inside a 12 month horizon in one list, with a
plan button per row: Renew, Sell or Release. The money strip above the list updates as plans
are chosen, so the answer to "what does this plan cost me?" is on screen rather than in a
spreadsheet.

## Where the numbers come from

| Value | Source |
| --- | --- |
| Player row, months left, verdict, recommended move | `PlayerTransferAdvice` from `evaluateTransferAudit` (the same objects the Squad Advice view renders) |
| Staff row, days and months left | `staffContractDaysRemaining` (`src/utils/staffRatings.ts`) |
| Staff department label | `classifyStaffDepartment` (`src/utils/staffRatings.ts`) |
| Wage and value formatting | `formatWeeklyWage`, `formatCompactCurrency` (`src/utils/squadViewHelpers.ts`) |
| Weekly wage at risk and plan totals | `buildContractExpiryCentre` (`src/utils/contractExpiryCentre.ts`) |

The centre does not form its own opinion about a player. The suggested plan is the
Transfer Audit verdict mapped through `suggestedDecisionForVerdict`, so a row cannot say
"renew" while the advice above it says "sell". A dot marks the suggestion; the user still
chooses.

## Two horizons, on purpose

- The centre uses 12 months for both players and staff. It is a planning list.
- The Staff tab keeps its own 190 day "expiring soon" badge (`isStaffContractExpiringSoon`).
  That is an "act now" flag, not a planning window.

Six months is the critical line for both: that is when a player can sign a Bosman
pre-contract, and it is the point where a staff replacement has to be recruited.

## Missing data

- A player with no readable contract date is not listed. The Squad Advice view already
  shows the gap; inventing a date here would be worse.
- Staff with an unreadable expiry (`--`) are not listed either.
- A wage that did not decode leaves the row out of the money totals and adds a line to the
  summary explaining how many rows were left out. It is never counted as zero.
- A sold player valued at the save's 300m ceiling marks the fee total as a minimum.

## The plan is user data, not save data

Plans live in `localStorage` under `fm27_contract_plan_v1`, keyed by the club key from
`resolveChatClubKey`, so two careers do not share a plan and re-importing the same save
keeps it. Shape: `{ v: 1, clubs: { [clubKey]: { 'player:<id>' | 'staff:<id>': 'renew' | 'sell' | 'release' } } }`.

`src/services/contractPlan.ts` validates everything it reads: unknown decisions, malformed
row keys, empty club keys and non-object payloads are dropped instead of repaired. Reads
and writes are wrapped so a blocked or full storage cannot break the panel. Caps: 12 clubs,
250 rows per club.

Nothing in the plan reaches the Analyst prompt. It is a user intention, not a decoded fact,
so the prompt keeps quoting the save.

## Verification

- `src/utils/contractExpiryCentre.test.ts`: window edges, urgency ordering, staff
  inclusion and labels, unreadable dates, verdict mapping, money totals, capped values.
- `src/services/contractPlan.test.ts`: set, clear, per-club isolation, malformed payloads,
  blocked storage, unsafe keys, row cap.
- Real KVV Zelzate save (11/08/2027): 5 players and 29 staff inside 12 months, 34 rows,
  £11k/wk at risk. Renewing the top player moved "kept if renewed" to £452/wk; selling the
  next moved "freed" to £294/wk and "fees to recover" to £10k. Plan survived a reload.
- axe-core on the panel: 0 violations, 22 passes at 390×844 and 1920×1080. No horizontal
  overflow, no tap target under 44px.
