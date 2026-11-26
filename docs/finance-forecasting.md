# Finance forecasting and what-if

Roadmap: R33
Status: done

The Finances card in Hub & Analyst answers "where do I stand". This adds the next
question: "what happens if I do this". Four inputs, one live projection, no upload and
no server call.

## What the user can change

| Input | Unit | Sign |
| --- | --- | --- |
| Weekly wage change | per week | positive for a signing, negative for a sale |
| Sponsorship change | per year | positive for a new deal, negative for a lost one |
| Transfer fee paid | cash now | magnitude |
| Transfer fee received | cash now | magnitude |

All four can be used together, so a single scenario can model "sell him, bank the fee and
sign a replacement on less money".

## What it reports

- Balance after the one-off fees.
- Monthly net after the wage and sponsorship change.
- Runway after, shown as before → after.
- Wage headroom after, in pounds per week against the decoded budget.
- One plain-English verdict sentence, for example: "Saving £8,000/wk of wages, banking
  £2.00M in fees: Runway moves from overdrawn to 8.8 months. Wages stay £7,599/wk under
  the cap."

## The arithmetic, and why it is written down

- A week is 52/12 of a month (`WEEKS_PER_MONTH`). Using four weeks would understate a
  weekly wage by 8% over a month.
- Monthly net after = the latest decoded month's net cash flow + (wage change × 52/12) +
  (annual sponsorship change ÷ 12).
- Balance after = decoded balance + fees received − fees paid.
- Runway after = balance after ÷ monthly burn, when the club is still burning cash. A
  club that turns cash-positive has no runway to run out of, and the panel says so instead
  of showing a large number.
- Status thresholds match the existing runway card: under 3 months is Critical, under 6 is
  Warning, anything else is Healthy, and a negative balance is always Critical.

## Where the numbers come from

Every starting figure comes from `buildClubFinancesPanel`, which reads the same canonical
selectors the Finances cards use (`resolveCanonicalClubFinances`,
`calculateFinancialRunway`). The projection is `projectFinanceScenario` in
`src/utils/financeScenarios.ts`, a pure function with no side effects.

One honesty rule is built in. The runway card averages the losing months, while a
projection has to run from the latest month. When those two bases give different answers,
the "before" side shows the card's own label so the panel never contradicts the card above
it, and a one-line note explains the difference. The note only appears when it is true.

## What it refuses to do

- If the save has no decoded balance or no cash flow history, it shows the reason instead
  of a projection. No guessed opening balance.
- If the save has no decoded wage budget, it leaves the wage verdict out rather than
  treating the cap as zero.
- It never writes to the save, the cache, or the Analyst prompt. Scenarios are not saved
  data, so `club_snapshot` keeps quoting the decoded snapshot.

## Verification

- `src/utils/financeScenarios.test.ts`: 12 tests covering a sale with a fee, a signing
  that breaks the wage cap, a sponsorship gain and loss, an overdrawn result, a missing
  balance, a missing cash flow, a burn-rate fallback, a missing wage budget, and the
  baseline-override note.
- Live at 390×844 and 1440×900 with the real KVV Zelzate save (balance −£631K, latest
  month −£120K, wages £10,604 against a £10,203 budget): selling £8,000/wk and banking
  £2.00M showed £1.37M, −£155K/mo and 8.8 months; signing £5,000/wk and paying £1.50M
  showed −£2.13M, over the cap by £5,401/wk.
- Inputs are 44px tall with 16px text, so iOS does not zoom on focus, and the four fields
  are reachable in DOM order by keyboard.
- Gates: 613 tests, `npm run verify:precache`, `npm run a11y:audit` (20 checks),
  `npm run ui:audit`, `npm run device:matrix` (6 profiles), `npm run offline:check`
  (28 checks) and `npm run smoke:e2e` (52 checks) all clean.
