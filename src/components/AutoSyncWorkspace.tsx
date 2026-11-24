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
  Send,
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
  Clock,
  Shield,
  Briefcase,
  MessageSquare,
  History,
  Copy,
  Check,
  ClipboardPaste,
} from 'lucide-react';
import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  StaffRecord,
} from '../types/fm27';
import { checkFm27ResponseWarnings } from '../utils/fm27AccuracyCheck';
import type { DeepJourneyReport } from '../services/saveCache';
import type { RecruitmentTarget } from '../types/fmSave';
import type {
  ParsedFmExportResult,
  ParsedPlayerDelta,
  SquadMergeResult,
} from '../utils/fmFileImporter';
import type {
  DecodedFmSavePayload,
  HydratedSaveState,
} from '../utils/fmSaveHydrator';
import {
  shouldDefaultFastSync,
  formatStepTimingLabel,
} from '../utils/fmSaveUiHelpers';
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
  PreFlightPayloadValidationResult,
} from '../utils/tacticalAnalystContext';
import type { FormationPresetKey } from '../utils/bestXiSolver';
import type { PersistedCustomSlot } from '../services/fmStorage';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
} from '../types/fmSave';
import {
  ApiResponseError,
  describeApiFailure,
  isRecoverableAnalystFailure,
  parseJsonApiResponse,
  sanitizeReaderNotes,
  toApiResponseError,
} from '../utils/apiResponse';

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
    const res = await fetch('/api/fm27/decode-status', {
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

interface AttachedFmFile {
  id: string;
  name: string;
  kind: 'FM_SAVE_DECODED' | 'FM_EXPORT';
  badgeLabel: string;
  promptContext: string;
  parsedExport?: ParsedFmExportResult;
  initialMergeResult?: SquadMergeResult;
  hydratedSave?: HydratedSaveState;
}

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
    options?: { isInterimCheckpoint?: boolean }
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

  const [chatState, setChatState] = useState<{
    clubKey: string;
    turns: ChatTurnPayload[];
  }>(() => ({
    clubKey: chatClubKey,
    turns: loadClubChatHistory(chatClubKey),
  }));
  const turns = chatState.clubKey === chatClubKey ? chatState.turns : [];
  const setTurns: React.Dispatch<React.SetStateAction<ChatTurnPayload[]>> =
    useCallback(
      (action) => {
        setChatState((prev) => {
          const baseTurns =
            prev.clubKey === chatClubKey
              ? prev.turns
              : loadClubChatHistory(chatClubKey);
          const nextTurns =
            typeof action === 'function' ? action(baseTurns) : action;
          return { clubKey: chatClubKey, turns: nextTurns };
        });
      },
      [chatClubKey]
    );
  const lastSnapshotResetNonceRef = useRef<number>(snapshotResetNonce);
  const [mobileHubView, setMobileHubView] = useState<'chat' | 'journey'>('chat');
  const [importScope] = useState<FmImportScope>('managed_club_only');
  const [serverDecodeAvailable, setServerDecodeAvailable] = useState<boolean | null>(
    null
  );
  const fastSyncManuallyToggledRef = useRef<boolean>(false);
  const [fastSync, setFastSync] = useState<boolean>(false);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [showSyncDetails, setShowSyncDetails] = useState<boolean>(false);
  const [lastStepTimingsMs, setLastStepTimingsMs] = useState<Record<string, number>>({});
  const [preFlightDispatchValidation, setPreFlightDispatchValidation] =
    useState<PreFlightPayloadValidationResult | null>(null);
  const [dismissedPreFlightSignature, setDismissedPreFlightSignature] =
    useState<string | null>(null);
  const [reasoningMode, setReasoningMode] =
    useState<AnalystReasoningMode>('deep_high');
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
      void import('../utils/tacticalAnalystContext')
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

  const dispatchToAnalyst = async (params: {
    promptText: string;
    imagesToSend: Array<{ base64: string; mimeType: string; name: string }>;
    fmFilesToSend: AttachedFmFile[];
    journeyReportOverride?: DeepJourneyReport | null;
  }) => {
    const {
      promptText,
      imagesToSend,
      fmFilesToSend,
      journeyReportOverride,
    } = params;

    const bulkMergedDiffSummaries: string[] = [];
    const bulkUpdatedPlayerNames: string[] = [];
    let detectedExportDate: string | null = null;

    for (const fmFile of fmFilesToSend) {
      if (fmFile.kind === 'FM_SAVE_DECODED' && fmFile.hydratedSave) {
        detectedExportDate = fmFile.hydratedSave.saveDateLabel;
        for (const cp of fmFile.hydratedSave.changedPlayers) {
          if (!bulkUpdatedPlayerNames.includes(cp.name)) {
            bulkUpdatedPlayerNames.push(cp.name);
          }
        }
      } else if (
        fmFile.kind === 'FM_EXPORT' &&
        fmFile.parsedExport &&
        fmFile.parsedExport.parsedPlayers.length > 0 &&
        onBulkMergePlayers
      ) {
        const mergeRes =
          fmFile.initialMergeResult ??
          (await onBulkMergePlayers(fmFile.parsedExport.parsedPlayers));
        if (mergeRes.changedPlayers.length > 0) {
          for (const cp of mergeRes.changedPlayers) {
            bulkUpdatedPlayerNames.push(cp.name);
            bulkMergedDiffSummaries.push(
              `- ${cp.name}: ${cp.changes.join(', ')}`
            );
          }
        } else if (mergeRes.matchedCount > 0) {
          bulkMergedDiffSummaries.push(
            `- Matched all ${mergeRes.matchedCount} players from ${fmFile.name} (0 numerical diffs vs current database).`
          );
        }
        if (fmFile.parsedExport.detectedDate) {
          detectedExportDate = fmFile.parsedExport.detectedDate;
        }
      }
    }

    if (detectedExportDate && onUpdateSaveDate) {
      onUpdateSaveDate(detectedExportDate);
    }

    const combinedFileContextParts = fmFilesToSend.map((f) => f.promptContext);
    if (bulkMergedDiffSummaries.length > 0) {
      combinedFileContextParts.push(
        `[AUTO-MERGED SQUAD DATABASE DIFFS FROM UPLOADED EXPORT]\n${bulkMergedDiffSummaries.join('\n')}`
      );
    }
    const rawFileContext = combinedFileContextParts.join('\n\n---\n\n');
    const importedFileContext =
      rawFileContext.length > 17500
        ? `${rawFileContext.slice(0, 17500)}\n...[trimmed to server context cap]`
        : rawFileContext;

    const attachedNames = [
      ...fmFilesToSend.map((f) => f.name),
      ...imagesToSend.map((img) => img.name),
    ];

    const finalPrompt =
      promptText ||
      `Imported ${attachedNames.join(', ')} — analyse my squad, played results, league standing, finances, and injuries against Bobby Dean's Playbook v2.0, and give me a concise tactical & rotation plan from ${detectedExportDate || currentSaveDate} forward.`;

    const userTurn: ChatTurnPayload = {
      id: `user-${Date.now()}`,
      role: 'user',
      userText: finalPrompt,
      imageNames: attachedNames,
    };

    setTurns((prev) => [...prev, userTurn]);
    setIsSending(true);
    setChatError(null);
    setChatFallbackNotice(null);

    const newlyAttachedHydratedSave =
      fmFilesToSend.find((f) => f.hydratedSave)?.hydratedSave ?? null;
    const latestHydratedSave = newlyAttachedHydratedSave || hydratedFmSave;

    // Only override live React squad/matches when a brand-new .fm save is attached on THIS turn;
    // on subsequent turns keep live `players`/`matches` so Analyst updates, CSV merges & match logs persist.
    const effectivePlayers =
      newlyAttachedHydratedSave && newlyAttachedHydratedSave.updatedSquad.length > 0
        ? newlyAttachedHydratedSave.updatedSquad
        : players.length > 0
          ? players
          : latestHydratedSave?.updatedSquad || [];

    const effectiveMatches =
      newlyAttachedHydratedSave && newlyAttachedHydratedSave.updatedMatches.length > 0
        ? newlyAttachedHydratedSave.updatedMatches
        : matches.length > 0
          ? matches
          : latestHydratedSave?.updatedMatches || [];

    const effectiveClubName =
      latestHydratedSave?.decodedPayload.meta.clubName ||
      (clubName && clubName !== '--' ? clubName : '--');

    const effectiveManagerName =
      latestHydratedSave?.decodedPayload.meta.managerName ||
      (managerName && managerName !== '--' ? managerName : '--');

    const effectiveSaveDate =
      detectedExportDate ||
      newlyAttachedHydratedSave?.saveDateLabel ||
      currentSaveDate ||
      latestHydratedSave?.saveDateLabel ||
      '--';

    const effectiveNextFixture =
      newlyAttachedHydratedSave?.nextFixtureLabel ||
      nextFixture ||
      latestHydratedSave?.nextFixtureLabel ||
      '--';

    const effectiveStandingSub =
      newlyAttachedHydratedSave?.leagueStandingLabel ||
      leagueStandingSub ||
      latestHydratedSave?.leagueStandingLabel ||
      '--';

    const effectiveWageSpend =
      newlyAttachedHydratedSave?.wageComplianceLabel ||
      wageSpend ||
      latestHydratedSave?.wageComplianceLabel ||
      '--';

    const effectiveBalance =
      newlyAttachedHydratedSave?.balanceLabel ||
      balance ||
      latestHydratedSave?.balanceLabel ||
      '--';

    const appendOfflineBriefing = async (fallbackReason: string) => {
      const { buildOfflineTacticalBriefing } = await import(
        '../utils/offlineBriefingEngine'
      );
      const offlineData = buildOfflineTacticalBriefing({
        clubName: effectiveClubName,
        saveDate: effectiveSaveDate,
        nextFixture: effectiveNextFixture,
        leagueStandingSub: effectiveStandingSub,
        wageSpend: effectiveWageSpend,
        balance: effectiveBalance,
        players: effectivePlayers,
        matches: effectiveMatches,
        hydratedFmSave: latestHydratedSave,
        userQuery: finalPrompt,
        activeShape,
        customSlots,
        fallbackReason,
      });
      const offlineTurn: ChatTurnPayload = {
        id: `assistant-offline-${Date.now()}`,
        role: 'assistant',
        screenDetected: offlineData.screenDetected,
        inGameDate: offlineData.inGameDate,
        analysisMarkdown: offlineData.analysisMarkdown,
        immediateClicks: offlineData.immediateClicks,
        followUpQuestions: offlineData.followUpQuestions,
        chronicleTitle: offlineData.chronicleTitle,
        chronicleOutcomeMetric: offlineData.chronicleOutcomeMetric,
        eventNumber: nextEventNum,
        playerUpdatesApplied: [],
      };
      setTurns((prev) => [...prev, offlineTurn]);
    };

    try {
      const {
        buildLiveTacticalAnalystContext,
        buildConversationTranscript,
        runPreFlightAnalystValidation,
      } = await import('../utils/tacticalAnalystContext');
      const contextInput = {
        clubName: effectiveClubName,
        managerName: effectiveManagerName,
        saveDate: effectiveSaveDate,
        nextFixture: effectiveNextFixture,
        leagueStandingSub: effectiveStandingSub,
        wageSpend: effectiveWageSpend,
        balance: effectiveBalance,
        players: effectivePlayers,
        matches: effectiveMatches,
        hydratedFmSave: latestHydratedSave,
        staff,
        recruitmentCases,
        trackedTargets,
        latestJourneyReport:
          journeyReportOverride !== undefined
            ? journeyReportOverride
            : latestJourneyReport,
        userQuery: finalPrompt,
        activeShape,
        customSlots,
        applyToAnalystOnly,
        liveGovernance,
        liveLastMatchTactic,
      };
      const liveAppContext = buildLiveTacticalAnalystContext(contextInput);

      const historyForApi = buildConversationTranscript(turns, 6);

      const requestPayload = {
        message: finalPrompt,
        history: historyForApi,
        images: imagesToSend,
        importedFileContext: importedFileContext || undefined,
        liveAppContext,
        reasoningMode,
        nextEventNumber: nextEventNum,
        currentSaveDate: effectiveSaveDate,
        clubName:
          effectiveClubName !== '--' ? effectiveClubName : undefined,
      };

      const { validation: preFlightValidation } = runPreFlightAnalystValidation(
        contextInput,
        {
          ...requestPayload,
          liveAppContextOverride: liveAppContext,
        },
        { logToConsole: true }
      );
      if (effectivePlayers.length > 0 || Boolean(latestHydratedSave)) {
        setPreFlightDispatchValidation(preFlightValidation);
        if (!preFlightValidation.valid) {
          setDismissedPreFlightSignature(null);
        }
      }

      const postTacticalChat = async (mode: AnalystReasoningMode) => {
        try {
          const response = await fetch('/api/fm27/tactical-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestPayload, reasoningMode: mode }),
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await parseJsonApiResponse<any>(
            response,
            'Failed to get Tactical Analyst response'
          );
        } catch (err: unknown) {
          throw toApiResponseError(err);
        }
      };

      const isDeepAnalystMode =
        reasoningMode === 'deep_high' || reasoningMode === 'max_xhigh';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      let failure: ApiResponseError | null = null;
      try {
        data = await postTacticalChat(reasoningMode);
      } catch (firstErr) {
        failure = toApiResponseError(firstErr);
        // Cheap transient gateway glitches are worth one same-mode retry. Real
        // timeouts (504) and overload (503/429) go straight to the Fast fallback
        // so the user is not left waiting on a second Deep timeout.
        const shouldRetrySameMode =
          failure.kind === 'network' ||
          failure.kind === 'non-json' ||
          failure.isHtml ||
          failure.status === 502;
        if (shouldRetrySameMode) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          try {
            data = await postTacticalChat(reasoningMode);
            failure = null;
          } catch (retryErr) {
            failure = toApiResponseError(retryErr);
          }
        }
      }

      if (failure) {
        const primaryDetail = describeApiFailure(failure);
        const keyMissing = /GEMINI_API_KEY|not configured|API key/i.test(
          failure.message
        );

        if (keyMissing) {
          setChatFallbackNotice(
            `Analyst unavailable — ${primaryDetail}. Showing the local offline briefing instead.`
          );
          await appendOfflineBriefing('no external LLM API key configured');
          return;
        }

        let fastDetail: string | null = null;
        let fastSucceeded = false;
        if (isDeepAnalystMode && isRecoverableAnalystFailure(failure)) {
          setChatFallbackNotice(
            `Deep Analyst failed — ${primaryDetail}. Automatically retrying with Fast Analyst…`
          );
          await new Promise((resolve) => setTimeout(resolve, 600));
          try {
            data = await postTacticalChat('fast_lite');
            failure = null;
            fastSucceeded = true;
          } catch (fastErr) {
            const fastFailure = toApiResponseError(fastErr);
            failure = fastFailure;
            fastDetail = describeApiFailure(fastFailure);
          }
        }

        if (failure) {
          if (isRecoverableAnalystFailure(failure)) {
            setChatFallbackNotice(
              fastDetail
                ? `Deep Analyst failed — ${primaryDetail}. Fast Analyst also failed — ${fastDetail}. Showing the local offline briefing instead.`
                : `Analyst unavailable — ${primaryDetail}. Showing the local offline briefing instead.`
            );
            await appendOfflineBriefing('AI service unavailable / offline');
            return;
          }
          setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
          setChatFallbackNotice(null);
          setChatError(primaryDetail);
          return;
        }

        if (fastSucceeded) {
          setChatFallbackNotice(
            `Deep Analyst failed — ${primaryDetail}. Fast Analyst answered instead.`
          );
        }
      }

      const assignedEventNum = nextEventNum;

      if (data.inGameDate && data.inGameDate !== '--' && onUpdateSaveDate) {
        onUpdateSaveDate(data.inGameDate);
      }

      const appliedPlayerNames: string[] = [...bulkUpdatedPlayerNames];
      if (
        Array.isArray(data.playerUpdates) &&
        data.playerUpdates.length > 0 &&
        onApplyPlayerUpdates
      ) {
        onApplyPlayerUpdates(data.playerUpdates);
        for (const pu of data.playerUpdates) {
          if (pu.name && !appliedPlayerNames.includes(pu.name)) {
            appliedPlayerNames.push(pu.name);
          }
        }
      }

      const alreadyHydratedMatch = fmFilesToSend.some(
        (f) => f.kind === 'FM_SAVE_DECODED'
      );
      if (
        !alreadyHydratedMatch &&
        data.isMatchResult &&
        data.matchFields?.opponent &&
        data.matchFields?.score
      ) {
        const mf = data.matchFields;
        const newMatch: MatchLogEntry = {
          id: `chat-match-${Date.now()}`,
          eventNumber: assignedEventNum,
          date: data.inGameDate || effectiveSaveDate,
          competition: mf.competition || 'Competitive Match',
          opponent: mf.opponent,
          venue: mf.venue === 'H' ? 'H' : 'A',
          result:
            mf.result === 'W' || mf.result === 'D' || mf.result === 'L'
              ? mf.result
              : 'D',
          score: mf.score,
          xGFor: typeof mf.xGFor === 'number' ? mf.xGFor : null,
          xGAgainst: typeof mf.xGAgainst === 'number' ? mf.xGAgainst : null,
          possession: typeof mf.possession === 'number' ? mf.possession : null,
          passCompletion:
            typeof mf.passCompletion === 'number' ? mf.passCompletion : null,
          shotsFor: mf.shotsFor || '—',
          shotsAgainst: mf.shotsAgainst || '—',
          cccFor: typeof mf.cccFor === 'number' ? mf.cccFor : null,
          cccAgainst: typeof mf.cccAgainst === 'number' ? mf.cccAgainst : null,
          goalTimeline: mf.goalTimeline || 'Logged from screenshot',
          potm: mf.potm || '—',
          defensiveWatchpoints: mf.defensiveWatchpoints || '—',
          tacticalAudit:
            mf.tacticalAudit ||
            data.chronicleOutcomeMetric ||
            'Audited against Bobby Dean Playbook v2.0',
          source: 'CHAT',
        };
        onAddMatch(newMatch);
      }

      const assistantTurn: ChatTurnPayload = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        screenDetected: data.screenDetected,
        inGameDate: data.inGameDate || effectiveSaveDate,
        analysisMarkdown: data.analysisMarkdown,
        immediateClicks: data.immediateClicks || [],
        followUpQuestions: Array.isArray(data.followUpQuestions)
          ? data.followUpQuestions
          : [],
        chronicleTitle: data.chronicleTitle || data.screenDetected,
        chronicleOutcomeMetric: data.chronicleOutcomeMetric || 'Updated',
        eventNumber: assignedEventNum,
        playerUpdatesApplied: appliedPlayerNames,
      };

      setTurns((prev) => [...prev, assistantTurn]);
    } catch (err: unknown) {
      if (err instanceof ApiResponseError) {
        const failureDetail = describeApiFailure(err);
        if (isRecoverableAnalystFailure(err)) {
          setChatFallbackNotice(
            `Analyst unavailable — ${failureDetail}. Showing the local offline briefing instead.`
          );
          await appendOfflineBriefing('AI service unavailable / offline');
          return;
        }
        setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
        setChatFallbackNotice(null);
        setChatError(failureDetail);
        return;
      }
      setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
      setChatFallbackNotice(null);
      setChatError(
        err instanceof Error
          ? err.message
          : 'Error communicating with FM27 Tactical Analyst'
      );
    } finally {
      setIsSending(false);
    }
  };

  const compressImageFile = (
    file: File,
    maxDimension = 1600,
    quality = 0.82
  ): Promise<{ base64: string; mimeType: string; name: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (width > maxDimension || height > maxDimension) {
              if (width >= height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              const rawBase64 = dataUrl.split(',')[1] || '';
              resolve({
                base64: rawBase64,
                mimeType: file.type || 'image/png',
                name: file.name,
              });
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            const compressedBase64 = compressedDataUrl.split(',')[1] || '';
            resolve({
              base64: compressedBase64,
              mimeType: 'image/jpeg',
              name: file.name,
            });
          } catch {
            const rawBase64 = dataUrl.split(',')[1] || '';
            resolve({
              base64: rawBase64,
              mimeType: file.type || 'image/png',
              name: file.name,
            });
          }
        };
        img.onerror = () => {
          const rawBase64 = dataUrl.split(',')[1] || '';
          resolve({
            base64: rawBase64,
            mimeType: file.type || 'image/png',
            name: file.name,
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const processIncomingFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setChatError(null);
    setChatFallbackNotice(null);

    for (const file of files) {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.fm')) {
        try {
          setExtractionWarnings([]);
          setLastStepTimingsMs({});
          setClubCoreReadyDuringDecode(false);
          let interimHydrated = false;
          const { decodeFmSaveFile, cancelFmSaveDecode, createUploadController } =
            await import('../services/fmSaveReader');
          cancelDecodeRef.current = cancelFmSaveDecode;
          const uploadControl = createUploadController();
          uploadControlRef.current = uploadControl;
          const initialLabel = `Reading ${file.name}${fastSync ? ' (Fast Sync)' : ''}...`;
          setFmDecodeStage({
            stage: 'read',
            step: 'Preparing .fm Save',
            progressPct: 0,
            totalBytes: file.size || 0,
            bytesUploaded: 0,
            label: initialLabel,
          });
          onBackgroundSyncStatusChange?.({
            label: initialLabel,
            clubCoreReady: false,
            progressPct: 0,
            paused: false,
          });
          const decoded = await decodeFmSaveFile(
            file,
            (stage) => {
              setFmDecodeStage(stage);
              onBackgroundSyncStatusChange?.({
                label: stage.label,
                clubCoreReady: interimHydrated,
                progressPct: stage.progressPct,
                paused: stage.paused,
              });
            },
            {
              scope: importScope,
              fastSync,
              uploadControl,
              onCheckpoint: (cp) => {
                if (onApplyDecodedFmSave && cp.payload?.players?.length > 0) {
                  interimHydrated = true;
                  setClubCoreReadyDuringDecode(true);
                  void onApplyDecodedFmSave(cp.payload, {
                    isInterimCheckpoint: true,
                  });
                  onBackgroundSyncStatusChange?.({
                    label:
                      'Squad, staff & tactics ready — finishing fixtures, match xG & season stats...',
                    clubCoreReady: true,
                  });
                }
              },
            }
          );
          uploadControlRef.current = null;
          setFmDecodeStage(null);
          setClubCoreReadyDuringDecode(false);

          const nonFatalWarnings = Array.from(
            new Set([
              ...(Array.isArray(decoded.extractionWarnings)
                ? decoded.extractionWarnings
                : []),
              ...(Array.isArray(decoded.warnings) ? decoded.warnings : []),
            ])
          );
          setExtractionWarnings(nonFatalWarnings);
          setLastStepTimingsMs(
            decoded.stepTimingsMs && typeof decoded.stepTimingsMs === 'object'
              ? decoded.stepTimingsMs
              : {}
          );

          const hydrated = onApplyDecodedFmSave
            ? await onApplyDecodedFmSave(decoded, { isInterimCheckpoint: false })
            : undefined;
          onBackgroundSyncStatusChange?.(null);

          // Wait for snapshot persistence & Save-to-Save Journey diff BEFORE dispatching to Analyst
          const freshJourney = getLatestJourneyReportAsync
            ? await getLatestJourneyReportAsync()
            : latestJourneyReport;

          const decodedEntry: AttachedFmFile = {
            id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'FM_SAVE_DECODED',
            badgeLabel: `${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Decoded'})`,
            promptContext:
              hydrated?.analystPromptContext || JSON.stringify(decoded.meta),
            hydratedSave: hydrated,
          };

          if (!messageInput.trim()) {
            const syncPrompt = freshJourney
              ? `I just imported my live .fm save file ${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Live'}). Compare this save against my previous checkpoint (${freshJourney.fromDate} [${freshJourney.fromSeason}] -> ${freshJourney.toDate} [${freshJourney.toSeason}]) — summarize my Save-to-Save Career Journey (what improved, what worsened, League vs Cup vs Friendlies progression separately, squad/finances, governance/promises) and give me our next-match plan.`
              : `I just imported my live .fm save file ${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Live'}). Give me a concise tactical audit of our squad, League vs Cup vs Friendlies results separately, finances, governance/promises, and next-match plan.`;
            await dispatchToAnalyst({
              promptText: syncPrompt,
              imagesToSend: [],
              fmFilesToSend: [decodedEntry],
              journeyReportOverride: freshJourney,
            });
          } else {
            setAttachedFmFiles((prev) => [...prev, decodedEntry]);
          }
        } catch (err: unknown) {
          uploadControlRef.current = null;
          setFmDecodeStage(null);
          setClubCoreReadyDuringDecode(false);
          onBackgroundSyncStatusChange?.(null);
          if (err instanceof Error && err.message === 'CANCELLED_BY_USER') {
            return;
          }
          setChatError(
            err instanceof Error
              ? err.message
              : `Could not read ${file.name}. Make sure it is a valid FM26/FM27 .fm save file.`
          );
        }
      } else if (
        lower.endsWith('.csv') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.endsWith('.rtf') ||
        lower.endsWith('.txt')
      ) {
        try {
          const [text, { parseFmStructuredExport }] = await Promise.all([
            file.text(),
            import('../utils/fmFileImporter'),
          ]);
          const parsed = parseFmStructuredExport(text, file.name);
          const initialMergeResult =
            parsed.parsedPlayers.length > 0 && onBulkMergePlayers
              ? await onBulkMergePlayers(parsed.parsedPlayers)
              : undefined;
          if (parsed.detectedDate && onUpdateSaveDate) {
            onUpdateSaveDate(parsed.detectedDate);
          }
          const countDesc =
            parsed.parsedPlayers.length > 0
              ? `${parsed.parsedPlayers.length} players synced`
              : `${parsed.rowCount} rows parsed`;

          setAttachedFmFiles((prev) => [
            ...prev,
            {
              id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              kind: 'FM_EXPORT',
              badgeLabel: `${file.name} (${countDesc})`,
              promptContext: parsed.promptContext,
              parsedExport: parsed,
              initialMergeResult,
            },
          ]);
        } catch {
          setChatError(`Could not parse ${file.name}.`);
        }
      } else if (file.type.startsWith('image/')) {
        try {
          const compressed = await compressImageFile(file);
          if (compressed.base64) {
            setUploadedImages((prev) => [...prev, compressed]);
          }
        } catch {
          setChatError(`Could not read image ${file.name}.`);
        }
      } else {
        setChatError(
          `Unsupported file "${file.name}". Drop a .fm save file or screenshot image.`
        );
      }
    }
  };

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
    setUploadedImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleRemoveFmFile = (id: string) => {
    setAttachedFmFiles((prev) => prev.filter((f) => f.id !== id));
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
  const preFlightSignature = activePreFlightValidation
    ? `${activePreFlightValidation.missingFields.join(',')}:${currentSaveDate}:${players.length}`
    : null;
  const showPreFlightWarningBanner = Boolean(
    activePreFlightValidation &&
      !activePreFlightValidation.valid &&
      dismissedPreFlightSignature !== preFlightSignature
  );
  const showSyncStatusControl = hasLoadedSave || hasTimingOrNotes;

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
        <div className="p-6 sm:p-10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/60 text-center space-y-6">
          <div className="space-y-2.5 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Football Manager 27 · Patch 27.1.0 Ready
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Your FM27 Tactical Command Hub
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Drop your <span className="font-mono text-emerald-300">.fm</span> save
              file to unlock your live squad analytics, dual-phase IP/OOP pitch
              builder, smart transfer audit, backroom staff ratings, and AI
              tactical co-pilot.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <label
              htmlFor="welcome-fm-upload"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer transition"
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

            <label
              htmlFor="fm-fast-sync-welcome-toggle"
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-medium rounded-xl border cursor-pointer transition select-none ${
                fastSync
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
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
                className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
              />
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Fast Sync (Quick Preview)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-left">
            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Shield className="w-4 h-4" />
                Live Dual-Phase Tactics
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Starts on your last-match XI with separate IP/OOP roles, corners, and rest-defence checks.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                <Briefcase className="w-4 h-4" />
                Transfers &amp; Scouting
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Contract horizons, wage savings, youth promotion, and 500-target Club DNA scouting.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <MessageSquare className="w-4 h-4" />
                AI Tactical Analyst
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ask matchday questions or drop screenshots for instant Playbook v2.0 advice.
              </p>
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {players.length > 0
                  ? `${clubName && clubName !== '--' ? clubName : 'Club'} · ${players.length} players · ${matches.length} matches`
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
              className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-base md:text-[11px] font-medium bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="deep_high">Deep Analyst</option>
              <option value="max_xhigh">Max Synthesis</option>
              <option value="fast_lite">Fast Co-Pilot</option>
            </select>

            {showSyncStatusControl && (
              <button
                type="button"
                onClick={() => setShowSyncDetails((v) => !v)}
                className={`min-h-[44px] md:min-h-[32px] inline-flex items-center gap-1 px-2.5 md:px-2 py-1 text-xs md:text-[11px] font-medium rounded-lg border cursor-pointer transition whitespace-nowrap ${
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
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400"
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
                  className="min-h-[44px] md:min-h-[32px] inline-flex items-center gap-1 px-2.5 md:px-2 py-1 text-xs md:text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white bg-emerald-500/10 dark:bg-slate-900 border border-emerald-500/35 rounded-lg cursor-pointer transition whitespace-nowrap"
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
                <button
                  type="button"
                  onClick={() => {
                    clearClubChatHistory(chatClubKey);
                    setTurns([]);
                    setChatError(null);
                    setChatFallbackNotice(null);
                  }}
                  className="min-h-[44px] md:min-h-[32px] px-2.5 md:px-2 py-1 text-xs md:text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Clear Chat
                </button>
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
                <p className="text-[11px] text-amber-100/90 leading-relaxed">
                  {activePreFlightValidation.warningMessage}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <label
                htmlFor="chat-multi-file-upload"
                className="min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1 px-3 sm:px-2.5 py-1 text-xs sm:text-[11px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer transition whitespace-nowrap"
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
                className={`px-2 py-1 rounded-lg border text-[10px] flex items-center gap-1.5 min-w-0 ${
                  field.informational
                    ? 'bg-slate-900/80 border-slate-700 text-slate-300'
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
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/80 space-y-2.5 text-[11px]">
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded cursor-pointer transition"
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
                          ? 'bg-slate-900/90 border-slate-800 text-slate-300'
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
                    <span className="font-mono text-[10px] text-slate-400 truncate">
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

      {/* MOBILE HUB VIEW SPLIT: Analyst Chat | Save Journey (< md only) */}
      <div
        role="tablist"
        aria-label="Mobile Hub view"
        className="md:hidden px-3.5 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/50"
      >
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
          <button
            type="button"
            role="tab"
            aria-selected={mobileHubView === 'chat'}
            onClick={() => setMobileHubView('chat')}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              mobileHubView === 'chat'
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Analyst Chat</span>
            {turns.length > 0 && (
              <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] leading-none text-emerald-700 dark:text-emerald-300 tabular-nums">
                {turns.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileHubView === 'journey'}
            onClick={() => setMobileHubView('journey')}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              mobileHubView === 'journey'
                ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Save Journey</span>
            {latestJourneyReport && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-400 shrink-0"
              />
            )}
          </button>
        </div>
      </div>

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
              className="min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/90 hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Scrollable Chat Feed (bounded dvh height so mobile page adapts to browser bars & keyboard) */}
        {(turns.length > 0 || isSending) && (
          <div className="space-y-3 max-h-[52dvh] md:max-h-[55dvh] overflow-y-auto pr-1">
            {turns.map((turn) => {
              if (turn.role === 'user') {
                return (
                  <div
                    key={turn.id}
                    className="ml-auto max-w-2xl p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-emerald-400 mb-1">
                      <span>{displayManagerLabel}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        {turn.imageNames && turn.imageNames.length > 0 && (
                          <span className="truncate">
                            {turn.imageNames.join(', ')}
                          </span>
                        )}
                        {turn.userText && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(turn.id, formatTurnForCopy(turn))
                            }
                            title="Copy message"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800/70 text-emerald-200 transition cursor-pointer shrink-0"
                          >
                            {copiedId === turn.id ? (
                              <>
                                <Check className="w-3 h-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">
                      {turn.userText}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={turn.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      Tactical Analyst{turn.screenDetected ? ` · ${turn.screenDetected}` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      {turn.inGameDate && turn.inGameDate !== '--' && (
                        <span className="text-[10px] font-mono text-slate-500">
                          {turn.inGameDate}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(turn.id, formatTurnForCopy(turn))
                        }
                        title="Copy this Analyst reply"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-200/80 dark:bg-slate-800 hover:bg-emerald-500/20 text-slate-700 dark:text-slate-200 hover:text-emerald-300 border border-slate-300 dark:border-slate-700 transition cursor-pointer"
                      >
                        {copiedId === turn.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {turn.playerUpdatesApplied &&
                    turn.playerUpdatesApplied.length > 0 && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          Updated Squad:{' '}
                          <strong>
                            {turn.playerUpdatesApplied.slice(0, 8).join(', ')}
                            {turn.playerUpdatesApplied.length > 8
                              ? ` (+${turn.playerUpdatesApplied.length - 8} more)`
                              : ''}
                          </strong>
                        </span>
                      </div>
                    )}

                  {turn.analysisMarkdown && (() => {
                    const check = checkFm27ResponseWarnings(turn.analysisMarkdown);
                    if (check.passed) return null;
                    return (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span className="min-w-0 break-words">Notice: {check.warnings.join(' · ')}</span>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed min-w-0 break-words">
                    {(turn.analysisMarkdown || '')
                      .split('\n')
                      .map((rawLine, lineIdx) => {
                        const line = rawLine.trim();
                        if (!line) return <div key={lineIdx} className="h-1" />;

                        const renderInlineBold = (text: string) => {
                          const parts = text.split(/(\*\*[^*]+\*\*)/g);
                          return parts.map((part, pIdx) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return (
                                <strong
                                  key={pIdx}
                                  className="font-semibold text-slate-950 dark:text-white"
                                >
                                  {part.slice(2, -2)}
                                </strong>
                              );
                            }
                            return <span key={pIdx}>{part}</span>;
                          });
                        };

                        if (line.startsWith('### ')) {
                          return (
                            <h3
                              key={lineIdx}
                              className="text-sm font-bold text-emerald-700 dark:text-emerald-400 pt-1"
                            >
                              {renderInlineBold(line.replace(/^###\s+/, ''))}
                            </h3>
                          );
                        }
                        if (line.startsWith('#### ')) {
                          return (
                            <h4
                              key={lineIdx}
                              className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100 pt-1.5"
                            >
                              {renderInlineBold(line.replace(/^####\s+/, ''))}
                            </h4>
                          );
                        }
                        if (line.startsWith('* ') || line.startsWith('- ')) {
                          return (
                            <div
                              key={lineIdx}
                              className="flex items-start gap-2 pl-1.5"
                            >
                              <span className="text-emerald-500 font-bold">•</span>
                              <div className="flex-1">
                                {renderInlineBold(line.replace(/^[*-]\s+/, ''))}
                              </div>
                            </div>
                          );
                        }
                        return <p key={lineIdx}>{renderInlineBold(line)}</p>;
                      })}
                  </div>

                  {turn.immediateClicks && turn.immediateClicks.length > 0 && (
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Immediate In-Game Actions
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                        {turn.immediateClicks.map((clickItem, idx) => (
                          <li key={idx}>
                            {clickItem.replace(/^\s*\d+[.)]\s+/, '')}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {turn.followUpQuestions &&
                    turn.followUpQuestions.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                        {turn.followUpQuestions.map((q, qIdx) => (
                          <button
                            key={qIdx}
                            type="button"
                            disabled={isSending}
                            onClick={() => handleSendToAnalyst(undefined, q)}
                            className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:px-2.5 sm:py-1.5 text-[11px] font-medium text-left text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition cursor-pointer disabled:opacity-50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}

            {isSending && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <Sparkles className="w-4 h-4 text-emerald-500 animate-spin motion-reduce:animate-none shrink-0" />
                <span>Analysing your club &amp; preparing tactical advice...</span>
              </div>
            )}
            <div ref={feedEndRef} />
          </div>
        )}

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
          <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words">{chatError}</span>
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
        <form onSubmit={(e) => handleSendToAnalyst(e)} className="space-y-2">
          <div className="flex items-end gap-1.5 sm:gap-2">
            <label
              htmlFor="chat-multi-file-upload"
              title="Import .fm save or attach a screenshot"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer transition shrink-0"
            >
              <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Import .fm / Image</span>
              <input
                id="chat-multi-file-upload"
                type="file"
                accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handlePasteButtonClick}
              title="Paste text or a screenshot from your clipboard"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer transition shrink-0"
            >
              <ClipboardPaste className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="hidden md:inline">Paste</span>
            </button>

            <textarea
              rows={2}
              aria-label="Message your FM27 Tactical Analyst"
              placeholder="Ask tactics, drop a .fm save, or paste text/screenshots..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onPaste={handleTextareaPaste}
              className="flex-1 min-w-0 min-h-[44px] px-3 py-2 text-base md:text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />

            <button
              type="submit"
              disabled={isSending || Boolean(fmDecodeStage)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>

          {hasLoadedSave && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <label
                htmlFor="fm-fast-sync-composer-toggle"
                className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-300"
              >
                <input
                  id="fm-fast-sync-composer-toggle"
                  type="checkbox"
                  checked={fastSync}
                  onChange={(e) => {
                    fastSyncManuallyToggledRef.current = true;
                    setFastSync(e.target.checked);
                  }}
                  className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                />
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Fast Sync on next .fm upload</span>
              </label>
              <span
                className={
                  activePreFlightValidation && !activePreFlightValidation.valid
                    ? 'text-amber-300 font-medium'
                    : undefined
                }
              >
                {activePreFlightValidation && !activePreFlightValidation.valid
                  ? `Sync Status: ${activePreFlightValidation.missingFields.length} core field(s) missing — re-import advised`
                  : serverDecodeAvailable
                    ? 'Server Sync Ready'
                    : 'Local Reader Ready'}
              </span>
            </div>
          )}
        </form>
      </div>

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
                });
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};
