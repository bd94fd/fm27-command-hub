import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatchLog } from './hydrateMatchLog.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { MatchLogEntry } from '../types/fm27';

const played = (extra: Record<string, unknown> = {}) => ({
  dateIso: '2027-02-08',
  dateDmy: '8 Feb 2027',
  competition: 'Jupiler Pro League',
  opponent: 'Club Brugge',
  venue: 'H',
  result: 'W',
  score: '2-1',
  ...extra,
});

const decodedWith = (playedMatches: unknown[], extra: Record<string, unknown> = {}) =>
  ({
    meta: { saveName: 'zelzate.fm' },
    playedMatches,
    teamMatchStats: [],
    ...extra,
  }) as unknown as DecodedFmSavePayload;

const withFillers = (match: Record<string, unknown>) => [
  match,
  played({ dateIso: '2027-01-31', dateDmy: '31 Jan 2027', opponent: 'Filler One', score: '1-0' }),
  played({ dateIso: '2027-01-24', dateDmy: '24 Jan 2027', opponent: 'Filler Two', score: '0-1' }),
  played({ dateIso: '2027-01-17', dateDmy: '17 Jan 2027', opponent: 'Filler Three', score: '2-2' }),
];

const logEntry = (extra: Partial<MatchLogEntry> = {}) =>
  ({
    id: 'match-1',
    eventNumber: 4,
    date: '8 Feb 2027',
    competition: 'Jupiler Pro League',
    opponent: 'Club Brugge',
    venue: 'H',
    result: 'W',
    score: '2-1',
    xGFor: null,
    xGAgainst: null,
    possession: null,
    passCompletion: null,
    shotsFor: '—',
    shotsAgainst: '—',
    cccFor: null,
    cccAgainst: null,
    goalTimeline: 'Human report',
    potm: 'Tom Peeters',
    defensiveWatchpoints: 'Watch the counter',
    tacticalAudit: 'Human note',
    source: 'MANUAL',
    ...extra,
  }) as unknown as MatchLogEntry;

test('a match already in the log keeps human detail and takes the missing numbers from the save', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith(withFillers(played({ xGFor: 1.84, xGAgainst: 1.12, possession: 55 }))),
    currentMatches: [logEntry()],
  });
  const merged = matches.find((m) => m.id === 'match-1');
  assert.ok(merged);
  assert.equal(matches[0].goalTimeline, 'Human report');
  assert.equal(matches[0].potm, 'Tom Peeters');
  assert.equal(matches[0].xGFor, 1.84);
  assert.equal(matches[0].possession, 55);
  assert.equal(matches[0].source, 'FM_SAVE');
});

test('numbers the log already has are not overwritten by the save', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith(withFillers(played({ xGFor: 0.1, shotsFor: '1' }))),
    currentMatches: [logEntry({ xGFor: 2.5, shotsFor: '14 (5)' })],
  });
  assert.equal(matches[0].xGFor, 2.5);
  assert.equal(matches[0].shotsFor, '14 (5)');
});

test('team match stats fill xG, possession and shots when the match row has none', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith([played()], {
      teamMatchStats: [
        {
          matchId: null,
          date: '2027-02-08',
          opponent: 'Club Brugge',
          isHome: true,
          xgFor: 1.42,
          xgAgainst: 0.88,
          possession: 61,
          passCompletion: 84,
          shots: 15,
          shotsOnTarget: 6,
        },
      ],
    }),
    currentMatches: [],
  });
  assert.equal(matches[0].xGFor, 1.42);
  assert.equal(matches[0].xGAgainst, 0.88);
  assert.equal(matches[0].possession, 61);
  assert.equal(matches[0].passCompletion, 84);
  assert.equal(matches[0].shotsFor, '15 (6)');
});

test('team match stats without a shots-on-target figure give the shot count alone', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith([played()], {
      teamMatchStats: [
        { matchId: null, date: '2027-02-08', opponent: 'Club Brugge', isHome: true, shots: 9, shotsOnTarget: null },
      ],
    }),
    currentMatches: [],
  });
  assert.equal(matches[0].shotsFor, '9');
});

test('a generic competition label becomes the save competition, or Friendly when there is none', () => {
  const generic = buildMatchLog({
    decoded: decodedWith([played({ competition: 'League/Cup' })]),
    currentMatches: [],
  });
  assert.equal(generic.matches[0].competition, 'League/Cup');

  const named = buildMatchLog({
    decoded: decodedWith([played({ competition: 'Belgian Cup' })]),
    currentMatches: [],
  });
  assert.equal(named.matches[0].competition, 'Belgian Cup');

  const empty = buildMatchLog({
    decoded: decodedWith([played({ competition: '  ' })]),
    currentMatches: [],
  });
  assert.equal(empty.matches[0].competition, 'Friendly');
});

test('an existing generic competition label is replaced by the save label', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith(withFillers(played({ competition: 'Jupiler Pro League' }))),
    currentMatches: [logEntry({ competition: 'Cup / Friendly' })],
  });
  assert.equal(matches[0].competition, 'Jupiler Pro League');
});

test('a played match with no date is skipped instead of creating a blank row', () => {
  const { matches, newlyAddedCount } = buildMatchLog({
    decoded: decodedWith([played({ dateIso: '', dateDmy: '', opponent: 'No Date FC' })]),
    currentMatches: [],
  });
  assert.equal(matches.length, 0);
  assert.equal(newlyAddedCount, 0);
});

test('a new match gets a stable id, the next event number and a readable audit line', () => {
  const { matches, newlyAddedCount } = buildMatchLog({
    decoded: decodedWith([played({ opponent: 'Anderlecht', xGFor: 1.84, xGAgainst: 1.12, distanceKm: 112.4 })]),
    currentMatches: [logEntry({ eventNumber: 7 })],
  });
  assert.equal(newlyAddedCount, 1);
  assert.equal(matches[0].id, 'fm-match-8 Feb 2027-anderlecht');
  assert.equal(matches[0].eventNumber, 8);
  assert.equal(matches[0].defensiveWatchpoints, 'Team distance: 112.4 km');
  assert.match(matches[0].tacticalAudit, /^Verified directly from zelzate\.fm \(W 2-1, xG 1\.84-1\.12\)\.$/);
});

test('a new match with no numbers says so rather than inventing them', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith([played({ shotsAgainst: '12', cccFor: 2, cccAgainst: 4 })]),
    currentMatches: [],
  });
  assert.equal(matches[0].xGFor, null);
  assert.equal(matches[0].shotsFor, '—');
  assert.equal(matches[0].shotsAgainst, '12');
  assert.equal(matches[0].cccFor, 2);
  assert.equal(matches[0].defensiveWatchpoints, '—');
  assert.match(matches[0].tacticalAudit, /\(W 2-1\)\.$/);
});

test('four or more played matches replace the log, newest first', () => {
  const four = [4, 3, 2, 1].map((d) => played({ dateIso: `2027-02-0${d}`, dateDmy: `${d} Feb 2027`, opponent: `Opp ${d}` }));
  const { matches } = buildMatchLog({
    decoded: decodedWith(four),
    currentMatches: [logEntry({ id: 'old-1', date: '1 Jan 2027', opponent: 'Old Match' })],
  });
  assert.equal(matches.length, 4);
  assert.equal(matches[0].opponent, 'Opp 4');
  assert.equal(matches[3].opponent, 'Opp 1');
  assert.ok(!matches.some((m) => m.id === 'old-1'));
});

test('a short save keeps the older log entries instead of dropping them', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith([played({ dateIso: '2027-02-08', dateDmy: '8 Feb 2027' })]),
    currentMatches: [logEntry({ id: 'old-1', date: '1 Jan 2027', opponent: 'Old Match' })],
  });
  assert.equal(matches.length, 2);
  assert.equal(matches[1].id, 'old-1');
});

test('a short save keeps the existing log row as-is rather than merging the save numbers into it', () => {
  const { matches } = buildMatchLog({
    decoded: decodedWith([played({ xGFor: 1.84 })]),
    currentMatches: [logEntry({ xGFor: null })],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].xGFor, null);
});

test('an empty save leaves the log alone', () => {
  const { matches, newlyAddedCount } = buildMatchLog({
    decoded: decodedWith([]),
    currentMatches: [logEntry()],
  });
  assert.equal(matches.length, 1);
  assert.equal(newlyAddedCount, 0);
});
