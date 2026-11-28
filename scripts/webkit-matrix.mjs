#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WebKit half of the device matrix: the same build measured in Safari, which is
 * the engine every iPhone and iPad uses. Chromium cannot stand in for it, and no
 * amount of Android testing tells you what happens in Safari.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run device:webkit                       # needs Playwright + WebKit browsers
 *   npm run device:webkit -- --seed=<state.json>
 *
 * Playwright is deliberately not a dependency of this project: it exists for this
 * one check, and forcing every install and CI run to download a second engine is
 * not a good trade. Install it on demand:
 *
 *   npx playwright install --with-deps webkit
 *
 * Exit code 1 means the engine found a defect, which is the point of running it.
 */

import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

const MIN_TAP_PX_PHONE = 36;
const MIN_TAP_PX_TABLET = 32;
const MIN_INPUT_FONT_PX = 16;
const TABS = ['Hub & Analyst', 'Squad', 'Tactics & Corners', 'Transfers', 'Matches', 'Staff'];

const PROFILES = [
  {
    name: 'iphone-safari',
    note: 'iPhone portrait',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iphone-se-safari',
    note: 'Smallest iPhone still in use',
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'ipad-safari',
    note: 'iPad portrait',
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  },
];

function parseArgs(argv) {
  const args = { url: 'http://localhost:12000', json: false, seed: null, screenshots: null };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'json') args.json = true;
    else if (key === 'seed') args.seed = value;
    else if (key === 'screenshots') args.screenshots = value;
    else if (key in args && value !== undefined) args[key] = value;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function loadPlaywright() {
  for (const candidate of ['playwright', 'playwright-core']) {
    try {
      return await import(candidate);
    } catch {
      // try the next one
    }
  }
  console.error(
    'Playwright is not installed. Run `npm i -D playwright` (or use npx) and `npx playwright install --with-deps webkit` first.',
  );
  process.exit(2);
}

const PROBE = `(() => {
  const MIN_TAP = __MIN_TAP__;
  const MIN_FONT = ${MIN_INPUT_FONT_PX};
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.top > window.innerHeight || rect.bottom < 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
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
    small.push({ height: Math.round(rect.height), label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40) });
  }

  const zoomRisk = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
    .filter((el) => visible(el) && !['checkbox', 'radio', 'file'].includes(el.type))
    .map((el) => ({ fontSize: parseFloat(getComputedStyle(el).fontSize), label: (el.getAttribute('aria-label') || el.placeholder || el.type || el.tagName).slice(0, 32) }))
    .filter((entry) => entry.fontSize < MIN_FONT);

  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    smallTargets: small.slice(0, 6),
    smallCount: small.length,
    zoomRiskInputs: zoomRisk.slice(0, 6),
  };
})()`;

// The bottom bar labels are short ("Hub", "Tactics"), and Matches/Staff live behind
// "More". Clicking the navigation itself, then reading back which tab rendered, is
// the only way to know the probe described the screen it claims to describe.
const TAB_TARGETS = {
  'Hub & Analyst': { nav: 'Hub', tab: 'sync' },
  Squad: { nav: 'Squad', tab: 'squad' },
  'Tactics & Corners': { nav: 'Tactics', tab: 'tactics' },
  Transfers: { nav: 'Transfers', tab: 'recruitment' },
  Matches: { sheet: 'Matches', tab: 'matches' },
  Staff: { sheet: 'Staff', tab: 'staff' },
};

async function clickTab(page, label) {
  const target = TAB_TARGETS[label];
  if (!target) throw new Error(`No navigation target for tab ${label}`);

  if (target.nav) {
    const clicked = await page.evaluate((navLabel) => {
      const nav = [
        ...document.querySelectorAll(
          'nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]',
        ),
      ].find((n) => n.getClientRects().length > 0);
      if (!nav) return false;
      const buttons = [...nav.querySelectorAll('button')];
      const button =
        buttons.find((b) => b.textContent.trim() === navLabel) ||
        buttons.find((b) => b.textContent.trim().startsWith(navLabel));
      if (!button) return false;
      button.click();
      return true;
    }, target.nav);
    if (!clicked) return false;
  } else {
    const opened = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const more = nav
        ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More')
        : null;
      if (!more) return false;
      more.click();
      return true;
    });
    if (!opened) return false;
    await page.waitForTimeout(600);
    const picked = await page.evaluate((sheetLabel) => {
      const sheet = document.getElementById('mobile-more-sheet') || document;
      const button = [...sheet.querySelectorAll('button')].find((b) =>
        b.textContent.trim().startsWith(sheetLabel),
      );
      if (!button) return false;
      button.click();
      return true;
    }, target.sheet);
    if (!picked) return false;
  }

  await page.waitForTimeout(700);
  const rendered = await page.evaluate(
    () => document.querySelector('main[data-active-tab]')?.getAttribute('data-active-tab') ?? null,
  );
  return rendered === target.tab;
}

async function run() {
  const args = parseArgs(process.argv);
  const seed = args.seed && existsSync(args.seed) ? readFileSync(args.seed, 'utf8') : null;
  if (args.seed && !seed) throw new Error(`Seed file not found: ${args.seed}`);
  if (args.screenshots) mkdirSync(args.screenshots, { recursive: true });

  const { webkit } = await loadPlaywright();
  const browser = await webkit.launch();
  const results = [];

  for (const profile of PROFILES) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      userAgent: profile.userAgent,
      reducedMotion: 'no-preference',
    });
    if (seed) {
      await context.addInitScript(
        ([key, value]) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // first document may not have an origin yet
          }
        },
        ['fm27_command_hub_state_v1', seed],
      );
    }
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160));
    });
    page.on('pageerror', (error) => consoleErrors.push(`uncaught: ${String(error).slice(0, 160)}`));
    const httpErrors = [];
    const unexercised = [];
    page.on('response', async (response) => {
      if (response.status() < 400) return;
      const url = response.url().slice(0, 120);
      let body = '';
      try {
        body = (await response.text()).slice(0, 400);
      } catch {
        // body already gone
      }
      // A local build has no GEMINI_API_KEY, so Analyst requests cannot succeed here.
      // That is the harness's environment, not a device defect.
      if (/GEMINI_API_KEY/i.test(body)) unexercised.push(`${response.status()} ${url}`);
      else httpErrors.push(`${response.status()} ${url}`);
    });

    await page.goto(`${args.url}/?tab=hub&webkit=${profile.name}`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
      const keys = await caches?.keys?.();
      await Promise.all((keys ?? []).map((key) => caches.delete(key)));
    });
    await page.goto(`${args.url}/?tab=hub&webkit=${profile.name}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.waitForTimeout(1200);

    const entry = {
      profile: profile.name,
      note: profile.note,
      seeded: Boolean(seed),
      tabs: [],
      failures: [],
    };
    for (const label of TABS) {
      const opened = await clickTab(page, label);
      await page.waitForTimeout(900);
      const floor = profile.viewport.width >= 700 ? MIN_TAP_PX_TABLET : MIN_TAP_PX_PHONE;
      const probe = await page.evaluate(PROBE.replace('__MIN_TAP__', String(floor)));
      entry.tabs.push({ tab: label, opened, ...probe });
      if (probe.overflowX > 0)
        entry.failures.push(`${label}: horizontal overflow ${probe.overflowX}px`);
      if (probe.smallCount > 0) {
        entry.failures.push(
          `${label}: ${probe.smallCount} target(s) under ${floor}px (e.g. "${probe.smallTargets[0].label}" ${probe.smallTargets[0].height}px)`,
        );
      }
      if (probe.zoomRiskInputs.length > 0) {
        entry.failures.push(
          `${label}: input under ${MIN_INPUT_FONT_PX}px zooms on focus (${probe.zoomRiskInputs[0].fontSize}px)`,
        );
      }
      if (!opened)
        entry.failures.push(
          `${label}: navigation did not reach that tab, so this row measured the wrong screen`,
        );
      if (args.screenshots) {
        await page.screenshot({
          path: `${args.screenshots}/${profile.name}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
        });
      }
    }

    // Ignored viewport keys are the one warning Safari always emits; they are not defects.
    entry.unexercised = [...new Set(unexercised)].slice(0, 5);
    entry.httpErrors = [...new Set(httpErrors)].slice(0, 5);
    if (entry.httpErrors.length > 0) entry.failures.push(`http: ${entry.httpErrors[0]}`);
    // An ignored viewport key is a harmless Safari notice, and a bare "Failed to load
    // resource" line duplicates the HTTP entry reported above with its URL.
    entry.consoleErrors = [...new Set(consoleErrors)]
      .filter((line) => !/viewport argument key/i.test(line))
      .filter((line) => !/^Failed to load resource/i.test(line))
      .slice(0, 5);
    if (entry.consoleErrors.length > 0) entry.failures.push(`console: ${entry.consoleErrors[0]}`);
    results.push(entry);
    await context.close();
  }

  await browser.close();

  if (args.json) {
    console.log(JSON.stringify({ engine: 'webkit', profiles: results }, null, 2));
  } else {
    for (const entry of results) {
      const overflow = Math.max(...entry.tabs.map((tab) => tab.overflowX));
      console.log(
        `${entry.failures.length === 0 ? 'PASS' : 'FAIL'} ${entry.profile.padEnd(16)} (${entry.note}${entry.seeded ? ', loaded save' : ''}) overflow=${overflow}px`,
      );
      if (entry.unexercised.length > 0) {
        console.log(
          `     ~ Analyst chat not exercised: no GEMINI_API_KEY in this environment (${entry.unexercised[0]})`,
        );
      }
      for (const failure of entry.failures) console.log(`     - ${failure}`);
    }
    const failed = results.filter((entry) => entry.failures.length > 0);
    console.log(
      failed.length === 0
        ? `PASS: ${results.length} Safari profiles clean`
        : `FAIL: ${failed.length} of ${results.length} Safari profiles have findings`,
    );
    process.exitCode = failed.length === 0 ? 0 : 1;
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
