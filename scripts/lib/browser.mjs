/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared Chromium-over-CDP plumbing for the browser scripts: launching a
 * disposable browser, a small client, waiting on a condition, attaching files
 * to a hidden input, and capturing downloads. No npm dependency; Node 22
 * supplies WebSocket and fetch.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

/** Launches a throwaway headless Chromium and resolves once the endpoint answers. */
export async function startBrowser(cdp) {
  const port = new URL(cdp).port || '9222';
  const binary = process.env.CHROME_BIN || 'chromium';
  const profile = mkdtempSync(join(tmpdir(), 'fm27-browser-'));
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
    { stdio: 'ignore' },
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

/**
 * Connects to the page target. `listeners` receive every protocol event, which is
 * how callers watch console output, failed requests or downloads without the
 * client guessing which ones matter.
 */
export async function connect(cdp, { listeners = [] } = {}) {
  const extraListeners = new Set();
  const targets = await fetchJson(`${cdp}/json/list`);
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target available in the browser');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const consoleErrors = [];
  const httpErrors = [];
  const requests = [];
  let nextId = 0;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(
        message.params.args
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' ')
          .slice(0, 200),
      );
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        `uncaught: ${
          message.params.exceptionDetails?.exception?.description?.split('\n')[0] ||
          message.params.exceptionDetails?.text ||
          'error'
        }`.slice(0, 200),
      );
    }
    if (message.method === 'Network.responseReceived') {
      const { response } = message.params;
      requests.push({ url: response.url, status: response.status });
      if (response.status >= 400) {
        httpErrors.push(`${response.status} ${response.url.slice(0, 140)}`);
      }
    }
    if (
      message.method === 'Page.javascriptDialogOpening' &&
      message.params?.type === 'beforeunload'
    ) {
      // A live upload guard asks before the page unloads. Answer it, or the navigation
      // that follows never completes.
      ws.send(
        JSON.stringify({
          id: ++nextId,
          method: 'Page.handleJavaScriptDialog',
          params: { accept: true },
        }),
      );
    }
    for (const listener of listeners) listener(message);
    for (const listener of extraListeners) listener(message);
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

  const navigate = async (url, settleMs = 1500) => {
    await send('Page.enable');
    await send('Page.navigate', { url });
    await sleep(settleMs);
  };

  /** Polls a JS expression until it is truthy. */
  const waitFor = async (
    expression,
    { timeout = 30000, interval = 400, label = expression } = {},
  ) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const value = await evaluate(expression);
        if (value) return value;
      } catch {
        // the page may be mid-navigation
      }
      await sleep(interval);
    }
    throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
  };

  const KEY_CODES = {
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  };

  /** Sends one key press to the focused element, for keyboard-path checks. */
  const pressKey = async (key) => {
    const spec = KEY_CODES[key] || { key, code: key, windowsVirtualKeyCode: 0 };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
  };

  /** Attaches a real file to a hidden <input type="file">, the way a user's picker would. */
  const setFileInput = async (selector, filePath) => {
    // Chromium resolves the path against its own working directory, which may differ
    // from this script's when an earlier gate started the browser.
    const absolutePath = resolvePath(filePath);
    const document = await send('DOM.getDocument', { depth: -1, pierce: true });
    const found = await send('DOM.querySelector', {
      nodeId: document.result?.root?.nodeId,
      selector,
    });
    const nodeId = found.result?.nodeId;
    if (!nodeId) throw new Error(`No element matched ${selector}`);
    let response = await send('DOM.setFileInputFiles', { files: [absolutePath], nodeId });
    if (response.error) {
      // A re-render can leave the resolved node stale, so resolve the live element and
      // set the files through its object id instead.
      const handle = await send('Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(selector)})`,
      });
      const objectId = handle.result?.result?.objectId;
      if (!objectId) throw new Error(`No element matched ${selector}`);
      response = await send('DOM.setFileInputFiles', { files: [absolutePath], objectId });
    }
    if (response.error) {
      throw new Error(`Could not attach ${absolutePath}: ${response.error.message}`);
    }
    await sleep(300);
  };

  return {
    send,
    evaluate,
    navigate,
    waitFor,
    setFileInput,
    pressKey,
    pressEscape: () => pressKey('Escape'),
    pressTab: () => pressKey('Tab'),
    onEvent: (handler) => extraListeners.add(handler),
    offEvent: (handler) => extraListeners.delete(handler),
    consoleErrors,
    httpErrors,
    requests,
    close: () => ws.close(),
  };
}

/** Where each section lives in the mobile bar and the desktop rail. */
export const TAB_TARGETS = {
  'Hub & Analyst': { nav: 'Hub', tab: 'sync' },
  Squad: { nav: 'Squad', tab: 'squad' },
  'Tactics & Corners': { nav: 'Tactics', tab: 'tactics' },
  Transfers: { nav: 'Transfers', tab: 'recruitment' },
  Matches: { sheet: 'Matches', tab: 'matches' },
  Staff: { sheet: 'Staff', tab: 'staff' },
};

/** Clicks the visible navigation for a section and confirms the section rendered. */
export async function clickTab(evaluate, sleep, label) {
  const target = TAB_TARGETS[label];
  if (!target) throw new Error(`No navigation target for tab ${label}`);

  if (target.nav) {
    const clicked = await evaluate(`(() => {
      const nav = [...document.querySelectorAll('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]')].find((n) => n.getClientRects().length > 0);
      if (!nav) return false;
      const label = ${JSON.stringify(target.nav)};
      const buttons = [...nav.querySelectorAll('button')];
      const button = buttons.find((b) => b.textContent.trim() === label) || buttons.find((b) => b.textContent.trim().startsWith(label));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) return false;
  } else {
    const opened = await evaluate(`(() => {
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const more = nav ? [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === 'More') : null;
      if (!more) return false;
      more.click();
      return true;
    })()`);
    if (!opened) return false;
    await sleep(600);
    const picked = await evaluate(`(() => {
      const sheet = document.getElementById('mobile-more-sheet') || document;
      const button = [...sheet.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(target.sheet)}));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!picked) return false;
  }

  await sleep(700);
  const rendered = await evaluate(
    `document.querySelector('main[data-active-tab]')?.getAttribute('data-active-tab') ?? null`,
  );
  return rendered === target.tab;
}
