import { feedback } from '../utils/feedbackBus';
import { useAnalystDispatch } from '../hooks/useAnalystDispatch';
import { useFmFileIngest } from '../hooks/useFmFileIngest';
import type { AttachedFmFile } from '../hooks/useAnalystDispatch';
import { hubAuthFetch } from '../utils/hubAuth';
import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  HUB_PANEL_TO_VIEW,
  VIEW_TO_HUB_PANEL,
  type HubPanel,
} from '../utils/navigationUrl';
import {
  DECODE_HELP,
  FAST_SYNC_HELP,
  FIRST_TASKS,
  ONBOARDING_INTRO,
  ONBOARDING_STEPS,
  ONBOARDING_TITLE,
  SAVE_FILE_FALLBACK,
  SAVE_FILE_LOCATIONS,
} from '../utils/onboardingCopy';
import {
  Upload,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  StaffRecord,
} from '../types/fm27';
import type { DeepJourneyReport } from '../services/saveCache';
import type { RecruitmentTarget } from '../types/fmSave';
import type { ParsedPlayerDelta, SquadMergeResult } from '../utils/fmFileImporter';
import type {
  DecodedFmSavePayload,
  HydratedSaveState,
} from '../utils/fmSaveHydrator';
import {
  DEFAULT_CHAT_REASONING_MODE,
  shouldDefaultFastSync,
  formatStepTimingLabel,
} from '../utils/fmSaveUiHelpers';
import { buildSaveDataQualityReport } from '../utils/saveDataQuality';
import { DataQualityPanel } from './DataQualityPanel';
import type {
  FmSaveProgressStage,
  FmImportScope,
  UploadController,
} from '../services/fmSaveReader';
import { useUploadWakeLock } from '../hooks/useUploadWakeLock';
import {
  JourneyPanelSkeleton,
  UploadProgressSkeleton,
} from './WorkspaceSkeletons';
import {
  ChatTurnPayload,
  clearClubChatHistory,
  loadClubChatHistory,
  resolveChatClubKey,
  saveClubChatHistory,
} from '../services/chatStorage';
import type {
  AnalystReasoningMode,
  ExtendedPlayerAutoUpdate,
} from '../utils/tacticalAnalystContext';
import type { PreFlightPayloadValidationResult } from '../utils/analystPayload';
import type { FormationPresetKey } from '../utils/bestXiSolver';
import type { PersistedCustomSlot } from '../services/fmStorage';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
} from '../types/fmSave';
import { sanitizeReaderNotes } from '../utils/apiResponse';
import { countSquadPool, describeSquadPool } from '../utils/squadViewHelpers';
import {
  DECODE_TARGET_STORAGE_KEY,
  isMobileUserAgent,
  resolveDecodeTarget,
  shouldPrewarmLocalDecoder,
  type DecodeTarget,
} from '../utils/decodeTarget';
import { AnalystChatFeed } from './analyst/AnalystChatFeed';
import { AnalystComposer } from './analyst/AnalystComposer';
import { HubFinancesPanel } from './analyst/HubFinancesPanel';
import { MobileHubTabs, MobileHubView } from './analyst/MobileHubTabs';
import {
  buildFinancesPanelFromSave,
} from '../utils/clubFinances';
import { resolveSaveCompatibility } from '../utils/fm27SaveCompatibility';
import { mergeAnalystCitations } from '../utils/analystCitations';
import { SaveCompatibilityPanel } from './SaveCompatibilityPanel';

export { isUsableSponsorshipDeal, filterUsableSponsorshipDeals } from '../utils/clubFinances';

const SaveSnapshotDiffPanel = lazy(() =>
  import('./SaveSnapshotDiffPanel').then((m) => ({
    default: m.SaveSnapshotDiffPanel,
  }))
);

const FmUploadProgressCard = lazy(() =>
  import('./FmUploadProgressCard').then((m) => ({
    default: m.FmUploadProgressCard,
  }))
);


async function probeServerDecodeAvailability(): Promise<boolean> {
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 8_000) : null;
  try {
    const res = await hubAuthFetch('/api/fm27/decode-status', {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { serverDecodeAvailable?: boolean };
    return Boolean(data?.serverDecodeAvailable);
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type { ChatTurnPayload };
export type PlayerAutoUpdate = ExtendedPlayerAutoUpdate;


interface AutoSyncWorkspaceProps {
  matches: MatchLogEntry[];
  players: PlayerRecord[];
  staff?: StaffRecord[];
  recruitmentCases?: RecruitmentCase[];
  trackedTargets?: RecruitmentTarget[];
  latestJourneyReport?: DeepJourneyReport | null;
  onJourneyReportChange?: (report: DeepJourneyReport | null) => void;
  getLatestJourneyReportAsync?: () => Promise<DeepJourneyReport | null>;
  snapshotResetNonce?: number;
  /** Panel the address bar asked for; the mobile Hub applies it on first paint. */
  panel?: HubPanel;
  onPanelChange?: (panel: HubPanel) => void;
  /** Lets the first-run tasks send the user to the tab they describe. */
  onNavigate?: (tab: 'sync' | 'squad' | 'tactics' | 'recruitment' | 'matches' | 'staff') => void;
  currentSaveDate: string;
  clubName?: string;
  managerName?: string;
  nextFixture?: string;
  leagueStandingSub?: string;
  wageSpend?: string;
  balance?: string;
  hydratedFmSave?: HydratedSaveState | null;
  activeShape?: FormationPresetKey;
  customSlots?: PersistedCustomSlot[];
  applyToAnalystOnly?: boolean;
  liveGovernance?: ClubGovernanceState | null;
  liveLastMatchTactic?: LastMatchTacticBlueprint | null;
  onUpdateSaveDate?: (date: string) => void;
  onAddMatch: (match: MatchLogEntry) => void;
  onApplyPlayerUpdates?: (updates: PlayerAutoUpdate[]) => void;
  onBulkMergePlayers?: (
    parsedPlayers: ParsedPlayerDelta[]
  ) => Promise<SquadMergeResult> | SquadMergeResult;
  onApplyDecodedFmSave?: (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean; benchmarkId?: string }
  ) => Promise<HydratedSaveState> | HydratedSaveState;
  onBackgroundSyncStatusChange?: (
    status: {
      label: string;
      clubCoreReady: boolean;
      progressPct?: number;
      paused?: boolean;
    } | null
  ) => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
  externalFmFile?: File | null;
  onClearExternalFmFile?: () => void;
  onBusyStateChange?: (busy: boolean) => void;
}

export const AutoSyncWorkspace: React.FC<AutoSyncWorkspaceProps> = ({
  matches,
  players,
  staff = [],
  recruitmentCases = [],
  trackedTargets = [],
  latestJourneyReport = null,
  onJourneyReportChange,
  getLatestJourneyReportAsync,
  snapshotResetNonce = 0,
  panel,
  onPanelChange,
  onNavigate,
  currentSaveDate: saveDateProp,
  clubName,
  managerName,
  nextFixture = '--',
  leagueStandingSub = 'Awaiting .fm save import',
  wageSpend = '--',
  balance = '--',
  hydratedFmSave = null,
  activeShape = '4-3-3 DM Wide',
  customSlots = [],
  applyToAnalystOnly = false,
  liveGovernance = null,
  liveLastMatchTactic = null,
  onUpdateSaveDate,
  onAddMatch,
  onApplyPlayerUpdates,
  onBulkMergePlayers,
  onApplyDecodedFmSave,
  onBackgroundSyncStatusChange,
  pendingPrompt = null,
  onClearPendingPrompt,
  externalFmFile = null,
  onClearExternalFmFile,
  onBusyStateChange,
}) => {
  const latestMatch = matches[0];
  const nextEventNum = (latestMatch?.eventNumber || matches.length) + 1;
  const currentSaveDate =
    saveDateProp && saveDateProp !== '--'
      ? saveDateProp
      : latestMatch?.date || '--';

  const chatClubKey = useMemo(
    () =>
      resolveChatClubKey(
        clubName,
        hydratedFmSave?.decodedPayload?.meta?.clubUid ?? null
      ),
    [clubName, hydratedFmSave?.decodedPayload?.meta?.clubUid]
  );
  const chatClubKeyRef = useRef<string>(chatClubKey);
  chatClubKeyRef.current = chatClubKey;
  const analystAbortRef = useRef<AbortController | null>(null);

  const [chatState, setChatState] = useState<{
    clubKey: string;
    turns: ChatTurnPayload[];
  }>(() => ({
    clubKey: chatClubKey,
    turns: loadClubChatHistory(chatClubKey),
  }));
  const turns = chatState.clubKey === chatClubKey ? chatState.turns : [];

  const updateTurnsForClub = useCallback(
    (
      targetClubKey: string,
      action: React.SetStateAction<ChatTurnPayload[]>
    ) => {
      setChatState((prev) => {
        const baseTurns =
          prev.clubKey === targetClubKey
            ? prev.turns
            : loadClubChatHistory(targetClubKey);
        const nextTurns =
          typeof action === 'function' ? action(baseTurns) : action;
        saveClubChatHistory(targetClubKey, nextTurns);
        return { clubKey: targetClubKey, turns: nextTurns };
      });
    },
    []
  );

  const setTurns: React.Dispatch<React.SetStateAction<ChatTurnPayload[]>> =
    useCallback(
      (action) => {
        updateTurnsForClub(chatClubKeyRef.current, action);
      },
      [updateTurnsForClub]
    );
  const lastSnapshotResetNonceRef = useRef<number>(snapshotResetNonce);
  const [mobileHubView, setMobileHubViewLocal] = useState<MobileHubView>(() =>
    panel ? HUB_PANEL_TO_VIEW[panel] : 'chat'
  );
  const setMobileHubView = useCallback(
    (view: MobileHubView) => {
      setMobileHubViewLocal(view);
      onPanelChange?.(VIEW_TO_HUB_PANEL[view]);
    },
    [onPanelChange]
  );

  useEffect(() => {
    if (panel && HUB_PANEL_TO_VIEW[panel] !== mobileHubView) {
      setMobileHubViewLocal(HUB_PANEL_TO_VIEW[panel]);
    }
    // Follow the address bar only; the view stays the local source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
  const [clearChatArmed, setClearChatArmed] = useState<boolean>(false);
  const clearChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importScope] = useState<FmImportScope>('club_and_division');
  const [serverDecodeAvailable, setServerDecodeAvailable] = useState<boolean | null>(
    null
  );
  const [decodeTarget, setDecodeTarget] = useState<DecodeTarget>(() => {
    if (typeof window === 'undefined') return 'local';
    return resolveDecodeTarget(
      window.localStorage.getItem(DECODE_TARGET_STORAGE_KEY),
      isMobileUserAgent(navigator.userAgent)
    );
  });
  const fastSyncManuallyToggledRef = useRef<boolean>(false);
  const [fastSync, setFastSync] = useState<boolean>(false);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [cacheHitNotice, setCacheHitNotice] = useState<string | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState<boolean>(false);
  const [lastStepTimingsMs, setLastStepTimingsMs] = useState<Record<string, number>>({});
  const [preFlightDispatchValidation, setPreFlightDispatchValidation] =
    useState<PreFlightPayloadValidationResult | null>(null);
  const [dismissedPreFlightSignature, setDismissedPreFlightSignature] =
    useState<string | null>(null);
  const [reasoningMode, setReasoningMode] = useState<AnalystReasoningMode>(
    DEFAULT_CHAT_REASONING_MODE
  );
  const [messageInput, setMessageInput] = useState('');
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ base64: string; mimeType: string; name: string }>
  >([]);
  const [attachedFmFiles, setAttachedFmFiles] = useState<AttachedFmFile[]>([]);
  const [fmDecodeStage, setFmDecodeStage] =
    useState<FmSaveProgressStage | null>(null);
  const [clubCoreReadyDuringDecode, setClubCoreReadyDuringDecode] =
    useState(false);
  const [decodeElapsedSec, setDecodeElapsedSec] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [offlineServerRouteFile, setOfflineServerRouteFile] = useState<File | null>(null);
  const [chatFallbackNotice, setChatFallbackNotice] = useState<string | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const uploadControlRef = useRef<UploadController | null>(null);
  const cancelDecodeRef = useRef<(() => void) | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)').matches
      : true
  );
  const [hasOpenedJourneyPanel, setHasOpenedJourneyPanel] = useState<boolean>(
    false
  );
  const [livePreFlightValidation, setLivePreFlightValidation] =
    useState<PreFlightPayloadValidationResult | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    setIsDesktopViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (mobileHubView === 'journey' && !hasOpenedJourneyPanel) {
      setHasOpenedJourneyPanel(true);
    }
  }, [mobileHubView, hasOpenedJourneyPanel]);

  // Hydrate club-specific chat history when switching clubs or resetting memory
  useEffect(() => {
    if (snapshotResetNonce !== lastSnapshotResetNonceRef.current) {
      lastSnapshotResetNonceRef.current = snapshotResetNonce;
      setChatState({ clubKey: chatClubKey, turns: [] });
      setChatError(null);
      setChatFallbackNotice(null);
      return;
    }
    if (chatState.clubKey !== chatClubKey) {
      setChatState({
        clubKey: chatClubKey,
        turns: loadClubChatHistory(chatClubKey),
      });
    }
  }, [chatClubKey, chatState.clubKey, snapshotResetNonce]);

  // Persist updates for the currently hydrated club offline in localStorage
  useEffect(() => {
    if (chatState.clubKey !== chatClubKey) return;
    saveClubChatHistory(chatClubKey, chatState.turns);
  }, [chatClubKey, chatState.clubKey, chatState.turns]);

  const { wakeLockActive } = useUploadWakeLock({
    keepAwake: Boolean(fmDecodeStage) && !fmDecodeStage?.paused,
    warnBeforeUnload: Boolean(fmDecodeStage),
  });

  const hasLoadedSave = players.length > 0 || Boolean(hydratedFmSave);

  // Defer heavy tacticalAnalystContext pre-flight diagnostics off the cold-start paint
  useEffect(() => {
    if (!hasLoadedSave) {
      setLivePreFlightValidation(null);
      return;
    }
    let cancelled = false;
    const runValidation = () => {
      void import('../utils/analystPayload')
        .then(({ runPreFlightAnalystValidation }) => {
          if (cancelled) return;
          const { validation } = runPreFlightAnalystValidation({
            clubName: clubName && clubName !== '--' ? clubName : '--',
            managerName: managerName && managerName !== '--' ? managerName : '--',
            saveDate: currentSaveDate,
            nextFixture,
            leagueStandingSub,
            wageSpend,
            balance,
            players,
            matches,
            hydratedFmSave,
            staff,
            recruitmentCases,
            trackedTargets,
            latestJourneyReport,
            activeShape,
            customSlots,
            applyToAnalystOnly,
            liveGovernance,
            liveLastMatchTactic,
          });
          setLivePreFlightValidation(validation);
        })
        .catch(() => {
          // ignore lazy load errors on unmount/offline edge
        });
    };
    const timer =
      typeof window !== 'undefined'
        ? window.setTimeout(runValidation, 120)
        : null;
    if (timer === null) {
      runValidation();
    }
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    hasLoadedSave,
    clubName,
    managerName,
    currentSaveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    players,
    matches,
    hydratedFmSave,
    staff,
    recruitmentCases,
    trackedTargets,
    latestJourneyReport,
    activeShape,
    customSlots,
    applyToAnalystOnly,
    liveGovernance,
    liveLastMatchTactic,
  ]);

  // Reset stale dispatch override when a new save or squad state is imported
  useEffect(() => {
    setPreFlightDispatchValidation(null);
    setDismissedPreFlightSignature(null);
  }, [hydratedFmSave, players.length, currentSaveDate]);

  useEffect(() => {
    if (pendingPrompt) {
      setMobileHubView('chat');
      setMessageInput(pendingPrompt);
      onClearPendingPrompt?.();
    }
  }, [pendingPrompt, onClearPendingPrompt]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DECODE_TARGET_STORAGE_KEY, decodeTarget);
    } catch {
      // Storage can be unavailable in private mode; the default still applies.
    }
  }, [decodeTarget]);

  useEffect(() => {
    if (decodeTarget === 'local') {
      setServerDecodeAvailable(null);
      return;
    }
    let active = true;
    void probeServerDecodeAvailability().then((available) => {
      if (!active) return;
      setServerDecodeAvailable(available);
      if (!fastSyncManuallyToggledRef.current) {
        if (available) {
          setFastSync(false);
        } else if (typeof window !== 'undefined') {
          setFastSync(shouldDefaultFastSync(window.innerWidth));
        }
      }
    });
    return () => {
      active = false;
    };
  }, [decodeTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    if (
      !shouldPrewarmLocalDecoder({
        target: decodeTarget,
        online: navigator.onLine,
        saveData: nav.connection?.saveData,
        effectiveType: nav.connection?.effectiveType,
        deviceMemoryGb: nav.deviceMemory,
      })
    ) {
      return;
    }

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void import('../services/fmSaveReader')
        .then((mod) => {
          if (!cancelled) mod.warmBrowserDecoder();
        })
        .catch(() => {
          // A failed warmup is harmless; the real import retries the boot.
        });
    };
    let cancel = () => {
      cancelled = true;
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 3000 });
      cancel = () => {
        cancelled = true;
        window.cancelIdleCallback?.(id);
      };
    } else {
      const id = window.setTimeout(start, 2000);
      cancel = () => {
        cancelled = true;
        window.clearTimeout(id);
      };
    }
    return cancel;
  }, [decodeTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setIsDeviceOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (turns.length > 0 || isSending) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [turns.length, isSending]);

  useEffect(() => {
    if (!fmDecodeStage) {
      setDecodeElapsedSec(0);
      return;
    }
    if (fmDecodeStage.paused) {
      return;
    }
    const timer = window.setInterval(() => {
      setDecodeElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [Boolean(fmDecodeStage), Boolean(fmDecodeStage?.paused)]);

  const dispatchToAnalyst = useAnalystDispatch({
    activeShape,
    analystAbortRef,
    applyToAnalystOnly,
    balance,
    chatClubKeyRef,
    clubName,
    currentSaveDate,
    customSlots,
    hydratedFmSave,
    latestJourneyReport,
    leagueStandingSub,
    liveGovernance,
    liveLastMatchTactic,
    managerName,
    matches,
    nextEventNum,
    nextFixture,
    onAddMatch,
    onApplyPlayerUpdates,
    onBulkMergePlayers,
    onUpdateSaveDate,
    players,
    reasoningMode,
    recruitmentCases,
    setChatError,
    setChatFallbackNotice,
    setDismissedPreFlightSignature,
    setIsSending,
    setPreFlightDispatchValidation,
    staff,
    trackedTargets,
    turns,
    updateTurnsForClub,
    wageSpend,
  });

  const processIncomingFiles = useFmFileIngest({
    cancelDecodeRef,
    decodeTarget,
    dispatchToAnalyst,
    fastSync,
    getLatestJourneyReportAsync,
    importScope,
    isDeviceOnline,
    latestJourneyReport,
    messageInput,
    onApplyDecodedFmSave,
    onBackgroundSyncStatusChange,
    onBulkMergePlayers,
    onUpdateSaveDate,
    setAttachedFmFiles,
    setCacheHitNotice,
    setChatError,
    setChatFallbackNotice,
    setClubCoreReadyDuringDecode,
    setExtractionWarnings,
    setFmDecodeStage,
    setLastStepTimingsMs,
    setOfflineServerRouteFile,
    setUploadedImages,
    uploadControlRef,
  });

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    await processIncomingFiles(files);
    e.target.value = '';
  };

  useEffect(() => {
    onBusyStateChange?.(Boolean(fmDecodeStage) || isSending);
  }, [fmDecodeStage, isSending, onBusyStateChange]);

  const processIncomingFilesRef = useRef(processIncomingFiles);
  processIncomingFilesRef.current = processIncomingFiles;

  useEffect(() => {
    if (!externalFmFile) return;
    onClearExternalFmFile?.();
    void processIncomingFilesRef.current([externalFmFile]);
  }, [externalFmFile, onClearExternalFmFile]);

  const handleDropFiles = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files || []);
    await processIncomingFiles(files);
  };

  const handleRemoveImage = (index: number) => {
    const removed = uploadedImages[index];
    setUploadedImages((prev) => prev.filter((_, idx) => idx !== index));
    if (removed) {
      feedback.undo(`Removed ${removed.name || 'screenshot'}`, () =>
        setUploadedImages((prev) => (prev.some((img) => img.base64 === removed.base64) ? prev : [...prev, removed]))
      );
    }
  };

  const handleRemoveFmFile = (id: string) => {
    const removed = attachedFmFiles.find((f) => f.id === id);
    setAttachedFmFiles((prev) => prev.filter((f) => f.id !== id));
    if (removed) {
      feedback.undo(`Removed ${removed.name || 'save file'}`, () =>
        setAttachedFmFiles((prev) => (prev.some((f) => f.id === removed.id) ? prev : [...prev, removed]))
      );
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    if (!text.trim()) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr));
      }, 1800);
    } catch {
      setChatError('Could not copy to clipboard in this browser.');
    }
  };

  const formatTurnForCopy = (turn: ChatTurnPayload): string => {
    if (turn.role === 'user') {
      return turn.userText || '';
    }
    const parts: string[] = [];
    if (turn.analysisMarkdown) parts.push(turn.analysisMarkdown.trim());
    if (turn.immediateClicks && turn.immediateClicks.length > 0) {
      parts.push(
        `Immediate In-Game Clicks:\n${turn.immediateClicks
          .map((c: string, i: number) => `${i + 1}. ${c}`)
          .join('\n')}`
      );
    }
    const citations = mergeAnalystCitations(
      turn.sourceCitations,
      turn.analysisMarkdown
    );
    if (citations.length > 0) {
      parts.push(`Grounded in: ${citations.join(' · ')}`);
    }
    return parts.join('\n\n').trim();
  };

  const handleCopyFullChat = () => {
    if (turns.length === 0) return;
    const transcript = turns
      .map((t) => {
        const speaker = t.role === 'user' ? displayManagerLabel : 'Tactical Analyst';
        return `[${speaker}]\n${formatTurnForCopy(t)}`;
      })
      .join('\n\n---\n\n');
    handleCopyText('full-chat', transcript);
  };

  const disarmClearChat = useCallback(() => {
    if (clearChatTimerRef.current) {
      clearTimeout(clearChatTimerRef.current);
      clearChatTimerRef.current = null;
    }
    setClearChatArmed(false);
  }, []);

  const armClearChat = useCallback(() => {
    if (clearChatTimerRef.current) {
      clearTimeout(clearChatTimerRef.current);
    }
    setClearChatArmed(true);
    clearChatTimerRef.current = setTimeout(() => {
      clearChatTimerRef.current = null;
      setClearChatArmed(false);
    }, 5000);
  }, []);

  useEffect(
    () => () => {
      if (clearChatTimerRef.current) {
        clearTimeout(clearChatTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (turns.length === 0 && clearChatArmed) {
      disarmClearChat();
    }
  }, [turns.length, clearChatArmed, disarmClearChat]);

  const handleConfirmClearChat = useCallback(() => {
    clearClubChatHistory(chatClubKey);
    setTurns([]);
    setChatError(null);
    setChatFallbackNotice(null);
    disarmClearChat();
  }, [chatClubKey, setTurns, disarmClearChat]);

  const financesPanel = useMemo(
    () =>
      buildFinancesPanelFromSave({
        hydratedSave: hydratedFmSave,
        players,
        staff,
        balanceLabel: balance,
        wageSpendLabel: wageSpend,
      }),
    [hydratedFmSave, balance, wageSpend, staff, players]
  );

  const dataQualityReport = useMemo(() => {
    const decoded = hydratedFmSave?.decodedPayload;
    return decoded ? buildSaveDataQualityReport(decoded) : null;
  }, [hydratedFmSave]);

  const saveCompatibility = useMemo(
    () => resolveSaveCompatibility(hydratedFmSave?.decodedPayload?.meta),
    [hydratedFmSave]
  );

  const handleTextareaPaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await processIncomingFiles(imageFiles);
    }
  };

  const handlePasteButtonClick = async () => {
    try {
      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();
        const pastedFiles: File[] = [];
        let pastedText = '';
        for (const item of clipboardItems) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1] || 'png';
            pastedFiles.push(
              new File([blob], `pasted-screenshot.${ext}`, { type: imageType })
            );
          } else if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            pastedText += await blob.text();
          }
        }
        if (pastedFiles.length > 0) {
          await processIncomingFiles(pastedFiles);
        }
        if (pastedText.trim()) {
          setMessageInput((prev) =>
            prev.trim() ? `${prev.trimEnd()}\n${pastedText}` : pastedText
          );
        }
        return;
      }
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          setMessageInput((prev) =>
            prev.trim() ? `${prev.trimEnd()}\n${text}` : text
          );
        }
      }
    } catch {
      setChatError(
        'Clipboard paste was blocked by the browser — tap inside the message box and paste directly (Ctrl+V / long-press Paste).'
      );
    }
  };

  const handleSendToAnalyst = async (
    e?: React.FormEvent,
    quickPrompt?: string
  ) => {
    if (e) e.preventDefault();
    const promptToSend = (quickPrompt ?? messageInput).trim();
    if (
      !promptToSend &&
      uploadedImages.length === 0 &&
      attachedFmFiles.length === 0
    ) {
      setChatError(
        'Import your .fm save file, attach a screenshot, or type a question first.'
      );
      return;
    }

    setChatError(null);
    setChatFallbackNotice(null);
    const currentImages = [...uploadedImages];
    const currentFmFiles = [...attachedFmFiles];
    if (!quickPrompt) setMessageInput('');
    setUploadedImages([]);
    setAttachedFmFiles([]);

    await dispatchToAnalyst({
      promptText: promptToSend,
      imagesToSend: currentImages,
      fmFilesToSend: currentFmFiles,
    });
  };

  const displayManagerLabel =
    managerName && managerName !== '--'
      ? `${managerName} (${clubName && clubName !== '--' ? clubName : 'Manager'})`
      : clubName && clubName !== '--'
        ? `Manager · ${clubName}`
        : 'FM27 Manager';

  const cleanedNotes = sanitizeReaderNotes(extractionWarnings);
  const hasTimingOrNotes =
    Object.keys(lastStepTimingsMs).length > 0 || cleanedNotes.length > 0;
  const activePreFlightValidation = hasLoadedSave
    ? preFlightDispatchValidation ?? livePreFlightValidation
    : null;

  const composerSyncStatus = useMemo(() => {
    if (activePreFlightValidation && !activePreFlightValidation.valid) {
      return {
        label: `Sync Status: ${activePreFlightValidation.missingFields.length} core field(s) missing — re-import advised`,
        warning: true,
      };
    }
    return {
      label:
        decodeTarget === 'local'
          ? 'On-device Sync Selected'
          : serverDecodeAvailable
            ? 'Server Sync Ready'
            : 'Local Reader Ready',
      warning: false,
    };
  }, [activePreFlightValidation, decodeTarget, serverDecodeAvailable]);
  const preFlightSignature = activePreFlightValidation
    ? `${activePreFlightValidation.missingFields.join(',')}:${currentSaveDate}:${players.length}`
    : null;
  const showPreFlightWarningBanner = Boolean(
    activePreFlightValidation &&
      !activePreFlightValidation.valid &&
      dismissedPreFlightSignature !== preFlightSignature
  );
  const showSyncStatusControl = hasLoadedSave || hasTimingOrNotes;
  const localDecodeLabel =
    typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent)
      ? 'On this phone'
      : 'On this device';

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleDropFiles}
      className={`rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden transition-colors ${
        isDraggingFile
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* FIRST-ENTRY HERO (shown cleanly when no save & no chat yet) */}
      {!hasLoadedSave && turns.length === 0 && !fmDecodeStage ? (
        <div className="p-5 sm:p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/60">
          <div className="max-w-xl mx-auto space-y-4 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-micro font-semibold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Football Manager 27 · Patch 27.1.0 ready
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {ONBOARDING_TITLE}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {ONBOARDING_INTRO}
              </p>
            </div>

            <label
              htmlFor="welcome-fm-upload"
              onClick={() => {
                if (decodeTarget !== 'local') return;
                void import('../services/fmSaveReader').then((mod) =>
                  mod.warmBrowserDecoder()
                );
              }}
              className="w-full inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer transition"
            >
              <Upload className="w-4 h-4" />
              <span>Import .fm Save File</span>
              <input
                id="welcome-fm-upload"
                type="file"
                accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
              />
            </label>

            <details className="group text-left rounded-xl border border-slate-700 bg-slate-900/70">
              <summary className="flex min-h-[44px] list-none cursor-pointer items-center justify-between gap-2 px-3.5 text-xs font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
                <span>Where is my save file?</span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-3.5 pb-3 text-micro leading-relaxed text-slate-400">
                <ul className="space-y-1.5">
                  {SAVE_FILE_LOCATIONS.map((location) => (
                    <li key={location.platform}>
                      <span className="font-semibold text-slate-300">
                        {location.platform}:
                      </span>{' '}
                      <span className="font-mono break-words">{location.path}</span>
                    </li>
                  ))}
                </ul>
                <p>{SAVE_FILE_FALLBACK}</p>
              </div>
            </details>

            <div className="space-y-2 text-left">
              <h3 className="text-xs font-bold text-slate-300">What happens next</h3>
              <ol className="space-y-2">
                {ONBOARDING_STEPS.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-micro font-bold text-emerald-300">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-100">
                        {step.title}
                      </span>
                      <span className="mt-0.5 block text-micro leading-relaxed text-slate-400">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-2 text-left">
              <div
                role="group"
                aria-label="Where to decode the save"
                className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-700 bg-slate-900/70 p-1"
              >
                <button
                  type="button"
                  aria-pressed={decodeTarget === 'local'}
                  onClick={() => setDecodeTarget('local')}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    decodeTarget === 'local'
                      ? 'bg-emerald-400 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {decodeTarget === 'local' && (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {localDecodeLabel}
                </button>
                <button
                  type="button"
                  aria-pressed={decodeTarget === 'server'}
                  onClick={() => setDecodeTarget('server')}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    decodeTarget === 'server'
                      ? 'bg-emerald-400 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {decodeTarget === 'server' && (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  )}
                  Server backup
                </button>
              </div>
              <p className="text-micro leading-relaxed text-slate-400">
                {decodeTarget === 'local' ? DECODE_HELP.local : DECODE_HELP.server}
              </p>
              {decodeTarget === 'server' && !isDeviceOnline && (
                <p
                  role="status"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-micro leading-relaxed text-amber-800 dark:text-amber-200"
                >
                  You're offline, so the server backup can't be reached. Imports will not upload until the
                  signal returns — switch to on-device decoding to import now.
                </p>
              )}

              <label
                htmlFor="fm-fast-sync-welcome-toggle"
                className={`flex min-h-[44px] items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition select-none ${
                  fastSync
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-600'
                }`}
              >
                <input
                  id="fm-fast-sync-welcome-toggle"
                  type="checkbox"
                  checked={fastSync}
                  onChange={(e) => {
                    fastSyncManuallyToggledRef.current = true;
                    setFastSync(e.target.checked);
                  }}
                  className="mt-0.5 accent-amber-500 w-4 h-4 cursor-pointer"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-100">
                    <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    Fast Sync
                  </span>
                  <span className="mt-0.5 block text-micro leading-relaxed text-slate-400">
                    {FAST_SYNC_HELP}
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-2 text-left">
              <h3 className="text-xs font-bold text-slate-300">
                After it loads, start with
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {FIRST_TASKS.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onNavigate?.(task.tab)}
                    className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-left transition cursor-pointer hover:border-emerald-500/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-100">
                        {task.label}
                      </span>
                      <span className="block text-micro leading-relaxed text-slate-400">
                        {task.hint}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-emerald-300" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* COMPACT HEADER ONCE SAVE IS LOADED OR CHAT IS ACTIVE */
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                AI Tactical Analyst
              </h2>
              <div className="text-micro text-slate-500 dark:text-slate-400 truncate">
                {players.length > 0
                  ? `${clubName && clubName !== '--' ? clubName : 'Club'} · ${describeSquadPool(countSquadPool(players))} · ${matches.length} matches`
                  : 'Ask any FM27 tactical question'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Analyst Reasoning Depth"
              value={reasoningMode}
              onChange={(e) =>
                setReasoningMode(e.target.value as AnalystReasoningMode)
              }
              className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-base md:text-micro font-medium bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="fast_lite">Fast Co-Pilot</option>
              <option value="deep_high">Deep Analyst</option>
              <option value="max_xhigh">Max Synthesis</option>
            </select>

            {showSyncStatusControl && (
              <button
                type="button"
                onClick={() => setShowSyncDetails((v) => !v)}
                className={`min-h-[44px] md:min-h-[32px] inline-flex items-center gap-1 px-2.5 md:px-2 py-1 text-xs md:text-micro font-medium rounded-lg border cursor-pointer transition whitespace-nowrap ${
                  activePreFlightValidation && !activePreFlightValidation.valid
                    ? 'text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 bg-amber-500/15 border-amber-500/40'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800'
                }`}
              >
                {activePreFlightValidation && !activePreFlightValidation.valid ? (
                  <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                ) : activePreFlightValidation?.valid ? (
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <span>
                  {activePreFlightValidation && !activePreFlightValidation.valid
                    ? `Sync Status · ${activePreFlightValidation.missingFields.length} Missing`
                    : activePreFlightValidation?.valid
                      ? `Sync Status · OK${cleanedNotes.length > 0 ? ` (${cleanedNotes.length})` : ''}`
                      : `Sync Status${cleanedNotes.length > 0 ? ` (${cleanedNotes.length})` : ''}`}
                </span>
                {showSyncDetails ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
              </button>
            )}

            {activePreFlightValidation?.fields.boardPromises?.informational &&
              !activePreFlightValidation.fields.boardPromises.present && (
                <span
                  title={activePreFlightValidation.fields.boardPromises.detail}
                  className="inline-flex items-center gap-1 px-2 py-1 text-micro font-medium text-slate-500 dark:text-slate-400"
                >
                  <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  Board Promises · None active
                </span>
              )}

            {turns.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyFullChat}
                  title="Copy the entire Analyst conversation to your clipboard"
                  className="min-h-[44px] md:min-h-[32px] inline-flex items-center gap-1 px-2.5 md:px-2 py-1 text-xs md:text-micro font-medium text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white bg-emerald-500/10 dark:bg-slate-900 border border-emerald-500/35 rounded-lg cursor-pointer transition whitespace-nowrap"
                >
                  {copiedId === 'full-chat' ? (
                    <>
                      <Check className="w-3 h-3 shrink-0" />
                      Copied Chat
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 shrink-0" />
                      Copy Chat
                    </>
                  )}
                </button>
                {clearChatArmed ? (
                  <>
                    <button
                      type="button"
                      onClick={handleConfirmClearChat}
                      className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-xs md:text-micro font-bold text-rose-200 bg-rose-500/20 border border-rose-500/50 rounded-lg cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      Confirm Clear
                    </button>
                    <button
                      type="button"
                      onClick={disarmClearChat}
                      className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-xs md:text-micro font-medium text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={armClearChat}
                    className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-xs md:text-micro font-medium text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    Clear Chat
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* PRE-FLIGHT SYNC STATUS WARNING BANNER */}
      {showPreFlightWarningBanner && activePreFlightValidation && (
        <div
          role="alert"
          className="px-4 py-3 border-b border-amber-500/35 bg-amber-950/35 text-xs space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="font-bold text-amber-200 leading-snug">
                  Sync Status Warning · {activePreFlightValidation.warningTitle}
                </div>
                <p className="text-micro text-amber-100/90 leading-relaxed">
                  {activePreFlightValidation.warningMessage}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <label
                htmlFor="chat-multi-file-upload"
                className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1 px-3 sm:px-2.5 py-1 text-xs sm:text-micro font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer transition whitespace-nowrap"
              >
                <Upload className="w-3 h-3 shrink-0" />
                <span>Re-import .fm</span>
              </label>
              <button
                type="button"
                aria-label="Dismiss sync status warning"
                onClick={() => setDismissedPreFlightSignature(preFlightSignature)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] inline-flex items-center justify-center p-1 text-amber-300/80 hover:text-amber-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {Object.values(activePreFlightValidation.fields).map((field) => (
              <div
                key={field.key}
                title={field.detail}
                className={`px-2 py-1 rounded-lg border text-2xs flex items-center gap-1.5 min-w-0 ${
                  field.informational
                    ? 'bg-slate-900/70 border-slate-700 text-slate-300'
                    : field.present
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-950/60 border-amber-500/45 text-amber-200 font-semibold'
                }`}
              >
                {field.informational ? (
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                ) : field.present ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                )}
                <span className="truncate">
                  {field.informational && !field.present
                    ? `${field.label} · None active`
                    : field.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COLLAPSIBLE SYNC STATUS, PRE-FLIGHT CHECKLIST & READER NOTES */}
      {showSyncDetails && showSyncStatusControl && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/85 space-y-2.5 text-micro">
          {activePreFlightValidation && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`font-mono font-semibold ${
                    activePreFlightValidation.valid
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  Pre-Flight Payload Check:{' '}
                  {(() => {
                    const coreFieldCount = Object.values(
                      activePreFlightValidation.fields
                    ).filter((f) => !f.informational).length;
                    return activePreFlightValidation.valid
                      ? `All ${coreFieldCount} Core Fields Mapped`
                      : `${activePreFlightValidation.missingFields.length}/${coreFieldCount} Core Fields Failed Extraction`;
                  })()}
                </span>
                {activePreFlightValidation.needsReimport && (
                  <label
                    htmlFor="chat-multi-file-upload"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-bold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-md cursor-pointer transition"
                  >
                    <Upload className="w-3 h-3" />
                    Re-import .fm Save
                  </label>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {Object.values(activePreFlightValidation.fields).map((field) => (
                  <div
                    key={field.key}
                    title={field.detail}
                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
                      field.informational
                        ? 'bg-slate-900/70 border-slate-700 text-slate-300'
                        : field.present
                          ? 'bg-slate-900/95 border-slate-800 text-slate-300'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium shrink-0">
                      {field.informational ? (
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : field.present ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      {field.label}
                    </span>
                    <span className="font-mono text-2xs text-slate-400 truncate">
                      {field.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(lastStepTimingsMs).length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono font-semibold text-emerald-400">
                Timings:
              </span>
              {Object.entries(lastStepTimingsMs).map(([key, ms]) => (
                <span key={key} className="font-mono text-slate-400 tabular-nums">
                  {formatStepTimingLabel(key)}{' '}
                  {ms === 0 && key !== 'totalDecodeMs'
                    ? '0ms'
                    : `${(ms / 1000).toFixed(1)}s`}
                </span>
              ))}
            </div>
          )}
          {cleanedNotes.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-amber-200/90">
              {cleanedNotes.slice(0, 6).map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* SHARED UPLOAD / DECODE PROGRESS CARD (visible across both mobile Hub views) */}
      {fmDecodeStage && (
        <div className="px-3.5 sm:px-5 pt-3.5 sm:pt-4">
          <Suspense fallback={<UploadProgressSkeleton label={fmDecodeStage.label} />}>
            <FmUploadProgressCard
              stage={fmDecodeStage}
              elapsedSec={decodeElapsedSec}
              clubCoreReady={clubCoreReadyDuringDecode}
              wakeLockActive={wakeLockActive}
              onPause={() => uploadControlRef.current?.pause('manual')}
              onResume={() => uploadControlRef.current?.resume()}
              onDecodeOnPhone={() =>
                uploadControlRef.current?.requestLocalFallback()
              }
              onCancel={() => {
                uploadControlRef.current = null;
                cancelDecodeRef.current?.();
                setFmDecodeStage(null);
                setClubCoreReadyDuringDecode(false);
                onBackgroundSyncStatusChange?.(null);
              }}
            />
          </Suspense>
        </div>
      )}

      {cacheHitNotice && (
        <div className="px-3.5 sm:px-5 pt-3">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="min-w-0 flex-1 break-words leading-relaxed">{cacheHitNotice}</p>
            <button
              type="button"
              onClick={() => setCacheHitNotice(null)}
              className="shrink-0 rounded-md p-1 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Dismiss cache notice"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* MOBILE HUB VIEW SPLIT: Chat | Finances | Journey | Data (< md only) */}
      <MobileHubTabs
        view={mobileHubView}
        onViewChange={setMobileHubView}
        turnCount={turns.length}
        hasJourneyReport={Boolean(latestJourneyReport)}
        dataQualityMissing={
          dataQualityReport ? dataQualityReport.checks.missing : null
        }
      />

      {/* MAIN CHAT BODY + COMPOSER */}
      <div
        className={`${
          mobileHubView === 'chat' ? 'block' : 'hidden md:block'
        } p-3.5 sm:p-5 space-y-3.5`}
      >
        {/* Compact Horizontal Quick-Prompt Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            {
              label: players.length > 0 ? 'Next Match Plan' : 'Dual-Phase 4-3-3',
              prompt:
                players.length > 0
                  ? `Give me our Pre-Match Tactical Gameplan for ${clubName || 'our club'} (${nextFixture !== '--' ? nextFixture : 'next fixture'}), including our Starting XI, Tracking Winger OOP roles, and 62m/75m substitution windows.`
                  : 'Explain how Bobby Dean’s FM27 Playbook v2.0 Dual-Phase 4-3-3 and 62m/75m substitution script work.',
            },
            {
              label: players.length > 0 ? 'Squad & Wage Audit' : 'Countering 3-5-2',
              prompt:
                players.length > 0
                  ? `Audit our squad at ${clubName || 'our club'}: wage budget compliance, top earners vs minutes played, youth prospects to promote, and mentoring groups.`
                  : 'How do we counter a 3-5-2 wing-back system or a high-pressing 4-2-3-1 in FM27?',
            },
            {
              label: players.length > 0 ? 'Set-Piece Leaders' : 'Corner Routines',
              prompt:
                players.length > 0
                  ? `Who should be our top corner aerial threats, left/right corner takers, and fast recovery defenders?`
                  : 'How should I set up Attacking and Defending Corners in FM27?',
            },
            {
              label: '62m / 75m Subs Script',
              prompt:
                players.length > 0
                  ? `Walk me through our 62m and 75m touchline script for ${nextFixture !== '--' ? nextFixture : 'our next match'}: chasing 0-1 vs protecting 1-0.`
                  : 'What is the exact 62m / 75m touchline script when chasing vs protecting a lead in FM27?',
            },
          ].map((qp) => (
            <button
              key={qp.label}
              type="button"
              disabled={isSending}
              onClick={() => handleSendToAnalyst(undefined, qp.prompt)}
              className="min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {qp.label}
            </button>
          ))}
        </div>

        <AnalystChatFeed
          turns={turns}
          isSending={isSending}
          copiedId={copiedId}
          displayManagerLabel={displayManagerLabel}
          feedEndRef={feedEndRef}
          onCopyTurn={(turn) => handleCopyText(turn.id, formatTurnForCopy(turn))}
          onAsk={(prompt) => void handleSendToAnalyst(undefined, prompt)}
          onCancel={() => analystAbortRef.current?.abort()}
        />

        {chatFallbackNotice && (
          <div
            role="status"
            className="p-2.5 bg-amber-500/10 border border-amber-500/35 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
          >
            <Zap className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span className="leading-snug min-w-0 break-words">{chatFallbackNotice}</span>
          </div>
        )}

        {chatError && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words flex-1">{chatError}</span>
            {offlineServerRouteFile && (
              <button
                type="button"
                onClick={() => {
                  const pending = offlineServerRouteFile;
                  setDecodeTarget('local');
                  void processIncomingFiles([pending], { forceLocal: true });
                }}
                className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition cursor-pointer shrink-0"
              >
                Decode on this device
              </button>
            )}
          </div>
        )}

        {(attachedFmFiles.length > 0 || uploadedImages.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {attachedFmFiles.map((fmFile) => (
              <div
                key={fmFile.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-md"
              >
                <span>{fmFile.badgeLabel}</span>
                <button
                  type="button"
                  aria-label={`Remove ${fmFile.name}`}
                  onClick={() => handleRemoveFmFile(fmFile.id)}
                  className="hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {uploadedImages.map((img, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md"
              >
                <span>{img.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => handleRemoveImage(index)}
                  className="hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Compact Composer Bar */}
        <AnalystComposer
          messageInput={messageInput}
          onMessageInputChange={setMessageInput}
          onSubmit={handleSendToAnalyst}
          isSending={isSending}
          isDecoding={Boolean(fmDecodeStage)}
          hasLoadedSave={hasLoadedSave}
          decodeTarget={decodeTarget}
          onDecodeTargetChange={setDecodeTarget}
          fastSync={fastSync}
          onFastSyncToggle={(checked) => {
            fastSyncManuallyToggledRef.current = true;
            setFastSync(checked);
          }}
          onFilesSelected={handleFilesSelected}
          onPasteButtonClick={handlePasteButtonClick}
          onTextareaPaste={handleTextareaPaste}
          syncStatusLabel={composerSyncStatus.label}
          syncStatusWarning={composerSyncStatus.warning}
        />
      </div>

      {/* CLUB FINANCES PANEL — mobile sub-tab, always visible on desktop */}
      {(isDesktopViewport || mobileHubView === 'finances') && (
        <div
          className={
            mobileHubView === 'finances' ? 'block p-3.5 md:p-0' : 'hidden md:block'
          }
        >
          <HubFinancesPanel data={financesPanel} players={players} />
        </div>
      )}

      {/* SAVE DATA QUALITY PANEL — mobile sub-tab, always visible on desktop */}
      {(isDesktopViewport || mobileHubView === 'data') && dataQualityReport && (
        <div
          className={
            mobileHubView === 'data' ? 'block p-3.5 md:p-0' : 'hidden md:block'
          }
        >
          <DataQualityPanel report={dataQualityReport} />
          <SaveCompatibilityPanel compatibility={saveCompatibility} />
        </div>
      )}

      {/* SAVE-TO-SAVE JOURNEY PANEL (lazy-loaded; deferred on mobile until Journey tab opened) */}
      {(isDesktopViewport || mobileHubView === 'journey' || hasOpenedJourneyPanel) && (
        <div
          className={
            mobileHubView === 'journey' ? 'block p-3.5 md:p-0' : 'hidden md:block'
          }
        >
          <Suspense fallback={<JourneyPanelSkeleton />}>
            <SaveSnapshotDiffPanel
              refreshToken={`${hydratedFmSave?.saveDateLabel || ''}-${players.length}-${snapshotResetNonce ?? 0}`}
              liveMatches={matches}
              onJourneyReportChange={onJourneyReportChange}
              onAskAnalyst={(prompt) => {
                setMobileHubView('chat');
                void dispatchToAnalyst({
                  promptText: prompt,
                  imagesToSend: [],
                  fmFilesToSend: [],
                  isJourneyComparison: true,
                });
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};
