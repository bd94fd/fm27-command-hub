# Save-load benchmark baseline

Date: 26 November 2026
Roadmap: R05
Status: baseline recorded; real-device confirmation still required

This is the first repeatable measurement of what a user waits for after dropping a real `.fm` save into the Hub. It records upload, decode, transfer, hydration, first useful screen, full tab ready, and memory. It does not change the decode path or claim an optimisation.

## What was measured

The benchmark drives the real app in a mobile-sized Chromium context:

1. Open the Hub with a clean browser profile.
2. Drop a 242–252 MB `.fm` save into the normal import input.
3. Read the local-only stage marks exposed on `window.__FM27_SAVE_LOAD_BENCHMARKS__`.
4. Reload once in the same profile to measure the warm, service-worker-backed path.
5. Sample the browser JS heap, DOM node count, and the Hub server process tree RSS every 250 ms.

The stage definitions are:

| Stage | Meaning |
| --- | --- |
| `upload` | File picker to the last upload byte. |
| `decode` | Server decode job start to the decoded payload arriving in the browser. |
| `transfer` | The final decode-status JSON response transfer. This is a small part of decode, not the raw save upload. |
| `first useful screen` | The interim checkpoint has been applied and Squad, Staff, and Tactics are usable. Fixtures and season stats may still be finishing. |
| `hydrate` | The final payload has been turned into app state. |
| `full tab ready` | The final state has painted twice after hydration. |

## Environment and limits

| Item | Value |
| --- | --- |
| Host | Linux container, headless Chromium launched from `/usr/bin/chromium` |
| Device profile | Playwright Pixel 7 emulation (412 × 915 CSS px, touch, Android user agent) |
| Server decode | Native Python 3.13.15 + `fmsave` 0.14.4, local loopback |
| Network | Loopback. Upload speed is not a mobile-network result. |
| PWA | Service-worker-controlled warm reload. `display-mode: standalone` was false, so this is **not** a true installed-PWA test. |
| Memory | Browser JS heap from CDP; server RSS is the Node + Python child process tree. Neither is total device memory. |
| Save contents | No save or player data is sent to telemetry. The benchmark only records timings and sizes. |

The target devices from the performance skill are Android Chrome and an installed PWA. This baseline is a reproducible proxy, not a substitute. A physical Android run is still required before treating these numbers as a user-facing guarantee.

## Results

All three saves were imported with the default Full Sync path. Each row is one cold import followed by one warm reload in the same profile.

| Save | Size | Cold wall | Upload | Decode | First useful | Full ready | Warm reload | Peak JS heap | Peak DOM | Peak server tree RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `auto_save.fm` | 252.3 MB | 24.58 s | 2.58 s | 24.28 s | 14.67 s | 24.43 s | 0.12 s | 49.3 MB | 1,611 | 1,195 MB |
| `last_save_overwrite_backup.fm` | 251.2 MB | 23.27 s | 2.48 s | 22.99 s | 14.58 s | 23.17 s | 0.12 s | 50.6 MB | 2,002 | 1,193 MB |
| `auto_save_v03_.fm` | 242.0 MB | 57.08 s | 2.39 s | 56.59 s | 14.49 s | 56.76 s | 0.11 s | 50.6 MB | 1,647 | 1,287 MB |

### What the numbers say

- **Decode dominates.** Upload is 2.4–2.6 s on loopback. Decode is 23–57 s and is effectively the whole cold load.
- **The interim checkpoint is doing its job.** Users get Squad, Staff, and Tactics at roughly 14.5–14.7 s on all three saves, before fixtures and season stats finish.
- **One save is much slower.** `auto_save_v03_.fm` takes about 2.4× longer to decode than the other two even though it is slightly smaller. This is the first thing to profile in R14. The likely candidates are more seasons of history, more fixtures, or a larger shortlist/recruitment payload, but the baseline does not prove which.
- **Warm reload is cheap.** Once the service worker and persisted state are present, the Hub reaches a populated Squad tab in about 0.11–0.12 s in this environment. This is not a cold app launch and not an installed-PWA launch.
- **No tab crash or OOM in these runs.** Server process-tree RSS peaks around 1.2–1.3 GB while decoding. That is below the 2 GB pending-upload allowance but well above a 512 MB container budget, so the deployment memory limit remains a real constraint.

### Known noise

The app auto-dispatches a first-sync Analyst request after import. In this environment no Gemini key is configured, so `/api/fm27/tactical-chat` returns HTTP 500 after the load path has already completed. The benchmark records the response but excludes it from the load stages. It is not a save-load failure.

## Reproduce

Start the Hub with native `fmsave` available, then run:

```bash
npm run bench:save-load -- \
  --url http://localhost:12000 \
  --save .agents_tmp/uploads/auto_save.fm \
  --save .agents_tmp/uploads/last_save_overwrite_backup.fm \
  --save .agents_tmp/uploads/auto_save_v03_.fm \
  --mode mobile \
  --warm \
  --server-pid <node-server-pid> \
  --out .agents_tmp/benchmarks/save-load-baseline-mobile.json
```

The script resolves Playwright from the project first, then from `.agents/skills/playwright-skill`. If that skill has no `node_modules`, run `npm ci` in `.agents/skills/playwright-skill` once. It writes only to the local `--out` path. The raw JSON from this run is in `.agents_tmp/benchmarks/save-load-baseline-mobile.json` and is intentionally not committed.

## Next step

R14 is complete: see `docs/decode-stage-profiling.md`. The slow save's extra time is the native decoder's `--auto-try-layout` trial, which costs about 27 s outside the decoder's own stage timers. Transfer, hydration and render are negligible. R15 is complete too: a repeat import of the same file hits a content-fingerprint cache in about 1 s instead of decoding again; see `docs/save-cache-fingerprint.md`. R17 should confirm the memory ceiling on the real deployment target and on a physical Android device. R05 itself is a baseline only.
