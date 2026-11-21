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

      const mapperUrl = new URL('/fm-save-mapper.py?v=14', origin || self.location.origin).href;
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
  const { type, file, requestId, clubHint, scope, origin, fastSync } = event.data || {};
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

  if ((type === 'parse_fm' || type === 'parse') && file) {
    let instance = null;
    let activeStep = 'Initialization';
    const parseStartMs = Date.now();
    const elapsedSec = () => Number(((Date.now() - parseStartMs) / 1000).toFixed(1));
    try {
      instance = await ensureBooted(reply, origin);

      const attachRuntimeMeta = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.meta) {
          payload.meta.fileName = file.name;
          payload.meta.fileSizeMb = Number(((file.size || 0) / (1024 * 1024)).toFixed(2));
          payload.meta.decodedAtIso = new Date().toISOString();
          if (scope) payload.meta.importScope = scope;
          payload.meta.fastSync = useFastSync;
          payload.meta.mountMode = 'WORKERFS';
        }
        payload.stepTimingsMs = {
          ...(payload.stepTimingsMs || {}),
          totalDecodeMs: Math.max(0, Date.now() - parseStartMs),
        };
        return payload;
      };

      const emitCheckpoint = (stageName) => {
        try {
          const snapshot = attachRuntimeMeta(
            JSON.parse(mapperModule.step_snapshot_payload(stageName))
          );
          reply({
            type: 'checkpoint',
            stage: stageName,
            payload: snapshot,
          });
        } catch {
          // Non-fatal: continue extraction even if a checkpoint snapshot fails
        }
      };

      // ── STAGE 1: Open save + Club & Squad (52 attrs, traits, badges, direct contract/bans/injuries)
      activeStep = 'Stage 1/4: Opening save via WORKERFS';
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
        step: 'Stage 1/4',
        elapsedSec: elapsedSec(),
        label: `Stage 1/4: Opening ${file.name} (${totalMb} MB) via zero-copy WORKERFS...`,
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

      // ── STAGE 3: Fixtures & Full Domestic League Table (two separate JS-yielded steps)
      activeStep = 'Stage 3/4 (1/2): Fixtures & match results';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 3/4 (1/2)',
        elapsedSec: elapsedSec(),
        label: `Stage 3/4 (1/2): Fixtures & match results (${elapsedSec()}s)...`,
      });
      await yieldTick();
      const fixSummary = JSON.parse(mapperModule.step_fixtures(true));

      activeStep = 'Stage 3/4 (2/2): Domestic league table';
      reply({
        type: 'stage',
        stage: 'parse',
        step: 'Stage 3/4 (2/2)',
        elapsedSec: elapsedSec(),
        label: `Stage 3/4 (2/2): Domestic league table — ${fixSummary.playedCount} results & ${fixSummary.upcomingCount} fixtures (${elapsedSec()}s)...`,
      });
      await yieldTick();
      mapperModule.step_league_table();
      emitCheckpoint('stage_3_fixtures_league');

      // ── STAGE 4: Full Sync ONLY — Global club ops, Group 4 market scan, & heavy Player Stats
      if (!useFastSync) {
        activeStep = 'Stage 4/4: Global injuries';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Global injuries (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_injuries(false);

        activeStep = 'Stage 4/4: Facilities';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Facilities (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_facilities(false);

        activeStep = 'Stage 4/4: Competition rules';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Competition rules (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_competition_rules(false);

        activeStep = 'Stage 4/4: Transfer windows';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Transfer windows (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_transfer_windows(false);

        activeStep = 'Stage 4/4: Sponsorships, set pieces & training';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Sponsorships, set pieces & training (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_3_secondary_ops(false);

        activeStep = 'Stage 4/4: Free-agent & expiring market scan';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Free-agent & expiring market scan (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_3_4_market_scan_and_release_gamedb(false);

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

        activeStep = 'Stage 4/4: player_match_stats (Last-5 form)';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: player_match_stats (Last-5 form) (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_2_player_match_stats(false);

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

        activeStep = 'Stage 4/4: Contracts & bans backfill';
        reply({
          type: 'stage',
          stage: 'parse',
          step: 'Stage 4/4',
          elapsedSec: elapsedSec(),
          label: `Stage 4/4: Contracts & bans backfill (${elapsedSec()}s)...`,
        });
        await yieldTick();
        mapperModule.step_4_4_contracts_and_suspensions(false);
      }

      const parsed = attachRuntimeMeta(JSON.parse(mapperModule.step_finalize()));

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
