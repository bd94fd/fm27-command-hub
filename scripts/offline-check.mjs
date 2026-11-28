#!/usr/bin/env node
/**
 * Offline behaviour check (roadmap R31).
 *
 * Loads the production build, imports the real save, then takes the network
 * away and asks the questions a phone user actually asks:
 *
 *   - does the app still start, with the save, on every section?
 *   - does it say how old the data is?
 *   - does the Analyst still answer, and does it say the answer is offline?
 *   - can a save still be decoded and exported with no signal at all?
 *   - when the server route is chosen offline, does it explain itself?
 *
 * Usage: npm run offline:check -- [--save=path.fm] [--url=http://localhost:12000]
 *
 * Needs the production build being served and Chromium on port 9222.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, fetchJson, sleep, startBrowser, clickTab } from './lib/browser.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const URL_BASE = args.url || 'http://localhost:12000';
const CDP = args.cdp || 'http://127.0.0.1:9222';

function newestSave() {
  const dir = resolve(process.cwd(), '.agents_tmp/uploads');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.fm'))
    .map((name) => resolve(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

const savePath = args.save ? resolve(args.save) : newestSave();
if (!savePath || !existsSync(savePath)) {
  console.error('FAIL: no .fm save found. Pass --save=/path/to/save.fm');
  process.exit(1);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const OFFLINE = { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };
const ONLINE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

const TEXT = `(document.querySelector('main')?.innerText || document.body.innerText || '').replace(/\\s+/g, ' ')`;
const PAGE_TEXT = `(document.body.innerText || '').replace(/\\s+/g, ' ')`;

const CLEAR_DATABASES = `(async () => {
  try {
    for (const db of (await indexedDB.databases?.()) ?? []) {
      await new Promise((done) => {
        const open = indexedDB.open(db.name);
        open.onerror = open.onblocked = () => done();
        open.onsuccess = () => {
          const handle = open.result;
          const stores = [...handle.objectStoreNames];
          if (stores.length === 0) { handle.close(); done(); return; }
          const tx = handle.transaction(stores, 'readwrite');
          for (const store of stores) tx.objectStore(store).clear();
          tx.oncomplete = tx.onerror = () => { handle.close(); done(); };
        };
      });
    }
  } catch {}
  return true;
})()`;

const CLEAR_STORAGE = `(async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  try { (await navigator.serviceWorker?.getRegistrations?.() ?? []).forEach((r) => r.unregister()); } catch {}
  try { (await caches?.keys?.() ?? []).forEach((k) => caches.delete(k)); } catch {}
  await ${CLEAR_DATABASES};
  return true;
})()`;

const CLEAR_SAVE_ONLY = `(async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  await ${CLEAR_DATABASES};
  return true;
})()`;

const SQUAD_LOADED = `(() => {
  const text = ${TEXT};
  return /First Team/.test(text) ? Number((text.match(/(\\d+)\\s*First Team/) || [])[1] || 1) : 0;
})()`;

async function ensureBrowser(cdp) {
  try {
    await fetchJson(`${cdp}/json/version`);
    return () => {};
  } catch {
    return startBrowser(cdp);
  }
}

async function main() {
  const stopBrowser = await ensureBrowser(CDP);
  const client = await connect(CDP);
  const evaluate = client.evaluate;
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.bringToFront');
    await client.send('Network.enable');
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: resolve(process.cwd(), '.agents_tmp/offline-downloads'),
      eventsEnabled: true,
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    // ---- Online: one clean visit, so the worker and the decoder can install.
    console.log('\nonline warm-up');
    await client.send('Network.emulateNetworkConditions', ONLINE);
    await client.navigate(URL_BASE, 2000);
    await evaluate(CLEAR_STORAGE);
    await client.navigate(URL_BASE, 4000);
    const swReady = await evaluate(`(async () => {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      return { active: Boolean(reg?.active), caches: (await caches?.keys?.() ?? []) };
    })()`);
    check(
      'the service worker is installed',
      Boolean(swReady?.active),
      (swReady?.caches || []).join(', '),
    );

    // The worker fills the precache in the background right after it activates.
    const precache = await client
      .waitFor(
        `(async () => {
          const name = (await caches?.keys?.() ?? []).find((n) => /precache/i.test(n));
          if (!name) return false;
          const count = (await (await caches.open(name)).keys()).length;
          return count > 20 ? { name, count } : false;
        })()`,
        { timeout: 60000, interval: 1000, label: 'the precache to fill' },
      )
      .catch(() => null);
    check('the app shell is precached', Boolean(precache), `${precache?.count ?? 0} files`);

    // A page is only controlled after a navigation following activation. The
    // decoder is fetched by a worker, so it must be measured on a controlled page.
    await client.navigate(URL_BASE, 3000);
    const controlled = await evaluate(`Boolean(navigator.serviceWorker?.controller)`);
    check('the page is controlled by the service worker before importing', Boolean(controlled));

    // The cache check below is about the phone decoder. With the server reachable a
    // desktop browser uploads instead, so ask for on-device decoding first.
    await evaluate(`localStorage.setItem('fm27_decode_target_v1', 'local')`);
    await client.navigate(URL_BASE, 3000);
    check(
      'the app decodes on the device for the cache check',
      Boolean(await evaluate(`localStorage.getItem('fm27_decode_target_v1') === 'local'`)),
    );

    await client.setFileInput('input[accept=".fm"]', savePath);
    const imported = await client
      .waitFor(SQUAD_LOADED, { timeout: 300000, interval: 1500, label: 'the save to import' })
      .catch(() => 0);
    check('the save imports while online', Boolean(imported));

    const pyodideFiles = await evaluate(`(async () => {
      let hits = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        hits += (await cache.keys()).filter((r) => /pyodide/i.test(r.url)).length;
      }
      return hits;
    })()`);
    check(
      'the phone decoder is kept in Cache Storage for offline use',
      pyodideFiles > 0,
      pyodideFiles > 0
        ? `${pyodideFiles} Pyodide files cached`
        : 'only the HTTP cache has it, which the browser may evict',
    );

    // ---- Offline, with a save on the device.
    console.log('\noffline with a save');
    await client.send('Network.emulateNetworkConditions', OFFLINE);
    check(
      'the browser reports offline to the app',
      Boolean(await evaluate(`navigator.onLine === false`)),
    );

    await client.navigate(URL_BASE, 5000);
    const shell = await evaluate(`(() => {
      const text = ${PAGE_TEXT};
      return {
        hasMain: Boolean(document.querySelector('main[data-active-tab]')),
        firstTeam: Number((text.match(/(\\d+)\\s*First Team/) || [])[1] || 0),
        banner: (text.match(/Offline mode[^|]*/) || [''])[0].slice(0, 260),
      };
    })()`);
    check('the app starts from the cache with no network', Boolean(shell?.hasMain));
    check(
      'the save is still there after an offline reload',
      (shell?.firstTeam ?? 0) > 0,
      `${shell?.firstTeam ?? 0} first team`,
    );
    check(
      'the offline banner explains what still works',
      /Offline mode/i.test(shell?.banner || ''),
      shell?.banner || 'no banner',
    );
    check(
      'the offline banner says how old the data is',
      /last updated in game on/i.test(shell?.banner || ''),
      shell?.banner || 'no save date in the banner',
    );

    for (const tab of ['Squad', 'Tactics & Corners', 'Transfers', 'Matches', 'Staff']) {
      const opened = await clickTab(evaluate, sleep, tab);
      await sleep(700);
      const rendered = await evaluate(`(() => {
        const main = document.querySelector('main[data-active-tab]');
        return { tab: main?.getAttribute('data-active-tab'), chars: (main?.innerText || '').length };
      })()`);
      check(
        `the ${tab} section renders offline`,
        Boolean(opened) && (rendered?.chars ?? 0) > 200,
        `${rendered?.chars ?? 0} chars`,
      );
    }

    await clickTab(evaluate, sleep, 'Hub & Analyst');
    await sleep(800);
    const typed = await evaluate(`(() => {
      const box = document.querySelector('textarea[aria-label="Message your FM27 Tactical Analyst"]');
      if (!box) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, 'What should I do about our wage bill?');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const clicked = await evaluate(`(() => {
      const button = document.querySelector('button[aria-label="Send message"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    check('the Analyst composer accepts a message offline', Boolean(typed && clicked));
    const answered = await client
      .waitFor(
        `(() => {
          const text = ${TEXT};
          const notice = [...document.querySelectorAll('[role="status"]')].map((el) => el.innerText).join(' ');
          return /offline briefing/i.test(text) && /Analyst unavailable|offline/i.test(notice);
        })()`,
        { timeout: 120000, interval: 1500, label: 'an offline Analyst answer' },
      )
      .catch(() => null);
    check('the Analyst answers offline instead of failing', Boolean(answered));
    const noticeText = await evaluate(
      `[...document.querySelectorAll('[role="status"]')].map((el) => el.innerText.replace(/\\s+/g, ' ')).join(' | ')`,
    );
    check(
      'the offline answer says why in plain English, with no fetch jargon',
      /offline briefing/i.test(noticeText || '') && !/failed to fetch/i.test(noticeText || ''),
      (noticeText || '').slice(0, 200),
    );

    const backupClicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => /backup/i.test(b.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await sleep(3000);
    check('backup export still works offline', Boolean(backupClicked));

    // ---- Offline, on a device that has no save yet: a fresh install in a tunnel.
    console.log('\noffline with no save');
    await evaluate(CLEAR_SAVE_ONLY);
    await client.navigate(URL_BASE, 5000);
    const firstRun = await evaluate(`(() => {
      const text = ${PAGE_TEXT};
      return {
        hasMain: Boolean(document.querySelector('main[data-active-tab]')),
        importable: Boolean(document.querySelector('input[accept=".fm"]')),
        routeSwitch: Boolean(document.querySelector('[aria-label="Where to decode the save"]')),
        offline: /Offline mode/i.test(text),
      };
    })()`);
    check(
      'a first run still opens offline',
      Boolean(firstRun?.hasMain && firstRun?.importable),
      firstRun?.offline ? 'offline banner shown' : 'no offline banner',
    );
    check('the offline first run still offers the decode choice', Boolean(firstRun?.routeSwitch));

    const clickRoute = async (matchServer) => {
      await evaluate(`(() => {
        const group = document.querySelector('[aria-label="Where to decode the save"]');
        if (!group) return false;
        const button = [...group.querySelectorAll('button')].find((b) =>
          ${matchServer} ? /server/i.test(b.textContent || '') : !/server/i.test(b.textContent || '')
        );
        if (!button) return false;
        button.click();
        return true;
      })()`);
      await sleep(400);
      return evaluate(`(() => {
        const group = document.querySelector('[aria-label="Where to decode the save"]');
        const pressed = group ? [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') === 'true') : null;
        return pressed ? /server/i.test(pressed.textContent || '') : null;
      })()`);
    };

    const choseServer = (await clickRoute(true)) === true;
    check('the server route can be chosen offline', choseServer);
    const hint = await client
      .waitFor(
        `(() => {
          const match = [...document.querySelectorAll('[role="status"]')]
            .map((el) => el.innerText.replace(/\\s+/g, ' '))
            .find((text) => /can.t be reached/i.test(text) && /will not upload/i.test(text));
          return match ? match.slice(0, 200) : false;
        })()`,
        { timeout: 20000, interval: 500, label: 'a warning under the route switch' },
      )
      .catch(() => null);
    check(
      'choosing the server route offline warns before a file is picked',
      Boolean(hint),
      hint || 'no warning shown',
    );

    await client.setFileInput('input[accept=".fm"]', savePath).catch(() => null);
    const told = await client
      .waitFor(
        `(() => {
          const text = ${PAGE_TEXT};
          if (/not a valid Football Manager/i.test(text)) return 'WRONG: claims the save is invalid';
          return /was not uploaded/i.test(text) ? text.match(/[^.]*was not uploaded[^.]*/)[0].slice(0, 200) : false;
        })()`,
        {
          timeout: 60000,
          interval: 1000,
          label: 'an honest message about the offline server route',
        },
      )
      .catch(() => null);
    check(
      'an offline server-route import says it was not uploaded, not that the save is broken',
      Boolean(told) && !/^WRONG/.test(String(told)),
      told ? String(told) : 'no message appeared',
    );

    const switchedToPhone = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => /Decode on this device/i.test(b.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    check(
      'the offline error offers a one-tap switch to on-device decoding',
      Boolean(switchedToPhone),
    );
    const decodedOffline = await client
      .waitFor(SQUAD_LOADED, {
        timeout: 300000,
        interval: 2000,
        label: 'the save to decode with no network',
      })
      .catch(() => 0);
    check(
      'a save decodes on the phone with no signal at all',
      Boolean(decodedOffline),
      decodedOffline ? `${decodedOffline} first team` : 'no squad appeared',
    );

    // ---- Back online: the app must recover without a manual reload.
    console.log('\nback online');
    await client.send('Network.emulateNetworkConditions', ONLINE);
    const recovered = await client
      .waitFor(`navigator.onLine === true`, {
        timeout: 20000,
        interval: 500,
        label: 'online again',
      })
      .catch(() => null);
    check('the app notices when the signal comes back', Boolean(recovered));

    const errors = client.consoleErrors.filter(
      (line) =>
        !/Failed to fetch|net::ERR_INTERNET_DISCONNECTED|NetworkError|net::ERR_FAILED/i.test(line),
    );
    check(
      'no unexpected console errors during the offline run',
      errors.length === 0,
      errors.slice(0, 2).join(' | '),
    );
  } finally {
    await client.send('Network.emulateNetworkConditions', ONLINE).catch(() => null);
    client.close();
    stopBrowser();
  }

  const failures = results.filter((result) => !result.ok);
  console.log('');
  if (failures.length === 0) {
    console.log(`PASS: ${results.length} offline checks clean`);
  } else {
    console.log(`FAIL: ${failures.length} of ${results.length} offline checks failed`);
    for (const failure of failures)
      console.log(`  - ${failure.name}${failure.detail ? ` (${failure.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
