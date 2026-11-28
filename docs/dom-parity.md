# Rendered layout parity gate

A refactor that is meant to change no behaviour still has to prove it. Unit
tests cover the logic that moved; this gate covers what the user sees.

```bash
npm run build
NODE_ENV=production PORT=12000 npm start       # the build being checked
npm run parity:snapshot -- --save=.agents_tmp/uploads/<save>.fm --out=/tmp/after.json
npm run parity:compare  -- /tmp/before.json /tmp/after.json
```

`parity:compare` prints either `identical: every captured section and overlay
matches` or a list of paths that differ, with the value on each side.

## What is captured

For each of the six sections the gate opens it through the real tab strip and
records the element tree under `main`, plus the header. It then opens the share
sheet, the knowledge base, the command palette and a player sheet, and records
each dialog. A node is:

- its tag
- its attributes, sorted by name, minus `style`, `src`, `srcset`, `nonce` and
  `integrity`
- its text, normalised
- its children

So class names, roles, aria labels and heading text all take part. Nothing is
selected by hand, which is the point: the comparison cannot miss a change by
looking only at the fields someone remembered to list.

## Proving the gate is worth having

Two checks, both cheap:

1. Run the snapshot twice on the same build and compare. It must say identical.
2. Change one value in a saved snapshot file and compare. It must report
   exactly that one path.

## What the normalisation removes, and why

Two builds of the same code differ in text that moves on its own. The capture
normalises, rather than ignores, the following:

| Source | Replaced with |
| --- | --- |
| decode timings, `1.4s`, `820ms` | `<time>` |
| `3 minutes ago`, `2 hours ago` | `<ago>` |
| clock times, `14:32` | `<clock>` |
| digits inside a `tabular-nums` span, such as the save receipt's seconds counter | `<n>` |

One element is skipped rather than normalised: the decode progress card
(`role="status"` with `aria-live="polite"`) and the background sync pill, which
sits next to it. They appear and disappear while a save is being read, which
adds or removes a sibling and shifts every section below them. They are live
activity, not layout, and both are covered by the smoke and offline gates
instead. The header's own sync button keeps its place in the tree but is
recorded as `data-stateful="sync"`, because it swaps its icon and label while a
sync runs.

## Comparing two builds

Keep the build before the change on a second port and point `--url` at it:

```bash
git worktree add /tmp/base HEAD
ln -s "$PWD/node_modules" /tmp/base/node_modules
(cd /tmp/base && npm run build && NODE_ENV=production PORT=12001 npm start &)
npm run parity:snapshot -- --url=http://localhost:12001 --save=<save> --out=/tmp/before.json
npm run parity:snapshot -- --url=http://localhost:12000 --save=<save> --out=/tmp/after.json
npm run parity:compare -- /tmp/before.json /tmp/after.json
```

Both runs must load the same save, so pass the same file to each.

## Rules

- Run it with the production build, never the dev server; the service worker and
  the code splitting differ.
- Run one browser gate at a time. They share Chromium on port 9222.
- A save must be present. The gate opens the app, imports the file and waits for
  the squad, so it needs a few minutes per run.
- Snapshots are not committed. Only the scripts and this document are.
