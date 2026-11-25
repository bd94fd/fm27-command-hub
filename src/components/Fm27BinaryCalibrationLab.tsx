import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  GitCompare,
  Info,
  Layers,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import {
  DeepTacticRecord,
  PatchCompatibilitySectionStatus,
  RawTacticSettingUnit,
  TacticSlotAssignment,
} from '../types/fmSave';
import type { DecodedFmSavePayload } from '../utils/fmSaveHydrator';
import {
  applyDictionaryMerge,
  buildRoleCoreKey,
  CompactBinaryDiffSnapshot,
  computeFmBinaryDiff,
  countDictionaryMappings,
  decodePlayerInstructionsFromDictionary,
  decodeRoleFromDictionary,
  decodeTeamInstructionsFromDictionary,
  deleteDictionaryRule,
  DictionaryMergePreview,
  exportAnonymizedProbeSummary,
  exportDictionaryJson,
  FM27_PLAYER_INSTRUCTION_CATALOG,
  FM27_PRESET_STYLES,
  FM27_TEAM_INSTRUCTION_CATALOG,
  Fm27BinaryDictionary,
  GovernanceTargetField,
  GovernanceValueEncoding,
  loadFm27BinaryDictionary,
  previewDictionaryMerge,
  resetFm27BinaryDictionary,
  TeamInstructionPhase,
  upsertGovernanceOffsetRule,
  upsertPlayerInstructionMapping,
  upsertRoleDictionaryMapping,
  upsertStyleCodeMapping,
  upsertTeamInstructionMapping,
} from '../utils/fm27BinaryDictionary';
import { getValidFm27RolesForSlot } from '../utils/fm27TacticRoleInference';
import {
  decodeFm27RoleFromBinary,
  decodeFm27TeamInstructionsFromBytes,
} from '../utils/fm27NativeBinaryDecoder';
import { listSaveHistoryPoints, SaveHistoryPoint } from '../services/saveCache';
import { decodeFmSaveFile } from '../services/fmSaveReader';
import {
  buildFm27AgentHandoff,
  buildPatchDiagnosticReport,
  describeFm27HandoffVerdict,
  describePatchLayout,
  formatFm27AgentHandoff,
  isNewFm27BuildDetected,
} from '../utils/fm27PatchDiagnostics';
import { getFm27BuildProfile } from '../utils/fm27BuildMemory';

export type CalibrationLabTab = 'roles' | 'instructions' | 'diff' | 'governance';

interface Fm27BinaryCalibrationLabProps {
  isOpen: boolean;
  initialTab?: CalibrationLabTab;
  decodedPayload: DecodedFmSavePayload | null;
  players: PlayerRecord[];
  onClose: () => void;
  onDictionaryChanged: () => void;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatBytes(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '--';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const PATCH_SECTION_CHIP_STYLES: Record<PatchCompatibilitySectionStatus, string> = {
  clean: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  patched: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
  fallback: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  unavailable: 'border-slate-700 bg-slate-900 text-slate-400',
};

function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise<void>((resolve, reject) => {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'true');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      if (copied) resolve();
      else reject(new Error('Clipboard copy was rejected.'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Clipboard copy failed.'));
    }
  });
}

export const Fm27BinaryCalibrationLab: React.FC<Fm27BinaryCalibrationLabProps> = ({
  isOpen,
  initialTab = 'roles',
  decodedPayload,
  players: _players,
  onClose,
  onDictionaryChanged,
}) => {
  const [activeTab, setActiveTab] = useState<CalibrationLabTab>(initialTab);
  const [dict, setDict] = useState<Fm27BinaryDictionary>(() => loadFm27BinaryDictionary());
  const [selectedTacticIdx, setSelectedTacticIdx] = useState(0);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Team instruction byte binder state
  const [selectedTiByteIdx, setSelectedTiByteIdx] = useState<number | null>(null);
  const [tiBindPhase, setTiBindPhase] = useState<TeamInstructionPhase>('in_possession');
  const [tiBindCategory, setTiBindCategory] = useState<string>('Passing Directness');
  const [tiBindLabel, setTiBindLabel] = useState<string>('Shorter Passing');
  const [tiBindMatchType, setTiBindMatchType] = useState<'exact_value' | 'bitmask'>('exact_value');

  // Player instruction unit binder state
  const [selectedPiSlotIdx, setSelectedPiSlotIdx] = useState(0);
  const [selectedPiPhase, setSelectedPiPhase] = useState<'ip' | 'oop'>('ip');

  // Diff Lab state
  const [historySnapshots, setHistorySnapshots] = useState<SaveHistoryPoint[]>([]);
  const [diffSourceAKey, setDiffSourceAKey] = useState<string>('current');
  const [diffSourceBKey, setDiffSourceBKey] = useState<string>('uploaded_b');
  const [uploadedDiffSnap, setUploadedDiffSnap] = useState<CompactBinaryDiffSnapshot | null>(null);
  const [diffLoadingMsg, setDiffLoadingMsg] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const diffFileInputRef = useRef<HTMLInputElement | null>(null);

  // Governance offset quick-bind state (in Diff Lab & Probes)
  const [govBindTarget, setGovBindTarget] = useState<GovernanceTargetField>('board_confidence');
  const [govBindEncoding, setGovBindEncoding] = useState<GovernanceValueEncoding>('u8_percent_0_100');

  // JSON Import / Merge state
  const [importJsonText, setImportJsonText] = useState('');
  const [mergePreview, setMergePreview] = useState<DictionaryMergePreview | null>(null);
  const [overwriteConflicts, setOverwriteConflicts] = useState(false);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setDict(loadFm27BinaryDictionary());
      listSaveHistoryPoints()
        .then((pts) => setHistorySnapshots(pts.filter((p) => Boolean(p.binaryDiffSnapshot))))
        .catch(() => setHistorySnapshots([]));
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!statusNotice) return;
    const t = setTimeout(() => setStatusNotice(null), 4000);
    return () => clearTimeout(t);
  }, [statusNotice]);

  const tactics: DeepTacticRecord[] = decodedPayload?.tactics || [];
  const activeTactic = tactics[selectedTacticIdx] || tactics[0] || null;
  const forensics = decodedPayload?.binaryForensics || null;
  const mappingCounts = useMemo(() => countDictionaryMappings(dict), [dict]);
  const patchCompat = decodedPayload?.meta?.patchCompatibility ?? null;
  const buildProfile = useMemo(() => {
    if (!decodedPayload) return null;
    return getFm27BuildProfile(
      decodedPayload.meta.build,
      decodedPayload.meta.fmsaveVersion
    );
  }, [decodedPayload]);
  const priorBuildRuns = Math.max(0, (buildProfile?.seenCount ?? 0) - 1);
  const newBuildDetected =
    isNewFm27BuildDetected(patchCompat) && priorBuildRuns === 0;
  const handoffVerdict = useMemo(
    () => describeFm27HandoffVerdict(patchCompat, buildProfile),
    [patchCompat, buildProfile]
  );

  const notifySaved = (nextDict: Fm27BinaryDictionary, msg: string) => {
    setDict(nextDict);
    setStatusNotice(msg);
    onDictionaryChanged();
  };

  const handleCopyPatchDiagnosticReport = () => {
    copyTextToClipboard(buildPatchDiagnosticReport(decodedPayload))
      .then(() => setStatusNotice('Patch diagnostic report copied to clipboard.'))
      .catch(() => setStatusNotice('Could not copy the patch diagnostic report automatically.'));
  };

  const handleCopyAgentHandoff = () => {
    copyTextToClipboard(
      formatFm27AgentHandoff(buildFm27AgentHandoff(decodedPayload, buildProfile))
    )
      .then(() => setStatusNotice('Agent handoff packet copied to clipboard.'))
      .catch(() => setStatusNotice('Could not copy the agent handoff packet automatically.'));
  };

  // Current active save as a CompactBinaryDiffSnapshot
  const currentBinarySnapshot = useMemo<CompactBinaryDiffSnapshot | null>(() => {
    if (!decodedPayload) return null;
    return {
      label: `Current Save (${decodedPayload.meta.gameDateDmy || decodedPayload.meta.saveName})`,
      inGameDate: decodedPayload.meta.gameDateDmy || 'Current',
      fmBuild: decodedPayload.meta.build,
      tactics: decodedPayload.tactics || [],
      binaryForensics: decodedPayload.binaryForensics ?? null,
    };
  }, [decodedPayload]);

  const availableDiffSnapshots = useMemo(() => {
    const list: Array<{ key: string; label: string; snap: CompactBinaryDiffSnapshot }> = [];
    if (currentBinarySnapshot) {
      list.push({
        key: 'current',
        label: currentBinarySnapshot.label,
        snap: currentBinarySnapshot,
      });
    }
    if (uploadedDiffSnap) {
      list.push({
        key: 'uploaded_b',
        label: `Loaded Compare: ${uploadedDiffSnap.label}`,
        snap: uploadedDiffSnap,
      });
    }
    for (const pt of historySnapshots) {
      if (pt.binaryDiffSnapshot) {
        list.push({
          key: pt.cacheKey,
          label: `${pt.inGameDate} · ${pt.saveName}`,
          snap: pt.binaryDiffSnapshot,
        });
      }
    }
    return list;
  }, [currentBinarySnapshot, uploadedDiffSnap, historySnapshots]);

  const snapA =
    availableDiffSnapshots.find((item) => item.key === diffSourceAKey)?.snap ??
    availableDiffSnapshots[0]?.snap ??
    null;
  const snapB =
    availableDiffSnapshots.find((item) => item.key === diffSourceBKey)?.snap ??
    (availableDiffSnapshots.length > 1 ? availableDiffSnapshots[1].snap : null);

  const diffReport = useMemo(() => {
    if (!snapA || !snapB || snapA === snapB) return null;
    return computeFmBinaryDiff(snapA, snapB);
  }, [snapA, snapB]);

  const nativeTi = useMemo(() => {
    if (!activeTactic) return null;
    return decodeFm27TeamInstructionsFromBytes(
      activeTactic.teamInstructions?.rawTeamInstructionBytes,
      activeTactic.teamInstructions?.styleCode
    );
  }, [activeTactic]);

  const decodedTi = useMemo(() => {
    if (!activeTactic) return null;
    const base = decodeTeamInstructionsFromDictionary(dict, {
      rawBytes: activeTactic.teamInstructions?.rawTeamInstructionBytes,
      styleCode: activeTactic.teamInstructions?.styleCode,
    });
    if (!nativeTi) return base;
    return {
      ...base,
      styleName: base.styleName || nativeTi.styleName,
      byteDetails: base.byteDetails.map((bd) => {
        const nativeLabels = nativeTi.labelsByByteIndex[bd.index] || [];
        return {
          ...bd,
          decodedLabels: Array.from(new Set([...nativeLabels, ...bd.decodedLabels])),
        };
      }),
    };
  }, [dict, activeTactic, nativeTi]);

  if (!isOpen) return null;

  const handleLoadComparisonFmSave = async (file: File) => {
    setDiffError(null);
    setDiffLoadingMsg(`Reading ${file.name} locally (fast binary scan — active career untouched)...`);
    try {
      const parsed = await decodeFmSaveFile(
        file,
        (prog) => setDiffLoadingMsg(prog.label),
        {
          clubHint: decodedPayload?.meta?.clubName || '',
          fastSync: true,
        }
      );
      const snap: CompactBinaryDiffSnapshot = {
        label: `${parsed.meta.gameDateDmy || 'Compare'} · ${file.name}`,
        inGameDate: parsed.meta.gameDateDmy || 'Unknown',
        fmBuild: parsed.meta.build,
        tactics: parsed.tactics || [],
        binaryForensics: parsed.binaryForensics ?? null,
      };
      setUploadedDiffSnap(snap);
      setDiffSourceBKey('uploaded_b');
      setDiffLoadingMsg(null);
      setStatusNotice(`Loaded ${file.name} for side-by-side binary diffing.`);
    } catch (err) {
      setDiffLoadingMsg(null);
      setDiffError(err instanceof Error ? err.message : 'Could not decode comparison .fm file.');
    }
  };

  const handleBindRole = (
    slot: TacticSlotAssignment,
    phase: 'ip' | 'oop',
    roleName: string,
    provenance: 'user_confirmed' | 'diff_calibrated' = 'user_confirmed'
  ) => {
    if (!roleName) return;
    const pos = phase === 'ip' ? slot.position : slot.outOfPossessionPosition || slot.position;
    const roleBits = phase === 'ip' ? slot.ipRoleBits : slot.oopRoleBits;
    const trailBits = phase === 'ip' ? slot.ipTrailBits : slot.oopTrailBits;
    const coreSig = phase === 'ip' ? slot.ipRoleCoreSignature : slot.oopRoleCoreSignature;
    const next = upsertRoleDictionaryMapping(dict, {
      positionCode: pos,
      phase,
      roleBits,
      trailBits,
      roleCoreSignature: coreSig,
      roleName,
      provenance,
    });
    notifySaved(next, `Bound ${pos} ${phase.toUpperCase()} (${coreSig || roleBits || 'bits'}) → ${roleName}`);
  };

  const handleBindTiByte = (
    byteIndex: number,
    byteVal: number,
    matchType: 'exact_value' | 'bitmask',
    phase: TeamInstructionPhase,
    category: string,
    label: string
  ) => {
    const next = upsertTeamInstructionMapping(dict, {
      byteIndex,
      matchType,
      matchValue: byteVal,
      phase,
      category,
      label,
      provenance: 'diff_calibrated',
    });
    notifySaved(
      next,
      `Bound TI[${String(byteIndex).padStart(2, '0')}] = 0x${(byteVal & 0xff).toString(16).padStart(2, '0')} → ${label}`
    );
  };

  const handleBindPiUnit = (phase: 'ip' | 'oop', unit: RawTacticSettingUnit, label: string) => {
    if (!label) return;
    const next = upsertPlayerInstructionMapping(dict, {
      phase,
      unitSignature: unit.signature,
      label,
      provenance: 'diff_calibrated',
    });
    notifySaved(next, `Bound ${phase.toUpperCase()} unit ${unit.signature} → ${label}`);
  };

  const handleBindGovOffset = (
    section: string,
    anchorLabel: string,
    relOffset: number,
    targetField: GovernanceTargetField,
    encoding: GovernanceValueEncoding
  ) => {
    const next = upsertGovernanceOffsetRule(dict, {
      targetField,
      section,
      anchorLabel,
      relOffset,
      encoding,
      provenance: 'diff_calibrated',
    });
    notifySaved(next, `Bound ${section}.${anchorLabel} +${relOffset} → ${targetField}`);
  };

  const handleImportJsonPreview = (rawText: string) => {
    setImportJsonText(rawText);
    if (!rawText.trim()) {
      setMergePreview(null);
      return;
    }
    setMergePreview(previewDictionaryMerge(dict, rawText));
  };

  const handleApplyImportMerge = () => {
    if (!mergePreview?.valid || !mergePreview.incoming) return;
    const next = applyDictionaryMerge(dict, mergePreview.incoming, overwriteConflicts);
    setImportJsonText('');
    setMergePreview(null);
    notifySaved(
      next,
      `Merged dictionary rules (${mergePreview.stats.newRoles + mergePreview.stats.newTeamInstructions + mergePreview.stats.newPlayerInstructions + mergePreview.stats.newStyleCodes + mergePreview.stats.newGovernanceRules} new).`
    );
  };

  const categoryItemsForPhase = FM27_TEAM_INSTRUCTION_CATALOG.filter((c) => c.phase === tiBindPhase);
  const activeCatalogOptions =
    categoryItemsForPhase.find((c) => c.category === tiBindCategory)?.options ||
    categoryItemsForPhase[0]?.options ||
    [];

  const activePiSlot = activeTactic?.slots?.[selectedPiSlotIdx] || activeTactic?.slots?.[0] || null;
  const activePiUnits =
    selectedPiPhase === 'ip'
      ? activePiSlot?.ipSettingUnits || []
      : activePiSlot?.oopSettingUnits || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="FM27 Binary Calibration Lab"
    >
      <div className="flex flex-col w-full max-w-6xl max-h-[92vh] rounded-xl border border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-2xl">
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-900/70">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
              FM27 Binary Calibration Lab
            </h2>
            <p className="text-xs text-slate-400">
              <span>Build {decodedPayload?.meta?.build || dict.fmBuild}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums">{mappingCounts.total} mapped binary rules</span>
              <span aria-hidden="true"> · </span>
              <span>100% local .fm decoding</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyPatchDiagnosticReport}
              disabled={!decodedPayload}
              title="Copy a compact patch diagnostic summary for adapting the layout to a new FM27 build"
              aria-label="Copy Patch Diagnostic Report"
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-sky-500/50 hover:text-white transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5 text-sky-400" /> Copy Patch Diagnostic Report
            </button>
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  `fm27-binary-dictionary-${(decodedPayload?.meta?.build || '27.1.0').replace(/[^a-z0-9.+-]/gi, '_')}.json`,
                  exportDictionaryJson(dict)
                )
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:text-white transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" /> Export JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Calibration Lab"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Segmented Tab Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-slate-800 bg-slate-950">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
            {(
              [
                { id: 'roles', label: 'Role IDs', icon: Shield, count: mappingCounts.roles },
                {
                  id: 'instructions',
                  label: 'Team & Player Instr',
                  icon: Sliders,
                  count: mappingCounts.teamInstructions + mappingCounts.playerInstructions,
                },
                { id: 'diff', label: 'Save Diff Lab (.fm)', icon: GitCompare, count: null },
                {
                  id: 'governance',
                  label: 'Governance & JSON',
                  icon: FileCode2,
                  count: mappingCounts.governanceRules,
                },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                  {t.count !== null && (
                    <span className="font-mono tabular-nums text-[11px] opacity-80">({t.count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {tactics.length > 1 && (activeTab === 'roles' || activeTab === 'instructions') && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              {tactics.slice(0, 3).map((tac, idx) => (
                <button
                  key={`${tac.name}-${idx}`}
                  type="button"
                  onClick={() => setSelectedTacticIdx(idx)}
                  className={`min-h-[32px] px-2.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedTacticIdx === idx
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Slot {idx + 1}: {tac.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live Feedback Strip */}
        {statusNotice && (
          <div className="px-4 sm:px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Calm future-patch notice — informational, never blocks extraction */}
        {newBuildDetected && patchCompat && (
          <div className="px-4 sm:px-6 py-2.5 bg-sky-500/10 border-b border-sky-500/30 text-xs text-sky-200 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Info className="h-3.5 w-3.5 shrink-0 text-sky-300" />
            <span className="font-semibold text-sky-100">New FM27 Build Detected</span>
            <span className="text-sky-200/80">
              {patchCompat.detectedBuild} · {describePatchLayout(patchCompat)} · extraction
              continued with dynamic layout inheritance
            </span>
            <button
              type="button"
              onClick={handleCopyPatchDiagnosticReport}
              className="min-h-[26px] inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-2 text-[11px] font-medium text-sky-100 hover:border-sky-400/60 hover:bg-sky-500/20"
            >
              <Copy className="h-3 w-3" /> Copy Patch Diagnostic Report
            </button>
          </div>
        )}

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* TAB 1: ROLE IDs */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  Decoupled IP &amp; OOP Role Bitfield Table
                </h3>
                <p className="text-xs text-slate-400 max-w-3xl">
                  Role bindings key on each slot&apos;s raw position bucket, phase, and decoupled{' '}
                  <span className="font-mono text-slate-300">roleBits + trailBits</span>—so adding or
                  toggling individual Player Instructions never breaks role matching across future
                  saves.
                </p>
              </div>

              {!activeTactic || !activeTactic.slots?.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center text-xs text-slate-400">
                  Import a live FM27 <span className="font-mono">.fm</span> save to inspect tactic
                  slot binary role IDs.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-medium">Slot / Starter</th>
                        <th className="py-2.5 px-3 font-medium">IP Core Signature</th>
                        <th className="py-2.5 px-3 font-medium">Bind In-Possession Role</th>
                        <th className="py-2.5 px-3 font-medium">OOP Core Signature</th>
                        <th className="py-2.5 px-3 font-medium">Bind Out-of-Possession Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {activeTactic.slots.map((sl, idx) => {
                        const ipPos = sl.position || `Slot ${idx + 1}`;
                        const oopPos = sl.outOfPossessionPosition || ipPos;
                        const ipCore = buildRoleCoreKey({
                          roleBits: sl.ipRoleBits,
                          trailBits: sl.ipTrailBits,
                          roleCoreSignature: sl.ipRoleCoreSignature,
                        });
                        const oopCore = buildRoleCoreKey({
                          roleBits: sl.oopRoleBits,
                          trailBits: sl.oopTrailBits,
                          roleCoreSignature: sl.oopRoleCoreSignature,
                        });
                        const ipDictHit = decodeRoleFromDictionary(dict, {
                          positionCode: ipPos,
                          phase: 'ip',
                          roleBits: sl.ipRoleBits,
                          trailBits: sl.ipTrailBits,
                          roleCoreSignature: sl.ipRoleCoreSignature,
                        });
                        const oopDictHit = decodeRoleFromDictionary(dict, {
                          positionCode: oopPos,
                          phase: 'oop',
                          roleBits: sl.oopRoleBits,
                          trailBits: sl.oopTrailBits,
                          roleCoreSignature: sl.oopRoleCoreSignature,
                        });
                        const ipNativeHit = decodeFm27RoleFromBinary({
                          phase: 'ip',
                          settingUnits: sl.ipSettingUnits,
                          trailBits: sl.ipTrailBits,
                          roleBits: sl.ipRoleBits,
                        });
                        const oopNativeHit = decodeFm27RoleFromBinary({
                          phase: 'oop',
                          settingUnits: sl.oopSettingUnits,
                          trailBits: sl.oopTrailBits,
                          roleBits: sl.oopRoleBits,
                        });
                        const resolvedIpName =
                          ipDictHit?.roleName || ipNativeHit?.roleName || sl.inPossessionRole || '';
                        const resolvedOopName =
                          oopDictHit?.roleName || oopNativeHit?.roleName || sl.outOfPossessionRole || '';
                        const validIp = getValidFm27RolesForSlot(ipPos, 'ip');
                        const validOop = getValidFm27RolesForSlot(oopPos, 'oop');

                        return (
                          <tr key={`${sl.slotIndex}-${idx}`} className="hover:bg-slate-900/50">
                            <td className="py-2.5 px-3 align-top">
                              <div className="font-semibold text-white">
                                {sl.playerName || `Slot ${idx + 1}`}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                                IP {ipPos}
                                {oopPos !== ipPos ? ` → OOP ${oopPos}` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 align-top font-mono text-[11px] tabular-nums">
                              <div className="text-slate-200">{ipCore || 'No bits'}</div>
                              <div
                                className={
                                  ipDictHit || ipNativeHit ? 'text-emerald-400' : 'text-slate-500'
                                }
                              >
                                {sl.ipSettingUnits?.length ?? sl.settingCountIp ?? 0} units
                                {ipDictHit
                                  ? ' · Custom Override'
                                  : ipNativeHit
                                    ? ` · Auto-Decoded (bit ${ipNativeHit.bitIndex})`
                                    : ' · Unmapped'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 align-top">
                              <select
                                aria-label={`Bind IP Role for ${sl.playerName || ipPos}`}
                                value={resolvedIpName}
                                onChange={(e) => handleBindRole(sl, 'ip', e.target.value)}
                                disabled={!ipCore}
                                className="w-full min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
                              >
                                <option value="">
                                  {resolvedIpName ? resolvedIpName : 'Select FM27 IP Role…'}
                                </option>
                                {resolvedIpName && !validIp.some((r) => r.name === resolvedIpName) && (
                                  <option value={resolvedIpName}>{resolvedIpName}</option>
                                )}
                                {validIp.map((r) => (
                                  <option key={r.name} value={r.name}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3 align-top font-mono text-[11px] tabular-nums">
                              <div className="text-slate-200">{oopCore || 'No bits'}</div>
                              <div
                                className={
                                  oopDictHit || oopNativeHit ? 'text-emerald-400' : 'text-slate-500'
                                }
                              >
                                {sl.oopSettingUnits?.length ?? sl.settingCountOop ?? 0} units
                                {oopDictHit
                                  ? ' · Custom Override'
                                  : oopNativeHit
                                    ? ` · Auto-Decoded (bit ${oopNativeHit.bitIndex})`
                                    : ' · Unmapped'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 align-top">
                              <select
                                aria-label={`Bind OOP Role for ${sl.playerName || oopPos}`}
                                value={resolvedOopName}
                                onChange={(e) => handleBindRole(sl, 'oop', e.target.value)}
                                disabled={!oopCore}
                                className="w-full min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-40"
                              >
                                <option value="">
                                  {resolvedOopName ? resolvedOopName : 'Select FM27 OOP Role…'}
                                </option>
                                {resolvedOopName && !validOop.some((r) => r.name === resolvedOopName) && (
                                  <option value={resolvedOopName}>{resolvedOopName}</option>
                                )}
                                {validOop.map((r) => (
                                  <option key={r.name} value={r.name}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TEAM & PLAYER INSTRUCTIONS */}
          {activeTab === 'instructions' && (
            <div className="space-y-6">
              {/* Style Code Binder */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Tactical Preset Style Code &amp; 19-Byte Team Instruction Matrix
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click any byte in <span className="font-mono text-slate-300">TI[00..18]</span>{' '}
                    below to bind its exact value or bitmask to an FM27 Team Instruction.
                  </p>
                </div>

                {activeTactic?.teamInstructions?.styleCode != null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-mono tabular-nums">
                      styleCode {activeTactic.teamInstructions.styleCode}:
                    </span>
                    <select
                      aria-label="Map tactical preset styleCode"
                      value={decodedTi?.styleName || activeTactic.styleName || ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const next = upsertStyleCodeMapping(
                          dict,
                          activeTactic.teamInstructions!.styleCode!,
                          e.target.value,
                          'user_confirmed'
                        );
                        notifySaved(
                          next,
                          `Mapped styleCode ${activeTactic.teamInstructions!.styleCode} → ${e.target.value}`
                        );
                      }}
                      className="min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                    >
                      <option value="">Select FM27 Style…</option>
                      {FM27_PRESET_STYLES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 19-Byte Grid */}
              {decodedTi && decodedTi.byteDetails.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
                    {decodedTi.byteDetails.map((b) => {
                      const isSelected = selectedTiByteIdx === b.index;
                      const isDecoded = b.decodedLabels.length > 0;
                      const isNonZero = b.value !== 0;
                      return (
                        <button
                          key={b.index}
                          type="button"
                          onClick={() => setSelectedTiByteIdx(b.index)}
                          className={`text-left rounded-lg border p-2.5 transition-colors ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : isDecoded
                                ? 'border-emerald-500/40 bg-slate-900/90 hover:border-emerald-400'
                                : isNonZero
                                  ? 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                                  : 'border-slate-800/80 bg-slate-950 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                            <span className="text-slate-400">
                              TI[{String(b.index).padStart(2, '0')}]
                            </span>
                            <span className={isNonZero ? 'text-white font-semibold' : 'text-slate-600'}>
                              {b.hex}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 tabular-nums mt-0.5">
                            dec {b.value} · {b.value.toString(2).padStart(8, '0')}
                          </div>
                          <div
                            className={`text-[11px] mt-1 truncate ${
                              isDecoded ? 'text-emerald-300 font-medium' : 'text-slate-500'
                            }`}
                          >
                            {isDecoded ? b.decodedLabels[0] : isNonZero ? 'Unmapped' : 'Zero'}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline Byte Binder */}
                  {selectedTiByteIdx !== null && decodedTi.byteDetails[selectedTiByteIdx] && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-semibold text-white">
                          Bind{' '}
                          <span className="font-mono text-emerald-300">
                            TI[{String(selectedTiByteIdx).padStart(2, '0')}] ={' '}
                            {decodedTi.byteDetails[selectedTiByteIdx].hex} (dec{' '}
                            {decodedTi.byteDetails[selectedTiByteIdx].value})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTiByteIdx(null)}
                          className="text-slate-400 hover:text-white"
                        >
                          Close editor
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                        <select
                          value={tiBindPhase}
                          onChange={(e) => {
                            const nextPhase = e.target.value as TeamInstructionPhase;
                            setTiBindPhase(nextPhase);
                            const firstCat = FM27_TEAM_INSTRUCTION_CATALOG.find(
                              (c) => c.phase === nextPhase
                            );
                            if (firstCat) {
                              setTiBindCategory(firstCat.category);
                              setTiBindLabel(firstCat.options[0] || '');
                            }
                          }}
                          className="min-h-[36px] rounded-md border border-slate-700 bg-slate-950 px-2.5 text-slate-100"
                        >
                          <option value="in_possession">In Possession</option>
                          <option value="in_transition">In Transition</option>
                          <option value="out_of_possession">Out of Possession</option>
                        </select>

                        <select
                          value={tiBindCategory}
                          onChange={(e) => {
                            const nextCat = e.target.value;
                            setTiBindCategory(nextCat);
                            const found = categoryItemsForPhase.find((c) => c.category === nextCat);
                            if (found) setTiBindLabel(found.options[0] || '');
                          }}
                          className="min-h-[36px] rounded-md border border-slate-700 bg-slate-950 px-2.5 text-slate-100"
                        >
                          {categoryItemsForPhase.map((c) => (
                            <option key={c.category} value={c.category}>
                              {c.category}
                            </option>
                          ))}
                        </select>

                        <select
                          value={tiBindLabel}
                          onChange={(e) => setTiBindLabel(e.target.value)}
                          className="min-h-[36px] rounded-md border border-slate-700 bg-slate-950 px-2.5 text-slate-100"
                        >
                          {activeCatalogOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-2">
                          <select
                            value={tiBindMatchType}
                            onChange={(e) =>
                              setTiBindMatchType(e.target.value as 'exact_value' | 'bitmask')
                            }
                            className="min-h-[36px] rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-200 flex-1"
                          >
                            <option value="exact_value">Exact value</option>
                            <option value="bitmask">Bitmask</option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              handleBindTiByte(
                                selectedTiByteIdx,
                                decodedTi.byteDetails[selectedTiByteIdx].value,
                                tiBindMatchType,
                                tiBindPhase,
                                tiBindCategory,
                                tiBindLabel
                              )
                            }
                            className="min-h-[36px] rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 font-semibold text-white whitespace-nowrap"
                          >
                            Save Rule
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 text-xs text-slate-400">
                  No raw 19-byte Team Instruction vector present in the current save payload. Re-import
                  your <span className="font-mono">.fm</span> save to capture raw bytes.
                </div>
              )}

              {/* Per-Slot Decomposed SettingUnit Inspector */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      Decomposed Slot Player Instructions (TacticSettingUnits)
                    </h4>
                    <p className="text-xs text-slate-400">
                      Each slot&apos;s raw binary setting units are exposed separately—bind any unit
                      signature to its exact FM27 Player Instruction.
                    </p>
                  </div>
                  {activeTactic?.slots && activeTactic.slots.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <select
                        value={selectedPiSlotIdx}
                        onChange={(e) => setSelectedPiSlotIdx(Number(e.target.value))}
                        className="min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2.5 text-slate-100"
                      >
                        {activeTactic.slots.map((sl, idx) => (
                          <option key={idx} value={idx}>
                            {sl.position} · {sl.playerName || `Slot ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                      <div className="inline-flex rounded-md border border-slate-800 bg-slate-900 p-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedPiPhase('ip')}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            selectedPiPhase === 'ip'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'text-slate-400'
                          }`}
                        >
                          IP Units
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPiPhase('oop')}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            selectedPiPhase === 'oop'
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'text-slate-400'
                          }`}
                        >
                          OOP Units
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {activePiUnits.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
                    No raw <span className="font-mono">TacticSettingUnit</span> entries captured for
                    this slot/phase. Re-import your <span className="font-mono">.fm</span> save with
                    the updated v19 decoder to populate decomposed units.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3 font-medium">#</th>
                          <th className="py-2 px-3 font-medium">Unit Signature</th>
                          <th className="py-2 px-3 font-medium">Fields (head / b1 / b2)</th>
                          <th className="py-2 px-3 font-medium">Mapped FM27 Player Instruction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {activePiUnits.map((u) => {
                          const decodedPi = decodePlayerInstructionsFromDictionary(
                            dict,
                            [u],
                            selectedPiPhase
                          );
                          const currentLabel = decodedPi.decodedLabels[0] || '';
                          return (
                            <tr key={`${u.index}-${u.signature}`} className="hover:bg-slate-900/40">
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-400">
                                {u.index + 1}
                              </td>
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-100">
                                {u.signature}
                              </td>
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-400">
                                {u.headHex} · b1={u.firstBits} · ({u.secondLow},{u.secondMid},
                                {u.secondHigh})
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={currentLabel}
                                  onChange={(e) =>
                                    handleBindPiUnit(selectedPiPhase, u, e.target.value)
                                  }
                                  className="w-full max-w-xs min-h-[32px] rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                                >
                                  <option value="">Unmapped — select FM27 PI…</option>
                                  {FM27_PLAYER_INSTRUCTION_CATALOG[selectedPiPhase].map((pi) => (
                                    <option key={pi} value={pi}>
                                      {pi}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SAVE-TO-SAVE BINARY DIFF LAB (.fm vs .fm) */}
          {activeTab === 'diff' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="space-y-1 max-w-2xl">
                  <h3 className="text-sm font-semibold text-white">
                    Pure .fm-to-.fm Binary Diff Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    Compare any two <span className="font-mono">.fm</span> saves (e.g., before and
                    after changing one role, team instruction, player instruction, or after a board
                    rating change). The diff isolates only the exact bytes that changed so you can
                    lock them into the dictionary once and auto-decode forever.
                  </p>
                </div>

                <div>
                  <input
                    ref={diffFileInputRef}
                    type="file"
                    accept=".fm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleLoadComparisonFmSave(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => diffFileInputRef.current?.click()}
                    disabled={Boolean(diffLoadingMsg)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" /> Load Comparison .fm Save
                  </button>
                </div>
              </div>

              {diffLoadingMsg && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200">
                  {diffLoadingMsg}
                </div>
              )}
              {diffError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                  {diffError}
                </div>
              )}

              {/* Save A / Save B Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-400 font-medium">Save A (Baseline / Before)</span>
                  <select
                    value={diffSourceAKey}
                    onChange={(e) => setDiffSourceAKey(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100"
                  >
                    {availableDiffSnapshots.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 font-medium">Save B (Modified / After)</span>
                  <select
                    value={diffSourceBKey}
                    onChange={(e) => setDiffSourceBKey(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100"
                  >
                    {availableDiffSnapshots.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!diffReport ? (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center space-y-2">
                  <p className="text-xs text-slate-300">
                    Load a second <span className="font-mono">.fm</span> save above (or upload two
                    saves in your Career Journey) to run a binary diff.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Tip: Change one IP/OOP role or one Team Instruction in FM27, save to a test slot,
                    and drop it here—your active career stays untouched.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Diff Summary Bar */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono tabular-nums text-slate-300 pb-3 border-b border-slate-800">
                    <span>Role Bit Changes: {diffReport.roleBitDiffs.length}</span>
                    <span>SettingUnit Deltas: {diffReport.settingUnitDiffs.length}</span>
                    <span>TI Byte Changes: {diffReport.teamInstructionByteDiffs.length}</span>
                    <span>Governance Byte Changes: {diffReport.governanceByteDiffs.length}</span>
                    <span>New Promise Hits: {diffReport.newPromiseCandidates.length}</span>
                  </div>

                  {/* 1. Changed Role Bitfields */}
                  {diffReport.roleBitDiffs.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                        Changed Slot Role Bitfields ({diffReport.roleBitDiffs.length})
                      </h4>
                      <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                        {diffReport.roleBitDiffs.map((d, i) => (
                          <div
                            key={`${d.slotIndex}-${d.phase}-${i}`}
                            className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-white">
                                {d.position} · {d.playerName || `Slot ${d.slotIndex + 1}`} ·{' '}
                                {d.phase.toUpperCase()}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                                {d.beforeCoreSig || 'none'} →{' '}
                                <span className="text-emerald-300">{d.afterCoreSig || 'none'}</span>
                                {' · '}+{d.addedUnits.length}/-{d.removedUnits.length} units
                              </div>
                            </div>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const next = upsertRoleDictionaryMapping(dict, {
                                  positionCode: d.position,
                                  phase: d.phase,
                                  roleBits: d.afterRoleBits,
                                  trailBits: d.afterTrailBits,
                                  roleCoreSignature: d.afterCoreSig,
                                  roleName: e.target.value,
                                  provenance: 'diff_calibrated',
                                });
                                notifySaved(
                                  next,
                                  `Diff-calibrated ${d.position} ${d.phase.toUpperCase()} (${d.afterCoreSig}) → ${e.target.value}`
                                );
                              }}
                              className="min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                            >
                              <option value="">Bind new FM27 {d.phase.toUpperCase()} role…</option>
                              {getValidFm27RolesForSlot(d.position, d.phase).map((r) => (
                                <option key={r.name} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Pure Player Instruction SettingUnit Deltas */}
                  {diffReport.settingUnitDiffs.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                        Changed TacticSettingUnits ({diffReport.settingUnitDiffs.length})
                      </h4>
                      <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 max-h-60 overflow-y-auto">
                        {diffReport.settingUnitDiffs.map((uDiff, i) => (
                          <div
                            key={`${uDiff.slotIndex}-${uDiff.unit.signature}-${i}`}
                            className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-medium text-white">
                                {uDiff.change === 'added' ? '+ Added' : '− Removed'}{' '}
                                <span className="font-mono text-sky-300">
                                  {uDiff.unit.signature}
                                </span>{' '}
                                ({uDiff.position} · {uDiff.phase.toUpperCase()})
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {uDiff.roleBitsChanged
                                  ? 'Changed alongside role bits (role default unit)'
                                  : 'Pure Player Instruction toggle (role bits unchanged)'}
                              </div>
                            </div>
                            <select
                              defaultValue=""
                              onChange={(e) =>
                                handleBindPiUnit(uDiff.phase, uDiff.unit, e.target.value)
                              }
                              className="min-h-[34px] rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                            >
                              <option value="">Bind Player Instruction…</option>
                              {FM27_PLAYER_INSTRUCTION_CATALOG[uDiff.phase].map((pi) => (
                                <option key={pi} value={pi}>
                                  {pi}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Changed Team Instruction Bytes */}
                  {diffReport.teamInstructionByteDiffs.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                        Changed Team Instruction Bytes ({diffReport.teamInstructionByteDiffs.length})
                      </h4>
                      <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                        {diffReport.teamInstructionByteDiffs.map((td, i) => (
                          <div
                            key={`${td.tacticIndex}-${td.byteIndex}-${i}`}
                            className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div className="font-mono tabular-nums">
                              <span className="text-white font-semibold">
                                TI[{String(td.byteIndex).padStart(2, '0')}]
                              </span>
                              <span className="text-slate-400">
                                {' '}
                                · {td.beforeHex} →{' '}
                                <span className="text-amber-300">{td.afterHex}</span> · XOR{' '}
                                {td.xorHex}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTiByteIdx(td.byteIndex);
                                setActiveTab('instructions');
                              }}
                              className="min-h-[32px] rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-emerald-300 hover:border-emerald-500/50"
                            >
                              Bind TI[{String(td.byteIndex).padStart(2, '0')}] →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Changed Governance Probe Offsets */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Changed Governance Binary Probe Offsets (
                        {diffReport.governanceByteDiffs.length})
                      </h4>
                      <div className="flex items-center gap-2 text-xs">
                        <select
                          value={govBindTarget}
                          onChange={(e) =>
                            setGovBindTarget(e.target.value as GovernanceTargetField)
                          }
                          className="min-h-[30px] rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                        >
                          <option value="board_confidence">Board Confidence</option>
                          <option value="supporter_confidence">Supporter Confidence</option>
                          <option value="job_security">Job Security</option>
                          <option value="manager_wage_pw">Manager Weekly Wage</option>
                        </select>
                        <select
                          value={govBindEncoding}
                          onChange={(e) =>
                            setGovBindEncoding(e.target.value as GovernanceValueEncoding)
                          }
                          className="min-h-[30px] rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                        >
                          <option value="u8_percent_0_100">u8 (0–100%)</option>
                          <option value="u8_grade_0_12">u8 (F..A+ grade)</option>
                          <option value="u8_scale_0_20">u8 (0–20)</option>
                          <option value="u16_le">u16 LE</option>
                          <option value="u32_le">u32 LE</option>
                        </select>
                      </div>
                    </div>

                    {diffReport.governanceByteDiffs.length === 0 ? (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
                        No anchored governance bytes moved between these two saves.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3 font-medium">Anchor</th>
                              <th className="py-2 px-3 font-medium">Offset</th>
                              <th className="py-2 px-3 font-medium">Before → After</th>
                              <th className="py-2 px-3 font-medium">Signal</th>
                              <th className="py-2 px-3 font-medium text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {diffReport.governanceByteDiffs.slice(0, 25).map((g, i) => (
                              <tr key={`${g.section}-${g.anchorLabel}-${g.relOffset}-${i}`}>
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-200">
                                  {g.section}.{g.anchorLabel}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] tabular-nums text-slate-400">
                                  +{g.relOffset}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] tabular-nums text-slate-200">
                                  {g.beforeU8} → {g.afterU8} ({g.delta >= 0 ? `+${g.delta}` : g.delta})
                                </td>
                                <td className="py-2 px-3 text-[11px] text-slate-400">
                                  {g.plausibleRatingCandidate
                                    ? 'Rating 0–100 candidate'
                                    : g.plausibleGradeCandidate
                                      ? 'Grade enum candidate'
                                      : 'Raw byte delta'}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleBindGovOffset(
                                        g.section,
                                        g.anchorLabel,
                                        g.relOffset,
                                        govBindTarget,
                                        govBindEncoding
                                      )
                                    }
                                    className="min-h-[28px] rounded border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-medium text-emerald-300 hover:border-emerald-500/50"
                                  >
                                    Bind Offset
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GOVERNANCE PROBES, .FM SECTION INVENTORY & SHAREABLE JSON DICTIONARY */}
          {activeTab === 'governance' && (
            <div className="space-y-6">
              {/* Patch Compatibility Self-Diagnostics */}
              <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Patch Compatibility Self-Diagnostics
                    </h3>
                    <p className="text-xs text-slate-400">
                      Detects future FM27 builds and shows which sections decoded cleanly versus
                      through a runtime fallback.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPatchDiagnosticReport}
                      disabled={!decodedPayload}
                      className="min-h-[32px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-medium text-slate-200 hover:border-sky-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Copy className="h-3.5 w-3.5 text-sky-400" /> Copy Patch Diagnostic Report
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyAgentHandoff}
                      disabled={!decodedPayload}
                      title="Copy a Markdown packet to paste into an agent that can investigate the decode failure"
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 text-[11px] font-medium text-amber-100 hover:border-amber-400/60 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Copy className="h-3.5 w-3.5 text-amber-300" /> Copy Agent Handoff
                    </button>
                  </div>
                </div>
                {patchCompat ? (
                  <>
                    <p className="text-xs text-slate-300">
                      <span className="font-semibold text-slate-100">
                        {handoffVerdict.headline}.
                      </span>{' '}
                      {handoffVerdict.detail}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-400">
                      {patchCompat.summary}
                    </p>
                    {buildProfile && (
                      <p className="text-[11px] text-slate-400">
                        {priorBuildRuns > 0
                          ? `Seen ${buildProfile.seenCount} times`
                          : 'First run for this build'}
                        {' · '}first {buildProfile.firstSeenIso.slice(0, 10)}
                        {' · '}last {buildProfile.lastSeenIso.slice(0, 10)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {patchCompat.sections.map((section) => (
                        <span
                          key={section.id}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                            PATCH_SECTION_CHIP_STYLES[section.status] ??
                            PATCH_SECTION_CHIP_STYLES.unavailable
                          }`}
                        >
                          <span>{section.label}:</span>
                          <strong className="font-semibold text-white">{section.status}</strong>
                          {section.fallbacks ? <span>({section.fallbacks})</span> : null}
                        </span>
                      ))}
                    </div>
                    {patchCompat.advisory && (
                      <p className="text-xs text-sky-300">{patchCompat.advisory}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    No patch diagnostics yet — import a live .fm save to populate this panel.
                  </p>
                )}
              </div>

              {/* Shareable JSON Dictionary Manager */}
              <div className="space-y-3 pb-5 border-b border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Shareable FM27 JSON ID Dictionary
                    </h3>
                    <p className="text-xs text-slate-400 font-mono tabular-nums">
                      Roles: {mappingCounts.roles} · Team Instr: {mappingCounts.teamInstructions} ·
                      Styles: {mappingCounts.styleCodes} · Player Instr:{' '}
                      {mappingCounts.playerInstructions} · Governance Rules:{' '}
                      {mappingCounts.governanceRules}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={jsonFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        f.text()
                          .then((txt) => handleImportJsonPreview(txt))
                          .catch(() => setStatusNotice('Could not read JSON file.'));
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => jsonFileInputRef.current?.click()}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:text-white"
                    >
                      <Upload className="h-3.5 w-3.5 text-sky-400" /> Import JSON File
                    </button>
                    {decodedPayload && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            `fm27-anonymized-structure-probe-${(decodedPayload.meta.build || '27.1.0').replace(/[^a-z0-9.+-]/gi, '_')}.json`,
                            exportAnonymizedProbeSummary({
                              fmBuild: decodedPayload.meta.build || 'unknown',
                              fmsaveVersion: decodedPayload.meta.fmsaveVersion,
                              tactics: decodedPayload.tactics || [],
                              binaryForensics: decodedPayload.binaryForensics ?? null,
                            })
                          )
                        }
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:text-white"
                      >
                        <Layers className="h-3.5 w-3.5 text-amber-400" /> Export Anonymized Probe
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const cleared = resetFm27BinaryDictionary(
                          decodedPayload?.meta?.build || dict.fmBuild
                        );
                        notifySaved(cleared, 'Reset FM27 Binary Dictionary to clean baseline.');
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-medium text-slate-400 hover:text-rose-300"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                  </div>
                </div>

                {/* Paste JSON Box + Merge Preview */}
                <div className="space-y-2">
                  <textarea
                    value={importJsonText}
                    onChange={(e) => handleImportJsonPreview(e.target.value)}
                    rows={3}
                    placeholder="Paste a shared FM27 Binary Dictionary JSON here to preview and merge rules…"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                  />

                  {mergePreview && (
                    <div
                      className={`rounded-lg border p-3 text-xs space-y-2 ${
                        mergePreview.valid
                          ? 'border-emerald-500/35 bg-emerald-500/5 text-slate-200'
                          : 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {!mergePreview.valid ? (
                        <div>Invalid dictionary JSON: {mergePreview.error}</div>
                      ) : (
                        <>
                          <div className="font-mono tabular-nums">
                            Ready to merge: +{mergePreview.stats.newRoles} roles · +
                            {mergePreview.stats.newTeamInstructions} team instr · +
                            {mergePreview.stats.newStyleCodes} styles · +
                            {mergePreview.stats.newPlayerInstructions} player instr · +
                            {mergePreview.stats.newGovernanceRules} gov rules ·{' '}
                            {mergePreview.stats.conflicts} conflict(s)
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-slate-300">
                              <input
                                type="checkbox"
                                checked={overwriteConflicts}
                                onChange={(e) => setOverwriteConflicts(e.target.checked)}
                              />
                              Overwrite existing conflicting rules
                            </label>
                            <button
                              type="button"
                              onClick={handleApplyImportMerge}
                              className="min-h-[34px] rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 font-semibold text-white"
                            >
                              Apply Merge
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Active Dictionary Rules List (Quick Delete) */}
                {mappingCounts.total > 0 && (
                  <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/80 max-h-48 overflow-y-auto text-xs">
                    {Object.values(dict.roleMappings).map((r) => (
                      <div
                        key={r.key}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-mono text-emerald-300">{r.key}</span>
                          <span className="text-slate-400"> → </span>
                          <span className="text-white font-medium">{r.roleName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            notifySaved(
                              deleteDictionaryRule(dict, 'roleMappings', r.key),
                              `Removed role rule ${r.key}`
                            )
                          }
                          aria-label={`Delete rule ${r.key}`}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {Object.values(dict.teamInstructionMappings).map((ti) => (
                      <div
                        key={ti.key}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-mono text-amber-300">
                            TI[{String(ti.byteIndex).padStart(2, '0')}]={ti.matchValue}
                          </span>
                          <span className="text-slate-400"> → </span>
                          <span className="text-white font-medium">{ti.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            notifySaved(
                              deleteDictionaryRule(dict, 'teamInstructionMappings', ti.key),
                              `Removed TI rule ${ti.key}`
                            )
                          }
                          aria-label={`Delete rule ${ti.key}`}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {Object.values(dict.governanceOffsetRules).map((gr) => (
                      <div
                        key={gr.id}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-mono text-sky-300">
                            {gr.section}.{gr.anchorLabel} +{gr.relOffset}
                          </span>
                          <span className="text-slate-400"> → </span>
                          <span className="text-white font-medium">
                            {gr.targetField} ({gr.encoding})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            notifySaved(
                              deleteDictionaryRule(dict, 'governanceOffsetRules', gr.id),
                              `Removed governance rule ${gr.id}`
                            )
                          }
                          aria-label={`Delete rule ${gr.id}`}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* .fm Section Schema Inventory & Binary Probes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    .fm Archive Section Inventory ({forensics?.sections?.length ?? 0})
                  </h4>
                  {!forensics || forensics.sections.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
                      Re-import your <span className="font-mono">.fm</span> save with v19 to populate
                      the archive section inventory.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3 font-medium">Section</th>
                            <th className="py-2 px-3 font-medium text-right">Schema</th>
                            <th className="py-2 px-3 font-medium text-right">Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono text-[11px] tabular-nums">
                          {forensics.sections.map((sec) => (
                            <tr key={sec.name}>
                              <td className="py-1.5 px-3 text-slate-200">{sec.name}</td>
                              <td className="py-1.5 px-3 text-right text-slate-400">
                                {sec.schema ?? '--'}
                              </td>
                              <td className="py-1.5 px-3 text-right text-slate-400">
                                {formatBytes(sec.sizeBytes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Anchored Governance Probes ({forensics?.governanceProbes?.length ?? 0}) &amp;
                    Promise Candidates ({forensics?.promiseCandidates?.length ?? 0})
                  </h4>
                  {!forensics ||
                  (forensics.governanceProbes.length === 0 &&
                    forensics.promiseCandidates.length === 0) ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
                      Anchored binary probes and player promise candidates appear here once decoded
                      from your <span className="font-mono">.fm</span> save.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/80 max-h-60 overflow-y-auto text-xs">
                      {forensics.governanceProbes.map((pr) => (
                        <div key={pr.id} className="p-2.5 space-y-1">
                          <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                            <span className="text-sky-300">
                              {pr.section}.{pr.anchorLabel}
                            </span>
                            <span className="text-slate-500">@{pr.anchorOffset}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {pr.u8Values.length}B window
                            {pr.candidateDates?.length
                              ? ` · Dates: ${pr.candidateDates
                                  .slice(0, 3)
                                  .map((d) => d.dmy)
                                  .join(', ')}`
                              : ''}
                          </div>
                        </div>
                      ))}
                      {forensics.promiseCandidates.map((pc) => (
                        <div key={pc.id} className="p-2.5 space-y-0.5 bg-slate-900/40">
                          <div className="font-medium text-amber-200">
                            Promise Candidate · {pc.playerName || `UID ${pc.playerUid}`}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                            {pc.section}@{pc.anchorOffset} · Due {pc.dueDateDmy || '--'} · type=
                            {pc.typeCode ?? '--'} · status={pc.statusCode ?? '--'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
