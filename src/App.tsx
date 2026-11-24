/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { EMPTY_CLUB_META, SQUAD_PLAYERS } from './data/squadData';
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
import { ClubGovernanceBanner } from './components/ClubGovernanceBanner';
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
  FmHubPersistedState,
} from './services/fmStorage';
import { isIndexedDbSnapshotNewer, hasPersistedContent } from './utils/persistedStateRecency';
import { FormationPresetKey } from './utils/bestXiSolver';
import { RecruitmentTarget } from './types/fmSave';
import {
  captureProgressionSnapshot,
  clearProgressionArchive,
} from './utils/progressionDiff';
import {
  buildDeepJourneyReport,
  clearAllSaveCache,
  createSaveHistoryPoint,
  DeepJourneyReport,
  listSaveHistoryPoints,
  putSaveHistoryPoint,
  type SaveHistoryPoint,
} from './services/saveCache';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './utils/clubGovernanceAndTactics';
import {
  loadFm27BinaryDictionary,
  type CompactBinaryDiffSnapshot,
} from './utils/fm27BinaryDictionary';
import { loadTacticRoleOverrides } from './utils/fm27TacticRoleInference';
import { filterMeaningfulInstructions } from './utils/squadPlannerHelper';
import type { CalibrationLabTab } from './components/Fm27BinaryCalibrationLab';

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
const Fm27BinaryCalibrationLab = lazy(() =>
  import('./components/Fm27BinaryCalibrationLab').then((m) => ({
    default: m.Fm27BinaryCalibrationLab,
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

const DEFAULT_ACTIVE_SHAPE: FormationPresetKey = '4-3-3 DM Wide';

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
  const [saveDate, setSaveDate] = useState<string>(EMPTY_CLUB_META.saveDate);
  const [nextFixture, setNextFixture] = useState<string>(
    EMPTY_CLUB_META.nextFixture
  );
  const [leagueStandingSub, setLeagueStandingSub] = useState<string>('--');
  const [wageSpend, setWageSpend] = useState<string>(EMPTY_CLUB_META.wageSpend);
  const [balance, setBalance] = useState<string>(EMPTY_CLUB_META.balance);
  const [hydratedFmSave, setHydratedFmSave] = useState<HydratedSaveState | null>(
    null
  );
  const [latestJourneyReport, setLatestJourneyReport] =
    useState<DeepJourneyReport | null>(null);
  const [snapshotResetNonce, setSnapshotResetNonce] = useState<number>(0);
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
  const [calibrationLabOpen, setCalibrationLabOpen] = useState<boolean>(false);
  const [calibrationLabTab, setCalibrationLabTab] = useState<CalibrationLabTab>('roles');
  const [dictionaryVersion, setDictionaryVersion] = useState<number>(0);
  const [appToast, setAppToast] = useState<string | null>(null);

  const handleOpenCalibrationLab = useCallback((tab: CalibrationLabTab = 'roles') => {
    setCalibrationLabTab(tab);
    setCalibrationLabOpen(true);
  }, []);

  const liveGovernance = useMemo(() => {
    if (!hydratedFmSave) return null;
    if (hydratedFmSave.decodedPayload) {
      return buildClubGovernanceState(
        hydratedFmSave.decodedPayload,
        players,
        loadFm27BinaryDictionary()
      );
    }
    return hydratedFmSave.governance ?? null;
  }, [hydratedFmSave, players, dictionaryVersion]);

  const liveLastMatchTactic = useMemo(() => {
    if (!hydratedFmSave) return null;
    if (hydratedFmSave.decodedPayload) {
      return (
        buildLastMatchTacticBlueprint(
          hydratedFmSave.decodedPayload,
          players,
          0,
          loadTacticRoleOverrides(),
          loadFm27BinaryDictionary()
        ) ??
        hydratedFmSave.lastMatchTactic ??
        null
      );
    }
    return hydratedFmSave.lastMatchTactic ?? null;
  }, [hydratedFmSave, players, dictionaryVersion]);
  const [backgroundSyncStatus, setBackgroundSyncStatus] = useState<{
    label: string;
    clubCoreReady: boolean;
  } | null>(null);
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const preSyncBaselineRef = useRef<{
    saveDate: string;
    clubName: string;
    players: PlayerRecord[];
    matches: MatchLogEntry[];
  } | null>(null);
  const latestJourneyPromiseRef = useRef<Promise<DeepJourneyReport | null> | null>(
    null
  );
  const toastTimeoutRef = useRef<number | null>(null);
  const resetConfirmTimeoutRef = useRef<number | null>(null);
  const idbRestoreCancelledRef = useRef<boolean>(false);
  const isResettingRef = useRef<boolean>(false);
  const skipNextAutosaveRef = useRef<boolean>(true);

  const showGlobalToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setAppToast(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      toastTimeoutRef.current = null;
      setAppToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      if (resetConfirmTimeoutRef.current !== null) {
        window.clearTimeout(resetConfirmTimeoutRef.current);
        resetConfirmTimeoutRef.current = null;
      }
      idbRestoreCancelledRef.current = true;
    },
    []
  );

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

  const [tacticsSubTab, setTacticsSubTab] = useState<'pitch' | 'prep' | 'setpieces' | 'playbook'>('pitch');

  const handleSelectTab = (tab: ActiveTab) => {
    if (tab === 'setpieces') {
      setTacticsSubTab('setpieces');
      setActiveTab('tactics');
    } else {
      if (tab === 'tactics') setTacticsSubTab('pitch');
      setActiveTab(tab);
    }
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
      hydratedFmSave?.decodedPayload?.recruitmentTargets ??
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

  const handleClearPendingPrompt = useCallback(() => {
    setPendingAnalystPrompt(null);
  }, []);

  const clubName =
    hydratedFmSave?.decodedPayload?.meta?.clubName || 'FM27 Command Hub';
  const managerName =
    hydratedFmSave?.decodedPayload?.meta?.managerName || '--';

  const [activeShape, setActiveShape] =
    useState<FormationPresetKey>(DEFAULT_ACTIVE_SHAPE);
  const [customSlots, setCustomSlots] = useState<PersistedCustomSlot[]>([]);
  const [applyToAnalystOnly, setApplyToAnalystOnly] = useState<boolean>(false);

  // Applies a complete persisted snapshot (localStorage or IndexedDB) without dropping fields
  const applyPersistedSnapshot = useCallback((saved: FmHubPersistedState) => {
    if (Array.isArray(saved.players)) setPlayers(saved.players);
    if (Array.isArray(saved.matches)) setMatches(saved.matches);
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
  }, []);

  // Restore saved state from previous session on initial mount
  useEffect(() => {
    const saved = loadPersistedFmState();
    if (saved && hasPersistedContent(saved)) {
      applyPersistedSnapshot(saved);
    }

    const buildSameClubBootJourney = (
      items: SaveHistoryPoint[],
      bootMatches: MatchLogEntry[]
    ): DeepJourneyReport | null => {
      if (items.length < 2) return null;
      const latestClub = (items[0].clubName || '').trim().toLowerCase();
      const sameClub = latestClub
        ? items.filter(
            (i) => (i.clubName || '').trim().toLowerCase() === latestClub
          )
        : items;
      if (sameClub.length < 2) return null;
      const parseSaveDateMs = (raw: string | undefined): number => {
        if (!raw) return 0;
        const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
        if (dmy) {
          return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        }
        const parsed = Date.parse(raw);
        return Number.isNaN(parsed) ? 0 : parsed;
      };
      const chronological = [...sameClub].sort((a, b) => {
        const da = parseSaveDateMs(a.inGameDate);
        const db = parseSaveDateMs(b.inGameDate);
        if (da !== db) return db - da;
        return b.capturedAt.localeCompare(a.capturedAt);
      });
      return buildDeepJourneyReport(
        chronological[1],
        chronological[0],
        sameClub,
        bootMatches
      );
    };

    void loadPersistedFmStateFromIndexedDb()
      .then((idbSaved) => {
        // A reset may have landed while the IndexedDB read was in flight
        if (idbRestoreCancelledRef.current) return saved;
        if (!hasPersistedContent(idbSaved)) return saved;
        // Only a strictly newer IndexedDB cache may replace the localStorage session
        if (!isIndexedDbSnapshotNewer(idbSaved, saved)) return saved;
        applyPersistedSnapshot(idbSaved);
        return idbSaved;
      })
      .then((activeSnapshot) => {
        // Only unlock auto-save after IndexedDB recency resolution completes so
        // an older localStorage restore can never overwrite a newer IndexedDB snapshot.
        skipNextAutosaveRef.current = false;
        if (idbRestoreCancelledRef.current) return;
        // Hydrate Save-to-Save Journey Report immediately on boot so Analyst Chat always has it
        void listSaveHistoryPoints().then((items) => {
          if (idbRestoreCancelledRef.current) return;
          const report = buildSameClubBootJourney(
            items,
            activeSnapshot?.matches ?? []
          );
          if (report) {
            setLatestJourneyReport(report);
          }
        });
      })
      .catch(() => {
        skipNextAutosaveRef.current = false;
      });
  }, [applyPersistedSnapshot]);

  // Automatically persist non-empty state across browser refreshes & sessions
  useEffect(() => {
    // Wait until initial mount restore (incl. IndexedDB recency check) has settled
    // so an older localStorage snapshot never clobbers a newer IndexedDB cache.
    if (skipNextAutosaveRef.current) {
      return;
    }
    if (isResettingRef.current) return;
    if (
      players.length > 0 ||
      matches.length > 0 ||
      staff.length > 0 ||
      recruitmentCases.length > 0 ||
      shortlists.length > 0
    ) {
      let cancelled = false;
      void savePersistedFmState({
        saveDate,
        nextFixture,
        leagueStandingSub,
        wageSpend,
        balance,
        clubName: hydratedFmSave?.decodedPayload?.meta?.clubName,
        players,
        matches,
        staff,
        recruitmentCases,
        shortlists,
        hydratedFmSave,
        activeShape,
        customSlots,
        applyToAnalystOnly,
      })
        .then((saved) => {
          if (!cancelled && saved) {
            setIsRestoredFromMemory(true);
          }
        })
        .catch((err) => {
          console.warn('Failed to auto-save FM27 state:', err);
        });
      return () => {
        cancelled = true;
      };
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

  const summary = useMemo(
    () => computeCompetitiveSummary(matches, saveDate),
    [matches, saveDate]
  );

  // Chat-logged matches are not part of the .fm snapshot, so the live header must
  // prefer the recomputed summary over the stale save labels once one is added.
  const manualMatchCount = useMemo(
    () => matches.filter((m) => m.source === 'CHAT').length,
    [matches]
  );
  const hasManualMatches = manualMatchCount > 0;

  const handleClearMemory = async () => {
    if (!confirmResetPending) {
      setConfirmResetPending(true);
      if (resetConfirmTimeoutRef.current !== null) {
        window.clearTimeout(resetConfirmTimeoutRef.current);
      }
      resetConfirmTimeoutRef.current = window.setTimeout(() => {
        resetConfirmTimeoutRef.current = null;
        setConfirmResetPending(false);
      }, 5000);
      return;
    }

    setConfirmResetPending(false);
    if (resetConfirmTimeoutRef.current !== null) {
      window.clearTimeout(resetConfirmTimeoutRef.current);
      resetConfirmTimeoutRef.current = null;
    }
    // Block the auto-save effect while the reset is being applied
    isResettingRef.current = true;
    // Cancel any in-flight IndexedDB restore so it cannot resurrect cleared state
    idbRestoreCancelledRef.current = true;
    await clearPersistedFmState();
    clearProgressionArchive();
    await clearAllSaveCache();
    // A late auto-save IndexedDB write may land after the wipe; clear once more
    await clearPersistedFmState();
    setPlayers([]);
    setMatches([]);
    setStaff([]);
    setRecruitmentCases([]);
    setShortlists([]);
    setTrackedTargets([]);
    latestJourneyPromiseRef.current = null;
    setLatestJourneyReport(null);
    setSaveDate(EMPTY_CLUB_META.saveDate);
    setNextFixture(EMPTY_CLUB_META.nextFixture);
    setLeagueStandingSub('--');
    setWageSpend(EMPTY_CLUB_META.wageSpend);
    setBalance(EMPTY_CLUB_META.balance);
    setHydratedFmSave(null);
    setActiveShape(DEFAULT_ACTIVE_SHAPE);
    setCustomSlots([]);
    setApplyToAnalystOnly(false);
    setIsRestoredFromMemory(false);
    setSelectedPlayer(null);
    setSelectedStaff(null);
    setSnapshotResetNonce((n) => n + 1);
    showGlobalToast('All saved state, cached saves & snapshots cleared — ready to test fresh');
    window.setTimeout(() => {
      isResettingRef.current = false;
    }, 0);
  };

  const handleExportBackup = () => {
    let json = exportFmStateBackupJson();
    // Fall back to live in-memory React state for large saves persisted in IndexedDB only
    if (
      !json &&
      (players.length > 0 ||
        matches.length > 0 ||
        staff.length > 0 ||
        recruitmentCases.length > 0 ||
        shortlists.length > 0)
    ) {
      json = JSON.stringify(
        {
          version: 1,
          lastSyncedAt: new Date().toISOString(),
          saveDate,
          nextFixture,
          leagueStandingSub,
          wageSpend,
          balance,
          clubName: hydratedFmSave?.decodedPayload?.meta?.clubName,
          players,
          matches,
          staff,
          recruitmentCases,
          shortlists,
          hydratedFmSave,
          activeShape,
          customSlots,
          applyToAnalystOnly,
        },
        null,
        2
      );
    }
    if (!json) {
      showGlobalToast('No loaded save data to back up yet');
      return;
    }
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
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        const imported = await importFmStateBackupJson(text);
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
          if (imported.activeShape) setActiveShape(imported.activeShape);
          setCustomSlots(imported.customSlots ?? []);
          setApplyToAnalystOnly(Boolean(imported.applyToAnalystOnly));
          setIsRestoredFromMemory(true);
          showGlobalToast(
            `Restored campaign snapshot (${imported.players.length} players)`
          );
        } else {
          showGlobalToast('Invalid FM27 backup file format.');
        }
      } catch (err) {
        console.warn('Failed to import FM27 backup:', err);
        showGlobalToast('Invalid FM27 backup file format.');
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

  const handleBackgroundSyncStatusChange = useCallback(
    (status: { label: string; clubCoreReady: boolean } | null) => {
      setBackgroundSyncStatus(status);
      if (status === null) {
        preSyncBaselineRef.current = null;
      }
    },
    []
  );

  const handleApplyDecodedFmSave = (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean }
  ): HydratedSaveState => {
    const isInterim = Boolean(options?.isInterimCheckpoint);

    if (isInterim && !preSyncBaselineRef.current) {
      preSyncBaselineRef.current = {
        saveDate,
        clubName: hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Club',
        players,
        matches,
      };
    }

    const baseline = preSyncBaselineRef.current ?? {
      saveDate,
      clubName: hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Club',
      players,
      matches,
    };

    if (!isInterim) {
      preSyncBaselineRef.current = null;
      recordPreviousSnapshot(baseline.saveDate, baseline.players, baseline.matches);
      if (baseline.players.length > 0 && baseline.saveDate && baseline.saveDate !== '--') {
        captureProgressionSnapshot(
          baseline.saveDate,
          baseline.clubName,
          baseline.players
        );
      }
    }

    const hydrated = hydrateAppFromDecodedFmSave(
      decoded,
      baseline.players,
      baseline.matches
    );

    if (!isInterim) {
      captureProgressionSnapshot(
        hydrated.saveDateLabel,
        decoded.meta.clubName || 'Managed Club',
        hydrated.updatedSquad
      );
      const parsedPos = Number(
        (hydrated.leagueStandingLabel || '').match(/^#?(\d+)/)?.[1] ?? ''
      );
      const standing = decoded.leagueStanding;
      const promisesAtRisk =
        hydrated.governance?.playerPromiseAudits.filter(
          (p) => p.status === 'breached' || p.status === 'at_risk'
        ).length ?? null;
      const binaryDiffSnapshot: CompactBinaryDiffSnapshot | null =
        decoded.tactics?.length || decoded.binaryForensics
          ? {
              label: `${hydrated.saveDateLabel} · ${decoded.meta.fileName || decoded.meta.clubName || 'FM27 Save'}`,
              inGameDate: hydrated.saveDateLabel,
              fmBuild: decoded.binaryForensics?.fmBuild || decoded.meta.build || undefined,
              tactics: decoded.tactics || [],
              binaryForensics: decoded.binaryForensics ?? null,
            }
          : null;
      const snapshotPoint = createSaveHistoryPoint({
        saveName: decoded.meta.fileName || decoded.meta.saveName || 'fm27-save',
        inGameDate: hydrated.saveDateLabel,
        clubName: decoded.meta.clubName || 'Managed Club',
        players: hydrated.updatedSquad,
        matches: hydrated.updatedMatches,
        balance: hydrated.balanceLabel || undefined,
        balanceNum: hydrated.canonicalBalanceNum ?? decoded.finances?.balance ?? null,
        monthlyBurnRate: hydrated.financialRunway?.monthlyBurnRate ?? null,
        wageBudgetWeekly: decoded.finances?.wageBudgetWeekly ?? null,
        leaguePosition:
          standing?.position ?? (Number.isFinite(parsedPos) && parsedPos > 0 ? parsedPos : null),
        played: standing?.played ?? null,
        won: standing?.won ?? null,
        drawn: standing?.drawn ?? null,
        lost: standing?.lost ?? null,
        points: standing?.points ?? null,
        goalsFor: standing?.goalsFor ?? null,
        goalsAgainst: standing?.goalsAgainst ?? null,
        tacticName: hydrated.lastMatchTactic?.tacticName ?? null,
        tacticFormation: hydrated.lastMatchTactic?.inPossessionFormation ?? null,
        tacticMentality: hydrated.lastMatchTactic?.mentality ?? null,
        activeInjuriesCount: decoded.activeInjuries?.length ?? 0,
        activeSuspensionsCount: hydrated.activeSuspensions?.length ?? 0,
        promisesAtRiskCount: promisesAtRisk,
        managerExpires: hydrated.governance?.managerContract.expires ?? null,
        boardGrade: hydrated.governance?.boardConfidence.grade ?? null,
        supporterGrade: hydrated.governance?.supporterConfidence.grade ?? null,
        binaryDiffSnapshot,
      });
      latestJourneyPromiseRef.current = putSaveHistoryPoint(snapshotPoint)
        .then(async () => {
          const items = await listSaveHistoryPoints();
          setSnapshotResetNonce((n) => n + 1);
          const targetClub = (snapshotPoint.clubName || '').trim().toLowerCase();
          const sameClub = targetClub
            ? items.filter(
                (i) => (i.clubName || '').trim().toLowerCase() === targetClub
              )
            : items;
          if (sameClub.length >= 2) {
            const parseSaveDateMs = (raw: string | undefined): number => {
              if (!raw) return 0;
              const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
              if (dmy) {
                return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
              }
              const parsed = Date.parse(raw);
              return Number.isNaN(parsed) ? 0 : parsed;
            };
            const chronological = [...sameClub].sort((a, b) => {
              const da = parseSaveDateMs(a.inGameDate);
              const db = parseSaveDateMs(b.inGameDate);
              if (da !== db) return db - da;
              return b.capturedAt.localeCompare(a.capturedAt);
            });
            const report = buildDeepJourneyReport(
              chronological[1],
              chronological[0],
              sameClub,
              hydrated.updatedMatches
            );
            setLatestJourneyReport(report);
            return report;
          }
          setLatestJourneyReport(null);
          return null;
        })
        .catch((err) => {
          console.warn('Failed to persist FM27 save history point:', err);
          showGlobalToast(
            'Save history could not be stored on this device (storage may be full) — live analytics are unaffected'
          );
          return null;
        });
    }

    setHydratedFmSave(hydrated);
    setPlayers(hydrated.updatedSquad);
    setStaff(hydrated.updatedStaff || []);
    if (!isInterim || hydrated.updatedMatches.length > 0) {
      setMatches(hydrated.updatedMatches);
    }
    setSaveDate(hydrated.saveDateLabel);
    if (
      hydrated.nextFixtureLabel &&
      (!isInterim || hydrated.nextFixtureLabel !== '--')
    ) {
      setNextFixture(hydrated.nextFixtureLabel);
    }
    if (
      hydrated.leagueStandingLabel &&
      (!isInterim || hydrated.leagueStandingLabel !== '--')
    ) {
      setLeagueStandingSub(hydrated.leagueStandingLabel);
    }
    if (hydrated.wageComplianceLabel) {
      setWageSpend(hydrated.wageComplianceLabel);
    }
    if (hydrated.balanceLabel) {
      setBalance(hydrated.balanceLabel);
    }
    if (isInterim) {
      showGlobalToast(
        `${decoded.meta.clubName || 'Club'} squad, staff & tactics ready — finishing fixtures & stats in background...`
      );
    } else {
      setBackgroundSyncStatus(null);
      showGlobalToast(
        `Synced ${decoded.meta.clubName || 'Club'} (${hydrated.updatedSquad.length} players · ${hydrated.saveDateLabel})`
      );
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
        currentClub: hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Squad',
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
            { id: 'sync' as const, label: 'Hub & Analyst' },
            { id: 'squad' as const, label: `Squad (${players.length})` },
            { id: 'tactics' as const, label: 'Tactics & Corners' },
            { id: 'recruitment' as const, label: 'Transfers' },
            { id: 'matches' as const, label: `Matches (${matches.length})` },
            {
              id: 'staff' as const,
              label: staff.length > 0 ? `Staff (${staff.length})` : 'Staff',
            },
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

        {/* Actions: Quick Search + FM27 Knowledge Base + Backup/Restore/Reset */}
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
            title="Quick Search players, staff, and scout targets"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5 text-emerald-400" />
            <span>Search</span>
          </button>

          <button
            type="button"
            onClick={() => setShowKnowledgeBase(true)}
            title="Open FM27 Patch 27.1.0 Knowledge Base"
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
                  {confirmResetPending ? (
                    <>
                      <span className="sm:hidden">Confirm?</span>
                      <span className="hidden sm:inline">Confirm Reset?</span>
                    </>
                  ) : (
                    'Reset'
                  )}
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
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-24 md:pb-8 space-y-4 sm:space-y-5">
        {/* Live Background Sync Pill when user is already exploring Squad/Tactics/Staff/Transfers */}
        {backgroundSyncStatus && activeTab !== 'sync' && (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-emerald-200">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
              <span className="truncate">
                {backgroundSyncStatus.clubCoreReady
                  ? `Club core live — finishing in background: ${backgroundSyncStatus.label}`
                  : backgroundSyncStatus.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectTab('sync')}
              className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-500/40 cursor-pointer"
            >
              View Sync
            </button>
          </div>
        )}

        {/* Compact Status Bar (shown once a save is loaded so first-entry welcome hero stays clean) */}
        {(hydratedFmSave || players.length > 0) && (
          <div className="md:hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
                <span className="truncate">
                  {saveDate} · {hydratedFmSave?.leagueRecordLabel || `${players.length} Players`}
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
        )}

        {/* Executive Club & Save Baseline Strip (shown once a save is loaded; expandable on mobile) */}
        {(hydratedFmSave || players.length > 0) && (
        <div className={showMobileDetails ? 'space-y-4' : 'hidden md:block space-y-5'}>
          <section className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {hydratedFmSave
                      ? `${hydratedFmSave?.decodedPayload?.meta?.clubName} (${hydratedFmSave?.decodedPayload?.meta?.game} Build ${hydratedFmSave?.decodedPayload?.meta?.build})`
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
                      ? `LIVE .FM SYNCED (${hydratedFmSave?.decodedPayload?.meta?.fileName || hydratedFmSave?.decodedPayload?.meta?.saveName || '.fm'})`
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
                    ? `${hydratedFmSave?.decodedPayload?.meta?.clubName} Command Hub`
                    : 'FM27 Command Hub & AI Tactical Co-Pilot'}
                </h1>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 lg:text-right space-y-1">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Next Fixture: {nextFixture}
                </div>
                <div>
                  {hydratedFmSave
                    ? `Manager: ${managerName} · Decoded locally via fmsave ${hydratedFmSave?.decodedPayload?.meta?.fmsaveVersion}`
                    : 'Status: Zero Mock Baseline · Verified Patch 27.1.0 KB Ready'}
                </div>
              </div>
            </div>

            {/* 4-Column Quantitative KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {hydratedFmSave
                    ? `Live League Standing (${hydratedFmSave?.decodedPayload?.leagueStanding?.competitionName || 'League'})`
                    : 'League Standing'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {(hasManualMatches ? null : hydratedFmSave?.leagueRecordLabel) ||
                    (summary.played > 0
                      ? `${summary.played} GP · ${summary.wins}W-${summary.draws}D-${summary.losses}L · ${summary.points} Pts`
                      : '--')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasManualMatches
                    ? hydratedFmSave
                      ? `Includes ${manualMatchCount} chat-logged match${manualMatchCount === 1 ? '' : 'es'} not yet in the .fm save`
                      : 'Awaiting .fm save'
                    : hydratedFmSave?.leagueStandingLabel ||
                      (summary.played > 0
                        ? leagueStandingSub
                        : hydratedFmSave
                          ? '0 competitive matches played yet'
                          : 'Awaiting .fm save')}
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

          {/* Live .fm Save Verification Receipt & Club Governance Banner */}
          {hydratedFmSave && <LiveFmSaveProofCard hydrated={hydratedFmSave} />}
          {hydratedFmSave && liveGovernance && (
            <ClubGovernanceBanner
              governance={liveGovernance}
              extractionManifest={hydratedFmSave?.decodedPayload?.extractionManifest ?? null}
              onAskAnalyst={handleAskAnalystPrompt}
              onOpenCalibrationLab={handleOpenCalibrationLab}
            />
          )}
        </div>
        )}

        {/* Active View Area (AutoSyncWorkspace stays mounted so chat history persists across tabs) */}
        <div className={activeTab === 'sync' ? '' : 'hidden'}>
          <AppErrorBoundary scopeLabel="Hub & AI Analyst">
            <AutoSyncWorkspace
              matches={matches}
              players={players}
              staff={staff}
              recruitmentCases={recruitmentCases}
              trackedTargets={trackedTargets}
              latestJourneyReport={latestJourneyReport}
              onJourneyReportChange={setLatestJourneyReport}
              getLatestJourneyReportAsync={async () => {
                if (latestJourneyPromiseRef.current) {
                  return latestJourneyPromiseRef.current;
                }
                return latestJourneyReport;
              }}
              snapshotResetNonce={snapshotResetNonce}
              currentSaveDate={saveDate}
              clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
              managerName={managerName}
              nextFixture={nextFixture}
              leagueStandingSub={leagueStandingSub}
              wageSpend={wageSpend}
              balance={balance}
              hydratedFmSave={hydratedFmSave}
              activeShape={activeShape}
              customSlots={customSlots}
              applyToAnalystOnly={applyToAnalystOnly}
              liveGovernance={liveGovernance}
              liveLastMatchTactic={liveLastMatchTactic}
              onUpdateSaveDate={setSaveDate}
              onAddMatch={handleAddMatch}
              onApplyPlayerUpdates={handleApplyPlayerUpdates}
              onBulkMergePlayers={handleBulkMergePlayers}
              onApplyDecodedFmSave={handleApplyDecodedFmSave}
              onBackgroundSyncStatusChange={handleBackgroundSyncStatusChange}
              pendingPrompt={pendingAnalystPrompt}
              onClearPendingPrompt={handleClearPendingPrompt}
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
                activeSuspensions={hydratedFmSave?.activeSuspensions}
                competitionRules={hydratedFmSave?.competitionRules ?? null}
                hydratedFmSave={hydratedFmSave}
                activeShape={activeShape}
                customSlots={customSlots}
                applyToAnalystOnly={applyToAnalystOnly}
                initialSubTab={tacticsSubTab}
                onChangeShape={setActiveShape}
                onChangeCustomSlots={setCustomSlots}
                onChangeApplyToAnalystOnly={setApplyToAnalystOnly}
                onAskAnalyst={handleAskAnalystPrompt}
                dictionaryVersion={dictionaryVersion}
                onOpenCalibrationLab={handleOpenCalibrationLab}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'squad' && (
          <AppErrorBoundary scopeLabel="Squad Analytics">
            <Suspense fallback={<LazyTabFallback label="Squad Analytics" />}>
              <SquadAnalyticsTable
                players={players}
                matches={matches}
                clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
                saveDate={saveDate}
                finances={
                  hydratedFmSave?.decodedPayload?.finances ||
                  hydratedFmSave?.canonicalBalanceNum !== null
                    ? {
                        balanceNum:
                          hydratedFmSave?.canonicalBalanceNum ??
                          hydratedFmSave?.decodedPayload?.finances?.balance ??
                          null,
                        wagePayrollWeekly:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.wagePayrollWeekly ?? null,
                        wageBudgetWeekly:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.wageBudgetWeekly ?? null,
                        transferBudgetRemaining:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.transferBudgetRemaining ?? null,
                        monthlyBurnRate:
                          hydratedFmSave?.financialRunway?.monthlyBurnRate ?? null,
                      }
                    : null
                }
                divisionBenchmarks={hydratedFmSave?.divisionBenchmarks ?? null}
                governance={liveGovernance ?? hydratedFmSave?.governance ?? null}
                lastMatchTactic={liveLastMatchTactic ?? hydratedFmSave?.lastMatchTactic ?? null}
                squadPlanner={hydratedFmSave?.squadPlanner ?? null}
                nextCompetitionName={
                  hydratedFmSave?.decodedPayload?.upcomingFixtures?.[0]?.competition ??
                  null
                }
                isFastSync={Boolean(hydratedFmSave?.fastSync)}
                playedMatchesCount={
                  hydratedFmSave?.decodedPayload?.playedMatches?.length ?? matches.length
                }
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
                wageSpend={hydratedFmSave?.wageComplianceLabel || wageSpend}
                balance={hydratedFmSave?.balanceLabel || balance}
                clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
                finances={
                  hydratedFmSave?.decodedPayload?.finances ||
                  hydratedFmSave?.canonicalBalanceNum !== null
                    ? {
                        balanceNum:
                          hydratedFmSave?.canonicalBalanceNum ??
                          hydratedFmSave?.decodedPayload?.finances?.balance ??
                          null,
                        wagePayrollWeekly:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.wagePayrollWeekly ?? null,
                        wageBudgetWeekly:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.wageBudgetWeekly ?? null,
                        transferBudgetRemaining:
                          hydratedFmSave?.decodedPayload?.finances
                            ?.transferBudgetRemaining ?? null,
                        monthlyBurnRate:
                          hydratedFmSave?.financialRunway?.monthlyBurnRate ?? null,
                      }
                    : null
                }
                financialRunway={hydratedFmSave?.financialRunway ?? null}
                transferWindows={hydratedFmSave?.decodedPayload?.transferWindows ?? null}
                competitionRules={hydratedFmSave?.competitionRules ?? null}
                divisionBenchmarks={hydratedFmSave?.divisionBenchmarks ?? null}
                governance={liveGovernance ?? hydratedFmSave?.governance ?? null}
                lastMatchTactic={liveLastMatchTactic ?? hydratedFmSave?.lastMatchTactic ?? null}
                scoutedTargets={
                  hydratedFmSave?.recruitmentTargets ??
                  hydratedFmSave?.decodedPayload?.recruitmentTargets ??
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
                clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
                saveDate={saveDate}
                jobVacancies={hydratedFmSave?.decodedPayload?.jobVacancies ?? []}
                onSelectStaff={setSelectedStaff}
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
                  hydratedFmSave?.decodedPayload?.meta?.fileName ||
                  hydratedFmSave?.decodedPayload?.meta?.saveName ||
                  null
                }
                clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
                saveDate={saveDate}
                activeShape={
                  liveLastMatchTactic?.inPossessionFormation ||
                  hydratedFmSave?.decodedPayload?.tactics?.[0]?.inPossessionFormation ||
                  activeShape
                }
                activeTacticSummary={(() => {
                  if (liveLastMatchTactic && liveLastMatchTactic.starters.length > 0) {
                    const slotList = liveLastMatchTactic.starters
                      .map((s) => {
                        const posStr =
                          s.outOfPossessionPosition &&
                          s.outOfPossessionPosition !== s.position
                            ? `${s.position}->${s.outOfPossessionPosition}`
                            : s.position;
                        const ip = s.inPossessionRole || s.ipRole || 'Std';
                        const oop = s.outOfPossessionRole || s.oopRole || ip;
                        return `${posStr} (${ip} IP / ${oop} OOP)`;
                      })
                      .join(', ');
                    const ti = liveLastMatchTactic.teamInstructions;
                    const tiParts = [
                      ...filterMeaningfulInstructions(ti.inPossession),
                      ...filterMeaningfulInstructions(ti.inTransition),
                      ...filterMeaningfulInstructions(ti.outOfPossession),
                    ];
                    const tiSuffix =
                      tiParts.length > 0 ? ` | TI: ${tiParts.slice(0, 8).join(', ')}` : '';
                    return `${liveLastMatchTactic.tacticName} (${liveLastMatchTactic.mentality}, IP ${liveLastMatchTactic.inPossessionFormation} / OOP ${liveLastMatchTactic.outOfPossessionFormation}): ${slotList}${tiSuffix}`;
                  }
                  if (customSlots.length > 0) {
                    return `${activeShape}: ${customSlots.map((c) => `${c.slotId} (${c.ipRole} IP / ${c.oopRole} OOP)`).join(', ')}`;
                  }
                  return `${activeShape} (No-Nonsense GK, Full-Backs, Centre-Back + Ball-Playing CB, Defensive Midfielder, Box-to-Box CM + Channel CM, Winger + Inside Forward / Tracking Wingers OOP, Channel Forward)`;
                })()}
              />
            </Suspense>
          </AppErrorBoundary>
        )}
      </main>

      <footer className="hidden md:flex px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex-row items-center justify-between gap-2">
        <span>
          FM27 Command Hub · Football Manager 27 (Patch 27.1.0 Verified Knowledge Base)
        </span>
        <span>
          Dual-Phase IP/OOP Tactics · Live .fm Save Analytics
        </span>
      </footer>

      {/* Fixed Thumb-Friendly Mobile Bottom Navigation Bar (All 6 Sections 1-Tap Accessible) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-1.5 pt-1.5 grid grid-cols-6 gap-1"
        style={{
          paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {(
          [
            { id: 'sync', label: 'Hub', icon: MessageSquare },
            { id: 'squad', label: 'Squad', icon: Users },
            { id: 'tactics', label: 'Tactics', icon: Shield },
            { id: 'recruitment', label: 'Transfers', icon: Briefcase },
            { id: 'matches', label: 'Matches', icon: Trophy },
            { id: 'staff', label: 'Staff', icon: UserCheck },
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
            squadPlayers={players}
            divisionBenchmarks={hydratedFmSave?.divisionBenchmarks ?? null}
            governance={liveGovernance ?? hydratedFmSave?.governance ?? null}
            lastMatchTactic={liveLastMatchTactic ?? hydratedFmSave?.lastMatchTactic ?? null}
            nextCompetitionName={
              hydratedFmSave?.decodedPayload?.upcomingFixtures?.[0]?.competition ??
              null
            }
            isFastSync={Boolean(hydratedFmSave?.fastSync)}
            playedMatchesCount={
              hydratedFmSave?.decodedPayload?.playedMatches?.length ?? matches.length
            }
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
              hydratedFmSave?.decodedPayload?.recruitmentTargets ??
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

      {calibrationLabOpen && (
        <Suspense fallback={null}>
          <Fm27BinaryCalibrationLab
            isOpen={calibrationLabOpen}
            initialTab={calibrationLabTab}
            decodedPayload={hydratedFmSave?.decodedPayload ?? null}
            players={players}
            onClose={() => setCalibrationLabOpen(false)}
            onDictionaryChanged={() => setDictionaryVersion((v) => v + 1)}
          />
        </Suspense>
      )}
    </div>
  );
}
