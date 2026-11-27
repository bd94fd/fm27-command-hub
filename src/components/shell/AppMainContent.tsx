/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The tab workspace under the app chrome: the section container, the executive
 * strip and one lazy view per section. App.tsx owns state and routing and passes
 * everything down; nothing here reaches back into it.
 */

import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { TabWorkspaceSkeleton } from '../WorkspaceSkeletons';
import { BackgroundSyncPill } from './BackgroundSyncPill';
import { ClubBaselineStrip } from './ClubBaselineStrip';
import type { ActiveTab } from '../../hooks/useAppNavigation';
import type { HubPanel, TacticsPanel } from '../../utils/navigationUrl';
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
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from '../../types/fm27';
import type { PersistedCustomSlot } from '../../services/fmStorage';
import type { DeepJourneyReport } from '../../services/saveCache';
import type { BackgroundSyncStatus } from './backgroundSync';
import { computeCompetitiveSummary } from '../../utils/competitiveSummary';

const AutoSyncWorkspace = lazy(() =>
  import('../AutoSyncWorkspace').then((m) => ({ default: m.AutoSyncWorkspace }))
);
const TacticalWarRoom = lazy(() =>
  import('../TacticalWarRoom').then((m) => ({ default: m.TacticalWarRoom }))
);
const SquadAnalyticsTable = lazy(() =>
  import('../SquadAnalyticsTable').then((m) => ({ default: m.SquadAnalyticsTable }))
);
const RecruitmentWorkspace = lazy(() =>
  import('../RecruitmentWorkspace').then((m) => ({ default: m.RecruitmentWorkspace }))
);
const StaffDirectory = lazy(() =>
  import('../StaffDirectory').then((m) => ({ default: m.StaffDirectory }))
);
const MatchLogArchive = lazy(() =>
  import('../MatchLogArchive').then((m) => ({ default: m.MatchLogArchive }))
);

export interface AppMainContentProps {
  activeTab: ActiveTab;
  isKeyboardOpen: boolean;
  backgroundSyncStatus: BackgroundSyncStatus | null;
  hydratedFmSave: HydratedSaveState | null;
  liveGovernance: ClubGovernanceState | null;
  liveLastMatchTactic: LastMatchTacticBlueprint | null;
  clubName: string;
  managerName: string;
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  balance: string;
  wageSpend: string;
  playerBasicWeekly: number;
  summary: ReturnType<typeof computeCompetitiveSummary>;
  hasManualMatches: boolean;
  manualMatchCount: number;
  isRestoredFromMemory: boolean;
  showMobileDetails: boolean;
  players: PlayerRecord[];
  staff: StaffRecord[];
  matches: MatchLogEntry[];
  recruitmentCases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
  trackedTargets: RecruitmentTarget[];
  activeShape: FormationPresetKey;
  customSlots: PersistedCustomSlot[];
  applyToAnalystOnly: boolean;
  tacticsSubTab: TacticsPanel;
  dictionaryVersion: number;
  hubPanel: HubPanel;
  latestJourneyReport: DeepJourneyReport | null;
  snapshotResetNonce: number;
  pendingAnalystPrompt: string | null;
  externalFmFile: File | null;
  getLatestJourneyReportAsync: () => Promise<DeepJourneyReport | null>;
  onSelectTab: (tab: ActiveTab) => void;
  onPanelChange: (panel: HubPanel) => void;
  onJourneyReportChange: (report: DeepJourneyReport | null) => void;
  onUpdateSaveDate: (date: string) => void;
  onClearPendingPrompt: () => void;
  onClearExternalFmFile: () => void;
  onToggleMobileDetails: () => void;
  onSelectPlayer: (player: PlayerRecord | null) => void;
  onSelectStaff: (staff: StaffRecord | null) => void;
  onBusyStateChange: ComponentProps<typeof AutoSyncWorkspace>['onBusyStateChange'];
  onAddMatch: ComponentProps<typeof AutoSyncWorkspace>['onAddMatch'];
  onApplyPlayerUpdates: ComponentProps<typeof AutoSyncWorkspace>['onApplyPlayerUpdates'];
  onBulkMergePlayers: ComponentProps<typeof AutoSyncWorkspace>['onBulkMergePlayers'];
  onApplyDecodedFmSave: ComponentProps<typeof AutoSyncWorkspace>['onApplyDecodedFmSave'];
  onBackgroundSyncStatusChange: ComponentProps<typeof AutoSyncWorkspace>['onBackgroundSyncStatusChange'];
  onChangeShape: (shape: FormationPresetKey) => void;
  onChangeCustomSlots: (slots: PersistedCustomSlot[]) => void;
  onChangeApplyToAnalystOnly: (value: boolean) => void;
  onSubTabChange: (tab: TacticsPanel) => void;
  onAskAnalystPrompt: ComponentProps<typeof ClubBaselineStrip>['onAskAnalystPrompt'];
  onOpenCalibrationLab: ComponentProps<typeof ClubBaselineStrip>['onOpenCalibrationLab'];
  onToggleTrackTarget: ComponentProps<typeof RecruitmentWorkspace>['onToggleTrackTarget'];
  onAddCase: ComponentProps<typeof RecruitmentWorkspace>['onAddCase'];
  onUpdateCase: ComponentProps<typeof RecruitmentWorkspace>['onUpdateCase'];
  onDeleteCase: ComponentProps<typeof RecruitmentWorkspace>['onDeleteCase'];
  onCreateShortlist: ComponentProps<typeof RecruitmentWorkspace>['onCreateShortlist'];
  onDeleteShortlist: ComponentProps<typeof RecruitmentWorkspace>['onDeleteShortlist'];
  onRemoveFromShortlist: ComponentProps<typeof RecruitmentWorkspace>['onRemoveFromShortlist'];
}

export function AppMainContent(props: AppMainContentProps) {
  const {
    activeTab,
    isKeyboardOpen,
    backgroundSyncStatus,
    hydratedFmSave,
    liveGovernance,
    liveLastMatchTactic,
    clubName,
    managerName,
    saveDate,
    nextFixture,
    leagueStandingSub,
    balance,
    wageSpend,
    playerBasicWeekly,
    summary,
    hasManualMatches,
    manualMatchCount,
    isRestoredFromMemory,
    showMobileDetails,
    players,
    staff,
    matches,
    recruitmentCases,
    shortlists,
    trackedTargets,
    activeShape,
    customSlots,
    applyToAnalystOnly,
    tacticsSubTab,
    dictionaryVersion,
    hubPanel,
    latestJourneyReport,
    snapshotResetNonce,
    pendingAnalystPrompt,
    externalFmFile,
    getLatestJourneyReportAsync,
    onSelectTab,
    onPanelChange,
    onJourneyReportChange,
    onUpdateSaveDate,
    onClearPendingPrompt,
    onClearExternalFmFile,
    onToggleMobileDetails,
    onSelectPlayer,
    onSelectStaff,
    onBusyStateChange,
    onAddMatch,
    onApplyPlayerUpdates,
    onBulkMergePlayers,
    onApplyDecodedFmSave,
    onBackgroundSyncStatusChange,
    onChangeShape,
    onChangeCustomSlots,
    onChangeApplyToAnalystOnly,
    onSubTabChange,
    onAskAnalystPrompt,
    onOpenCalibrationLab,
    onToggleTrackTarget,
    onAddCase,
    onUpdateCase,
    onDeleteCase,
    onCreateShortlist,
    onDeleteShortlist,
    onRemoveFromShortlist,
  } = props;

  return (
      <main
        id="main-content"
        tabIndex={-1}
        data-active-tab={activeTab}
        className={`flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-5 ${
          isKeyboardOpen
            ? 'pb-4'
            : 'pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]'
        } md:pb-8 space-y-4 sm:space-y-5`}
      >
        {activeTab !== 'sync' && (
          <BackgroundSyncPill
            status={backgroundSyncStatus}
            onOpenSync={() => onSelectTab('sync')}
          />
        )}

        <ClubBaselineStrip
          hydrated={hydratedFmSave}
          hasSave={Boolean(hydratedFmSave || players.length > 0)}
          saveDate={saveDate}
          nextFixture={nextFixture}
          managerName={managerName}
          balance={balance}
          wageSpend={wageSpend}
          squadSize={players.length}
          playerBasicWeekly={playerBasicWeekly}
          summary={summary}
          leagueStandingSub={leagueStandingSub}
          hasManualMatches={hasManualMatches}
          manualMatchCount={manualMatchCount}
          isRestoredFromMemory={isRestoredFromMemory}
          showMobileDetails={showMobileDetails}
          liveGovernance={liveGovernance}
          onToggleMobileDetails={onToggleMobileDetails}
          onAskAnalystPrompt={onAskAnalystPrompt}
          onOpenCalibrationLab={onOpenCalibrationLab}
        />

        {/* Active View Area (AutoSyncWorkspace stays mounted so chat history persists across tabs) */}
        <div className={activeTab === 'sync' ? '' : 'hidden'}>
          <AppErrorBoundary scopeLabel="Hub & AI Analyst">
            <Suspense fallback={<TabWorkspaceSkeleton variant="sync" label="Hub & AI Analyst" />}>
              <AutoSyncWorkspace
                panel={hubPanel}
                onPanelChange={onPanelChange}
                onNavigate={onSelectTab}
                matches={matches}
                players={players}
                staff={staff}
                recruitmentCases={recruitmentCases}
                trackedTargets={trackedTargets}
                latestJourneyReport={latestJourneyReport}
                onJourneyReportChange={onJourneyReportChange}
                getLatestJourneyReportAsync={getLatestJourneyReportAsync}
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
                onUpdateSaveDate={onUpdateSaveDate}
                onAddMatch={onAddMatch}
                onApplyPlayerUpdates={onApplyPlayerUpdates}
                onBulkMergePlayers={onBulkMergePlayers}
                onApplyDecodedFmSave={onApplyDecodedFmSave}
                onBackgroundSyncStatusChange={onBackgroundSyncStatusChange}
                pendingPrompt={pendingAnalystPrompt}
                onClearPendingPrompt={onClearPendingPrompt}
                externalFmFile={externalFmFile}
                onClearExternalFmFile={onClearExternalFmFile}
                onBusyStateChange={onBusyStateChange}
              />
            </Suspense>
          </AppErrorBoundary>
        </div>

        {activeTab === 'tactics' && (
          <AppErrorBoundary scopeLabel="Tactical War Room">
            <Suspense fallback={<TabWorkspaceSkeleton variant="tactics" label="Tactical War Room" />}>
              <TacticalWarRoom
                onRequestImport={() => onSelectTab('sync')}
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
                onSubTabChange={onSubTabChange}
                onChangeShape={onChangeShape}
                onChangeCustomSlots={onChangeCustomSlots}
                onChangeApplyToAnalystOnly={onChangeApplyToAnalystOnly}
                onAskAnalyst={onAskAnalystPrompt}
                dictionaryVersion={dictionaryVersion}
                onOpenCalibrationLab={onOpenCalibrationLab}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'squad' && (
          <AppErrorBoundary scopeLabel="Squad Analytics">
            <Suspense fallback={<TabWorkspaceSkeleton variant="squad" label="Squad Analytics" />}>
              <SquadAnalyticsTable
                onRequestImport={() => onSelectTab('sync')}
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
                onSelectPlayer={onSelectPlayer}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'recruitment' && (
          <AppErrorBoundary scopeLabel="Transfers & Recruitment Audit">
            <Suspense fallback={<TabWorkspaceSkeleton variant="recruitment" label="Transfers & Audit" />}>
              <RecruitmentWorkspace
                onRequestImport={() => onSelectTab('sync')}
                cases={recruitmentCases}
                shortlists={shortlists}
                players={players}
                staff={staff}
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
                leagueContext={{
                  competitionName:
                    hydratedFmSave?.decodedPayload?.leagueStanding?.competitionName ??
                    hydratedFmSave?.divisionBenchmarks?.competitionName ??
                    hydratedFmSave?.competitionRules?.competitionName ??
                    null,
                  leaguePosition:
                    hydratedFmSave?.decodedPayload?.leagueStanding?.position ?? null,
                  totalClubs:
                    hydratedFmSave?.decodedPayload?.leagueStanding?.totalTeams ??
                    hydratedFmSave?.divisionBenchmarks?.clubCount ??
                    null,
                  points:
                    hydratedFmSave?.decodedPayload?.leagueStanding?.points ?? null,
                  played:
                    hydratedFmSave?.decodedPayload?.leagueStanding?.played ?? null,
                  competitionRules: hydratedFmSave?.competitionRules ?? null,
                  transferWindowOpen:
                    typeof hydratedFmSave?.decodedPayload?.transferWindows?.isOpen ===
                    'boolean'
                      ? hydratedFmSave.decodedPayload.transferWindows.isOpen
                      : null,
                  boardObjectiveSummary:
                    (liveGovernance ?? hydratedFmSave?.governance)?.boardObjectives?.[0]
                      ?.target ?? null,
                }}
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
                onToggleTrackTarget={onToggleTrackTarget}
                onAskAnalyst={onAskAnalystPrompt}
                onAddCase={onAddCase}
                onUpdateCase={onUpdateCase}
                onDeleteCase={onDeleteCase}
                onCreateShortlist={onCreateShortlist}
                onDeleteShortlist={onDeleteShortlist}
                onRemoveFromShortlist={onRemoveFromShortlist}
                onSelectPlayer={onSelectPlayer}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'staff' && (
          <AppErrorBoundary scopeLabel="Staff Directory">
            <Suspense fallback={<TabWorkspaceSkeleton variant="staff" label="Staff Directory" />}>
              <StaffDirectory
                onRequestImport={() => onSelectTab('sync')}
                staff={staff}
                clubName={hydratedFmSave?.decodedPayload?.meta?.clubName}
                saveDate={saveDate}
                jobVacancies={hydratedFmSave?.decodedPayload?.jobVacancies ?? []}
                onSelectStaff={onSelectStaff}
              />
            </Suspense>
          </AppErrorBoundary>
        )}

        {activeTab === 'matches' && (
          <AppErrorBoundary scopeLabel="Match Log Archive">
            <Suspense fallback={<TabWorkspaceSkeleton variant="matches" label="Match Log Archive" />}>
              <MatchLogArchive
                onRequestImport={() => onSelectTab('sync')}
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
                    const cleanTi = (list: string[] | undefined) =>
                      (list || [])
                        .map((item) => item.trim())
                        .filter(
                          (item) =>
                            item.length > 0 &&
                            !/^(?:binary|raw|code|flag|unknown|0x[0-9a-f]+)/i.test(
                              item
                            )
                        );
                    const tiParts = Array.from(
                      new Set([
                        ...cleanTi(ti.inPossession),
                        ...cleanTi(ti.inTransition),
                        ...cleanTi(ti.outOfPossession),
                      ])
                    );
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
  );
}
