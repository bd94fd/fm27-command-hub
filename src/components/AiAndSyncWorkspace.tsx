import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  CloudUpload,
  Download,
  List,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { createEmptySnapshot } from '../domain/emptyState';
import { CHAT_COMMANDS, matchSlashCommands } from '../domain/filters';
import {
  mergeParsedPlayersIntoSquad,
  normalizeImportedSavePayload,
  parseFmStructuredExport,
  type ParsedFmExportResult,
} from '../domain/fmSaveImport';
import type {
  AiContextState,
  ChatConversation,
  ChatMessage,
  ClubRecord,
  MatchLogEntry,
  PlayerRecord,
  ShortlistRecord,
  SyncTurnOutput,
  TacticDefinition,
  WorkspaceSnapshot,
} from '../domain/types';
import {
  cancelFmSaveDecode,
  decodeFmSaveFile,
  type FmSaveProgressStage,
} from '../services/fmSaveReader';
import {
  appendEventToGoogleDoc,
  appendRowToGoogleSheet,
  fetchGoogleDocInfo,
  fetchGoogleSheetMetadata,
  getAccessToken,
  googleSignIn,
  initGoogleAuth,
  logoutGoogleWorkspace,
  type GoogleDocInfo,
  type GoogleSheetMetadata,
} from '../services/googleWorkspace';

interface AttachedFmFile {
  id: string;
  name: string;
  kind: 'FM_SAVE_DECODED' | 'FM_EXPORT';
  badgeLabel: string;
  promptContext: string;
  parsedExport?: ParsedFmExportResult;
}

interface PendingWorkspaceMutation {
  eventNumber: number;
  title: string;
  docEventBulletBlock: string;
  sheetRowValues: string[];
  chronicleRowValues: string[];
}

interface AiAndSyncWorkspaceProps {
  mode: 'ai' | 'sync';
  snapshot: WorkspaceSnapshot;
  aiContext: AiContextState;
  clubs: ClubRecord[];
  players: PlayerRecord[];
  shortlists: ShortlistRecord[];
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
  onApplyImportedSave: (payload: {
    snapshot: WorkspaceSnapshot;
    managedClubName?: string | null;
    tactics?: TacticDefinition[];
  }) => Promise<void>;
  onUpdateContext: (patch: Partial<AiContextState>) => Promise<void>;
  onAddTactic: (tactic: Partial<TacticDefinition>) => Promise<void>;
  onCreateShortlist: (name: string, notes: string, playerIds: number[]) => Promise<void>;
  onDeleteShortlist: (id: string) => Promise<void>;
  onShortlistCreatedFromAi: (sl: ShortlistRecord) => void;
  onAddMatchLog: (match: MatchLogEntry) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?[\s:-]+(\|[\s:-]+)+\|?$/.test(trimmed);
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={idx} className="font-bold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableCells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(parseTableCells(lines[j]));
        j++;
      }
      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-2 overflow-x-auto rounded-[6px] border border-[#39333f] bg-[#131118]"
        >
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#39333f] bg-[#201c28] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#b2acbb]">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 whitespace-nowrap">
                    {renderInlineBold(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={`border-b border-[#39333f]/60 last:border-b-0 ${
                    rIdx % 2 === 1 ? 'bg-white/[0.025]' : ''
                  }`}
                >
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 text-[#f0edf4]">
                      {renderInlineBold(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j - 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={i} className="my-2 border-[#39333f]" />);
      continue;
    }
    if (line.startsWith('#### ')) {
      blocks.push(
        <h5 key={i} className="mt-2 text-[13px] font-bold uppercase tracking-wide text-[#ecc2ff]">
          {renderInlineBold(line.slice(5))}
        </h5>,
      );
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={i} className="mt-2 text-[14px] font-bold text-[#dc87ff]">
          {renderInlineBold(line.slice(4))}
        </h4>,
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={i} className="fm-font-display mt-2.5 text-[16px] font-bold text-[#faf5fc]">
          {renderInlineBold(line.slice(3))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={i} className="fm-font-display mt-2 text-[18px] font-bold text-white">
          {renderInlineBold(line.slice(2))}
        </h2>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, '');
      blocks.push(
        <div key={i} className="flex gap-2 pl-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#dc87ff]" />
          <span className="flex-1">{renderInlineBold(content)}</span>
        </div>,
      );
      continue;
    }
    if (!line.trim()) {
      blocks.push(<div key={i} className="h-1" />);
      continue;
    }
    blocks.push(<p key={i}>{renderInlineBold(line)}</p>);
  }

  return (
    <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-[#f0edf4]">
      {blocks}
    </div>
  );
}

export function AiAndSyncWorkspace({
  mode,
  snapshot,
  aiContext,
  clubs,
  players,
  shortlists,
  pendingPrompt,
  onConsumePendingPrompt,
  onApplyImportedSave,
  onUpdateContext,
  onAddTactic,
  onCreateShortlist,
  onDeleteShortlist,
  onShortlistCreatedFromAi,
  onAddMatchLog,
  onSelectPlayer,
}: AiAndSyncWorkspaceProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => [
    {
      id: 'conv-initial',
      title: 'New session',
      createdAt: new Date().toISOString(),
      messages: [],
    },
  ]);
  const [activeConvId, setActiveConvId] = useState<string>('conv-initial');
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [requestStructuredSync, setRequestStructuredSync] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Multi-file & .fm decode composer state
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ base64: string; mimeType: string; name: string }>
  >([]);
  const [attachedFmFiles, setAttachedFmFiles] = useState<AttachedFmFile[]>([]);
  const [fmDecodeStage, setFmDecodeStage] = useState<FmSaveProgressStage | null>(null);
  const [decodeElapsedSec, setDecodeElapsedSec] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Modals inside AI Workspace
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [shortlistsModalOpen, setShortlistsModalOpen] = useState(false);
  const [newShortlistName, setNewShortlistName] = useState('');
  const [newShortlistNotes, setNewShortlistNotes] = useState('');
  const [selectedShortlistId, setSelectedShortlistId] = useState<string>(shortlists[0]?.id ?? '');

  // Google Workspace Sync state (preserved across tab switches)
  const [showGoogleDrawer, setShowGoogleDrawer] = useState<boolean>(mode === 'sync');
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [docUrlOrId, setDocUrlOrId] = useState<string>(() => {
    try {
      return localStorage.getItem('fm27_command_hub_doc_id') || '';
    } catch {
      return '';
    }
  });
  const [sheetUrlOrId, setSheetUrlOrId] = useState<string>(() => {
    try {
      return localStorage.getItem('fm27_command_hub_sheet_id') || '';
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
  const [pendingMutation, setPendingMutation] = useState<PendingWorkspaceMutation | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'sync') {
      setShowGoogleDrawer(true);
    }
  }, [mode]);

  useEffect(() => {
    const unsub = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
      },
    );
    return () => unsub();
  }, []);

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

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) ?? conversations[0];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, sending]);

  useEffect(() => {
    if (pendingPrompt) {
      const promptToRun = pendingPrompt;
      onConsumePendingPrompt();
      void sendToAi({ overrideText: promptToRun });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  const enabledContextCount =
    (aiContext.includeManagedClub && aiContext.managedClubName ? 1 : 0) +
    (aiContext.includeTactic && aiContext.activeTacticId ? 1 : 0);

  const activeTactic =
    aiContext.tactics.find((t) => t.id === aiContext.activeTacticId) ?? null;

  const matchingCommands = input.startsWith('/') ? matchSlashCommands(input) : CHAT_COMMANDS;
  const nextEventNumber = snapshot.matchLogs.length + 1;

  function handleDocUrlChange(val: string) {
    setDocUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_doc_id', val);
    } catch {
      // ignore
    }
  }

  function handleSheetUrlChange(val: string) {
    setSheetUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_sheet_id', val);
    } catch {
      // ignore
    }
  }

  async function handleGoogleLogin() {
    setIsLoggingIn(true);
    setWorkspaceError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setAccessToken(res.accessToken);
        setShowGoogleDrawer(true);
        setWorkspaceStatus(
          `Signed in as ${res.user.email || res.user.displayName || 'Google User'}. Paste your Google Sheet & Doc URLs below to enable 1-click sync.`,
        );
      }
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Google Sign-In failed. Please try again.',
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleGoogleLogout() {
    await logoutGoogleWorkspace();
    setGoogleUser(null);
    setAccessToken(null);
    setDocInfo(null);
    setSheetMeta(null);
    setWorkspaceStatus('Signed out of Google Workspace.');
  }

  async function handleVerifyLinks() {
    const token = accessToken || (await getAccessToken());
    if (!token) {
      setWorkspaceError('Please click "Sign in with Google" first.');
      return;
    }
    if (!docUrlOrId.trim() && !sheetUrlOrId.trim()) {
      setWorkspaceError('Paste your Google Doc URL/ID or Google Sheet URL/ID first.');
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
        messages.push(`Connected Sheet: "${meta.title}" (${meta.sheetNames.length} tabs)`);
      }
      setWorkspaceStatus(messages.join(' · '));
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to inspect Google Doc or Sheet.',
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  }

  function handleRequestDirectPush(syncOutput: SyncTurnOutput, eventNum: number) {
    setWorkspaceError(null);
    if (!accessToken) {
      setShowGoogleDrawer(true);
      setWorkspaceError(
        'Sign in with Google and link your Google Sheet / Doc above before pushing.',
      );
      return;
    }
    if (!docUrlOrId.trim() && !sheetUrlOrId.trim()) {
      setShowGoogleDrawer(true);
      setWorkspaceError('Paste your Google Sheet or Doc URL/ID in the drawer above.');
      return;
    }

    setPendingMutation({
      eventNumber: eventNum,
      title: syncOutput.chronicleTitle || syncOutput.screenDetected || `Event #${eventNum}`,
      docEventBulletBlock: syncOutput.docEventBulletBlock,
      sheetRowValues: syncOutput.sheetRowValues || [],
      chronicleRowValues: [
        `Event #${eventNum}`,
        syncOutput.inGameDate || snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate || '',
        syncOutput.targetSheetTable || 'GENERAL_CHRONICLE',
        syncOutput.chronicleTitle || 'FM27 Update',
        syncOutput.chronicleOutcomeMetric || 'Audited',
        syncOutput.docEventBulletBlock || '',
      ],
    });
  }

  async function executeConfirmedWorkspaceMutation() {
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
        const res = await appendEventToGoogleDoc(docUrlOrId, cp.docEventBulletBlock, token);
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
        if (cp.sheetRowValues.length > 0) {
          await appendRowToGoogleSheet(sheetUrlOrId, matchTab, cp.sheetRowValues, token);
        }
        if (chronTab && chronTab !== matchTab && cp.chronicleRowValues.length > 0) {
          await appendRowToGoogleSheet(sheetUrlOrId, chronTab, cp.chronicleRowValues, token);
          results.push(`Updated Google Sheet tabs "${matchTab}" & "${chronTab}"`);
        } else {
          results.push(`Updated Google Sheet tab "${matchTab}"`);
        }
      }
      setWorkspaceStatus(results.join(' · '));
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Failed to sync with Google Docs / Sheets.',
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  }

  function handleNewChat() {
    const id = `conv-${Date.now()}`;
    const created: ChatConversation = {
      id,
      title: 'New session',
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setConversations((prev) => [created, ...prev]);
    setActiveConvId(id);
    setErrorMsg(null);
    inputRef.current?.focus();
  }

  async function processIncomingFiles(files: File[]) {
    if (files.length === 0) return;
    setErrorMsg(null);

    for (const file of files) {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.fm')) {
        try {
          setFmDecodeStage({
            stage: 'boot',
            step: 'Step 1/6',
            label: `Starting local fmsave 0.14.1 reader for ${file.name}…`,
            percent: 5,
          });
          const rawDecoded = await decodeFmSaveFile(
            file,
            { scope: 'managed_only', clubHint: aiContext.managedClubName },
            (stage) => setFmDecodeStage(stage),
          );
          setFmDecodeStage(null);

          const normalized = normalizeImportedSavePayload(rawDecoded);
          await onApplyImportedSave({
            snapshot: normalized.snapshot,
            managedClubName: normalized.managedClubName,
            tactics: normalized.tactics,
          });

          const summaryCtx = `[LIVE .FM SAVE DECODED: ${file.name}]
Club: ${normalized.managedClubName ?? 'Unknown'} | Date: ${normalized.summary.gameDateDmy || normalized.summary.gameDate || 'Unknown'}
Players loaded: ${normalized.summary.importedPlayers} | Matches: ${normalized.summary.importedMatchLogs} | Fixtures: ${normalized.summary.importedFixtures} | Tactics: ${normalized.summary.importedTactics}`;

          const entry: AttachedFmFile = {
            id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'FM_SAVE_DECODED',
            badgeLabel: `${file.name} (${normalized.summary.managedClubName || 'Decoded'} · ${normalized.summary.gameDateDmy || normalized.summary.gameDate || 'Live'})`,
            promptContext: summaryCtx,
          };

          if (!input.trim()) {
            await sendToAi({
              overrideText: `I just loaded my live .fm save ${file.name} (${normalized.summary.gameDateDmy || normalized.summary.gameDate || 'Live'}). Give me a complete audit of my squad, recent results, tactical setup, and next fixture plan.`,
              extraFmFiles: [entry],
              forceSyncPayload: true,
            });
          } else {
            setAttachedFmFiles((prev) => [...prev, entry]);
          }
        } catch (err: unknown) {
          setFmDecodeStage(null);
          if (err instanceof Error && err.message === 'CANCELLED_BY_USER') {
            return;
          }
          setErrorMsg(
            err instanceof Error
              ? err.message
              : `Could not decode ${file.name}. Ensure it is a valid FM26/FM27 .fm save.`,
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
          let mergeSummary = '';

          if (snapshot.metadata.status === 'loaded' && snapshot.players.length > 0 && parsed.parsedPlayers.length > 0) {
            const mergeRes = mergeParsedPlayersIntoSquad(snapshot.players, parsed.parsedPlayers);
            if (mergeRes.matchedCount > 0) {
              await onApplyImportedSave({
                snapshot: {
                  ...snapshot,
                  metadata: {
                    ...snapshot.metadata,
                    gameDate: parsed.detectedDate ?? snapshot.metadata.gameDate,
                    gameDateDmy: parsed.detectedDate ?? snapshot.metadata.gameDateDmy,
                    loadedAt: new Date().toISOString(),
                    freshness: 'current',
                  },
                  players: mergeRes.updatedSquad,
                },
                managedClubName: aiContext.managedClubName,
              });
              mergeSummary = `Merged ${mergeRes.matchedCount} players (${mergeRes.changedPlayers.length} updated)`;
            }
          } else if (parsed.players.length > 0) {
            const base = createEmptySnapshot();
            const detectedClub = parsed.detectedClub || aiContext.managedClubName;
            await onApplyImportedSave({
              snapshot: {
                ...base,
                metadata: {
                  ...base.metadata,
                  status: 'loaded',
                  game: 'FM27',
                  saveName: file.name,
                  gameDate: parsed.detectedDate,
                  gameDateDmy: parsed.detectedDate,
                  loadedAt: new Date().toISOString(),
                  sourceLabel: `FM Export (${file.name})`,
                  freshness: 'current',
                  managedClubName: detectedClub,
                  totalPlayersInWorld: parsed.players.length,
                },
                players: parsed.players,
              },
              managedClubName: detectedClub,
            });
            mergeSummary = `Loaded ${parsed.players.length} players from export`;
          }

          setAttachedFmFiles((prev) => [
            ...prev,
            {
              id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              kind: 'FM_EXPORT',
              badgeLabel: `${file.name} (${parsed.format} · ${mergeSummary || `${parsed.rowCount} rows`})`,
              promptContext: parsed.promptContext,
              parsedExport: parsed,
            },
          ]);
        } catch {
          setErrorMsg(`Could not parse export file "${file.name}".`);
        }
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const resStr = String(reader.result || '');
          const base64Part = resStr.split(',')[1];
          if (base64Part) {
            setUploadedImages((prev) => [
              ...prev,
              {
                base64: base64Part,
                mimeType: file.type || 'image/png',
                name: file.name,
              },
            ]);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setErrorMsg(
          `Unsupported file "${file.name}". Drop a .fm save, .csv/.html/.rtf export, or screenshot image.`,
        );
      }
    }
  }

  async function sendToAi(opts?: {
    overrideText?: string;
    extraFmFiles?: AttachedFmFile[];
    forceSyncPayload?: boolean;
  }) {
    const text = (opts?.overrideText ?? input).trim();
    const filesToSend = opts?.extraFmFiles ?? attachedFmFiles;
    const imagesToSend = opts?.overrideText ? [] : uploadedImages;

    if ((!text && filesToSend.length === 0 && imagesToSend.length === 0) || sending) return;

    if (!opts?.overrideText) {
      setInput('');
      setUploadedImages([]);
      setAttachedFmFiles([]);
    }
    setShowCommands(false);
    setErrorMsg(null);

    const attachedLabelParts = [
      ...filesToSend.map((f) => f.name),
      ...imagesToSend.map((i) => i.name),
    ];
    const displayContent =
      text ||
      `Analyze attached FM27 files/screenshots: ${attachedLabelParts.join(', ')}`;

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content:
        attachedLabelParts.length > 0
          ? `${displayContent}\n\n[Attached: ${attachedLabelParts.join(', ')}]`
          : displayContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const convId = activeConversation.id;
    const historyForApi = activeConversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              title: c.messages.length === 0 ? displayContent.slice(0, 32) : c.title,
              messages: [...c.messages, userMsg],
            }
          : c,
      ),
    );

    const importedFileContext = filesToSend.map((f) => f.promptContext).join('\n\n---\n\n');
    const wantSyncPayload =
      Boolean(opts?.forceSyncPayload) ||
      requestStructuredSync ||
      mode === 'sync' ||
      imagesToSend.length > 0 ||
      filesToSend.length > 0;

    setSending(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: displayContent,
          history: historyForApi,
          images: imagesToSend,
          importedFileContext: importedFileContext || undefined,
          nextEventNumber,
          requestSyncPayload: wantSyncPayload,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        syncOutput?: SyncTurnOutput | null;
        error?: string;
        commandUsed?: string;
        toolsUsed?: string[];
        createdShortlist?: ShortlistRecord | null;
      };

      if (!res.ok || !data.reply) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      if (data.createdShortlist) {
        onShortlistCreatedFromAi(data.createdShortlist);
      }

      // If AI parsed a match result from an attached screenshot (not an already-decoded .fm save), log it cleanly
      const hasDecodedFm = filesToSend.some((f) => f.kind === 'FM_SAVE_DECODED');
      const mf = data.syncOutput?.matchFields;
      if (!hasDecodedFm && data.syncOutput?.isMatchResult && mf?.opponent && mf?.score) {
        onAddMatchLog({
          id: `ai-match-${Date.now()}`,
          eventNumber: nextEventNumber,
          date:
            data.syncOutput.inGameDate ||
            snapshot.metadata.gameDateDmy ||
            snapshot.metadata.gameDate ||
            '',
          competition: mf.competition || 'Match',
          opponent: mf.opponent,
          venue: mf.venue === 'A' ? 'A' : 'H',
          result: mf.result === 'W' || mf.result === 'D' || mf.result === 'L' ? mf.result : 'D',
          score: mf.score,
          xGFor: typeof mf.xGFor === 'number' ? mf.xGFor : null,
          xGAgainst: typeof mf.xGAgainst === 'number' ? mf.xGAgainst : null,
          possession: typeof mf.possession === 'number' ? mf.possession : null,
          passCompletion: typeof mf.passCompletion === 'number' ? mf.passCompletion : null,
          shotsFor: mf.shotsFor ?? null,
          shotsAgainst: mf.shotsAgainst ?? null,
          cccFor: typeof mf.cccFor === 'number' ? mf.cccFor : null,
          cccAgainst: typeof mf.cccAgainst === 'number' ? mf.cccAgainst : null,
          goalTimeline: mf.goalTimeline ?? null,
          potm: mf.potm ?? null,
          defensiveWatchpoints: mf.defensiveWatchpoints ?? null,
          tacticalAudit: mf.tacticalAudit ?? data.syncOutput.chronicleOutcomeMetric ?? null,
          source: 'AI_CHAT',
        });
      }

      const aiMsg: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        commandUsed: data.commandUsed,
        toolsUsed: data.toolsUsed,
        createdShortlistId: data.createdShortlist?.id,
        syncOutput: data.syncOutput ?? null,
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, aiMsg] } : c)),
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach FM27 AI assistant.');
    } finally {
      setSending(false);
    }
  }

  function handleCommandPick(cmdName: string, executeImmediately: boolean) {
    setShowCommands(false);
    if (executeImmediately) {
      void sendToAi({ overrideText: cmdName });
    } else {
      setInput(`${cmdName} `);
      inputRef.current?.focus();
    }
  }

  function handleTacticUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanName = file.name.replace(/\.(fmf|json)$/i, '').replace(/[-_]+/g, ' ');
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as Partial<TacticDefinition>;
          void onAddTactic({
            ...parsed,
            fileName: file.name,
            name: parsed.name || cleanName,
          });
        } catch {
          void onAddTactic({ fileName: file.name, name: cleanName });
        }
      };
      reader.readAsText(file);
    } else {
      void onAddTactic({
        fileName: file.name,
        name: cleanName,
        formation: file.name.match(/\d-\d-\d(?:-\d)?/)?.[0] ?? '4-3-3 DM Wide',
        mentality: 'Positive',
        tacticalStyle: 'Fluid Counter-Attack',
      });
    }
    e.target.value = '';
  }

  function exportShortlistJson(sl: ShortlistRecord) {
    const memberPlayers = players.filter((p) => sl.playerIds.includes(p.id));
    const payload = {
      shortlist: sl.name,
      createdAt: sl.createdAt,
      notes: sl.notes,
      players: memberPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        club: p.club,
        position: p.positionText,
        age: p.age,
        ca: p.ca,
        pa: p.pa,
        askingPrice: p.askingPrice ?? p.estimatedValue,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeShortlist =
    shortlists.find((s) => s.id === selectedShortlistId) ?? shortlists[0] ?? null;

  return (
    <div
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingFile(false);
        void processIncomingFiles(Array.from(e.dataTransfer.files || []));
      }}
      className={`flex h-full min-h-0 flex-col overflow-hidden border-t bg-[#121116] transition-colors ${
        isDraggingFile ? 'border-emerald-400 ring-2 ring-emerald-500/30' : 'border-[#39333f]'
      }`}
    >
      {/* Top Toolbar */}
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2.5 border-b border-[#39333f] bg-[#202128] px-4 py-2">
        <div className="inline-flex h-[34px] items-center gap-2 rounded-[5px] border border-[#59515f] bg-[#121116] px-3 text-[12.5px] font-semibold text-[#f0edf4]">
          <Sparkles className="h-3.5 w-3.5 text-[#dc87ff]" />
          <span>FM27 Chief Analyst &amp; Auto-Sync</span>
        </div>

        <span className="text-[12px] text-[#b2acbb] truncate">
          {aiContext.includeManagedClub && aiContext.managedClubName
            ? aiContext.managedClubName
            : 'Awaiting .fm Save'}
          {aiContext.includeTactic && activeTactic ? ` · ${activeTactic.name}` : ''}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!accessToken ? (
            <button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={isLoggingIn}
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#14111a] px-3 text-[12px] font-semibold text-white hover:border-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              <CloudUpload className="h-3.5 w-3.5 text-emerald-400" />
              <span>{isLoggingIn ? 'Signing in…' : 'Sign in Google'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline font-mono text-[11px] text-emerald-400">
                {googleUser?.email || 'Google Connected'}
              </span>
              <button
                type="button"
                onClick={() => void handleGoogleLogout()}
                className="inline-flex h-[32px] items-center gap-1 rounded-[5px] border border-[#59515f] bg-[#14111a] px-2.5 text-[11.5px] text-[#d4ced8] hover:text-white cursor-pointer"
              >
                <LogOut className="h-3 w-3" />
                <span>Sign out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowGoogleDrawer((v) => !v)}
            className={`inline-flex h-[32px] items-center gap-1.5 rounded-[5px] border px-3 text-[12px] font-semibold cursor-pointer ${
              showGoogleDrawer
                ? 'border-emerald-500/50 bg-[#142c21] text-emerald-300'
                : 'border-[#59515f] bg-[#18151f] text-[#d4ced8] hover:border-[#dc87ff]'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>{showGoogleDrawer ? 'Hide Sheet/Doc' : 'Google Sync'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShortlistsModalOpen(true)}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-semibold text-[#f0edf4] hover:bg-white/10 cursor-pointer"
          >
            <List className="h-3.5 w-3.5 text-[#b2acbb]" />
            <span>Shortlists ({shortlists.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setContextModalOpen(true)}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-bold text-[#dc87ff] hover:bg-white/10 cursor-pointer"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Context · {enabledContextCount} on</span>
          </button>
        </div>
      </div>

      {/* Collapsible Google Docs & Sheets Connection Drawer */}
      {showGoogleDrawer && (
        <div className="shrink-0 border-b border-[#39333f] bg-[#16131c] px-5 py-3.5 space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <label
                htmlFor="hub-google-sheet-url"
                className="mb-1 block text-[11px] font-semibold text-[#b2acbb]"
              >
                Google Sheet URL or ID (Match Log / Squad / Chronicles)
              </label>
              <input
                id="hub-google-sheet-url"
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={sheetUrlOrId}
                onChange={(e) => handleSheetUrlChange(e.target.value)}
                className="h-[34px] w-full rounded-[5px] border border-[#59515f] bg-[#100e14] px-3 font-mono text-[12px] text-[#f0edf4] focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div className="lg:col-span-5">
              <label
                htmlFor="hub-google-doc-url"
                className="mb-1 block text-[11px] font-semibold text-[#b2acbb]"
              >
                Google Doc URL or ID (Chronicle Log · Optional)
              </label>
              <input
                id="hub-google-doc-url"
                type="text"
                placeholder="https://docs.google.com/document/d/.../edit"
                value={docUrlOrId}
                onChange={(e) => handleDocUrlChange(e.target.value)}
                className="h-[34px] w-full rounded-[5px] border border-[#59515f] bg-[#100e14] px-3 font-mono text-[12px] text-[#f0edf4] focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div className="flex items-end lg:col-span-2">
              <button
                type="button"
                disabled={isSyncingWorkspace}
                onClick={() => void handleVerifyLinks()}
                className="inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3 text-[12px] font-semibold text-white hover:border-emerald-400 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingWorkspace ? 'animate-spin' : ''}`} />
                <span>Verify Links</span>
              </button>
            </div>
          </div>

          {sheetMeta && sheetMeta.sheetNames.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#b2acbb]">
                  Target Sheet Tab (Match / Scouting / Tactical Rows):
                </label>
                <select
                  value={selectedMatchLogTab}
                  onChange={(e) => setSelectedMatchLogTab(e.target.value)}
                  className="h-[32px] w-full rounded-[5px] border border-[#59515f] bg-[#100e14] px-2.5 text-[12px] text-[#f0edf4]"
                >
                  {sheetMeta.sheetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#b2acbb]">
                  Target Sheet Tab (Chronicles):
                </label>
                <select
                  value={selectedChroniclesTab}
                  onChange={(e) => setSelectedChroniclesTab(e.target.value)}
                  className="h-[32px] w-full rounded-[5px] border border-[#59515f] bg-[#100e14] px-2.5 text-[12px] text-[#f0edf4]"
                >
                  {sheetMeta.sheetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {workspaceError && (
            <div className="flex items-center gap-2 rounded-[5px] border border-[#ff758b]/40 bg-[#40212b] px-3 py-2 text-[12px] text-[#ffb5c1]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{workspaceError}</span>
            </div>
          )}

          {workspaceStatus && (
            <div className="flex items-center gap-2 rounded-[5px] border border-emerald-500/35 bg-[#142c21] px-3 py-2 text-[12px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{workspaceStatus}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Split: Conversations Sidebar + Chat Stream & Composer */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)]">
        {/* Conversations Sidebar */}
        <div className="hidden min-h-0 flex-col border-r border-[#39333f] bg-[#141119] p-3 md:flex">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#b2acbb]">
            Conversations
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="mb-3 inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] text-[12.5px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </button>

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConversation.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConvId(conv.id)}
                  className={`truncate rounded-[4px] border px-3 py-2 text-left text-[12px] font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#734096] bg-[#34223f] text-white'
                      : 'border-transparent text-[#b2acbb] hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {conv.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat Stream + Composer */}
        <div className="relative flex min-h-0 flex-col bg-[#100e14]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#39333f]/80 bg-[#15121b] px-5 py-2 text-[11.5px] text-[#b2acbb]">
            <span>
              Drop <code className="text-emerald-400">.fm</code> saves, screenshots, or{' '}
              <code className="text-[#d4ced8]">.csv/.html/.rtf</code> exports directly anywhere here
              — or use slash commands (<code className="text-[#dc87ff]">/</code>).
            </span>
            <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[#d4ced8] cursor-pointer">
              <input
                type="checkbox"
                checked={requestStructuredSync}
                onChange={(e) => setRequestStructuredSync(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              <span>Emit Sync Card &amp; 3 Clicks</span>
            </label>
          </div>

          {/* Messages */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-5">
            {activeConversation.messages.length === 0 ? (
              <div className="mx-auto my-auto flex max-w-[600px] flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="fm-font-display text-[20px] font-bold text-[#faf5fc]">
                  FM27 Tactical Analyst &amp; Auto-Sync Studio
                </h3>
                <p className="mt-1.5 text-[13px] text-[#b2acbb]">
                  {snapshot.metadata.status === 'loaded' && aiContext.managedClubName
                    ? `Grounded on ${aiContext.managedClubName} (${snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate || 'Loaded Save'}). Type / for commands or drop a screenshot/export.`
                    : 'Awaiting .fm Save — drop your .fm file or export below, or ask Playbook v2.0 tactical questions.'}
                </p>

                <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  {CHAT_COMMANDS.slice(0, 4).map((cmd) => (
                    <button
                      key={cmd.name}
                      type="button"
                      onClick={() => void sendToAi({ overrideText: cmd.name })}
                      className="flex flex-col items-start rounded-[6px] border border-[#39333f] bg-[#191520] px-3.5 py-2.5 text-left transition-colors hover:border-[#dc87ff] hover:bg-[#271d31] cursor-pointer"
                    >
                      <span className="text-[13px] font-bold text-[#dc87ff]">{cmd.name}</span>
                      <span className="mt-0.5 text-[11.5px] text-[#b2acbb]">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeConversation.messages.map((msg, msgIdx) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-[8px] px-4 py-3 space-y-3 ${
                      msg.role === 'user'
                        ? 'border border-[#734096] bg-[#34223f] text-white'
                        : 'border border-[#39333f] bg-[#18151f] text-[#f0edf4]'
                    }`}
                  >
                    {/* Tools & Sync Output Header */}
                    {msg.syncOutput && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#39333f] pb-2.5">
                        <div>
                          <div className="font-mono text-[11.5px] font-semibold text-emerald-400">
                            {msg.syncOutput.screenDetected}
                          </div>
                          <div className="text-[11px] text-[#9c92a6]">
                            Date: {msg.syncOutput.inGameDate || '--'} · Target:{' '}
                            <span className="font-mono">{msg.syncOutput.targetSheetTable}</span>
                          </div>
                        </div>

                        {msg.syncOutput.docEventBulletBlock && (
                          <button
                            type="button"
                            onClick={() =>
                              handleRequestDirectPush(msg.syncOutput!, nextEventNumber + msgIdx)
                            }
                            className="inline-flex items-center gap-1.5 rounded-[5px] bg-emerald-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                          >
                            <CloudUpload className="h-3.5 w-3.5" />
                            <span>Push to Linked Google Sheet &amp; Doc</span>
                          </button>
                        )}
                      </div>
                    )}

                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-b border-[#39333f] pb-2">
                        {msg.toolsUsed.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center gap-1 rounded bg-[#251f2d] px-2 py-0.5 text-[10.5px] font-semibold text-[#dc87ff]"
                          >
                            <Wrench className="h-3 w-3" />
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.role === 'assistant' ? (
                      renderFormattedText(msg.content)
                    ) : (
                      <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>
                    )}

                    {/* 3 Immediate In-Game Clicks */}
                    {msg.syncOutput?.immediateClicks &&
                      msg.syncOutput.immediateClicks.length > 0 && (
                        <div className="rounded-[6px] border border-emerald-500/35 bg-[#0d1f19] p-3.5">
                          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>3 Immediate In-Game Clicks (Before Hitting Continue)</span>
                          </div>
                          <ol className="list-decimal space-y-1 pl-5 text-[12px] text-[#d4ced8]">
                            {msg.syncOutput.immediateClicks.map((clickItem, cIdx) => (
                              <li key={cIdx}>{clickItem}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                    {msg.createdShortlistId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShortlistId(msg.createdShortlistId!);
                          setShortlistsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded bg-[#17372a] px-2.5 py-1 text-[12px] font-semibold text-[#71e7a7] hover:bg-[#1f4a39] cursor-pointer"
                      >
                        <List className="h-3.5 w-3.5" />
                        <span>View created shortlist</span>
                      </button>
                    )}
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-[#8d8496]">{msg.timestamp}</span>
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-center gap-2.5 self-start rounded-[8px] border border-[#39333f] bg-[#18151f] px-4 py-3 text-[13px] text-[#dc87ff]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Running FM27 grounded analysis &amp; Playbook v2.0 check…</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#ff758b]/40 bg-[#40212b] px-4 py-3 text-[13px] text-[#ffb5c1]"
              >
                {errorMsg}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Slash Command Picker Popover */}
          {(showCommands || (input.startsWith('/') && matchingCommands.length > 0)) && (
            <div
              role="listbox"
              aria-label="FM27 slash commands"
              className="absolute bottom-[100px] left-5 z-20 w-[min(560px,calc(100%-40px))] overflow-hidden rounded-[8px] border border-[#59515f] bg-[#2a2730] shadow-[0_18px_48px_rgba(0,0,0,0.75)]"
            >
              {matchingCommands.map((cmd, idx) => (
                <button
                  key={cmd.name}
                  type="button"
                  onClick={() => handleCommandPick(cmd.name, cmd.executeImmediately)}
                  className={`flex w-full flex-col items-start border-b border-[#3e3846] px-4 py-2.5 text-left transition-colors last:border-b-0 cursor-pointer ${
                    idx === 0 ? 'bg-[#3d2948] hover:bg-[#493054]' : 'hover:bg-[#35263f]'
                  }`}
                >
                  <span className="text-[13.5px] font-bold text-white">{cmd.name}</span>
                  <span className="text-[11.5px] text-[#b2acbb]">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Bottom Multi-File Composer */}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void sendToAi();
            }}
            className="shrink-0 space-y-2.5 border-t border-[#39333f] bg-[#141119] px-5 py-3"
          >
            {fmDecodeStage && (
              <div className="flex items-center justify-between gap-3 rounded-[6px] border border-emerald-500/40 bg-[#142c21] px-3 py-2 text-[12px] text-emerald-200">
                <div className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
                  <span className="truncate">
                    {fmDecodeStage.step ? `${fmDecodeStage.step} · ` : ''}
                    {fmDecodeStage.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] tabular-nums">{decodeElapsedSec}s</span>
                  <button
                    type="button"
                    onClick={() => {
                      cancelFmSaveDecode();
                      setFmDecodeStage(null);
                    }}
                    className="rounded border border-emerald-500/40 bg-[#121116] px-2 py-0.5 text-[11px] font-semibold text-white hover:border-[#ff758b] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(attachedFmFiles.length > 0 || uploadedImages.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {attachedFmFiles.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-[#142c21] px-2.5 py-1 font-mono text-[11px] text-emerald-300"
                  >
                    <span>{f.badgeLabel}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedFmFiles((prev) => prev.filter((item) => item.id !== f.id))
                      }
                      aria-label={`Remove ${f.name}`}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {uploadedImages.map((img, idx) => (
                  <span
                    key={`${img.name}-${idx}`}
                    className="inline-flex items-center gap-1.5 rounded border border-[#734096] bg-[#34223f] px-2.5 py-1 font-mono text-[11px] text-[#ecc2ff]"
                  >
                    <span>{img.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setUploadedImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={`Remove ${img.name}`}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-[40px] items-center gap-1.5 rounded-[6px] border border-[#59515f] bg-[#202128] px-3 text-[12px] font-semibold text-[#f0edf4] hover:border-emerald-400 cursor-pointer shrink-0">
                <Upload className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">.fm / Export / Img</span>
                <input
                  type="file"
                  accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
                  multiple
                  onChange={(e) => {
                    void processIncomingFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (!e.target.value.startsWith('/')) {
                    setShowCommands(false);
                  }
                }}
                placeholder="Ask FM27 AI Analyst or drop .fm / screenshot / export… (type / for commands)"
                className="h-[40px] min-w-[180px] flex-1 rounded-[6px] border border-[#59515f] bg-[#202128] px-3.5 text-[13px] text-[#f0edf4] placeholder:text-[#9c92a6] focus:border-[#dc87ff] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => setShowCommands((v) => !v)}
                className="h-[40px] rounded-[5px] px-3 text-[12.5px] font-semibold text-[#f0edf4] hover:bg-white/10 cursor-pointer"
              >
                Commands
              </button>

              <button
                type="submit"
                disabled={
                  sending ||
                  Boolean(fmDecodeStage) ||
                  (!input.trim() && attachedFmFiles.length === 0 && uploadedImages.length === 0)
                }
                className="inline-flex h-[40px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] disabled:bg-[#2c2733] disabled:text-[#817887] cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Google Workspace Explicit Confirmation Modal */}
      {pendingMutation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sync-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/80 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-lg rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-[#39333f] pb-3">
              <h3 id="confirm-sync-title" className="fm-font-display text-[17px] font-bold text-white">
                Push Event #{pendingMutation.eventNumber} ({pendingMutation.title}) to Google Sheet &amp; Doc?
              </h3>
              <button
                type="button"
                onClick={() => setPendingMutation(null)}
                aria-label="Close confirmation modal"
                className="rounded p-1 text-[#b2acbb] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-[#d4ced8]">
              Confirming will append this grounded update directly to your linked Google Workspace files:
            </p>
            <ul className="list-disc space-y-1.5 rounded-[6px] border border-[#39333f] bg-[#18151f] p-3.5 pl-6 text-[12px] text-[#d4ced8]">
              {docUrlOrId.trim() && (
                <li>
                  Google Doc ({docInfo?.title || 'Linked Doc'}): Non-destructive insert above{' '}
                  <code className="text-emerald-300">[INSERT NEXT CHRONOLOGICAL EVENT HERE]</code>.
                </li>
              )}
              {sheetUrlOrId.trim() && (
                <li>
                  Google Sheet ({sheetMeta?.title || 'Linked Sheet'}): Append row to &ldquo;
                  {selectedMatchLogTab || 'Master Tab'}&rdquo;
                  {selectedChroniclesTab && selectedChroniclesTab !== selectedMatchLogTab
                    ? ` and "${selectedChroniclesTab}"`
                    : ''}
                  .
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingMutation(null)}
                className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-4 text-[12.5px] font-semibold text-[#f0edf4] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeConfirmedWorkspaceMutation()}
                className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] bg-emerald-600 px-4 text-[12.5px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span>Confirm &amp; Update Google Files</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Context Modal */}
      {contextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-context-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
            <div className="flex h-[56px] items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
              <h2 id="ai-context-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
                AI assistant context
              </h2>
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                aria-label="Close context dialog"
                className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-auto p-6">
              <p className="text-[13px] text-[#b2acbb]">
                Control which live save context blocks are injected into FM27 AI Analyst chats.
              </p>

              {/* Managed Club Card */}
              <div className="rounded-[8px] border border-[#39333f] bg-[#202128] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-[#dc87ff]" />
                    <div>
                      <div className="text-[13px] font-bold text-[#f0edf4]">
                        Managed club context
                      </div>
                      <div className="text-[12px] text-[#b2acbb]">
                        Active club: {aiContext.managedClubName || 'Awaiting .fm Save'}
                      </div>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#f0edf4] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiContext.includeManagedClub}
                      onChange={(e) =>
                        void onUpdateContext({ includeManagedClub: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#850be3]"
                    />
                    <span>Include in chat</span>
                  </label>
                </div>

                <div className="mt-3">
                  <select
                    aria-label="Managed club"
                    disabled={clubs.length === 0}
                    value={aiContext.managedClubName ?? ''}
                    onChange={(e) => void onUpdateContext({ managedClubName: e.target.value })}
                    className="h-[36px] w-full rounded-[5px] border border-[#59515f] bg-[#121116] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none disabled:opacity-50"
                  >
                    {clubs.length === 0 ? (
                      <option value="">Awaiting .fm Save</option>
                    ) : (
                      clubs.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} {c.competition ? `(${c.competition})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Dual-Phase Tactic Card */}
              <div className="rounded-[8px] border border-[#39333f] bg-[#202128] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-[#dc87ff]" />
                    <div>
                      <div className="text-[13px] font-bold text-[#f0edf4]">
                        Dual-Phase IP/OOP Tactic Context
                      </div>
                      <div className="text-[12px] text-[#b2acbb]">
                        {activeTactic
                          ? `${activeTactic.name} · ${activeTactic.formation} (${activeTactic.mentality})`
                          : 'No tactic selected'}
                      </div>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#f0edf4] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiContext.includeTactic}
                      onChange={(e) => void onUpdateContext({ includeTactic: e.target.checked })}
                      className="h-4 w-4 accent-[#850be3]"
                    />
                    <span>Include in chat</span>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    aria-label="Active tactic"
                    value={aiContext.activeTacticId ?? ''}
                    onChange={(e) =>
                      void onUpdateContext({ activeTacticId: e.target.value || null })
                    }
                    className="h-[36px] min-w-[220px] flex-1 rounded-[5px] border border-[#59515f] bg-[#121116] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  >
                    <option value="">No active tactic</option>
                    {aiContext.tactics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.formation}
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#2a2433] px-3 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload .fmf</span>
                    <input
                      type="file"
                      accept=".fmf,.json"
                      onChange={handleTacticUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {activeTactic && (
                  <div className="mt-3 rounded-[6px] border border-[#39333f] bg-[#141119] p-3 text-[11.5px]">
                    <div className="font-bold text-[#dc87ff]">
                      {activeTactic.formation} · {activeTactic.tacticalStyle} ({activeTactic.mentality})
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {activeTactic.slots.map((s) => (
                        <div key={s.slotIndex} className="flex justify-between gap-2 text-[#d4ced8]">
                          <span className="font-bold text-white">{s.position}</span>
                          <span className="truncate text-[#b2acbb]">
                            IP: {s.inPossessionRole} · OOP: {s.outOfPossessionRole}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex h-[56px] items-center justify-end border-t border-[#39333f] bg-[#202128] px-6">
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                className="inline-flex h-[36px] items-center rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortlists Modal */}
      {shortlistsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortlists-modal-title"
        >
          <div className="flex h-[min(640px,calc(100dvh-32px))] w-full max-w-[820px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
            <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
              <h2 id="shortlists-modal-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
                Transfer shortlists
              </h2>
              <button
                type="button"
                onClick={() => setShortlistsModalOpen(false)}
                aria-label="Close shortlists dialog"
                className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_1fr]">
              <div className="flex flex-col gap-3 border-r border-[#39333f] bg-[#15121b] p-4 overflow-y-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newShortlistName.trim()) return;
                    void onCreateShortlist(newShortlistName.trim(), newShortlistNotes.trim(), []);
                    setNewShortlistName('');
                    setNewShortlistNotes('');
                  }}
                  className="flex flex-col gap-2 border-b border-[#39333f] pb-3"
                >
                  <input
                    type="text"
                    placeholder="New shortlist name…"
                    value={newShortlistName}
                    onChange={(e) => setNewShortlistName(e.target.value)}
                    className="h-[34px] rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12.5px] text-white"
                  />
                  <input
                    type="text"
                    placeholder="Notes (optional)…"
                    value={newShortlistNotes}
                    onChange={(e) => setNewShortlistNotes(e.target.value)}
                    className="h-[34px] rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12.5px] text-white"
                  />
                  <button
                    type="submit"
                    disabled={!newShortlistName.trim()}
                    className="h-[32px] rounded-[5px] bg-[#850be3] text-[12px] font-semibold text-white disabled:opacity-45 cursor-pointer"
                  >
                    Create shortlist
                  </button>
                </form>

                {shortlists.map((sl) => (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => setSelectedShortlistId(sl.id)}
                    className={`flex flex-col items-start rounded-[5px] border px-3 py-2 text-left cursor-pointer ${
                      activeShortlist?.id === sl.id
                        ? 'border-[#734096] bg-[#34223f] text-white'
                        : 'border-transparent text-[#d4ced8] hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-[13px] font-bold truncate w-full">{sl.name}</span>
                    <span className="text-[11px] text-[#b2acbb]">
                      {sl.playerIds.length} players · {sl.createdBy}
                    </span>
                  </button>
                ))}
              </div>

              <div className="min-h-0 overflow-auto p-5">
                {activeShortlist ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#39333f] pb-3">
                      <div>
                        <h3 className="fm-font-display text-[18px] font-bold text-white">
                          {activeShortlist.name}
                        </h3>
                        {activeShortlist.notes && (
                          <p className="mt-1 text-[12px] text-[#b2acbb]">{activeShortlist.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => exportShortlistJson(activeShortlist)}
                          className="inline-flex h-[32px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[12px] font-semibold text-white cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Export JSON</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteShortlist(activeShortlist.id)}
                          className="inline-flex h-[32px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12px] font-semibold text-[#ff8fa2] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {players
                        .filter((p) => activeShortlist.playerIds.includes(p.id))
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setShortlistsModalOpen(false);
                              onSelectPlayer(p);
                            }}
                            className="flex w-full items-center justify-between rounded-[6px] border border-[#39333f] bg-[#18151f] px-3.5 py-2.5 text-left hover:border-[#dc87ff] cursor-pointer"
                          >
                            <div>
                              <div className="text-[13px] font-bold text-white">{p.name}</div>
                              <div className="text-[11.5px] text-[#b2acbb]">
                                {p.club || 'Free Agent'} · {p.positionText} · Age {p.age ?? '—'}
                              </div>
                            </div>
                            <span className="font-mono text-[12px] font-bold text-[#ecc2ff]">
                              CA {p.ca ?? '—'} / PA {p.pa ?? '—'}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#b2acbb]">No shortlist selected.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
