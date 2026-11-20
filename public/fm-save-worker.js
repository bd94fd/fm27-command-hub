/**
 * FM27 Command Hub — Browser Web Worker for local FM26/FM27 .fm Save Parsing.
 *
 * Uses Pyodide 314.0.7 (Python 3.14 with native zstd) + fmsave==0.14.1
 * + zero-copy WORKERFS mounted at /mnt so large 50–300+ MB .fm save files are
 * read directly from local disk without allocating a full-file JS ArrayBuffer.
 */

const PYODIDE_VERSION = '314.0.7';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const FMSAVE_REQUIREMENT = 'fmsave==0.14.1';
const MOUNT_POINT = '/mnt';

let pyodide = null;
let mapperModule = null;
let bootPromise = null;

const yieldTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function emitStage(reply, stage, step, label, percent) {
  reply({ type: 'stage', stage, step, label, percent });
}

async function ensureBooted(origin, reply) {
  if (pyodide && mapperModule) {
    return { instance: pyodide, mapper: mapperModule };
  }
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    emitStage(
      reply,
      'boot',
      'Init 1/2',
      'Loading local Python 3.14 WebAssembly runtime (native zstd)...',
      5,
    );
    const { loadPyodide } = await import(`${PYODIDE_INDEX_URL}pyodide.mjs`);
    const instance = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    // Protect WORKERFS reads so non-ErrnoError failures throw ErrnoError(29) (EIO)
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

    emitStage(
      reply,
      'install',
      'Init 2/2',
      `Installing ${FMSAVE_REQUIREMENT} binary reader & mapper...`,
      10,
    );
    await instance.loadPackage('micropip');
    const micropip = instance.pyimport('micropip');
    await micropip.install(FMSAVE_REQUIREMENT);

    const baseOrigin = origin || self.location.origin;
    const mapperUrl = new URL('/fm-save-mapper.py', baseOrigin).href;
    const mapperResp = await fetch(mapperUrl, { cache: 'no-cache' });
    if (!mapperResp.ok) {
      throw new Error(`Failed to fetch /fm-save-mapper.py (HTTP ${mapperResp.status}).`);
    }
    const mapperSource = await mapperResp.text();
    instance.FS.writeFile('/home/pyodide/fm_save_mapper.py', mapperSource);

    const mapper = instance.pyimport('fm_save_mapper');
    pyodide = instance;
    mapperModule = mapper;
    return { instance, mapper };
  })().catch((err) => {
    bootPromise = null;
    pyodide = null;
    mapperModule = null;
    throw err;
  });

  return bootPromise;
}

function safeUnmount(instance) {
  if (!instance) return;
  try {
    instance.FS.unmount(MOUNT_POINT);
  } catch {
    // Ignore when not mounted
  }
}

function classifyJsError(err, activeStep) {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const kind = err instanceof Error ? err.name : 'WorkerError';

  if (/NotAFmSaveError/i.test(rawMsg)) {
    return {
      error: 'This file is not a valid Football Manager (.fm) save file.',
      kind: 'NotAFmSaveError',
    };
  }
  if (/UnsupportedGameError/i.test(rawMsg)) {
    return {
      error:
        'This .fm save is from an unsupported Football Manager build. fmsave 0.14.1 supports FM26 and FM27 saves.',
      kind: 'UnsupportedGameError',
    };
  }
  if (/CorruptSaveError/i.test(rawMsg)) {
    return {
      error:
        'The .fm save appears incomplete or damaged. Wait for Football Manager to finish saving and try again.',
      kind: 'CorruptSaveError',
    };
  }
  if (/MemoryError|out of memory|abort\(/i.test(rawMsg)) {
    return {
      error: `Browser ran out of WebAssembly memory during ${activeStep}. Close background tabs or switch to 'Managed Club Only' scope.`,
      kind: 'MemoryError',
    };
  }
  if (rawMsg.includes('Failed to fetch') || rawMsg.includes('import')) {
    return {
      error:
        'Could not download the Pyodide/fmsave runtime from CDN. Check your internet connection or use JSON/HTML export.',
      kind,
    };
  }
  return {
    error: rawMsg || `Unexpected error during ${activeStep}.`,
    kind,
  };
}

function parseStepJson(rawJson, activeStep) {
  const parsed = JSON.parse(String(rawJson));
  if (!parsed || parsed.ok === false) {
    const err = new Error(parsed?.error || `${activeStep} failed.`);
    err.name = parsed?.kind || 'ParseError';
    throw err;
  }
  return parsed;
}

self.onmessage = async (event) => {
  const {
    type,
    file,
    scope = 'managed_only',
    clubHint = '',
    requestId,
    origin,
  } = event.data || {};

  const reply = (payload) => self.postMessage({ ...payload, requestId });

  if (type === 'warmup') {
    try {
      await ensureBooted(origin, reply);
      reply({
        type: 'ready',
        fmsaveVersion: '0.14.1',
        pyodideVersion: PYODIDE_VERSION,
      });
    } catch (err) {
      const classified = classifyJsError(err, 'Initialization');
      reply({
        type: 'error',
        error: classified.error,
        kind: classified.kind,
      });
    }
    return;
  }

  if ((type === 'parse' || type === 'parse_fm') && file) {
    let instance = null;
    let mapper = null;
    let activeStep = 'Initialization';

    try {
      const booted = await ensureBooted(origin, reply);
      instance = booted.instance;
      mapper = booted.mapper;

      // Step 1/6: Zero-copy WORKERFS mount at /mnt/<file.name>
      activeStep = 'Step 1/6 (Mounting .fm file)';
      emitStage(
        reply,
        'mount',
        'Step 1/6',
        `Step 1/6: Mounting ${file.name} locally via zero-copy WORKERFS...`,
        15,
      );
      await yieldTick();

      safeUnmount(instance);
      instance.FS.mkdirTree(MOUNT_POINT);
      instance.FS.mount(
        instance.FS.filesystems.WORKERFS,
        { files: [file] },
        MOUNT_POINT,
      );
      const savePath = `${MOUNT_POINT}/${file.name}`;

      // Step 2/6: Open save, enter shared game_db borrow, detect club, read meta & nations
      activeStep = 'Step 2/6 (Opening save & game_db)';
      emitStage(
        reply,
        'open',
        'Step 2/6',
        `Step 2/6: Opening ${file.name} & borrowing game_db section...`,
        25,
      );
      await yieldTick();
      const openRes = parseStepJson(
        mapper.step_open(savePath, scope || 'managed_only', clubHint || ''),
        activeStep,
      );
      const meta = openRes.meta || {};

      // Step 3/6: Extract players (club-scoped or scouting pool), season stats, and injuries
      activeStep = 'Step 3/6 (Players, season stats & injuries)';
      emitStage(
        reply,
        'players',
        'Step 3/6',
        `Step 3/6: Opened ${meta.game || 'FM'} (${meta.gameDateDmy || meta.gameDateIso || 'live'} · ${meta.clubName || 'Managed Club'}) — reading squad, attributes & season stats...`,
        45,
      );
      await yieldTick();
      const playersRes = parseStepJson(mapper.step_players_and_stats(), activeStep);

      // Step 4/6: Extract staff, clubs, 12-month finances, mentoring & tactics
      activeStep = 'Step 4/6 (Staff, clubs, finances & tactics)';
      emitStage(
        reply,
        'staff_clubs',
        'Step 4/6',
        `Step 4/6: Extracted ${playersRes.playerCount} players (${playersRes.matchedStats} stats matched) — reading staff, clubs, finances, mentoring & tactics...`,
        65,
      );
      await yieldTick();
      parseStepJson(mapper.step_staff_and_clubs(), activeStep);

      // Step 5/6: Exit game_db borrow, evict heavy caches & gc.collect() before span_records
      activeStep = 'Step 5/6 (Releasing game_db RAM)';
      emitStage(
        reply,
        'release_memory',
        'Step 5/6',
        'Step 5/6: Releasing game_db caches & reclaiming memory before fixture stream...',
        78,
      );
      await yieldTick();
      parseStepJson(mapper.step_release_gamedb_for_span(), activeStep);

      // Step 6/6: Stream span_records once for competitions, fixtures & league tables, then close
      activeStep = 'Step 6/6 (Fixtures & league table)';
      emitStage(
        reply,
        'fixtures_league',
        'Step 6/6',
        'Step 6/6: Streaming competitions, match fixtures & domestic league table...',
        90,
      );
      await yieldTick();
      const finalPayload = parseStepJson(
        mapper.step_fixtures_league_and_finish(),
        activeStep,
      );

      if (finalPayload.meta) {
        finalPayload.meta.fileName = file.name;
        finalPayload.meta.fileSizeMb = Number(((file.size || 0) / (1024 * 1024)).toFixed(2));
        finalPayload.meta.decodedAtIso = new Date().toISOString();
      }

      emitStage(reply, 'done', 'Complete', 'Save parsed successfully!', 100);
      reply({ type: 'result', data: finalPayload });
    } catch (err) {
      const classified = classifyJsError(err, activeStep);
      reply({
        type: 'error',
        error: classified.error,
        kind: classified.kind,
      });
    } finally {
      if (mapper) {
        try {
          mapper.step_close();
        } catch {
          // Ignore cleanup failure
        }
      }
      safeUnmount(instance);
    }
  }
};
