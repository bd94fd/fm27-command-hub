# Squad role-fit explainability

R12 shows why a player fits or misses an FM27 role. The Player detail modal shows the score, the attribute weights, the key thresholds and the nearest alternative role.

The calculation lives in `src/utils/playerCardAnalysis.ts` and uses the same `scorePlayerForFm27Role` used by the Squad, Transfers and Analyst surfaces. No raw CA or PA is involved.

## How the score is built

1. Every role priority from `fm27Roles.json` has a weight: primary = 2, supporting = 1.
2. Each attribute is clamped to 1–20. A missing attribute is treated as 9/20 and marked as missing.
3. The weighted score is the average of `attribute / 20 × 100 × weight`.
4. Position familiarity then adjusts the score:
   - Goalkeeper mismatch: ×0.25.
   - Familiarity 18+: +8.
   - Familiarity 15–17: +3.
   - Familiarity 12–14: ×0.75.
   - Familiarity 9–11: ×0.5.
   - Familiarity below 9: ×0.25.
   - No familiarity data but the position group matches: +8.
   - Position group does not match: ×0.4.
5. The result is rounded and capped at 1–99%.

## What the modal shows

- Best In-Possession and Best Out-of-Possession role cards.
- Why this score: every role attribute with its value, weight multiplier and share of the weighted score.
- Key thresholds:
  - Primary average 12+.
  - Lowest primary 10+.
  - Best primary 15+.
  - Secondary average 10+.
  - Position familiarity 12+ when the save supplies position ratings.
- Nearest alternative: the next-best role with its percentage and tier.

A threshold chip is green when met and amber when missed, so a Makeshift result explains which requirement failed instead of only showing a percentage.

## Tests

`src/utils/playerCardAnalysis.test.ts` checks the weighted attributes, threshold list, missing-attribute labelling and nearest alternative. It also checks the modal source renders the explanation block.
