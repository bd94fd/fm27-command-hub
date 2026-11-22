/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Command,
  Crosshair,
  Database,
  Download,
  MessageSquare,
  Shield,
  Trash2,
  Trophy,
  Upload,
  Users,
} from 'lucide-react';
import { KVV_ZELZATE_META, SQUAD_PLAYERS } from './data/squadData';
import { COMPETITIVE_MATCH_LOGS } from './data/matchAndTacticsData';
import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from './types/fm27';
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
import { applyAnalystPlayerUpdates } from './utils/tacticalAnalystContext';
import { LiveFmSaveProofCard } from './components/LiveFmSaveProofCard';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import {
  loadPersistedFmState,
  loadPersistedFmStateFromIndexedDb,
  savePersistedFmState,
  clearPersistedFmState,
  recordPreviousSnapshot,
  exportFmStateBackupJson,
  importFmStateBackupJson,
  isScoutTargetTracked,
  loadTrackedScoutTargets,
  toggleTrackedScoutTarget,
  PersistedCustomSlot,
} from './services/fmStorage';
import { FormationPresetKey } from './utils/bestXiSolver';
import { RecruitmentTarget } from './types/fmSave';
import {
  captureProgressionSnapshot,
  clearProgressionArchive,
} from './utils/progressionDiff';

const TacticalWarRoom = lazy(() =>
  import('./components/TacticalWarRoom').then((m) => ({
    default: m.TacticalWarRoom,
  }))
);
const SquadAnalyticsTable = lazy(() =>
  import('./components/SquadAnalyticsTable').then((m) => ({
    default: m.SquadAnalyticsTable,
  }))
);
const RecruitmentWorkspace = lazy(() =>
  import('./components/RecruitmentWorkspace').then((m) => ({
    default: m.RecruitmentWorkspace,
  }))
);
const StaffDirectory = lazy(() =>
  import('./components/StaffDirectory').then((m) => ({
    default: m.StaffDirectory,
  }))
);
const SetPiecesAndTraining = lazy(() =>
  import('./components/SetPiecesAndTraining').then((m) => ({
    default: m.SetPiecesAndTraining,
  }))
);
const MatchLogArchive = lazy(() =>
  import('./components/MatchLogArchive').then((m) => ({
    default: m.MatchLogArchive,
  }))
);
const PlayerDetailModal = lazy(() =>
  import('./components/PlayerDetailModal').then((m) => ({
    default: m.PlayerDetailModal,
  }))
);
const StaffDetailModal = lazy(() =>
  import('./components/StaffDetailModal').then((m) => ({
    default: m.StaffDetailModal,
  }))
);
const KnowledgeBasePanel = lazy(() =>
  import('./components/KnowledgeBasePanel').then((m) => ({
    default: m.KnowledgeBasePanel,
  }))
);
const CommandPaletteModal = lazy(() =>
  import('./components/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal,
  }))
);

const LazyTabFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
    Loading {label}...
  </div>
);

type ActiveTab =
  | 'sync'
  | 'tactics'
  | 'squad'
  | 'recruitment'
  | 'staff'
  | 'setpieces'
  | 'matches';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sync');
  const [matches, setMatches] = useState<MatchLogEntry[]>(
    COMPETITIVE_MATCH_LOGS
  );
  const [players, setPlayers] = useState<PlayerRecord[]>(SQUAD_PLAYERS);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [recruitmentCases, setRecruitmentCases] = useState<RecruitmentCase[]>(
    []
  );
  const [shortlists, setShortlists] = useState<ShortlistRecord[]>([]);
  const [trackedTargets, setTrackedTargets] = useState<RecruitmentTarget[]>(() =>
    loadTrackedScoutTargets()
  );
  const [pendingAnalystPrompt, setPendingAnalystPrompt] = useState<string | null>(
    null
  );
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
  const [isRestoredFromMemory, setIsRestoredFromMemory] =
    useState<boolean>(false);
  const [confirmResetPending, setConfirmResetPending] =
    useState<boolean>(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(
    null
  );
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState<boolean>(false);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [appToast, setAppToast] = useState<string | null>(null);
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const showGlobalToast = useCallback((msg: string) => {
    setAppToast(msg);
    window.setTimeout(() => {
      setAppToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleToggleTrackTarget = (target: RecruitmentTarget): boolean => {
    const { targets: next, tracked } = toggleTrackedScoutTarget(
      target,
      trackedTargets
    );
    setTrackedTargets(next);
    showGlobalToast(
      tracked
        ? `Added ${target.name} to Shortlist`
        : `Removed ${target.name} from Shortlist`
    );
    return tracked;
  };

  const handleToggleTrackPlayerFromModal = (player: PlayerRecord) => {
    const scoutPool =
      hydratedFmSave?.recruitmentTargets ??
      hydratedFmSave?.decodedPayload.recruitmentTargets ??
      [];
    const matched = scoutPool.find(
      (t) =>
        (typeof player.uid === 'number' && t.uid === player.uid) ||
        t.name.trim().toLowerCase() === player.name.trim().toLowerCase()
    );
    const targetToToggle: RecruitmentTarget = matched || {
      uid: player.uid || 0,
      name: player.name,
      age: player.age,
      nationality: player.nation || 'Unknown',
      primaryPosition: player.position,
      isFreeAgent:
        player.wagePw === 0 ||
        (player.expires || '').toLowerCase().includes('free'),
      contractExpiryMonths: player.contractExpiryMonths ?? 6,
      expires: player.expires,
      demandedWageEur: player.wagePw || 0,
      scoutBadges: player.scoutBadges,
      traits: player.traits,
      attributes: player.attributes,
    };
    handleToggleTrackTarget(targetToToggle);
  };

  const handleAskAnalystPrompt = (prompt: string) => {
    setPendingAnalystPrompt(prompt);
    handleSelectTab('sync');
  };

  const clubName =
    hydratedFmSave?.decodedPayload.meta.clubName || 'FM27 Command Hub';
  const managerName =
    hydratedFmSave?.decodedPayload.meta.managerName || '--';

  const [activeShape, setActiveShape] =
    useState<FormationPresetKey>('4-3-3 DM Wide');
  const [customSlots, setCustomSlots] = useState<PersistedCustomSlot[]>([]);
  const [applyToAnalystOnly, setApplyToAnalystOnly] = useState<boolean>(false);

  // Restore saved state from previous session on initial mount
  useEffect(() => {
    const saved = loadPersistedFmState();
    if (
      saved &&
      (saved.players.length > 0 ||
        saved.matches.length > 0 ||
        (saved.recruitmentCases && saved.recruitmentCases.length > 0) ||
        (saved.shortlists && saved.shortlists.length > 0))
    ) {
      setPlayers(saved.players);
      setMatches(saved.matches);
      if (saved.staff) setStaff(saved.staff);
      if (saved.recruitmentCases) setRecruitmentCases(saved.recruitmentCases);
      if (saved.shortlists) setShortlists(saved.shortlists);
      if (saved.saveDate) setSaveDate(saved.saveDate);
      if (saved.nextFixture) setNextFixture(saved.nextFixture);
      if (saved.leagueStandingSub) setLeagueStandingSub(saved.leagueStandingSub);
      if (saved.wageSpend) setWageSpend(saved.wageSpend);
      if (saved.balance) setBalance(saved.balance);
      if (saved.hydratedFmSave) setHydratedFmSave(saved.hydratedFmSave);
      if (saved.activeShape) setActiveShape(saved.activeShape);
      if (saved.customSlots) setCustomSlots(saved.customSlots);
      if (typeof saved.applyToAnalystOnly === 'boolean') {
        setApplyToAnalystOnly(saved.applyToAnalystOnly);
      }
      setIsRestoredFromMemory(true);
    }

    void loadPersistedFmStateFromIndexedDb().then((idbSaved) => {
      if (!idbSaved) return;
      const idbTargetCount =
        idbSaved.hydratedFmSave?.recruitmentTargets?.length ?? 0;
      const localTargetCount =
        saved?.hydratedFmSave?.recruitmentTargets?.length ?? 0;
      if (!saved || idbTargetCount > localTargetCount) {
        if (idbSaved.players.length > 0) setPlayers(idbSaved.players);
        if (idbSaved.matches.length > 0) setMatches(idbSaved.matches);
        if (idbSaved.hydratedFmSave) setHydratedFmSave(idbSaved.hydratedFmSave);
        setIsRestoredFromMemory(true);
      }
    });
  }, []);

  // Automatically persist non-empty state across browser refreshes & sessions
  useEffect(() => {
    if (
      players.length > 0 ||
      matches.length > 0 ||
      staff.length > 0 ||
      recruitmentCases.length > 0 ||
      shortlists.length > 0
    ) {
      savePersistedFmState({
        saveDate,
        nextFixture,
        leagueStandingSub,
        wageSpend,
        balance,
        clubName: hydratedFmSave?.decodedPayload.meta.clubName,
        players,
        matches,
        staff,
        recruitmentCases,
        shortlists,
        hydratedFmSave,
        activeShape,
        customSlots,
        applyToAnalystOnly,
      });
      setIsRestoredFromMemory(true);
    }
  }, [
    players,
    matches,
    staff,
    recruitmentCases,
    shortlists,
    saveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    hydratedFmSave,
    activeShape,
    customSlots,
    applyToAnalystOnly,
  ]);

  const summary = computeCompetitiveSummary(matches);

  const handleClearMemory = () => {
    if (!confirmResetPending) {
      setConfirmResetPending(true);
      window.setTimeout(() => setConfirmResetPending(false), 5000);
      return;
    }

    setConfirmResetPending(false);
    clearPersistedFmState();
    clearProgressionArchive();
    setPlayers([]);
    setMatches([]);
    setStaff([]);
    setRecruitmentCases([]);
    setShortlists([]);
    setSaveDate(KVV_ZELZATE_META.saveDate);
    setNextFixture(KVV_ZELZATE_META.nextFixture);
    setLeagueStandingSub('--');
    setWageSpend(KVV_ZELZATE_META.wageSpend);
    setBalance(KVV_ZELZATE_META.balance);
    setHydratedFmSave(null);
    setIsRestoredFromMemory(false);
    setSelectedPlayer(null);
    setSelectedStaff(null);
    showGlobalToast('Local cache cleared — returned to Awaiting .fm Save');
  };

  const handleExportBackup = () => {
    const json = exportFmStateBackupJson();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fm27-hub-backup-${saveDate.replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showGlobalToast('Campaign JSON backup exported');
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
        setStaff(imported.staff || []);
        setRecruitmentCases(imported.recruitmentCases || []);
        setShortlists(imported.shortlists || []);
        setSaveDate(imported.saveDate);
        setNextFixture(imported.nextFixture);
        setLeagueStandingSub(imported.leagueStandingSub);
        setWageSpend(imported.wageSpend);
        setBalance(imported.balance);
        setHydratedFmSave(imported.hydratedFmSave);
        setIsRestoredFromMemory(true);
        showGlobalToast(
          `Restored campaign snapshot (${imported.players.length} players)`
        );
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
    recordPreviousSnapshot(saveDate, players, matches);
    if (players.length > 0 && saveDate && saveDate !== '--') {
      captureProgressionSnapshot(
        saveDate,
        hydratedFmSave?.decodedPayload.meta.clubName || 'Managed Club',
        players
      );
    }

    const hydrated = hydrateAppFromDecodedFmSave(decoded, players, matches);
    captureProgressionSnapshot(
      hydrated.saveDateLabel,
      decoded.meta.clubName || 'Managed Club',
      hydrated.updatedSquad
    );
    setHydratedFmSave(hydrated);
    setPlayers(hydrated.updatedSquad);
    setStaff(hydrated.updatedStaff || []);
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
    showGlobalToast(
      `Synced ${decoded.meta.clubName || 'Club'} (${hydrated.updatedSquad.length} players · ${hydrated.saveDateLabel})`
    );
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
    setPlayers((prev) => applyAnalystPlayerUpdates(prev, updates).updatedPlayers);
  };

  // Recruitment & Shortlist handlers
  const handleAddRecruitmentCase = (
    entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>
  ) => {
    const created: RecruitmentCase = {
      ...entry,
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: new Date().toISOString(),
    };
    setRecruitmentCases((prev) => [created, ...prev]);
  };

  const handleTrackPlayerInRecruitment = (player: PlayerRecord) => {
    const exists = recruitmentCases.some(
      (c) =>
        c.playerId === player.id ||
        c.playerName.toLowerCase() === player.name.toLowerCase()
    );
    if (!exists) {
      handleAddRecruitmentCase({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        age: player.age,
        currentClub: hydratedFmSave?.decodedPayload.meta.clubName || 'Managed Squad',
        targetIpRole: player.ipRole,
        targetOopRole: player.oopRole,
        interest: 'Interested',
        stage: 'Shortlisted',
        estimatedFee: 'In-Squad / Renewal',
        estimatedWagePw: player.wagePw,
        expiresOn: player.expires,
        notes: player.notes,
      });
    }
    setSelectedPlayer(null);
    setActiveTab('recruitment');
  };

  const handleUpdateRecruitmentCase = (
    id: string,
    patch: Partial<RecruitmentCase>
  ) => {
    setRecruitmentCases((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
      )
    );
  };

  const handleDeleteRecruitmentCase = (id: string) => {
    setRecruitmentCases((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCreateShortlist = (name: string, description: string) => {
    const created: ShortlistRecord = {
      id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description,
      playerIds: [],
      createdAt: new Date().toISOString(),
    };
    setShortlists((prev) => [created, ...prev]);
  };

  const handleDeleteShortlist = (id: string) => {
    setShortlists((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddPlayerToShortlist = (
    shortlistId: string,
    playerId: string
  ) => {
    setShortlists((prev) =>
      prev.map((s) =>
        s.id === shortlistId && !s.playerIds.includes(playerId)
          ? { ...s, playerIds: [...s.playerIds, playerId] }
          : s
      )
    );
  };

  const handleRemovePlayerFromShortlist = (
    shortlistId: string,
    playerId: string
  ) => {
    setShortlists((prev) =>
      prev.map((s) =>
        s.id === shortlistId
          ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) }
          : s
      )
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navigation Shell */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-x-4 px-4 sm:px-6 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSelectTab('sync');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate max-w-[175px] sm:max-w-none"
        >
          {clubName}
        </a>

        {/* Desktop Navigation Tabs (mobile uses fixed bottom bar below) */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-4 lg:gap-5 text-xs lg:text-sm font-medium text-slate-600 dark:text-slate-400 overflow-x-auto"
        >
          {[
            { id: 'sync' as const, label: 'AI Analyst & Sync' },
            { id: 'squad' as const, label: `Squad (${players.length})` },
            { id: 'tactics' as const, label: 'War Room & Playbook' },
            {
              id: 'recruitment' as const,
              label: 'Transfers & Audit',
            },
            ...(staff.length > 0
              ? [{ id: 'staff' as const, label: `Staff (${staff.length})` }]
              : []),
            { id: 'setpieces' as const, label: 'Corners & Training' },
            { id: 'matches' as const, label: `Matches (${matches.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectTab(tab.id)}
              className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === tab.id
                  ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                  : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions: FM27 Knowledge Base + Backup/Restore/Reset */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowCommandPalette(true)}
            title="Open Quick-Jump Command Palette (⌘K / Ctrl+K)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Command className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Jump</span>
            <kbd className="hidden lg:inline rounded bg-slate-950/90 px-1 py-0.5 font-mono text-[10px] text-emerald-300">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setShowKnowledgeBase(true)}
            title="Open FM27 Patch 27.1.0 Knowledge Base & Fact-Checker"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>FM27 KB</span>
          </button>

          {players.length > 0 || recruitmentCases.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleExportBackup}
                title="Export campaign snapshot as JSON backup"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Backup</span>
              </button>

              <button
                type="button"
                onClick={handleClearMemory}
                title={
                  confirmResetPending
                    ? 'Click again to wipe saved memory and return to Awaiting .fm Save'
                    : 'Clear saved memory and return to clean Awaiting Save state'
                }
                className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  confirmResetPending
                    ? 'text-rose-200 bg-rose-950/80 border-rose-500/60 hover:bg-rose-900/80'
                    : 'text-slate-400 hover:text-red-400 bg-slate-800/80 hover:bg-red-950/40 border-slate-700/80 hover:border-red-800/50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className={confirmResetPending ? 'inline' : 'hidden lg:inline'}>
                  {confirmResetPending ? 'Confirm Reset?' : 'Reset'}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              title="Restore previous campaign from a JSON backup file"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Restore</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Container (extra bottom padding on mobile for fixed bottom nav) */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-6 pb-24 md:pb-8 space-y-4 sm:space-y-6">
        {/* Mobile Compact Status Bar (1 tap to expand KPIs & Save Receipt; eliminates 2 screens of scrolling) */}
        <div className="md:hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  hydratedFmSave ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              <span className="truncate">
                {hydratedFmSave
                  ? `${saveDate} · ${hydratedFmSave.leagueRecordLabel || `${players.length} Players`}`
                  : 'Awaiting .fm Save'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Next: {nextFixture} · Bal: {balance}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileDetails((v) => !v)}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
          >
            {showMobileDetails ? (
              <>
                Hide <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Club KPIs <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Executive Club & Save Baseline Strip (always visible on desktop, expandable on mobile) */}
        <div className={showMobileDetails ? 'space-y-4' : 'hidden md:block space-y-6'}>
          <section className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
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
                      MEMORY ACTIVE
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {hydratedFmSave
                    ? `${hydratedFmSave.decodedPayload.meta.clubName} Command Hub`
                    : 'FM27 Command Hub & AI Tactical Co-Pilot'}
                </h1>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 lg:text-right space-y-1">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Next Fixture: {nextFixture}
                </div>
                <div>
                  {hydratedFmSave
                    ? `Manager: ${managerName} · Decoded locally via fmsave ${hydratedFmSave.decodedPayload.meta.fmsaveVersion}`
                    : 'Status: Zero Mock Baseline · Verified Patch 27.1.0 KB Ready'}
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

          {/* Live .fm Save Verification Receipt */}
          {hydratedFmSave && <LiveFmSaveProofCard hydrated={hydratedFmSave} />}
        </div>

        {/* Active View Area (AutoSyncWorkspace stays mounted so chat history & Google OAuth persist across tabs) */}
        <div className={activeTab === 'sync' ? '' : 'hidden'}>
          <AppErrorBoundary scopeLabel="AI Analyst & Live .fm Save Sync">
            <AutoSyncWorkspace
              matches={matches}
              players={players}
              staff={staff}
              recruitmentCases={recruitmentCases}
              currentSaveDate={saveDate}
              clubName={hydratedFmSave?.decodedPayload.meta.clubName}
              managerName={managerName}
              nextFixture={nextFixture}
              leagueStandingSub={leagueStandingSub}
              wageSpend={wageSpend}
              balance={balance}
              hydratedFmSave={hydratedFmSave}
              activeShape={activeShape}
              customSlots={customSlots}
              applyToAnalystOnly={applyToAnalystOnly}
              onUpdateSaveDate={setSaveDate}
              onAddMatch={handleAddMatch}
              onApplyPlayerUpdates={handleApplyPlayerUpdates}
              onBulkMergePlayers={handleBulkMergePlayers}
              onApplyDecodedFmSave={handleApplyDecodedFmSave}
              pendingPrompt={pendingAnalystPrompt}
              onClearPendingPrompt={() => setPendingAnalystPrompt(null)}
            />
          </AppErrorBoundary>
        </div>

        {activeTab === 'tactics' && (
          <AppErrorBoundary scopeLabel="Tactical War Room">
            <Suspense fallback={<LazyTabFallback label="Tactical War Room" />}>
              <TacticalWarRoom
                players={players}
                saveDate={saveDate}
                nextFixture={nextFixture}
                clubName={clubName}
                activeSuspensions={hydratedFmSave?.activeSuspensions ?? []}
                competitionRules={hydratedFmSave?.competitionRules ?? null}
                hydratedFmSave={hydratedFmSave}
                activeShape={activeShape}
                customSlots={customSlots}
                applyToAnalystOnly={applyToAnalystOnly}
                onChangeShape={setActiveShape}
                onChangeCustomSlots={setCustomSlots}
                onChangeApplyToAnalystOnly={setApplyToAnalystOnly}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'squad' && (
          <AppErrorBoundary scopeLabel="Squad Analytics">
            <Suspense fallback={<LazyTabFallback label="Squad Analytics" />}>
              <SquadAnalyticsTable
                players={players}
                clubName={hydratedFmSave?.decodedPayload.meta.clubName}
                onSelectPlayer={setSelectedPlayer}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'recruitment' && (
          <AppErrorBoundary scopeLabel="Transfers & Recruitment Audit">
            <Suspense fallback={<LazyTabFallback label="Transfers & Audit" />}>
              <RecruitmentWorkspace
                cases={recruitmentCases}
                shortlists={shortlists}
                players={players}
                saveDate={saveDate}
                wageSpend={wageSpend}
                balance={balance}
                clubName={hydratedFmSave?.decodedPayload.meta.clubName}
                finances={
                  hydratedFmSave?.decodedPayload.finances
                    ? {
                        balanceNum: hydratedFmSave.decodedPayload.finances.balance,
                        wagePayrollWeekly:
                          hydratedFmSave.decodedPayload.finances.wagePayrollWeekly,
                        wageBudgetWeekly:
                          hydratedFmSave.decodedPayload.finances.wageBudgetWeekly,
                        transferBudgetRemaining:
                          hydratedFmSave.decodedPayload.finances
                            .transferBudgetRemaining,
                      }
                    : null
                }
                financialRunway={hydratedFmSave?.financialRunway ?? null}
                transferWindows={hydratedFmSave?.decodedPayload.transferWindows ?? null}
                competitionRules={hydratedFmSave?.competitionRules ?? null}
                divisionBenchmarks={hydratedFmSave?.divisionBenchmarks ?? null}
                scoutedTargets={
                  hydratedFmSave?.recruitmentTargets ??
                  hydratedFmSave?.decodedPayload.recruitmentTargets ??
                  []
                }
                trackedTargets={trackedTargets}
                onToggleTrackTarget={handleToggleTrackTarget}
                onAskAnalyst={handleAskAnalystPrompt}
                onAddCase={handleAddRecruitmentCase}
                onUpdateCase={handleUpdateRecruitmentCase}
                onDeleteCase={handleDeleteRecruitmentCase}
                onCreateShortlist={handleCreateShortlist}
                onDeleteShortlist={handleDeleteShortlist}
                onRemoveFromShortlist={handleRemovePlayerFromShortlist}
                onSelectPlayer={setSelectedPlayer}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'staff' && (
          <AppErrorBoundary scopeLabel="Staff Directory">
            <Suspense fallback={<LazyTabFallback label="Staff Directory" />}>
              <StaffDirectory
                staff={staff}
                clubName={hydratedFmSave?.decodedPayload.meta.clubName}
                jobVacancies={hydratedFmSave?.decodedPayload.jobVacancies ?? []}
                onSelectStaff={setSelectedStaff}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'setpieces' && (
          <AppErrorBoundary scopeLabel="Set Pieces & Training">
            <Suspense fallback={<LazyTabFallback label="Set Pieces & Training" />}>
              <SetPiecesAndTraining
                players={players}
                saveDate={saveDate}
                upcomingFixtures={hydratedFmSave?.decodedPayload.upcomingFixtures || []}
                clubName={clubName}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'matches' && (
          <AppErrorBoundary scopeLabel="Match Log Archive">
            <Suspense fallback={<LazyTabFallback label="Match Log Archive" />}>
              <MatchLogArchive
                matches={matches}
                liveLeagueRecord={hydratedFmSave?.leagueRecordLabel || null}
                liveSaveFileName={
                  hydratedFmSave?.decodedPayload.meta.fileName ||
                  hydratedFmSave?.decodedPayload.meta.saveName ||
                  null
                }
                clubName={hydratedFmSave?.decodedPayload.meta.clubName}
                saveDate={saveDate}
              />
            </Suspense>
          </AppErrorBoundary>
        )}
      </main>

      <footer className="hidden md:flex px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex-row items-center justify-between gap-2">
        <span>
          FM27 Command Hub · Football Manager 27 on PC (Patch 27.1.0 Verified Knowledge Base)
        </span>
        <span>
          Anchor Tag Protected: [INSERT NEXT CHRONOLOGICAL EVENT HERE]
        </span>
      </footer>

      {/* Fixed Thumb-Friendly Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-1.5 pt-1.5 grid grid-cols-6 gap-1"
        style={{
          paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {(
          [
            { id: 'sync', label: 'Analyst', icon: MessageSquare },
            { id: 'squad', label: 'Squad', icon: Users },
            { id: 'tactics', label: 'Tactics', icon: Shield },
            { id: 'recruitment', label: 'Transfers', icon: Briefcase },
            { id: 'setpieces', label: 'Corners', icon: Crosshair },
            { id: 'matches', label: 'Matches', icon: Trophy },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectTab(item.id)}
              className={`min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[9px] sm:text-[10px] leading-tight font-medium transition-colors ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/15 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Floating Toast Notification */}
      {appToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-emerald-200 shadow-2xl backdrop-blur"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{appToast}</span>
        </div>
      )}

      {/* Global Modals & Drawers */}
      {selectedPlayer && (
        <Suspense fallback={null}>
          <PlayerDetailModal
            player={selectedPlayer}
            shortlists={shortlists}
            isManagedClubPlayer={Boolean(
              selectedPlayer && players.some((p) => p.id === selectedPlayer.id)
            )}
            isTracked={Boolean(
              selectedPlayer &&
                isScoutTargetTracked(trackedTargets, {
                  uid: selectedPlayer.uid || 0,
                  name: selectedPlayer.name,
                })
            )}
            onClose={() => setSelectedPlayer(null)}
            onAddRecruitment={handleTrackPlayerInRecruitment}
            onToggleTrack={handleToggleTrackPlayerFromModal}
            onAddToShortlist={handleAddPlayerToShortlist}
          />
        </Suspense>
      )}

      {selectedStaff && (
        <Suspense fallback={null}>
          <StaffDetailModal
            staff={selectedStaff}
            onClose={() => setSelectedStaff(null)}
          />
        </Suspense>
      )}

      {showKnowledgeBase && (
        <Suspense fallback={null}>
          <KnowledgeBasePanel
            isOpen={showKnowledgeBase}
            onClose={() => setShowKnowledgeBase(false)}
            players={players}
          />
        </Suspense>
      )}

      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
            players={players}
            staff={staff}
            scoutTargets={
              hydratedFmSave?.recruitmentTargets ??
              hydratedFmSave?.decodedPayload.recruitmentTargets ??
              []
            }
            activeShape={activeShape}
            onSelectTab={handleSelectTab}
            onSelectPlayer={setSelectedPlayer}
            onSelectStaff={setSelectedStaff}
            onChangeShape={(shape) => {
              setActiveShape(shape);
              showGlobalToast(`Switched active formation to ${shape}`);
            }}
            onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
          />
        </Suspense>
      )}
    </div>
  );
}
