# Test coverage and quality

Last updated: 28 November 2026. Roadmap: R41.

## What the gate measures

`npm run test:coverage` runs the same TypeScript unit suite as `npm test` with
Node's built-in coverage, then fails when the totals fall below the agreed
floors. It includes every `.ts` file under `src/` and `server/` and excludes the
test files themselves.

`.tsx` components are deliberately outside the gate. Their useful behaviour is
driven through the real app by `npm run smoke:e2e`, `npm run a11y:audit`,
`npm run keyboard:audit`, `npm run device:matrix` and `npm run ui:audit`. A
line count on a component mostly measures how much JSX sat inside a test's
import graph, not whether the screen works.

## How to run it

```sh
npm run test:coverage
```

The summary prints one row per file and a final `all files` row. CI runs the
same command in the `verify` job, so a coverage regression fails the pull
request before it can merge.

## Floors

| Measure | Floor | Measured 28 Nov 2026 |
| --- | ---: | ---: |
| Lines | 92% | 93.28% |
| Branches | 79% | 80.30% |
| Functions | 89% | 89.76% |

The floors sit about one point below the measured totals so an ordinary change
does not fail on rounding alone, while a real loss of covered behaviour does.
Raise them when the totals move up and the extra headroom is no longer needed.

Verified on Node 22.23.5, the version CI installs, and on Node 24.22.2. The
threshold flags need Node 22.8 or newer.

## First pass: the four weakest engines

The first pass raised the four analytics engines with the lowest line coverage.
The new tests exercise the branches that decide the words and labels shown to
the user, not private helpers.

| Engine | Lines before | Lines after | Branches after | What the new tests hold |
| --- | ---: | ---: | ---: | --- |
| `seasonInsights.ts` | 85.42% | 98.75% | 93.75% | Every momentum verdict (no xG, clinical, conceding, hot streak), mixed xG and scoreline-only rows, season split on the July boundary, ISO dates, unreadable scorelines and an empty log. |
| `playerComparisonEngine.ts` | 85.66% | 93.19% | 79.01% | Division-percentile clamp, squad-rank fallback, half-weight ties, goalkeeper axes, an axis with no single leader, and a mixed squad/target selection. |
| `cardIntelligenceEngine.ts` | 87.53% | 98.28% | 87.65% | Division-median blend and benchmark value, every promise status, injury and contract risk order, all wage tags, all DNA bands and transfer verdicts, last-tactic wording, and scout upgrade/pass/stocked/value/U23 paths. |
| `restDefenseEngine.ts` | 87.17% | 91.18% | 85.50% | Every role family maps to one transition category, the rear and screen flags, and the fallback explanation for an unknown category. |

The suite went from 952 to 981 tests. No test asserts a private helper; each
calls the exported engine the screens call.

## What is still low

- `shortlistAdviceEngine.ts` (89.82% lines, 66.67% branches) and
  `progressionDiff.ts` (89.94% lines, 66.22% branches) are the next engines on
  the list. They are above the floors, so they did not block this pass.
- `useFmFileIngest.ts`, `useSavePersistence.ts`, `usePwaLifecycle.ts`,
  `useModalDialog.ts` and `errorReport.ts` are low because they need a browser,
  a real save or IndexedDB. They belong to the browser gates, not a unit count.
- React components are listed in the report for visibility, but the gate does
  not judge them. Use the browser gates for those screens.

## Why the floors are global, not per file

Node's built-in runner exposes one threshold for the whole run. A per-file
floor would need a parser over the report; that is more machinery than the
current risk needs. The four engine numbers above are recorded here so a future
change that drops one of them is visible even when the global total still
passes.
