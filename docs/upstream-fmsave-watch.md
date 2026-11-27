# Upstream fmsave watch

The Hub pins the `fmsave` decoder in three places:

- `Dockerfile`: native server decode.
- `public/fm-save-worker.js`: browser Pyodide decode.
- `.github/workflows/ci.yml`: real-save regression runner.

Run this before and during each roadmap item:

```bash
npm run check:fmsave
```

It prints the pinned versions, asks PyPI for the latest release and says whether the Hub is behind. CI also runs it as an informational step, so a new release is visible on every pull request without blocking unrelated work.

When a release is relevant:

1. Read the upstream release notes.
2. Bump the three pins together.
3. Decode one real save with the old and new version and compare player, staff, warnings and extraction-manifest output.
4. Run `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run ui:audit`.
5. Update `docs/save-compatibility-matrix.md` with the tested fmsave version.

## 25 November 2026

- `fmsave 0.14.5` released.
- Fix: overflow when Pyodide reads season statistics from large saves.
- Hub pins moved from `0.14.4` to `0.14.5`.
- Verified against `auto_save_v03_.fm` (242 MB, FM27 27.0.1): same player UIDs, staff UIDs, warnings and extraction manifest as `0.14.4`. Decode time was 24.5 s in both runs.

## 27 November 2026

- `fmsave 0.14.6` released: fills blank tactic role labels for Advanced Playmaker and Channel Forward in possession, and Central Midfielder, Pressing Central Midfielder and Winger out of possession.
- Hub pins stay at `0.14.5`. The Hub's own role tables name all five of those roles, and the mapper prefers them, so the release changes nothing the app shows.
- Do not bump yet. Applying `public/fm_layout_patcher.py` against `0.14.6` raises `UnsupportedGameError: multiple SponsorChainLayout layouts fit the build and schema information for 'game_db'`, so the patcher needs a review against 0.14.6 before the pin moves.
- `0.14.6` still fails on the user's two FM27 builds, 27.0.1+2503222 and 27.1.0+2505117: `tactics()`, `selections()` and `set_pieces()` raise the `tactics_man` set-piece marker error, and `squad_planner()` raises the `humans` lead error. Both are what the patcher repairs.
- Widening `fm27_27_0_0.TACTICS.taker_markers` from three values to `(b, 5, 2)` for `b` in 1–63, with nothing else patched, makes all three tactic readers succeed on both saves: 15 tactics, 11 selections, 102 set pieces.
- Two bug reports are written and ready in `docs/upstream-fmsave-reports/`, with the trimmed `validate` output and no save file. They are not posted: the workspace credential can only write to this repository.
