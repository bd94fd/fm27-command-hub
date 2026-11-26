/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
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
import {
  defaultPanelForTab,
  parseNavigationParams,
  type HubPanel,
  type TacticsPanel,
} from './utils/navigationUrl';
import { sectionHref, sectionLabel } from './utils/sectionLabels';
import {
  browserViewStorage,
  readRecentViews,
  recordRecentView,
  writeRecentViews,
  type RecentView,
} from './utils/viewPreferences';
import { useMobileKeyboard } from './hooks/useMobileKeyboard';
import { useSectionHistory, useSheetHistory } from './hooks/useHistoryNavigation';
import { clearAllChatHistory } from './services/chatStorage';
import { PwaStatusBanners } from './components/PwaStatusBanners';
import { MobileBottomNav } from './components/MobileBottomNav';
import { computeCompetitiveSummary } from './utils/competitiveSummary';
import { formatNation } from './utils/displayValue';
import {
  finishSaveLoadBenchmark,
  markSaveLoadStage,
} from './utils/saveLoadBenchmark';
import type {
  ParsedPlayerDelta,
  SquadMergeResult,
} from './utils/fmFileImporter';
import type {
  DecodedFmSavePayload,
  HydratedSaveState,
} from './utils/fmSaveHydrator';
import type { PlayerAutoUpdate } from './components/AutoSyncWorkspace';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { TabWorkspaceSkeleton } from './components/WorkspaceSkeletons';
import {
  loadPersistedFmState,
  loadPersistedFmStateFromIndexedDb,
  savePersistedFmState,
  clearPersistedFmState,
  recordPreviousSnapshot,
  exportFmStateBackupJson,
  buildFmStateBackupJson,
  importFmStateBackupJson,
  isScoutTargetTracked,
  loadTrackedScoutTargets,
  toggleTrackedScoutTarget,
  PersistedCustomSlot,
  FmHubPersistedState,
} from './services/fmStorage';
import { isIndexedDbSnapshotNewer, hasPersistedContent } from './utils/persistedStateRecency';
import type { FormationPresetKey } from './utils/bestXiSolver';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from './types/fmSave';
import type {
  DeepJourneyReport,
  SaveHistoryPoint,
} from './services/saveCache';
import type { CompactBinaryDiffSnapshot } from './utils/fm27BinaryDictionary';
import type { CalibrationLabTab } from './components/Fm27BinaryCalibrationLab';

const AutoSyncWorkspace = lazy(() =>
  import('./components/AutoSyncWorkspace').then((m) => ({
    default: m.AutoSyncWorkspace,
  }))
);
const LiveFmSaveProofCard = lazy(() =>
  import('./components/LiveFmSaveProofCard').then((m) => ({
    default: m.LiveFmSaveProofCard,
  }))
);
const ClubGovernanceBanner = lazy(() =>
  import('./components/ClubGovernanceBanner').then((m) => ({
    default: m.ClubGovernanceBanner,
  }))
);
const MobileMoreSheet = lazy(() =>
  import('./components/MobileMoreSheet').then((m) => ({
    default: m.MobileMoreSheet,
  }))
);
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
  const initialNav =
    typeof window === 'undefined'
      ? { tab: null, panel: null }
      : parseNavigationParams(window.location.search);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (initialNav.tab) return initialNav.tab;
    if (typeof window === 'undefined') return 'sync';
    return (parsePwaLaunchParams(window.location.search).initialTab as ActiveTab | null) ?? 'sync';
  });
  const [hubPanel, setHubPanel] = useState<HubPanel>(
    () => (initialNav.panel as HubPanel | null) ?? 'analyst'
  );
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
  const [backgroundSyncStatus, setBackgroundSyncStatus] = useState<{
    label: string;
    clubCoreReady: boolean;
    progressPct?: number;
    paused?: boolean;
  } | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState<boolean>(false);
  const [quickPickedFmFile, setQuickPickedFmFile] = useState<File | null>(null);
  const pwa = usePwaLifecycle({
    isBusy: workspaceBusy || Boolean(backgroundSyncStatus),
  });
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickFmFileInputRef = useRef<HTMLInputElement | null>(null);
  const preSyncBaselineRef = useRef<{
    saveDate: string;
    clubName: string;
    players: PlayerRecord[];
    matches: MatchLogEntry[];
  } | null>(null);
  const latestJourneyPromiseRef = useRef<Promise<DeepJourneyReport | null> | null>(
    null
  );
  const resetConfirmTimeoutRef = useRef<number | null>(null);
  const idbRestoreCancelledRef = useRef<boolean>(false);
  const isResettingRef = useRef<boolean>(false);
  const skipNextAutosaveRef = useRef<boolean>(true);

  const showGlobalToast = useCallback((msg: string) => {
    emitFeedback({ text: msg, tone: 'success' });
  }, []);

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

  useEffect(
    () => () => {
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

  const [tacticsSubTab, setTacticsSubTab] = useState<TacticsPanel>(
    () => (initialNav.panel as TacticsPanel | null) ?? 'pitch'
  );

  const handleScrollToTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const navSection = {
    tab: activeTab as string,
    panel:
      activeTab === 'sync'
        ? hubPanel
        : activeTab === 'tactics'
          ? tacticsSubTab
          : defaultPanelForTab(activeTab),
  };

  const [recentViews, setRecentViews] = useState<RecentView[]>(() =>
    readRecentViews(browserViewStorage())
  );

  useEffect(() => {
    const href = sectionHref(navSection.tab, navSection.panel);
    setRecentViews((prev) => {
      if (prev[0]?.href === href) return prev;
      const next = recordRecentView(prev, {
        href,
        label: sectionLabel(navSection.tab, navSection.panel),
      });
      writeRecentViews(browserViewStorage(), next);
      return next;
    });
  }, [navSection.tab, navSection.panel]);

  const { pushSection: pushNavSection, replaceSection: replaceNavSection } =
    useSectionHistory(navSection, (next) => {
      const tab = next.tab as ActiveTab;
      setActiveTab(tab);
      if (tab === 'sync' && next.panel) setHubPanel(next.panel as HubPanel);
      if (tab === 'tactics' && next.panel) setTacticsSubTab(next.panel as TacticsPanel);
      handleScrollToTop();
    });

  const handleOpenRecentView = useCallback(
    (href: string) => {
      const { tab, panel } = parseNavigationParams(href);
      if (!tab) return;
      setActiveTab(tab);
      if (tab === 'sync' && panel) setHubPanel(panel as HubPanel);
      if (tab === 'tactics' && panel) setTacticsSubTab(panel as TacticsPanel);
      pushNavSection({ tab, panel: panel ?? defaultPanelForTab(tab) });
      handleScrollToTop();
    },
    [pushNavSection, handleScrollToTop]
  );

  const handleSelectTab = (tab: ActiveTab) => {
    const nextTab: ActiveTab = tab === 'setpieces' ? 'tactics' : tab;
    const nextPanel =
      tab === 'setpieces'
        ? 'setpieces'
        : nextTab === 'tactics'
          ? 'pitch'
          : nextTab === 'sync'
            ? hubPanel
            : defaultPanelForTab(nextTab);
    const hadOpenOverlay =
      showMoreSheet ||
      showCommandPalette ||
      showKnowledgeBase ||
      calibrationLabOpen ||
      Boolean(selectedPlayer) ||
      Boolean(selectedStaff);
    setShowMoreSheet(false);
    if (tab === 'setpieces') {
      setTacticsSubTab('setpieces');
    } else if (tab === 'tactics') {
      setTacticsSubTab('pitch');
    }
    // A tab chosen while an overlay is open replaces that overlay's history entry
    // instead of stacking a stale entry behind the new tab.
    const nextSection = { tab: nextTab as string, panel: nextPanel };
    if (hadOpenOverlay) {
      replaceNavSection(nextSection);
    } else {
      pushNavSection(nextSection);
    }
    setActiveTab(nextTab);
    handleScrollToTop();
  };

  const handleHubPanelChange = useCallback(
    (panel: HubPanel) => {
      setHubPanel(panel);
      pushNavSection({ tab: 'sync', panel });
    },
    [pushNavSection]
  );

  const handleTacticsSubTabChange = useCallback(
    (panel: TacticsPanel) => {
      setTacticsSubTab(panel);
      pushNavSection({ tab: 'tactics', panel });
    },
    [pushNavSection]
  );

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

  // Restore saved state from previous session on initial mount
  useEffect(() => {
    const saved = loadPersistedFmState();
    if (saved && hasPersistedContent(saved)) {
      applyPersistedSnapshot(saved);
    }

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
        // Hydrate Save-to-Save Journey Report asynchronously off the cold-start bundle
        void import('./services/saveCache').then(
          ({ listSaveHistoryPoints, buildDeepJourneyReport }) =>
            listSaveHistoryPoints().then((items: SaveHistoryPoint[]) => {
              if (idbRestoreCancelledRef.current || items.length < 2) return;
              const latestClub = (items[0].clubName || '').trim().toLowerCase();
              const sameClub = latestClub
                ? items.filter(
                    (i) => (i.clubName || '').trim().toLowerCase() === latestClub
                  )
                : items;
              if (sameClub.length < 2) return;
              const parseSaveDateMs = (raw: string | undefined): number => {
                if (!raw) return 0;
                const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
                if (dmy) {
                  return Date.UTC(
                    Number(dmy[3]),
                    Number(dmy[2]) - 1,
                    Number(dmy[1])
                  );
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
                activeSnapshot?.matches ?? []
              );
              if (report) {
                setLatestJourneyReport(report);
              }
            })
        );
      })
      .catch(() => {
        skipNextAutosaveRef.current = false;
      });
  }, [applyPersistedSnapshot]);

  // Automatically persist non-empty state across browser refreshes & sessions.
  // Debounces rapid bursts (180ms) to avoid back-to-back main-thread JSON.stringify
  // stalls on Android Chrome, while flushing immediately on pagehide/visibilitychange.
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
      let flushed = false;
      const snapshotToPersist = {
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
      };

      const flushSave = () => {
        if (cancelled || flushed || isResettingRef.current) return;
        flushed = true;
        void savePersistedFmState(snapshotToPersist)
          .then((saved) => {
            if (!cancelled && saved) {
              setIsRestoredFromMemory(true);
            }
          })
          .catch((err) => {
            console.warn('Failed to auto-save FM27 state:', err);
          });
      };

      const timer = window.setTimeout(flushSave, 180);
      const handleVisibilityFlush = () => {
        if (document.visibilityState === 'hidden') {
          window.clearTimeout(timer);
          flushSave();
        }
      };
      const handlePageHide = () => {
        window.clearTimeout(timer);
        flushSave();
      };

      window.addEventListener('pagehide', handlePageHide);
      document.addEventListener('visibilitychange', handleVisibilityFlush);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        window.removeEventListener('pagehide', handlePageHide);
        document.removeEventListener('visibilitychange', handleVisibilityFlush);
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
      isResettingRef.current = false;
    }, 0);
  };

  const handleExportBackup = async () => {
    let json = await exportFmStateBackupJson();
    // Fall back to live in-memory React state for large saves persisted in IndexedDB only
    if (
      !json &&
      (players.length > 0 ||
        matches.length > 0 ||
        staff.length > 0 ||
        recruitmentCases.length > 0 ||
        shortlists.length > 0)
    ) {
      const saveHistory = await import('./services/saveCache')
        .then(({ listSaveHistoryPoints }) => listSaveHistoryPoints())
        .catch(() => []);
      json = buildFmStateBackupJson(
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
        {
          trackedScoutTargets: loadTrackedScoutTargets(),
          saveHistory,
        }
      );
    }
    if (!json) {
      emitFeedback({ text: 'No loaded save data to back up yet', tone: 'info' });
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
          emitFeedback({ text: 'Invalid FM27 backup file format.', tone: 'error' });
        }
      } catch (err) {
        console.warn('Failed to import FM27 backup:', err);
        emitFeedback({ text: 'Invalid FM27 backup file format.', tone: 'error' });
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

  const handleApplyDecodedFmSave = async (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean; benchmarkId?: string }
  ): Promise<HydratedSaveState> => {
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

    const [
      { hydrateAppFromDecodedFmSave },
      { captureProgressionSnapshot },
      saveCacheMod,
    ] = await Promise.all([
      import('./utils/fmSaveHydrator'),
      import('./utils/progressionDiff'),
      isInterim ? Promise.resolve(null) : import('./services/saveCache'),
    ]);

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
    if (options?.benchmarkId && !isInterim) {
      markSaveLoadStage(options.benchmarkId, 'hydrate_complete');
    }

    if (!isInterim && saveCacheMod) {
      const {
        createSaveHistoryPoint,
        putSaveHistoryPoint,
        listSaveHistoryPoints,
        buildDeepJourneyReport,
      } = saveCacheMod;
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
        wagePayrollWeekly: decoded.finances?.wagePayrollWeekly ?? null,
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
          emitFeedback({
            text: 'Save history could not be stored on this device (storage may be full) — live analytics are unaffected',
            tone: 'error',
          });
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

    if (options?.benchmarkId) {
      const benchmarkId = options.benchmarkId;
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (isInterim) {
            markSaveLoadStage(benchmarkId, 'first_useful_screen');
            return;
          }
          markSaveLoadStage(benchmarkId, 'state_applied');
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              finishSaveLoadBenchmark(benchmarkId);
            });
          });
        });
      }
    }

    if (isInterim) {
      showGlobalToast(
        `${decoded.meta.clubName || 'Club'} squad, staff & tactics ready — finishing fixtures & stats in background…`
      );
    } else {
      setBackgroundSyncStatus(null);
      showGlobalToast(
        `Synced ${decoded.meta.clubName || 'Club'} (${hydrated.updatedSquad.length} players · ${hydrated.saveDateLabel})`
      );
    }
    return hydrated;
  };

  const handleBulkMergePlayers = async (
    parsedPlayers: ParsedPlayerDelta[]
  ): Promise<SquadMergeResult> => {
    const { mergeParsedPlayersIntoSquad } = await import(
      './utils/fmFileImporter'
    );
    const result = mergeParsedPlayersIntoSquad(players, parsedPlayers);
    if (result.matchedCount > 0) {
      setPlayers(result.updatedSquad);
    }
    return result;
  };

  const handleApplyPlayerUpdates = (updates: PlayerAutoUpdate[]) => {
    if (!updates || updates.length === 0) return;
    void import('./utils/tacticalAnalystContext').then(
      ({ applyAnalystPlayerUpdates }) => {
        setPlayers(
          (prev) => applyAnalystPlayerUpdates(prev, updates).updatedPlayers
        );
      }
    );
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
    <CompareTrayProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navigation Shell (mobile header ~56.6px + BottomNav ~55.8px = ~112.4px <= 15% of 800px) */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-x-2.5 sm:gap-x-4 px-3.5 sm:px-6 pb-1.5 sm:pb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800"
        style={{
          paddingTop: 'calc(0.35rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSelectTab('sync');
          }}
          className="min-h-[44px] md:min-h-[36px] flex items-center text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 min-w-0 flex-1 md:flex-initial"
        >
          <span className="truncate">{clubName}</span>
        </a>

        {/* Desktop Navigation Tabs (mobile uses 5-tab fixed bottom bar + More sheet below) */}
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
              className={`inline-flex items-center min-h-[36px] px-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                  : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions: Mobile stays uncluttered (1-Tap Sync .fm + Quick Search); KB/Backup/Restore/Reset move to More sheet on mobile */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={quickFmFileInputRef}
            type="file"
            accept=".fm"
            onChange={handleQuickFmFilePicked}
            className="hidden"
          />
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          {/* Always-visible 1-tap mobile Sync .fm CTA (44px+ touch target) */}
          <button
            type="button"
            onClick={handleMobileQuickSyncClick}
            title={
              backgroundSyncStatus
                ? 'View active .fm save upload progress'
                : 'Pick a .fm save file to sync immediately'
            }
            className={`md:hidden inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              backgroundSyncStatus
                ? backgroundSyncStatus.paused
                  ? 'text-slate-950 bg-amber-400 hover:bg-amber-300'
                  : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300'
                : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-sm shadow-emerald-500/20'
            }`}
          >
            {backgroundSyncStatus ? (
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  backgroundSyncStatus.paused ? '' : 'animate-spin motion-reduce:animate-none'
                }`}
              />
            ) : (
              <Upload className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {backgroundSyncStatus
                ? backgroundSyncStatus.paused
                  ? 'Paused'
                  : typeof backgroundSyncStatus.progressPct === 'number'
                    ? `${backgroundSyncStatus.progressPct}%`
                    : 'Syncing'
                : 'Sync .fm'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowCommandPalette(true)}
            aria-label="Quick Search players, staff, and scout targets"
            title="Quick Search players, staff, and scout targets"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl md:rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-4 h-4 md:w-3.5 md:h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">Search</span>
          </button>

          <button
            type="button"
            onClick={() => setShowKnowledgeBase(true)}
            aria-label="Open FM27 Patch 27.1.0 Knowledge Base"
            title="Open FM27 Patch 27.1.0 Knowledge Base"
            className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>FM27 KB</span>
          </button>

          {players.length > 0 || recruitmentCases.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleExportBackup}
                aria-label="Export campaign snapshot as JSON backup"
                title="Export campaign snapshot as JSON backup"
                className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Backup</span>
              </button>

              <button
                type="button"
                onClick={handleClearMemory}
                aria-label={
                  confirmResetPending
                    ? 'Confirm reset saved memory'
                    : 'Clear saved memory'
                }
                title={
                  confirmResetPending
                    ? 'Click again to wipe saved memory and return to Awaiting .fm Save'
                    : 'Clear saved memory and return to clean Awaiting Save state'
                }
                className={`hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  confirmResetPending
                    ? 'text-rose-200 bg-rose-950/80 border-rose-500/60 hover:bg-rose-900/80'
                    : 'text-slate-400 hover:text-red-400 bg-slate-800/70 hover:bg-red-950/40 border-slate-700/80 hover:border-red-800/50'
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
              aria-label="Restore previous campaign from a JSON backup file"
              title="Restore previous campaign from a JSON backup file"
              className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Restore</span>
            </button>
          )}
        </div>
      </header>

      {/* PWA Status Banners: Offline Notice, Safe Update Prompt, Android/iOS Install */}
      <PwaStatusBanners
        isOnline={pwa.isOnline}
        clubName={clubName}
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
      <main
        className={`flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-5 ${
          isKeyboardOpen
            ? 'pb-4'
            : 'pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]'
        } md:pb-8 space-y-4 sm:space-y-5`}
      >
        {/* Live Background Sync Pill when user is already exploring Squad/Tactics/Staff/Transfers */}
        {backgroundSyncStatus && activeTab !== 'sync' && (
          <div
            className={`rounded-xl border px-3.5 py-2 flex items-center justify-between gap-2 text-xs ${
              backgroundSyncStatus.paused
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  backgroundSyncStatus.paused
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400 animate-spin motion-reduce:animate-none'
                }`}
              />
              <span className="truncate">
                {backgroundSyncStatus.clubCoreReady
                  ? `Club core live — finishing in background: ${backgroundSyncStatus.label}`
                  : backgroundSyncStatus.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectTab('sync')}
              className={`shrink-0 min-h-[44px] md:min-h-[32px] px-3 md:px-2.5 py-1 rounded-lg md:rounded-md text-xs md:text-micro font-semibold border cursor-pointer whitespace-nowrap ${
                backgroundSyncStatus.paused
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 border-amber-500/40'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 border-emerald-500/40'
              }`}
            >
              {backgroundSyncStatus.paused ? 'Resume' : 'View Sync'}
            </button>
          </div>
        )}

        {/* Compact Status Bar (shown once a save is loaded so first-entry welcome hero stays clean) */}
        {(hydratedFmSave || players.length > 0) && (
          <div className="md:hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                <span className="truncate">
                  {saveDate} · {hydratedFmSave?.leagueRecordLabel || `${players.length} Players`}
                </span>
              </div>
              <div className="text-micro text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Next: {nextFixture} · Bal: {balance}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileDetails((v) => !v)}
              className="inline-flex items-center gap-1 shrink-0 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              {showMobileDetails ? (
                <>
                  Hide <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                </>
              ) : (
                <>
                  Club KPIs <ChevronDown className="w-3.5 h-3.5 shrink-0" />
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
                    className={`px-2 py-0.5 text-2xs font-mono font-semibold rounded-md border ${
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-mono font-semibold rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
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
                    ? 'Live Squad Season Output (All Comp)'
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
                  Player Wage Bill &amp; Wage Compliance
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {wageSpend}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Balance: {balance} · {players.length}-Man Squad
                  {(() => {
                    const basicSum = players.reduce((sum, p) => sum + (p.wagePw || 0), 0);
                    const clubPayroll = hydratedFmSave?.decodedPayload?.finances?.wagePayrollWeekly;
                    if (basicSum <= 0) return null;
                    if (typeof clubPayroll === 'number' && Math.abs(clubPayroll - basicSum) < 5) {
                      return null;
                    }
                    return ` · Player Basic: £${basicSum.toLocaleString()}/wk`;
                  })()}
                </div>
              </div>
            </div>
          </section>

          {/* Live .fm Save Verification Receipt & Club Governance Banner */}
          {hydratedFmSave && (
            <Suspense fallback={null}>
              <LiveFmSaveProofCard hydrated={hydratedFmSave} />
            </Suspense>
          )}
          {hydratedFmSave && liveGovernance && (
            <Suspense fallback={null}>
              <ClubGovernanceBanner
                governance={liveGovernance}
                extractionManifest={hydratedFmSave?.decodedPayload?.extractionManifest ?? null}
                onAskAnalyst={handleAskAnalystPrompt}
                onOpenCalibrationLab={handleOpenCalibrationLab}
              />
            </Suspense>
          )}
        </div>
        )}

        {/* Active View Area (AutoSyncWorkspace stays mounted so chat history persists across tabs) */}
        <div className={activeTab === 'sync' ? '' : 'hidden'}>
          <AppErrorBoundary scopeLabel="Hub & AI Analyst">
            <Suspense fallback={<TabWorkspaceSkeleton variant="sync" label="Hub & AI Analyst" />}>
              <AutoSyncWorkspace
                panel={hubPanel}
                onPanelChange={handleHubPanelChange}
                onNavigate={handleSelectTab}
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
                externalFmFile={quickPickedFmFile ?? pwa.launchedFmFile}
                onClearExternalFmFile={() => {
                  if (quickPickedFmFile) {
                    setQuickPickedFmFile(null);
                  } else {
                    pwa.clearLaunchedFmFile();
                  }
                }}
                onBusyStateChange={setWorkspaceBusy}
              />
            </Suspense>
          </AppErrorBoundary>
        </div>

        {activeTab === 'tactics' && (
          <AppErrorBoundary scopeLabel="Tactical War Room">
            <Suspense fallback={<TabWorkspaceSkeleton variant="tactics" label="Tactical War Room" />}>
              <TacticalWarRoom
                onRequestImport={() => handleSelectTab('sync')}
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
                onSubTabChange={handleTacticsSubTabChange}
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
            <Suspense fallback={<TabWorkspaceSkeleton variant="squad" label="Squad Analytics" />}>
              <SquadAnalyticsTable
                onRequestImport={() => handleSelectTab('sync')}
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
            <Suspense fallback={<TabWorkspaceSkeleton variant="recruitment" label="Transfers & Audit" />}>
              <RecruitmentWorkspace
                onRequestImport={() => handleSelectTab('sync')}
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
            <Suspense fallback={<TabWorkspaceSkeleton variant="staff" label="Staff Directory" />}>
              <StaffDirectory
                onRequestImport={() => handleSelectTab('sync')}
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
            <Suspense fallback={<TabWorkspaceSkeleton variant="matches" label="Match Log Archive" />}>
              <MatchLogArchive
                onRequestImport={() => handleSelectTab('sync')}
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
            onRequestRestore={() => backupFileInputRef.current?.click()}
            confirmResetPending={confirmResetPending}
            onResetMemory={() => {
              void handleClearMemory();
            }}
          />
        </Suspense>
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
