/**
 * FM27 Command Hub — Browser Web Worker for local FM26/FM27 .fm Save Parsing.
 *
 * Uses Pyodide 3.14 (with native Python 3.14 zstd/zlib support) + fmsave (0.14.3)
 * + zero-copy WORKERFS so large 50–300 MB .fm save files are mounted and read
 * directly from disk inside the browser with zero network upload and zero ArrayBuffer copies.
 */

const PYODIDE_VERSION = '314.0.8';
const FMSAVE_VERSION = '0.14.3';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const MOUNT_DIR = '/mnt_save';
// WORKERFS is the strict zero-copy path. Copying a large ArrayBuffer into MEMFS
// doubles peak RAM on mobile, so refuse anything above this threshold.
const MAX_MEMFS_BUFFER_BYTES = 64 * 1024 * 1024;

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
      try {
        await micropip.install(`fmsave==${FMSAVE_VERSION}`);
      } finally {
        micropip.destroy?.();
      }

      const patcherUrl = new URL('/fm_layout_patcher.py?v=22', origin || self.location.origin).href;
      try {
        const patcherResp = await fetch(patcherUrl, { cache: 'no-cache' });
        if (patcherResp.ok) {
          const patcherSource = await patcherResp.text();
          instance.FS.writeFile('/home/pyodide/fm_layout_patcher.py', patcherSource);
        }
      } catch {
        // Optional runtime layout patcher; mapper degrades gracefully if absent
      }

      const mapperUrl = new URL('/fm-save-mapper.py?v=22', origin || self.location.origin).href;
      const mapperResp = await fetch(mapperUrl, { cache: 'no-cache' });
      if (!mapperResp.ok) {
        throw new Error(`Failed to load save reader script (HTTP ${mapperResp.status}).`);
      }
      const mapperSource = await mapperResp.text();
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
  const { type, file, buffer, fileName, requestId, clubHint, scope, origin, fastSync } = event.data || {};
  const useFastSync = Boolean(fastSync);
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

  if ((type === 'parse_fm' || type === 'parse') && (file || buffer)) {
    let instance = null;
    let activeStep = 'Initialization';
    let tempBufferPath = null;
    const parseStartMs = Date.now();
    const elapsedSec = () => Number(((Date.now() - parseStartMs) / 1000).toFixed(1));
    const resolvedFileName = file?.name || fileName || 'save.fm';
    const resolvedFileSize = file?.size ?? (buffer instanceof ArrayBuffer ? buffer.byteLength : 0);
    const cleanupTempBuffer = () => {
      if (instance && tempBufferPath) {
        try {
          instance.FS.unlink(tempBufferPath);
        } catch {
          // ignore
        }
        tempBufferPath = null;
      }
    };
    try {
      instance = await ensureBooted(reply, origin);

      const attachRuntimeMeta = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.meta) {
          payload.meta.fileName = resolvedFileName;
          payload.meta.fileSizeMb = Number(((resolvedFileSize || 0) / (1024 * 1024)).toFixed(2));
          payload.meta.decodedAtIso = new Date().toISOString();
          if (scope) payload.meta.importScope = scope;
          payload.meta.fastSync = useFastSync;
          payload.meta.mountMode = file ? 'WORKERFS' : 'BUFFER_TMP';
        }
        payload.stepTimingsMs = {
          ...(payload.stepTimingsMs || {}),
          totalDecodeMs: Math.max(0, Date.now() - parseStartMs),
        };
        return payload;
      };

      const emitCheckpoint = (stageName) => {
        try {
          let snapshotStr = mapperModule.step_snapshot_payload(stageName);
          const snapshot = attachRuntimeMeta(JSON.parse(snapshotStr));
          snapshotStr = null;
          reply({
            type: 'checkpoint',
            stage: stageName,
            payload: snapshot,
          });
          instance.runPython('import gc; gc.collect()');
        } catch {
          // Non-fatal: continue extraction even if a checkpoint snapshot fails
        }
      };

      // ── STAGE 1: Open save + Club & Squad (52 attrs, traits, badges, direct contract/bans/injuries)
      activeStep = 'Stage 1/4: Opening save via WORKERFS';
      let savePath;
      if (file) {
        safeUnmount(instance);
        instance.FS.mkdirTree(MOUNT_DIR);
        instance.FS.mount(
          instance.FS.filesystems.WORKERFS,
          { files: [file] },
          MOUNT_DIR
        );
        savePath = `${MOUNT_DIR}/${resolvedFileName}`;
      } else {
        const bufferBytes =
          buffer instanceof ArrayBuffer
            ? buffer.byteLength
            : (buffer && typeof buffer.byteLength === 'number' ? buffer.byteLength : 0);
        if (bufferBytes > MAX_MEMFS_BUFFER_BYTES) {
          const bufferMb = (bufferBytes / (1024 * 1024)).toFixed(1);
          const limitMb = Math.round(MAX_MEMFS_BUFFER_BYTES / (1024 * 1024));
          reply({
            type: 'stage',
            stage: 'read',
            step: 'Stage 1/4',
            label: `Refusing to copy ${bufferMb} MB into MEMFS — zero-copy WORKERFS (File) is required above ${limitMb} MB on mobile.`,
          });
          throw new Error(
            `Refusing to copy a ${bufferMb} MB ArrayBuffer into MEMFS BUFFER_TMP (limit ${limitMb} MB). Re-import the .fm file from the file picker so zero-copy WORKERFS is used.`
          );
        }
        activeStep = 'Stage 1/4: Staging save buffer to temporary WASM file';
        tempBufferPath = `/tmp/fm_save_${requestId || Date.now()}.fm`;
        let bytes = new Uint8Array(buffer);
        instance.FS.writeFile(tempBufferPath, bytes);
        bytes = null;
        savePath = tempBufferPath;
      }

      const totalMb = ((resolvedFileSize || 0) / (1024 * 1024)).toFixed(1);
      reply({
        type: 'stage',
        stage: 'read',
        step: 'Stage 1/4',
        phase: 'open_save',
        progressPct: 10,
        elapsedSec: elapsedSec(),
        label: `Stage 1/4: Opening ${resolvedFileName} (${totalMb} MB) via ${file ? 'zero-copy WORKERFS' : 'temp buffer'}...`,
      });
      await yieldTick();

      const metaJson = mapperModule.step_open(
        savePath,
        clubHint || '',
        scope || 'managed_club_only',
        useFastSync
      );
      const meta = JSON.parse(metaJson);

      activeStep = 'Stage 1/4: Club & Squad (52 attributes, traits & Scout Badges)';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 1/4',
        phase: 'squad',
        progressPct: 22,
        elapsedSec: elapsedSec(),
        label: `Stage 1/4: Opened ${meta.game} (${meta.gameDateDmy || 'live'} · ${meta.clubName}) — extracting squad, 52 attributes, traits & direct contracts/bans/injuries (${elapsedSec()}s)...`,
      });
      await yieldTick();
      const pSummary = JSON.parse(mapperModule.step_players());
      emitCheckpoint('stage_1_squad');

      // ── STAGE 2: Finances / 12-month cash runway, Club Staff, Tactics & Mentoring
      activeStep = 'Stage 2/4: Finances & 12-month cash runway';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 2/4',
        elapsedSec: elapsedSec(),
        label: `Stage 2/4: Finances & 12-month cash runway (${elapsedSec()}s)...`,
      });
      await yieldTick();
      mapperModule.step_3_1_finances();

      activeStep = 'Stage 2/4: Club staff';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 2/4',
        elapsedSec: elapsedSec(),
        label: `Stage 2/4: Club staff (${elapsedSec()}s)...`,
      });
      await yieldTick();
      mapperModule.step_3_2_staff();

      activeStep = 'Stage 2/4: Tactics & mentoring';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 2/4',
        elapsedSec: elapsedSec(),
        label: `Stage 2/4: Tactics & mentoring (${elapsedSec()}s)...`,
      });
      await yieldTick();
      mapperModule.step_3_3_tactics_and_mentoring();
      emitCheckpoint('stage_2_club_core');

      // ── STAGE 3 (Full Sync ONLY): All remaining game_db reads while game_db is STILL warm in RAM
      // (eliminates 6-7x 800MB+ re-decompressions on mobile & multi-season saves), then releases game_db ONCE.
      if (!useFastSync) {
        activeStep = 'Stage 3/4: Global injuries';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Global injuries (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_injuries(false);

        activeStep = 'Stage 3/4: Facilities';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Facilities (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_facilities(false);

        activeStep = 'Stage 3/4: Competition rules';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Competition rules (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_competition_rules(false);

        activeStep = 'Stage 3/4: Transfer windows';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Transfer windows (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_transfer_windows(false);

        activeStep = 'Stage 3/4: Sponsorships, set pieces & training';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Sponsorships, set pieces & training (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_secondary_ops(false);

        activeStep = 'Stage 3/4: player_match_stats (Last-5 form)';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: player_match_stats (Last-5 form) (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_2_player_match_stats(false);

        activeStep = 'Stage 3/4: Contracts & bans backfill';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Contracts & bans backfill (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_4_contracts_and_suspensions(false);

        activeStep = 'Stage 3/4: Reading in-game FM27 shortlist';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 3/4',
          elapsedSec: elapsedSec(),
          label: `Stage 3/4: Reading in-game FM27 shortlist (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_4_market_scan_and_release_gamedb(false);
        emitCheckpoint('stage_3_club_ops');
      } else {
        mapperModule.step_3_4_market_scan_and_release_gamedb(true);
      }

      // ── STAGE 4 (Phase B — game_db is freed; zero RAM overlap with span/season_stats/archive)
      activeStep = 'Stage 4/4: Fixtures & match results';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 4/4',
        elapsedSec: elapsedSec(),
        label: `Stage 4/4: Fixtures & match results (${elapsedSec()}s)...`,
      });
      await yieldTick();
      const fixSummary = JSON.parse(mapperModule.step_fixtures(true));

      activeStep = 'Stage 4/4: Domestic league table';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 4/4',
        elapsedSec: elapsedSec(),
        label: `Stage 4/4: Domestic league table — ${fixSummary.playedCount} results & ${fixSummary.upcomingCount} fixtures (${elapsedSec()}s)...`,
      });
      await yieldTick();
      mapperModule.step_league_table();
      emitCheckpoint('stage_4_fixtures_league');

      if (!useFastSync) {
        activeStep = 'Stage 4/4: Team match stats (xG, shots & possession)';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Team match stats (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_team_match_stats(false);

        activeStep = 'Stage 4/4: player_season_stats';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: player_season_stats for ${pSummary.playerCount} players (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_1_season_stats(false);
        emitCheckpoint('stage_4_player_stats');

        activeStep = 'Stage 4/4: player_season_history (Career history)';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: player_season_history (Career history) (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_3_season_history(false);
      }

      const parsed = attachRuntimeMeta(JSON.parse(mapperModule.step_finalize()));

      reply({ type: 'result', data: parsed });
    } catch (err) {
      if (mapperModule) {
        try {
          mapperModule.step_close();
        } catch {
          // ignore
        }
      }

      const rawMsg = err?.message || String(err);
      let friendly = `${activeStep} failed: ${rawMsg}`;
      if (/NotAFmSaveError/i.test(rawMsg)) {
        friendly = 'This file is not a valid Football Manager (.fm) save file.';
      } else if (/UnsupportedGameError/i.test(rawMsg)) {
        friendly = `This .fm save comes from an unsupported Football Manager version/build. fmsave ${FMSAVE_VERSION} supports FM26 and FM27 saves.`;
      } else if (/CorruptSaveError/i.test(rawMsg)) {
        friendly = 'The .fm save appears incomplete or still being written by Football Manager. Save again or copy the file first.';
      } else if (/MemoryError|out of memory|abort\(/i.test(rawMsg)) {
        friendly = `Browser ran out of WebAssembly memory during ${activeStep}. Close background tabs or try on desktop.`;
      }
      reply({ type: 'error', message: friendly });
    } finally {
      cleanupTempBuffer();
      if (instance) safeUnmount(instance);
    }
  }
};
