---
name: fm27-release-check
description: Run the FM27 release gate before pushing or merging. Use when a change is ready for verification, when CI fails, or when preparing a pull request.
---

# FM27 release check

Run the full gate from the repository root:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run ui:audit
```

`npm run lint` is the TypeScript check in this repository. Run both commands as the task requires.

## Before the gate

- Run `git status` and stage only files changed for the task.
- Do not commit `.agents_tmp/`, real `.fm` saves, decoded payloads, `node_modules`, `dist`, or local caches.
- Do not change `public/fm-save-mapper.py` or a cache buster unless the task explicitly allows it.
- If the change touches save data, staff, finances or the Analyst, use `fm27-data-parity`.
- If the change touches a screen, use `fm27-ui-ux-review` and `web-design-guidelines`.

## When a check fails

1. Read the failing log, not just the red status.
2. Reproduce the failure locally.
3. Fix the cause, not the assertion, unless the assertion is proven wrong.
4. If a known timing-sensitive test fails, rerun once and record that it was flaky.
5. Do not merge while a required check is failing.

## Pull request

Include:

- What changed and why.
- The exact checks run and their result.
- Screenshots or a short recording for UI changes.
- Any partial work or excluded files.
- A short `Skills applied:` line.

Use `github` for the pull request and `github-actions` when the workflow itself needs a change.
