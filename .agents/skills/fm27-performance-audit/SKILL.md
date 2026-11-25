---
name: fm27-performance-audit
description: Measure FM27 save-load speed and mobile memory on Android Chrome and the installed PWA. Use for decode, upload, hydration, render, bundle, cache and performance-budget work.
---

# FM27 performance audit

Android Chrome and the installed PWA come first. Desktop is a second target.

## Benchmark set

Use the three local saves in `.agents_tmp/uploads/`:

- `auto_save.fm` at 264.5 MB, the latest save.
- `last_save_overwrite_backup.fm` at 263.4 MB.
- `auto_save_v03_.fm` at 253.8 MB.

These are the current sizes. Do not assume compression. Add a compressed set only when the user can provide one.

## What to measure

Record a separate number for each stage:

1. Upload time.
2. Server decode time, or browser Pyodide decode time.
3. JSON transfer time.
4. Hydration time.
5. First useful screen.
6. Full tab ready.
7. Peak memory and whether the tab or worker crashed.
8. Warm reload time from cache.

Test cold and warm loads. Record the device, Android version, Chrome version, network and whether the app is installed.

## Tools

- Use `qa-changes` for real browser flows.
- Use `playwright-skill` for repeatable Android-sized browser runs.
- Use Lighthouse CLI or the `web-quality-audit` skill for page quality and load evidence.
- Run `npm run build` and `npm run ui:audit` before drawing conclusions from the production bundle.
- Use the existing decode progress and cache paths before proposing a new cache.

## Rules

- Do not invent numbers. If a stage cannot be measured, say so.
- Keep the raw results next to the save name and device.
- Do not edit cache busters or `public/fm-save-mapper.py` unless the task explicitly allows it.
- Treat a crash, OOM or tab reload as a failure, even if the decode eventually finishes.
- Compare changes against the same save and device. Do not compare a phone run with a desktop run.

## Report format

| Stage | Cold | Warm | Notes |
| --- | ---: | ---: | --- |
| Upload | | | |
| Decode | | | |
| Transfer | | | |
| Hydrate | | | |
| First useful screen | | | |
| Full tab ready | | | |
| Peak memory | | | |

Add one line for the device, save and build version. State what improved, what regressed and what remains unknown.
