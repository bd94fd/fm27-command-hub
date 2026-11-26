# Security and privacy review

Where a save file can go, what the server keeps, and what is still open. Roadmap item R32.

Last reviewed: 26 November 2026.

## The short version

The save never leaves the device unless the person using the app chooses the server route. When it does, the server writes it to the system temp directory, decodes it, and deletes it. Nothing is written to the repository, the bundle, or a database.

Two real defects were found and fixed:

1. The server could require an access token, but no part of the app ever sent one. Turning the token on locked the owner out of their own app, so the control was unusable. The app now asks for the token once on a device and keeps it in that browser.
2. The production server sent no Content-Security-Policy. It now sends a strict one, verified by the offline, smoke and accessibility gates.

## What leaves the device, and when

| Path | What is sent | Where it goes | When |
| --- | --- | --- | --- |
| Phone decode (default on mobile) | Nothing | Nowhere | Always |
| Server decode (opt-in) | The whole `.fm` file, in 2 MB chunks | This app's own server | Only when the server route is chosen |
| AI Analyst | About 18,000 characters of save-derived context, plus the question and any screenshot | Google Gemini, through this server | Only when a question is asked |
| Error reports | Small, redacted summary: scope, route, status, size bucket | This app's own server log | Only on a failure |
| Usage analytics | Nothing. There is no analytics library. | Nowhere | Never |

The Analyst is the only third party that sees save-derived text. That is inherent to asking a cloud model a question about the save, and it is bounded by the 18,000-character context cap in `server/config.ts`.

## Upload retention

The server decodes on disk rather than in memory so a 250 MB save does not double in RAM. The cost is that a save exists on the server for a short time, so the lifetime is explicit:

| Item | Where | Lifetime |
| --- | --- | --- |
| Uploaded `.fm` chunks | `os.tmpdir()/fm27-save-<uuid>.fm` | 15 minutes without activity |
| Decoded output | `os.tmpdir()/fm27-out-<uuid>.json` | 10 minutes after the job is read |
| Checkpoints | `os.tmpdir()/fm27-cp-<uuid>.json` | With the job |

Cleanup runs on three triggers: a sweep every 60 seconds, a sweep at startup for anything left by a crash, and a graceful shutdown that deletes every pending upload and job. The sweep only touches files matching those three name patterns, so it cannot delete another process's files. `server/fmDecodeStress.test.ts` proves the files are gone after a job completes and that an aged orphan is swept.

The temp directory is the container's own filesystem. On Render that is ephemeral and is discarded when the instance restarts. Nothing is written to a database, a bucket, or the repository.

## Access control

The server reads an optional `HUB_ACCESS_TOKEN`. When it is set, these endpoints require it:

- `POST /api/fm27/tactical-chat`
- `POST /api/fm27/match-debrief`
- `POST /api/fm27/journey-report`
- `POST /api/fm27/analyze-screenshot`
- `POST /api/fm27/client-error`
- every `/api/fm27/decode-save/*` route (init, chunk, status, finish, job read, delete)

Two endpoints stay open by design: `/api/health`, which Render polls as a health check, and `/api/fm27/decode-status`, which only reports whether server decoding is available. Neither touches a save.

Until this change the token was unusable, because the browser never sent it. `src/utils/hubAuth.ts` now attaches it to every API request and, on a 401, asks for it once, stores it in that browser's `localStorage`, and retries the request. The token is never built into the bundle. A refused prompt returns the 401 to the caller rather than looping, background error reports never open a dialog, and a request whose body is a stream is not replayed because it cannot be sent twice.

Verified live against a token-protected server: the Analyst request returned 401, the prompt appeared, the token was stored, the retry reached the handler (500 from the missing Gemini key in this environment, not 401), and a reload afterwards sent the token with no second prompt.

**Still open:** the token is off unless it is set. Without it, anyone with the URL can spend Gemini quota through the Analyst. Setting `HUB_ACCESS_TOKEN` on the host is the fix; the app now supports it.

## Logs and error reports

The server logs three kinds of line: startup and shutdown messages, and structured error events. It never logs a request body, a prompt, a save payload, or an API key. Client error reports are reduced to an allowlist of keys (scope, route, tab, status, size bucket and similar) and re-redacted on the server before they are logged, so a report cannot carry a player name even if one is injected into it. `server/errorReporting.test.ts` covers both directions.

Uploaded file names are not logged. A file name can contain a manager's name, so this matters.

## Content-Security-Policy

The production server now sends:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
worker-src 'self' blob:; child-src 'self' blob:;
connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
media-src 'self'; manifest-src 'self'; object-src 'none'; frame-src 'none';
frame-ancestors 'self'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

`'wasm-unsafe-eval'` is required because the phone decoder compiles WebAssembly. `cdn.jsdelivr.net` serves Pyodide and `pypi.org` / `files.pythonhosted.org` serve the fmsave wheel that micropip installs on first use. The first version of this policy left PyPI out and every on-device decode failed; the offline gate caught it, which is why the gate is part of this change and not an optional extra.

Development is left alone: the Vite dev server injects inline scripts and needs a websocket, so the policy is only sent when `NODE_ENV=production`.

Evidence that the policy does not break the app, all against the production build with the policy enforced and the real 242 MB save:

- `npm run offline:check` — 28 checks clean, including a full decode on the phone with no signal
- `npm run smoke:e2e` — 51 checks clean across desktop and mobile
- `npm run a11y:audit -- --save=…` — 43 checks clean

Live headers on the Render deployment, checked with `curl`: HSTS with a one-year max-age, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `x-frame-options: SAMEORIGIN`, `cross-origin-resource-policy: same-origin`, and no `x-powered-by`.

## Other leak surfaces checked

- No `dangerouslySetInnerHTML`, no `innerHTML` assignment, no `insertAdjacentHTML` anywhere in `src/` or `public/`. Save-derived strings reach the page only as React text, which escapes them.
- No source maps in `dist/`. A production build contains no `.map` files and no `sourcesContent`.
- No `VITE_*` secret is read by the client. The Gemini key is server-only, and `server/config.ts` never falls back to a client-exposed variable.
- `.gitignore` covers `*.fm`, `exports/`, `*.bak`, `*_backup*.json`, `.agents_tmp/` and `dist/`, so a real save or a backup export cannot be committed by accident.
- Backup exports are created in the browser and saved to the device. They are not uploaded.
- The service worker caches the app shell and the Pyodide runtime, not the save. Save data lives in IndexedDB and stays in the browser profile, protected by the device, not by the app.
- `express.json` accepts up to 100 MB because large saves are uploaded in chunks; the chunk route itself is capped at 8 MB per request.

## Still open, stated plainly

| Item | Risk | Why it is not fixed here |
| --- | --- | --- |
| `HUB_ACCESS_TOKEN` is off by default | Anyone with the URL can use the Analyst and spend quota | A default token would lock out the owner; it needs to be set on the host, which is a one-line change |
| CSP allows PyPI and jsDelivr in `connect-src` | If an XSS ever existed, these hosts would be usable as an exfiltration channel | The phone decoder needs both; vendoring the fmsave wheel and Pyodide into the app would remove them |
| Vercel preview deployments send no CSP | Preview builds are less protected than Render | Previews are not the live app; adding headers there needs its own verification pass |
| An uploaded save sits in `/tmp` for up to 15 minutes | Someone with shell access to the host could read it | The host is single-tenant; shortening the TTL risks breaking slow mobile uploads |
| Analyst context goes to Google | Up to 18,000 characters of save-derived text per question | Inherent to using a cloud model; the local briefing path avoids it entirely |
| Two moderate `glob` / `minimatch` advisories | Build-time only, not shipped | Documented with evidence in `docs/dependency-security.md` |

## How to re-run this review

```
npm test                      # includes the token, policy and error-report tests
npm run build && npm run verify:precache
npm run offline:check -- --save=<newest .fm>     # proves the CSP does not break the decoder
npm run smoke:e2e
npm run a11y:audit -- --save=<newest .fm>
curl -sSI https://fm27-command-hub.onrender.com/ | grep -i "content-security\|strict-transport\|referrer"
```
