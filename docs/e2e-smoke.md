# End-to-end smoke test (R29)

Last updated: 26 November 2026.

`npm run smoke:e2e` drives a real Chromium through the whole path a manager
takes, using a real Football Manager 27 save. It answers one question: can a
person still get from "no data" to "a squad, an answer and a backup" without
something breaking in between.

The unit tests cover logic. This covers the wiring: the file input, the
decoder, the tab shell, the Analyst request, the download, the restore and the
reload. Those are the places where a passing test suite and a broken app can
coexist.

## Running it

```bash
npm run build
NODE_ENV=production PORT=12000 npm start      # in another terminal
npm run smoke:e2e                             # both profiles, newest save found
npm run smoke:e2e -- --profile=mobile --json
```

The save is not in the repository. The script takes the newest `.fm` file in
`.agents_tmp/uploads/`, or an explicit one:

```bash
npm run smoke:e2e -- --save=/path/to/auto_save.fm
```

Other flags: `--url` (app), `--cdp` (browser endpoint, default
`http://127.0.0.1:9222`), `--out` (artifacts, default `.playwright-mcp/r29-smoke`),
`--timeout` (how long the import may take, default 420000 ms), `--json`.

It needs Node 22 and a Chromium binary (same as `ui:audit`, `device:matrix`).
Nothing is added to `package.json` dependencies.

## What it checks

| Step | Check |
| --- | --- |
| First run | the app renders with nothing stored, and no save is claimed |
| Damaged save | a save truncated to 3 MB, as if copied mid-write, is refused with a readable message and does not half-load the app |
| Import | attaching the real `.fm` file produces a squad (29 first team from the seeded save) |
| Import | header shows the in-game date and the club |
| Import | the squad reaches stored state, so a reload will not lose it |
| Route | desktop uploads for server decode; mobile decodes on the phone and uploads nothing |
| Sections | all six sections open and render with the save (not an empty state) |
| Analyst | the composer becomes ready, accepts a message, and shows the question |
| Analyst | an answer arrives, or the app says plainly it cannot and shows the offline briefing |
| Analyst | with a canned API reply intercepted, the real answer renders in the transcript |
| Backup | the export produces a valid campaign file containing the squad |
| Restore | wiping the browser clears the save, restoring the file brings it back, a reload keeps it |
| Throughout | no uncaught page errors |

46 checks across the two profiles on the reference machine, about 40 seconds
per profile with a 242 MB save. The truncated-save step is not decoration: it
was the first thing the harness proved, and it confirmed the app's existing
"appears incomplete or still being written" message reaches the screen rather
than being swallowed.

## Two profiles, because there are two routes

| Profile | Viewport | Decode | What it proves |
| --- | --- | --- | --- |
| `desktop` | 1440×900 | server upload and native decode | the desktop route uploads, decodes server-side and hydrates |
| `mobile` | 412×915, Android UA, touch | browser Pyodide worker | the phone route decodes locally and sends no save to the server |

If the server has no `fmsave` installed, `/api/fm27/decode-status` reports it,
the app falls back to the phone decoder, and the desktop check says so instead
of failing. Install `fmsave==0.14.5` in the server's Python to exercise the
upload path locally.

## The Analyst without a model

This environment has no `GEMINI_API_KEY`, so the real endpoint answers 500. The
test uses that twice:

1. It sends a question and expects the app's offline briefing fallback, which is
   the behaviour a user on a bad network or a missing key sees.
2. It then enables CDP request interception on `/api/fm27/tactical-chat` and
   returns a canned JSON reply, so the success path is exercised too: the reply
   renders in the transcript.

The canned reply is the only simulated thing in the run. Everything else is the
real build, the real decoder and a real save file.

## Does it actually fail?

A test that cannot fail is worse than no test, so both were checked by breaking
something on purpose:

- **A save cut to 3 MB.** The run used to wait for a squad until it timed out
  and failed. That observation became a permanent check: the app must refuse the
  file with the "appears incomplete or still being written" message and must not
  half-load. The message was reaching the screen all along; the harness now
  proves it stays that way.
- **The export control relabelled in the built bundle.** Three checks failed:
  the control was not found, no file was produced, and the restore could not run.
  Before that, a missing control only skipped the steps and the run still
  reported PASS, which is the failure mode this exercise was looking for.

The same exercise showed the browser could serve a bundle from the HTTP cache
and quietly test a build that is no longer deployed. The harness now disables
the HTTP cache, drops any service worker, and reports the hashed bundle it is
actually running, so a stale build cannot masquerade as a pass.

## Not in CI

The smoke test needs two things a hosted runner does not have by default: a
real save (never committed, per `AGENTS.md`) and a Chromium binary. `.github/workflows/smoke-e2e.yml`
therefore runs it only on manual dispatch, and only when the repository has the
`FM27_REAL_SAVE_RUNNER` variable set to a self-hosted runner that holds the
saves. Pull request CI is unchanged.

## Limits

- Emulated mobile, not a physical phone. Timings describe this machine.
- The seeded run confirms one save. A second save with a different database
  layout would exercise the mapper harder.
- It covers Chromium. Safari is covered separately by `npm run device:webkit`,
  which measures layout but not this flow.
