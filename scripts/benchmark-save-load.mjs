#!/usr/bin/env node
/**
 * Real save-load benchmark for FM27 Command Hub.
 *
 * Drives the app through a real .fm import, then reads the local-only timing
 * marks exposed on window.__FM27_SAVE_LOAD_BENCHMARKS__. It never reads save
 * contents or player data, and it writes results only to the local output path.
 *
 * Usage:
 *   node scripts/benchmark-save-load.mjs \
 *     --url http://localhost:12000 \
 *     --save .agents_tmp/uploads/auto_save.fm \
 *     --mode mobile --warm \
 *     --out .agents_tmp/benchmarks/save-load-baseline.json
 *
 * Playwright is resolved from the project, then from the bundled playwright
 * skill. The benchmark requires a running Hub server with native fmsave for the
 * server-decode path; otherwise the app falls back to browser Pyodide.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    url: process.env.BENCH_URL || 'http://localhost:12000',
    saves: [],
    mode: 'mobile',
    warm: false,
    out: null,
    serverPid: process.env.BENCH_SERVER_PID ? Number(process.env.BENCH_SERVER_PID) : null,
    timeoutMs: 10 * 60 * 1000,
    headless: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--save') args.saves.push(argv[++i]);
    else if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--warm') args.warm = true;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--server-pid') args.serverPid = Number(argv[++i]);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (arg === '--headed') args.headless = false;
    else if (arg === '--help' || arg === '-h') {
      console.log('See the header of scripts/benchmark-save-load.mjs for usage.');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.saves.length === 0) {
    throw new Error('At least one --save path is required.');
  }
  return args;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const bundled = path.join(
      repoRoot,
      '.agents/skills/playwright-skill/node_modules/playwright/index.js'
    );
    const mod = await import(pathToFileURL(bundled).href);
    return mod.chromium ? mod : mod.default;
  }
}

async function readServerRssBytes(pid) {
  if (!pid) return null;
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,rss=']);
    const rows = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([rowPid, rowPpid, rss]) => rowPid && rowPpid >= 0 && rss >= 0);
    const byPid = new Map(rows.map(([rowPid, rowPpid, rss]) => [rowPid, { ppid: rowPpid, rss }]));
    const included = new Set([pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [rowPid, row] of byPid) {
        if (!included.has(rowPid) && included.has(row.ppid)) {
          included.add(rowPid);
          changed = true;
        }
      }
    }
    let totalKb = 0;
    for (const rowPid of included) {
      totalKb += byPid.get(rowPid)?.rss ?? 0;
    }
    return totalKb > 0 ? totalKb * 1024 : null;
  } catch {
    return null;
  }
}

function metricValue(metrics, name) {
  return metrics.find((metric) => metric.name === name)?.value ?? null;
}

async function sampleMemory(cdp, page, serverPid, state) {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const heap = metricValue(metrics, 'JSHeapUsedSize');
    if (typeof heap === 'number') {
      state.peakJsHeapBytes = Math.max(state.peakJsHeapBytes, heap);
    }
    const nodes = metricValue(metrics, 'Nodes');
    if (typeof nodes === 'number') {
      state.peakDomNodes = Math.max(state.peakDomNodes, nodes);
    }
  } catch {
    // CDP can close while the page navigates; the next sample retries.
  }

  try {
    const used = await page.evaluate(
      () => (performance.memory ? performance.memory.usedJSHeapSize : null)
    );
    if (typeof used === 'number') {
      state.peakJsHeapBytes = Math.max(state.peakJsHeapBytes, used);
    }
  } catch {
    // Page may be mid-navigation.
  }

  const rss = await readServerRssBytes(serverPid);
  if (rss) state.peakServerRssBytes = Math.max(state.peakServerRssBytes, rss);
}

function startMemorySampler(cdp, page, serverPid) {
  const state = {
    peakJsHeapBytes: 0,
    peakDomNodes: 0,
    peakServerRssBytes: 0,
  };
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void sampleMemory(cdp, page, serverPid, state).finally(() => {
      running = false;
    });
  }, 250);
  return {
    state,
    stop() {
      clearInterval(timer);
    },
  };
}

async function readBenchmarkRecord(page) {
  return page.evaluate(() => {
    const list = window.__FM27_SAVE_LOAD_BENCHMARKS__;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[list.length - 1];
  });
}

async function waitForCompletedBenchmark(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const list = window.__FM27_SAVE_LOAD_BENCHMARKS__;
      return (
        Array.isArray(list) &&
        list.some((record) => record && record.completedAtIso)
      );
    },
    undefined,
    { timeout: timeoutMs, polling: 500 }
  );
  return readBenchmarkRecord(page);
}

async function readSquadCount(page) {
  const labels = await page.locator('button').allInnerTexts().catch(() => []);
  const squadLabel = labels.find((label) => /^Squad \(\d+\)/.test(label)) || '';
  return Number((squadLabel.match(/\((\d+)\)/) || [])[1] || 0);
}

async function readPwaState(page) {
  return page.evaluate(async () => {
    const controlled = Boolean(navigator.serviceWorker?.controller);
    let ready = false;
    try {
      const registration = navigator.serviceWorker?.ready;
      ready = registration
        ? Boolean(
            await Promise.race([
              registration.then(() => true),
              new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
            ])
          )
        : false;
    } catch {
      ready = false;
    }
    return {
      serviceWorkerControlled: controlled,
      serviceWorkerReady: ready,
      standaloneDisplayMode: window.matchMedia('(display-mode: standalone)').matches,
    };
  });
}

async function measureWarmReload(page, timeoutMs) {
  const startedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const labels = Array.from(document.querySelectorAll('button')).map((button) =>
        (button.textContent || '').trim()
      );
      return labels.some((label) => /^Squad \(\d+\)/.test(label));
    },
    undefined,
    { timeout: timeoutMs, polling: 250 }
  );
  return {
    warmReloadMs: Date.now() - startedAt,
    squadCount: await readSquadCount(page),
  };
}

async function runOneSave({ browser, devices, args, savePath }) {
  const context = await browser.newContext(
    args.mode === 'mobile'
      ? {
          ...devices['Pixel 7'],
          locale: 'en-GB',
          timezoneId: 'Europe/London',
        }
      : { viewport: { width: 1440, height: 900 }, locale: 'en-GB' }
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.locator('#welcome-fm-upload').waitFor({ state: 'attached' });
  const pwaBefore = await readPwaState(page);
  const serverRssBeforeBytes = await readServerRssBytes(args.serverPid);

  const sampler = startMemorySampler(cdp, page, args.serverPid);
  const startedAt = Date.now();
  await page.locator('#welcome-fm-upload').setInputFiles(savePath);
  const benchmark = await waitForCompletedBenchmark(page, args.timeoutMs);
  const coldWallMs = Date.now() - startedAt;
  const squadCount = await readSquadCount(page);
  await sampleMemory(cdp, page, args.serverPid, sampler.state);
  sampler.stop();

  let warm = null;
  if (args.warm) {
    const warmSampler = startMemorySampler(cdp, page, args.serverPid);
    warm = await measureWarmReload(page, args.timeoutMs);
    await sampleMemory(cdp, page, args.serverPid, warmSampler.state);
    warm.peakJsHeapBytes = warmSampler.state.peakJsHeapBytes;
    warm.peakDomNodes = warmSampler.state.peakDomNodes;
    warm.peakServerRssBytes = warmSampler.state.peakServerRssBytes;
    warmSampler.stop();
  }

  const pwaAfter = await readPwaState(page);
  await context.close();

  return {
    save: path.basename(savePath),
    savePath,
    saveSizeBytes: (await fs.stat(savePath)).size,
    mode: args.mode,
    cold: {
      wallMs: coldWallMs,
      squadCount,
      marksMs: benchmark?.marksMs ?? {},
      detailMs: benchmark?.detailMs ?? {},
      completedAtIso: benchmark?.completedAtIso ?? null,
      failed: Boolean(benchmark?.marksMs?.failed !== undefined),
      peakJsHeapBytes: sampler.state.peakJsHeapBytes,
      peakDomNodes: sampler.state.peakDomNodes,
      peakServerRssBytes: sampler.state.peakServerRssBytes,
      serverRssBeforeBytes,
    },
    warm,
    pwa: { before: pwaBefore, after: pwaAfter },
    errors: errors.slice(0, 20),
  };
}

function formatMs(value) {
  return typeof value === 'number' ? `${(value / 1000).toFixed(2)}s` : '—';
}

function formatMb(value) {
  return typeof value === 'number' && value > 0 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : '—';
}

function printSummary(results) {
  console.log('\nSave-load benchmark');
  console.log('===================');
  for (const result of results) {
    const marks = result.cold.marksMs;
    console.log(`\n${result.save} (${formatMb(result.saveSizeBytes)}) · ${result.mode}`);
    console.log(
      `  cold: wall ${formatMs(result.cold.wallMs)} | upload ${formatMs(marks.upload_complete)} | decode ${formatMs(marks.decode_complete)} | hydrate ${formatMs(marks.hydrate_complete)} | first useful ${formatMs(marks.first_useful_screen)} | full ${formatMs(marks.full_tab_ready)}`
    );
    console.log(
      `  peak: JS heap ${formatMb(result.cold.peakJsHeapBytes)} | DOM ${result.cold.peakDomNodes} nodes | server RSS ${formatMb(result.cold.peakServerRssBytes)}`
    );
    if (result.warm) {
      console.log(
        `  warm reload: ${formatMs(result.warm.warmReloadMs)} | peak JS heap ${formatMb(result.warm.peakJsHeapBytes)} | squad ${result.warm.squadCount}`
      );
    }
    if (Object.keys(result.cold.detailMs ?? {}).length > 0) {
      console.log(`  server detail: ${JSON.stringify(result.cold.detailMs)}`);
    }
    if (result.cold.failed) console.log('  result: FAILED (see marksMs.failed)');
    if (result.errors.length > 0) console.log(`  errors: ${result.errors.join(' | ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium, devices } = await loadPlaywright();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
  const browser = await chromium.launch({
    headless: args.headless,
    executablePath,
  });

  const results = [];
  try {
    for (const save of args.saves) {
      const savePath = path.resolve(save);
      await fs.access(savePath);
      console.log(`Running ${path.basename(savePath)} (${args.mode})…`);
      results.push(await runOneSave({ browser, devices, args, savePath }));
    }
  } finally {
    await browser.close();
  }

  printSummary(results);

  if (args.out) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(
      outPath,
      `${JSON.stringify({ generatedAtIso: new Date().toISOString(), args, results }, null, 2)}\n`
    );
    console.log(`\nWrote ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
