/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { KVV_ZELZATE_META, SQUAD_PLAYERS } from './data/squadData';
import { COMPETITIVE_MATCH_LOGS } from './data/matchAndTacticsData';
import { MatchLogEntry, PlayerRecord } from './types/fm27';
import { computeCompetitiveSummary } from './utils/fmSyncEngine';
import {
  mergeParsedPlayersIntoSquad,
  ParsedPlayerDelta,
  SquadMergeResult,
} from './utils/fmFileImporter';
import {
  DecodedFmSavePayload,
  hydrateAppFromDecodedFmSave,
  HydratedSaveState,
} from './utils/fmSaveHydrator';
import {
  AutoSyncWorkspace,
  PlayerAutoUpdate,
} from './components/AutoSyncWorkspace';
import { TacticalWarRoom } from './components/TacticalWarRoom';
import { SquadAnalyticsTable } from './components/SquadAnalyticsTable';
import { SetPiecesAndTraining } from './components/SetPiecesAndTraining';
import { MatchLogArchive } from './components/MatchLogArchive';
import { LiveFmSaveProofCard } from './components/LiveFmSaveProofCard';
import {
  loadPersistedFmState,
  savePersistedFmState,
  clearPersistedFmState,
  recordPreviousSnapshot,
  exportFmStateBackupJson,
  importFmStateBackupJson,
} from './services/fmStorage';
import { Download, Upload, Trash2, Database } from 'lucide-react';

type ActiveTab = 'sync' | 'tactics' | 'squad' | 'setpieces' | 'matches';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sync');
  const [matches, setMatches] = useState<MatchLogEntry[]>(
    COMPETITIVE_MATCH_LOGS
  );
  const [players, setPlayers] = useState<PlayerRecord[]>(SQUAD_PLAYERS);
  const [saveDate, setSaveDate] = useState<string>(KVV_ZELZATE_META.saveDate);
  const [nextFixture, setNextFixture] = useState<string>(
    KVV_ZELZATE_META.nextFixture
  );
  const [leagueStandingSub, setLeagueStandingSub] = useState<string>('--');
  const [wageSpend, setWageSpend] = useState<string>(KVV_ZELZATE_META.wageSpend);
  const [balance, setBalance] = useState<string>(KVV_ZELZATE_META.balance);
  const [hydratedFmSave, setHydratedFmSave] = useState<HydratedSaveState | null>(
    null
  );
  const [isRestoredFromMemory, setIsRestoredFromMemory] = useState<boolean>(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Restore saved state from previous session on initial mount
  useEffect(() => {
    const saved = loadPersistedFmState();
    if (saved && (saved.players.length > 0 || saved.matches.length > 0)) {
      setPlayers(saved.players);
      setMatches(saved.matches);
      if (saved.saveDate) setSaveDate(saved.saveDate);
      if (saved.nextFixture) setNextFixture(saved.nextFixture);
      if (saved.leagueStandingSub) setLeagueStandingSub(saved.leagueStandingSub);
      if (saved.wageSpend) setWageSpend(saved.wageSpend);
      if (saved.balance) setBalance(saved.balance);
      if (saved.hydratedFmSave) setHydratedFmSave(saved.hydratedFmSave);
      setIsRestoredFromMemory(true);
      setLastSyncedTimestamp(saved.lastSyncedAt);
    }
  }, []);

  // Automatically persist non-empty state across browser refreshes & sessions
  useEffect(() => {
    if (players.length > 0 || matches.length > 0) {
      savePersistedFmState({
        saveDate,
        nextFixture,
        leagueStandingSub,
        wageSpend,
        balance,
        clubName: hydratedFmSave?.decodedPayload.meta.clubName,
        players,
        matches,
        hydratedFmSave,
      });
      setIsRestoredFromMemory(true);
    }
  }, [
    players,
    matches,
    saveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    hydratedFmSave,
  ]);

  const summary = computeCompetitiveSummary(matches);

  const handleClearMemory = () => {
    const confirmed = window.confirm(
      'Clear saved FM27 memory and return to clean "Awaiting .fm Save" state?'
    );
    if (!confirmed) return;

    clearPersistedFmState();
    setPlayers(SQUAD_PLAYERS);
    setMatches(COMPETITIVE_MATCH_LOGS);
    setSaveDate(KVV_ZELZATE_META.saveDate);
    setNextFixture(KVV_ZELZATE_META.nextFixture);
    setLeagueStandingSub('--');
    setWageSpend(KVV_ZELZATE_META.wageSpend);
    setBalance(KVV_ZELZATE_META.balance);
    setHydratedFmSave(null);
    setIsRestoredFromMemory(false);
    setLastSyncedTimestamp(null);
  };

  const handleExportBackup = () => {
    const json = exportFmStateBackupJson();
    if (!json) {
      alert('No save data currently in memory to export.');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fm27-hub-backup-${saveDate.replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const imported = importFmStateBackupJson(text);
      if (imported) {
        setPlayers(imported.players);
        setMatches(imported.matches);
        setSaveDate(imported.saveDate);
        setNextFixture(imported.nextFixture);
        setLeagueStandingSub(imported.leagueStandingSub);
        setWageSpend(imported.wageSpend);
        setBalance(imported.balance);
        setHydratedFmSave(imported.hydratedFmSave);
        setIsRestoredFromMemory(true);
        setLastSyncedTimestamp(imported.lastSyncedAt);
      } else {
        alert('Invalid FM27 backup file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddMatch = (newMatch: MatchLogEntry) => {
    setMatches((prev) => [newMatch, ...prev]);
    if (newMatch.date) {
      setSaveDate(newMatch.date);
    }
  };

  const handleApplyDecodedFmSave = (
    decoded: DecodedFmSavePayload
  ): HydratedSaveState => {
    // Record current snapshot before applying new save for delta / progression tracking
    recordPreviousSnapshot(saveDate, players, matches);

    const hydrated = hydrateAppFromDecodedFmSave(decoded, players, matches);
    setHydratedFmSave(hydrated);
    setPlayers(hydrated.updatedSquad);
    setMatches(hydrated.updatedMatches);
    setSaveDate(hydrated.saveDateLabel);
    if (hydrated.nextFixtureLabel) {
      setNextFixture(hydrated.nextFixtureLabel);
    }
    if (hydrated.leagueStandingLabel) {
      setLeagueStandingSub(hydrated.leagueStandingLabel);
    }
    if (hydrated.wageComplianceLabel) {
      setWageSpend(hydrated.wageComplianceLabel);
    }
    if (hydrated.balanceLabel) {
      setBalance(hydrated.balanceLabel);
    }
    return hydrated;
  };

  const handleBulkMergePlayers = (
    parsedPlayers: ParsedPlayerDelta[]
  ): SquadMergeResult => {
    const result = mergeParsedPlayersIntoSquad(players, parsedPlayers);
    if (result.matchedCount > 0) {
      setPlayers(result.updatedSquad);
    }
    return result;
  };

  const handleApplyPlayerUpdates = (updates: PlayerAutoUpdate[]) => {
    if (!updates || updates.length === 0) return;
    setPlayers((prev) =>
      prev.map((player) => {
        const match = updates.find((u) => {
          const target = u.name.trim().toLowerCase();
          const pName = player.name.toLowerCase();
          return (
            pName === target ||
            pName.includes(target) ||
            target.includes(pName.split(' ').slice(-1)[0])
          );
        });
        if (!match) return player;

        const addGoals =
          typeof match.goalsAdded === 'number' && !Number.isNaN(match.goalsAdded)
            ? match.goalsAdded
            : 0;
        const addAssists =
          typeof match.assistsAdded === 'number' &&
          !Number.isNaN(match.assistsAdded)
            ? match.assistsAdded
            : 0;
        const addMinutes =
          typeof match.minutesAdded === 'number' &&
          !Number.isNaN(match.minutesAdded)
            ? match.minutesAdded
            : 0;

        return {
          ...player,
          rating:
            typeof match.rating === 'number' && !Number.isNaN(match.rating)
              ? match.rating
              : player.rating,
          goals: player.goals + addGoals,
          assists: player.assists + addAssists,
          minutes: player.minutes + addMinutes,
          apps: addMinutes > 0 ? `${player.apps} (+1)` : player.apps,
          notes:
            match.notes && match.notes.trim().length > 0
              ? match.notes.trim()
              : player.notes,
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract (responsive wrap on mobile) */}
      <header className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-6 gap-y-3 px-4 sm:px-6 py-3.5 sm:py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('sync');
          }}
          className="order-1 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          {hydratedFmSave ? hydratedFmSave.decodedPayload.meta.clubName : 'FM27 Command Hub'}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary sections"
          className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-5 sm:gap-6 text-sm font-medium text-slate-600 dark:text-slate-400 overflow-x-auto pb-0.5"
        >
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'sync'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Tactical Analyst Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('squad')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'squad'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Squad Database ({players.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tactics')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'tactics'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Playbook v2.0 Reference
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('setpieces')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'setpieces'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Corners &amp; Training
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matches')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'matches'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Match Log ({matches.length})
          </button>
        </nav>

        {/* Zone 3: Actions & Memory Controls */}
        <div className="order-2 lg:order-3 flex items-center gap-2 shrink-0">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          {players.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportBackup}
                title="Export campaign snapshot as JSON backup"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Backup</span>
              </button>

              <button
                type="button"
                onClick={handleClearMemory}
                title="Clear saved memory and return to clean Awaiting Save state"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 bg-slate-800/80 hover:bg-red-950/40 border border-slate-700/80 hover:border-red-800/50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              title="Restore previous campaign from a JSON backup file"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Restore Backup</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setActiveTab(activeTab === 'squad' ? 'sync' : 'squad')
            }
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            {activeTab === 'squad' ? 'Back to Analyst Chat' : `Inspect ${players.length}-Man Squad`}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Executive Club & Save Baseline Strip */}
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {hydratedFmSave
                    ? `${hydratedFmSave.decodedPayload.meta.clubName} (${hydratedFmSave.decodedPayload.meta.game} Build ${hydratedFmSave.decodedPayload.meta.build})`
                    : 'Football Manager 27 · Local Browser Engine'}
                </span>
                <span>&middot;</span>
                <span>
                  Save Date:{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-emerald-300">
                    {saveDate}
                  </span>
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                    hydratedFmSave
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {hydratedFmSave
                    ? `LIVE .FM SYNCED (${hydratedFmSave.decodedPayload.meta.fileName || hydratedFmSave.decodedPayload.meta.saveName || '.fm'})`
                    : 'AWAITING .FM SAVE — DROP .FM SAVE TO SYNC'}
                </span>

                {isRestoredFromMemory && players.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    <Database className="w-3 h-3 text-blue-400" />
                    PERSISTENT MEMORY ACTIVE
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {hydratedFmSave
                  ? `${hydratedFmSave.decodedPayload.meta.clubName} Tactical Analyst & Live .fm Save Co-Pilot`
                  : 'FM27 Tactical Analyst & Command Hub'}
              </h1>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 lg:text-right space-y-1">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                Next Fixture: {nextFixture}
              </div>
              <div>
                {hydratedFmSave
                  ? `Manager: ${hydratedFmSave.decodedPayload.meta.managerName} · Decoded locally via fmsave ${hydratedFmSave.decodedPayload.meta.fmsaveVersion}`
                  : 'Status: Zero Mock Baseline · Awaiting Save File'}
              </div>
            </div>
          </div>

          {/* 4-Column Quantitative KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {hydratedFmSave
                  ? `Live League Standing (${hydratedFmSave.decodedPayload.leagueStanding?.competitionName || 'League'})`
                  : 'League Standing'}
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {hydratedFmSave?.leagueRecordLabel ||
                  (summary.played > 0
                    ? `${summary.played} GP · ${summary.wins}W-${summary.draws}D-${summary.losses}L · ${summary.points} Pts`
                    : '--')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.played > 0 ? leagueStandingSub : 'Awaiting .fm save'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {hydratedFmSave?.squadOutputLabel
                  ? 'Live Squad Season Output (From .fm)'
                  : 'Cumulative Expected Goals'}
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                {hydratedFmSave?.squadOutputLabel ||
                  (summary.played > 0
                    ? `${summary.totalXgFor.toFixed(2)} xGF vs ${summary.totalXgAgainst.toFixed(2)} xGA`
                    : '--')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {hydratedFmSave?.squadOutputSubLabel ||
                  (summary.played > 0
                    ? `Net Quality Differential: ${summary.xgDiff >= 0 ? '+' : ''}${summary.xgDiff.toFixed(2)} xG`
                    : 'Awaiting .fm save')}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {hydratedFmSave
                  ? 'Live Active Tactic, Injuries & Mentoring'
                  : 'Dual-Phase Tactic & Setup'}
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {hydratedFmSave?.tacticHeadlineLabel || '--'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {hydratedFmSave?.tacticSubLabel || 'Awaiting .fm save'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Club Finances &amp; Wage Compliance
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {wageSpend}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Balance: {balance} · {players.length}-Man Squad
              </div>
            </div>
          </div>
        </section>

        {/* Undeniable Live .fm Save Verification Receipt & Raw Data Inspector */}
        {hydratedFmSave && <LiveFmSaveProofCard hydrated={hydratedFmSave} />}

        {/* Active View Area (keep AutoSyncWorkspace mounted so live .fm chat history & Google auth persist across tabs) */}
        <div className={activeTab === 'sync' ? '' : 'hidden'}>
          <AutoSyncWorkspace
            matches={matches}
            players={players}
            currentSaveDate={saveDate}
            onUpdateSaveDate={setSaveDate}
            onAddMatch={handleAddMatch}
            onApplyPlayerUpdates={handleApplyPlayerUpdates}
            onBulkMergePlayers={handleBulkMergePlayers}
            onApplyDecodedFmSave={handleApplyDecodedFmSave}
          />
        </div>
        {activeTab === 'tactics' && <TacticalWarRoom />}
        {activeTab === 'squad' && <SquadAnalyticsTable players={players} />}
        {activeTab === 'setpieces' && <SetPiecesAndTraining />}
        {activeTab === 'matches' && (
          <MatchLogArchive
            matches={matches}
            liveLeagueRecord={hydratedFmSave?.leagueRecordLabel || null}
            liveSaveFileName={
              hydratedFmSave?.decodedPayload.meta.fileName ||
              hydratedFmSave?.decodedPayload.meta.saveName ||
              null
            }
          />
        )}
      </main>

      <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          KVV Zelzate (Matricule 4165) · Football Manager 27 on PC (Patch 27.1.0
          Baseline)
        </span>
        <span>
          Anchor Tag Protected: [INSERT NEXT CHRONOLOGICAL EVENT HERE]
        </span>
      </footer>
    </div>
  );
}
