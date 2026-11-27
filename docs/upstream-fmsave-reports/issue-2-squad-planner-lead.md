This issue was written by an AI agent (OpenHands) on behalf of the maintainer of a save-analysis app that wraps fmsave. Every value below was produced by running fmsave 0.14.6 against two real saves, and the maintainer reviewed the text before it was posted.

### No save files or personal details

- [x] I have not posted a save file or a link to one, and removed personal details

### What went wrong

`squad_planner()` raises on both of my FM27 saves with fmsave 0.14.6:

```
ReaderCheckError: <save>: section 'humans': no squad planner lead was found, so the save layout differs from what fmsave expects.
```

```python
import fmsave
save = fmsave.open(path, strict=False)
save.squad_planner()   # ReaderCheckError
```

Builds affected: 27.0.1+2503222 and 27.1.0+2505117, both unverified. `validate --json` reports the layout resolution as region `humans`, borrowed build 27.0.0+2486695, schema 24, save schema 24, so the schema matches and only the lead bytes are missed.

The other readers on the same saves are fine: `staff()` returns 56,224 rows, `finances()` 14,102 rows, `players()` 162,554 rows, `managed_clubs()` 1 row, `league_tables()` 508 rows, `fixtures()` 121,012 rows. `player_match_stats()` fails a completeness gate of its own, which looks unrelated.

### What I expected

`squad_planner()` to return the club's planner slot rows. The game's squad planner screen is in active use in both careers, with players assigned to the eleven positions and the role slots.

### fmsave version

0.14.6

### Python version

3.13.15

### Operating system

Linux

### Game build

- 27.0.1+2503222 (unverified build, partial coverage)
- 27.1.0+2505117 (unverified build, partial coverage)

### fmsave validate output

Trimmed to the build fields, the two section schemas and the failing readers. Field statuses, experimental counts and all player, staff and club records are withheld because they are the user's game data.

```json
{
  "fmsave_version": "0.14.6",
  "python_version": "3.13.15",
  "os": "Linux",
  "game": "FM27",
  "build": "27.0.1+2503222",
  "known_build": false,
  "section_schemas": {
    "humans": 24,
    "tactics_man": 26
  },
  "readers": [
    {
      "reader": "tactics",
      "status": "failed",
      "record_count": null,
      "gates": [],
      "coverage": {},
      "anomalies": {}
    },
    {
      "reader": "set_pieces",
      "status": "failed",
      "record_count": null,
      "gates": [],
      "coverage": {},
      "anomalies": {}
    },
    {
      "reader": "selections",
      "status": "failed",
      "record_count": null,
      "gates": [],
      "coverage": {},
      "anomalies": {}
    },
    {
      "reader": "squad_planner",
      "status": "failed",
      "record_count": null,
      "gates": [],
      "coverage": {},
      "anomalies": {},
      "layout": {
        "region": "humans",
        "build": "27.0.0+2486695",
        "schema": 24,
        "save_schema": 24
      },
      "reason": "no squad planner lead was found"
    }
  ],
  "_note": "Trimmed: field_statuses, experimental_counts and all player, staff and club records withheld because they contain personal game data."
}
```

### What looks like the cause

The layout expects the planner lead at the start of the block, `01 00 6c 07` followed by `40 00 00 02`. In these saves the scouting dates sit in front of it, so the lead is `48 00 01 02` then `0f 2d 07 64`, and 27 bytes later the same `01 02 00 04` plus group marker `03 1b`.

Anchoring on `0f 2d 07 64` and checking that the bytes 27 positions later equal the expected lead tail plus group marker recovers the block: it yields 81 `SquadPlannerSlot` rows on save A, which is the full set of planner slots this layout defines. A date decode 12 bytes before the anchor is a further check that the hit is real.

I have not worked out whether the scouting-date prefix is fixed length for these builds or variable, so I have not attempted a patch. Reporting it in case the pattern is enough to add a build entry for 27.0.1+2503222 and 27.1.0+2505117.

If it helps, the maintainer can email a private link to a save rather than posting one here.
