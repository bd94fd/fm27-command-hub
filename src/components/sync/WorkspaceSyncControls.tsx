import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  History,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { PendingWorkspaceSync } from '../../hooks/useWorkspaceSync';
import type { WorkspaceAuditEntry } from '../../services/workspaceAuditLog';

export interface WorkspaceSyncControlsProps {
  pendingSync: PendingWorkspaceSync | null;
  isSyncing: boolean;
  auditLogs: WorkspaceAuditEntry[];
  onConfirmSync: () => void;
  onCancelSync: () => void;
}

export const WorkspaceSyncControls: React.FC<WorkspaceSyncControlsProps> = ({
  pendingSync,
  isSyncing,
  auditLogs,
  onConfirmSync,
  onCancelSync,
}) => {
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAuditDrawer((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white"
        >
          <History className="h-3.5 w-3.5 text-emerald-400" />
          Workspace Audit Log ({auditLogs.length})
        </button>
      </div>

      {showAuditDrawer && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Recent Google Workspace Audit Log (Last {auditLogs.length} / 100)
            </h4>
            <button
              type="button"
              onClick={() => setShowAuditDrawer(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No Google Docs or Sheets sync operations recorded yet.
            </p>
          ) : (
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {auditLogs.slice(0, 20).map((entry) => (
                <div
                  key={entry.operationId}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-medium text-slate-200">{entry.summary}</div>
                    <div className="text-[11px] text-slate-500">
                      {entry.operationId} • {new Date(entry.timestamp).toLocaleString()}
                    </div>
                    {entry.errorMessage && (
                      <div className="mt-0.5 text-[11px] text-rose-400">
                        {entry.errorMessage}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      entry.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : entry.status === 'error'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingSync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              {pendingSync.diffPreview.isDestructive ? (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              ) : (
                <CloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              )}
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white">
                  {pendingSync.diffPreview.isDestructive
                    ? 'Confirm Destructive Google Doc Rewrite'
                    : `Push Event #${pendingSync.eventNumber} (${pendingSync.title}) to Google Sheet & Doc?`}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {pendingSync.diffPreview.summary}
                </p>
              </div>
            </div>

            {pendingSync.diffPreview.isDestructive && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                This operation replaces existing document content. Review the diff preview carefully.
              </div>
            )}

            <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
              {pendingSync.diffPreview.previewLines.length > 0 ? (
                pendingSync.diffPreview.previewLines.map((line, idx) => (
                  <div key={idx} className="truncate">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-500">No text preview lines</div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelSync}
                disabled={isSyncing}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmSync}
                disabled={isSyncing}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white ${
                  pendingSync.diffPreview.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isSyncing ? 'Syncing...' : 'Confirm & Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
