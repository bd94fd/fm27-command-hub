# Impeccable in FM27

Source: https://github.com/pbakaus/impeccable
Licence: Apache-2.0
Pinned skill: v4.11.0
Pinned engine: 0.1.30

## What is safe to use

Start with `critique`, `audit`, `polish`, `layout`, `adapt`, `onboard` and `optimize`. Use them on one screen or component at a time. Pair them with `fm27-ui-ux-review` and `fm27-data-parity`.

## Safety rules

- The launcher downloads a self-contained engine to `~/.impeccable/bin/` and checks its SHA-256 against `scripts/engine-checksums.txt`. Do not bypass that check with `IMPECCABLE_BIN` unless the user approves a specific binary.
- Do not run `live` mode. Its Apply path can start an agent with approvals and sandboxing off.
- Do not run the installer hook automatically. Do not let it change other tools' configuration without explicit approval.
- Do not commit `.impeccable/` screenshots, caches or runtime state.
- Run `scripts/impeccable engine-probe` after an update. It must print `impeccable-engine 0.1.30`.
- If the skill is updated, review the diff before replacing this folder.

## First run in this repository

1. Read `SKILL.md`.
2. Run `scripts/impeccable context` only after `PRODUCT.md` and `DESIGN.md` exist, or accept that it will ask for context.
3. Prefer `critique` or `audit` on a single screen. Do not run `init` or `document` without approval; they write project files.
4. Report findings as P0 to P3 with the file or screen, the evidence and the fix.

## Current check

```bash
.agents/skills/impeccable/scripts/impeccable engine-probe
```

Expected: `impeccable-engine 0.1.30`.

## Trial result: 25 November 2026

Tested on the loaded KVV Zelzate save, Staff and Hub screens.

| Screen | Viewport | Findings | Main signal |
| --- | --- | ---: | --- |
| Staff | 390x844 | 135 | 125 undersized UI labels, mostly 9px card labels repeated 40 times. |
| Staff | 1440x900 | 106 | 64 undersized UI labels and 37 tiny body labels. |
| Hub | 390x844 | 12 | Low contrast, nested cards and flat type hierarchy. |

The detector found real problems:

- Staff cards use 9px labels for "Dept Role Rating", "Weekly Wage" and the department tag. That is too small on a phone.
- The Staff search placeholder is 4.2:1, below the 4.5:1 target.
- Hub has a 4.2:1 and a 3.7:1 contrast finding.
- Both screens have nested cards.

The detector is noisy on repeated cards. It reports the same rule once per card. Use `--json` and group by rule and snippet before acting. Do not use the raw count as a CI gate yet.

Verdict: useful for targeted screen audits and before/after checks. Use it for R25, R26 and the Staff overhaul. Do not run it as a blocking gate until the repeated findings are fixed or configured.
