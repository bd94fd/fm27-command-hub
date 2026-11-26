# PWA updates and cache freshness

R20. This page records how an installed app picks up a new deploy, what was measured, and what is still unproven.

## How the update flow works today

- The service worker is built by `vite-plugin-pwa` in `prompt` mode, so a new build never swaps assets under a running session. The user accepts first.
- `src/hooks/usePwaLifecycle.ts` detects a waiting worker, shows the "New version ready" banner, and `applyUpdate` sends `SKIP_WAITING`. The page reloads on `controllerchange`.
- The shell (`index.html`) and the hashed bundles are precached, with `cleanupOutdatedCaches: true` so an old precache is dropped on activate.
- The decoder (`fm-save-worker.js`, `fm-save-mapper.py`, `fm_layout_patcher.py`) is deliberately kept out of the precache (`globIgnores`) and fetched network-first with a `?v=` cache buster, so a phone cannot keep an old decoder across a deploy when it has a network.
- `/api/*` is `NetworkOnly`, so server responses are never served from a cache.

## Freshness of the worker and the shell on the hosts

Measured 26 November 2026 with `curl -I`:

| Host | `/sw.js` | `/` and `/index.html` | decoder files |
| --- | --- | --- | --- |
| Render (Express) | `no-cache, no-store, must-revalidate` | same | same |
| Vercel (static) | `public, max-age=0, must-revalidate` | same | same |

Both hosts already revalidate, so no host configuration was needed. The Express server sets these headers from `NO_CACHE_STATIC_FILES` in `server.ts`; Vercel applies them by default.

## What R20 added

**A bounded foreground update check.** Nothing in the app asked the browser for a new version. The browser checks on navigation and on its own schedule, and that schedule is not something the app can rely on: it backs off when it finds no change, up to 24 hours. An installed app that is resumed from the background rather than reopened may therefore wait a long time for a deploy it could have had in minutes.

`src/hooks/usePwaLifecycle.ts` now calls `registration.update()` on `visibilitychange` when the document is visible, at most once per `FOREGROUND_UPDATE_CHECK_INTERVAL_MS` (30 minutes). The first foreground visit after load is skipped, because the browser already checked during that load. A clock that jumps backwards forces a check rather than suppressing one.

**A cache-buster guard.** `src/utils/decoderCacheBuster.test.ts` hashes the three decoder files against recorded values and asserts that `WORKER_CACHE_BUSTER` and `MAPPER_CACHE_BUSTER` agree. Change a decoder file without bumping the buster and the test fails with the reason.

## How it was verified

Two real builds, one browser, no reload in between:

1. Build A from the branch, served on a local static server with `cache-control: no-store`.
2. Load it, wait until the worker controls the page.
3. Build B from the same source with one visible change (`<meta name="x-build" content="B">`), then repoint the server at it.
4. Dispatch `visibilitychange` instead of navigating.
5. Expect the banner, click Refresh, expect the page to report build B and to be controlled again.

Results on the branch build:

- Banner appeared without a reload.
- Refresh loaded build B and the worker was controlling again.
- `fm-save-worker.js` still fetched with `?v=25` after the update, and the mapper body was unchanged.

Two harness traps worth remembering, because both produced false results first:

- A second build that changes only `index.html` does **not** change `sw.js`; the precache revision lives inside the worker. The second build must be a real rebuild.
- Copying a build with `cp -a` preserves modification times, so a server honouring `If-Modified-Since` answers `304` and the browser never sees the new worker. Touch the files or serve with `no-store`.

## What this does not prove

The honest limit: in this container's headless Chromium, the open page also picked up the new worker within three seconds with the new check removed and no event dispatched. Chrome re-checks service workers on its own in this situation, so R20 did not fix a reproducible Chrome failure. The new check bounds how long a stale app can survive when the browser's own schedule is slow or backed off, and it covers browsers that do not re-check while a page sits idle. That behaviour is reasoned from the spec and from Chrome's documented backoff, not measured on a phone.

Not measured at all: a real Android or iOS device, an installed PWA resumed from the home screen after days, and Chrome's backoff after repeated no-change checks.

## Re-running the check

Keep the harness out of the repo. Two builds, a `no-store` static server, and a Playwright script that swaps the served directory and dispatches `visibilitychange` are enough. Set `window.__FM27_PWA_UPDATE_INTERVAL_MS__` before load to shrink the 30-minute interval for a short test; anything that is not a non-negative finite number is ignored, so production behaviour is unchanged.
