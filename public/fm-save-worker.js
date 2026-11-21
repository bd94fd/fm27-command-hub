/**
 * FM27 Command Hub — Browser Web Worker for local FM26/FM27 .fm Save Parsing.
 *
 * Uses Pyodide 3.14 (with native Python 3.14 zstd/zlib support) + fmsave (0.14.1)
 * + zero-copy WORKERFS so large 50–300 MB .fm save files are mounted and read
 * directly from disk inside the browser with zero network upload and zero ArrayBuffer copies.
 */

const PYODIDE_VERSION = '314.0.7';
const FMSAVE_VERSION = '0.14.1';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const MOUNT_DIR = '/mnt_save';

let pyodide = null;
let bootPromise = null;
let mapperModule = null;

const yieldTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function ensureBooted(reply, origin) {
  if (pyodide && mapperModule) return pyodide;
  if (!bootPromise) {
    bootPromise = (async () => {
      reply({
        type: 'stage',
        stage: 'boot',
        step: 'Init 1/2',
        label: `Booting local WebAssembly Python 3.14 runtime (Pyodide ${PYODIDE_VERSION})...`,
      });
      const { loadPyodide } = await import(PYODIDE_INDEX_URL + 'pyodide.mjs');
      const instance = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

      // Protect WORKERFS reads if the file is modified while being read
      const ops = instance.FS.filesystems.WORKERFS.stream_ops;
      const origRead = ops.read;
      ops.read = function (...args) {
        try {
          return origRead.apply(this, args);
        } catch (err) {
          if (err instanceof instance.FS.ErrnoError) throw err;
          throw new instance.FS.ErrnoError(29);
        }
      };

      reply({
        type: 'stage',
        stage: 'install',
        step: 'Init 2/2',
        label: `Loading fmsave ${FMSAVE_VERSION} decoder in browser (zero server upload)...`,
      });
      await instance.loadPackage('micropip');
      const micropip = instance.pyimport('micropip');
      await micropip.install(`fmsave==${FMSAVE_VERSION}`);

      const mapperUrl = new URL('/fm-save-mapper.py?v=9', origin || self.location.origin).href;
      const mapperSource = await (await fetch(mapperUrl, { cache: 'no-cache' })).text();
      instance.FS.writeFile('/home/pyodide/fm_save_mapper.py', mapperSource);
      mapperModule = instance.pyimport('fm_save_mapper');

      pyodide = instance;
      return instance;
    })().catch((err) => {
      bootPromise = null;
      pyodide = null;
      mapperModule = null;
      throw err;
    });
  }
  return bootPromise;
}

function safeUnmount(instance) {
  if (!instance) return;
  try {
    instance.FS.unmount(MOUNT_DIR);
  } catch {
    // ignore
  }
}

self.onmessage = async (event) => {
  const { type, file, requestId, clubHint, scope, origin } = event.data || {};
  const reply = (payload) => self.postMessage({ ...payload, requestId });

  if (type === 'warmup') {
    try {
      await ensureBooted(reply, origin);
      reply({ type: 'ready', fmsaveVersion: FMSAVE_VERSION, pyodideVersion: PYODIDE_VERSION });
    } catch (err) {
      reply({
        type: 'error',
        message: err?.message || 'Could not initialize the local fmsave WebAssembly engine.',
      });
    }
    return;
  }

  if ((type === 'parse_fm' || type === 'parse') && file) {
    let instance = null;
    let activeStep = 'Initialization';
    try {
      instance = await ensureBooted(reply, origin);

      // Mount the browser File directly via zero-copy WORKERFS (no memory copying!)
      activeStep = 'Step 1/6 (Mounting save directly via WORKERFS)';
      safeUnmount(instance);
      instance.FS.mkdirTree(MOUNT_DIR);
      instance.FS.mount(
        instance.FS.filesystems.WORKERFS,
        { files: [file] },
        MOUNT_DIR
      );
      const savePath = `${MOUNT_DIR}/${file.name}`;

      const totalMb = ((file.size || 0) / (1024 * 1024)).toFixed(1);
      reply({
        type: 'stage',
        stage: 'read',
        step: 'Step 1/6',
        label: `Step 1/6: Opening ${file.name} (${totalMb} MB) via zero-copy WORKERFS...`,
      });
      await yieldTick();

      // Step 1/6: Open archive, borrow game_db ONCE, read metadata & managed club
      const metaJson = mapperModule.step_open(savePath, clubHint || '');
      const meta = JSON.parse(metaJson);

      // Step 2/6: Group 1 — All 52 attributes, traits & Scout Report Badges
      activeStep = 'Step 2/6 (Extracting 52 attributes, traits & Scout Badges)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Step 2/6',
        label: `Step 2/6: Opened ${meta.game} (${meta.gameDateDmy || 'live'} · ${meta.clubName}) — extracting 52 attributes, traits & Scout Badges...`,
      });
      await yieldTick();
      const pSummary = JSON.parse(mapperModule.step_players());

      // Step 3/6: Groups 3–4 — Staff, 12m finances, facilities & time-capped free-agent scan
      activeStep = 'Step 3/6 (Reading staff, 12m finances, facilities & recruitment targets)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Step 3/6',
        label: `Step 3/6: Reading staff, 12-month cash runway, facilities & scanning free-agent/expiring targets (≤8s cap)...`,
      });
      await yieldTick();
      mapperModule.step_club_extras_and_release_gamedb();

      // Step 4/6: Group 2 — Season stats, Last-5 form ratings & career history
      activeStep = 'Step 4/6 (Reading season stats, Last-5 form & career history)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Step 4/6',
        label: `Step 4/6: Extracted ${pSummary.playerCount} players — matching season stats, Last-5 form & career history...`,
      });
      await yieldTick();
      mapperModule.step_season_stats();

      // Step 5/6: Group 2 — Match results, team xG/shots/possession & upcoming schedule
      activeStep = 'Step 5/6 (Reading match results, team xG & schedule)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Step 5/6',
        label: `Step 5/6: Reading match results, team xG/shots/possession & upcoming fixtures from ${meta.gameDateDmy || 'save date'}...`,
      });
      await yieldTick();
      const fixSummary = JSON.parse(mapperModule.step_fixtures());

      // Step 6/6: Live league standings & finish
      activeStep = 'Step 6/6 (Building live league standings)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Step 6/6',
        label: `Step 6/6: Found ${fixSummary.playedCount} results & ${fixSummary.upcomingCount} fixtures — building live league table...`,
      });
      await yieldTick();
      const parsed = JSON.parse(mapperModule.step_league_table_and_finish());

      if (parsed && parsed.meta) {
        parsed.meta.fileName = file.name;
        parsed.meta.fileSizeMb = Number(((file.size || 0) / (1024 * 1024)).toFixed(2));
        parsed.meta.decodedAtIso = new Date().toISOString();
        if (scope) parsed.meta.importScope = scope;
        parsed.meta.mountMode = 'WORKERFS';
      }

      safeUnmount(instance);
      reply({ type: 'result', data: parsed });
    } catch (err) {
      if (mapperModule) {
        try {
          mapperModule.step_close();
        } catch {
          // ignore
        }
      }
      if (instance) safeUnmount(instance);

      const rawMsg = err?.message || String(err);
      let friendly = `${activeStep} failed: ${rawMsg}`;
      if (/NotAFmSaveError/i.test(rawMsg)) {
        friendly = 'This file is not a valid Football Manager (.fm) save file.';
      } else if (/UnsupportedGameError/i.test(rawMsg)) {
        friendly = `This .fm save comes from an unsupported Football Manager version/build. fmsave 0.14.1 supports FM26 and FM27 saves.`;
      } else if (/CorruptSaveError/i.test(rawMsg)) {
        friendly = 'The .fm save appears incomplete or still being written by Football Manager. Save again or copy the file first.';
      } else if (/MemoryError|out of memory|abort\(/i.test(rawMsg)) {
        friendly = `Browser ran out of WebAssembly memory during ${activeStep}. Close background tabs or try on desktop.`;
      }
      reply({ type: 'error', message: friendly });
    }
  }
};
