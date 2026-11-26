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
