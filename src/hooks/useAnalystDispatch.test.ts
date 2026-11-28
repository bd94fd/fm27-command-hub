import assert from 'node:assert/strict';
import test from 'node:test';
import { useAnalystDispatch } from './useAnalystDispatch.ts';
import type { AnalystDispatchOptions } from './useAnalystDispatch.ts';
import type { AttachedFmFile } from './useAnalystDispatch.ts';
import type { ChatTurnPayload } from '../services/chatStorage.ts';
import type { HydratedSaveState } from '../utils/fmSaveHydrator.ts';

/**
 * The hook reads and writes state the workspace owns. These tests stand in for
 * that state and check the one thing the user can see leave the app: the prompt
 * handed to the analyst.
 */
function makeOptions(
  captured: ChatTurnPayload[],
  overrides: Partial<AnalystDispatchOptions> = {}
): AnalystDispatchOptions {
  return {
    analystAbortRef: { current: null },
    chatClubKeyRef: { current: 'club:kvv-zelzate' },
    currentSaveDate: '11/08/2027',
    matches: [],
    nextEventNum: 12,
    onAddMatch: () => {},
    players: [],
    reasoningMode: 'fast_lite',
    setChatError: () => {},
    setChatFallbackNotice: () => {},
    setDismissedPreFlightSignature: () => {},
    setIsSending: () => {},
    setPreFlightDispatchValidation: () => {},
    turns: [],
    updateTurnsForClub: (_key, action) => {
      const base: ChatTurnPayload[] = captured.slice();
      const next = typeof action === 'function' ? action(base) : action;
      captured.length = 0;
      captured.push(...next);
    },
    ...overrides,
  };
}

function makeHydratedSave(overrides: Partial<HydratedSaveState> = {}): HydratedSaveState {
  const base = {
    saveDateLabel: '11/08/2027',
    nextFixtureLabel: 'vs KAA Gent (3rd)',
    leagueStandingLabel: '3rd',
    wageComplianceLabel: '£11k/wk',
    balanceLabel: '£1.2M',
    changedPlayers: [],
    removedPlayers: [],
    newMatchesCount: 0,
    updatedSquad: [],
    updatedMatches: [],
    decodedPayload: {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', clubUid: 42 },
      extractionWarnings: [],
    },
  };
  return { ...base, ...overrides } as unknown as HydratedSaveState;
}

function makeAttachedSave(): AttachedFmFile {
  return {
    id: 'fm-1',
    name: 'auto_save_v03_.fm',
    kind: 'FM_SAVE_DECODED',
    badgeLabel: 'Save',
    promptContext: 'decoded save context',
    hydratedSave: makeHydratedSave(),
  };
}

test('a typed prompt reaches the analyst exactly as the user wrote it', async () => {
  const captured: ChatTurnPayload[] = [];
  const dispatch = useAnalystDispatch(makeOptions(captured));

  await dispatch({
    promptText: '  Where am I weakest before the Gent game?  ',
    imagesToSend: [],
    fmFilesToSend: [],
  });

  const userTurn = captured.find((turn) => turn.role === 'user');
  assert.ok(userTurn, 'the user turn is written before the request');
  assert.equal(userTurn.userText, '  Where am I weakest before the Gent game?  ');
  assert.deepEqual(userTurn.imageNames, []);
  assert.match(userTurn.id, /^user-\d+$/);
});

test('no typed prompt falls back to the import sentence, naming every attached file', async () => {
  const captured: ChatTurnPayload[] = [];
  const dispatch = useAnalystDispatch(makeOptions(captured));

  await dispatch({
    promptText: '',
    imagesToSend: [{ base64: 'AAA', mimeType: 'image/png', name: 'squad.png' }],
    fmFilesToSend: [makeAttachedSave()],
  });

  const userTurn = captured.find((turn) => turn.role === 'user');
  assert.ok(userTurn);
  assert.equal(
    userTurn.userText,
    "Imported auto_save_v03_.fm, squad.png — analyse my squad, played results, league standing, finances, and injuries against Bobby Dean's Playbook v2.0, and give me a concise tactical & rotation plan from 11/08/2027 forward."
  );
  assert.deepEqual(userTurn.imageNames, ['auto_save_v03_.fm', 'squad.png']);
});

test('the fallback sentence uses the save date the import reports, not the one on screen', async () => {
  const captured: ChatTurnPayload[] = [];
  const dispatch = useAnalystDispatch(makeOptions(captured));

  await dispatch({
    promptText: '',
    imagesToSend: [],
    fmFilesToSend: [
      {
        ...makeAttachedSave(),
        hydratedSave: makeHydratedSave({ saveDateLabel: '01/09/2027' }),
      },
    ],
  });

  const userTurn = captured.find((turn) => turn.role === 'user');
  assert.ok(userTurn);
  assert.match(userTurn.userText ?? '', /from 01\/09\/2027 forward\.$/);
});

test('an empty prompt with nothing attached still writes a turn and never leaves sending on', async () => {
  const captured: ChatTurnPayload[] = [];
  const sending: boolean[] = [];
  const dispatch = useAnalystDispatch(
    makeOptions(captured, { setIsSending: (value) => sending.push(Boolean(value)) })
  );

  await dispatch({ promptText: '', imagesToSend: [], fmFilesToSend: [] });

  assert.ok(captured.some((turn) => turn.role === 'user'));
  assert.equal(sending[0], true);
  assert.equal(sending[sending.length - 1], false);
});
