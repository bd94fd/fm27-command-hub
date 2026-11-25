---
name: fm27-data-parity
description: Enforce one source of truth between the FM27 UI tabs and the Hub & Analyst prompt context. Use when touching the .fm decoder, hydrators, selectors, match scope, contracts, Meta/Best Fit scoring, or anything the Analyst is told about the save.
triggers:
- /data-parity
- /codereview
---

# FM27 Data Parity

The user sees numbers on screen and then asks the Analyst about the same club. If the
prompt is built by a second, parallel calculation, the Analyst will contradict the UI.
Every rule below exists to prevent that.

## 1. Single Source of Truth

The Hub & Analyst context/prompt builder must consume the exact same TypeScript
selectors and calculators as the UI — the ones backing `Hub & Analyst`, `Squad`,
`Tactics & Corners`, `Transfers`, `Matches` and `Staff`.

Never recompute any of these inside a prompt builder:

- Meta current/potential rating (`metaScoreEngine`)
- Best Fit % and role suitability (`fm27Roles.json` driven matchers)
- Star ratings (ability/potential to stars)
- Weekly staff payroll and wage totals (`staffRatings`, `clubFinances`)
- Contract expiry dates and derived contract status
- Match stats and per-90 aggregates (`matchScopeHelpers`, `seasonInsights`)

If a value is only needed for the prompt, extract it into a selector in `src/utils/`
and call that selector from both the component and the context builder. A prompt that
formats a value differently from the UI is the same bug as a wrong value.

## 2. Competitive vs. Friendly Separation

Pre-season friendlies must be excluded from competitive season stats identically in
both the UI cards and the Analyst context, unless the figure is explicitly labelled as
friendly-only. One shared scope helper decides this; a filter written inline in either
place is a defect.

## 3. No Invented Defaults

Missing or undecodable `.fm` fields must surface explicitly as `N/A` or `--` in both the
UI and the Analyst payload. Never zero them out, never substitute a plausible-looking
placeholder, never drop the row. A silent `0` wage or a fabricated expiry date is worse
than an honest gap because the Analyst will reason on it as fact.

## 4. Lockstep Decoder Contract

Any field change in the Python `fmsave` decoder (`public/fm-save-mapper.py`) must land
in the same change as:

1. `tests/python/` fixtures and expectations
2. strict TypeScript types and the hydrator (`src/utils/fmSaveHydrator.ts`)
3. the UI selectors that read the field
4. the Analyst context builder that reports it

A decoder field with no hydrator, or a hydrator field no selector reads, is an
incomplete change — not a follow-up.

## Reviewing against this skill

When asked to `/data-parity` or during `/codereview`:

1. Trace one value end to end: decoder → hydrator → selector → UI → Analyst context.
2. Report every mismatch with `file:line` on both sides, plus the user-visible
   consequence ("Analyst says 14 players, Squad shows 15").
3. Separate confirmed divergences from suspicious duplication that happens to agree
   today — the latter still violates rule 1 and will drift.
4. Audits are read-only unless the request also asks for fixes.

## Known divergences

`references/data-parity-audit-2026-11-25.md` lists the divergences found in the current
codebase (duplicate wage formatters, three squad counts, duplicated squad tables in the
prompt, staff payroll gap, friendly-inclusive PPG, placeholder drift, invented defaults).
Read it before re-deriving the same findings, and update it when a listed item is fixed.
