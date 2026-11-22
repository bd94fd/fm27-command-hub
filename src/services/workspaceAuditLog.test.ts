import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_AUDIT_LOG_ENTRIES,
  clearAuditLogs,
  generateDiffPreview,
  generateOperationId,
  getAuditLogs,
  recordAuditLog,
  type StorageLike,
} from './workspaceAuditLog.ts';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('workspaceAuditLog & useWorkspaceSync', () => {
  it('generates unique operation IDs', () => {
    const a = generateOperationId();
    const b = generateOperationId();
    assert.match(a, /^wsop_/);
    assert.notEqual(a, b);
  });

  it('builds non-destructive and destructive diff previews accurately', () => {
    const appendPreview = generateDiffPreview({
      targetType: 'google_workspace_bundle',
      operationKind: 'bundle_sync',
      targetLabel: 'Master Doc + Master Sheet',
      newText: '● Event #12: 2-0 Win\n- xG: 2.14 vs 0.45',
      sheetRows: [['12', '14/09/2026', '2-0']],
    });
    assert.equal(appendPreview.isDestructive, false);
    assert.equal(appendPreview.linesAdded, 3);
    assert.equal(appendPreview.linesRemoved, 0);
    assert.match(appendPreview.summary, /Non-destructive append/i);

    const rewritePreview = generateDiffPreview({
      targetType: 'google_doc',
      operationKind: 'rewrite_blueprint',
      targetLabel: 'Master Blueprint Doc',
      newText: 'Line 1\nLine 2',
      existingLineCount: 45,
    });
    assert.equal(rewritePreview.isDestructive, true);
    assert.equal(rewritePreview.linesAdded, 2);
    assert.equal(rewritePreview.linesRemoved, 45);
    assert.match(rewritePreview.summary, /Destructive rewrite/i);
  });

  it('persists audit logs and enforces the 100-entry rolling cap', () => {
    const store = createMemoryStorage();
    for (let i = 0; i < MAX_AUDIT_LOG_ENTRIES + 15; i += 1) {
      recordAuditLog(
        {
          operationId: `wsop_${i}`,
          targetType: 'google_workspace_bundle',
          operationKind: 'bundle_sync',
          targetLabel: 'Master Doc',
          isDestructive: false,
          status: 'success',
          summary: `Event #${i}`,
        },
        store
      );
    }

    const logs = getAuditLogs(store);
    assert.equal(logs.length, MAX_AUDIT_LOG_ENTRIES);
    assert.equal(logs[0].operationId, `wsop_${MAX_AUDIT_LOG_ENTRIES + 14}`);

    clearAuditLogs(store);
    assert.equal(getAuditLogs(store).length, 0);
  });
});
