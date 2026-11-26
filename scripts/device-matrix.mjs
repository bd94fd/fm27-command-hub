#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Device matrix for the FM27 Command Hub: the same build measured as desktop
 * Chrome, Android Chrome at two sizes, Android in landscape, an installed PWA
 * in standalone display mode, and a phone with text scaled to 200%.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run device:matrix
 *   npm run device:matrix -- --json
 *
 * Needs Node >= 22 (global WebSocket) and a Chromium binary, same as ui:audit.
 * Safari/WebKit is a separate run: see scripts/webkit-matrix.mjs.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clickTab as clickTabShared, connect, fetchJson, sleep, startBrowser } from './lib/browser.mjs';

const MIN_TAP_PX = 36;
const MIN_MOUSE_TARGET_PX = 24;
const MIN_INPUT_FONT_PX = 16;
const TABS = ['Hub & Analyst', 'Squad', 'Tactics & Corners', 'Transfers', 'Matches', 'Staff'];

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const PROFILES = [
  {
    name: 'desktop-chrome',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    note: 'Desktop Chrome',
  },
  {
    name: 'android-chrome',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    mobile: true,
    touch: true,
    userAgent: ANDROID_UA,
    note: 'Pixel 7 portrait',
  },
  {
    name: 'android-small',
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent: ANDROID_UA,
    note: 'Smallest common Android (iPhone SE class)',
  },
  {
    name: 'android-landscape',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2.625,
    mobile: true,
    touch: true,
    userAgent: ANDROID_UA,
    note: 'Phone in landscape, short viewport',
  },
  {
    name: 'pwa-standalone',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    mobile: true,
    touch: true,
    userAgent: ANDROID_UA,
    standalone: true,
    note: 'Installed PWA, no browser chrome',
  },
  {
    name: 'text-200',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent: ANDROID_UA,
    rootFontScale: 2,
    note: 'Phone with text scaled to 200% (WCAG 1.4.4)',
  },
];

function parseArgs(argv) {
  const args = { url: 'http://localhost:12000', cdp: 'http://127.0.0.1:9222', json: false, only: null, seed: null, screenshots: null };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'json') args.json = true;
    else if (key === 'only') args.only = value;
    else if (key === 'seed') args.seed = value;
    else if (key === 'screenshots') args.screenshots = value;
    else if (key in args && value !== undefined) args[key] = value;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function ensureBrowser(cdp) {
  try {
    await fetchJson(`${cdp}/json/version`);
    return () => {};
  } catch {
    return startBrowser(cdp);
  }
}

const PROBE = `(() => {
  const MIN_TAP = __MIN_TAP__;
  const MIN_FONT = ${MIN_INPUT_FONT_PX};
  const visible = (el) => {
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

  const small = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')) {
    if (!visible(el)) continue;
    const label = el.closest('label');
    const target = label && visible(label) ? label : el;
    const rect = target.getBoundingClientRect();
    if (rect.height >= MIN_TAP) continue;
    small.push({
      height: Math.round(rect.height),
      label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
    });
  }

  // iOS zooms the page when a focused input is under 16px, so this is a real defect, not a preference.
  const zoomRisk = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
    .filter((el) => visible(el) && !['checkbox', 'radio', 'file'].includes(el.type))
    .map((el) => ({
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      label: (el.getAttribute('aria-label') || el.placeholder || el.type || el.tagName).slice(0, 32),
    }))
    .filter((entry) => entry.fontSize < MIN_FONT);

  const clipped = [];
  for (const el of document.querySelectorAll('h1, h2, h3, p, span, td')) {
    if (!visible(el) || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow === 'ellipsis') continue; // truncation with an ellipsis is deliberate
    if (el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'visible') {
      clipped.push({ text: (el.textContent || '').trim().slice(0, 40), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }

  return {
    viewportWidth: window.innerWidth,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    bodyOverflowX: document.body.scrollWidth - window.innerWidth,
    smallTargets: small.slice(0, 6),
    smallCount: small.length,
    zoomRiskInputs: zoomRisk.slice(0, 6),
    clippedText: clipped.slice(0, 4),
    rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
    standalone: matchMedia('(display-mode: standalone)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
})()`;

// The bottom bar labels are short ("Hub", "Tactics"), and Matches/Staff live behind
// "More". Clicking the navigation itself, then reading back which tab rendered, is
// the only way to know the probe described the screen it claims to describe.
const STATE_KEY = 'fm27_command_hub_state_v1';

async function applyProfile(send, evaluate, profile, url, seedPayload) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: profile.viewport.width,
    height: profile.viewport.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
  });
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: Boolean(profile.touch),
    maxTouchPoints: profile.touch ? 5 : 1,
  });
  if (profile.userAgent) {
    await send('Emulation.setUserAgentOverride', { userAgent: profile.userAgent });
  }
  // CDP cannot emulate display-mode, so an installed app is simulated the only honest
  // way left: answer the two queries the app itself uses to detect it.
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.enable');
  const shimIds = [];
  if (profile.standalone) {
    const added = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (query) =>
          query.includes('display-mode: standalone')
            ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
            : real(query);
        Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
      })();`,
    });
    if (added.result?.identifier) shimIds.push(added.result.identifier);
  }
  if (seedPayload) {
    const seeded = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem(${JSON.stringify(STATE_KEY)}, ${JSON.stringify(seedPayload)}); } catch {}`,
    });
    if (seeded.result?.identifier) shimIds.push(seeded.result.identifier);
  }
  // Clears any emulation left over from an earlier run in a reused browser.
  await send('Emulation.setEmulatedMedia', { features: [] });
  // An HTTP-cached bundle would be measured instead of the current dist/.
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url });
  await sleep(1500);
  // A service worker left from an earlier build would serve stale assets, and the
  // measurement would describe code that is not in dist/.
  await evaluate(`(async () => {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((key) => caches.delete(key)));
    return true;
  })()`).catch(() => null);
  await send('Page.navigate', { url });
  await sleep(1500);
  // Fonts decide whether the header truncates, so measure after the swap, not during it.
  await evaluate(`document.fonts.ready.then(() => true)`).catch(() => null);
  await sleep(1200);
  if (profile.rootFontScale) {
    // Tailwind measures in rem, so scaling the root font is how a phone with large
    // text actually renders this UI.
    await send('Runtime.evaluate', {
      expression: `document.documentElement.style.fontSize = '${16 * profile.rootFontScale}px'`,
    });
    await sleep(500);
  }
  return { shimIds };
}

async function readPwaState(evaluate) {
  return evaluate(`(async () => {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    const link = document.querySelector('link[rel="manifest"]');
    let manifest = null;
    try { manifest = link ? await (await fetch(link.href)).json() : null; } catch { manifest = null; }
    return {
      serviceWorker: Boolean(registration),
      display: manifest?.display ?? null,
      startUrl: manifest?.start_url ?? null,
      icons: Array.isArray(manifest?.icons) ? manifest.icons.map((i) => i.sizes) : null,
      themeColor: manifest?.theme_color ?? null,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? null,
      installPromptVisible: [...document.querySelectorAll('button, [role="button"]')]
        .some((el) => /add to home screen|install/i.test(el.textContent || '')),
    };
  })()`);
}

async function run() {
  const args = parseArgs(process.argv);
  const profiles = args.only ? PROFILES.filter((p) => p.name === args.only) : PROFILES;
  if (profiles.length === 0) throw new Error(`No profile named ${args.only}`);

  if (args.screenshots) mkdirSync(args.screenshots, { recursive: true });
  const seed = args.seed ? readFileSync(args.seed, 'utf8') : null;
  if (args.seed && !seed) throw new Error(`Seed file is empty: ${args.seed}`);
  const stopBrowser = await ensureBrowser(args.cdp);
  const client = await connect(args.cdp);
  const results = [];

  try {
    await client.send('Runtime.enable');
    for (const profile of profiles) {
      const url = `${args.url}/?tab=hub&matrix=${profile.name}`;
      client.consoleErrors.length = 0;
      await client.navigate('about:blank', 200);
      const shim = await applyProfile(client.send, client.evaluate, profile, url, seed);

      const entry = { profile: profile.name, note: profile.note, seeded: Boolean(seed), tabs: [] };
      for (const label of TABS) {
        const opened = await clickTabShared(client.evaluate, sleep, label);
        await sleep(900);
        if (args.screenshots) {
          const shot = await client.send('Page.captureScreenshot', { format: 'png' });
          const name = `${profile.name}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
          if (shot.result?.data) writeFileSync(`${args.screenshots}/${name}`, Buffer.from(shot.result.data, 'base64'));
        }
        const probe = await client.evaluate(
          PROBE.replace('__MIN_TAP__', String(profile.touch ? MIN_TAP_PX : MIN_MOUSE_TARGET_PX))
        );
        entry.tabs.push({ tab: label, opened, ...probe });
      }

      entry.pwa = await readPwaState(client.evaluate);
      entry.httpErrors = [...new Set(client.httpErrors)].slice(0, 5);
      client.httpErrors.length = 0;
      for (const identifier of shim.shimIds) {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
      entry.consoleErrors = [...new Set(client.consoleErrors)].slice(0, 5);
      entry.failures = [];
      for (const tab of entry.tabs) {
        if (tab.overflowX > 0) entry.failures.push(`${tab.tab}: horizontal overflow ${tab.overflowX}px`);
        if (tab.smallCount > 0) {
          const worst = tab.smallTargets[0];
          const floor = profile.touch ? MIN_TAP_PX : MIN_MOUSE_TARGET_PX;
          entry.failures.push(`${tab.tab}: ${tab.smallCount} target(s) under ${floor}px (e.g. "${worst.label}" ${worst.height}px)`);
        }
        if (tab.zoomRiskInputs.length > 0) {
          entry.failures.push(`${tab.tab}: input under ${MIN_INPUT_FONT_PX}px zooms on focus (${tab.zoomRiskInputs[0].fontSize}px)`);
        }
        if (tab.clippedText.length > 0) {
          entry.failures.push(`${tab.tab}: clipped text "${tab.clippedText[0].text}"`);
        }
        if (!tab.opened) entry.failures.push(`${tab.tab}: tab could not be opened`);
      }
      // The install banner is pointless once the app is on the home screen.
      if (profile.standalone && entry.pwa.installPromptVisible) {
        entry.failures.push('standalone: install banner is still offered inside the installed app');
      }
      if (entry.tabs[0].standalone !== Boolean(profile.standalone)) {
        entry.failures.push(`standalone detection mismatch (app reports ${entry.tabs[0].standalone})`);
      }
      if (entry.consoleErrors.length > 0) {
        entry.failures.push(`console: ${entry.consoleErrors[0]}`);
      }
      const analystEnv = entry.httpErrors.filter((line) => /tactical-chat|\/api\/fm27\//.test(line));
      entry.unexercised = analystEnv;
      entry.httpErrors = entry.httpErrors.filter((line) => !analystEnv.includes(line));
      if (entry.httpErrors.length > 0) entry.failures.push(`http: ${entry.httpErrors[0]}`);
      results.push(entry);
    }
  } finally {
    client.close();
    if (stopBrowser) stopBrowser();
  }

  if (args.json) {
    console.log(JSON.stringify({ profiles: results }, null, 2));
  } else {
    for (const entry of results) {
      const status = entry.failures.length === 0 ? 'PASS' : 'FAIL';
      const overflow = Math.max(...entry.tabs.map((tab) => tab.overflowX));
      const smallest = Math.min(...entry.tabs.map((tab) => tab.smallCount));
      console.log(
        `${status} ${entry.profile.padEnd(18)} (${entry.note}${entry.seeded ? ', loaded save' : ''}) ` +
          `overflow=${overflow}px smallTargets=${smallest === 0 ? 0 : 'see below'} ` +
          `root=${entry.tabs[0].rootFontSize}px standalone=${entry.tabs[0].standalone}`
      );
      if (entry.unexercised?.length > 0) {
        console.log(`     ~ Analyst API not exercised here (no GEMINI_API_KEY in this environment)`);
      }
      for (const failure of entry.failures) console.log(`     - ${failure}`);
    }
    const failed = results.filter((entry) => entry.failures.length > 0);
    console.log(
      failed.length === 0
        ? `PASS: ${results.length} profiles clean`
        : `FAIL: ${failed.length} of ${results.length} profiles have findings`
    );
    process.exitCode = failed.length === 0 ? 0 : 1;
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
