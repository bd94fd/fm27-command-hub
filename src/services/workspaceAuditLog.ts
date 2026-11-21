export const WORKSPACE_AUDIT_STORAGE_KEY = 'fm27_workspace_audit_log_v1';
export const MAX_AUDIT_LOG_ENTRIES = 100;

export type WorkspaceTargetType =
  | 'google_doc'
  | 'google_sheet'
  | 'google_workspace_bundle';

export type WorkspaceOperationKind =
  | 'append_event'
  | 'append_row'
  | 'rewrite_blueprint'
  | 'bundle_sync';

export interface WorkspaceDiffPreview {
  operationId: string;
  targetType: WorkspaceTargetType;
  operationKind: WorkspaceOperationKind;
  targetLabel: string;
  isDestructive: boolean;
  summary: string;
  linesAdded: number;
  linesRemoved: number;
  previewLines: string[];
}

export interface WorkspaceAuditEntry {
  operationId: string;
  timestamp: string;
  targetType: WorkspaceTargetType;
  operationKind: WorkspaceOperationKind;
  targetLabel: string;
  isDestructive: boolean;
  status: 'success' | 'error' | 'cancelled';
  summary: string;
  errorMessage?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // ignore SSR / restricted storage
  }
  return null;
}

export function generateOperationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `wsop_${ts}_${rand}`;
}

export function generateDiffPreview(params: {
  targetType: WorkspaceTargetType;
  operationKind: WorkspaceOperationKind;
  targetLabel: string;
  newText?: string;
  existingLineCount?: number;
  sheetRows?: string[][];
}): WorkspaceDiffPreview {
  const operationId = generateOperationId();
  const isDestructive = params.operationKind === 'rewrite_blueprint';

  const textLines = (params.newText || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const rowLines = (params.sheetRows || [])
    .filter((row) => Array.isArray(row) && row.length > 0)
    .map((row) => `+ [ROW] ${row.join(' | ')}`);

  const linesAdded = textLines.length + rowLines.length;
  const linesRemoved = isDestructive ? Math.max(0, params.existingLineCount ?? 1) : 0;

  const previewLines = [
    ...textLines.slice(0, 8).map((line) => `+ ${line}`),
    ...rowLines.slice(0, 4),
  ];

  const summary = isDestructive
    ? `Destructive rewrite of ${params.targetLabel} (-${linesRemoved} existing, +${linesAdded} new lines)`
    : `Non-destructive append to ${params.targetLabel} (+${linesAdded} lines/rows)`;

  return {
    operationId,
    targetType: params.targetType,
    operationKind: params.operationKind,
    targetLabel: params.targetLabel,
    isDestructive,
    summary,
    linesAdded,
    linesRemoved,
    previewLines,
  };
}

export function getAuditLogs(storage?: StorageLike): WorkspaceAuditEntry[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(WORKSPACE_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkspaceAuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordAuditLog(
  entry: Omit<WorkspaceAuditEntry, 'timestamp'> & { timestamp?: string },
  storage?: StorageLike
): WorkspaceAuditEntry[] {
  const fullEntry: WorkspaceAuditEntry = {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  const existing = getAuditLogs(storage);
  const next = [fullEntry, ...existing].slice(0, MAX_AUDIT_LOG_ENTRIES);

  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(WORKSPACE_AUDIT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }
  return next;
}

export function clearAuditLogs(storage?: StorageLike): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(WORKSPACE_AUDIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
