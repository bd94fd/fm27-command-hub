import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOfflineTacticalBriefing } from './offlineBriefingEngine.ts';
import { PlayerRecord } from '../types/fm27.ts';

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    id: overrides.id ?? 'p-1',
    number: overrides.number ?? 1,
    name: overrides.name ?? 'Test Player',
    position: overrides.position ?? 'ST',
    apps: '10',
    minutes: 900,
    rating: 7.1,
    goals: 5,
    xG: 4.2,
    xGPer90: 0.42,
    assists: 2,
    xA: 1.8,
    xAPer90: 0.18,
    drbPer90: 1.5,
    prPassesPer90: 3.0,
    hdrPct: 55,
    intPer90: 1.0,
    tckPct: 70,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '2027-06-30',
    nation: 'BEL',
    wagePw: 1200,
    status: 'Starter',
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 14,
      jumpingReach: 13,
      determination: 15,
      passing: 13,
      finishing: 14,
      tackling: 10,
      firstTouch: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 14,
    },
    ipRole: 'Channel Forward',
    oopRole: 'Centre Forward',
    notes: '',
    ...overrides,
  };
}

describe('offlineBriefingEngine', () => {
  it('returns clean Awaiting .fm Save response with zero fake data when squad is empty', () => {
    const res = buildOfflineTacticalBriefing({
      clubName: '--',
      saveDate: '--',
      nextFixture: '--',
      leagueStandingSub: '--',
      wageSpend: '--',
      balance: '--',
      players: [],
      matches: [],
    });

    assert.equal(res.screenDetected, 'Offline Briefing — Awaiting .fm Save');
    assert.match(res.analysisMarkdown, /No `\.fm` save or squad export is loaded yet/);
    assert.equal(res.chronicleOutcomeMetric, 'Offline');
  });

  it('generates structured offline briefing with expiring contracts, injuries, and zero raw CA/PA', () => {
    const players: PlayerRecord[] = [
      makePlayer({
        id: 'gk-1',
        name: 'Jan Keeper',
        position: 'GK',
        ability: 3.5,
        contractExpiryMonths: 4,
      }),
      makePlayer({
        id: 'st-1',
        name: 'Lars Striker',
        position: 'ST',
        ability: 4.0,
        status: 'Injured',
      }),
    ];

    const res = buildOfflineTacticalBriefing({
      clubName: 'KVV Zelzate',
      saveDate: '2027-02-14',
      nextFixture: 'Jong Cercle (A)',
      leagueStandingSub: '3rd in 1e Nationale',
      wageSpend: '€18,400 p/w',
      balance: '€245,000',
      players,
      matches: [],
      fallbackReason: 'GEMINI_API_KEY not configured',
    });

    assert.equal(res.screenDetected, 'Offline DoF & Tactical Briefing');
    assert.match(res.analysisMarkdown, /KVV Zelzate/);
    assert.match(res.analysisMarkdown, /Jan Keeper/);
    assert.match(res.analysisMarkdown, /Lars Striker/);
    assert.match(res.analysisMarkdown, /Jong Cercle \(A\)/);
    assert.doesNotMatch(res.analysisMarkdown, /\bCA\s*[:=]|\bPA\s*[:=]/i);
    assert.ok(res.immediateClicks.length > 0);
  });

  it('separates current-season League/Cup/Friendlies and excludes other-competition bans from next-match suspensions', () => {
    const squad: PlayerRecord[] = [
      makePlayer({ id: 'gk', name: 'Rene GK', position: 'GK', positionRatings: { GK: 20 } }),
      makePlayer({
        id: 'st-cup-ban',
        uid: 901,
        name: 'Cup Banned Striker',
        position: 'ST',
        positionRatings: { ST: 20 },
        activeSuspensions: [
          {
            playerUid: 901,
            playerName: 'Cup Banned Striker',
            competitionName: 'Croky Cup',
            scope: 'cup',
            reason: 'Red Card',
            matchesRemaining: 1,
          },
        ],
      }),
    ];

    const res = buildOfflineTacticalBriefing({
      clubName: 'KVV Zelzate',
      saveDate: '15/09/2027',
      nextFixture: '18/09/2027 vs KVK Ninove (H)',
      leagueStandingSub: '#6',
      wageSpend: '£9,000/wk',
      balance: '-£700K',
      players: squad,
      matches: [
        {
          id: 'm-lge',
          eventNumber: 1,
          date: '12/09/2027',
          competition: 'Eerste Nationale VV',
          opponent: 'KVK Ninove',
          venue: 'H',
          result: 'W',
          score: '2 - 0',
          xGFor: 1.8,
          xGAgainst: 0.5,
          possession: 55,
          passCompletion: 82,
          shotsFor: '12 (6)',
          shotsAgainst: '5 (2)',
          cccFor: 2,
          cccAgainst: 0,
          goalTimeline: '',
          potm: '',
          defensiveWatchpoints: '',
          tacticalAudit: '',
        },
        {
          id: 'm-frd',
          eventNumber: 2,
          date: '20/07/2027',
          competition: 'Friendly',
          opponent: 'Amateur XI',
          venue: 'H',
          result: 'W',
          score: '5 - 0',
          xGFor: 4.0,
          xGAgainst: 0.2,
          possession: 65,
          passCompletion: 88,
          shotsFor: '20 (10)',
          shotsAgainst: '2 (1)',
          cccFor: 5,
          cccAgainst: 0,
          goalTimeline: '',
          potm: '',
          defensiveWatchpoints: '',
          tacticalAudit: '',
        },
      ],
      hydratedFmSave: {
        decodedPayload: {
          meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', gameDateDmy: '15/09/2027', gameDateIso: '2027-09-15', saveName: 'test.fm' },
          players: [],
          staff: [],
          playedMatches: [],
          upcomingFixtures: [{ dateDmy: '18/09/2027', competition: 'Eerste Nationale VV', opponent: 'KVK Ninove', venue: 'H' }],
        },
      } as never,
    });

    assert.match(res.analysisMarkdown, /Competitive Record \(2027\/28\):\*\* League: 1 GP \(1W-0D-0L/);
    assert.match(res.analysisMarkdown, /Friendlies \(excluded\): 1GP/);
    assert.match(res.analysisMarkdown, /Suspended for Next Match \(0\):\*\* None/);
    assert.match(res.analysisMarkdown, /Other-Comp Bans Only \(Eligible Next Match\): Cup Banned Striker/);
    assert.doesNotMatch(res.analysisMarkdown, /\bCA\s*[:=]|\bPA\s*[:=]/i);
  });
});
