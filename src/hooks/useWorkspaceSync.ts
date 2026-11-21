import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  appendEventToGoogleDoc,
  appendRowToGoogleSheet,
  fetchGoogleDocInfo,
  fetchGoogleSheetMetadata,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
  writeFullMasterBlueprintToDoc,
  type GoogleDocInfo,
  type GoogleSheetMetadata,
} from '../services/googleWorkspace';
import {
  generateDiffPreview,
  getAuditLogs,
  recordAuditLog,
  type WorkspaceAuditEntry,
  type WorkspaceDiffPreview,
} from '../services/workspaceAuditLog';

export interface PendingWorkspaceSync {
  eventNumber: number;
  title: string;
  docEventBulletBlock: string;
  sheetRowValues: string[];
  chronicleRowValues: string[];
  diffPreview: WorkspaceDiffPreview;
  isFullBlueprintRewrite?: boolean;
}

export function useWorkspaceSync() {
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

  const [pendingSync, setPendingSync] = useState<PendingWorkspaceSync | null>(
    null
  );
  const [auditLogs, setAuditLogs] = useState<WorkspaceAuditEntry[]>(() =>
    getAuditLogs()
  );

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

  const handleDocUrlChange = useCallback((val: string) => {
    setDocUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_doc_id', val);
    } catch {
      // ignore
    }
  }, []);

  const handleSheetUrlChange = useCallback((val: string) => {
    setSheetUrlOrId(val);
    try {
      localStorage.setItem('fm27_command_hub_sheet_id', val);
    } catch {
      // ignore
    }
  }, []);

  const handleGoogleLogin = useCallback(async () => {
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
  }, []);

  const handleGoogleLogout = useCallback(async () => {
    await logout();
    setGoogleUser(null);
    setAccessToken(null);
    setDocInfo(null);
    setSheetMeta(null);
    setWorkspaceStatus('Signed out of Google Workspace.');
  }, []);

  const handleVerifyFiles = useCallback(async () => {
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
        const dInfo = await fetchGoogleDocInfo(docUrlOrId, token);
        setDocInfo(dInfo);
        messages.push(
          `Doc: "${dInfo.title}" (${dInfo.anchorIndex !== null ? 'Anchor tag found' : 'Will append at end'})`
        );
      }
      if (sheetUrlOrId.trim()) {
        const sMeta = await fetchGoogleSheetMetadata(sheetUrlOrId, token);
        setSheetMeta(sMeta);
        if (sMeta.sheetNames.length > 0) {
          const matchTab =
            sMeta.sheetNames.find((t) => /match|log|1g|result/i.test(t)) ||
            sMeta.sheetNames[0];
          const chronTab =
            sMeta.sheetNames.find((t) => /chronicle|event|tab 10/i.test(t)) ||
            sMeta.sheetNames[sMeta.sheetNames.length - 1];
          setSelectedMatchLogTab(matchTab);
          setSelectedChroniclesTab(chronTab);
        }
        messages.push(
          `Sheet: "${sMeta.title}" (${sMeta.sheetNames.length} tabs)`
        );
      }
      setWorkspaceStatus(`Verified & Connected — ${messages.join(' • ')}`);
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to verify Google Doc / Sheet.'
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  }, [accessToken, docUrlOrId, sheetUrlOrId]);

  const requestSync = useCallback(
    (payload: {
      eventNumber: number;
      title: string;
      docEventBulletBlock: string;
      sheetRowValues: string[];
      chronicleRowValues: string[];
      isFullBlueprintRewrite?: boolean;
    }) => {
      const targetLabel = [
        docInfo?.title || (docUrlOrId.trim() ? 'Google Doc' : ''),
        sheetMeta?.title || (sheetUrlOrId.trim() ? 'Google Sheet' : ''),
      ]
        .filter(Boolean)
        .join(' + ') || 'Google Workspace';

      const diffPreview = generateDiffPreview({
        targetType: payload.isFullBlueprintRewrite
          ? 'google_doc'
          : 'google_workspace_bundle',
        operationKind: payload.isFullBlueprintRewrite
          ? 'rewrite_blueprint'
          : 'bundle_sync',
        targetLabel,
        newText: payload.docEventBulletBlock,
        existingLineCount: payload.isFullBlueprintRewrite
          ? Math.max(1, docInfo?.endIndex ? Math.ceil(docInfo.endIndex / 80) : 1)
          : 0,
        sheetRows: payload.isFullBlueprintRewrite
          ? []
          : [payload.sheetRowValues, payload.chronicleRowValues].filter(
              (r) => r.length > 0
            ),
      });

      setPendingSync({
        ...payload,
        diffPreview,
      });
    },
    [docInfo, sheetMeta, docUrlOrId, sheetUrlOrId]
  );

  const cancelPendingSync = useCallback(() => {
    if (!pendingSync) return;
    const nextLogs = recordAuditLog({
      operationId: pendingSync.diffPreview.operationId,
      targetType: pendingSync.diffPreview.targetType,
      operationKind: pendingSync.diffPreview.operationKind,
      targetLabel: pendingSync.diffPreview.targetLabel,
      isDestructive: pendingSync.diffPreview.isDestructive,
      status: 'cancelled',
      summary: `Cancelled: ${pendingSync.diffPreview.summary}`,
    });
    setAuditLogs(nextLogs);
    setPendingSync(null);
  }, [pendingSync]);

  const confirmPendingSync = useCallback(async () => {
    if (!pendingSync) return;
    const current = pendingSync;
    const token = accessToken || (await getAccessToken());

    if (!token) {
      setWorkspaceError('Please sign in with Google first.');
      setPendingSync(null);
      return;
    }

    setIsSyncingWorkspace(true);
    setWorkspaceError(null);
    setWorkspaceStatus(null);

    try {
      const completedParts: string[] = [];

      if (current.isFullBlueprintRewrite && docUrlOrId.trim()) {
        const res = await writeFullMasterBlueprintToDoc(
          docUrlOrId,
          current.docEventBulletBlock,
          token
        );
        completedParts.push(`Rewrote Doc "${res.title}"`);
      } else {
        if (docUrlOrId.trim() && current.docEventBulletBlock.trim()) {
          const docRes = await appendEventToGoogleDoc(
            docUrlOrId,
            current.docEventBulletBlock,
            token
          );
          completedParts.push(
            `Doc "${docRes.title}" (${docRes.insertedAtAnchor ? 'at anchor' : 'appended'})`
          );
        }

        if (sheetUrlOrId.trim()) {
          const targetTab =
            selectedMatchLogTab || sheetMeta?.sheetNames[0] || 'Sheet1';
          if (current.sheetRowValues.length > 0) {
            await appendRowToGoogleSheet(
              sheetUrlOrId,
              targetTab,
              current.sheetRowValues,
              token
            );
            completedParts.push(`Sheet tab "${targetTab}"`);
          }
          if (
            selectedChroniclesTab &&
            selectedChroniclesTab !== targetTab &&
            current.chronicleRowValues.length > 0
          ) {
            await appendRowToGoogleSheet(
              sheetUrlOrId,
              selectedChroniclesTab,
              current.chronicleRowValues,
              token
            );
            completedParts.push(`Chronicles tab "${selectedChroniclesTab}"`);
          }
        }
      }

      const summary =
        completedParts.length > 0
          ? `Event #${current.eventNumber} synced to ${completedParts.join(' & ')}`
          : `Event #${current.eventNumber}: No Google Doc or Sheet URL configured.`;

      setWorkspaceStatus(summary);
      setAuditLogs(
        recordAuditLog({
          operationId: current.diffPreview.operationId,
          targetType: current.diffPreview.targetType,
          operationKind: current.diffPreview.operationKind,
          targetLabel: current.diffPreview.targetLabel,
          isDestructive: current.diffPreview.isDestructive,
          status: 'success',
          summary,
        })
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Failed to sync to Google Workspace.';
      setWorkspaceError(errMsg);
      setAuditLogs(
        recordAuditLog({
          operationId: current.diffPreview.operationId,
          targetType: current.diffPreview.targetType,
          operationKind: current.diffPreview.operationKind,
          targetLabel: current.diffPreview.targetLabel,
          isDestructive: current.diffPreview.isDestructive,
          status: 'error',
          summary: `Failed: ${current.diffPreview.summary}`,
          errorMessage: errMsg,
        })
      );
    } finally {
      setIsSyncingWorkspace(false);
      setPendingSync(null);
    }
  }, [
    pendingSync,
    accessToken,
    docUrlOrId,
    sheetUrlOrId,
    selectedMatchLogTab,
    selectedChroniclesTab,
    sheetMeta,
  ]);

  return {
    showGoogleSettings,
    setShowGoogleSettings,
    googleUser,
    accessToken,
    isLoggingIn,
    docUrlOrId,
    sheetUrlOrId,
    docInfo,
    sheetMeta,
    selectedMatchLogTab,
    setSelectedMatchLogTab,
    selectedChroniclesTab,
    setSelectedChroniclesTab,
    workspaceStatus,
    workspaceError,
    isSyncingWorkspace,
    pendingSync,
    auditLogs,
    handleDocUrlChange,
    handleSheetUrlChange,
    handleGoogleLogin,
    handleGoogleLogout,
    handleVerifyFiles,
    requestSync,
    confirmPendingSync,
    cancelPendingSync,
  };
}
