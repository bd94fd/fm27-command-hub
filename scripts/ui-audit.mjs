#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI audit for the FM27 Command Hub: touch-target sizes and horizontal
 * overflow, measured in a real browser against the production build.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run ui:audit
 *
 * Needs Node >= 22 (global WebSocket) and a Chromium binary. When no DevTools
 * endpoint answers on --cdp, the script launches its own headless browser.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIN_TAP_PX = 36;
const TABS = [
  'Hub & Analyst',
  'Squad',
  'Tactics & Corners',
  'Transfers',
  'Matches',
  'Staff',
];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, mobile: true, enforceTargets: true },
  { name: 'desktop', width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, enforceTargets: false },
];

function parseArgs(argv) {
  const args = { url: 'http://localhost:12000', cdp: 'http://127.0.0.1:9222', seed: null, json: false };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'json') args.json = true;
    else if (key in args && value !== undefined) args[key] = value;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function ensureBrowser(cdp) {
  try {
    await fetchJson(`${cdp}/json/version`);
    return null;
  } catch {
    // No endpoint yet: start our own.
  }

  const port = new URL(cdp).port || '9222';
  const binary = process.env.CHROME_BIN || 'chromium';
  const profile = mkdtempSync(join(tmpdir(), 'fm27-ui-audit-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try {
      await fetchJson(`${cdp}/json/version`);
      return () => {
        child.kill();
        try {
          rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {
          // Chromium may still be flushing the profile; a stray temp dir is harmless.
        }
      };
    } catch {
      // still booting
    }
  }
  child.kill();
  throw new Error(`Could not start ${binary} on ${cdp}. Set CHROME_BIN or pass --cdp.`);
}

async function connect(cdp) {
  const targets = await fetchJson(`${cdp}/json/list`);
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target available in the browser');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const details = response.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description || 'evaluate failed');
    return response.result?.result?.value;
  };

  return { send, evaluate, close: () => ws.close() };
}

// Runs in the page: one pass over the visible viewport.
const PROBE = `(() => {
  const MIN = ${MIN_TAP_PX};
  const small = [];
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.top > window.innerHeight || rect.bottom < 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    // Visually-hidden skip links and screen-reader text are not tappable.
    if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clip === 'rect(0, 0, 0, 0)') return false;
    if (rect.width <= 1 && rect.height <= 1 && style.position === 'absolute') return false;
    return true;
  };

  for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')) {
    if (!isVisible(el)) continue;
    // A checkbox wrapped in a label is tapped through the label.
    const label = el.closest('label');
    const target = label && isVisible(label) ? label : el;
    const rect = target.getBoundingClientRect();
    if (rect.height >= MIN) continue;
    small.push({
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 48),
    });
  }

  return JSON.stringify({
    viewportWidth: window.innerWidth,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    smallTargets: small,
  });
})()`;

async function clickTab(evaluate, label) {
  const clicked = await evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const button = [...document.querySelectorAll('button')]
      .find((b) => isVisible(b) && b.textContent.trim().startsWith(wanted));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (clicked) return true;

  // Narrow layouts keep secondary tabs behind the "More" sheet.
  const opened = await evaluate(`(() => {
    const more = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More');
    if (!more) return false;
    more.click();
    return true;
  })()`);
  if (!opened) return false;
  await sleep(600);
  return evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(wanted));
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function measureDock(evaluate) {
  return evaluate(`(() => {
    const dock = [...document.querySelectorAll('div')]
      .find((d) => /Compare Tray/i.test(d.textContent || '') && getComputedStyle(d).position === 'fixed');
    if (!dock) return JSON.stringify({ found: false });
    const nav = [...document.querySelectorAll('div, nav')]
      .filter((n) => getComputedStyle(n).position === 'fixed')
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.height > 40 && r.bottom >= window.innerHeight - 2 && r.width > 300)
      .pop();
    const rect = dock.getBoundingClientRect();
    return JSON.stringify({
      found: true,
      gapAboveNav: nav ? Math.round(nav.top - rect.bottom) : null,
      leftInset: Math.round(rect.left),
      rightInset: Math.round(window.innerWidth - rect.right),
      height: Math.round(rect.height),
    });
  })()`);
}

async function main() {
  const args = parseArgs(process.argv);
  const seed = args.seed ? readFileSync(args.seed, 'utf8') : null;
  const stopBrowser = await ensureBrowser(args.cdp);
  const { send, evaluate, close } = await connect(args.cdp);

  const report = { url: args.url, viewports: {}, dock: null, violations: [] };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    for (const viewport of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.mobile,
      });
      await send('Page.navigate', { url: args.url });
      await sleep(1500);

      // A stale service worker would audit the previous build.
      await evaluate(`(async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {}
        ${seed ? `localStorage.setItem('fm27_command_hub_state_v1', ${JSON.stringify(seed)});` : ''}
        return true;
      })()`);
      await send('Page.reload', { ignoreCache: true });
      await sleep(2500);

      const tabs = {};
      for (const tab of TABS) {
        if (!(await clickTab(evaluate, tab))) {
          tabs[tab] = { error: 'tab button not found' };
          report.violations.push(`${viewport.name}/${tab}: tab button not found`);
          continue;
        }
        await sleep(1500);
        const result = JSON.parse(await evaluate(PROBE));
        tabs[tab] = result;
        if (result.overflowX > 0) {
          report.violations.push(`${viewport.name}/${tab}: horizontal overflow ${result.overflowX}px`);
        }
        if (viewport.enforceTargets && result.smallTargets.length > 0) {
          report.violations.push(
            `${viewport.name}/${tab}: ${result.smallTargets.length} target(s) under ${MIN_TAP_PX}px`
          );
        }
      }
      report.viewports[viewport.name] = tabs;
    }

    if (seed) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await sleep(500);
      await clickTab(evaluate, 'Squad');
      await sleep(1500);
      const toggled = await evaluate(`(() => {
        const toggle = [...document.querySelectorAll('button')]
          .find((b) => (b.getAttribute('aria-label') || '').includes('compare tray'));
        if (!toggle) return false;
        toggle.click();
        return true;
      })()`);
      if (toggled) {
        await sleep(1000);
        report.dock = JSON.parse(await measureDock(evaluate));
        if (report.dock.found && report.dock.gapAboveNav !== null && report.dock.gapAboveNav < 0) {
          report.violations.push(`mobile/dock: overlaps bottom nav by ${-report.dock.gapAboveNav}px`);
        }
      } else {
        report.dock = { found: false, reason: 'no compare toggle on the squad list' };
      }
    }

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const [name, tabs] of Object.entries(report.viewports)) {
        const enforced = VIEWPORTS.find((v) => v.name === name)?.enforceTargets;
        console.log(`\n${name}${enforced ? '' : ' (pointer layout, target sizes informational)'}`);
        for (const [tab, result] of Object.entries(tabs)) {
          if (result.error) {
            console.log(`  ${tab.padEnd(18)} ${result.error}`);
            continue;
          }
          const targets = result.smallTargets.length
            ? `  <-- ${result.smallTargets.map((t) => `${t.height}px ${t.label}`).join(', ')}`
            : '';
          console.log(
            `  ${tab.padEnd(18)} overflowX=${String(result.overflowX).padStart(3)}px  under${MIN_TAP_PX}px=${result.smallTargets.length}${targets}`
          );
        }
      }
      if (report.dock) {
        console.log(
          report.dock.found
            ? `\ndock: ${report.dock.gapAboveNav}px above bottom nav, insets ${report.dock.leftInset}/${report.dock.rightInset}px`
            : `\ndock: skipped (${report.dock.reason})`
        );
      }
      console.log(
        report.violations.length
          ? `\nFAIL (${report.violations.length})\n${report.violations.map((v) => `  - ${v}`).join('\n')}`
          : `\nPASS: no overflow and no touch targets under ${MIN_TAP_PX}px`
      );
    }
  } finally {
    close();
    stopBrowser?.();
  }

  process.exit(report.violations.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
