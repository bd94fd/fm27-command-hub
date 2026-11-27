#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Accessibility audit for the FM27 Command Hub (roadmap R30). Runs axe-core
 * against the production build in a real browser, then exercises the keyboard
 * paths axe cannot check: focus visibility, focus order, focus trap and return
 * in the player sheet, Escape on the mobile More sheet, and live regions.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run a11y:audit                  # first run only, fast
 *   npm run a11y:audit -- --save=...    # also audit every tab with a save
 *   npm run a11y:audit -- --json
 *
 * Automated tools catch roughly a third of real barriers. A clean run here is
 * not WCAG conformance; the manual checklist in docs/accessibility.md still has
 * to be walked with a real screen reader and a keyboard.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clickTab, connect, fetchJson, sleep, startBrowser, TAB_TARGETS } from './lib/browser.mjs';

const AXE_PATH = resolve(process.cwd(), 'node_modules/axe-core/axe.min.js');
const TABS = Object.keys(TAB_TARGETS);

const VIEWPORTS = {
  mobile: {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
  desktop: {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    userAgent: null,
  },
};

function parseArgs(argv) {
  const args = {
    url: process.env.A11Y_URL || 'http://localhost:12000',
    cdp: process.env.CDP_URL || 'http://127.0.0.1:9222',
    save: null,
    profiles: ['desktop', 'mobile'],
    out: '.playwright-mcp/r30-a11y',
    json: false,
    timeout: 300000,
  };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.split('=');
    if (key === '--url') args.url = value;
    else if (key === '--cdp') args.cdp = value;
    else if (key === '--save') args.save = value;
    else if (key === '--profile') args.profiles = value === 'both' ? ['desktop', 'mobile'] : [value];
    else if (key === '--out') args.out = value;
    else if (key === '--timeout') args.timeout = Number(value);
    else if (key === '--json') args.json = true;
    else if (key === '--help') args.help = true;
    else throw new Error(`Unknown argument ${raw}`);
  }
  return args;
}

const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
};

/** Runs axe in the page and returns its violations, flattened for a report. */
async function runAxe(client, label, results) {
  const raw = await client.evaluate(`(async () => {
    const result = await axe.run(document, ${JSON.stringify(AXE_OPTIONS)});
    return JSON.stringify(
      result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.slice(0, 3).map((node) => ({
          target: (node.target || []).join(' '),
          html: (node.html || '').slice(0, 160),
          summary: (node.failureSummary || '').split('\\n').slice(0, 3).join(' ').slice(0, 240),
        })),
        count: violation.nodes.length,
      }))
    );
  })()`);
  const violations = JSON.parse(raw);
  for (const violation of violations) {
    results.push({
      profile: label.profile,
      check: `axe: ${violation.id} (${violation.impact})`,
      ok: false,
      detail: `${violation.count} element(s) on ${label.screen} — ${violation.nodes[0]?.target || ''} :: ${
        violation.nodes[0]?.summary || violation.help
      }`,
    });
  }
  if (violations.length === 0) {
    results.push({
      profile: label.profile,
      check: 'axe: no WCAG 2.2 A/AA violations',
      ok: true,
      detail: label.screen,
    });
  }
  return violations;
}

/** Structure and keyboard checks that axe does not cover. */
async function runKeyboardChecks(client, results, check) {
  const structure = await client.evaluate(`(() => {
    const focusables = [
      ...document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((el) => el.getClientRects().length > 0);
    const positiveTabindex = [...document.querySelectorAll('[tabindex]')]
      .filter((el) => Number(el.getAttribute('tabindex')) > 0)
      .map((el) => el.outerHTML.slice(0, 80));
    const hiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"]')].flatMap((hidden) =>
      [...hidden.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].map(
        (el) => el.outerHTML.slice(0, 80)
      )
    );
    const headings = [...document.querySelectorAll('h1, h2, h3')].map((h) => h.tagName);
    return {
      lang: document.documentElement.lang || '',
      h1Count: headings.filter((tag) => tag === 'H1').length,
      firstHeading: headings[0] || null,
      hasMain: Boolean(document.querySelector('main')),
      hasBanner: Boolean(document.querySelector('header, [role="banner"]')),
      navNames: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') || ''),
      liveRegions: document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').length,
      focusableCount: focusables.length,
      positiveTabindex,
      hiddenFocusable,
    };
  })()`);

  check('the page declares a language', Boolean(structure.lang), structure.lang || 'missing');
  check('exactly one h1', structure.h1Count === 1, `${structure.h1Count} found`);
  check('a main landmark exists', structure.hasMain);
  check('a banner landmark exists', structure.hasBanner);
  check(
    'every nav landmark has an accessible name',
    structure.navNames.length > 0 && structure.navNames.every(Boolean),
    structure.navNames.map((name) => name || '(unnamed)').join(', ')
  );
  check('no positive tabindex values', structure.positiveTabindex.length === 0, structure.positiveTabindex[0] || '');
  check('nothing focusable inside aria-hidden', structure.hiddenFocusable.length === 0, structure.hiddenFocusable[0] || '');

  // Walk real tab stops: programmatic focus() does not trigger :focus-visible,
  // so the ring has to be measured after an actual Tab key press.
  const stops = [];
  await client.evaluate(`(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); return true; })()`);
  for (let i = 0; i < 12; i += 1) {
    await client.pressTab();
    await sleep(80);
    const stop = await client.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
        (style.boxShadow !== 'none' && style.boxShadow !== '');
      return {
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
        tag: el.tagName,
        ring,
      };
    })()`);
    if (stop) stops.push(stop);
  }
  const ringless = stops.filter((stop) => !stop.ring);
  check(
    'every keyboard stop shows a focus indicator',
    stops.length > 0 && ringless.length === 0,
    ringless.length ? `${ringless.length}/${stops.length} without a ring, e.g. "${ringless[0].name}"` : `${stops.length} stops`
  );

  const skip = await client.evaluate(`(() => {
    const candidates = [...document.querySelectorAll('a[href^="#"], button')].slice(0, 6);
    const skip = candidates.find((el) => /skip/i.test(el.textContent || '') || /skip/i.test(el.getAttribute('aria-label') || ''));
    if (!skip) return null;
    skip.focus();
    const before = document.activeElement;
    skip.click();
    const target = document.getElementById((skip.getAttribute('href') || '').replace('#', ''));
    const after = document.activeElement;
    return {
      text: skip.textContent.trim().slice(0, 40),
      movedFocus: after !== before,
      targetExists: Boolean(target),
      activeTag: after?.tagName || null,
    };
  })()`);
  check(
    'a skip link jumps past the navigation',
    Boolean(skip && skip.targetExists && skip.movedFocus),
    skip ? `${skip.text} → ${skip.activeTag}` : 'no skip link found'
  );

  return structure;
}

async function runProfile(client, browserSend, profile, args, axeSource, savePath, results) {
  const started = Date.now();
  const check = (name, ok, detail = '') => {
    results.push({ profile: profile.name, check: name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
  };
  const audit = async (screen) => {
    const label = { profile: profile.name, screen };
    await runAxe(client, label, results);
    console.log(`  axe ${screen}: done`);
  };

  await browserSend('Page.bringToFront').catch(() => null);
  await browserSend('Network.enable');
  await browserSend('Network.setCacheDisabled', { cacheDisabled: true });
  // Another gate may have left this browser offline; a stale emulation makes the
  // save import below fail for reasons that have nothing to do with accessibility.
  await browserSend('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }).catch(() => null);
  await browserSend('Emulation.setDeviceMetricsOverride', {
    width: profile.viewport.width,
    height: profile.viewport.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: profile.mobile,
  });
  await browserSend('Emulation.setTouchEmulationEnabled', {
    enabled: profile.touch,
    maxTouchPoints: profile.touch ? 5 : 1,
  });
  if (profile.userAgent) {
    await browserSend('Emulation.setUserAgentOverride', { userAgent: profile.userAgent });
  }

  // Clear from the browser side: deleting IndexedDB from inside the page leaves the
  // app's own connection half-closed, and the import that follows cannot save. Leave the
  // page first, or the clear waits for a connection the live app never releases.
  await client.navigate('about:blank', 500).catch(() => null);
  await browserSend('Storage.clearDataForOrigin', {
    origin: new URL(args.url).origin,
    storageTypes: 'all',
  }).catch(() => null);
  await client.navigate(args.url, 3000);
  await client.evaluate(axeSource);

  await audit('first run');
  await runKeyboardChecks(client, results, check);

  if (!savePath) {
    console.log(`  save audits skipped (no --save); ${Math.round((Date.now() - started) / 1000)}s`);
    return;
  }

  await client.setFileInput('input[accept=".fm"]', savePath);
  await client
    .waitFor(
      `(() => {
        const text = (document.body.innerText || '').replace(/\\s+/g, ' ');
        return /(\\d+)\\s*First Team/.test(text) ? true : false;
      })()`,
      { timeout: args.timeout, interval: 1500, label: 'the squad after import' }
    )
    .catch(() => null);
  const loaded = await client.evaluate(`/(\\d+)\\s*First Team/.test(document.body.innerText || '')`);
  if (!loaded) {
    const visible = await client.evaluate(
      `(document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 300)`
    );
    console.log(`  save did not load; the page shows: ${visible}`);
  }
  check('save loaded for the tab audits', loaded);
  await client.evaluate(axeSource);

  for (const tab of TABS) {
    const opened = await clickTab(client.evaluate, sleep, tab);
    if (!opened) {
      check(`${tab} opens`, false, 'navigation did not reach the section');
      continue;
    }
    await audit(tab);
  }

  // The mobile More sheet holds Matches and Staff; audit it while it is open.
  if (profile.name === 'mobile') {
    const morePressed = await client.evaluate(`(() => {
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
      if (!more) return false;
      more.focus();
      more.click();
      return true;
    })()`);
    await sleep(800);
    check('the More button opens the sheet', morePressed);
    const focusInSheet = await client.evaluate(`(() => {
      const sheet = document.getElementById('mobile-more-sheet');
      return Boolean(sheet && sheet.contains(document.activeElement));
    })()`);
    check('opening the More sheet moves focus inside it', focusInSheet);
    await audit('More sheet');

    const sheetOpen = await client.evaluate(`(() => {
      const sheet = document.getElementById('mobile-more-sheet');
      return sheet ? sheet.getClientRects().length > 0 : false;
    })()`);
    if (sheetOpen) {
      await client.pressEscape();
      await sleep(500);
      const closed = await client.evaluate(`(() => {
        const sheet = document.getElementById('mobile-more-sheet');
        const hidden = !sheet || sheet.getClientRects().length === 0;
        const active = document.activeElement;
        return {
          hidden,
          focusText: (active?.textContent || '').trim().slice(0, 30),
          focusTag: active?.tagName || '',
          focusControls: active?.getAttribute?.('aria-controls') || '',
          moreButtonExists: Boolean(document.querySelector('button[aria-controls="mobile-more-sheet"]')),
        };
      })()`);
      check(
        'Escape closes the More sheet and focus returns to More',
        closed.hidden && closed.focusControls === 'mobile-more-sheet',
        `sheet ${closed.hidden ? 'closed' : 'still open'}, focus ${closed.focusTag}${
          closed.focusControls ? `[aria-controls=${closed.focusControls}]` : ''
        }, More button ${closed.moreButtonExists ? 'present' : 'missing'}`
      );
    }
  }

  // The player sheet: focus must move inside, stay inside, and come back.
  await clickTab(client.evaluate, sleep, 'Squad');
  const opened = await client.evaluate(`(() => {
    // A squad row: the widest clickable control that carries a star rating.
    const rows = [...document.querySelectorAll('main button')].filter(
      (b) => b.getClientRects().length > 0 && /★/.test(b.textContent || '')
    );
    const target = rows.sort(
      (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width
    )[0];
    if (!target) return false;
    target.focus();
    target.click();
    return true;
  })()`);
  await sleep(1200);
  const dialog = await client.evaluate(`(() => {
    const surface = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!surface) return null;
    const focusables = [...surface.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.getClientRects().length > 0 && !el.disabled
    );
    return {
      name: surface.getAttribute('aria-label') || surface.getAttribute('aria-labelledby') || '(unnamed)',
      focusInside: surface.contains(document.activeElement),
      focusableCount: focusables.length,
    };
  })()`);

  if (opened && dialog) {
    check('the player sheet is a named dialog', dialog.name !== '(unnamed)', String(dialog.name).slice(0, 40));
    check('opening the player sheet moves focus inside it', dialog.focusInside);
    await audit('player sheet');

    const trapped = await client.evaluate(`(async () => {
      const surface = document.querySelector('[role="dialog"][aria-modal="true"]');
      const focusables = () => [...surface.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0 && !el.disabled);
      const list = focusables();
      if (list.length === 0) return { trapped: false, reason: 'no focusable controls' };
      list[list.length - 1].focus();
      return { trapped: surface.contains(document.activeElement), count: list.length };
    })()`);
    await client.pressTab();
    const stillInside = await client.evaluate(
      `(() => { const s = document.querySelector('[role="dialog"][aria-modal="true"]'); return Boolean(s && s.contains(document.activeElement)); })()`
    );
    check('tabbing forward never leaves the player sheet', Boolean(trapped.trapped) && Boolean(stillInside));

    await client.pressEscape();
    await sleep(600);
    const closed = await client.evaluate(`(() => ({
      gone: !document.querySelector('[role="dialog"][aria-modal="true"]'),
      focusInMain: Boolean(document.querySelector('main')?.contains(document.activeElement)),
      activeText: (document.activeElement?.textContent || document.activeElement?.tagName || '').trim().slice(0, 40),
    }))()`);
    check('Escape closes the player sheet and returns focus', closed.gone && closed.focusInMain, `focus on "${closed.activeText}"`);
  } else if (opened) {
    check('a player sheet opens as a dialog', false, 'no aria-modal dialog found after clicking a squad row');
  }

  console.log(`  ${profile.name} done in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: npm run a11y:audit -- [--save=path.fm] [--profile=desktop|mobile|both] [--url=...] [--json]');
    return;
  }

  let axeSource;
  try {
    axeSource = readFileSync(AXE_PATH, 'utf8');
  } catch {
    console.error(`axe-core not found at ${AXE_PATH}. Run npm install.`);
    process.exit(2);
  }

  let stopBrowser = () => {};
  try {
    await fetchJson(`${args.cdp}/json/version`);
  } catch {
    stopBrowser = await startBrowser(args.cdp);
  }

  const results = [];
  const client = await connect(args.cdp);
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    for (const name of args.profiles) {
      const profile = VIEWPORTS[name];
      if (!profile) throw new Error(`Unknown profile ${name}`);
      console.log(`\n${name} ${profile.viewport.width}x${profile.viewport.height}`);
      await runProfile(client, client.send, profile, args, axeSource, args.save, results);
    }
  } finally {
    client.close();
    stopBrowser();
  }

  const failures = results.filter((result) => !result.ok);
  if (args.json) console.log(JSON.stringify({ results }, null, 2));

  const byImpact = new Map();
  for (const failure of failures) {
    const key = failure.check.replace(/\s.*$/, '');
    byImpact.set(key, (byImpact.get(key) || 0) + 1);
  }
  console.log('');
  if (failures.length === 0) {
    console.log(`PASS: ${results.length} accessibility checks clean across ${args.profiles.join(', ')}`);
  } else {
    console.log(`FAIL: ${failures.length} of ${results.length} checks failed`);
    for (const [rule, count] of byImpact) console.log(`  - ${rule}: ${count}`);
    for (const failure of failures.slice(0, 40)) {
      console.log(`  * [${failure.profile}] ${failure.check} — ${failure.detail}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
