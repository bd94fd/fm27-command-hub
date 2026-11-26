# FM27 save compatibility matrix

R11 records which FM27 patches and save formats the Hub can trust, which fields changed, and what happens with a save outside the matrix.

The code is `src/utils/fm27SaveCompatibility.ts`. The Hub Data tab and the Analyst prompt both use `resolveSaveCompatibility`, so they cannot disagree about a save.

## Matrix

| Build family | Status | Layout | Tested fmsave versions | Fields that changed |
| --- | --- | --- | --- | --- |
| FM27 27.1.x (`27.1.0`, `27.1.0+2505117`) | Verified | 27.1 | 0.14.1 – 0.14.4 | Staff Preferred Jobs (`job_ratings`), staff secondary job, sponsorship `dates_reordered`, ClubTable 5-byte finance tail, tactics set-piece markers |
| FM27 27.0.x (`27.0`, `27.0.1`) | Supported | 27.0 | 0.14.0 | ClubTable 0-byte finance tail, no staff Preferred Jobs, older tactics set-piece layout |
| FM27 27.2.x (`27.2.0+2506012`) | Untested | 27.1 inherited | 0.14.4 | Layout inherited from 27.1; dynamic build registration |
| Any other build | Unsupported | none | unknown | none trusted |

## What happens by status

- Verified: the known 27.1 layout is used. The Hub expects the 27.1 fields above to decode.
- Supported: the save uses the 27.0 layout. The Hub decodes it, but 27.1-only fields can be absent.
- Untested: the import continues with the closest 27.x layout. The Hub and the Analyst say so, and the user should check fallback or unavailable sections before trusting edge-case fields.
- Unsupported: this is not a recognised FM27 27.x save. The Hub does not trust any FM27 field from it. Import a save from a supported 27.0 or 27.1 build.

A build that reports `isFm27: false` or a non-FM27 game name is always unsupported, even if its version string looks like 27.x.

## Where the user sees it

- Hub → Data Quality sub-tab → Save Compatibility panel.
- Analyst prompt → `=== SAVE COMPATIBILITY ===` block.

The panel shows the detected build, fmsave version, layout base, status, changed fields, the current behavior message, and the full known-build list. The Analyst block carries the same status, fields and behavior sentence.

## Adding a build

1. Import a real save from the new build.
2. Record the build string, fmsave version, detected layout base, and each section's status.
3. Compare the changed fields with the table.
4. Add a row to `FM27_SAVE_COMPATIBILITY_MATRIX` and the doc table.
5. Add a test in `src/utils/fm27SaveCompatibility.test.ts` for the new status and message.
6. Run `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run ui:audit`.
