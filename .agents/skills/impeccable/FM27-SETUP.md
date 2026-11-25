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
