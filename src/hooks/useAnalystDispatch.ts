/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One analyst turn: take the prompt the user just wrote, add the app context,
 * call the tactical analyst, retry or fall back when the gateway misbehaves,
 * parse the answer and write both turns back to the club's chat history.
 *
 * The body is lifted from `AutoSyncWorkspace.tsx` unchanged. The workspace still
 * owns the state it reads and writes and passes it in, so nothing about the
 * request changes.
 */

import React from 'react';
import type { ChatTurnPayload } from '../services/chatStorage';
import { loadClubChatHistory, resolveChatClubKey } from '../services/chatStorage';
import type { DeepJourneyReport } from '../services/saveCache';
import type { MatchLogEntry, PlayerRecord, RecruitmentCase, StaffRecord } from '../types/fm27';
import type {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';
import { mergeAnalystCitations } from '../utils/analystCitations';
import type { PreFlightPayloadValidationResult } from '../utils/analystPayload';
import { parseAnalystChatResponse } from '../utils/analystResponse';
import type { AnalystChatResponse } from '../utils/analystResponse';
import {
  ApiResponseError,
  describeApiFailure,
  isRecoverableAnalystFailure,
  parseJsonApiResponse,
  toApiResponseError,
} from '../utils/apiResponse';
import type { FormationPresetKey } from '../utils/bestXiSolver';
import type { PersistedCustomSlot } from '../services/fmStorage';
import {
  buildCompactFmImportDeltaContext,
  formatAnalystModeLabel,
  resolveChatTurnReasoningMode,
  trimTrailingPeriod,
} from '../utils/fmSaveUiHelpers';
import type { ParsedFmExportResult, ParsedPlayerDelta, SquadMergeResult } from '../utils/fmFileImporter';
import { hubAuthFetch } from '../utils/hubAuth';
import type {
  AnalystReasoningMode,
  ExtendedPlayerAutoUpdate,
} from '../utils/tacticalAnalystContext';

export interface AttachedFmFile {
  id: string;
  name: string;
  kind: 'FM_SAVE_DECODED' | 'FM_EXPORT';
  badgeLabel: string;
  promptContext: string;
  parsedExport?: ParsedFmExportResult;
  initialMergeResult?: SquadMergeResult;
  hydratedSave?: HydratedSaveState;
}

export interface AnalystDispatchParams {
promptText: string;
  imagesToSend: Array<{ base64: string; mimeType: string; name: string }>;
  fmFilesToSend: AttachedFmFile[];
  journeyReportOverride?: DeepJourneyReport | null;
  isJourneyComparison?: boolean;
  reasoningModeOverride?: AnalystReasoningMode;
}

export interface AnalystDispatchOptions {
  activeShape?: FormationPresetKey;
  analystAbortRef: React.MutableRefObject<AbortController | null>;
  applyToAnalystOnly?: boolean;
  balance?: string;
  chatClubKeyRef: React.MutableRefObject<string>;
  clubName?: string;
  currentSaveDate: string;
  customSlots?: PersistedCustomSlot[];
  hydratedFmSave?: HydratedSaveState | null;
  latestJourneyReport?: DeepJourneyReport | null;
  leagueStandingSub?: string;
  liveGovernance?: ClubGovernanceState | null;
  liveLastMatchTactic?: LastMatchTacticBlueprint | null;
  managerName?: string;
  matches: MatchLogEntry[];
  nextEventNum: number;
  nextFixture?: string;
  onAddMatch: (match: MatchLogEntry) => void;
  onApplyPlayerUpdates?: (updates: ExtendedPlayerAutoUpdate[]) => void;
  onBulkMergePlayers?: (
    parsedPlayers: ParsedPlayerDelta[]
  ) => Promise<SquadMergeResult> | SquadMergeResult;
  onUpdateSaveDate?: (date: string) => void;
  players: PlayerRecord[];
  reasoningMode: AnalystReasoningMode;
  recruitmentCases?: RecruitmentCase[];
  setChatError: React.Dispatch<React.SetStateAction<string | null>>;
  setChatFallbackNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setDismissedPreFlightSignature: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSending: React.Dispatch<React.SetStateAction<boolean>>;
  setPreFlightDispatchValidation: React.Dispatch<
    React.SetStateAction<PreFlightPayloadValidationResult | null>
  >;
  staff?: StaffRecord[];
  trackedTargets?: RecruitmentTarget[];
  turns: ChatTurnPayload[];
  updateTurnsForClub: (
    targetClubKey: string,
    action: React.SetStateAction<ChatTurnPayload[]>
  ) => void;
  wageSpend?: string;
}

export type AnalystDispatch = (params: AnalystDispatchParams) => Promise<void>;

export function useAnalystDispatch(options: AnalystDispatchOptions): AnalystDispatch {
  const {
    activeShape,
    analystAbortRef,
    applyToAnalystOnly,
    balance,
    chatClubKeyRef,
    clubName,
    currentSaveDate,
    customSlots,
    hydratedFmSave = null,
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
  } = options;

  return async (params: AnalystDispatchParams): Promise<void> => {
    const {
      promptText,
      imagesToSend,
      fmFilesToSend,
      journeyReportOverride,
      isJourneyComparison,
      reasoningModeOverride,
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

    const newlyAttachedHydratedSave =
      fmFilesToSend.find((f) => f.hydratedSave)?.hydratedSave ?? null;
    const latestHydratedSave = newlyAttachedHydratedSave || hydratedFmSave;

    const combinedFileContextParts = fmFilesToSend.map((f) => {
      if (f.kind === 'FM_SAVE_DECODED' && f.hydratedSave) {
        return buildCompactFmImportDeltaContext({
          fileName: f.name,
          clubName: f.hydratedSave.decodedPayload.meta.clubName,
          saveDateLabel: f.hydratedSave.saveDateLabel,
          changedPlayers: f.hydratedSave.changedPlayers,
          removedPlayers: f.hydratedSave.removedPlayers,
          newMatchesCount: f.hydratedSave.newMatchesCount,
          extractionWarnings: f.hydratedSave.decodedPayload.extractionWarnings,
        });
      }
      return f.promptContext;
    });
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

    // Always write turns under the hydrated club key so fresh .fm save imports
    // never lose their user prompt or Analyst reply when clubName updates mid-flight.
    const targetClubKey = resolveChatClubKey(
      effectiveClubName,
      latestHydratedSave?.decodedPayload?.meta?.clubUid ?? null
    );
    const priorTurnsForHistory =
      targetClubKey === chatClubKeyRef.current
        ? turns
        : loadClubChatHistory(targetClubKey);

    const userTurn: ChatTurnPayload = {
      id: `user-${Date.now()}`,
      role: 'user',
      userText: finalPrompt,
      imageNames: attachedNames,
    };

    const requestAbort =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    analystAbortRef.current?.abort();
    analystAbortRef.current = requestAbort;

    updateTurnsForClub(targetClubKey, (prev) => [...prev, userTurn]);
    setIsSending(true);
    setChatError(null);
    setChatFallbackNotice(null);

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
        sourceCitations: offlineData.sourceCitations,
        chronicleTitle: offlineData.chronicleTitle,
        chronicleOutcomeMetric: offlineData.chronicleOutcomeMetric,
        eventNumber: nextEventNum,
        playerUpdatesApplied: [],
      };
      updateTurnsForClub(targetClubKey, (prev) => [...prev, offlineTurn]);
    };

    try {
      const { buildLiveTacticalAnalystContext, buildConversationTranscript } =
        await import('../utils/tacticalAnalystContext');
      const { runPreFlightAnalystValidation } = await import(
        '../utils/analystPayload'
      );
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

      const historyForApi = buildConversationTranscript(priorTurnsForHistory, 6);

      const isFmSaveImportTurn = fmFilesToSend.some(
        (f) => f.kind === 'FM_SAVE_DECODED'
      );
      const effectiveReasoningMode = resolveChatTurnReasoningMode(
        reasoningMode,
        {
          isFmSaveImport: isFmSaveImportTurn,
          isJourneyComparison,
          explicitOverride: reasoningModeOverride,
        }
      );

      const requestPayload = {
        message: finalPrompt,
        history: historyForApi,
        images: imagesToSend,
        importedFileContext: importedFileContext || undefined,
        liveAppContext,
        reasoningMode: effectiveReasoningMode,
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
          const response = await hubAuthFetch('/api/fm27/tactical-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestPayload, reasoningMode: mode }),
            signal: requestAbort?.signal,
          });
          return await parseJsonApiResponse<unknown>(
            response,
            'Failed to get Tactical Analyst response'
          );
        } catch (err: unknown) {
          if (requestAbort?.signal.aborted) {
            throw err;
          }
          throw toApiResponseError(err);
        }
      };

      const isDeepAnalystMode =
        effectiveReasoningMode === 'deep_high' ||
        effectiveReasoningMode === 'max_xhigh';
      const primaryModeLabel = formatAnalystModeLabel(effectiveReasoningMode);

      let data: AnalystChatResponse | null = null;
      let failure: ApiResponseError | null = null;
      try {
        data = parseAnalystChatResponse(await postTacticalChat(effectiveReasoningMode));
      } catch (firstErr) {
        if (requestAbort?.signal.aborted) {
          updateTurnsForClub(targetClubKey, (prev) =>
            prev.filter((t) => t.id !== userTurn.id)
          );
          setChatFallbackNotice(null);
          return;
        }
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
          if (requestAbort?.signal.aborted) {
            updateTurnsForClub(targetClubKey, (prev) =>
              prev.filter((t) => t.id !== userTurn.id)
            );
            setChatFallbackNotice(null);
            return;
          }
          try {
            data = parseAnalystChatResponse(await postTacticalChat(effectiveReasoningMode));
            failure = null;
          } catch (retryErr) {
            if (requestAbort?.signal.aborted) {
              updateTurnsForClub(targetClubKey, (prev) =>
                prev.filter((t) => t.id !== userTurn.id)
              );
              setChatFallbackNotice(null);
              return;
            }
            failure = toApiResponseError(retryErr);
          }
        }
      }

      if (failure) {
        const primaryDetail = trimTrailingPeriod(describeApiFailure(failure));
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
        // On HTTP 429/503 the server already ran retries and failed over across
        // Deep -> Fast -> Emergency models. Skip a redundant second client HTTP
        // round-trip so the user gets an instant Offline Briefing instead of waiting twice.
        const shouldClientRetryFast =
          isDeepAnalystMode &&
          isRecoverableAnalystFailure(failure) &&
          failure.status !== 429 &&
          failure.status !== 503;
        if (shouldClientRetryFast) {
          setChatFallbackNotice(
            `${primaryModeLabel} failed — ${primaryDetail}. Automatically retrying with Fast Co-Pilot…`
          );
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (requestAbort?.signal.aborted) {
            updateTurnsForClub(targetClubKey, (prev) =>
              prev.filter((t) => t.id !== userTurn.id)
            );
            setChatFallbackNotice(null);
            return;
          }
          try {
            data = parseAnalystChatResponse(await postTacticalChat('fast_lite'));
            failure = null;
            fastSucceeded = true;
          } catch (fastErr) {
            if (requestAbort?.signal.aborted) {
              updateTurnsForClub(targetClubKey, (prev) =>
                prev.filter((t) => t.id !== userTurn.id)
              );
              setChatFallbackNotice(null);
              return;
            }
            const fastFailure = toApiResponseError(fastErr);
            failure = fastFailure;
            fastDetail = trimTrailingPeriod(describeApiFailure(fastFailure));
          }
        }

        if (failure) {
          if (isRecoverableAnalystFailure(failure)) {
            setChatFallbackNotice(
              fastDetail
                ? `${primaryModeLabel} failed — ${primaryDetail}. Fast Co-Pilot also failed — ${fastDetail}. Showing the local offline briefing instead.`
                : `Analyst unavailable — ${primaryDetail}. Showing the local offline briefing instead.`
            );
            await appendOfflineBriefing('AI service unavailable / offline');
            return;
          }
          updateTurnsForClub(targetClubKey, (prev) =>
            prev.filter((t) => t.id !== userTurn.id)
          );
          setChatFallbackNotice(null);
          setChatError(`${primaryDetail}.`);
          return;
        }

        if (fastSucceeded) {
          setChatFallbackNotice(
            `${primaryModeLabel} failed — ${primaryDetail}. Fast Co-Pilot answered instead.`
          );
        }
      }

      const assignedEventNum = nextEventNum;

      if (!data) {
        updateTurnsForClub(targetClubKey, (prev) =>
          prev.filter((t) => t.id !== userTurn.id)
        );
        setChatFallbackNotice(null);
        setChatError('The Analyst returned no usable answer. Try again.');
        return;
      }

      if (data.issues.length > 0) {
        console.warn('Analyst response repaired before use:', data.issues.join('; '));
      }

      if (data.inGameDate && data.inGameDate !== '--' && onUpdateSaveDate) {
        onUpdateSaveDate(data.inGameDate);
      }

      const appliedPlayerNames: string[] = [...bulkUpdatedPlayerNames];
      if (data.playerUpdates.length > 0 && onApplyPlayerUpdates) {
        onApplyPlayerUpdates(data.playerUpdates);
        for (const pu of data.playerUpdates) {
          if (!appliedPlayerNames.includes(pu.name)) appliedPlayerNames.push(pu.name);
        }
      }

      const alreadyHydratedMatch = fmFilesToSend.some(
        (f) => f.kind === 'FM_SAVE_DECODED'
      );
      if (!alreadyHydratedMatch && data.isMatchResult && data.matchFields) {
        const mf = data.matchFields;
        const newMatch: MatchLogEntry = {
          id: `chat-match-${Date.now()}`,
          eventNumber: assignedEventNum,
          date: data.inGameDate || effectiveSaveDate,
          competition: mf.competition || 'Competitive Match',
          opponent: mf.opponent,
          venue: mf.venue,
          result: mf.result,
          score: mf.score,
          xGFor: mf.xGFor,
          xGAgainst: mf.xGAgainst,
          possession: mf.possession,
          passCompletion: mf.passCompletion,
          shotsFor: mf.shotsFor || '—',
          shotsAgainst: mf.shotsAgainst || '—',
          cccFor: mf.cccFor,
          cccAgainst: mf.cccAgainst,
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
        immediateClicks: data.immediateClicks,
        followUpQuestions: data.followUpQuestions,
        sourceCitations: mergeAnalystCitations(
          data.sourceCitations,
          data.analysisMarkdown
        ),
        chronicleTitle: data.chronicleTitle || data.screenDetected,
        chronicleOutcomeMetric: data.chronicleOutcomeMetric || 'Updated',
        eventNumber: assignedEventNum,
        playerUpdatesApplied: appliedPlayerNames,
      };

      updateTurnsForClub(targetClubKey, (prev) => [...prev, assistantTurn]);
    } catch (err: unknown) {
      if (requestAbort?.signal.aborted) {
        updateTurnsForClub(targetClubKey, (prev) =>
          prev.filter((t) => t.id !== userTurn.id)
        );
        setChatFallbackNotice(null);
        return;
      }
      if (err instanceof ApiResponseError) {
        const failureDetail = trimTrailingPeriod(describeApiFailure(err));
        if (isRecoverableAnalystFailure(err)) {
          setChatFallbackNotice(
            `Analyst unavailable — ${failureDetail}. Showing the local offline briefing instead.`
          );
          await appendOfflineBriefing('AI service unavailable / offline');
          return;
        }
        updateTurnsForClub(targetClubKey, (prev) =>
          prev.filter((t) => t.id !== userTurn.id)
        );
        setChatFallbackNotice(null);
        setChatError(`${failureDetail}.`);
        return;
      }
      updateTurnsForClub(targetClubKey, (prev) =>
        prev.filter((t) => t.id !== userTurn.id)
      );
      setChatFallbackNotice(null);
      setChatError(
        err instanceof Error
          ? err.message
          : 'Error communicating with FM27 Tactical Analyst'
      );
    } finally {
      if (analystAbortRef.current === requestAbort) {
        analystAbortRef.current = null;
      }
      setIsSending(false);
    }
  };
}
