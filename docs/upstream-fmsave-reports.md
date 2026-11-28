# Upstream fmsave reports, ready to post

Two failures in `fmsave 0.14.6` are reproducible on the user's real saves and are the same two the Hub's runtime patcher works around. Both reports are written, checked against the upstream issue template and stored here. Neither has been posted: the GitHub credential in this workspace can only write to this repository, so creating an issue on `rhiever/fmsave` returns `403 Resource not accessible by integration`.

| Report | What it covers | Upstream error |
| --- | --- | --- |
| `issue-1-tactics-set-piece-marker.md` | `tactics()`, `selections()` and `set_pieces()` fail on FM27 27.0.1+2503222 and 27.1.0+2505117. Includes the one-line `taker_markers` change that makes all three read, and the counts that prove the marker is the only mismatch. | `section 'tactics_man': a block's set-piece marker is not where fmsave expects it` |
| `issue-2-squad-planner-lead.md` | `squad_planner()` fails on the same two builds. Includes the lead-byte pattern and the anchor that recovers 81 planner rows. | `section 'humans': no squad planner lead was found` |

## How they were produced

Run against `fmsave 0.14.6` in a clean virtual environment, with the three real saves in `.agents_tmp/uploads/`. Nothing was patched for the "before" numbers; the "after" numbers come from changing only `taker_markers`.

```
python3 -m venv /tmp/fmsave146
/tmp/fmsave146/bin/pip install fmsave==0.14.6
/tmp/fmsave146/bin/fmsave info SAVE
/tmp/fmsave146/bin/fmsave validate SAVE --json
```

Results, `fmsave 0.14.6`, no patches:

| Save | Build | `tactics()` | `selections()` | `set_pieces()` | `squad_planner()` |
| --- | --- | --- | --- | --- | --- |
| A | 27.0.1+2503222 | failed | failed | failed | failed |
| B | 27.1.0+2505117 | failed | failed | failed | failed |
| C | 27.1.0+2505117 | ok, 0 rows | not checked | not checked | not checked |

Everything else on save A reads: 162,554 players, 56,224 staff, 14,102 finance rows, 508 league table rows, 121,012 fixtures.

## To post them

Checked again on 2026-11-27. The credential in this workspace is a GitHub App token installed only on `bd94fd/fm27-command-hub`, so issue creation on `rhiever/fmsave` returns `403 Resource not accessible by integration`, with or without labels. The two git credential-helper tokens return `401`. There is no duplicate upstream: the nearest open reports are #122 (tactics slot roles) and #114 (team match stats on 27.1).

Upstream takes reports through issue forms and sets `blank_issues_enabled: false`. A pre-filled `?title=&body=` link therefore cannot carry these reports: the form replaces the body with its own fields, and the reports would have to be pasted in by hand, field by field.

That leaves one route that keeps the work in this workspace: a fine-grained personal access token with `Issues: read and write` on `rhiever/fmsave`, added as a secret. With it, the two commands below post both reports unchanged:

```bash
gh issue create --repo rhiever/fmsave \
  --title "FM27 27.0.1+2503222 and 27.1.0+2505117: tactics(), selections() and set_pieces() fail with 'set-piece marker is not where fmsave expects it'" \
  --body-file docs/upstream-fmsave-reports/issue-1-tactics-set-piece-marker.md --label bug

gh issue create --repo rhiever/fmsave \
  --title "FM27 27.0.1+2503222 and 27.1.0+2505117: squad_planner() fails with 'no squad planner lead was found'" \
  --body-file docs/upstream-fmsave-reports/issue-2-squad-planner-lead.md --label bug
```

The reports contain no save file, no club or person names, and a trimmed `validate` output: build fields, the two section schemas and the failing readers only. Field statuses, counts of player, staff and club records, and every row of game data are withheld.

## What must not be posted

The `.fm` files themselves. Upstream asks for a private email link instead, and that is the user's decision to make, not something to attach to a public issue.

## Side effect worth knowing

The same run shows that the Hub's own runtime patcher (`public/fm_layout_patcher.py`) does not yet work against `fmsave 0.14.6`: applying it and then reading a save raises `UnsupportedGameError: multiple SponsorChainLayout layouts fit the build and schema information for 'game_db'`. So a version bump is not a drop-in: the patcher has to be re-checked against 0.14.6 first. That is a reason to leave the pin at 0.14.5 until the patcher is reviewed, not a reason to skip the upstream reports.
