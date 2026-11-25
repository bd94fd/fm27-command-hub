---
name: fm27-save-safety
description: Protect FM27 save data during backup, restore, fixture and re-sync work. Use when touching save history, IndexedDB, localStorage, export/import, cache clearing, or importing the same save again.
---

# FM27 save safety

Use this skill with `fm27-data-parity` before changing any save persistence or re-sync flow.

## Non-negotiable rules

- Never commit a real `.fm` save or decoded payload. The current fixtures live in `.agents_tmp/uploads/` and stay local.
- Do not edit `public/fm-save-mapper.py` or any cache buster unless the task explicitly allows it.
- Do not clear user storage in a test without proving the backup path first.
- If a check loses or changes data, stop and report the exact step.

## Backup and restore check

1. Load a real save from `.agents_tmp/uploads/`.
2. Export or snapshot the app state through the same path a user would use.
3. Clear the relevant browser storage or start a clean profile.
4. Restore the export and reload the app.
5. Check squad, staff, finances, matches, shortlists, targets, snapshots and save history.
6. Compare counts and key totals before and after. Record the result.

## Re-sync check

1. Import the same save twice.
2. Import an older save after a newer save.
3. Import a save with missing optional fields.
4. Confirm the app does not duplicate players or staff, lose history, or overwrite newer values with older ones.
5. Confirm the Analyst sees the same values as the UI after each import.

## Evidence to report

- Save name and size.
- Browser and viewport.
- Storage path used.
- What was restored.
- What matched and what did not.
- Any data that was lost, duplicated or made stale.
