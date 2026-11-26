# Save data quality dashboard

Roadmap: R09

The Hub shows a data-quality report for the live save. The same report is sent to the Analyst, so the user and the chat see the same gaps.

## Where it appears

- Mobile: Hub → **Data Quality** sub-tab.
- Desktop: the panel sits in the Hub column, below Club Finances.
- The panel is built from `hydratedFmSave.decodedPayload`, so it updates after every import.

## What it shows

| Area | Checks |
| --- | --- |
| Squad | Player wages, ages, contracts, positions, attributes and market values. |
| Staff | Staff roles, wages, contracts, preferred-job affinity and secondary jobs. |
| Matches | Match dates, opponents and xG. |
| Recruitment | Target wages and target values. |
| Sections | League table, club finances, monthly finances, tactics, sponsorships, recruitment targets and upcoming fixtures. |
| Reader notes | Decoder warnings and extraction warnings. |

The completeness score uses the blocking checks only. Optional gaps, such as market values or secondary jobs, are listed in the expanded details and do not lower the score.

Field coverage comes from the R07 manifest. It counts decoder and decoder-optional fields as supplied, partial, missing or empty. Derived, guessed, unused and stale fields are excluded from the percentage so the number reflects decoder output, not app-side fallbacks.

## Analyst alignment

`formatSaveDataQualityForAnalyst` turns the same report into a compact prompt block:

- completeness and field coverage
- missing sections
- the first eight blocking gaps
- up to five reader warnings
- an instruction never to invent a missing value

The block contains counts and field labels only. It does not include player names, staff names or other values from the save.

## Tests

`src/utils/saveDataQuality.test.ts` covers missing wages, ages, contracts, staff roles and sections; the Analyst block; a complete save that scores 100; and the Hub surface wiring.

## Related

- R07 decoder field coverage: `docs/decoder-field-coverage.md`
- R04 data parity contract: `docs/data-parity-contract-map.md`
- R08 schema validation: `src/utils/fmSaveValidation.ts`
