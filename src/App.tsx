/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { emitFeedback, subscribeFeedback, type FeedbackMessage } from './utils/feedbackBus';
import { CompareTrayProvider } from './context/CompareTrayContext';
import { MatchLogEntry } from './types/fm27';
import {
  parsePwaLaunchParams,
  usePwaLifecycle,
} from './hooks/usePwaLifecycle';
import { useMobileKeyboard } from './hooks/useMobileKeyboard';
import { useAppNavigation, type ActiveTab } from './hooks/useAppNavigation';
import { useOverlayState } from './hooks/useOverlayState';
import { useAnalystHandoff } from './hooks/useAnalystHandoff';
import { useCampaignSummaries } from './hooks/useCampaignSummaries';
import { useLiveGovernance } from './hooks/useLiveGovernance';
import { useClearAllData } from './hooks/useClearAllData';
import { useSavePersistence } from './hooks/useSavePersistence';
import { useShareSummary } from './hooks/useShareSummary';
import { useFmSaveImport } from './hooks/useFmSaveImport';
import { useCampaignState } from './hooks/useCampaignState';
import { useRecruitmentState } from './hooks/useRecruitmentState';
import { useBackupTransfer } from './hooks/useBackupTransfer';
import { useSquadDeltaUpdates } from './hooks/useSquadDeltaUpdates';
import { PwaStatusBanners } from './components/PwaStatusBanners';
import { FmHubPersistedState } from './services/fmStorage';
import type { DeepJourneyReport } from './services/saveCache';
import type { BackgroundSyncStatus } from './components/shell/backgroundSync';
import { AppHeader } from './components/shell/AppHeader';
import { AppMainContent } from './components/shell/AppMainContent';
import { AppOverlays } from './components/shell/AppOverlays';


export default function App() {
  const overlaysOpenRef = useRef(false);
  const nav = useAppNavigation(() => overlaysOpenRef.current);
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
  const {
    showMoreSheet,
    setShowMoreSheet,
    showShareModal,
    setShowShareModal,
    showKnowledgeBase,
    setShowKnowledgeBase,
    showCommandPalette,
    setShowCommandPalette,
    calibrationLabOpen,
    setCalibrationLabOpen,
    calibrationLabTab,
    openCalibrationLab,
    selectedPlayer,
    setSelectedPlayer,
    selectedStaff,
    setSelectedStaff,
    anyOverlayOpen,
  } = useOverlayState();
  overlaysOpenRef.current = anyOverlayOpen;
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
  const [snapshotResetNonce, setSnapshotResetNonce] = useState<number>(0);
  const [isRestoredFromMemory, setIsRestoredFromMemory] =
    useState<boolean>(false);
  const { shareToken, sharedSummary, openOwnHub: handleOpenOwnHub } = useShareSummary();
  const [dictionaryVersion, setDictionaryVersion] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<FeedbackMessage | null>(null);
  const { isKeyboardOpen } = useMobileKeyboard();

  const { liveGovernance, liveLastMatchTactic } = useLiveGovernance({
    hydratedFmSave,
    players,
    dictionaryVersion,
  });

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

  const showGlobalToast = useCallback((msg: string) => {
    emitFeedback({ text: msg, tone: 'success' });
  }, []);

  const journeyPromiseRef = useRef<Promise<DeepJourneyReport | null> | null>(null);
  const {
    pendingPrompt: pendingAnalystPrompt,
    setPendingPrompt: setPendingAnalystPrompt,
    clearPrompt: handleClearPendingPrompt,
    latestJourneyReport,
    setLatestJourneyReport,
    getLatestJourneyReportAsync,
    clearJourneyReport,
  } = useAnalystHandoff({ latestJourneyPromiseRef: journeyPromiseRef });

  const { applyDecodedSave, preSyncBaselineRef } = useFmSaveImport({
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
    journeyPromiseRef,
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

  const handleAskAnalystPrompt = (prompt: string) => {
    setPendingAnalystPrompt(prompt);
    handleSelectTab('sync');
  };

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

  const {
    summary,
    playerBasicWeekly,
    manualMatchCount,
    hasManualMatches,
    shareFinancesPanel,
    clubName,
    managerName,
  } = useCampaignSummaries({
    players,
    matches,
    staff,
    saveDate,
    balance,
    wageSpend,
    hydratedFmSave,
  });

  const { confirmResetPending, requestClear } = useClearAllData({
    pauseAutosave: persistence.pauseAutosave,
    cancelPendingRestore: persistence.cancelPendingRestore,
    resumeAutosave: persistence.resumeAutosave,
    onCleared: () => {
      clearCampaign();
      clearJourneyReport();
      setIsRestoredFromMemory(false);
      setSelectedPlayer(null);
      setSelectedStaff(null);
    },
    onResetNonce: () => setSnapshotResetNonce((nonce) => nonce + 1),
    showToast: showGlobalToast,
  });

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
        onResetMemory={requestClear}
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
          onOpenCalibrationLab={openCalibrationLab}
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
        onClearMemory={requestClear}
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
