# Dead code and duplicate utility audit (R38)

Last run: 26 November 2026.

This is the record of what the audit found, what changed, and what was left
alone on purpose. Re-run the checks below after any large refactor.

## How the audit was done

Two throwaway scripts walked `src/`, `server/` and `scripts/`:

1. **Orphan files** — every relative import was resolved to a real file. Any
   file under `src/` that no other file imported, and that was not an entry
   point or a test, was listed.
2. **Unused exports** — every `export function` and `export const` name was
   counted across the rest of the repository, tests included.

Both scripts are throwaway; they live outside the repo so they cannot drift.
Recreate them from this description if the audit is repeated.

## Removed

| File | Lines | Why it was dead |
| --- | --- | --- |
| `src/components/recruitment/ScoutTargetCard.tsx` | 278 | Superseded by `ShortlistView` and `SquadAdviceView`. No import anywhere. |
| `src/components/recruitment/ScoutTargetFilters.tsx` | 337 | Superseded by the filters inside `ShortlistView`. The only remaining mention was a focus-ring style test, which now points at live files only. |

## Consolidated

| Duplicate | Copies before | Single home now |
| --- | --- | --- |
| Compact money (`£12K`, `£1.20M`) | `shortlistAdviceEngine.formatCompactMoney`, `saveCache.formatCompactMoneyDelta`, `squadViewHelpers.formatCompactCurrency`, plus hand-rolled `M`/`k` branches in `cardIntelligenceEngine` and `recruitmentHelpers`, and `clubFinances.formatClubMoney` | `formatClubMoney`, plus the new `formatSignedClubMoney` for `+£12K` change labels, both in `src/utils/clubFinances.ts`. `formatCompactCurrency` now delegates to it |
| Exact weekly money (`£1,234/wk`) | `clubFinances.formatWeeklyMoney`, `financeScenarios.formatWeeklyExact` | `formatWeeklyAmount` in `src/utils/clubFinances.ts` |
| Attribute clamp 1–20 | `fmFileImporter` local `clamp`, `recruitmentHelpers.readTargetAttr` twice, plus `clampAttributeValue` itself | `clampAttributeValue` in `src/types/fmSave.ts` |

Visible effect: every money figure now uses capital `K` and `M`
(`£12K`, `£1.20M`, `£14.3K/wk`). Before, shortlist cards and squad wages used
lowercase (`£12k`, `£14.3k/wk`) while cards and payroll used capitals, so the
same screen could show both. No number changed, only the unit letter. Values of
15 million and above now print `£15.00M` instead of `£15.0m`.

`src/utils/clubFinances.test.ts` now fails if a file other than
`clubFinances.ts` defines a compact or weekly money formatter, if a file other
than `types/fmSave.ts` repeats the `Math.max(1, Math.min(20, Math.round(…)))`
clamp, or if a `£${…}` template prints a lowercase `k` unit with `/wk`, `/ 3y`,
`/ 1y` or `per`. That is the tripwire that keeps the count at one.

## Left alone on purpose

- **Two `getPositionGroup` functions** — `squadViewHelpers` classifies by
  substring for the Squad filter; `recruitmentHelpers` classifies through
  `classifyPositionSlot` for scout groups. They return different results for
  hybrid positions such as `D/WB (L)`, so merging them would change what the
  filters show. Merging needs a product decision, not a cleanup.
- **`formatWeeklyWage` vs `formatWeeklyAmount`** — the first prints a compact
  table figure (`£1.20k/wk`), the second an exact sentence figure
  (`£1,234/wk`). Different jobs, both already single-source.
- **Type-only exports** — around 300 exported interfaces and types have no
  outside reader. They document the shape of a module's inputs and outputs and
  cost nothing at runtime, so removing them would be churn without benefit.
- **`formatWeeklyWage` keeps its own resolution** — it prints two decimals under
  £10K (`£1.20K/wk`) where `formatClubMoney` rounds to whole thousands. Wages are
  small enough that the extra digit matters, so it stays a separate formatter
  built on the same unit letter.
- **`staffRatings.toStars` and `playerComparisonEngine.estimateDivisionPercentile`**
  clamp to 1–20 without rounding. They are not copies of `clampAttributeValue`
  because they deliberately keep fractional input.
- **Server modules** — `server/*` has no orphan files. The route table imports
  every module, including the ones the client never calls directly.
