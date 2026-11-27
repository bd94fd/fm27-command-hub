import assert from 'node:assert/strict';
import test from 'node:test';
import { backupFileName } from './useBackupTransfer.ts';

test('the backup file is named after the in-game date', () => {
  assert.equal(backupFileName('11/08/2027'), 'fm27-hub-backup-11-08-2027.json');
  assert.equal(backupFileName('01/01/2028'), 'fm27-hub-backup-01-01-2028.json');
});

test('a save with no date yet still produces a valid file name', () => {
  assert.equal(backupFileName('--'), 'fm27-hub-backup---.json');
});
