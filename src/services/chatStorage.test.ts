import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChatTurnPayload,
  clearAllChatHistory,
  clearClubChatHistory,
  FM27_CHAT_STORAGE_KEY,
  listStoredChatClubs,
  loadClubChatHistory,
  MAX_STORED_CLUBS,
  MAX_TURNS_PER_CLUB,
  resolveChatClubKey,
  saveClubChatHistory,
  StorageLike,
} from './chatStorage.ts';

function createMemoryStorage(options?: { failFirstSetItem?: boolean }): StorageLike {
  const map = new Map<string, string>();
  let failedOnce = false;
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options?.failFirstSetItem && !failedOnce) {
        failedOnce = true;
        throw new Error('QuotaExceededError');
      }
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function makeTurn(idx: number, role: 'user' | 'assistant' = 'user'): ChatTurnPayload {
  return role === 'user'
    ? { id: `u-${idx}`, role: 'user', userText: `Question ${idx}` }
    : {
        id: `a-${idx}`,
        role: 'assistant',
        analysisMarkdown: `Tactical reply ${idx}`,
        immediateClicks: ['Check rest defence'],
        followUpQuestions: ['Review corners?'],
      };
}

test('resolveChatClubKey normalizes club names, accents, placeholders, and clubUid fallback', () => {
  assert.equal(resolveChatClubKey('KVV Zelzate', 5100123), 'club:kvv-zelzate');
  assert.equal(resolveChatClubKey('  K.V.V. Zelzate  ', null), 'club:k-v-v-zelzate');
  assert.equal(resolveChatClubKey('Atlético Madrid', 12), 'club:atletico-madrid');
  assert.equal(resolveChatClubKey('--', 5100123), 'club-uid:5100123');
  assert.equal(resolveChatClubKey('Awaiting .fm Save', null), 'general');
  assert.equal(resolveChatClubKey('', undefined), 'general');
});

test('chatStorage isolates chat turns per club and supports offline reload & clearing', () => {
  const storage = createMemoryStorage();
  const zelzateKey = resolveChatClubKey('KVV Zelzate');
  const feyenoordKey = resolveChatClubKey('Feyenoord');

  const zelzateTurns = [makeTurn(1, 'user'), makeTurn(2, 'assistant')];
  const feyenoordTurns = [makeTurn(10, 'user')];

  assert.equal(saveClubChatHistory(zelzateKey, zelzateTurns, storage), true);
  assert.equal(saveClubChatHistory(feyenoordKey, feyenoordTurns, storage), true);

  assert.deepEqual(loadClubChatHistory(zelzateKey, storage), zelzateTurns);
  assert.deepEqual(loadClubChatHistory(feyenoordKey, storage), feyenoordTurns);
  assert.equal(listStoredChatClubs(storage).length, 2);

  clearClubChatHistory(zelzateKey, storage);
  assert.deepEqual(loadClubChatHistory(zelzateKey, storage), []);
  assert.deepEqual(loadClubChatHistory(feyenoordKey, storage), feyenoordTurns);

  clearAllChatHistory(storage);
  assert.deepEqual(loadClubChatHistory(feyenoordKey, storage), []);
  assert.equal(storage.getItem(FM27_CHAT_STORAGE_KEY), null);
});

test('chatStorage caps turns per club and prunes oldest clubs beyond MAX_STORED_CLUBS', () => {
  const storage = createMemoryStorage();
  const manyTurns = Array.from({ length: MAX_TURNS_PER_CLUB + 15 }, (_, i) =>
    makeTurn(i, i % 2 === 0 ? 'user' : 'assistant')
  );

  saveClubChatHistory('club:alpha', manyTurns, storage);
  const loaded = loadClubChatHistory('club:alpha', storage);
  assert.equal(loaded.length, MAX_TURNS_PER_CLUB);
  assert.equal(loaded[0].id, `a-15`);

  for (let i = 0; i < MAX_STORED_CLUBS + 4; i += 1) {
    saveClubChatHistory(`club:team-${i}`, [makeTurn(i)], storage);
  }
  const clubs = listStoredChatClubs(storage);
  assert.equal(clubs.length, MAX_STORED_CLUBS);
});

test('chatStorage recovers cleanly from corrupt JSON and QuotaExceededError', () => {
  const corruptStorage = createMemoryStorage();
  corruptStorage.setItem(FM27_CHAT_STORAGE_KEY, '{not-valid-json');
  assert.deepEqual(loadClubChatHistory('club:kvv-zelzate', corruptStorage), []);

  const tightStorage = createMemoryStorage({ failFirstSetItem: true });
  const turns = Array.from({ length: 20 }, (_, i) => makeTurn(i));
  assert.equal(saveClubChatHistory('club:kvv-zelzate', turns, tightStorage), true);
  const recovered = loadClubChatHistory('club:kvv-zelzate', tightStorage);
  assert.equal(recovered.length, 10);
  assert.equal(recovered[recovered.length - 1].id, 'u-19');
});

test('fmSaveUiHelpers formats analyst modes cleanly, trims double periods, and keeps .fm import delta compact', async () => {
  const {
    buildCompactFmImportDeltaContext,
    formatAnalystModeLabel,
    trimTrailingPeriod,
  } = await import('../utils/fmSaveUiHelpers.ts');

  assert.equal(formatAnalystModeLabel('deep_high'), 'Deep Analyst');
  assert.equal(formatAnalystModeLabel('max_xhigh'), 'Max Synthesis');
  assert.equal(formatAnalystModeLabel('fast_lite'), 'Fast Co-Pilot');
  assert.equal(
    trimTrailingPeriod('HTTP 504: Timed out after 60s. Please retry..'),
    'HTTP 504: Timed out after 60s. Please retry'
  );

  const delta = buildCompactFmImportDeltaContext({
    fileName: 'auto save.fm',
    clubName: 'KVV Zelzate',
    saveDateLabel: '11/08/2027',
    changedPlayers: Array.from({ length: 18 }, (_, i) => ({
      name: `Player ${i + 1}`,
      changes: ['Pace +1', 'Rating 7.10'],
    })),
    removedPlayers: ['Departed Player'],
    newMatchesCount: 2,
    extractionWarnings: ['Minor non-fatal reader note'],
  });
  assert.ok(delta.length < 1800, `Expected compact delta < 1800 chars, got ${delta.length}`);
  assert.match(delta, /KVV Zelzate/);
  assert.match(delta, /18 player\(s\) updated, 1 removed, 2 new match\(es\) logged/);
  assert.match(delta, /\(\+10 more updated players in live context\)/);
  assert.doesNotMatch(delta, /docEventBulletBlock|sheetRowValues/);
});

test('resolveChatTurnReasoningMode uses Deep Analyst for .fm imports and save comparisons, and Fast Co-Pilot by default for regular chat', async () => {
  const { DEFAULT_CHAT_REASONING_MODE, resolveChatTurnReasoningMode } =
    await import('../utils/fmSaveUiHelpers.ts');

  assert.equal(DEFAULT_CHAT_REASONING_MODE, 'fast_lite');
  // Everyday chat respects default fast_lite and manual switches
  assert.equal(resolveChatTurnReasoningMode('fast_lite'), 'fast_lite');
  assert.equal(resolveChatTurnReasoningMode('deep_high'), 'deep_high');
  assert.equal(resolveChatTurnReasoningMode('max_xhigh'), 'max_xhigh');

  // First .fm save import automatically upgrades fast_lite -> deep_high (and keeps max_xhigh if chosen)
  assert.equal(
    resolveChatTurnReasoningMode('fast_lite', { isFmSaveImport: true }),
    'deep_high'
  );
  assert.equal(
    resolveChatTurnReasoningMode('max_xhigh', { isFmSaveImport: true }),
    'max_xhigh'
  );

  // Save-to-save Journey comparisons automatically use deep_high
  assert.equal(
    resolveChatTurnReasoningMode('fast_lite', { isJourneyComparison: true }),
    'deep_high'
  );
  assert.equal(
    resolveChatTurnReasoningMode('fast_lite', { explicitOverride: 'deep_high' }),
    'deep_high'
  );
});


