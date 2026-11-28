#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Renders the app with a real save and writes a normalised description of what
 * is on screen, so a refactor can be compared before and after: same markup,
 * same classes, same roles, same text. Roadmap R40 uses it on every pass.
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start         # in another shell
 *   npm run parity:snapshot -- --out=/tmp/before.json
 *   # refactor, rebuild
 *   npm run parity:snapshot -- --out=/tmp/after.json
 *   npm run parity:compare -- /tmp/before.json /tmp/after.json
 *
 * Run the snapshot twice on the same build first. Anything that moves between
 * those two runs is volatile (a decode timer, a relative date) and belongs in
 * the ignore list below, or the comparison will drown in noise.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { connect, sleep, startBrowser, TAB_TARGETS } from './lib/browser.mjs';

const ARGS = {
  url: 'http://localhost:12000',
  cdp: 'http://127.0.0.1:9222',
  save: null,
  out: null,
  profile: 'desktop',
  timeout: 300000,
};
for (const raw of process.argv.slice(2)) {
  const [key, value] = raw.split('=');
  if (key === '--url') ARGS.url = value;
  else if (key === '--cdp') ARGS.cdp = value;
  else if (key === '--save') ARGS.save = value;
  else if (key === '--out') ARGS.out = value;
  else if (key === '--profile') ARGS.profile = value;
  else if (key === '--timeout') ARGS.timeout = Number(value);
  else if (key === '--help') {
    console.log(
      'Usage: npm run parity:snapshot -- --out=before.json [--save=save.fm] [--profile=desktop|mobile]',
    );
    process.exit(0);
  } else throw new Error(`Unknown argument ${raw}`);
}

const PROFILES = {
  desktop: { width: 1440, height: 900, mobile: false, scale: 1 },
  mobile: { width: 390, height: 844, mobile: true, scale: 2 },
};

/**
 * The snapshot, taken inside the page. Attributes are sorted so order cannot
 * differ; text is trimmed and collapsed. Volatile strings are normalised by
 * the ignore list, which is deliberately small and explicit.
 */
const CAPTURE = `(rootSelector) => {
  const IGNORED_ATTRS = new Set(['style', 'src', 'srcset', 'nonce', 'integrity']);
  const normaliseText = (text) =>
    text
      .replace(/\\u2009|\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
      // Decode timings and "x minutes ago" counters move on their own.
      .replace(/\\b\\d+(\\.\\d+)?\\s?(s|ms)\\b/g, '<time>')
      .replace(/\\b\\d+\\s?(min|mins|minutes|hours|hours ago)\\b/g, '<ago>')
      .replace(/\\b\\d{1,2}:\\d{2}(:\\d{2})?\\b/g, '<clock>');

  const walk = (node, depth, insideNumeric = false) => {
    if (node.nodeType === 3) {
      let text = normaliseText(node.nodeValue || '');
      // The save receipt counts seconds since the decode in a tabular span, and
      // that number moves between two runs of the same build.
      if (insideNumeric && /^\\d+$/.test(text)) text = '<n>';
      return text ? { t: 'text', v: text } : null;
    }
    if (node.nodeType !== 1) return null;
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'link') return null;
    const attrs = [...el.attributes]
      .filter((attr) => !IGNORED_ATTRS.has(attr.name))
      .map((attr) => [attr.name, attr.value])
      .sort((a, b) => a[0].localeCompare(b[0]));
    // The decode progress card and the sync pill appear and disappear while a save
    // is still being read, which pushes every section down. Live activity, not layout.
    const role = el.getAttribute('role');
    const elClass = el.getAttribute('class') || '';
    if (role === 'status' && el.getAttribute('aria-live') === 'polite' && elClass.includes('space-y-2.5')) {
      return null;
    }
    const pillButton = el.querySelector(':scope > button');
    if (pillButton && /^(View Sync|Resume)$/.test((pillButton.textContent || '').trim())) {
      return null;
    }
    // The header sync button swaps its icon and label while a sync runs. That is
    // live activity, not layout, and it differs between two runs of one build.
    const stateLabel = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
    if (/sync immediately|upload progress/.test(stateLabel)) {
      return { t: 'el', tag, attrs: [['data-stateful', 'sync']], children: [] };
    }
    const numeric = (el.getAttribute('class') || '').includes('tabular-nums');
    const children = [];
    for (const child of el.childNodes) {
      const captured = walk(child, depth + 1, insideNumeric || numeric);
      if (captured) children.push(captured);
    }
    return { t: 'el', tag, attrs, children };
  };

  const root = document.querySelector(rootSelector);
  if (!root) return null;
  return walk(root, 0);
}`;

const OPENERS = {
  'share sheet': `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /Share and export/i.test(b.getAttribute('aria-label') || ''));
    if (!button) return 'missing';
    button.click();
    return 'opened';
  })()`,
  'knowledge base': `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /FM27 KB/i.test(b.getAttribute('aria-label') || ''));
    if (!button) return 'missing';
    button.click();
    return 'opened';
  })()`,
  'command palette': `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    return 'opened';
  })()`,
  'player sheet': `(() => {
    const row = document.querySelector('main table tbody tr[tabindex]');
    if (row) { row.click(); return 'opened'; }
    const card = [...document.querySelectorAll('main button')].find((b) => b.getClientRects().length > 0 && /\\u2605/.test(b.textContent || ''));
    if (card) { card.click(); return 'opened'; }
    return 'missing';
  })()`,
};

/**
 * The header sync button spins while a background sync runs, which makes the
 * header differ between two runs of the same build. Wait for it to go idle.
 */
async function settle(client) {
  await client
    .waitFor(
      `!document.querySelector('button[title="View active .fm save upload progress"],button[aria-label="View active .fm save upload progress"]')`,
      {
        timeout: 60000,
        interval: 500,
        label: 'the header sync button to go idle',
      },
    )
    .catch(() => null);
  await sleep(800);
}

async function main() {
  if (!ARGS.save) throw new Error('Pass --save=<file.fm>; the snapshot needs a loaded save.');
  if (!ARGS.out) throw new Error('Pass --out=<file.json>.');

  const profile = PROFILES[ARGS.profile];
  if (!profile) throw new Error(`Unknown profile ${ARGS.profile}`);

  const browser = await startBrowser(ARGS.cdp);
  const client = await connect(ARGS.cdp);
  const snapshot = { profile: ARGS.profile, sections: {}, overlays: {} };

  try {
    await client.send('Page.bringToFront').catch(() => null);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: profile.width,
      height: profile.height,
      deviceScaleFactor: profile.scale,
      mobile: profile.mobile,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: profile.mobile });
    await client.navigate('about:blank', 400);
    await client.send('Storage.clearDataForOrigin', {
      origin: new URL(ARGS.url).origin,
      storageTypes: 'all',
    });
    await client.navigate(ARGS.url, 3000);

    await client.waitFor(`!!document.querySelector('input[accept=".fm"]')`, {
      timeout: 30000,
      interval: 500,
      label: 'the import input',
    });
    await client.setFileInput('input[accept=".fm"]', ARGS.save);
    await client.waitFor(`/(\\d+)\\s*First Team/.test(document.body.innerText || '')`, {
      timeout: ARGS.timeout,
      interval: 1500,
      label: 'the squad after import',
    });
    // The background finishing pass draws a banner that disappears when it ends.
    // Capturing while it runs makes the snapshot depend on decode speed.
    await client.waitFor(`!/finishing in background/i.test(document.body.innerText || '')`, {
      timeout: ARGS.timeout,
      interval: 1500,
      label: 'the background finishing pass to end',
    });
    await sleep(3000);

    for (const tab of Object.keys(TAB_TARGETS)) {
      const target = TAB_TARGETS[tab];
      if (target.nav) {
        await client.evaluate(`(() => {
          const nav = [...document.querySelectorAll('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]')].find((n) => n.getClientRects().length > 0);
          const button = [...nav.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(target.nav)}));
          button?.click();
          return true;
        })()`);
      } else {
        await client.evaluate(`(() => {
          const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
          const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
          more?.click();
          return true;
        })()`);
        await sleep(600);
        await client.evaluate(`(() => {
          const sheet = document.getElementById('mobile-more-sheet') || document;
          const button = [...sheet.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(target.sheet)}));
          button?.click();
          return true;
        })()`);
      }
      await sleep(1400);
      const rendered = await client.evaluate(
        `document.querySelector('main[data-active-tab]')?.getAttribute('data-active-tab') ?? null`,
      );
      if (rendered !== target.tab) {
        console.log(`  ${tab}: did not render (${rendered})`);
        snapshot.sections[tab] = null;
        continue;
      }
      snapshot.sections[tab] = {
        main: await client.evaluate(`(${CAPTURE})('main')`),
        header: await client.evaluate(`(${CAPTURE})('header')`),
      };
      const size = JSON.stringify(snapshot.sections[tab]).length;
      console.log(`  ${tab}: captured (${Math.round(size / 1024)} KiB)`);
    }

    for (const [label, opener] of Object.entries(OPENERS)) {
      const state = await client.evaluate(opener);
      await sleep(1400);
      await settle(client);
      const captured =
        state === 'opened'
          ? await client.evaluate(`(${CAPTURE})('[role="dialog"][aria-modal="true"]')`)
          : null;
      snapshot.overlays[label] = { state, tree: captured };
      console.log(`  ${label}: ${state}${captured ? ' (captured)' : ''}`);
      await client.pressEscape();
      await sleep(500);
    }
  } finally {
    client.close();
    browser();
  }

  mkdirSync(dirname(ARGS.out), { recursive: true });
  writeFileSync(ARGS.out, JSON.stringify(snapshot, null, 1));
  console.log(`\nwrote ${ARGS.out}`);
}

await main();
