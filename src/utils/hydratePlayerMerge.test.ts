import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSquadWithSave } from './hydratePlayerMerge.ts';
import { buildAvailabilityIndex } from './hydrateAvailability.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { PlayerRecord } from '../types/fm27';

const savePlayer = (uid: number, name: string, extra: Record<string, unknown> = {}) =>
  ({
    uid,
    name,
    ca: 110,
    pa: 140,
    abilityStars: 3.5,
    potentialStars: 4,
    position: 'CM',
    age: 24,
    nation: 'Belgium',
    wagePw: 400,
    expires: '30 Jun 2028',
    minutes: 1200,
    apps: '15',
    rating: 7.1,
    goals: 3,
    assists: 2,
    attributes: { passing: 13, tackling: 11, pace: 12 },
    teamSlot: 0,
    ...extra,
  }) as never;

const squadPlayer = (uid: number, name: string, extra: Partial<PlayerRecord> = {}) =>
  ({
    id: `fm-uid-${uid}`,
    uid,
    number: 0,
    name,
    position: 'CM',
    secondaryPositions: [],
    apps: '10',
    minutes: 800,
    rating: 6.9,
    goals: 2,
    xG: 1.5,
    xGPer90: 0.2,
    assists: 1,
    xA: 1,
    xAPer90: 0.1,
    drbPer90: 0.5,
    prPassesPer90: 3,
    hdrPct: 50,
    intPer90: 1.2,
    tckPct: 60,
    personality: 'Balanced',
    age: 23,
    ability: 3,
    potential: 3.5,
    condition: 90,
    sharpness: 85,
    leftFoot: 10,
    rightFoot: 15,
    preferredFoot: 'Right',
    heightCm: 180,
    positionRatings: null,
    expires: '30 Jun 2027',
    nation: 'Belgium',
    wagePw: 350,
    marketValue: 100000,
    morale: 'Good',
    status: 'Rotation',
    teamSlot: 0,
    squadUnit: 'First Team',
    onLoan: false,
    attributes: {
      pace: 12, acceleration: 12, stamina: 13, jumpingReach: 10, determination: 12,
      passing: 13, finishing: 9, tackling: 11, firstTouch: 12, decisions: 12,
      workRate: 13, offTheBall: 11,
    },
    traits: [],
    scoutBadges: [],
    ipRole: 'Central Midfielder',
    oopRole: 'Central Midfielder',
    notes: 'Baseline note',
    ...extra,
  }) as unknown as PlayerRecord;

const decodedWith = (players: unknown[], extra: Record<string, unknown> = {}) =>
  ({
    meta: { fmsaveVersion: '0.6.2', game: 'FM27', build: 1875, fastSync: false },
    players,
    playedMatches: [],
    activeSuspensions: [],
    activeInjuries: [],
    ...extra,
  }) as unknown as DecodedFmSavePayload;

const merge = (decoded: DecodedFmSavePayload, squad: PlayerRecord[]) =>
  mergeSquadWithSave({ decoded, currentSquad: squad, availability: buildAvailabilityIndex(decoded) });

test('a matching uid updates the numbers and records what changed', () => {
  const result = merge(decodedWith([savePlayer(101, 'René Vanden Borre')]), [
    squadPlayer(101, 'René Vanden Borre'),
  ]);
  const p = result.squad[0];
  assert.equal(p.minutes, 1200);
  assert.equal(p.goals, 3);
  assert.equal(p.wagePw, 400);
  assert.equal(p.uid, 101);
  assert.deepEqual(result.changedPlayers[0].changes.slice(0, 3), [
    'Mins 800→1200',
    'Rating 6.9→7.1',
    'Goals 2→3',
  ]);
  assert.equal(result.removedPlayers.length, 0);
});

test('a changed uid still matches on the normalised name', () => {
  const result = merge(decodedWith([savePlayer(202, 'Tom Peeters')]), [
    squadPlayer(999, 'Tom Peeters'),
  ]);
  assert.equal(result.squad.length, 1);
  assert.equal(result.squad[0].uid, 202);
  assert.equal(result.squad[0].minutes, 1200);
  assert.equal(result.changedPlayers.length, 1);
});

test('a squad player the save no longer lists is removed once the save looks like a full squad', () => {
  const players = Array.from({ length: 10 }, (_, i) => savePlayer(500 + i, `Player ${i}`));
  const result = merge(decodedWith(players), [
    squadPlayer(1, 'Departed One'),
    squadPlayer(500, 'Player 0'),
  ]);
  assert.deepEqual(result.removedPlayers.map((p) => p.name), ['Departed One']);
  assert.equal(result.squad.length, 10);
});

test('a short save keeps the squad instead of wiping it', () => {
  const result = merge(decodedWith([savePlayer(101, 'René Vanden Borre')]), [
    squadPlayer(101, 'René Vanden Borre'),
    squadPlayer(102, 'Unlisted Player'),
  ]);
  assert.equal(result.removedPlayers.length, 0);
  assert.equal(result.squad.length, 2);
});

test('a save player who matches nothing arrives as a new signing, once', () => {
  const result = merge(
    decodedWith([savePlayer(505, 'New Signing', { minutes: 0, apps: '0', rating: null, age: 19, abilityStars: 1.5, potentialStars: 2 })]),
    []
  );
  assert.equal(result.squad.length, 1);
  assert.equal(result.squad[0].name, 'New Signing');
  assert.equal(result.squad[0].status, 'Youth');
  assert.match(result.changedPlayers[0].changes[0], /Added from \.fm save/);
});

test('a second save player with the same name is added rather than merged twice', () => {
  const result = merge(
    decodedWith([savePlayer(101, 'Tom Peeters'), savePlayer(102, 'Tom Peeters')]),
    [squadPlayer(999, 'Tom Peeters')]
  );
  assert.equal(result.squad.length, 2);
});

test('an injured player is marked injured even when the save promises him minutes', () => {
  const decoded = decodedWith([savePlayer(404, 'Jelle Maes', { contractDetails: { promisedPlayingTime: 'Star Player' } })], {
    activeInjuries: [{ playerUid: 404, playerName: 'Jelle Maes' }],
  });
  const result = merge(decoded, [squadPlayer(404, 'Jelle Maes')]);
  assert.equal(result.squad[0].status, 'Injured');
});

test('a live ban is attached, and a cleared one is removed', () => {
  const banned = merge(
    decodedWith([
      savePlayer(101, 'René Vanden Borre', {
        activeSuspensions: [
          {
            playerUid: 101,
            playerName: 'René Vanden Borre',
            competitionName: 'Jupiler Pro League',
            matchesRemaining: 2,
            scope: 'league',
            reason: 'Red card',
          },
        ],
      }),
    ]),
    [squadPlayer(101, 'René Vanden Borre')]
  );
  assert.equal(banned.squad[0].activeSuspensions?.length, 1);

  const cleared = merge(decodedWith([savePlayer(101, 'René Vanden Borre')]), [
    squadPlayer(101, 'René Vanden Borre', {
      activeSuspensions: [
        {
          playerUid: 101,
          playerName: 'René Vanden Borre',
          competitionName: 'Jupiler Pro League',
          matchesRemaining: 0,
          scope: 'league',
          reason: 'Red card',
        },
      ],
    }),
  ]);
  assert.deepEqual(cleared.squad[0].activeSuspensions, []);
});

test('a legacy CA/PA tag in the notes is stripped on every merge', () => {
  const result = merge(decodedWith([savePlayer(101, 'René Vanden Borre')]), [
    squadPlayer(101, 'René Vanden Borre', { notes: 'Good engine [FM Save CA 120/PA 150 hidden]' }),
  ]);
  assert.equal(result.squad[0].notes, 'Good engine');
});

test('season stats label the source, and a save without them falls back to recent matches', () => {
  const withStats = merge(decodedWith([savePlayer(101, 'René Vanden Borre')]), [
    squadPlayer(101, 'René Vanden Borre'),
  ]);
  assert.equal(withStats.squad[0].statsSource, 'Season Stats');

  const withoutStats = merge(
    decodedWith(
      [savePlayer(101, 'René Vanden Borre', { minutes: 0, apps: '0', rating: null, goals: 0, assists: 0 })],
      {
        playedMatches: [{ dateIso: '2027-02-08', dateDmy: '8 Feb 2027', opponent: 'Club Brugge', venue: 'H' }],
        playerMatchStats: { 101: [{ rating: 7.4 }, { rating: 7.8 }] },
      }
    ),
    [squadPlayer(101, 'René Vanden Borre')]
  );
  assert.equal(withoutStats.squad[0].statsSource, 'From Recent Matches');
  assert.equal(withoutStats.squad[0].apps, '2');
  assert.equal(withoutStats.squad[0].rating, 7.6);
});

test('a promised playing time overrides the status, and the save team slot sets the squad unit', () => {
  const result = merge(
    decodedWith([savePlayer(101, 'René Vanden Borre', { contractDetails: { promisedPlayingTime: 'Star Player' }, teamSlot: 2 })]),
    [squadPlayer(101, 'René Vanden Borre')]
  );
  assert.equal(result.squad[0].status, 'Starter');
  assert.equal(result.squad[0].squadUnit, 'U21');
});

test('an empty squad and an empty save produce an empty result', () => {
  const result = merge(decodedWith([]), []);
  assert.deepEqual(result, { squad: [], changedPlayers: [], removedPlayers: [] });
});
