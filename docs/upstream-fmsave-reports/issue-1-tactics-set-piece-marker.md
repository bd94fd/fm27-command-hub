This issue was written by an AI agent (OpenHands) on behalf of the maintainer of a save-analysis app that wraps fmsave. Every value below was produced by running fmsave 0.14.6 against two real saves, and the maintainer reviewed the text before it was posted.

### No save files or personal details

- [x] I have not posted a save file or a link to one, and removed personal details

### What went wrong

Reading two real FM27 saves with fmsave 0.14.6, `tactics()`, `selections()` and `set_pieces()` all raise:

```
ReaderCheckError: <save>: section 'tactics_man': a block's set-piece marker is not where fmsave expects it, so the save layout differs from what fmsave expects.
```

Minimal reproduction:

```python
import fmsave
save = fmsave.open(path, strict=False)
save.tactics()        # ReaderCheckError
save.selections()     # ReaderCheckError
save.set_pieces()     # ReaderCheckError
```

Both saves hit it:

| Save | Build | tactics() | selections() | set_pieces() |
| --- | --- | --- | --- | --- |
| A | 27.0.1+2503222 (unverified) | failed | failed | failed |
| B | 27.1.0+2505117 (unverified) | failed | failed | failed |

Other readers on the same saves work: `staff()` returns 56,224 rows, `finances()` 14,102 rows, `players()` 162,554 rows, `fixtures()` 121,012 rows, `league_tables()` 508 rows. Only the three tactics readers fail, plus `squad_planner()`, which I am reporting separately.

### What I expected

`tactics()` to return the club's tactic rows. Both careers have an assigned tactic with roles set in and out of possession, so the data is present in the save.

### fmsave version

0.14.6

### Python version

3.13.15

### Operating system

Linux

### Game build

- Save A: 27.0.1+2503222 (unverified build, partial coverage)
- Save B: 27.1.0+2505117 (unverified build, partial coverage)

### fmsave validate output

Trimmed to the build fields, the two section schemas and the four failing readers. Field statuses, experimental counts and all player, staff and club records are withheld because they are the user's game data.

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

`fm27_27_0_0.TACTICS.taker_markers` accepts three 3-byte markers:

```python
('080502', '090502', '0a0502')
```

In the `tactics_man` section of these saves, the 3-byte `XX 05 02` sequences are mostly other leading bytes. Counts from save A's section (5.5 MB):

| Marker | Occurrences |
| --- | --- |
| `3d 05 02` | 5,822 |
| `1b 05 02` | 4,740 |
| `1a 05 02` | 2,893 |
| `03 05 02` | 1,766 |
| `19 05 02` | 563 |

Changing only `taker_markers` makes all three readers succeed on both saves, with nothing else patched:

```python
from dataclasses import replace
from fmsave._layouts import fm27_27_0_0 as m

patched = replace(m.TACTICS, taker_markers=tuple(bytes((b, 5, 2)) for b in range(1, 64)))
m.TACTICS = patched
m.LAYOUTS = tuple(
    LayoutEntry(e.region, e.schema, e.build, patched) if e.region == "tactics_man" else e
    for e in m.LAYOUTS
)
```

Results on save A:

| Reader | Before | After |
| --- | --- | --- |
| `tactics()` | ReaderCheckError | 15 rows |
| `selections()` | ReaderCheckError | 11 rows |
| `set_pieces()` | ReaderCheckError | 102 rows |

Save B gives the same three results. So the block layout after the marker still matches on these builds; only the marker's first byte differs from the three values fmsave expects.

Caveat: I have not tested whether accepting all 63 first bytes can mis-anchor on other saves. A narrower set taken from real builds would be safer than the full range; the range is what proves the marker is the only mismatch.

If it helps, the maintainer can email a private link to a save rather than posting one here.
