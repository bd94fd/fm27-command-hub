# Dependency security

What Dependabot reports, why some alerts stay open, and what would let us close them.

## Open alerts: glob and minimatch

Two moderate advisories reach us through one build-only chain:

```
vite-plugin-pwa 2.0.0  (devDependency)
└── workbox-build 7.4.1
    └── glob 11.1.0
        └── minimatch 10.2.6
```

| Advisory | Package | Affected | Patched in |
| --- | --- | --- | --- |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) — AbortSignal cancellation bypass allows post-timeout filesystem traversal | `glob` | 9.0.0 – 14.0.1 | 14.0.2 |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) — denial of service via globparts amplification | `minimatch` | 7.0.0 – 11.0.0 | 11.0.1 |

Both are transitive, both are `moderate`, and neither ships to a browser: `vite-plugin-pwa`, `workbox-build`, `glob` and `minimatch` are build-time only and none of them appear in `dist/` or `sw.js`.

## Why they are not patched yet

- `vite-plugin-pwa@2.0.0` is the newest release and depends on `workbox-build@^7.4.1`; `workbox-build@7.4.1` is also the newest release and pins `glob@^11.0.1`.
- The `glob` fix only exists in 14.0.2, which is `"type": "module"` and ESM-only. Forcing it under a CommonJS consumer like `workbox-build` breaks the build.
- The `minimatch` fix (11.0.1) is outside `glob@11`'s own range (`^10.1.1`). Forcing it was tested and rejected: with `overrides: { "glob": { "minimatch": "^11.0.1" } }` the build still succeeded but the service worker precached **0 files instead of 102**, with only a warning ("One of the glob patterns doesn't match any files"). minimatch 11 no longer expands the `**/*.{js,css,html,svg,png,woff2,json}` brace pattern the way glob 11 expects. Offline support would have died silently.
- Dependabot's own suggested "fix" is to downgrade `vite-plugin-pwa` to 1.1.0. That is a major downgrade of a working plugin and does not help: every `glob` from 9.0.0 to 14.0.1 is affected, so the older `workbox-build` line is vulnerable too. The Dependabot update jobs for these two packages fail with `dependency_still_vulnerable`, which is expected.

Practical exposure is close to zero. Both advisories need attacker-controlled glob patterns and timeouts; every pattern we pass is a literal in `vite.config.ts`, and no user input reaches the build.

## The guard we added instead

`npm run verify:precache` reads `dist/sw.js` and fails when the precache list is empty, short, missing `index.html`, or missing any JS bundle. CI runs it straight after `npm run build`, so a future dependency change that quietly empties the precache turns the build red instead of shipping.

## When to revisit

- `workbox-build` starts depending on `glob@^14` (likely workbox 8), or
- we replace `vite-plugin-pwa` with our own service worker.

Then run `npm audit`, bump, and confirm `npm run verify:precache` still reports about 100 files.

Do not add `ignore` rules for `glob` or `minimatch` in `dependabot.yml`: that would also suppress the security PR when a real fix lands.
