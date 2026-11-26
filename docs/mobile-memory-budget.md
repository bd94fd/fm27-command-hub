# Mobile memory budget and large-save fallback (R17)

Date: 26 November 2026
Status: guardrails added and unit-tested; physical Android confirmation remains

## The constraint

The deployment is declared as Render's free plan (`render.yaml`), while the local benchmark measured the server process tree peaking at about 1.2–1.3 GB during a 252 MB save decode. A 512 MB host therefore cannot reliably decode the largest saves. When the host kills the Python child, the Hub already returns a 507 and switches to the local browser decoder.

That fallback is the risk this change addresses: a phone asked to start a Full Sync browser decode after the server ran out of memory is likely to run out of memory too.

## Existing limits (audited)

| Layer | Limit | Effect |
| --- | --- | --- |
| Upload chunk | 2 MB | Small peak buffer; 4 parallel chunks on desktop, 1 on mobile. |
| Browser worker buffer | 64 MB | Above this, an ArrayBuffer is refused; the file-picker WORKERFS path is zero-copy. |
| Server upload | 1 GB | Rejected before upload. |
| Pending uploads | 2 GB | Caps concurrent upload sessions. |
| Server stdout | 100 MB | Guards against a runaway payload. |
| Concurrent native decodes | 1 | Prevents two Python decoders competing for the same memory host. |

## Change

- New pure helper `src/utils/saveMemoryBudget.ts` classifies a large save (200 MB or more), a low-memory device (under 4 GB reported) and the fallback sync mode.
- A browser fallback keeps Full Sync whenever the device has enough memory. Only a large save on a device that reports under 4 GB is upgraded to Fast Sync.
- A phone that reports enough memory keeps Full Sync. A real 242 MB save completed in Full Sync on a phone in 162 seconds without crashing.
- The fallback progress label names the chosen mode, and the server/client out-of-memory copy no longer claims a fixed 512 MB tier.

## Verification

- Unit tests cover the large-save threshold, low-memory detection, adequate-memory Full Sync, low-memory Fast Sync, small saves and explicit Fast Sync.
- TypeScript, lint, the full unit suite, build and the UI audit pass.
- The existing 252 MB repeat-import test exercised the native path, not the browser fallback. No tab crash or OOM was seen.

## Still needed

- Force a 507 on a physical Android Chrome session with a real 250–265 MB save and confirm the fallback starts in Fast Sync and completes without a tab crash.
- Repeat the same run in the installed PWA with a dropped connection.
- Only tune chunk size or worker memory further if those runs show a specific bottleneck. The current 2 MB / 1-way mobile upload is already the memory-safe choice.
