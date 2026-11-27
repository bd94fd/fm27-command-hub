import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAnalystChatResponse } from './analystResponse.ts';

const validPayload = {
  screenDetected: 'Squad',
  inGameDate: '11/08/2027',
  analysisMarkdown: '### Verdict\nHold the shape.',
  immediateClicks: ['Open Tactics', '', 42],
  followUpQuestions: ['Who rotates?'],
  isMatchResult: true,
  chronicleTitle: 'Window opens',
  chronicleOutcomeMetric: 'Squad audited',
  sourceCitations: ['Squad tab'],
  matchFields: {
    competition: 'Friendly',
    opponent: 'KVC Wilrijk',
    venue: 'H',
    result: 'W',
    score: '3-1',
    xGFor: 2.4,
    xGAgainst: 0.8,
    possession: 58,
    passCompletion: 84,
    shotsFor: '14',
    shotsAgainst: '6',
    cccFor: 4,
    cccAgainst: 1,
    goalTimeline: "12' Nathan",
    potm: 'Nathan',
    defensiveWatchpoints: 'Rest defence',
    tacticalAudit: 'Playbook v2.0',
  },
  playerUpdates: [
    {
      name: 'Nathan Kaninda',
      notes: 'Scored the opener',
      ipRole: 'Inside Forward',
      oopRole: 'Press',
      status: 'Starter',
      condition: 96,
      rating: 7.8,
      goalsAdded: 1,
      assistsAdded: 0,
      minutesAdded: 90,
    },
  ],
};

test('parseAnalystChatResponse keeps a response that matches the schema', () => {
  const parsed = parseAnalystChatResponse(validPayload);

  assert.equal(parsed.screenDetected, 'Squad');
  assert.equal(parsed.inGameDate, '11/08/2027');
  assert.equal(parsed.analysisMarkdown, '### Verdict\nHold the shape.');
  assert.deepEqual(parsed.immediateClicks, ['Open Tactics']);
  assert.deepEqual(parsed.followUpQuestions, ['Who rotates?']);
  assert.equal(parsed.isMatchResult, true);
  assert.deepEqual(parsed.sourceCitations, ['Squad tab']);
  assert.equal(parsed.matchFields?.opponent, 'KVC Wilrijk');
  assert.equal(parsed.matchFields?.venue, 'H');
  assert.equal(parsed.matchFields?.result, 'W');
  assert.equal(parsed.matchFields?.xGFor, 2.4);
  assert.equal(parsed.playerUpdates.length, 1);
  assert.deepEqual(parsed.playerUpdates[0], {
    name: 'Nathan Kaninda',
    notes: 'Scored the opener',
    ipRole: 'Inside Forward',
    oopRole: 'Press',
    status: 'Starter',
    condition: 96,
    rating: 7.8,
    goalsAdded: 1,
    assistsAdded: 0,
    minutesAdded: 90,
  });
  assert.deepEqual(parsed.issues, []);
});

test('parseAnalystChatResponse survives a response that is not an object', () => {
  for (const raw of [null, undefined, 'text', 42, [1, 2, 3]]) {
    const parsed = parseAnalystChatResponse(raw);
    assert.equal(parsed.analysisMarkdown, '');
    assert.equal(parsed.isMatchResult, false);
    assert.equal(parsed.matchFields, null);
    assert.deepEqual(parsed.playerUpdates, []);
    assert.equal(parsed.issues.length, 1);
  }
});

test('parseAnalystChatResponse drops player updates the model got wrong', () => {
  const parsed = parseAnalystChatResponse({
    playerUpdates: [
      { name: 'Good Player', notes: 'Fine' },
      { name: '', notes: 'No name' },
      { notes: 'No name at all' },
      { name: 'No Notes' },
      'not an object',
      null,
    ],
  });

  assert.deepEqual(
    parsed.playerUpdates.map((u) => u.name),
    ['Good Player']
  );
  assert.ok(parsed.issues.some((issue) => issue.includes('dropped 5 player updates')));
});

test('parseAnalystChatResponse clamps condition and refuses invented statuses', () => {
  const parsed = parseAnalystChatResponse({
    playerUpdates: [
      { name: 'A', notes: 'x', condition: 250, status: 'Legend' },
      { name: 'B', notes: 'x', condition: -4, status: 'injured' },
      { name: 'C', notes: 'x', condition: Number.NaN, status: 'Rotation' },
      { name: 'D', notes: 'x', goalsAdded: -3, minutesAdded: 90.6 },
    ],
  });

  const [a, b, c, d] = parsed.playerUpdates;
  assert.equal(a.condition, 100);
  assert.equal(a.status, undefined);
  assert.equal(b.condition, 1);
  assert.equal(b.status, 'Injured');
  assert.equal(c.condition, undefined);
  assert.equal(c.status, 'Rotation');
  assert.equal(d.goalsAdded, 0);
  assert.equal(d.minutesAdded, 91);
});

test('parseAnalystChatResponse refuses a match result with no opponent or score', () => {
  const noOpponent = parseAnalystChatResponse({
    isMatchResult: true,
    matchFields: { score: '2-1' },
  });
  assert.equal(noOpponent.matchFields, null);
  assert.equal(noOpponent.isMatchResult, false);
  assert.ok(noOpponent.issues.some((issue) => issue.includes('lacked an opponent')));

  const noScore = parseAnalystChatResponse({
    isMatchResult: true,
    matchFields: { opponent: 'KVC Wilrijk' },
  });
  assert.equal(noScore.matchFields, null);
  assert.equal(noScore.isMatchResult, false);

  const claimsMatchWithoutFields = parseAnalystChatResponse({ isMatchResult: true });
  assert.equal(claimsMatchWithoutFields.isMatchResult, false);
  assert.ok(
    claimsMatchWithoutFields.issues.some((issue) => issue.includes('no usable matchFields'))
  );
});

test('parseAnalystChatResponse normalises venue and result to the app vocabulary', () => {
  const parsed = parseAnalystChatResponse({
    isMatchResult: true,
    matchFields: { opponent: 'X', score: '1-0', venue: 'away', result: 'won' },
  });
  assert.equal(parsed.matchFields?.venue, 'A');
  assert.equal(parsed.matchFields?.result, 'D');

  const home = parseAnalystChatResponse({
    isMatchResult: true,
    matchFields: { opponent: 'X', score: '1-0', venue: 'h', result: 'l' },
  });
  assert.equal(home.matchFields?.venue, 'H');
  assert.equal(home.matchFields?.result, 'L');
});

test('parseAnalystChatResponse leaves missing optional numbers empty, never zero', () => {
  const parsed = parseAnalystChatResponse({
    isMatchResult: true,
    matchFields: { opponent: 'X', score: '1-0', xGFor: 'lots', possession: null },
  });
  assert.equal(parsed.matchFields?.xGFor, null);
  assert.equal(parsed.matchFields?.possession, null);
  assert.equal(parsed.matchFields?.competition, null);
  assert.equal(parsed.matchFields?.potm, null);
});

test('parseAnalystChatResponse reports a non-array playerUpdates instead of throwing', () => {
  const parsed = parseAnalystChatResponse({ playerUpdates: 'Nathan scored' });
  assert.deepEqual(parsed.playerUpdates, []);
  assert.ok(parsed.issues.some((issue) => issue.includes('playerUpdates was not an array')));
});
