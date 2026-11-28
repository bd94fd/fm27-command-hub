/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { emitFeedback, subscribeFeedback, type FeedbackMessage } from './utils/feedbackBus';
import { CompareTrayProvider } from './context/CompareTrayContext';
import { MatchLogEntry, PlayerRecord, StaffRecord } from './types/fm27';
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
import { useCampaignState } from './hooks/useCampaignState';
import { useRecruitmentState } from './hooks/useRecruitmentState';
import { useBackupTransfer } from './hooks/useBackupTransfer';
import { useSquadDeltaUpdates } from './hooks/useSquadDeltaUpdates';
import { clearAllChatHistory } from './services/chatStorage';
import { PwaStatusBanners } from './components/PwaStatusBanners';
import { computeCompetitiveSummary } from './utils/competitiveSummary';
import { clearPersistedFmState, FmHubPersistedState } from './services/fmStorage';
import { buildFinancesPanelFromSave } from './utils/clubFinances';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
} from './types/fmSave';
import type { DeepJourneyReport } from './services/saveCache';
import type { CalibrationLabTab } from './components/Fm27BinaryCalibrationLab';
import type { BackgroundSyncStatus } from './components/shell/backgroundSync';
import { AppHeader } from './components/shell/AppHeader';
import { AppMainContent } from './components/shell/AppMainContent';
import { AppOverlays } from './components/shell/AppOverlays';


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
  const campaignOwner = useCampaignState();
  const {
    campaign,
    snapshot: snapshotToPersist,
    restoreSnapshot,
    restoreBackup,
    clearCampaign,
    setPlayers,
    setMatches,
    setStaff,
    setRecruitmentCases,
    setShortlists,
    setTrackedTargets,
    setSaveDate,
    setNextFixture,
    setLeagueStandingSub,
    setWageSpend,
    setBalance,
    setHydratedFmSave,
    setActiveShape,
    setCustomSlots,
    setApplyToAnalystOnly,
  } = campaignOwner;
  const {
    players,
    matches,
    staff,
    recruitmentCases,
    shortlists,
    trackedTargets,
    saveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    hydratedFmSave,
    activeShape,
    customSlots,
    applyToAnalystOnly,
  } = campaign;
  const [pendingAnalystPrompt, setPendingAnalystPrompt] = useState<string | null>(
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

  const applyPersistedSnapshot = useCallback(
    (saved: FmHubPersistedState) => {
      restoreSnapshot(saved);
      setIsRestoredFromMemory(true);
    },
    [restoreSnapshot]
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
    clearCampaign();
    latestJourneyPromiseRef.current = null;
    setLatestJourneyReport(null);
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
      restoreBackup(imported);
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

  const recruitment = useRecruitmentState({
    recruitmentCases,
    setRecruitmentCases,
    shortlists,
    setShortlists,
    trackedTargets,
    setTrackedTargets,
    hydratedFmSave,
    onSelectTab: handleSelectTab,
    onSelectPlayer: setSelectedPlayer,
  });
  const handleAddRecruitmentCase = recruitment.addCase;
  const handleTrackPlayerInRecruitment = recruitment.trackPlayer;
  const handleUpdateRecruitmentCase = recruitment.updateCase;
  const handleDeleteRecruitmentCase = recruitment.deleteCase;
  const handleCreateShortlist = recruitment.createShortlist;
  const handleDeleteShortlist = recruitment.deleteShortlist;
  const handleAddPlayerToShortlist = recruitment.addPlayerToShortlist;
  const handleRemovePlayerFromShortlist = recruitment.removePlayerFromShortlist;
  const handleToggleTrackTarget = recruitment.toggleTrackTarget;
  const handleToggleTrackPlayerFromModal = recruitment.toggleTrackPlayerFromModal;

  const { bulkMergePlayers, applyPlayerUpdates } = useSquadDeltaUpdates({
    players,
    setPlayers,
  });
  const handleBulkMergePlayers = bulkMergePlayers;
  const handleApplyPlayerUpdates = applyPlayerUpdates;

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

      <AppOverlays
        activeTab={activeTab}
        isKeyboardOpen={isKeyboardOpen}
        showMoreSheet={showMoreSheet}
        showShareModal={showShareModal}
        showKnowledgeBase={showKnowledgeBase}
        showCommandPalette={showCommandPalette}
        calibrationLabOpen={calibrationLabOpen}
        calibrationLabTab={calibrationLabTab}
        selectedPlayer={selectedPlayer}
        selectedStaff={selectedStaff}
        feedbackMessage={feedbackMessage}
        confirmResetPending={confirmResetPending}
        isRestoredFromMemory={isRestoredFromMemory}
        backgroundSyncStatus={backgroundSyncStatus}
        pwa={pwa}
        hydratedFmSave={hydratedFmSave}
        liveGovernance={liveGovernance}
        liveLastMatchTactic={liveLastMatchTactic}
        players={players}
        staff={staff}
        matches={matches}
        shortlists={shortlists}
        trackedTargets={trackedTargets}
        clubName={clubName}
        saveDate={saveDate}
        activeShape={activeShape}
        recentViews={recentViews}
        shareFinancesPanel={shareFinancesPanel}
        shareToken={shareToken}
        sharedSummary={sharedSummary}
        hasLoadedSave={Boolean(hydratedFmSave || players.length > 0)}
        hasBackupableData={players.length > 0 || recruitmentCases.length > 0}
        onSetMoreOpen={setShowMoreSheet}
        onSetShareOpen={setShowShareModal}
        onSetKnowledgeBaseOpen={setShowKnowledgeBase}
        onSetCommandPaletteOpen={setShowCommandPalette}
        onSetCalibrationLabOpen={setCalibrationLabOpen}
        onSetSelectedPlayer={setSelectedPlayer}
        onSetSelectedStaff={setSelectedStaff}
        onSelectTab={handleSelectTab}
        onScrollToTop={handleScrollToTop}
        onExportBackup={handleExportBackup}
        onRequestRestore={() => backupFileInputRef.current?.click()}
        onClearMemory={handleClearMemory}
        onOpenOwnHub={handleOpenOwnHub}
        onDismissToast={(id) =>
          setFeedbackMessage((prev) => (prev && prev.id === id ? null : prev))
        }
        onToast={showGlobalToast}
        onTrackPlayer={handleTrackPlayerInRecruitment}
        onToggleTrack={handleToggleTrackPlayerFromModal}
        onAddToShortlist={handleAddPlayerToShortlist}
        onOpenRecentView={handleOpenRecentView}
        onChangeShape={setActiveShape}
        onDictionaryChanged={() => setDictionaryVersion((v) => v + 1)}
      />
      </div>
    </CompareTrayProvider>
  );
}
