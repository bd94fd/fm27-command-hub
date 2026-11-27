/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Everything that floats over the tab workspace: the bottom navigation, the
 * mobile More sheet, the share sheet, the read-only shared view, the toast and
 * the five modals. App.tsx owns the open state and passes values, setters and
 * callbacks down; nothing here reaches back into it.
 */

import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import { MobileBottomNav } from '../MobileBottomNav';
import { SharedReportView } from '../SharedReportView';
import { FeedbackToast } from '../FeedbackToast';
import type { ActiveTab } from '../../hooks/useAppNavigation';
import type { usePwaLifecycle } from '../../hooks/usePwaLifecycle';
import type { HydratedSaveState } from '../../utils/fmSaveHydrator';
import type { FormationPresetKey } from '../../utils/bestXiSolver';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../../types/fmSave';
import type {
  MatchLogEntry,
  PlayerRecord,
  ShortlistRecord,
  StaffRecord,
} from '../../types/fm27';
import type { FeedbackMessage } from '../../utils/feedbackBus';
import type { RecentView } from '../../utils/viewPreferences';
import type { buildFinancesPanelFromSave } from '../../utils/clubFinances';
import type { CalibrationLabTab } from '../Fm27BinaryCalibrationLab';
import { isScoutTargetTracked } from '../../services/fmStorage';
import type { BackgroundSyncStatus } from './backgroundSync';

const MobileMoreSheet = lazy(() =>
  import('../MobileMoreSheet').then((m) => ({ default: m.MobileMoreSheet }))
);
const ShareReportModal = lazy(() =>
  import('../ShareReportModal').then((m) => ({ default: m.ShareReportModal }))
);
const PlayerDetailModal = lazy(() =>
  import('../PlayerDetailModal').then((m) => ({ default: m.PlayerDetailModal }))
);
const StaffDetailModal = lazy(() =>
  import('../StaffDetailModal').then((m) => ({ default: m.StaffDetailModal }))
);
const KnowledgeBasePanel = lazy(() =>
  import('../KnowledgeBasePanel').then((m) => ({ default: m.KnowledgeBasePanel }))
);
const CommandPaletteModal = lazy(() =>
  import('../CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal }))
);
const Fm27BinaryCalibrationLab = lazy(() =>
  import('../Fm27BinaryCalibrationLab').then((m) => ({
    default: m.Fm27BinaryCalibrationLab,
  }))
);

export interface AppOverlaysProps {
  activeTab: ActiveTab;
  isKeyboardOpen: boolean;
  showMoreSheet: boolean;
  showShareModal: boolean;
  showKnowledgeBase: boolean;
  showCommandPalette: boolean;
  calibrationLabOpen: boolean;
  calibrationLabTab: CalibrationLabTab;
  selectedPlayer: PlayerRecord | null;
  selectedStaff: StaffRecord | null;
  feedbackMessage: FeedbackMessage | null;
  confirmResetPending: boolean;
  isRestoredFromMemory: boolean;
  backgroundSyncStatus: BackgroundSyncStatus | null;
  pwa: ReturnType<typeof usePwaLifecycle>;
  hydratedFmSave: HydratedSaveState | null;
  liveGovernance: ClubGovernanceState | null;
  liveLastMatchTactic: LastMatchTacticBlueprint | null;
  players: PlayerRecord[];
  staff: StaffRecord[];
  matches: MatchLogEntry[];
  shortlists: ShortlistRecord[];
  trackedTargets: RecruitmentTarget[];
  clubName: string;
  saveDate: string;
  activeShape: FormationPresetKey;
  recentViews: RecentView[];
  shareFinancesPanel: ReturnType<typeof buildFinancesPanelFromSave>;
  shareToken: string | null;
  sharedSummary: ComponentProps<typeof SharedReportView>['summary'];
  hasLoadedSave: boolean;
  hasBackupableData: boolean;
  onSetMoreOpen: (open: boolean) => void;
  onSetShareOpen: (open: boolean) => void;
  onSetKnowledgeBaseOpen: (open: boolean) => void;
  onSetCommandPaletteOpen: (open: boolean) => void;
  onSetCalibrationLabOpen: (open: boolean) => void;
  onSetSelectedPlayer: (player: PlayerRecord | null) => void;
  onSetSelectedStaff: (staff: StaffRecord | null) => void;
  onSelectTab: (tab: ActiveTab) => void;
  onScrollToTop: () => void;
  onExportBackup: () => void;
  onRequestRestore: () => void;
  onClearMemory: () => void;
  onOpenOwnHub: () => void;
  onDismissToast: (id: number) => void;
  onToast: (message: string) => void;
  onTrackPlayer: (player: PlayerRecord) => void;
  onToggleTrack: ComponentProps<typeof PlayerDetailModal>['onToggleTrack'];
  onAddToShortlist: ComponentProps<typeof PlayerDetailModal>['onAddToShortlist'];
  onOpenRecentView: (href: string) => void;
  onChangeShape: (shape: FormationPresetKey) => void;
  onDictionaryChanged: () => void;
}

export function AppOverlays(props: AppOverlaysProps) {
  const {
    activeTab,
    isKeyboardOpen,
    showMoreSheet,
    showShareModal,
    showKnowledgeBase,
    showCommandPalette,
    calibrationLabOpen,
    calibrationLabTab,
    selectedPlayer,
    selectedStaff,
    feedbackMessage,
    confirmResetPending,
    isRestoredFromMemory,
    backgroundSyncStatus,
    pwa,
    hydratedFmSave,
    liveGovernance,
    liveLastMatchTactic,
    players,
    staff,
    matches,
    shortlists,
    trackedTargets,
    clubName,
    saveDate,
    activeShape,
    recentViews,
    shareFinancesPanel,
    shareToken,
    sharedSummary,
    hasLoadedSave,
    hasBackupableData,
    onSetMoreOpen,
    onSetShareOpen,
    onSetKnowledgeBaseOpen,
    onSetCommandPaletteOpen,
    onSetCalibrationLabOpen,
    onSetSelectedPlayer,
    onSetSelectedStaff,
    onSelectTab,
    onScrollToTop,
    onExportBackup,
    onRequestRestore,
    onClearMemory,
    onOpenOwnHub,
    onDismissToast,
    onToast,
    onTrackPlayer,
    onToggleTrack,
    onAddToShortlist,
    onOpenRecentView,
    onChangeShape,
    onDictionaryChanged,
  } = props;

  return (
    <>
      {/* Fixed Thumb-Friendly 5-Tab Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        isMoreOpen={showMoreSheet}
        hasActiveSync={Boolean(backgroundSyncStatus)}
        isSyncPaused={Boolean(backgroundSyncStatus?.paused)}
        hasUpdateAvailable={pwa.updateAvailable}
        hidden={isKeyboardOpen}
        onSelectPrimaryTab={(tab) => onSelectTab(tab)}
        onScrollToTop={onScrollToTop}
        onToggleMore={() => onSetMoreOpen(!showMoreSheet)}
        onCloseMore={() => onSetMoreOpen(false)}
      />

      {/* Slide-Up Mobile More Sheet (lazy-loaded when opened) */}
      {showMoreSheet && (
        <Suspense fallback={null}>
          <MobileMoreSheet
            isOpen={showMoreSheet}
            onClose={() => onSetMoreOpen(false)}
            activeTab={activeTab}
            onSelectSecondaryTab={(tab) => onSelectTab(tab)}
            onOpenKnowledgeBase={() => onSetKnowledgeBaseOpen(true)}
            matchesCount={matches.length}
            staffCount={staff.length}
            playersCount={players.length}
            hasLoadedSave={hasLoadedSave}
            hasBackupableData={hasBackupableData}
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
                  onToast('FM27 Hub installed to your home screen.');
                }
              });
            }}
            onApplyUpdate={pwa.applyUpdate}
            onExportBackup={onExportBackup}
            onOpenShare={() => onSetShareOpen(true)}
            onRequestRestore={onRequestRestore}
            confirmResetPending={confirmResetPending}
            onResetMemory={() => {
              void onClearMemory();
            }}
          />
        </Suspense>
      )}

      {/* Share & export sheet (lazy-loaded when opened) */}
      {showShareModal && (
        <Suspense fallback={null}>
          <ShareReportModal
            isOpen={showShareModal}
            onClose={() => onSetShareOpen(false)}
            clubName={clubName}
            saveDate={saveDate}
            players={players}
            staff={staff}
            matches={matches}
            finances={shareFinancesPanel}
            onToast={onToast}
          />
        </Suspense>
      )}

      {/* Read-only view for a link someone shared. Never reads or writes the local save. */}
      {shareToken && (
        <SharedReportView
          summary={sharedSummary}
          rawToken={shareToken}
          onOpenOwnHub={onOpenOwnHub}
        />
      )}

      {/* Global Floating Toast Notification */}
      <FeedbackToast
        message={feedbackMessage}
        onDismiss={onDismissToast}
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
            onClose={() => onSetSelectedPlayer(null)}
            onAddRecruitment={onTrackPlayer}
            onToggleTrack={onToggleTrack}
            onAddToShortlist={onAddToShortlist}
          />
        </Suspense>
      )}

      {selectedStaff && (
        <Suspense fallback={null}>
          <StaffDetailModal
            staff={selectedStaff}
            onClose={() => onSetSelectedStaff(null)}
          />
        </Suspense>
      )}

      {showKnowledgeBase && (
        <Suspense fallback={null}>
          <KnowledgeBasePanel
            isOpen={showKnowledgeBase}
            onClose={() => onSetKnowledgeBaseOpen(false)}
            players={players}
          />
        </Suspense>
      )}

      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            isOpen={showCommandPalette}
            onClose={() => onSetCommandPaletteOpen(false)}
            players={players}
            staff={staff}
            scoutTargets={
              hydratedFmSave?.recruitmentTargets ??
              hydratedFmSave?.decodedPayload?.recruitmentTargets ??
              []
            }
            activeShape={activeShape}
            onSelectTab={onSelectTab}
            onSelectPlayer={onSetSelectedPlayer}
            onSelectStaff={onSetSelectedStaff}
            recentViews={recentViews}
            onOpenRecentView={onOpenRecentView}
            onChangeShape={(shape) => {
              onChangeShape(shape);
              onToast(`Switched active formation to ${shape}`);
            }}
            onOpenKnowledgeBase={() => onSetKnowledgeBaseOpen(true)}
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
            onClose={() => onSetCalibrationLabOpen(false)}
            onDictionaryChanged={onDictionaryChanged}
          />
        </Suspense>
      )}
    </>
  );
}
