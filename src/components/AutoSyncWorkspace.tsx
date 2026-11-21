import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Upload,
  Sparkles,
  CloudUpload,
  X,
  CheckCircle2,
  AlertCircle,
  Settings2,
  LogOut,
  RefreshCw,
  FileArchive,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  StaffRecord,
} from '../types/fm27';
import { verifyFm27Accuracy } from '../data/fm27KnowledgeBase';
import {
  parseFmStructuredExport,
  ParsedFmExportResult,
  ParsedPlayerDelta,
  SquadMergeResult,
} from '../utils/fmFileImporter';
import {
  DecodedFmSavePayload,
  HydratedSaveState,
  shouldDefaultFastSync,
  formatStepTimingLabel,
} from '../utils/fmSaveHydrator';
import {
  decodeFmSaveFile,
  cancelFmSaveDecode,
  checkServerDecodeStatus,
  FmSaveProgressStage,
  FmImportScope,
} from '../services/fmSaveReader';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  fetchGoogleDocInfo,
  appendEventToGoogleDoc,
  fetchGoogleSheetMetadata,
  appendRowToGoogleSheet,
  GoogleDocInfo,
  GoogleSheetMetadata,
} from '../services/googleWorkspace';
import {
  AnalystReasoningMode,
  buildConversationTranscript,
  buildLiveTacticalAnalystContext,
  ExtendedPlayerAutoUpdate,
} from '../utils/tacticalAnalystContext';
import {
  parseJsonApiResponse,
  sanitizeReaderNotes,
} from '../utils/apiResponse';

export type PlayerAutoUpdate = ExtendedPlayerAutoUpdate;

interface AttachedFmFile {
  id: string;
  name: string;
  kind: 'FM_SAVE_DECODED' | 'FM_EXPORT';
  badgeLabel: string;
  promptContext: string;
  parsedExport?: ParsedFmExportResult;
  hydratedSave?: HydratedSaveState;
}

export interface ChatTurnPayload {
  id: string;
  role: 'user' | 'assistant';
  userText?: string;
  imageNames?: string[];
  screenDetected?: string;
  inGameDate?: string;
  analysisMarkdown?: string;
  immediateClicks?: string[];
  followUpQuestions?: string[];
  targetSheetTable?: string;
  chronicleTitle?: string;
  chronicleOutcomeMetric?: string;
  docEventBulletBlock?: string;
  sheetRowValues?: string[];
  eventNumber?: number;
  playerUpdatesApplied?: string[];
}

interface AutoSyncWorkspaceProps {
  matches: MatchLogEntry[];
  players: PlayerRecord[];
  staff?: StaffRecord[];
  recruitmentCases?: RecruitmentCase[];
  currentSaveDate: string;
  clubName?: string;
  managerName?: string;
  nextFixture?: string;
  leagueStandingSub?: string;
  wageSpend?: string;
  balance?: string;
  hydratedFmSave?: HydratedSaveState | null;
  onUpdateSaveDate?: (date: string) => void;
  onAddMatch: (match: MatchLogEntry) => void;
  onApplyPlayerUpdates?: (updates: PlayerAutoUpdate[]) => void;
  onBulkMergePlayers?: (parsedPlayers: ParsedPlayerDelta[]) => SquadMergeResult;
  onApplyDecodedFmSave?: (decoded: DecodedFmSavePayload) => HydratedSaveState;
}

interface PendingWorkspaceMutation {
  eventNumber: number;
  title: string;
  docEventBulletBlock: string;
  sheetRowValues: string[];
  chronicleRowValues: string[];
}

export const AutoSyncWorkspace: React.FC<AutoSyncWorkspaceProps> = ({
  matches,
  players,
  staff = [],
  recruitmentCases = [],
  currentSaveDate: saveDateProp,
  clubName,
  managerName,
  nextFixture = '--',
  leagueStandingSub = 'Awaiting .fm save import',
  wageSpend = '--',
  balance = '--',
  hydratedFmSave = null,
  onUpdateSaveDate,
  onAddMatch,
  onApplyPlayerUpdates,
  onBulkMergePlayers,
  onApplyDecodedFmSave,
}) => {
  const latestMatch = matches[0];
  const nextEventNum = (latestMatch?.eventNumber || matches.length) + 1;
  const currentSaveDate =
    saveDateProp && saveDateProp !== '--'
      ? saveDateProp
      : latestMatch?.date || '--';

  const [turns, setTurns] = useState<ChatTurnPayload[]>([]);
  const [importScope, setImportScope] =
    useState<FmImportScope>('managed_club_only');
  const [serverDecodeAvailable, setServerDecodeAvailable] = useState<boolean | null>(
    null
  );
  const fastSyncManuallyToggledRef = useRef<boolean>(false);
  const [fastSync, setFastSync] = useState<boolean>(false);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [showReaderNotes, setShowReaderNotes] = useState<boolean>(false);
  const [lastStepTimingsMs, setLastStepTimingsMs] = useState<Record<string, number>>({});
  const [reasoningMode, setReasoningMode] =
    useState<AnalystReasoningMode>('deep_high');
  const [messageInput, setMessageInput] = useState('');
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ base64: string; mimeType: string; name: string }>
  >([]);
  const [attachedFmFiles, setAttachedFmFiles] = useState<AttachedFmFile[]>([]);
  const [fmDecodeStage, setFmDecodeStage] =
    useState<FmSaveProgressStage | null>(null);
  const [decodeElapsedSec, setDecodeElapsedSec] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    checkServerDecodeStatus().then((status) => {
      if (!active) return;
      setServerDecodeAvailable(status.serverDecodeAvailable);
      if (!fastSyncManuallyToggledRef.current) {
        // Keep Full Sync (fastSync=false) whenever server decoding is available;
        // only auto-enable Fast Sync on mobile when falling back to browser Pyodide.
        if (status.serverDecodeAvailable) {
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
    const timer = window.setInterval(() => {
      setDecodeElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [Boolean(fmDecodeStage)]);

  // Collapsible Google Workspace Connection Settings
  const [showGoogleSettings, setShowGoogleSettings] = useState(false);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [docUrlOrId, setDocUrlOrId] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('fm27_command_hub_doc_id') ||
        localStorage.getItem('kvv_zelzate_doc_id') ||
        ''
      );
    } catch {
      return '';
    }
  });
  const [sheetUrlOrId, setSheetUrlOrId] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('fm27_command_hub_sheet_id') ||
        localStorage.getItem('kvv_zelzate_sheet_id') ||
        ''
      );
    } catch {
      return '';
    }
  });

  const [docInfo, setDocInfo] = useState<GoogleDocInfo | null>(null);
  const [sheetMeta, setSheetMeta] = useState<GoogleSheetMetadata | null>(null);
  const [selectedMatchLogTab, setSelectedMatchLogTab] = useState<string>('');
  const [selectedChroniclesTab, setSelectedChroniclesTab] = useState<string>('');
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);

  const [pendingMutation, setPendingMutation] =
    useState<PendingWorkspaceMutation | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
      }
    );
    return () => unsub();
  }, []);

  const handleDocUrlChange = (val: string) => {
    setDocUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_doc_id', val);
    } catch {
      // ignore
    }
  };

  const handleSheetUrlChange = (val: string) => {
    setSheetUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_sheet_id', val);
    } catch {
      // ignore
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setWorkspaceError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setAccessToken(res.accessToken);
        setShowGoogleSettings(true);
        setWorkspaceStatus(
          `Signed in as ${res.user.email || res.user.displayName || 'Google User'}. Paste your Google Sheet & Doc URLs below once to enable direct 1-click updates.`
        );
      }
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In failed. Please try again.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setGoogleUser(null);
    setAccessToken(null);
    setDocInfo(null);
    setSheetMeta(null);
    setWorkspaceStatus('Signed out of Google Workspace.');
  };

  const handleVerifyFiles = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) {
      setWorkspaceError('Please click "Sign in with Google" first.');
      return;
    }
    if (!docUrlOrId.trim() && !sheetUrlOrId.trim()) {
      setWorkspaceError(
        'Paste your Google Doc URL/ID or Google Sheet URL/ID first.'
      );
      return;
    }

    setIsSyncingWorkspace(true);
    setWorkspaceError(null);
    setWorkspaceStatus(null);

    try {
      const messages: string[] = [];
      if (docUrlOrId.trim()) {
        const info = await fetchGoogleDocInfo(docUrlOrId, token);
        setDocInfo(info);
        messages.push(`Connected Doc: "${info.title}"`);
      }
      if (sheetUrlOrId.trim()) {
        const meta = await fetchGoogleSheetMetadata(sheetUrlOrId, token);
        setSheetMeta(meta);
        if (meta.sheetNames.length > 0) {
          const matchTab =
            meta.sheetNames.find((n) => /1g|match|tactic|master/i.test(n)) ||
            meta.sheetNames[0];
          const chronTab =
            meta.sheetNames.find((n) => /chronicle|tab 10|history/i.test(n)) ||
            meta.sheetNames[meta.sheetNames.length - 1];
          setSelectedMatchLogTab(matchTab);
          setSelectedChroniclesTab(chronTab);
        }
        messages.push(
          `Connected Sheet: "${meta.title}" (${meta.sheetNames.length} tabs)`
        );
      }
      setWorkspaceStatus(messages.join(' · '));
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to inspect Google Doc or Sheet.'
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  };

  const handleRequestDirectPush = (payload: PendingWorkspaceMutation) => {
    setWorkspaceError(null);
    if (!accessToken) {
      setShowGoogleSettings(true);
      setWorkspaceError(
        'Click "Sign in with Google" and paste your Sheet/Doc link once to push directly.'
      );
      return;
    }
    if (!docUrlOrId.trim() && !sheetUrlOrId.trim()) {
      setShowGoogleSettings(true);
      setWorkspaceError(
        'Paste your Google Sheet URL or Google Doc URL in the connection drawer above.'
      );
      return;
    }
    setPendingMutation(payload);
  };

  const executeConfirmedWorkspaceMutation = async () => {
    if (!pendingMutation) return;
    const cp = pendingMutation;
    setPendingMutation(null);

    const token = accessToken || (await getAccessToken());
    if (!token) {
      setWorkspaceError('Google session expired. Please sign in again.');
      return;
    }

    setIsSyncingWorkspace(true);
    setWorkspaceError(null);
    setWorkspaceStatus(null);

    try {
      const results: string[] = [];

      if (docUrlOrId.trim() && cp.docEventBulletBlock) {
        const res = await appendEventToGoogleDoc(
          docUrlOrId,
          cp.docEventBulletBlock,
          token
        );
        results.push(`Updated Google Doc "${res.title}"`);
      }

      if (sheetUrlOrId.trim()) {
        let matchTab = selectedMatchLogTab;
        let chronTab = selectedChroniclesTab;
        if (!matchTab || !chronTab) {
          const meta = await fetchGoogleSheetMetadata(sheetUrlOrId, token);
          setSheetMeta(meta);
          matchTab =
            meta.sheetNames.find((n) => /1g|match|tactic|master/i.test(n)) ||
            meta.sheetNames[0] ||
            'Sheet1';
          chronTab =
            meta.sheetNames.find((n) => /chronicle|tab 10|history/i.test(n)) ||
            meta.sheetNames[meta.sheetNames.length - 1] ||
            matchTab;
          setSelectedMatchLogTab(matchTab);
          setSelectedChroniclesTab(chronTab);
        }

        if (cp.sheetRowValues && cp.sheetRowValues.length > 0) {
          await appendRowToGoogleSheet(
            sheetUrlOrId,
            matchTab,
            cp.sheetRowValues,
            token
          );
        }

        if (
          chronTab &&
          chronTab !== matchTab &&
          cp.chronicleRowValues &&
          cp.chronicleRowValues.length > 0
        ) {
          await appendRowToGoogleSheet(
            sheetUrlOrId,
            chronTab,
            cp.chronicleRowValues,
            token
          );
          results.push(`Updated Google Sheet tabs "${matchTab}" & "${chronTab}"`);
        } else {
          results.push(`Updated Google Sheet tab "${matchTab}"`);
        }
      }

      setWorkspaceStatus(results.join(' · '));
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to sync with Google Docs / Sheets.'
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  };

  const dispatchToAnalyst = async (params: {
    promptText: string;
    imagesToSend: Array<{ base64: string; mimeType: string; name: string }>;
    fmFilesToSend: AttachedFmFile[];
  }) => {
    const { promptText, imagesToSend, fmFilesToSend } = params;

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
        const mergeRes = onBulkMergePlayers(fmFile.parsedExport.parsedPlayers);
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
      rawFileContext.length > 60000
        ? `${rawFileContext.slice(0, 60000)}\n...[truncated to keep request fast]`
        : rawFileContext;

    const attachedNames = [
      ...fmFilesToSend.map((f) => f.name),
      ...imagesToSend.map((img) => img.name),
    ];

    const finalPrompt =
      promptText ||
      `Imported ${attachedNames.join(', ')} — update everything in the Squad Database, Match Log & Master Sheet, analyze every result and attribute against Bobby Dean's Playbook v2.0, and produce a complete tactical & rotation plan from the current in-game date (${detectedExportDate || currentSaveDate}).`;

    const userTurn: ChatTurnPayload = {
      id: `user-${Date.now()}`,
      role: 'user',
      userText: finalPrompt,
      imageNames: attachedNames,
    };

    setTurns((prev) => [...prev, userTurn]);
    setIsSending(true);

    try {
      const latestHydratedSave =
        fmFilesToSend.find((f) => f.hydratedSave)?.hydratedSave ||
        hydratedFmSave;

      const effectivePlayers =
        latestHydratedSave && latestHydratedSave.updatedSquad.length > 0
          ? latestHydratedSave.updatedSquad
          : players;

      const effectiveMatches =
        latestHydratedSave && latestHydratedSave.updatedMatches.length > 0
          ? latestHydratedSave.updatedMatches
          : matches;

      const effectiveClubName =
        latestHydratedSave?.decodedPayload.meta.clubName ||
        (clubName && clubName !== '--' ? clubName : '--');

      const effectiveManagerName =
        latestHydratedSave?.decodedPayload.meta.managerName ||
        (managerName && managerName !== '--' ? managerName : '--');

      const effectiveSaveDate =
        detectedExportDate ||
        latestHydratedSave?.saveDateLabel ||
        currentSaveDate;

      const effectiveNextFixture =
        latestHydratedSave?.nextFixtureLabel || nextFixture;

      const effectiveStandingSub =
        latestHydratedSave?.leagueStandingLabel || leagueStandingSub;

      const effectiveWageSpend =
        latestHydratedSave?.wageComplianceLabel || wageSpend;

      const effectiveBalance = latestHydratedSave?.balanceLabel || balance;

      const liveAppContext = buildLiveTacticalAnalystContext({
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
        userQuery: finalPrompt,
      });

      const historyForApi = buildConversationTranscript(turns, 14);

      const res = await fetch('/api/fm27/tactical-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await parseJsonApiResponse<any>(
        res,
        'Failed to get Tactical Analyst response'
      );

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

      // Automatically add completed match if explicitly reported in screenshot/chat (never fabricate missing stats)
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
          competition: mf.competition || 'League / Cup',
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
          goalTimeline: mf.goalTimeline || 'Logged from Data Hub screenshot',
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
        targetSheetTable: data.targetSheetTable || 'TABLE_1G_MATCH_LOG',
        chronicleTitle: data.chronicleTitle || data.screenDetected,
        chronicleOutcomeMetric: data.chronicleOutcomeMetric || 'Updated',
        docEventBulletBlock: data.docEventBulletBlock,
        sheetRowValues: data.sheetRowValues || [],
        eventNumber: assignedEventNum,
        playerUpdatesApplied: appliedPlayerNames,
      };

      setTurns((prev) => [...prev, assistantTurn]);
    } catch (err: unknown) {
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

    for (const file of files) {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.fm')) {
        try {
          setExtractionWarnings([]);
          setLastStepTimingsMs({});
          setFmDecodeStage({
            stage: 'read',
            label:
              serverDecodeAvailable === false
                ? `Starting local Pyodide 3.14 + fmsave 0.14.1 reader for ${file.name}${fastSync ? ' (Fast Sync)' : ''}...`
                : `Uploading & decoding full save on server (${file.name})...`,
          });
          const decoded = await decodeFmSaveFile(
            file,
            (stage) => {
              setFmDecodeStage(stage);
            },
            { scope: importScope, fastSync }
          );
          setFmDecodeStage(null);

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
            ? onApplyDecodedFmSave(decoded)
            : undefined;

          const decodedEntry: AttachedFmFile = {
            id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'FM_SAVE_DECODED',
            badgeLabel: `${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Decoded'} · ${decoded.players.length} players, ${decoded.playedMatches.length} matches)`,
            promptContext:
              hydrated?.analystPromptContext || JSON.stringify(decoded.meta),
            hydratedSave: hydrated,
          };

          if (!messageInput.trim()) {
            await dispatchToAnalyst({
              promptText: `I just imported my live .fm save file ${file.name} (Managed Club: ${decoded.meta.clubName} · Manager: ${decoded.meta.managerName} · In-Game Date: ${decoded.meta.gameDateDmy || 'Live'}). Everything has been populated in the app — audit our current squad, played results, league standing, finances, and injuries against Bobby Dean's Playbook v2.0, and give me a tailored tactical, Starting XI, 62m/75m substitution, set-piece, and rotation plan from ${decoded.meta.gameDateDmy || 'today'} forward.`,
              imagesToSend: [],
              fmFilesToSend: [decodedEntry],
            });
          } else {
            setAttachedFmFiles((prev) => [...prev, decodedEntry]);
          }
        } catch (err: unknown) {
          setFmDecodeStage(null);
          if (err instanceof Error && err.message === 'CANCELLED_BY_USER') {
            return;
          }
          setChatError(
            err instanceof Error
              ? err.message
              : `Could not decode ${file.name}. Ensure it is a valid FM26/FM27 .fm save file.`
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
          const text = await file.text();
          const parsed = parseFmStructuredExport(text, file.name);
          if (
            parsed.parsedPlayers.length > 0 &&
            onBulkMergePlayers
          ) {
            onBulkMergePlayers(parsed.parsedPlayers);
          }
          if (parsed.detectedDate && onUpdateSaveDate) {
            onUpdateSaveDate(parsed.detectedDate);
          }
          const countDesc =
            parsed.parsedPlayers.length > 0
              ? `${parsed.parsedPlayers.length} players synced to Squad DB`
              : `${parsed.rowCount} rows parsed`;

          setAttachedFmFiles((prev) => [
            ...prev,
            {
              id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              kind: 'FM_EXPORT',
              badgeLabel: `${file.name} (${parsed.format} · ${countDesc})`,
              promptContext: parsed.promptContext,
              parsedExport: parsed,
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
          `Unsupported file "${file.name}". Drop a .fm save file, FM27 .csv/.html/.rtf export, or screenshot image.`
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
        'Drop your .fm save file, attach a screenshot/export, or type a message first.'
      );
      return;
    }

    setChatError(null);
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

  return (
    <div className="space-y-6">
      {/* Explicit User Confirmation Modal for Google Docs & Sheets Direct Mutations */}
      {pendingMutation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sync-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3
                id="confirm-sync-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Push Event #{pendingMutation.eventNumber} (
                {pendingMutation.title}) to Google Sheet &amp; Doc?
              </h3>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                onClick={() => setPendingMutation(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
              Confirming will write this analysis directly to your linked Google
              Workspace files:
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 list-disc pl-5">
              {docUrlOrId.trim() && (
                <li>
                  Google Doc ({docInfo?.title || 'Linked Doc'}): Insert Event #
                  {pendingMutation.eventNumber} above [INSERT NEXT CHRONOLOGICAL
                  EVENT HERE].
                </li>
              )}
              {sheetUrlOrId.trim() && (
                <li>
                  Google Sheet ({sheetMeta?.title || 'Linked Sheet'}): Append
                  new row to &ldquo;{selectedMatchLogTab || 'Master Tab'}&rdquo;
                  and &ldquo;{selectedChroniclesTab || 'Chronicles Tab'}&rdquo;.
                </li>
              )}
            </ul>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingMutation(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedWorkspaceMutation}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                Confirm &amp; Update Google Files
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE STREAMLINED WORKSPACE: Interactive Back-and-Forth Tactical Co-Pilot */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDropFiles}
        className={`p-6 bg-white dark:bg-slate-900 border rounded-xl space-y-5 transition-colors ${
          isDraggingFile
            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* Top Header + Scope Selector + Compact Google Connection Toggle */}
        <div className="flex flex-col gap-3.5 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {serverDecodeAvailable
                ? 'Bobby Dean Playbook v2.0 + Native Server .FM Full Sync Engine (Python 3 · fmsave · Browser Fallback Ready)'
                : 'Bobby Dean Playbook v2.0 + Local Browser .FM Save Reader (Pyodide 3.14 · fmsave · WORKERFS Zero-Copy)'}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              FM27 Tactical Analyst Chat &amp; Direct .fm Save Sync
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-4xl">
              Drop or select your{' '}
              <span className="font-mono text-emerald-400">.fm</span> save file
              below{' '}
              {serverDecodeAvailable
                ? '(decoded natively on this app server in Full Sync mode — 100% of tables extracted fast on mobile & desktop, temporary files deleted immediately after decode, with automatic browser Pyodide fallback).'
                : '(decoded locally in your browser via Pyodide Web Worker when server decoding is unavailable).'}{' '}
              Automatically extracts your managed club, squad attributes &amp;
              star ratings, season stats, fixtures, league table, tactics,
              finances, and injuries, populates every tab, and builds your
              tactical plan from the current in-game date forward.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full min-w-0">
            {/* Analyst Reasoning Depth Selector */}
            <div className="flex items-center gap-1.5 min-w-0 max-w-full w-full sm:w-auto">
              <label
                htmlFor="analyst-reasoning-mode-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0"
              >
                Analyst Brain:
              </label>
              <select
                id="analyst-reasoning-mode-select"
                aria-label="Analyst Reasoning Depth"
                value={reasoningMode}
                onChange={(e) =>
                  setReasoningMode(e.target.value as AnalystReasoningMode)
                }
                className="min-w-0 flex-1 sm:flex-none max-w-full px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="deep_high">
                  Deep Tactical Reasoning (Gemini 4 High)
                </option>
                <option value="max_xhigh">
                  Max Engine &amp; Squad Synthesis (Gemini 4 XHigh)
                </option>
                <option value="fast_lite">
                  Rapid Touchline Co-Pilot (Flash Lite)
                </option>
              </select>
            </div>

            {/* Scope Selector Before/When Importing */}
            <div className="flex items-center gap-1.5 min-w-0 max-w-full w-full sm:w-auto">
              <label
                htmlFor="fm-import-scope-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0"
              >
                Import Scope:
              </label>
              <select
                id="fm-import-scope-select"
                aria-label="FM Save Import Scope"
                value={importScope}
                onChange={(e) =>
                  setImportScope(e.target.value as FmImportScope)
                }
                className="min-w-0 flex-1 sm:flex-none max-w-full px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="managed_club_only">
                  My Managed Club Only (Fastest for Mobile)
                </option>
                <option value="club_and_division">
                  My Managed Club + Full Division Table
                </option>
              </select>
            </div>

            {!accessToken ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-4 h-4 block shrink-0"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  {googleUser?.email || 'Google Connected'}
                </span>
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGoogleSettings((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {showGoogleSettings
                  ? 'Hide Sheet/Doc Links'
                  : 'Link Google Sheet & Doc'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Context & Conversation Memory Status Strip */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              Active Analyst Context:
            </span>
            <span>
              FM27 Patch 27.1.0 Physics &middot; Playbook v2.0 (All 9 Sections)
            </span>
            <span>&middot;</span>
            {players.length > 0 ? (
              <span className="font-mono text-emerald-400">
                {clubName && clubName !== '--' ? clubName : 'Managed Club'} (
                {players.length} Players, War Room XI, Set-Pieces &amp;{' '}
                {matches.length} Matches Synced)
              </span>
            ) : (
              <span className="font-mono text-amber-400">
                0 Players / 0 Matches (Drop .fm Save to Bind Live Club State)
              </span>
            )}
            <span>&middot;</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {turns.length} Chat Turn{turns.length === 1 ? '' : 's'} in Memory
            </span>
          </div>

          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setChatError(null);
              }}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors"
            >
              Clear Chat Memory
            </button>
          )}
        </div>

        {/* Collapsible One-Time Google Sheet & Doc URL Drawer */}
        {showGoogleSettings && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-5">
                <label
                  htmlFor="google-sheet-url"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Master Google Sheet URL or ID
                </label>
                <input
                  id="google-sheet-url"
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={sheetUrlOrId}
                  onChange={(e) => handleSheetUrlChange(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="lg:col-span-5">
                <label
                  htmlFor="google-doc-url"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Master Google Doc URL or ID (Optional)
                </label>
                <input
                  id="google-doc-url"
                  type="text"
                  placeholder="https://docs.google.com/document/d/.../edit"
                  value={docUrlOrId}
                  onChange={(e) => handleDocUrlChange(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="lg:col-span-2 flex items-end">
                <button
                  type="button"
                  disabled={isSyncingWorkspace}
                  onClick={handleVerifyFiles}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncingWorkspace ? 'animate-spin' : ''}`}
                  />
                  Verify Links
                </button>
              </div>
            </div>

            {sheetMeta && sheetMeta.sheetNames.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label
                    htmlFor="sheet-tab-1g"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Target Tab for Match / Scouting / Tactical Rows:
                  </label>
                  <select
                    id="sheet-tab-1g"
                    value={selectedMatchLogTab}
                    onChange={(e) => setSelectedMatchLogTab(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {sheetMeta.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="sheet-tab-10"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Target Tab for Tab 10 (Chronicles):
                  </label>
                  <select
                    id="sheet-tab-10"
                    value={selectedChroniclesTab}
                    onChange={(e) => setSelectedChroniclesTab(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {sheetMeta.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {workspaceError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{workspaceError}</span>
          </div>
        )}

        {workspaceStatus && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{workspaceStatus}</span>
          </div>
        )}

        {/* Quick One-Click Conversation Starters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
            Quick Prompts:
          </span>
          <button
            type="button"
            disabled={isSending}
            onClick={() =>
              handleSendToAnalyst(
                undefined,
                players.length > 0
                  ? `Give me our complete Pre-Match Tactical Gameplan for ${clubName || 'our managed club'} from ${currentSaveDate} forward (${nextFixture !== '--' ? `Next: ${nextFixture}` : 'next fixture'}), including our best Dual-Phase 4-3-3 Starting XI, Tracking Winger OOP roles, and 62m/75m substitution windows based on our imported squad's Stamina and Condition.`
                  : 'Explain how Bobby Dean’s FM27 Playbook v2.0 Dual-Phase 4-3-3, Tracking Winger OOP flank lock, and 62m/75m 2-window substitution script work in Patch 27.1.0.'
              )
            }
            className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-400 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {players.length > 0
              ? 'Next Fixture Dual-Phase 4-3-3 & 62m/75m Sub Plan'
              : 'How Playbook v2.0 Dual-Phase 4-3-3 Works'}
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={() =>
              handleSendToAnalyst(
                undefined,
                players.length > 0
                  ? `Audit our ${players.length}-man squad at ${clubName || 'our club'} against Playbook v2.0 Section 7 & Section 9: wage budget compliance, highest earners vs minutes played, top star ratings & FM27 engine scores, Set-Piece Aerial Threats (JR + Heading), and 3-player Mentoring group recommendations.`
                  : 'How do we counter a 3-5-2 / 5-3-2 wing-back system or a high-pressing 4-2-3-1 in FM27 without breaking the 3-man midfield Zone 5 guardrail?'
              )
            }
            className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-400 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {players.length > 0
              ? 'Audit Squad Wages, Star Ratings & Set-Piece Threats'
              : 'Countering 3-5-2 Wing-Backs & 4-2-3-1 Presses in FM27'}
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={() =>
              handleSendToAnalyst(
                undefined,
                players.length > 0
                  ? `Rank our squad's top Patch 27.1.0 physical engine outliers (Top Sprint Speed m/s, Vertical Jump Reach, and Stamina Drain) and tell me who should be our A1/A2/A3 corner targets, Left/Right inswinger takers, and D1/D2 recovery defenders.`
                  : 'How does FM27 Patch 27.1.0 weight Pace, Acceleration, Jumping Reach, and Stamina, and how should I set up Attacking & Defending Corners?'
              )
            }
            className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-400 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {players.length > 0
              ? 'Patch 27.1.0 Speed/Jump Leaders & Corner Specialists'
              : 'Patch 27.1.0 Physical Weights & Corner Routines'}
          </button>
          <button
            type="button"
            disabled={isSending}
            onClick={() =>
              handleSendToAnalyst(
                undefined,
                players.length > 0
                  ? `Walk me through our in-match touchline contingency script for ${nextFixture !== '--' ? nextFixture : 'our next match'}: what exact single tweak and shout do we use at 62m and 75m if we are chasing 0-1 vs protecting a 1-0 lead?`
                  : 'What is the exact 62m / 75m touchline contingency script when chasing a goal late vs protecting a 1-goal lead in FM27?'
              )
            }
            className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-400 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            62m / 75m Touchline Contingency Script (Chasing vs Leading)
          </button>
        </div>

        {/* Conversation Feed or Clean "Awaiting .fm Save" Empty State */}
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
          {turns.length === 0 && !isSending && (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-emerald-500/40 text-center space-y-3">
              <FileArchive className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Awaiting .fm Save File — Zero Pre-Filled Club Data Loaded
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                  Drop your Football Manager{' '}
                  <span className="font-mono text-emerald-400">.fm</span> save
                  file anywhere in this workspace or click{' '}
                  <strong>Import .fm Save / Image</strong> below.{' '}
                  {serverDecodeAvailable ? (
                    <>
                      Your save is decoded natively on the built-in Express
                      server with Python 3 +{' '}
                      <span className="font-mono">fmsave</span> in{' '}
                      <strong>Full Sync</strong> mode (100% of Pass 0 &amp; Pass
                      1 tables, nothing skipped, fast on mobile) and purged from
                      temp storage immediately — with automatic local Pyodide
                      browser fallback if needed.
                    </>
                  ) : (
                    <>
                      Your save is mounted via zero-copy{' '}
                      <span className="font-mono">WORKERFS</span> inside a local
                      Pyodide 3.14 Web Worker with{' '}
                      <span className="font-mono">fmsave</span> (native zstd +
                      Progressive Checkpoint Recovery).
                    </>
                  )}{' '}
                  You can also chat directly with the Tactical Analyst about any
                  FM27 tactic, role pairing, or match scenario right now.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <label
                  htmlFor="chat-empty-state-fm-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select .fm Save File</span>
                  <input
                    id="chat-empty-state-fm-upload"
                    type="file"
                    accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
                    multiple
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                </label>
                <label
                  htmlFor="fm-fast-sync-empty-toggle"
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors select-none ${
                    fastSync
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <input
                    id="fm-fast-sync-empty-toggle"
                    type="checkbox"
                    checked={fastSync}
                    onChange={(e) => {
                      fastSyncManuallyToggledRef.current = true;
                      setFastSync(e.target.checked);
                    }}
                    className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Fast Sync (Club Core — Recommended on Mobile)</span>
                </label>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  {serverDecodeAvailable
                    ? 'Native Server Full Sync Ready (100% Tables · Mobile-Fast)'
                    : 'Local Browser Pyodide Fallback · Automatic Server Detection'}
                </span>
              </div>
            </div>
          )}

          {turns.map((turn) => {
            if (turn.role === 'user') {
              return (
                <div
                  key={turn.id}
                  className="ml-auto max-w-3xl p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-slate-100"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 mb-1">
                    <span>{displayManagerLabel}</span>
                    {turn.imageNames && turn.imageNames.length > 0 && (
                      <span>Attached: {turn.imageNames.join(', ')}</span>
                    )}
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
                className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      Chief Tactical Analyst · {turn.screenDetected}
                    </span>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      In-Game Date: {turn.inGameDate} · Target Sheet Table:{' '}
                      <span className="font-mono">{turn.targetSheetTable}</span>{' '}
                      · Event #{turn.eventNumber}
                    </div>
                  </div>

                  {turn.docEventBulletBlock && (
                    <button
                      type="button"
                      onClick={() =>
                        handleRequestDirectPush({
                          eventNumber: turn.eventNumber || nextEventNum,
                          title:
                            turn.chronicleTitle ||
                            `Event #${turn.eventNumber || nextEventNum}`,
                          docEventBulletBlock: turn.docEventBulletBlock || '',
                          sheetRowValues: turn.sheetRowValues || [],
                          chronicleRowValues: [
                            `Event #${turn.eventNumber || nextEventNum}`,
                            turn.inGameDate || currentSaveDate,
                            clubName && clubName !== '--'
                              ? clubName
                              : 'FM27 Save',
                            turn.targetSheetTable || 'Tactical & Match Audit',
                            turn.chronicleTitle || 'FM27 Tactical Update',
                            turn.chronicleOutcomeMetric || 'Audited',
                            turn.docEventBulletBlock || '',
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      Push to Linked Google Sheet &amp; Doc
                    </button>
                  )}
                </div>

                {turn.playerUpdatesApplied &&
                  turn.playerUpdatesApplied.length > 0 && (
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Automatically updated in-app Squad Database for:{' '}
                        <strong>
                          {turn.playerUpdatesApplied.slice(0, 12).join(', ')}
                          {turn.playerUpdatesApplied.length > 12
                            ? ` (+${turn.playerUpdatesApplied.length - 12} more)`
                            : ''}
                        </strong>
                      </span>
                    </div>
                  )}

                {/* Automatic FM27 Knowledge Base Accuracy Verification */}
                {turn.analysisMarkdown && (() => {
                  const check = verifyFm27Accuracy(turn.analysisMarkdown);
                  return (
                    <div
                      className={`mb-2 rounded-lg border px-2.5 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                        check.passed
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      <span className="font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        {check.passed
                          ? 'FM27 Knowledge Base Verified (Patch 27.1.0 · No retired FM24 roles or raw CA/PA)'
                          : `FM27 Accuracy Notice: ${check.warnings.join(' · ')}`}
                      </span>
                      {check.citedVerifiedRoles.length > 0 && (
                        <span className="font-mono text-[10px] opacity-80">
                          Verified Roles: {check.citedVerifiedRoles.slice(0, 4).join(', ')}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Analysis Body with Clean Formatted Headings, Bullets, and Bold Spans */}
                <div className="space-y-2 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
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
                            className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100 pt-2"
                          >
                            {renderInlineBold(line.replace(/^####\s+/, ''))}
                          </h4>
                        );
                      }
                      if (line.startsWith('* ') || line.startsWith('- ')) {
                        return (
                          <div
                            key={lineIdx}
                            className="flex items-start gap-2 pl-2"
                          >
                            <span className="text-emerald-500 font-bold">
                              •
                            </span>
                            <div className="flex-1">
                              {renderInlineBold(line.replace(/^[*-]\s+/, ''))}
                            </div>
                          </div>
                        );
                      }
                      return <p key={lineIdx}>{renderInlineBold(line)}</p>;
                    })}
                </div>

                {/* 3 Immediate In-Game Clicks */}
                {turn.immediateClicks && turn.immediateClicks.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      3 Immediate In-Game Clicks (Before Hitting Continue)
                    </div>
                    <ol className="list-decimal pl-5 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                      {turn.immediateClicks.map((clickItem, idx) => (
                        <li key={idx}>{clickItem}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Context-Aware Suggested Follow-Up Questions */}
                {turn.followUpQuestions &&
                  turn.followUpQuestions.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Continue Tactical Discussion (1-Click Follow-Up):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {turn.followUpQuestions.map((q, qIdx) => (
                          <button
                            key={qIdx}
                            type="button"
                            disabled={isSending}
                            onClick={() => handleSendToAnalyst(undefined, q)}
                            className="px-3 py-1.5 text-xs font-medium text-left text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            );
          })}

          {isSending && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
              <Sparkles className="w-4 h-4 text-emerald-500 animate-spin" />
              <span>
                Analyzing live save state against Bobby Dean Playbook v2.0 &amp;
                preparing tactical plan...
              </span>
            </div>
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Message & Multi-Screenshot Composer */}
        <form
          onSubmit={(e) => handleSendToAnalyst(e)}
          className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800"
        >
          {fmDecodeStage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-emerald-400" />
                <span className="leading-snug break-words">
                  {fmDecodeStage.label}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[11px] text-emerald-400/90 tabular-nums">
                  {decodeElapsedSec}s
                </span>
                <button
                  type="button"
                  onClick={() => {
                    cancelFmSaveDecode();
                    setFmDecodeStage(null);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-md cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {Object.keys(lastStepTimingsMs).length > 0 && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono font-semibold uppercase tracking-wider text-emerald-500">
                Decode Timing:
              </span>
              {Object.entries(lastStepTimingsMs).map(([key, ms]) => {
                const isSlow = key !== 'totalDecodeMs' && ms >= 5000;
                return (
                  <span
                    key={key}
                    className={`font-mono tabular-nums ${
                      isSlow
                        ? 'text-amber-400 font-semibold'
                        : key === 'totalDecodeMs'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {formatStepTimingLabel(key)}{' '}
                    {ms === 0 && key !== 'totalDecodeMs'
                      ? '0ms'
                      : `${(ms / 1000).toFixed(1)}s`}
                  </span>
                );
              })}
            </div>
          )}

          {(() => {
            const cleanedNotes = sanitizeReaderNotes(extractionWarnings);
            if (cleanedNotes.length === 0) return null;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReaderNotes((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300 transition cursor-pointer"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>FM27 27.1 Reader Notes ({cleanedNotes.length})</span>
                    {showReaderNotes ? (
                      <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss reader notes"
                    onClick={() => {
                      setExtractionWarnings([]);
                      setShowReaderNotes(false);
                    }}
                    className="text-slate-400 hover:text-white cursor-pointer shrink-0 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {showReaderNotes && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-[11px] text-amber-200/90 space-y-1">
                    <ul className="list-disc pl-4 space-y-0.5">
                      {cleanedNotes.slice(0, 8).map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {chatError && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          {(attachedFmFiles.length > 0 || uploadedImages.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex flex-col gap-1.5 shrink-0">
              <label
                htmlFor="chat-multi-file-upload"
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                <span>Import .fm Save / Image</span>
                <input
                  id="chat-multi-file-upload"
                  type="file"
                  accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </label>
              <label
                htmlFor="fm-fast-sync-composer-toggle"
                title="Auto-enabled on mobile (<768px). Skips global injuries, facilities, competition rules, transfer windows, optional club dumps, market scan, and player_season_stats / match / career history — keeps full squad, 52 attributes, traits, scout badges, direct contracts/bans/injuries, finances, club staff, tactics, mentoring, fixtures & full domestic league table."
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border cursor-pointer transition-colors select-none ${
                  fastSync
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:border-slate-600'
                }`}
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
                <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Fast Sync (Club Core — Recommended on Mobile)</span>
              </label>
            </div>

            <div className="flex-1">
              <textarea
                rows={3}
                aria-label="Message your FM27 Tactical Analyst"
                placeholder="Drop your .fm save file here for instant full-club sync & plan — or talk tactics / attach screenshots..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="w-full px-3.5 py-2 text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSending || Boolean(fmDecodeStage)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Send to Analyst</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
