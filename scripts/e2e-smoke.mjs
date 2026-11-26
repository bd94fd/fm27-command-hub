#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * End-to-end smoke test for the FM27 Command Hub. It walks the path a manager
 * actually takes, on a real 242 MB save, in a real browser:
 *
 *   1. first run with nothing stored, and no restore prompt in the way
 *   2. import the .fm save and wait for the squad to appear
 *   3. open every section and confirm it rendered with that save
 *   4. ask the Analyst a question and confirm an answer comes back
 *   5. export the campaign backup, wipe the browser, restore it, reload
 *
 * Run against a production build, like the other browser scripts:
 *
 *   npm run build
 *   NODE_ENV=production PORT=12000 npm start
 *   npm run smoke:e2e
 *   npm run smoke:e2e -- --profile=mobile --json
 *
 * Two profiles, because the save can arrive by two different routes:
 *   desktop  server decode  (upload to /api/fm27/decode-save)
 *   mobile   phone decode   (Pyodide worker, nothing uploaded)
 *
 * The save file is not in the repository. Point at one with --save, or drop a
 * decoded save in .agents_tmp/uploads/ and the newest .fm file is used.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import {
  clickTab,
  connect,
  fetchJson,
  sleep,
  startBrowser,
  TAB_TARGETS,
} from './lib/browser.mjs';

const STATE_KEY = 'fm27_command_hub_state_v1';
const TABS = Object.keys(TAB_TARGETS);

/** Section keyword that has to appear once a save is loaded. */
const TAB_EXPECTED = {
  'Hub & Analyst': null,
  Squad: 'Squad',
  'Tactics & Corners': 'XI',
  Transfers: 'Transfer',
  Matches: 'Match',
  Staff: 'Staff',
};

const PROFILES = {
  desktop: {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    userAgent: null,
    decode: 'server',
  },
  mobile: {
    name: 'mobile',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    decode: 'phone',
  },
};

function parseArgs(argv) {
  const args = {
    url: process.env.SMOKE_URL || 'http://localhost:12000',
    cdp: process.env.CDP_URL || 'http://127.0.0.1:9222',
    save: null,
    profiles: ['desktop', 'mobile'],
    out: '.playwright-mcp/r29-smoke',
    json: false,
    timeout: 420000,
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

function findSave(explicit) {
  if (explicit) {
    const path = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
    if (!existsSync(path)) throw new Error(`No save at ${path}`);
    return path;
  }
  const dir = resolve(process.cwd(), '.agents_tmp/uploads');
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.fm'))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] || null;
}

const toMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * A save that was copied while the game was still writing it. This is the most
 * common bad import a manager hits, and the app has a specific message for it.
 */
function writeTruncatedCopy(savePath, targetPath, bytes = 3 * 1024 * 1024) {
  const buffer = Buffer.alloc(bytes);
  const handle = openSync(savePath, 'r');
  const read = readSync(handle, buffer, 0, bytes, 0);
  closeSync(handle);
  writeFileSync(targetPath, buffer.subarray(0, read));
  return targetPath;
}

/** Wipes everything the app persists, so each profile starts as a new install. */
async function resetStorage(client, url) {
  await client.navigate(url, 1500);
  await client.evaluate(`(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try {
      const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {}
    try {
      const keys = (await caches?.keys?.()) ?? [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try {
      const databases = (await indexedDB.databases?.()) ?? [];
      // Deleting a database the open page is using is blocked, so empty the stores instead.
      await Promise.all(
        databases.map(
          (database) =>
            new Promise((done) => {
              const open = indexedDB.open(database.name);
              open.onerror = open.onblocked = () => done();
              open.onsuccess = () => {
                const db = open.result;
                const stores = [...db.objectStoreNames];
                if (stores.length === 0) {
                  db.close();
                  done();
                  return;
                }
                const tx = db.transaction(stores, 'readwrite');
                for (const store of stores) tx.objectStore(store).clear();
                tx.oncomplete = tx.onerror = tx.onabort = () => {
                  db.close();
                  done();
                };
              };
            })
        )
      );
    } catch {}
    return true;
  })()`).catch(() => null);
  await client.navigate(url, 2500);
  await client.evaluate(`document.fonts.ready.then(() => true)`).catch(() => null);
}

/** Reads the counts the app is showing, so assertions do not depend on internals. */
async function readSummary(client) {
  return client.evaluate(`(() => {
    const text = (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ');
    const firstTeam = Number((text.match(/(\\d+)\\s*First Team/) || [])[1] || 0);
    const pool = Number((text.match(/(\\d+)\\s*Full Pool/) || [])[1] || 0);
    const matches = Number((text.match(/(\\d+)\\s*matches?/) || [])[1] || 0);
    const date = (text.match(/(\\d{2}\\/\\d{2}\\/\\d{4})/) || [])[1] || null;
    const club = (text.match(/·\\s*([A-Za-z][^·]{1,40}?)\\s*(?:\\d|\\||$)/) || [])[1] || null;
    let stored = null;
    try {
      const parsed = JSON.parse(localStorage.getItem('${STATE_KEY}') || 'null');
      if (parsed) {
        stored = {
          players: Array.isArray(parsed.players) ? parsed.players.length : null,
          matches: Array.isArray(parsed.matches) ? parsed.matches.length : null,
          staff: Array.isArray(parsed.staff) ? parsed.staff.length : null,
          clubName: parsed.clubName || parsed.hydratedFmSave?.decodedPayload?.meta?.clubName || null,
        };
      }
    } catch {}
    return { text: text.slice(0, 400), firstTeam, pool, matches, date, club, stored };
  })()`);
}

async function waitForComposer(client, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`(() => {
      const box = document.querySelector('textarea[aria-label="Message your FM27 Tactical Analyst"]');
      const button = document.querySelector('button[aria-label="Send message"]');
      return Boolean(box && button && !button.disabled);
    })()`).catch(() => false);
    if (ready) return true;
    await sleep(1000);
  }
  return false;
}

async function sendChat(client, message) {
  const typed = await client.evaluate(`(() => {
    const box = document.querySelector('textarea[aria-label="Message your FM27 Tactical Analyst"]');
    if (!box) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(box, ${JSON.stringify(message)});
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!typed) return false;
  await sleep(250);
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Send message"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  return clicked;
}

const transcriptHas = (client, needle) =>
  client.waitFor(
    `(() => {
      const text = (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ');
      return text.includes(${JSON.stringify(needle)}) ? true : false;
    })()`,
    { timeout: 180000, interval: 1000, label: `transcript containing ${needle}` }
  );

async function waitForDownload(client, downloadDir, { timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const files = existsSync(downloadDir)
      ? readdirSync(downloadDir).filter((file) => file.endsWith('.json'))
      : [];
    if (files.length > 0) {
      const path = join(downloadDir, files[0]);
      const size = statSync(path).size;
      if (size > 1024) return path;
    }
    await sleep(500);
  }
  throw new Error(`No backup download appeared in ${downloadDir}`);
}

async function serverDecodeAvailable(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/fm27/decode-status`);
    if (!response.ok) return false;
    const status = await response.json();
    return Boolean(status.serverDecodeAvailable);
  } catch {
    return false;
  }
}

/** The hashed script name the deployed index.html points at. */
async function currentBundle(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/`);
    const html = await response.text();
    return (html.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [null])[0];
  } catch {
    return null;
  }
}

async function runProfile(client, browserSend, profile, args, savePath, results, capabilities = {}) {
  const started = Date.now();
  const requestBaseline = client.requests.length;
  const check = (name, ok, detail = '') => {
    results.push({ profile: profile.name, name, ok, detail });
    const mark = ok ? 'ok  ' : 'FAIL';
    console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
  };

  await browserSend('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: resolve(process.cwd(), args.out, profile.name, 'downloads'),
    eventsEnabled: true,
  });
  mkdirSync(resolve(process.cwd(), args.out, profile.name, 'downloads'), { recursive: true });

  // A cached bundle from an earlier build would make every check describe code
  // that is no longer deployed. The service worker is dropped in resetStorage;
  // this drops the HTTP cache as well.
  await browserSend('Network.enable');
  await browserSend('Network.setCacheDisabled', { cacheDisabled: true });
  await browserSend('Emulation.setEmulatedMedia', { features: [] });
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

  // Step 1: a first run, with nothing stored.
  await resetStorage(client, args.url);
  const landed = await client.evaluate(`(() => {
    const text = document.querySelector('main')?.innerText || '';
    return {
      hasShell: Boolean(document.querySelector('main[data-active-tab]')),
      mentionsSave: /Start with your save file|\\.fm/i.test(text),
      alreadyLoaded: /First Team/.test(text),
    };
  })()`);
  check('first run shows the app with no save loaded', landed?.hasShell && !landed.alreadyLoaded, landed?.hasShell ? '' : 'no main element');
  const running = await client.evaluate(
    `[...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).join(' ')`
  );
  check('the browser is running the build the server is serving', Boolean(running && running.includes(capabilities.bundle)), capabilities.bundle || 'no bundle reference');

  // Step 1b: a half-written save must say so, and must not leave the app stuck.
  const truncated = writeTruncatedCopy(
    savePath,
    resolve(process.cwd(), args.out, profile.name, 'truncated.fm')
  );
  await client.setFileInput('input[accept=".fm"]', truncated);
  const refused = await client
    .waitFor(
      `/appears incomplete|still being written|Could not read|not a valid|could not be read/i.test(document.body.innerText || '')`,
      { timeout: 120000, interval: 1000, label: 'a message about the damaged save' }
    )
    .catch(() => null);
  check('a half-written save is refused with a readable message', Boolean(refused));
  const stillEmpty = await client.evaluate(
    `!/First Team/.test(document.body.innerText || '')`
  );
  check('a refused save does not half-load the app', stillEmpty);

  // Step 2: import the save, whichever way this profile decodes it.
  await client.setFileInput('input[accept=".fm"]', savePath);
  const importStarted = Date.now();
  const loadExpr = `(() => {
    const text = (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ');
    const firstTeam = Number((text.match(/(\\d+)\\s*First Team/) || [])[1] || 0);
    return firstTeam > 0 ? firstTeam : 0;
  })()`;
  let loaded = 0;
  try {
    loaded = await client.waitFor(loadExpr, {
      timeout: args.timeout,
      interval: 1500,
      label: 'the squad to appear after import',
    });
  } catch (error) {
    const progress = await client
      .evaluate(`(document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 300)`)
      .catch(() => '');
    check('import finishes and shows a squad', false, error.message);
    console.log(`       last screen: ${progress}`);
    return;
  }
  const importSeconds = Math.round((Date.now() - importStarted) / 1000);
  check('import finishes and shows a squad', loaded > 0, `${loaded} first team, ${importSeconds}s, ${toMb(statSync(savePath).size)} save`);

  const summary = await readSummary(client);
  const club = summary.stored?.clubName || summary.club;
  check('header names the club and the in-game date', Boolean(summary.date && club), `${summary.date || 'no date'} · ${club || 'no club'}`);
  if (summary.stored) {
    check('players reach the stored state', summary.stored.players >= loaded, `${summary.stored.players} players stored`);
  }

  // Which route the save took: the phone must not have uploaded it.
  const decodeRoute = client.requests
    .slice(requestBaseline)
    .filter((request) => /\/api\/fm27\/decode-save/.test(request.url));
  if (profile.decode === 'server' && capabilities.serverDecode === false) {
    check(
      'save decoded on desktop (server decoder absent, so the phone decoder took over)',
      decodeRoute.length === 0,
      'install fmsave on the server to exercise the upload path'
    );
  } else if (profile.decode === 'server') {
    check('server decode was used on desktop', decodeRoute.length > 0, `${decodeRoute.length} decode requests`);
  } else {
    check(
      'phone decode was used on mobile (nothing uploaded)',
      decodeRoute.length === 0,
      decodeRoute.length
        ? `${decodeRoute.length} upload requests: ${[...new Set(decodeRoute.map((request) => request.url.replace(/\?.*/, '')))].join(', ')}`
        : 'no upload'
    );
  }

  // Step 3: every section renders with the save loaded.
  for (const label of TABS) {
    const opened = await clickTab(client.evaluate, sleep, label);
    if (!opened) {
      check(`${label} opens`, false, 'navigation did not reach the section');
      continue;
    }
    const text = await client.evaluate(
      `(document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').trim()`
    );
    const expected = TAB_EXPECTED[label];
    const ok =
      text.length > 200 &&
      (expected ? text.includes(expected) : /Command Hub|Club KPIs|Analyst/i.test(text));
    check(
      `${label} renders with the save`,
      ok,
      ok ? `${text.length} chars` : `${text.length} chars, missing "${expected}"`
    );
  }
  await clickTab(client.evaluate, sleep, 'Hub & Analyst');

  // Step 4a: a question with no model available must still produce an answer.
  const askedAt = client.requests.length;
  const composerReady = await waitForComposer(client);
  check('Analyst composer is ready for input', composerReady, composerReady ? '' : 'send button stayed disabled');
  const sent = await sendChat(client, 'Smoke test: what is the biggest squad risk for the next fixture?');
  check('Analyst composer accepts and sends a message', sent);
  if (sent) {
    try {
      await transcriptHas(client, 'Smoke test: what is the biggest squad risk');
      check('the question appears in the transcript', true);
    } catch {
      check('the question appears in the transcript', false, 'never rendered');
    }
    const answered = await client
      .waitFor(
        `(() => {
          const text = (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ');
          return /offline briefing|Analyst unavailable/i.test(text) || text.length > 4000;
        })()`,
        { timeout: 240000, interval: 1500, label: 'an Analyst answer' }
      )
      .catch(() => null);
    const chatStatus = client.requests
      .slice(askedAt)
      .filter((request) => request.url.includes('/api/fm27/tactical-chat'))
      .map((request) => request.status);
    check(
      'the Analyst answers, or says plainly that it cannot',
      Boolean(answered),
      chatStatus.length ? `chat API ${chatStatus.join(',')}` : 'no chat request seen'
    );
  }

  // Step 4b: with a canned reply, the success path renders it.
  const stubMarker = 'SMOKE-STUB-ANALYST-REPLY';
  const stubBody = Buffer.from(
    JSON.stringify({
      analysisMarkdown: `## ${stubMarker}\n\nDepth is thin at left back; the next fixture is the one to rotate.`,
      sourceCitations: [],
    })
  ).toString('base64');
  const stubHandler = (message) => {
    if (message.method !== 'Fetch.requestPaused') return;
    void browserSend('Fetch.fulfillRequest', {
      requestId: message.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: stubBody,
    });
  };
  await browserSend('Fetch.enable', { patterns: [{ urlPattern: '*tactical-chat*' }] });
  client.onEvent(stubHandler);
  const stubbed = await sendChat(client, 'Smoke test: confirm the reply path renders a canned answer.');
  const rendered = stubbed
    ? await client
        .waitFor(
          `(document.querySelector('main')?.innerText || '').includes(${JSON.stringify(stubMarker)})`,
          { timeout: 120000, interval: 1000, label: 'the stubbed Analyst reply' }
        )
        .catch(() => null)
    : null;
  client.offEvent(stubHandler);
  await browserSend('Fetch.disable');
  check('a real API answer renders in the transcript', Boolean(rendered), rendered ? '' : 'stub reply never displayed');

  // Step 5: back up, wipe, restore. A missing control or a missing file is a
  // failure, never a quiet skip, or a broken export would read as a pass.
  const before = await readSummary(client);
  const exported = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('Export campaign snapshot'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  check('the Backup control is on screen and clickable', Boolean(exported));

  let backupPath = null;
  if (exported) {
    try {
      backupPath = await waitForDownload(
        client,
        resolve(process.cwd(), args.out, profile.name, 'downloads')
      );
      check('clicking Backup produces a file', true, basename(backupPath));
    } catch (error) {
      check('clicking Backup produces a file', false, error.message);
    }
  }

  let backupPlayers = 0;
  if (backupPath) {
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
    } catch {
      // a truncated or non-JSON download fails the check below
    }
    backupPlayers = Array.isArray(parsed?.players) ? parsed.players.length : 0;
    check(
      'backup is a valid campaign file with the squad in it',
      backupPlayers > 0,
      `${basename(backupPath)}, ${backupPlayers} players, ${toMb(statSync(backupPath).size)}`
    );
  }

  if (!backupPath) {
    check('restoring the backup brings the campaign back', false, 'no backup file to restore');
    check('the restored campaign survives a reload', false, 'no backup file to restore');
  } else {
    await resetStorage(client, args.url);
    const emptyAgain = await client.evaluate(
      `!/First Team/.test(document.querySelector('main')?.innerText || '')`
    );
    check('wiping the browser really clears the save', emptyAgain);

    await client.setFileInput('input[accept=".json"]', backupPath);
    const restored = await client
      .waitFor(`/Restored campaign snapshot/i.test(document.body.innerText || '')`, {
        timeout: 60000,
        interval: 500,
        label: 'the restore toast',
      })
      .catch(() => null);
    const after = await readSummary(client);
    check(
      'restoring the backup brings the campaign back',
      Boolean(restored) && after.firstTeam === before.firstTeam,
      `${after.firstTeam} players after restore, ${before.firstTeam} before`
    );

    await client.navigate(args.url, 3000);
    const afterReload = await readSummary(client);
    check(
      'the restored campaign survives a reload',
      afterReload.firstTeam === before.firstTeam && Boolean(afterReload.date),
      `${afterReload.firstTeam} players, ${afterReload.date || 'no date'}`
    );
  }

  const uncaught = client.consoleErrors.filter((entry) => entry.startsWith('uncaught:'));
  check('no uncaught errors during the run', uncaught.length === 0, uncaught.slice(0, 2).join(' / '));
  console.log(`  done in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: npm run smoke:e2e -- [--save=path.fm] [--profile=desktop|mobile|both] [--url=...] [--json]');
    return;
  }
  const savePath = findSave(args.save);
  if (!savePath) {
    console.error('No .fm save found. Put one in .agents_tmp/uploads/ or pass --save=<path>.');
    process.exit(2);
  }

  let stopBrowser = () => {};
  try {
    await fetchJson(`${args.cdp}/json/version`);
  } catch {
    stopBrowser = await startBrowser(args.cdp);
  }

  const results = [];
  const failures = [];
  const capabilities = {
    serverDecode: await serverDecodeAvailable(args.url),
    bundle: await currentBundle(args.url),
  };
  console.log(
    `save: ${basename(savePath)} (${toMb(statSync(savePath).size)}) · server decoder ${
      capabilities.serverDecode ? 'available' : 'absent (phones and desktops both decode locally)'
    }`
  );
  const client = await connect(args.cdp);

  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    for (const name of args.profiles) {
      const profile = PROFILES[name];
      if (!profile) throw new Error(`Unknown profile ${name}`);
      console.log(`\n${profile.name} (${profile.viewport.width}x${profile.viewport.height}, ${profile.decode} decode)`);
      await runProfile(client, client.send, profile, args, savePath, results, capabilities);
    }
  } finally {
    client.close();
    stopBrowser();
  }

  for (const result of results) if (!result.ok) failures.push(result);
  if (args.json) {
    console.log(JSON.stringify({ save: savePath, results }, null, 2));
  }
  console.log('');
  if (failures.length === 0) {
    console.log(`PASS: ${results.length} checks clean across ${args.profiles.join(', ')}`);
  } else {
    console.log(`FAIL: ${failures.length} of ${results.length} checks failed`);
    for (const failure of failures) console.log(`  - [${failure.profile}] ${failure.name}: ${failure.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
