/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import { EMPTY_CLUB_META, SQUAD_PLAYERS } from './data/squadData';
import { FeedbackToast } from './components/FeedbackToast';
import { emitFeedback, feedback, subscribeFeedback, type FeedbackMessage } from './utils/feedbackBus';
import { CompareTrayProvider } from './context/CompareTrayContext';
import { COMPETITIVE_MATCH_LOGS } from './data/matchAndTacticsData';
import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from './types/fm27';
import {
  parsePwaLaunchParams,
  usePwaLifecycle,
} from './hooks/usePwaLifecycle';
import { useMobileKeyboard } from './hooks/useMobileKeyboard';
import { useSheetHistory } from './hooks/useHistoryNavigation';
import { useAppNavigation, type ActiveTab } from './hooks/useAppNavigation';
import { useSavePersistence } from './hooks/useSavePersistence';
import { useShareSummary } from './hooks/useShareSummary';
import { useFmSaveImport } from './hooks/useFmSaveImport';
import { useBackupTransfer } from './hooks/useBackupTransfer';
import { useSquadDeltaUpdates } from './hooks/useSquadDeltaUpdates';
import { clearAllChatHistory } from './services/chatStorage';
import { PwaStatusBanners } from './components/PwaStatusBanners';
import { MobileBottomNav } from './components/MobileBottomNav';
import { computeCompetitiveSummary } from './utils/competitiveSummary';
import { formatNation } from './utils/displayValue';
import type { HydratedSaveState } from './utils/fmSaveHydrator';
import { SharedReportView } from './components/SharedReportView';
import {
  clearPersistedFmState,
  isScoutTargetTracked,
  toggleTrackedScoutTarget,
  loadTrackedScoutTargets,
  PersistedCustomSlot,
  FmHubPersistedState,
} from './services/fmStorage';
import { buildFinancesPanelFromSave } from './utils/clubFinances';
import type { FormationPresetKey } from './utils/bestXiSolver';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from './types/fmSave';
import type { DeepJourneyReport } from './services/saveCache';
import type { CalibrationLabTab } from './components/Fm27BinaryCalibrationLab';
import type { BackgroundSyncStatus } from './components/shell/backgroundSync';
import { AppHeader } from './components/shell/AppHeader';
import { AppMainContent } from './components/shell/AppMainContent';

const MobileMoreSheet = lazy(() =>
  import('./components/MobileMoreSheet').then((m) => ({
    default: m.MobileMoreSheet,
  }))
);
const ShareReportModal = lazy(() =>
  import('./components/ShareReportModal').then((m) => ({
    default: m.ShareReportModal,
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

const DEFAULT_ACTIVE_SHAPE: FormationPresetKey = '4-3-3 DM Wide';

export default function App() {
  const nav = useAppNavigation(
    () =>
      showMoreSheet ||
      showCommandPalette ||
      showKnowledgeBase ||
      calibrationLabOpen ||
      Boolean(selectedPlayer) ||
      Boolean(selectedStaff)
  );
  const {
    activeTab,
    hubPanel,
    tacticsSubTab,
    recentViews,
    setActiveTab,
    selectTab,
    changeHubPanel,
    changeTacticsSubTab,
    openRecentView,
    scrollToTop,
  } = nav;
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
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const { shareToken, sharedSummary, openOwnHub: handleOpenOwnHub } = useShareSummary();

  const shareFinancesPanel = useMemo(
    () =>
      buildFinancesPanelFromSave({
        hydratedSave: hydratedFmSave,
        players,
        staff,
        balanceLabel: balance,
        wageSpendLabel: wageSpend,
      }),
    [hydratedFmSave, players, staff, balance, wageSpend]
  );

  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showMoreSheet, setShowMoreSheet] = useState<boolean>(false);
  const [calibrationLabOpen, setCalibrationLabOpen] = useState<boolean>(false);
  const [calibrationLabTab, setCalibrationLabTab] = useState<CalibrationLabTab>('roles');
  const [dictionaryVersion, setDictionaryVersion] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<FeedbackMessage | null>(null);
  const { isKeyboardOpen } = useMobileKeyboard();

  const handleOpenCalibrationLab = useCallback((tab: CalibrationLabTab = 'roles') => {
    setCalibrationLabTab(tab);
    setCalibrationLabOpen(true);
  }, []);

  const [derivedGovernance, setDerivedGovernance] =
    useState<ClubGovernanceState | null>(null);
  const [derivedLastMatchTactic, setDerivedLastMatchTactic] =
    useState<LastMatchTacticBlueprint | null>(null);

  // Immediately expose persisted governance & tactic on cold start, then
  // refresh asynchronously via dynamic import when decodedPayload / dictionary changes.
  useEffect(() => {
    if (!hydratedFmSave?.decodedPayload) {
      setDerivedGovernance(null);
      setDerivedLastMatchTactic(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      import('./utils/clubGovernanceAndTactics'),
      import('./utils/fm27BinaryDictionary'),
      import('./utils/fm27TacticRoleInference'),
    ])
      .then(
        ([
          { buildClubGovernanceState, buildLastMatchTacticBlueprint },
          { loadFm27BinaryDictionary },
          { loadTacticRoleOverrides },
        ]) => {
          if (cancelled || !hydratedFmSave.decodedPayload) return;
          const dict = loadFm27BinaryDictionary();
          setDerivedGovernance(
            buildClubGovernanceState(
              hydratedFmSave.decodedPayload,
              players,
              dict
            )
          );
          setDerivedLastMatchTactic(
            buildLastMatchTacticBlueprint(
              hydratedFmSave.decodedPayload,
              players,
              0,
              loadTacticRoleOverrides(),
              dict
            ) ??
              hydratedFmSave.lastMatchTactic ??
              null
          );
        }
      )
      .catch(() => {
        // fallback cleanly to hydratedFmSave persisted governance/tactic
      });
    return () => {
      cancelled = true;
    };
  }, [hydratedFmSave, players, dictionaryVersion]);

  const liveGovernance = hydratedFmSave
    ? derivedGovernance ?? hydratedFmSave.governance ?? null
    : null;

  const liveLastMatchTactic = hydratedFmSave
    ? derivedLastMatchTactic ?? hydratedFmSave.lastMatchTactic ?? null
    : null;
  const [backgroundSyncStatus, setBackgroundSyncStatus] =
    useState<BackgroundSyncStatus | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState<boolean>(false);
  const [quickPickedFmFile, setQuickPickedFmFile] = useState<File | null>(null);
  const pwa = usePwaLifecycle({
    isBusy: workspaceBusy || Boolean(backgroundSyncStatus),
  });
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickFmFileInputRef = useRef<HTMLInputElement | null>(null);
  const resetConfirmTimeoutRef = useRef<number | null>(null);

  const showGlobalToast = useCallback((msg: string) => {
    emitFeedback({ text: msg, tone: 'success' });
  }, []);

  const { applyDecodedSave, preSyncBaselineRef, latestJourneyPromiseRef } = useFmSaveImport({
    players,
    matches,
    saveDate,
    hydratedFmSave,
    setPlayers,
    setStaff,
    setMatches,
    setSaveDate,
    setNextFixture,
    setLeagueStandingSub,
    setWageSpend,
    setBalance,
    setHydratedFmSave,
    setSnapshotResetNonce,
    setLatestJourneyReport,
    setBackgroundSyncStatus,
    showGlobalToast,
  });

  // Everything that reports progress posts to the feedback bus, so a toast can be
  // raised from a deep component without threading a callback through every layer.
  useEffect(() => subscribeFeedback(setFeedbackMessage), []);

  // Handle Android home-screen shortcut URLs (?tab=tactics, ?tab=squad, ?action=sync).
  // The active tab is seeded from the launch URL above, so this only handles the toast.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const launch = parsePwaLaunchParams(window.location.search);
    if (launch.shouldPromptSync) {
      showGlobalToast('Ready to sync — tap Import .fm to pick your save file.');
    }
  }, [showGlobalToast]);

  // Switch straight to Hub when a .fm save is opened via PWA file_handlers
  useEffect(() => {
    if (pwa.launchedFmFile) {
      setActiveTab('sync');
    }
  }, [pwa.launchedFmFile]);


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

  const handleScrollToTop = scrollToTop;
  const handleOpenRecentView = openRecentView;
  const handleHubPanelChange = changeHubPanel;
  const handleTacticsSubTabChange = changeTacticsSubTab;

  // Choosing a tab from the strip closes the More sheet first, so the sheet never
  // stays open over a section the user has already left.
  const handleSelectTab = (tab: ActiveTab) => {
    setShowMoreSheet(false);
    selectTab(tab);
  };

  // These three overlays do not use MobileSheetFrame, so App owns their Back entries.
  useSheetHistory(showMoreSheet, () => setShowMoreSheet(false));
  useSheetHistory(showKnowledgeBase, () => setShowKnowledgeBase(false));
  useSheetHistory(calibrationLabOpen, () => setCalibrationLabOpen(false));

  const handleToggleTrackTarget = (target: RecruitmentTarget): boolean => {
    const previous = trackedTargets;
    const { targets: next, tracked } = toggleTrackedScoutTarget(target, previous);
    setTrackedTargets(next);
    if (tracked) {
      feedback.success(`Added ${target.name} to Shortlist`);
    } else {
      feedback.undo(`Removed ${target.name} from Shortlist`, () => setTrackedTargets(previous));
    }
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
      nationality: formatNation(player.nation),
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

  const snapshotToPersist = useMemo(
    () => ({
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
    }),
    [
      saveDate,
      nextFixture,
      leagueStandingSub,
      wageSpend,
      balance,
      hydratedFmSave,
      players,
      matches,
      staff,
      recruitmentCases,
      shortlists,
      activeShape,
      customSlots,
      applyToAnalystOnly,
    ]
  );

  const persistence = useSavePersistence({
    snapshot: snapshotToPersist,
    onRestore: applyPersistedSnapshot,
    onJourneyReport: setLatestJourneyReport,
    onPersisted: () => setIsRestoredFromMemory(true),
  });

  const summary = useMemo(
    () => computeCompetitiveSummary(matches, saveDate),
    [matches, saveDate]
  );

  const playerBasicWeekly = useMemo(
    () => players.reduce((sum, p) => sum + (p.wagePw || 0), 0),
    [players]
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
    // Block auto-save while the reset is applied, and stop an in-flight IndexedDB
    // restore from writing cleared state back.
    persistence.pauseAutosave();
    persistence.cancelPendingRestore();
    await clearPersistedFmState();
    const [{ clearProgressionArchive }, { clearAllSaveCache }] =
      await Promise.all([
        import('./utils/progressionDiff'),
        import('./services/saveCache'),
      ]);
    clearProgressionArchive();
    clearAllChatHistory();
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
      persistence.resumeAutosave();
    }, 0);
  };

  const { exportBackup, importBackup } = useBackupTransfer({
    snapshot: snapshotToPersist,
    onExported: () => showGlobalToast('Campaign JSON backup exported'),
    onImport: (imported) => {
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
    },
    onImportFailed: () =>
      emitFeedback({ text: 'Invalid FM27 backup file format.', tone: 'error' }),
  });
  const handleExportBackup = exportBackup;
  const handleImportBackup = importBackup;

  const handleAddMatch = (newMatch: MatchLogEntry) => {
    setMatches((prev) => [newMatch, ...prev]);
    if (newMatch.date) {
      setSaveDate(newMatch.date);
    }
  };

  const handleBackgroundSyncStatusChange = useCallback(
    (
      status: {
        label: string;
        clubCoreReady: boolean;
        progressPct?: number;
        paused?: boolean;
      } | null
    ) => {
      setBackgroundSyncStatus(status);
      if (status === null) {
        preSyncBaselineRef.current = null;
      }
    },
    []
  );

  const handleQuickFmFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      e.target.value = '';
      if (!picked) return;
      setActiveTab('sync');
      setQuickPickedFmFile(picked);
    },
    []
  );

  const handleMobileQuickSyncClick = useCallback(() => {
    if (backgroundSyncStatus) {
      setActiveTab('sync');
      return;
    }
    quickFmFileInputRef.current?.click();
  }, [backgroundSyncStatus]);

  const handleApplyDecodedFmSave = applyDecodedSave;

  const { bulkMergePlayers, applyPlayerUpdates } = useSquadDeltaUpdates({
    players,
    setPlayers,
  });
  const handleBulkMergePlayers = bulkMergePlayers;
  const handleApplyPlayerUpdates = applyPlayerUpdates;

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

  const getLatestJourneyReportAsync = async () => {
    if (latestJourneyPromiseRef.current) {
      return latestJourneyPromiseRef.current;
    }
    return latestJourneyReport;
  };

  return (
    <CompareTrayProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <AppHeader
        clubName={clubName}
        activeTab={activeTab}
        squadCount={players.length}
        matchCount={matches.length}
        staffCount={staff.length}
        hasData={players.length > 0 || recruitmentCases.length > 0}
        backgroundSync={backgroundSyncStatus}
        confirmResetPending={confirmResetPending}
        quickFmInputRef={quickFmFileInputRef}
        backupInputRef={backupFileInputRef}
        onSelectTab={handleSelectTab}
        onQuickSync={handleMobileQuickSyncClick}
        onQuickFmPicked={handleQuickFmFilePicked}
        onImportBackup={handleImportBackup}
        onOpenSearch={() => setShowCommandPalette(true)}
        onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
        onOpenShare={() => setShowShareModal(true)}
        onExportBackup={handleExportBackup}
        onResetMemory={handleClearMemory}
      />

      {/* PWA Status Banners: Offline Notice, Safe Update Prompt, Android/iOS Install */}
      <PwaStatusBanners
        isOnline={pwa.isOnline}
        clubName={clubName}
        saveDate={saveDate}
        hasLoadedSave={Boolean(hydratedFmSave || players.length > 0)}
        showUpdateBanner={pwa.showUpdateBanner}
        onApplyUpdate={pwa.applyUpdate}
        onDismissUpdate={pwa.dismissUpdateBanner}
        showInstallBanner={pwa.showInstallBanner}
        canPromptInstall={pwa.canPromptInstall}
        isIosSafari={pwa.isIosSafari}
        onPromptInstall={() => {
          void pwa.promptInstall().then((outcome) => {
            if (outcome === 'accepted') {
              showGlobalToast('FM27 Hub installed to your home screen.');
            }
          });
        }}
        onDismissInstall={pwa.dismissInstallBanner}
      />

      {/* Main Content Container (extra bottom padding on mobile for fixed 5-tab bar + safe area) */}
        <AppMainContent
          activeTab={activeTab}
          isKeyboardOpen={isKeyboardOpen}
          backgroundSyncStatus={backgroundSyncStatus}
          hydratedFmSave={hydratedFmSave}
          liveGovernance={liveGovernance}
          liveLastMatchTactic={liveLastMatchTactic}
          clubName={clubName}
          managerName={managerName}
          saveDate={saveDate}
          nextFixture={nextFixture}
          leagueStandingSub={leagueStandingSub}
          balance={balance}
          wageSpend={wageSpend}
          playerBasicWeekly={playerBasicWeekly}
          summary={summary}
          hasManualMatches={hasManualMatches}
          manualMatchCount={manualMatchCount}
          isRestoredFromMemory={isRestoredFromMemory}
          showMobileDetails={showMobileDetails}
          players={players}
          staff={staff}
          matches={matches}
          recruitmentCases={recruitmentCases}
          shortlists={shortlists}
          trackedTargets={trackedTargets}
          activeShape={activeShape}
          customSlots={customSlots}
          applyToAnalystOnly={applyToAnalystOnly}
          tacticsSubTab={tacticsSubTab}
          dictionaryVersion={dictionaryVersion}
          hubPanel={hubPanel}
          latestJourneyReport={latestJourneyReport}
          snapshotResetNonce={snapshotResetNonce}
          pendingAnalystPrompt={pendingAnalystPrompt}
          externalFmFile={quickPickedFmFile ?? pwa.launchedFmFile}
          getLatestJourneyReportAsync={getLatestJourneyReportAsync}
          onSelectTab={handleSelectTab}
          onPanelChange={handleHubPanelChange}
          onJourneyReportChange={setLatestJourneyReport}
          onUpdateSaveDate={setSaveDate}
          onClearPendingPrompt={handleClearPendingPrompt}
          onClearExternalFmFile={() => {
            if (quickPickedFmFile) {
              setQuickPickedFmFile(null);
            } else {
              pwa.clearLaunchedFmFile();
            }
          }}
          onToggleMobileDetails={() => setShowMobileDetails((v) => !v)}
          onSelectPlayer={setSelectedPlayer}
          onSelectStaff={setSelectedStaff}
          onBusyStateChange={setWorkspaceBusy}
          onAddMatch={handleAddMatch}
          onApplyPlayerUpdates={handleApplyPlayerUpdates}
          onBulkMergePlayers={handleBulkMergePlayers}
          onApplyDecodedFmSave={handleApplyDecodedFmSave}
          onBackgroundSyncStatusChange={handleBackgroundSyncStatusChange}
          onChangeShape={setActiveShape}
          onChangeCustomSlots={setCustomSlots}
          onChangeApplyToAnalystOnly={setApplyToAnalystOnly}
          onSubTabChange={handleTacticsSubTabChange}
          onAskAnalystPrompt={handleAskAnalystPrompt}
          onOpenCalibrationLab={handleOpenCalibrationLab}
          onToggleTrackTarget={handleToggleTrackTarget}
          onAddCase={handleAddRecruitmentCase}
          onUpdateCase={handleUpdateRecruitmentCase}
          onDeleteCase={handleDeleteRecruitmentCase}
          onCreateShortlist={handleCreateShortlist}
          onDeleteShortlist={handleDeleteShortlist}
          onRemoveFromShortlist={handleRemovePlayerFromShortlist}
        />

      <footer className="hidden md:flex px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex-row items-center justify-between gap-2">
        <span>
          FM27 Command Hub · Football Manager 27 (Patch 27.1.0 Verified Knowledge Base)
        </span>
        <span>
          Dual-Phase IP/OOP Tactics · Live .fm Save Analytics
        </span>
      </footer>

      {/* Fixed Thumb-Friendly 5-Tab Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        isMoreOpen={showMoreSheet}
        hasActiveSync={Boolean(backgroundSyncStatus)}
        isSyncPaused={Boolean(backgroundSyncStatus?.paused)}
        hasUpdateAvailable={pwa.updateAvailable}
        hidden={isKeyboardOpen}
        onSelectPrimaryTab={(tab) => handleSelectTab(tab)}
        onScrollToTop={handleScrollToTop}
        onToggleMore={() => setShowMoreSheet((open) => !open)}
        onCloseMore={() => setShowMoreSheet(false)}
      />

      {/* Slide-Up Mobile More Sheet (lazy-loaded when opened) */}
      {showMoreSheet && (
        <Suspense fallback={null}>
          <MobileMoreSheet
            isOpen={showMoreSheet}
            onClose={() => setShowMoreSheet(false)}
            activeTab={activeTab}
            onSelectSecondaryTab={(tab) => handleSelectTab(tab)}
            onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
            matchesCount={matches.length}
            staffCount={staff.length}
            playersCount={players.length}
            hasLoadedSave={Boolean(hydratedFmSave || players.length > 0)}
            hasBackupableData={players.length > 0 || recruitmentCases.length > 0}
            clubName={clubName}
            saveDate={saveDate}
            isOnline={pwa.isOnline}
            isRestoredFromMemory={isRestoredFromMemory}
            isInstalled={pwa.isInstalled}
            canPromptInstall={pwa.canPromptInstall}
            isIosSafari={pwa.isIosSafari}
            updateAvailable={pwa.updateAvailable}
            onPromptInstall={() => {
              void pwa.promptInstall().then((outcome) => {
                if (outcome === 'accepted') {
                  showGlobalToast('FM27 Hub installed to your home screen.');
                }
              });
            }}
            onApplyUpdate={pwa.applyUpdate}
            onExportBackup={handleExportBackup}
            onOpenShare={() => setShowShareModal(true)}
            onRequestRestore={() => backupFileInputRef.current?.click()}
            confirmResetPending={confirmResetPending}
            onResetMemory={() => {
              void handleClearMemory();
            }}
          />
        </Suspense>
      )}

      {/* Share & export sheet (lazy-loaded when opened) */}
      {showShareModal && (
        <Suspense fallback={null}>
          <ShareReportModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            clubName={clubName}
            saveDate={saveDate}
            players={players}
            staff={staff}
            matches={matches}
            finances={shareFinancesPanel}
            onToast={showGlobalToast}
          />
        </Suspense>
      )}

      {/* Read-only view for a link someone shared. Never reads or writes the local save. */}
      {shareToken && (
        <SharedReportView
          summary={sharedSummary}
          rawToken={shareToken}
          onOpenOwnHub={handleOpenOwnHub}
        />
      )}

      {/* Global Floating Toast Notification */}
      <FeedbackToast
        message={feedbackMessage}
        onDismiss={(id) =>
          setFeedbackMessage((prev) => (prev && prev.id === id ? null : prev))
        }
      />

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
            recentViews={recentViews}
            onOpenRecentView={handleOpenRecentView}
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
    </CompareTrayProvider>
  );
}
