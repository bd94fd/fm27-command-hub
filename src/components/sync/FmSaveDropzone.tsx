import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  RefreshCw,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { FmImportScope, FmSaveProgressStage } from '../../services/fmSaveReader';
import { formatStepTimingLabel } from '../../utils/fmSaveHydrator';

export interface FmSaveDropzoneProps {
  importScope: FmImportScope;
  onChangeImportScope: (scope: FmImportScope) => void;
  fastSync: boolean;
  onToggleFastSync: (next: boolean) => void;
  serverDecodeAvailable: boolean | null;
  fmDecodeStage: FmSaveProgressStage | null;
  decodeElapsedSec: number;
  onCancelDecode: () => void;
  extractionWarnings: string[];
  showReaderNotes: boolean;
  onToggleReaderNotes: () => void;
  lastStepTimingsMs: Record<string, number>;
  isDraggingFile: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onSelectFiles: (files: FileList | null) => void;
}

export const FmSaveDropzone: React.FC<FmSaveDropzoneProps> = ({
  importScope,
  onChangeImportScope,
  fastSync,
  onToggleFastSync,
  serverDecodeAvailable,
  fmDecodeStage,
  decodeElapsedSec,
  onCancelDecode,
  extractionWarnings,
  showReaderNotes,
  onToggleReaderNotes,
  lastStepTimingsMs,
  isDraggingFile,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectFiles,
}) => {
  const timingEntries = Object.entries(lastStepTimingsMs).filter(
    ([, ms]) => typeof ms === 'number' && ms >= 0
  );

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-2xl border p-4 transition-all ${
        isDraggingFile
          ? 'border-emerald-400 bg-emerald-500/10'
          : 'border-slate-800 bg-slate-900/70'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <FileArchive className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              FM27 Save &amp; Export Importer
            </div>
            <div className="text-xs text-slate-400">
              {serverDecodeAvailable
                ? 'Server-First 4 MB Chunked Decode (fmsave 0.14.3 · up to 1 GB) • Pyodide ?v=16 fallback'
                : 'Local Browser Pyodide 3.14 (fmsave 0.14.3 ?v=16) WORKERFS Decode'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Import Scope"
            value={importScope}
            onChange={(e) => onChangeImportScope(e.target.value as FmImportScope)}
            disabled={Boolean(fmDecodeStage)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="managed_club_only">Managed Club Only</option>
            <option value="club_and_division">Club + Division</option>
          </select>

          <button
            type="button"
            onClick={() => onToggleFastSync(!fastSync)}
            disabled={Boolean(fmDecodeStage)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              fastSync
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            {fastSync ? 'Fast Sync: ON' : 'Full Sync'}
          </button>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
            <Upload className="h-3.5 w-3.5" />
            Import .fm / CSV
            <input
              type="file"
              accept=".fm,.csv,.html,.htm,.txt"
              multiple
              disabled={Boolean(fmDecodeStage)}
              onChange={(e) => {
                onSelectFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {fmDecodeStage && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>{fmDecodeStage.label}</span>
              <span className="text-slate-400">({decodeElapsedSec}s)</span>
            </div>
            <button
              type="button"
              onClick={onCancelDecode}
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{
                width: `${
                  fmDecodeStage.stage === 'boot'
                    ? 15
                    : fmDecodeStage.stage === 'install'
                    ? 35
                    : fmDecodeStage.stage === 'read'
                    ? 60
                    : 85
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {(extractionWarnings.length > 0 || timingEntries.length > 0) && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onToggleReaderNotes}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            {showReaderNotes ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            FM27 27.1 Reader Notes ({extractionWarnings.length})
          </button>

          {showReaderNotes && (
            <div className="mt-2 space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
              {extractionWarnings.map((note, idx) => (
                <div key={idx} className="leading-relaxed text-amber-200/90">
                  • {note}
                </div>
              ))}
              {timingEntries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {timingEntries.map(([step, ms]) => (
                    <span
                      key={step}
                      className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400"
                    >
                      {formatStepTimingLabel(step)}: {(ms / 1000).toFixed(1)}s
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
