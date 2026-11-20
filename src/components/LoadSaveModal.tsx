import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileArchive,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { createEmptySnapshot } from '../domain/emptyState';
import {
  detectFmFileHeader,
  normalizeImportedSavePayload,
  parseFmStructuredExport,
} from '../domain/fmSaveImport';
import type {
  FmSaveImportSummary,
  NormalizedSaveImport,
  SaveImportScope,
} from '../domain/fmSaveImport';
import type { TacticDefinition, WorkspaceSnapshot } from '../domain/types';
import {
  cancelFmSaveDecode,
  decodeFmSaveFile,
  type FmSaveProgressStage,
} from '../services/fmSaveReader';

interface LoadSaveModalProps {
  open: boolean;
  currentSnapshot: WorkspaceSnapshot;
  managedClubName: string | null;
  onApplyImportedSave: (payload: {
    snapshot: WorkspaceSnapshot;
    managedClubName?: string | null;
    tactics?: TacticDefinition[];
  }) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  onClose: () => void;
}

const SCOPE_OPTIONS: {
  id: SaveImportScope;
  title: string;
  subtitle: string;
}[] = [
  {
    id: 'managed_only',
    title: 'My Managed Club Only (Fastest · Mobile-Safe Default)',
    subtitle: 'Full managed squad, backroom staff, finances, fixtures & tactics with minimal RAM usage',
  },
  {
    id: 'scouting_pool',
    title: 'My Club + Top Scouting Pool (Desktop Recommended)',
    subtitle: 'Full managed club + top 1,500 players globally for transfer scouting',
  },
  {
    id: 'extended_pool',
    title: 'My Club + Extended Scouting Pool',
    subtitle: 'Full managed club + top 3,200 players & 500 staff globally (heavier browser RAM)',
  },
];

export function LoadSaveModal({
  open,
  currentSnapshot,
  managedClubName,
  onApplyImportedSave,
  onResetWorkspace,
  onClose,
}: LoadSaveModalProps) {
  const [scope, setScope] = useState<SaveImportScope>('managed_only');
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [stageInfo, setStageInfo] = useState<FmSaveProgressStage | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<NormalizedSaveImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!parsing) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [parsing]);

  if (!open) return null;

  function handleCancelDecode() {
    if (parsing) {
      cancelFmSaveDecode();
      setParsing(false);
      setStageInfo(null);
    }
  }

  function handleClose() {
    handleCancelDecode();
    setErrorMsg(null);
    onClose();
  }

  async function processFile(file: File) {
    setErrorMsg(null);
    setParsedResult(null);

    const headSlice = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const fileKind = detectFmFileHeader(headSlice, file.name);

    // 1. JSON snapshot import
    if (fileKind === 'json_snapshot') {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as WorkspaceSnapshot;
        if (!Array.isArray(parsed.players) || !Array.isArray(parsed.clubs)) {
          setErrorMsg('This JSON file is not a valid FM27 Command Hub snapshot.');
          return;
        }
        setApplying(true);
        const managed =
          parsed.metadata?.managedClubName ?? parsed.clubs[0]?.name ?? null;
        await onApplyImportedSave({ snapshot: parsed, managedClubName: managed });
        setApplying(false);
        onClose();
        return;
      } catch {
        setApplying(false);
        setErrorMsg('Could not parse this JSON snapshot file.');
        return;
      }
    }

    // 2. HTML / CSV / RTF FM view export
    if (
      fileKind === 'html_export' ||
      fileKind === 'csv_export' ||
      fileKind === 'rtf_export'
    ) {
      try {
        const text = await file.text();
        const parsedExport = parseFmStructuredExport(text, file.name);
        if (parsedExport.players.length === 0) {
          setErrorMsg(
            'No player rows were found in this export. Make sure the FM export includes a Name column.',
          );
          return;
        }

        const base =
          currentSnapshot.metadata.status === 'loaded'
            ? currentSnapshot
            : createEmptySnapshot();

        const clubName =
          parsedExport.detectedClub ||
          managedClubName ||
          base.metadata.managedClubName ||
          null;

        const mergedClubs = [...base.clubs];
        if (
          clubName &&
          !mergedClubs.some((c) => c.name.toLowerCase() === clubName.toLowerCase())
        ) {
          mergedClubs.unshift({
            id: 9001,
            uniqueId: 9001,
            name: clubName,
            competition: null,
            nation: null,
            reputation: null,
            trainingFacilities: null,
            youthFacilities: null,
            youthCoaching: null,
            youthRecruitment: null,
            corporateFacilities: null,
            balance: null,
            transferBudget: null,
            payrollBudgetWeekly: null,
            currentWagesWeekly: null,
            financialDate: parsedExport.detectedDate ?? base.metadata.gameDate,
            loans: [],
            income: [],
            expenditure: [],
            coefficients: null,
          });
        }

        const snap: WorkspaceSnapshot = {
          ...base,
          metadata: {
            ...base.metadata,
            status: 'loaded',
            game: base.metadata.game || 'FM27',
            saveName: file.name,
            gameDate: parsedExport.detectedDate ?? base.metadata.gameDate,
            gameDateDmy: parsedExport.detectedDate ?? base.metadata.gameDateDmy,
            loadedAt: new Date().toISOString(),
            sourceLabel: `FM Export (${file.name})`,
            freshness: 'current',
            managedClubName: clubName,
            totalPlayersInWorld: parsedExport.players.length,
            totalClubsInWorld: mergedClubs.length,
          },
          players: parsedExport.players,
          clubs: mergedClubs,
        };
        setApplying(true);
        await onApplyImportedSave({ snapshot: snap, managedClubName: clubName });
        setApplying(false);
        onClose();
        return;
      } catch {
        setApplying(false);
        setErrorMsg('Could not parse this HTML/CSV/RTF export file.');
        return;
      }
    }

    // 3. Real FM26 / FM27 .fm binary save file parsed locally in Pyodide 3.14 Web Worker
    if (fileKind !== 'fm_save') {
      setErrorMsg(
        'Unsupported file type. Drop an FM26/FM27 .fm save file, a .json snapshot, or an FM .html/.csv/.rtf export.',
      );
      return;
    }

    setParsing(true);
    setStageInfo({
      stage: 'boot',
      step: 'Step 1/6',
      label: 'Starting local Python 3.14 + fmsave 0.14.1 WebAssembly worker…',
      percent: 4,
    });

    try {
      const rawDecoded = await decodeFmSaveFile(
        file,
        { scope, clubHint: managedClubName },
        (stage) => setStageInfo(stage),
      );
      const normalized = normalizeImportedSavePayload(rawDecoded);
      setParsedResult(normalized);
      setParsing(false);
      setStageInfo({
        stage: 'done',
        step: 'Step 6/6',
        label: 'Save decoded and verified locally.',
        percent: 100,
      });
    } catch (err: unknown) {
      setParsing(false);
      setStageInfo(null);
      if (err instanceof Error && err.message === 'CANCELLED_BY_USER') {
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to decode this .fm save file.',
      );
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  }

  async function handleConfirmApply() {
    if (!parsedResult) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      await onApplyImportedSave({
        snapshot: parsedResult.snapshot,
        managedClubName: parsedResult.managedClubName,
        tactics: parsedResult.tactics,
      });
      setApplying(false);
      setParsedResult(null);
      onClose();
    } catch (err) {
      setApplying(false);
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not apply parsed save to workspace.',
      );
    }
  }

  async function handleReset() {
    setResetting(true);
    setErrorMsg(null);
    try {
      await onResetWorkspace();
      setParsedResult(null);
      onClose();
    } finally {
      setResetting(false);
    }
  }

  const summary: FmSaveImportSummary | null = parsedResult?.summary ?? null;
  const progressPct = stageInfo?.percent ?? 8;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/80 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-save-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#39333f] bg-[#202128] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#734096] bg-[#34223f] text-[#dc87ff]">
              <FileArchive className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="load-save-modal-title"
                className="fm-font-display text-[19px] font-bold leading-tight text-[#f0edf4]"
              >
                Load FM27 Save File (.fm) or Export
              </h2>
              <p className="text-[12px] text-[#b2acbb]">
                Decode locally via Pyodide 3.14 + fmsave 0.14.1 zero-copy WORKERFS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close load save dialog"
            className="rounded p-1.5 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {/* Active loaded save info bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#39333f] bg-[#18151f] px-4 py-2.5 text-[12px]">
            <div className="flex items-center gap-2 text-[#d4ced8]">
              <Database className="h-3.5 w-3.5 text-[#dc87ff]" />
              <span>
                Status:{' '}
                <strong className="text-white">
                  {currentSnapshot.metadata.status === 'loaded'
                    ? currentSnapshot.metadata.sourceLabel
                    : 'Awaiting .fm Save'}
                </strong>
                {managedClubName ? ` · Club: ${managedClubName}` : ''}
              </span>
            </div>
            <span className="tabular-nums text-[#b2acbb]">
              {currentSnapshot.players.length} players · {currentSnapshot.clubs.length} clubs
            </span>
          </div>

          {/* Import Scope Selector */}
          {!parsedResult && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
                Extraction Scope (Mobile-Safe Default: Managed Club Only)
              </div>
              <div className="grid grid-cols-1 gap-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const active = scope === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={parsing}
                      onClick={() => setScope(opt.id)}
                      className={`flex flex-col items-start rounded-[6px] border px-3.5 py-2.5 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                        active
                          ? 'border-[#850be3] bg-[#2a1a38]'
                          : 'border-[#39333f] bg-[#18151f] hover:border-[#59515f]'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-[13px] font-semibold text-[#f0edf4]">{opt.title}</span>
                        <span
                          className={`h-3.5 w-3.5 rounded-full border ${
                            active
                              ? 'border-[#dc87ff] bg-[#850be3]'
                              : 'border-[#59515f] bg-transparent'
                          }`}
                        />
                      </div>
                      <span className="mt-0.5 text-[11.5px] text-[#b2acbb]">{opt.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dropzone */}
          {!parsing && !parsedResult && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[8px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
                dragging
                  ? 'border-[#dc87ff] bg-[#2d1c3d]'
                  : 'border-[#59515f] bg-[#16131c] hover:border-[#dc87ff]/80 hover:bg-[#1e1727]'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[14px] font-bold text-white">
                  Drop your FM27 <code className="text-[#dc87ff]">.fm</code> save file here, or click to browse
                </p>
                <p className="mt-1 text-[12px] text-[#b2acbb]">
                  Supports <code className="text-[#d4ced8]">.fm</code> (FM26/FM27),{' '}
                  <code className="text-[#d4ced8]">.json</code> snapshots, and{' '}
                  <code className="text-[#d4ced8]">.html</code> /{' '}
                  <code className="text-[#d4ced8]">.csv</code> /{' '}
                  <code className="text-[#d4ced8]">.rtf</code> exports
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".fm,.json,.html,.htm,.csv,.rtf"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          )}

          {/* Local Privacy & Folder Hint */}
          {!parsing && !parsedResult && (
            <div className="flex flex-col gap-1.5 rounded-[6px] border border-[#39333f]/80 bg-[#15121b] px-4 py-3 text-[11.5px] leading-relaxed text-[#b2acbb]">
              <div className="flex items-center gap-2 font-semibold text-[#89f0c0]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Parsed 100% locally in your browser via fmsave — your .fm file is never uploaded</span>
              </div>
              <div className="flex items-start gap-2 text-[#b2acbb]">
                <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9c92a6]" />
                <span>
                  Typical save folder:{' '}
                  <code className="text-[#d4ced8]">
                    Documents/Sports Interactive/Football Manager 27/games/
                  </code>
                </span>
              </div>
            </div>
          )}

          {/* Active Parsing Progress (6-step + Timer + Cancel) */}
          {parsing && (
            <div className="flex flex-col items-center gap-3 rounded-[8px] border border-[#734096]/60 bg-[#1b1424] px-6 py-7 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#dc87ff]" />
              <h3 className="fm-font-display text-[17px] font-bold text-white">
                Reading Football Manager Save Locally
              </h3>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#2a2330]">
                <div
                  className="h-full rounded-full bg-[#850be3] transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.min(100, progressPct))}%` }}
                />
              </div>
              <div className="flex w-full items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-[#dc87ff] text-left">
                  {stageInfo?.step ? `${stageInfo.step} · ` : ''}
                  {stageInfo?.label || 'Decoding save…'}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[#b2acbb]">
                  {progressPct}% · {elapsedSec}s
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelDecode}
                className="mt-1 inline-flex h-[32px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#ff758b] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel Decode</span>
              </button>
            </div>
          )}

          {/* Parsed Save Summary Preview */}
          {summary && parsedResult && (
            <div className="flex flex-col gap-3 rounded-[8px] border border-[#19d88b]/40 bg-[#13221d] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#19d88b]" />
                  <div>
                    <h3 className="fm-font-display text-[16px] font-bold text-white">
                      {summary.saveName}
                    </h3>
                    <p className="text-[12px] text-[#a7dec6]">
                      {summary.game} build {summary.build} · Date{' '}
                      {summary.gameDateDmy || summary.gameDate || '--'} · fmsave v
                      {summary.fmsaveVersion}
                    </p>
                  </div>
                </div>
                {summary.managedClubName && (
                  <span className="rounded bg-[#34223f] px-2.5 py-1 text-[12px] font-bold text-[#ecc2ff]">
                    {summary.managedClubName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    label: 'Your Squad',
                    value: String(summary.managedSquadCount),
                    sub: `${summary.importedPlayers.toLocaleString()} total loaded`,
                  },
                  {
                    label: 'Staff Loaded',
                    value: summary.importedStaff.toLocaleString(),
                    sub: `${summary.managedStaffCount} at your club`,
                  },
                  {
                    label: 'Clubs & Finances',
                    value: summary.importedClubs.toLocaleString(),
                    sub: `of ${summary.totalClubsInSave.toLocaleString()} in save`,
                  },
                  {
                    label: 'Matches / Tactics',
                    value: `${summary.importedMatchLogs} / ${summary.importedTactics}`,
                    sub: summary.managerName ? `Mgr: ${summary.managerName}` : 'Ready for Hub',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[6px] border border-white/10 bg-[#121116]/80 px-3 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#b2acbb]">
                      {stat.label}
                    </div>
                    <div className="mt-0.5 text-[16px] font-bold text-white tabular-nums">
                      {stat.value}
                    </div>
                    <div className="truncate text-[11px] text-[#9c92a6]">{stat.sub}</div>
                  </div>
                ))}
              </div>

              {summary.warnings.length > 0 && (
                <div className="rounded-[5px] border border-[#f5c451]/35 bg-[#2d2515] px-3 py-2 text-[11.5px] text-[#f7d98b]">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Reader notes ({summary.warnings.length})</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {summary.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[6px] border border-[#ff758b]/40 bg-[#40212b] px-4 py-3 text-[12.5px] text-[#ffb5c1]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ff758b]" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#39333f] bg-[#202128] px-6 py-3.5">
          <button
            type="button"
            disabled={parsing || applying || resetting}
            onClick={() => void handleReset()}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#18151f] px-3.5 text-[12.5px] font-semibold text-[#d4ced8] hover:border-[#ff758b] hover:text-white disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>Reset Workspace</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-[36px] items-center rounded-[5px] border border-[#59515f] bg-transparent px-4 text-[13px] font-semibold text-[#f0edf4] hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>

            {parsedResult && (
              <button
                type="button"
                disabled={applying}
                onClick={() => void handleConfirmApply()}
                className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] disabled:opacity-60 cursor-pointer"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Applying save…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Fill Workspace with My Save</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
