# Decode stage profiling (R14)

Date: 26 November 2026
Status: profiled in a mobile Chromium proxy; physical Android and installed-PWA confirmation still required

R14 splits the save load into upload, native decode, JSON transfer, hydration and render, then splits the decoder into its own stages. It does not optimise anything. The goal is to show where the wait actually is.

## Environment

| Item | Value |
| --- | --- |
| Host | Linux container, headless Chromium from `/usr/bin/chromium` |
| Device profile | Playwright Pixel 7 emulation (412 × 915 CSS px, touch, Android user agent) |
| Server | Local Hub on `http://localhost:3000` |
| Decoder | Python 3.13.15 + `fmsave` 0.14.5 |
| Network | Loopback |
| Saves | `auto_save.fm` 252.3 MB, `last_save_overwrite_backup.fm` 251.2 MB, `auto_save_v03_.fm` 242.0 MB |
| Mode | Full Sync, one cold import and one warm reload per save |

This is the same proxy as the R05 baseline, not a physical Android or installed-PWA run.

## Whole-load stages

All values are milliseconds from the start of the import.

| Save | Upload | Decode | Transfer | Hydrate | Render | First useful screen | Full ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `auto_save.fm` | 4,333 | 21,737 | 12 | 65 | 47 | 16,480 | 26,640 |
| `last_save_overwrite_backup.fm` | 4,290 | 21,713 | 5 | 49 | 50 | 16,432 | 26,610 |
| `auto_save_v03_.fm` | 4,284 | 55,421 | 6 | 49 | 46 | 16,419 | 60,240 |

- Decode dominates by a wide margin. Transfer, hydration and render together are under 130 ms.
- The interim checkpoint still gives Squad, Staff and Tactics at about 16.4 s on all three saves.
- The slow save spends an extra 33.7 s in decode. That is the only real target.

## Decoder stages

These are the timings the Python decoder records itself. The table shows the largest stages.

| Stage | `auto_save.fm` | `last_save_overwrite_backup.fm` | `auto_save_v03_.fm` |
| --- | ---: | ---: | ---: |
| Open save | 3,834 | 3,879 | 3,851 |
| Players & attributes | 4,986 | 4,958 | 4,880 |
| Fixtures & results | 5,247 | 5,297 | 4,779 |
| League table | 240 | 232 | **7,411** |
| Staff | 1,019 | 993 | 993 |
| Season stats | 939 | 947 | 856 |
| Player season history | 508 | 518 | 474 |
| Market scan | 497 | 495 | 505 |
| Team match stats | 459 | 486 | 447 |
| All other stages | 716 | 693 | 712 |
| Decoder total | 18,445 | 18,498 | 24,908 |

The slow save's league-table read is 7.4 s instead of about 0.24 s. That explains 7.2 s of its extra time, but not the full 33.7 s.

## The missing time is layout auto-trial

The server process runs longer than the decoder's own stage timer:

| Save | Server job total | Decoder measured | Difference |
| --- | ---: | ---: | ---: |
| `auto_save.fm` | 21,157 | 18,445 | 2,712 |
| `last_save_overwrite_backup.fm` | 20,906 | 18,498 | 2,408 |
| `auto_save_v03_.fm` | 54,938 | 24,908 | **30,030** |

A direct decoder run on the slow save isolates the cause:

| Run | Wall time | Decoder total |
| --- | ---: | ---: |
| No auto-layout trial | 25.2 s | 24,763 ms |
| With `--auto-try-layout` | **51.7 s** | 24,641 ms |
| Hub server decode | 54.9 s | 24,908 ms |

`--auto-try-layout` is on for the Hub's native decode. On the FM27 27.0.1 save it tries both the 27.0 and 27.1 layouts, then keeps the 27.0 base. That trial costs about **27 s** and is not inside the decoder's `stepTimingsMs`. The 27.1 saves do not pay it.

Conclusion: the slow save is not a JSON, transfer or React problem. The Hub is paying for a second full layout attempt on an older build.

## Next step

R14 is measurement only, so it does not change the decode path. The next decode optimisation should:

1. Cache the chosen layout per save fingerprint or build so the same save does not repeat the trial.
2. Skip the second layout when the first pass is fully clean, or when the build is already mapped to a known base.
3. Re-run this profile before and after the change.

## Reproduce

Start a local server with a Python that has `fmsave` installed, then run:

```bash
npm run bench:save-load -- \
  --url http://localhost:3000 \
  --save .agents_tmp/uploads/auto_save.fm \
  --save .agents_tmp/uploads/last_save_overwrite_backup.fm \
  --save .agents_tmp/uploads/auto_save_v03_.fm \
  --mode mobile --warm --server-pid <server-pid> \
  --out .agents_tmp/benchmarks/save-load-r14-mobile.json

npm run profile:decode -- \
  --benchmark .agents_tmp/benchmarks/save-load-r14-mobile.json \
  --decoded-dir .agents_tmp/decoded \
  --out .agents_tmp/benchmarks/decode-stage-profile.json
```

The benchmark and profile JSON stay local and are not committed. They contain timings, sizes and counts only, never player or save content.
