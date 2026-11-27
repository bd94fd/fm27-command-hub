import React from 'react';
import { ClipboardPaste, Send, Upload, Zap } from 'lucide-react';

export interface AnalystComposerProps {
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent) => void;
  isSending: boolean;
  isDecoding: boolean;
  hasLoadedSave: boolean;
  decodeTarget: 'local' | 'server';
  onDecodeTargetChange: (target: 'local' | 'server') => void;
  fastSync: boolean;
  onFastSyncToggle: (checked: boolean) => void;
  onFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteButtonClick: () => void;
  onTextareaPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  syncStatusLabel: string;
  syncStatusWarning: boolean;
}

/** Message box plus the attach, paste and decode-target controls under it. */
export const AnalystComposer: React.FC<AnalystComposerProps> = ({
  messageInput,
  onMessageInputChange,
  onSubmit,
  isSending,
  isDecoding,
  hasLoadedSave,
  decodeTarget,
  onDecodeTargetChange,
  fastSync,
  onFastSyncToggle,
  onFilesSelected,
  onPasteButtonClick,
  onTextareaPaste,
  syncStatusLabel,
  syncStatusWarning,
}) => (
  <form onSubmit={onSubmit} className="space-y-2">
    <div className="flex items-end gap-1.5 sm:gap-2">
      <label
        htmlFor="chat-multi-file-upload"
        title="Import .fm save or attach a screenshot"
        onClick={() => {
          if (decodeTarget !== 'local') return;
          void import('../../services/fmSaveReader').then((mod) =>
            mod.warmBrowserDecoder()
          );
        }}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer transition shrink-0"
      >
        <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="hidden sm:inline">Import .fm / Image</span>
        <input
          id="chat-multi-file-upload"
          type="file"
          accept=".fm,image/*,.csv,.html,.htm,.rtf,.txt"
          multiple
          onChange={onFilesSelected}
          className="hidden"
        />
      </label>

      <button
        type="button"
        onClick={onPasteButtonClick}
        title="Paste text or a screenshot from your clipboard"
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer transition shrink-0"
      >
        <ClipboardPaste className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        <span className="hidden md:inline">Paste</span>
      </button>

      <textarea
        rows={2}
        aria-label="Message your FM27 Tactical Analyst"
        placeholder="Ask tactics, drop a .fm save, or paste text/screenshots…"
        value={messageInput}
        onChange={(e) => onMessageInputChange(e.target.value)}
        onPaste={onTextareaPaste}
        className="flex-1 min-w-0 min-h-[44px] px-3 py-2 text-base md:text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
      />

      <button
        type="submit"
        aria-label="Send message"
        disabled={isSending || isDecoding}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        <span className="hidden sm:inline">Send</span>
      </button>
    </div>

    {hasLoadedSave && (
      <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label
            htmlFor="fm-ondevice-composer-toggle"
            className="inline-flex min-h-[36px] items-center gap-1.5 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-200"
          >
            <input
              id="fm-ondevice-composer-toggle"
              type="checkbox"
              checked={decodeTarget === 'local'}
              onChange={(e) =>
                onDecodeTargetChange(e.target.checked ? 'local' : 'server')
              }
              className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span>On-device decode</span>
          </label>
          <label
            htmlFor="fm-fast-sync-composer-toggle"
            className="inline-flex min-h-[36px] items-center gap-1.5 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-200"
          >
            <input
              id="fm-fast-sync-composer-toggle"
              type="checkbox"
              checked={fastSync}
              onChange={(e) => onFastSyncToggle(e.target.checked)}
              className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
            />
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Fast Sync on next .fm upload</span>
          </label>
        </div>
        <span className={syncStatusWarning ? 'text-amber-300 font-medium' : undefined}>
          {syncStatusLabel}
        </span>
      </div>
    )}
  </form>
);
