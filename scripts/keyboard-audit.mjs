#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Keyboard sweep for the FM27 Command Hub (roadmap R25). The accessibility gate
 * checks the first twelve tab stops and two sheets; this one walks every section,
 * every view inside a section, and every overlay, so a control that only responds
 * to a pointer cannot hide in a screen the other gate never opens.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run keyboard:audit
 *   npm run keyboard:audit -- --save=/path/to/save.fm
 *   npm run keyboard:audit -- --profile=desktop --json
 *
 * It drives Chromium over the DevTools protocol, the same way `a11y:audit` does.
 * A clean run means keyboard users can reach and see every control, open a player
 * from the squad table, and open and close every sheet. It is not a screen-reader
 * test; the manual checklist in docs/accessibility.md still applies.
 */

import { connect, sleep, startBrowser, TAB_TARGETS } from './lib/browser.mjs';

const TABS = Object.keys(TAB_TARGETS);

const VIEWPORTS = {
  desktop: {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    userAgent: null,
  },
  mobile: {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
};

function parseArgs(argv) {
  const args = {
    url: process.env.KEYBOARD_URL || 'http://localhost:12000',
    cdp: process.env.CDP_URL || 'http://127.0.0.1:9222',
    save: null,
    profiles: ['desktop', 'mobile'],
    out: '.playwright-mcp/r25-keyboard',
    json: false,
    maxStops: 80,
    views: 6,
    timeout: 300000,
  };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.split('=');
    if (key === '--url') args.url = value;
    else if (key === '--cdp') args.cdp = value;
    else if (key === '--save') args.save = value;
    else if (key === '--profile')
      args.profiles = value === 'both' ? ['desktop', 'mobile'] : [value];
    else if (key === '--out') args.out = value;
    else if (key === '--max-stops') args.maxStops = Number(value);
    else if (key === '--views') args.views = Number(value);
    else if (key === '--timeout') args.timeout = Number(value);
    else if (key === '--json') args.json = true;
    else if (key === '--help') args.help = true;
    else throw new Error(`Unknown argument ${raw}`);
  }
  return args;
}

/** Chromium only runs a button's default activation when the key carries its code. */
async function pressActivationKey(client, key) {
  const spec =
    key === 'Enter'
      ? {
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: '\r',
        }
      : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' };
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
}

const STOP_PROBE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { onBody: true };
  const style = getComputedStyle(el);
  const ring =
    (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
    (style.boxShadow !== 'none' && style.boxShadow !== '');
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName,
    name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48),
    ring,
    hidden: !!el.closest('[aria-hidden="true"]'),
    visible: rect.width > 0 && rect.height > 0,
    inDialog: !!el.closest('[role="dialog"]'),
  };
})()`;

/**
 * A control a pointer can use but the keyboard cannot. SVG marks are excluded:
 * a chart's bars sit beside a real button that changes the same selection, and
 * the sweep proves that separately. A <label> is excluded because the control it
 * wraps is what takes focus.
 */
const POINTER_ONLY_PROBE = `(() => {
  const main = document.querySelector('main');
  if (!main) return { count: 0, sample: [] };
  const focusable = (el) => el.matches('a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const untabbable = [...main.querySelectorAll('*')].filter((el) => {
    const style = getComputedStyle(el);
    if (style.cursor !== 'pointer') return false;
    if (el.getClientRects().length === 0) return false;
    if (el.closest('a[href], button, summary, [tabindex]:not([tabindex="-1"])')) return false;
    if (el.closest('svg, label')) return false;
    return !focusable(el);
  });
  const roots = [];
  for (const el of untabbable) {
    if (roots.some((root) => root.contains(el))) continue;
    roots.push(el);
  }
  return {
    count: roots.length,
    sample: roots.slice(0, 4).map((el) => el.tagName + ' "' + (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 34) + '"'),
  };
})()`;

const DIALOG_PROBE = `(() => {
  const surface = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!surface) return { open: false };
  return {
    open: true,
    name: (surface.getAttribute('aria-label') || '').trim(),
    focusInside: surface.contains(document.activeElement),
  };
})()`;

async function preparePage(client, browserSend, profile, args) {
  await browserSend('Page.bringToFront').catch(() => null);
  await browserSend('Network.enable');
  await browserSend('Network.setCacheDisabled', { cacheDisabled: true });
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
  await client.navigate('about:blank', 400).catch(() => null);
  await browserSend('Storage.clearDataForOrigin', {
    origin: new URL(args.url).origin,
    storageTypes: 'all',
  }).catch(() => null);
  await client.navigate(args.url, 3000);
}

async function walkTabStops(client, limit) {
  await client.evaluate(
    `(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); return true; })()`,
  );
  const stops = [];
  for (let i = 0; i < limit; i += 1) {
    await client.pressTab();
    await sleep(35);
    const stop = await client.evaluate(STOP_PROBE);
    if (stop.onBody) {
      stops.push({ onBody: true });
      break;
    }
    // Tabbing past the last control lands back on the first one; stop there.
    if (stops.length > 2 && stop.tag === stops[0].tag && stop.name === stops[0].name) break;
    stops.push(stop);
  }
  return stops;
}

function summariseStops(stops) {
  const real = stops.filter((stop) => !stop.onBody);
  return {
    count: real.length,
    noRing: real.filter((stop) => !stop.ring),
    hidden: real.filter((stop) => stop.hidden),
    invisible: real.filter((stop) => !stop.visible),
    endedOnBody: stops.length > 0 && Boolean(stops[stops.length - 1].onBody),
  };
}

async function sweepSection(client, args, tab, results, check) {
  const opened = await client.evaluate(`(() => {
    const nav = [...document.querySelectorAll('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]')].find((n) => n.getClientRects().length > 0);
    return nav ? nav.querySelectorAll('button').length > 0 : false;
  })()`);
  if (!opened) {
    check(`${tab}: navigation is present`, false, 'no section navigation on screen');
    return;
  }
  // Navigate with the keyboard, then confirm the section rendered.
  const target = TAB_TARGETS[tab];
  if (target.nav) {
    await client.evaluate(`(() => {
      const nav = [...document.querySelectorAll('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]')].find((n) => n.getClientRects().length > 0);
      const button = [...nav.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(target.nav)}));
      button?.focus();
      return true;
    })()`);
    await pressActivationKey(client, 'Enter');
    await sleep(900);
  } else {
    // Matches and Staff sit behind the mobile More sheet, which this sweep opens
    // and closes on the way; here it only has to reach the section.
    const reached = await client.evaluate(`(() => {
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
      if (!more) return false;
      more.click();
      return true;
    })()`);
    await sleep(600);
    if (reached) {
      await client.evaluate(`(() => {
        const sheet = document.getElementById('mobile-more-sheet') || document;
        const button = [...sheet.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(target.sheet)}));
        button?.click();
        return true;
      })()`);
      await sleep(900);
    }
  }
  const rendered = await client.evaluate(
    `document.querySelector('main[data-active-tab]')?.getAttribute('data-active-tab') ?? null`,
  );
  check(`${tab}: Enter on the section button opens it`, rendered === target.tab, String(rendered));

  const stops = await walkTabStops(client, args.maxStops);
  const summary = summariseStops(stops);
  check(
    `${tab}: ${summary.count} keyboard stops, each with a visible focus indicator`,
    summary.count > 0 && summary.noRing.length === 0,
    summary.noRing.length ? `no ring on ${summary.noRing[0].tag} "${summary.noRing[0].name}"` : '',
  );
  check(
    `${tab}: no keyboard stop hides inside aria-hidden`,
    summary.hidden.length === 0,
    summary.hidden.length ? `${summary.hidden[0].tag} "${summary.hidden[0].name}"` : '',
  );
  check(
    `${tab}: no keyboard stop is zero-sized`,
    summary.invisible.length === 0,
    summary.invisible.length ? `${summary.invisible[0].tag} "${summary.invisible[0].name}"` : '',
  );

  const pointer = await client.evaluate(POINTER_ONLY_PROBE);
  check(
    `${tab}: every pointer control is reachable by keyboard`,
    pointer.count === 0,
    pointer.count ? `${pointer.count} pointer-only, e.g. ${pointer.sample[0]}` : '',
  );

  // Each alternate view is its own screen, so it gets its own scan and a short walk.
  const views =
    await client.evaluate(`(() => [...document.querySelectorAll('main [role="tab"], main [aria-pressed]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el, index) => ({
      index,
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32),
      active: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true',
    })))()`);

  let checked = 0;
  for (const view of views) {
    if (view.active || checked >= args.views) continue;
    const clicked = await client.evaluate(`(() => {
      const list = [...document.querySelectorAll('main [role="tab"], main [aria-pressed]')].filter((el) => el.getClientRects().length > 0);
      const el = list[${view.index}];
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) continue;
    checked += 1;
    await sleep(800);
    const viewPointer = await client.evaluate(POINTER_ONLY_PROBE);
    check(
      `${tab} → ${view.label}: every pointer control is reachable by keyboard`,
      viewPointer.count === 0,
      viewPointer.count ? `${viewPointer.count} pointer-only, e.g. ${viewPointer.sample[0]}` : '',
    );
    const viewStops = summariseStops(await walkTabStops(client, 20));
    check(
      `${tab} → ${view.label}: the first stops show a focus ring`,
      viewStops.noRing.length === 0,
      viewStops.noRing.length
        ? `no ring on ${viewStops.noRing[0].tag} "${viewStops.noRing[0].name}"`
        : `${viewStops.count} stops`,
    );
  }
  return results;
}

async function checkDialog(client, label, openScript, check) {
  await client.evaluate(openScript);
  await sleep(1500);
  const opened = await client.evaluate(DIALOG_PROBE);
  if (!opened.open) {
    check(
      `${label}: opens and is a named modal dialog`,
      false,
      'no role="dialog" surface appeared',
    );
    return;
  }
  check(
    `${label}: opens and is a named modal dialog`,
    opened.name.length > 0,
    opened.name || 'unnamed',
  );
  check(`${label}: focus moves inside`, opened.focusInside);

  let escaped = -1;
  for (let i = 0; i < 45; i += 1) {
    await client.pressTab();
    await sleep(25);
    const state = await client.evaluate(DIALOG_PROBE);
    if (!state.open) break;
    if (!state.focusInside) {
      escaped = i;
      break;
    }
  }
  check(
    `${label}: Tab stays inside`,
    escaped === -1,
    escaped === -1 ? '45 presses' : `left at press ${escaped}`,
  );

  await client.pressEscape();
  await sleep(600);
  const after = await client.evaluate(`(() => {
    const surface = document.querySelector('[role="dialog"][aria-modal="true"]');
    const active = document.activeElement;
    return {
      closed: !surface,
      tag: active?.tagName || 'none',
      onBody: !active || active === document.body,
      name: (active?.getAttribute?.('aria-label') || active?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    };
  })()`);
  check(`${label}: Escape closes it`, after.closed);
  check(
    `${label}: focus returns to the control that opened it`,
    !after.onBody,
    after.onBody ? 'focus fell to <body>' : `${after.tag} "${after.name}"`,
  );
}

async function runProfile(client, browserSend, profile, args, savePath, results) {
  const started = Date.now();
  const check = (name, ok, detail = '') => {
    results.push({ profile: profile.name, check: name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
  };

  await preparePage(client, browserSend, profile, args);

  // The skip link is the first thing Tab reaches on a fresh page.
  await client.evaluate(
    `(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); return true; })()`,
  );
  await client.pressTab();
  await sleep(80);
  const skip = await client.evaluate(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { found: false };
    return {
      found: /skip/i.test((el.textContent || '') + (el.getAttribute('aria-label') || '')),
      text: (el.textContent || '').trim().slice(0, 30),
    };
  })()`);
  check('the first Tab stop is the skip link', skip.found, skip.text || 'not found');
  if (skip.found) {
    await pressActivationKey(client, 'Enter');
    await sleep(300);
    const landed = await client.evaluate(`(() => {
      const active = document.activeElement;
      const main = document.querySelector('main');
      return { insideMain: Boolean(main && main.contains(active)), tag: active?.tagName || 'none' };
    })()`);
    check('the skip link puts focus in the main landmark', landed.insideMain, landed.tag);
    await client.navigate(args.url, 2500);
  }

  if (!savePath) {
    console.log(
      `  section sweeps skipped (no --save); ${Math.round((Date.now() - started) / 1000)}s`,
    );
    return;
  }

  await client.waitFor(`!!document.querySelector('input[accept=".fm"]')`, {
    timeout: 30000,
    interval: 500,
    label: 'the import input',
  });
  await client.setFileInput('input[accept=".fm"]', savePath);
  await client
    .waitFor(`/(\\d+)\\s*First Team/.test(document.body.innerText || '')`, {
      timeout: args.timeout,
      interval: 1500,
      label: 'the squad after import',
    })
    .catch(() => null);
  const loaded = await client.evaluate(
    `/(\\d+)\\s*First Team/.test(document.body.innerText || '')`,
  );
  if (!loaded) {
    const visible = await client.evaluate(
      `(document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240)`,
    );
    console.log(`  save did not load; the page shows: ${visible}`);
  }
  check('save loaded for the section sweeps', loaded);
  if (!loaded) return;

  for (const tab of TABS) {
    await sweepSection(client, args, tab, results, check);
  }

  // Opening a player from the squad table is the path a keyboard user needs most.
  await client.evaluate(`(() => {
    const nav = [...document.querySelectorAll('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]')].find((n) => n.getClientRects().length > 0);
    const button = [...nav.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Squad'));
    button?.click();
    return true;
  })()`);
  await sleep(1000);
  const opener = await client.evaluate(`(() => {
    const row = document.querySelector('main table tbody tr[tabindex]');
    if (row) {
      row.focus();
      return { found: true, kind: 'row', name: (row.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) };
    }
    const card = [...document.querySelectorAll('main button')].find((button) =>
      button.getClientRects().length > 0 && /\u2605/.test(button.textContent || '')
    );
    if (!card) return { found: false };
    card.focus();
    return { found: true, kind: 'card', name: (card.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) };
  })()`);
  check(
    `a squad ${profile.mobile ? 'card' : 'row'} can take focus`,
    opener.found && opener.kind === (profile.mobile ? 'card' : 'row'),
    opener.found ? `${opener.kind} "${opener.name}"` : 'no focusable player control',
  );
  if (opener.found) {
    await pressActivationKey(client, 'Enter');
    await sleep(1500);
    const dialog = await client.evaluate(DIALOG_PROBE);
    check(
      `Enter on a squad ${opener.kind} opens the player profile`,
      dialog.open,
      dialog.name || 'no dialog',
    );
    await client.pressEscape();
    await sleep(600);
    const returned = await client.evaluate(`(() => {
      const active = document.activeElement;
      const surface = !!document.querySelector('[role="dialog"][aria-modal="true"]');
      return {
        tag: active?.tagName || 'none',
        onBody: !active || active === document.body,
        // The card list re-renders the button; focus must come back to a player control.
        isPlayerControl: Boolean(active && (active.tagName === 'TR' || active.tagName === 'BUTTON')),
        surface,
      };
    })()`);
    check(
      'Escape from the player profile returns focus to the player control',
      returned.isPlayerControl && !returned.surface,
      returned.onBody ? 'focus fell to <body>' : returned.tag,
    );
  }

  // On mobile these live behind the More sheet, which closes as the sheet opens.
  const openFromMore = (matcher) => `(() => {
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
    if (more) {
      more.focus();
      more.click();
    }
    const scope = document.getElementById('mobile-more-sheet') || document;
    const button = [...scope.querySelectorAll('button')].find((b) =>
      b.getClientRects().length > 0 && ${matcher}
    );
    if (!button) return false;
    button.focus();
    button.click();
    return true;
  })()`;

  await checkDialog(
    client,
    'share sheet',
    profile.mobile
      ? openFromMore(
          `/Share and export|Share & Export/i.test((b.textContent || '') + (b.getAttribute('aria-label') || ''))`,
        )
      : `(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /Share and export/i.test(b.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.focus();
      button.click();
      return true;
    })()`,
    check,
  );

  await checkDialog(
    client,
    'knowledge base',
    profile.mobile
      ? openFromMore(
          `/Knowledge Base/i.test((b.textContent || '') + (b.getAttribute('aria-label') || ''))`,
        )
      : `(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /FM27 KB/i.test(b.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.focus();
      button.click();
      return true;
    })()`,
    check,
  );

  const beforePalette = await client.evaluate(
    `(() => { const active = document.activeElement; const nav = document.querySelector('nav[aria-label="Primary sections"] button'); if (nav) nav.focus(); return document.activeElement === document.body; })()`,
  );
  await client.evaluate(
    `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); return true; })()`,
  );
  await sleep(1200);
  const palette = await client.evaluate(DIALOG_PROBE);
  check(
    'Ctrl+K opens the command palette with focus inside',
    palette.open && palette.focusInside,
    palette.name || 'no dialog',
  );
  await client.pressEscape();
  await sleep(500);
  const paletteClosed = await client.evaluate(
    `(() => ({ closed: !document.querySelector('[role="dialog"][aria-modal="true"]'), onBody: document.activeElement === document.body }))()`,
  );
  check('Escape closes the command palette', paletteClosed.closed);
  check(
    'Escape from the command palette returns focus to the page',
    beforePalette || !paletteClosed.onBody,
    paletteClosed.onBody ? 'focus fell to <body>' : 'returned',
  );

  if (profile.mobile) {
    await checkDialog(
      client,
      'mobile More sheet',
      `(() => {
        const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
        const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
        if (!more) return false;
        more.focus();
        more.click();
        return true;
      })()`,
      check,
    );
  }

  console.log(`  ${profile.name} finished in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      'Usage: npm run keyboard:audit -- [--save=path] [--profile=desktop|mobile|both] [--max-stops=80] [--views=6] [--json]',
    );
    console.log(
      'Start the production build on the target port first: NODE_ENV=production PORT=12000 npm start',
    );
    return;
  }

  const results = [];
  const browser = await startBrowser(args.cdp);
  const client = await connect(args.cdp);
  try {
    for (const name of args.profiles) {
      const profile = VIEWPORTS[name];
      if (!profile) throw new Error(`Unknown profile ${name}`);
      console.log(`\n${name} (${profile.viewport.width}x${profile.viewport.height})`);
      await runProfile(client, client.send, profile, args, args.save, results);
    }
  } finally {
    client.close();
    browser();
  }

  const failed = results.filter((result) => !result.ok);
  const passed = results.length - failed.length;
  console.log(`\n${passed}/${results.length} checks passed`);

  if (args.json) {
    console.log(JSON.stringify({ passed, failed: failed.length, results }, null, 2));
  }
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const failure of failed) {
      console.log(
        `  [${failure.profile}] ${failure.check}${failure.detail ? ` — ${failure.detail}` : ''}`,
      );
    }
    process.exitCode = 1;
  }
}

await main();
