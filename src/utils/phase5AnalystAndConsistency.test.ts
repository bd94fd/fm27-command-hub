import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveTacticalAnalystContext,
  MAX_LIVE_ANALYST_CONTEXT_CHARS,
} from './tacticalAnalystContext.ts';
import {
  diagnoseTacticalAnalystPayload,
  SERVER_MAX_CONTEXT_CHARS,
} from './analystPayload.ts';
import { solveBestXi, type CustomSlotOverride } from './bestXiSolver.ts';
import { buildSquadTransferAudit } from './transferAudit.ts';
import { buildDynamicSetPieceRoutines } from './fmSyncEngine.ts';
import { buildOfflineTacticalBriefing } from './offlineBriefingEngine.ts';
import { IN_POSSESSION_ROLES, OUT_OF_POSSESSION_ROLES } from './fm27RoleMatcher.ts';
import { RETIRED_FM24_ROLES } from './fm27AccuracyCheck.ts';
import type { MatchLogEntry, PlayerRecord } from '../types/fm27.ts';
import type { ActiveSuspensionRecord, RecruitmentTarget } from '../types/fmSave.ts';

const VALID_IP_ROLE_NAMES = new Set(IN_POSSESSION_ROLES.map((r) => r.name));
const VALID_OOP_ROLE_NAMES = new Set(OUT_OF_POSSESSION_ROLES.map((r) => r.name));

function makeSquadPlayer(
  overrides: Partial<PlayerRecord> & { id: string; name: string; position: string }
): PlayerRecord {
  return {
    number: 1,
    apps: '12',
    minutes: 960,
    rating: 7.12,
    goals: 2,
    xG: 1.75,
    xGPer90: 0.16,
    assists: 2,
    xA: 1.4,
    xAPer90: 0.13,
    drbPer90: 1.2,
    prPassesPer90: 3.5,
    hdrPct: 62,
    intPer90: 1.3,
    tckPct: 76,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    condition: 94,
    sharpness: 95,
    preferredFoot: 'Right',
    expires: '30/06/2029',
    contractExpiryMonths: 24,
    nation: 'Belgium',
    wagePw: 480,
    status: 'Starter',
    teamSlot: 0,
    squadUnit: 'First Team',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 14,
      jumpingReach: 12,
      determination: 14,
      passing: 13,
      finishing: 11,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 12,
      heading: 12,
      corners: 10,
      crossing: 12,
      technique: 13,
      naturalFitness: 14,
    },
    ipRole: 'Central Midfielder',
    oopRole: 'Pressing Central Midfielder',
    notes: '',
    ...overrides,
  };
}

function buildRichSyntheticSaveFixture(totalPlayers = 65, totalMatches = 65) {
  const mkContract = (promisedPlayingTime: string) => ({
    promisedPlayingTime,
    releaseClauses: [],
    optionalExtensionYears: 0,
    bonuses: {},
    loanWageContributionPct: null,
  });

  const cupBan: ActiveSuspensionRecord = {
    playerUid: 1007,
    playerName: 'Soren Coens',
    matchesRemaining: 1,
    competitionName: 'Croky Cup',
    scope: 'cup',
    reason: 'Yellow Card Accumulation',
  };
  const leagueBan: ActiveSuspensionRecord = {
    playerUid: 1012,
    playerName: 'Bram Suspended',
    matchesRemaining: 2,
    competitionName: 'Eerste Nationale VV',
    scope: 'league',
    reason: 'Direct Red Card',
  };

  // Core 18 players crafted to exercise every FM27 domain law simultaneously:
  // - Natural PosFam gates (AMC:20, MC:2 vs MC:18; ST <-> STC aliasing)
  // - League-banned player vs Cup-only-banned player
  // - Injured player
  // - Surplus To Requirements (-22 deprioritization) vs Promote to Backup youth
  // - Distinct Aerial / Left-Foot / Right-Foot set-piece specialists
  // - At-risk playing-time promise player (Star Player with low minutes)
  const corePlayers: PlayerRecord[] = [
    makeSquadPlayer({
      id: 'p-gk1',
      uid: 1001,
      name: 'Rene Vanden Borre',
      position: 'GK',
      positionRatings: { GK: 20 },
      ability: 3.5,
      minutes: 1080,
      goals: 0,
      xG: 0,
      assists: 0,
      xA: 0,
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-dr1',
      uid: 1002,
      name: 'Arthur Devos',
      position: 'D (R)',
      positionRatings: { DR: 20, WBR: 17 },
      ability: 3.5,
      preferredFoot: 'Right',
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-dc1',
      uid: 1003,
      name: 'Brendan Schoonbaert',
      position: 'D (C)',
      positionRatings: { DC: 20 },
      ability: 4.0,
      attributes: {
        ...makeSquadPlayer({ id: 'tmp', name: 'tmp', position: 'DC' }).attributes,
        jumpingReach: 18,
        heading: 16,
        tackling: 15,
        positioning: 15,
      },
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-dc2',
      uid: 1004,
      name: 'Brend Leeflang',
      position: 'D (C)',
      positionRatings: { DC: 20 },
      ability: 3.5,
      attributes: {
        ...makeSquadPlayer({ id: 'tmp', name: 'tmp', position: 'DC' }).attributes,
        jumpingReach: 16,
        heading: 15,
        tackling: 14,
      },
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-dl1',
      uid: 1005,
      name: 'Lazarus Nkemdirim',
      position: 'D (L)',
      positionRatings: { DL: 20, WBL: 18 },
      ability: 3.5,
      preferredFoot: 'Left',
      attributes: {
        ...makeSquadPlayer({ id: 'tmp', name: 'tmp', position: 'DL' }).attributes,
        corners: 16,
        crossing: 15,
        technique: 14,
      },
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-dm1',
      uid: 1006,
      name: 'Benjamin Melkebeke',
      position: 'DM',
      positionRatings: { DM: 20, MC: 16 },
      ability: 4.0,
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-mc1',
      uid: 1007,
      name: 'Soren Coens',
      position: 'M (C)',
      positionRatings: { MC: 20, DM: 15 },
      ability: 4.0,
      preferredFoot: 'Right',
      attributes: {
        ...makeSquadPlayer({ id: 'tmp', name: 'tmp', position: 'MC' }).attributes,
        corners: 17,
        passing: 16,
        technique: 15,
      },
      activeSuspensions: [cupBan],
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-mc2',
      uid: 1008,
      name: 'Sander Dieltjens',
      position: 'M (C)',
      positionRatings: { MC: 18, DM: 14 },
      ability: 3.5,
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-amc-out',
      uid: 1009,
      name: 'Visar Shala',
      position: 'AM (C)',
      // Deliberate PosFam trap: AMC:20, MC:2 -> MUST NOT beat natural MC:18 Sander Dieltjens in 4-3-3 MC slot!
      positionRatings: { AMC: 20, MC: 2, AMR: 10 },
      ability: 4.5,
      minutes: 140,
      apps: '3',
      // Star Player with very few minutes -> triggers at-risk/breached playing-time promise!
      contractDetails: mkContract('Star Player'),
      // Inject raw CA/PA string in notes to verify scrubber redacts it
      notes: 'Scout note test CA: 142 PA=168',
    }),
    makeSquadPlayer({
      id: 'p-amr1',
      uid: 1010,
      name: 'Nathan Karinda',
      position: 'AM (R)',
      positionRatings: { AMR: 20, ST: 14 },
      ability: 4.0,
      goals: 9,
      xG: 6.42,
      assists: 7,
      xA: 5.18,
      rating: 7.48,
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-aml1',
      uid: 1011,
      name: 'Matteo Polizzi',
      position: 'AM (L)',
      positionRatings: { AML: 20 },
      ability: 3.5,
      goals: 5,
      xG: 4.35,
      assists: 4,
      xA: 3.6,
      rating: 7.18,
      contractDetails: mkContract('Regular Starter'),
    }),
    makeSquadPlayer({
      id: 'p-aml-ban',
      uid: 1012,
      name: 'Bram Suspended',
      position: 'AM (L)',
      positionRatings: { AML: 20 },
      ability: 4.5,
      activeSuspensions: [leagueBan],
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-st1',
      uid: 1013,
      name: 'Mbey Epolo',
      position: 'ST (C)',
      // Deliberate ST <-> STC alias test: stored under STC:20!
      positionRatings: { STC: 20 },
      ability: 4.0,
      goals: 14,
      xG: 11.24,
      assists: 3,
      xA: 2.15,
      rating: 7.52,
      contractDetails: mkContract('Star Player'),
    }),
    makeSquadPlayer({
      id: 'p-st-inj',
      uid: 1014,
      name: 'Lars Injured',
      position: 'ST (C)',
      positionRatings: { ST: 20 },
      ability: 4.5,
      status: 'Injured',
      contractDetails: mkContract('Important Player'),
    }),
    makeSquadPlayer({
      id: 'p-st-surplus',
      uid: 1015,
      name: 'Wolf Ackx',
      position: 'ST (C)',
      positionRatings: { ST: 20, AML: 18 },
      ability: 3.5,
      potential: 4.5,
      wagePw: 650,
      minutes: 730,
      goals: 0,
      xG: 1.85,
      assists: 1,
      xA: 1.4,
      rating: 6.55,
      status: 'Surplus',
      contractDetails: mkContract('Surplus To Requirements'),
    }),
    makeSquadPlayer({
      id: 'p-st-youth',
      uid: 1016,
      name: 'Mauricio Jr Ndefe',
      position: 'ST (C)',
      positionRatings: { ST: 20, AML: 18 },
      age: 19,
      ability: 3.5,
      potential: 4.5,
      wagePw: 120,
      status: 'Youth',
      contractDetails: mkContract('Breakthrough Prospect'),
    }),
    makeSquadPlayer({
      id: 'p-gk2',
      uid: 1017,
      name: 'Jasper Baeyens',
      position: 'GK',
      positionRatings: { GK: 20 },
      ability: 3.0,
      status: 'Rotation',
      contractDetails: mkContract('Squad Player'),
    }),
    makeSquadPlayer({
      id: 'p-dr2',
      uid: 1018,
      name: 'Dries ManualSwap',
      position: 'D (R)',
      positionRatings: { DR: 20 },
      ability: 3.0,
      status: 'Rotation',
      contractDetails: mkContract('Squad Player'),
    }),
  ];

  // Fill remaining players up to `totalPlayers` (first team backups + U21 + U18)
  const positions = ['DC', 'DL', 'DR', 'DM', 'MC', 'AMR', 'AML', 'ST', 'GK'];
  const extraPlayers: PlayerRecord[] = [];
  for (let i = corePlayers.length; i < totalPlayers; i++) {
    const pos = positions[i % positions.length];
    const isU21 = i >= 30 && i < 48;
    const isU18 = i >= 48;
    extraPlayers.push(
      makeSquadPlayer({
        id: `p-extra-${i}`,
        uid: 2000 + i,
        name: `Depth Player ${i + 1}`,
        position: pos,
        positionRatings: { [pos]: 18 },
        age: isU18 ? 17 : isU21 ? 19 : 22 + (i % 8),
        ability: isU18 ? 2.0 : isU21 ? 2.5 : 3.0,
        potential: isU18 ? 3.5 : 3.5,
        minutes: isU18 ? 0 : isU21 ? 90 : 320,
        goals: i % 3 === 0 ? 1 : 0,
        xG: i % 3 === 0 ? 0.85 : 0.15,
        assists: i % 4 === 0 ? 1 : 0,
        xA: 0.3,
        wagePw: isU18 ? 60 : isU21 ? 150 : 340,
        status: isU18 || isU21 ? 'Youth' : 'Rotation',
        teamSlot: isU18 ? 2 : isU21 ? 1 : 0,
        squadUnit: isU18 ? 'U18' : isU21 ? 'U21' : 'First Team',
        contractDetails: mkContract(isU18 || isU21 ? 'Future Prospect' : 'Squad Player'),
      })
    );
  }

  const players = [...corePlayers, ...extraPlayers];

  // Build 65 matches spanning 2027/28 (League, Cup, Friendlies) and 2026/27 prior season
  const matches: MatchLogEntry[] = Array.from({ length: totalMatches }, (_, idx) => {
    const isPrior = idx >= 45;
    const isFriendly = !isPrior && idx >= 38;
    const isCup = !isPrior && !isFriendly && idx % 6 === 0;
    const comp = isFriendly
      ? 'Pre-Season Friendly'
      : isCup
        ? 'Croky Cup'
        : 'Eerste Nationale VV';
    const day = String(1 + (idx % 28)).padStart(2, '0');
    const month = isPrior ? '03' : isFriendly ? '07' : '10';
    const year = isPrior ? '2027' : '2027';
    return {
      id: `m-${idx + 1}`,
      eventNumber: idx + 1,
      date: `${day}/${month}/${year}`,
      competition: comp,
      opponent: `Opponent Club ${idx + 1}`,
      venue: idx % 2 === 0 ? 'H' : 'A',
      result: idx % 5 === 0 ? 'L' : idx % 3 === 0 ? 'D' : 'W',
      score: idx % 5 === 0 ? '0 - 1' : idx % 3 === 0 ? '1 - 1' : '2 - 0',
      xGFor: 1.72,
      xGAgainst: 0.88,
      possession: 55,
      passCompletion: 84,
      shotsFor: '14 (6)',
      shotsAgainst: '7 (2)',
      cccFor: 2,
      cccAgainst: 1,
      goalTimeline: "28' Epolo, 64' Karinda",
      potm: 'Mbey Epolo (7.9)',
      defensiveWatchpoints: 'Compact midfield screen',
      tacticalAudit: 'Tracking Winger OOP prevented wide overloads',
      source: 'FM_SAVE',
    };
  });

  const trackedTargets: RecruitmentTarget[] = Array.from({ length: 10 }, (_, idx) => ({
    uid: 9000 + idx,
    name: `Shortlist Target ${idx + 1}`,
    age: 21 + (idx % 5),
    nationality: 'Belgium',
    primaryPosition: ['DC', 'DM', 'MC', 'ST', 'AML'][idx % 5],
    currentClub: `Belgian Club ${idx + 1}`,
    isFreeAgent: idx % 2 === 0,
    contractExpiryMonths: idx % 2 === 0 ? 0 : 5,
    demandedWageEur: 420 + idx * 30,
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 14,
      strength: 13,
      jumpingReach: 13,
      finishing: 13,
      offTheBall: 13,
      composure: 13,
      passing: 14,
      decisions: 13,
      workRate: 14,
      vision: 13,
      dribbling: 13,
      crossing: 12,
      tackling: 14,
      marking: 13,
      positioning: 14,
      reflexes: 12,
      handling: 12,
      aerialReach: 12,
    },
  }));

  const staff = Array.from({ length: 10 }, (_, idx) => ({
    id: `st-${idx}`,
    name: `Coach Staff ${idx + 1}`,
    role: ['Assistant Manager', 'Head of Youth Development', 'Chief Scout', 'Goalkeeping Coach', 'Fitness Coach'][idx % 5],
    age: 38 + idx,
    nation: 'BEL',
    club: 'KVV Zelzate',
    wagePw: 320 + idx * 20,
    expires: idx < 4 ? '30/06/2028' : '30/06/2030',
    notes: '',
    attributes: {} as never,
  }));

  const hydratedFmSave = {
    leagueRecordLabel: '#2 · 28 pts (12 GP)',
    balanceLabel: '+£380K',
    wageComplianceLabel: '£9,400 / £11,000 p/w',
    canonicalBalanceNum: 380000,
    activeSuspensions: [cupBan, leagueBan],
    squadPlanner: Array.from({ length: 12 }, (_, idx) => ({
      seasonOffset: 0,
      slot: idx,
      playerNames: [`Depth Player ${idx + 20}`, `Depth Player ${idx + 32}`],
    })),
    decodedPayload: {
      meta: {
        clubName: 'KVV Zelzate',
        managerName: 'Bobby Dean',
        gameDateIso: '2027-11-15',
        gameDateDmy: '15/11/2027',
        saveName: 'zelzate_stress.fm',
      },
      players: [],
      staff: [],
      playedMatches: matches.slice(0, 12).map((m) => ({
        dateIso: '2027-11-08',
        dateDmy: m.date,
        competition: m.competition,
        opponent: m.opponent,
        venue: m.venue,
        result: m.result,
        score: m.score,
      })),
      upcomingFixtures: [
        {
          dateIso: '2027-11-22',
          dateDmy: '22/11/2027',
          competition: 'Eerste Nationale VV',
          opponent: 'KSV Cercle Brugge U23',
          venue: 'A',
        },
        {
          dateIso: '2027-11-29',
          dateDmy: '29/11/2027',
          competition: 'Croky Cup',
          opponent: 'KAA Gent',
          venue: 'H',
        },
      ],
      leagueStanding: {
        competitionName: 'Eerste Nationale VV',
        position: 2,
        played: 12,
        won: 9,
        drawn: 1,
        lost: 2,
        goalsFor: 24,
        goalsAgainst: 9,
        goalDiff: 15,
        points: 28,
        teamCount: 16,
        nextOpponentStanding: {
          clubName: 'KSV Cercle Brugge U23',
          position: 5,
          played: 12,
          points: 21,
          goalDiff: 6,
        },
        rows: [
          { position: 1, clubName: 'KSC Lokeren', points: 30 },
          { position: 2, clubName: 'KVV Zelzate', points: 28 },
          { position: 3, clubName: 'Royal Knokke FC', points: 24 },
          { position: 4, clubName: 'KVK Ninove', points: 22 },
          { position: 5, clubName: 'KSV Cercle Brugge U23', points: 21 },
          { position: 6, clubName: 'RAEC Mons', points: 19 },
        ],
      },
      activeInjuries: [
        {
          playerUid: 1014,
          playerName: 'Lars Injured',
          typeName: 'Hamstring Strain',
        },
      ],
      governance: {
        managerContract: {
          available: true,
          managerName: 'Bobby Dean',
          wagePw: 750,
          expires: '30/06/2029',
          contractExpiryMonths: 19,
          jobSecurity: 'Very Secure',
        },
        boardObjectives: [
          { id: 'o1', title: 'Finish in Top 4 of Eerste Nationale VV', importance: 'Required', status: 'On Track' },
          { id: 'o2', title: 'Develop players using club youth system', importance: 'Favoured', status: 'On Track' },
        ],
        clubPromises: [
          {
            id: 'pr1',
            subject: 'Increase first-team starts for Visar Shala (avoid CA: 142 leaks)',
            targetName: 'Visar Shala',
            dueDate: '31/01/2028',
            status: 'At Risk',
          },
        ],
      },
      tactics: [
        {
          name: 'Zelzate 4-3-3 Press v2',
          mentality: 'Positive',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-3-3 DM Wide',
          slots: [
            { slotIndex: 0, position: 'GK', playerUid: 1001, playerName: 'Rene Vanden Borre', inPossessionRole: 'No-Nonsense Goalkeeper', outOfPossessionRole: 'Line-Holding Keeper' },
            { slotIndex: 1, position: 'DR', playerUid: 1002, playerName: 'Arthur Devos', inPossessionRole: 'Full-Back', outOfPossessionRole: 'Holding Full-Back' },
            { slotIndex: 2, position: 'DCR', playerUid: 1003, playerName: 'Brendan Schoonbaert', inPossessionRole: 'Ball-Playing Centre-Back', outOfPossessionRole: 'Covering Centre-Back' },
            { slotIndex: 3, position: 'DCL', playerUid: 1004, playerName: 'Brend Leeflang', inPossessionRole: 'Centre-Back', outOfPossessionRole: 'Stopping Centre-Back' },
            { slotIndex: 4, position: 'DL', playerUid: 1005, playerName: 'Lazarus Nkemdirim', inPossessionRole: 'Full-Back', outOfPossessionRole: 'Holding Full-Back' },
            { slotIndex: 5, position: 'DM', playerUid: 1006, playerName: 'Benjamin Melkebeke', inPossessionRole: 'Defensive Midfielder', outOfPossessionRole: 'Screening Defensive Midfielder' },
            { slotIndex: 6, position: 'MCR', playerUid: 1007, playerName: 'Soren Coens', inPossessionRole: 'Channel Midfielder', outOfPossessionRole: 'Pressing Central Midfielder' },
            { slotIndex: 7, position: 'MCL', playerUid: 1008, playerName: 'Sander Dieltjens', inPossessionRole: 'Box-to-Box Midfielder', outOfPossessionRole: 'Screening Central Midfielder' },
            { slotIndex: 8, position: 'AMR', playerUid: 1010, playerName: 'Nathan Karinda', inPossessionRole: 'Winger', outOfPossessionRole: 'Tracking Winger' },
            { slotIndex: 9, position: 'AML', playerUid: 1011, playerName: 'Matteo Polizzi', inPossessionRole: 'Inside Forward', outOfPossessionRole: 'Tracking Winger' },
            { slotIndex: 10, position: 'STC', playerUid: 1013, playerName: 'Mbey Epolo', inPossessionRole: 'Channel Forward', outOfPossessionRole: 'Central Outlet Centre Forward' },
          ],
        },
      ],
      recruitmentTargets: trackedTargets,
    },
  };

  const latestJourneyReport = {
    fromDate: '01/09/2027',
    toDate: '15/11/2027',
    fromSeason: '2027/28',
    toSeason: '2027/28',
    sameSeason: true,
    clubName: 'KVV Zelzate',
    timeline: [{ date: '01/09/2027' }, { date: '15/11/2027' }],
    baseDiff: {
      fromDate: '01/09/2027',
      toDate: '15/11/2027',
      totalTracked: 65,
      risers: [],
      fallers: [],
      newgens: [],
      departed: [],
      contractChanges: [],
      kpiDeltas: {
        fromSquadCount: 62,
        toSquadCount: 65,
        squadCountDelta: 3,
        fromAvgAbility: 3.05,
        toAvgAbility: 3.22,
        avgAbilityDelta: 0.17,
        fromTotalWagePw: 9800,
        toTotalWagePw: 9400,
        totalWageDeltaPw: -400,
        fromBalance: '+£210K',
        toBalance: '+£380K',
      },
    },
    improved: [
      { title: 'League PPG surged', deltaLabel: '+0.45 PPG' },
      { title: 'Weekly wage bill trimmed', deltaLabel: '-£400/wk' },
    ],
    worsened: [{ title: 'Visar Shala playing-time satisfaction dipped', deltaLabel: '-18% mins' }],
    thingsToNote: [
      { title: 'Youth promotion', detail: 'Mauricio Jr Ndefe ready as ST backup' },
    ],
    playerStatDeltas: [
      {
        uid: 1013,
        name: 'Mbey Epolo',
        position: 'ST (C)',
        goalsDelta: 6,
        assistsDelta: 2,
        minutesDelta: 540,
        ratingFrom: 7.05,
        ratingTo: 7.52,
        ratingDelta: 0.47,
      },
    ],
  };

  return {
    players,
    matches,
    staff,
    trackedTargets,
    hydratedFmSave,
    latestJourneyReport,
  };
}

describe('Phase 5: Priority-budgeted 18,000-char context builder (65-player / 65-match stress)', () => {
  it('stays strictly within ceiling without tail-truncating PosFam, IP/OOP blueprint, competition bans, promises, G/xG/A/xA, or Journey deltas — with zero raw CA/PA', () => {
    const fx = buildRichSyntheticSaveFixture(65, 65);

    const stateInput = {
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      saveDate: '15/11/2027',
      nextFixture: '22/11/2027 vs KSV Cercle Brugge U23 (A)',
      leagueStandingSub: '#2 of 16 (28 Pts)',
      wageSpend: '£9,400 / £11,000 p/w',
      balance: '+£380K',
      players: fx.players,
      matches: fx.matches,
      staff: fx.staff,
      trackedTargets: fx.trackedTargets,
      hydratedFmSave: fx.hydratedFmSave as never,
      latestJourneyReport: fx.latestJourneyReport as never,
      userQuery: 'Audit Mbey Epolo, Visar Shala promise risk, and our bans before Cercle U23',
    };

    const ctx = buildLiveTacticalAnalystContext(stateInput);
    const diag = diagnoseTacticalAnalystPayload(stateInput, {
      liveAppContextOverride: ctx,
      message: stateInput.userQuery,
    });

    // 1. Strictly under both client budget (15,500) and server 18,000-char ceiling, with ZERO brute-force [Context trimmed]
    assert.ok(
      ctx.length <= MAX_LIVE_ANALYST_CONTEXT_CHARS && ctx.length <= SERVER_MAX_CONTEXT_CHARS,
      `Expected ctx <= ${MAX_LIVE_ANALYST_CONTEXT_CHARS} (server ${SERVER_MAX_CONTEXT_CHARS}), got ${ctx.length}`
    );
    assert.equal(ctx.includes('[Context trimmed]'), false, 'Priority budgeting must not fall back to brute-force tail slicing');
    assert.equal(diag.limits.withinLiveLimit, true);
    assert.equal(diag.limits.withinServerLimit, true);
    assert.equal(diag.limits.wasTrimmed, false);

    // 2. Protected P0 critical blocks MUST all be present & intact even with 65 players + 65 matches
    assert.ok(ctx.includes('ACTIVE SUSPENSIONS (Eerste Nationale VV) — DO NOT SELECT AS STARTER: Bram Suspended'), 'League ban missing');
    assert.ok(ctx.includes('OTHER-COMPETITION BANS ONLY') && ctx.includes('Soren Coens') && ctx.includes('ELIGIBLE for Eerste Nationale VV'), 'Cup-only ban distinction missing');
    assert.ok(ctx.includes('Squad Playing-Time Promise Audit') && ctx.includes('Visar Shala'), 'Playing-time promise audit missing');
    assert.ok(ctx.includes('LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT (Zelzate 4-3-3 Press v2)'), 'Active IP/OOP tactic blueprint missing');
    assert.ok(ctx.includes('IP:Winger/OOP:Tracking Winger') && ctx.includes('IP:Channel Forward/OOP:Central Outlet Centre Forward'), 'Decoded IP/OOP starter roles missing');
    assert.ok(ctx.includes('Player Wage Bill £9,400 / £11,000 p/w'), 'Canonical player wage bill missing or mislabelled');
    assert.ok(ctx.includes('Staff wages are separate and can exceed it'), 'Staff/player payroll scope must stay explicit');
    assert.equal(ctx.includes('all players in every squad plus all staff'), false, 'The player wage bill must never be described as including all staff');
    assert.ok(ctx.includes('SAVE-TO-SAVE JOURNEY REPORT (01/09/2027 [2027/28] -> 15/11/2027 [2027/28]'), 'Save-to-Save Journey Report missing');
    assert.ok(ctx.includes('Mbey Epolo (+6G/+2A/+540m, 7.52rt)'), 'Journey player deltas missing');

    // 3. Squad Profiles retain PosFam[...] and full G/xG/A/xA on key players
    assert.ok(ctx.includes('=== SQUAD PROFILES & SEASON STATS'), 'Squad profiles header missing');
    assert.ok(ctx.includes('PosFam[ST:20]') || ctx.includes('PosFam[STC:20]'), 'PosFam missing for striker');
    assert.ok(ctx.includes('PosFam[AMC:20,MC:2]'), 'PosFam missing for queried AMC');
    assert.ok(ctx.includes('14G(11.24xG) 3A(2.15xA) 7.52rt'), 'Full season G/xG/A/xA missing for Mbey Epolo');
    assert.ok(ctx.includes('9G(6.42xG) 7A(5.18xA) 7.48rt'), 'Full season G/xG/A/xA missing for Nathan Karinda');

    // 4. Zero raw numeric CA/PA tokens anywhere (even when injected in notes/promises!)
    assert.equal(diag.privacyAudit.zeroRawCaPa, true, `Raw CA/PA leaked: ${diag.privacyAudit.flaggedTokens.join(', ')}`);
    assert.doesNotMatch(ctx, /\b(?:CA|PA)\s*[:=]\s*\d+/i);
    assert.doesNotMatch(ctx, /\b(?:CA|PA)\s+\d{2,3}\b/);
    assert.equal(diag.passed, true, `Diagnostics warnings: ${diag.warnings.join('; ')}`);
  });
});

describe('Phase 5: Cross-screen deterministic agreement (War Room, Transfers, Set-Pieces, Offline Briefing, AI Context)', () => {
  it('stays in 100% deterministic agreement across all 5 surfaces with authentic FM27 IP/OOP roles only and zero retired FM24 roles', () => {
    const fx = buildRichSyntheticSaveFixture(22, 16);
    const activeShape = '4-3-3 DM Wide' as const;
    const nextComp = 'Eerste Nationale VV';
    const firstTeamPool = fx.players.filter((p) => p.teamSlot === undefined || p.teamSlot === 0);
    const customSlots: CustomSlotOverride[] = [
      // Manual Pitch Builder swap: put Dries ManualSwap at DR to verify War Room, Offline Briefing & AI Context all honor it identically
      { slotId: 'DR', playerId: 'p-dr2', ipRole: 'Full-Back', oopRole: 'Holding Full-Back' },
    ];

    // 1. War Room solver
    const warRoom = solveBestXi(firstTeamPool, {
      shape: activeShape,
      customSlots,
      excludeInjured: true,
      excludeSuspended: true,
      activeSuspensions: fx.hydratedFmSave.activeSuspensions,
      nextCompetitionName: nextComp,
    });
    const warRoomWithManual = warRoom.startingXI.map((slot) => {
      const ov = customSlots.find((c) => c.slotId === slot.slotId);
      if (!ov?.playerId) return slot;
      const mp = fx.players.find((p) => p.id === ov.playerId);
      return mp ? { ...slot, player: mp, ipRole: ov.ipRole || slot.ipRole, oopRole: ov.oopRole || slot.oopRole } : slot;
    });

    // 2. Transfers audit
    const transfers = buildSquadTransferAudit(fx.players, '15/11/2027', {
      balanceNum: 380000,
      wagePayrollWeekly: 9400,
      wageBudgetWeekly: 11000,
    });

    // 3. Set-Piece rankings
    const setPieces = buildDynamicSetPieceRoutines(fx.players);

    // 4. Offline Briefing
    const offline = buildOfflineTacticalBriefing({
      clubName: 'KVV Zelzate',
      saveDate: '15/11/2027',
      nextFixture: '22/11/2027 vs KSV Cercle Brugge U23 (A)',
      leagueStandingSub: '#2 of 16 (28 Pts)',
      wageSpend: '£9,400 / £11,000 p/w',
      balance: '+£380K',
      players: fx.players,
      matches: fx.matches,
      hydratedFmSave: fx.hydratedFmSave as never,
      activeShape,
      customSlots,
    });

    // 5. AI Context Builder
    const aiCtx = buildLiveTacticalAnalystContext({
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      saveDate: '15/11/2027',
      nextFixture: '22/11/2027 vs KSV Cercle Brugge U23 (A)',
      leagueStandingSub: '#2 of 16 (28 Pts)',
      wageSpend: '£9,400 / £11,000 p/w',
      balance: '+£380K',
      players: fx.players,
      matches: fx.matches,
      hydratedFmSave: fx.hydratedFmSave as never,
      activeShape,
      customSlots,
    });

    // A. War Room PosFam, Availability, Cup-only Ban & Surplus-22 Laws
    const xiNames = warRoomWithManual.map((s) => s.player?.name).filter(Boolean) as string[];
    assert.equal(xiNames.length, 11);
    assert.ok(xiNames.includes('Mbey Epolo'), 'ST<->STC alias must pick natural STC:20 Mbey Epolo');
    assert.ok(xiNames.includes('Soren Coens'), 'Cup-only banned Soren Coens MUST remain eligible for League match');
    assert.ok(xiNames.includes('Sander Dieltjens'), 'Natural MC:18 Sander Dieltjens must beat AMC:20/MC:2 Visar Shala at MC');
    assert.ok(xiNames.includes('Dries ManualSwap'), 'Manual DR Pitch Builder override must apply');
    assert.equal(xiNames.includes('Visar Shala'), false, 'AMC:20/MC:2 must NOT start in 4-3-3 MC slot ahead of natural MCs');
    assert.equal(xiNames.includes('Bram Suspended'), false, 'League-banned Bram Suspended must be excluded from League XI');
    assert.equal(xiNames.includes('Lars Injured'), false, 'Injured Lars Injured must be excluded from XI');
    assert.equal(xiNames.includes('Wolf Ackx'), false, 'Surplus To Requirements Wolf Ackx must not start');

    // B-Team ST slot picks Promoted Youth Mauricio Jr Ndefe over Surplus Wolf Ackx
    const bTeamSt = warRoom.rotatedBTeam.find((s) => s.slotId === 'ST');
    assert.equal(bTeamSt?.player?.name, 'Mauricio Jr Ndefe');

    // B. War Room <-> Offline Briefing <-> AI Context Builder EXACT XI agreement
    const warRoomLine = aiCtx.split('\n').find((l) => l.startsWith('GK:')) || '';
    const offlineXiLine = offline.analysisMarkdown.split('\n').find((l) => l.startsWith('- **Starting XI:**')) || '';
    for (const slot of warRoomWithManual) {
      assert.ok(slot.player, `Expected filled slot ${slot.label}`);
      assert.ok(
        warRoomLine.includes(`${slot.label}:${slot.player!.name}`),
        `AI Context XI mismatch on ${slot.label}: expected ${slot.player!.name} in "${warRoomLine}"`
      );
      assert.ok(
        offlineXiLine.includes(`${slot.label}: ${slot.player!.name}`),
        `Offline Briefing XI mismatch on ${slot.label}: expected ${slot.player!.name} in "${offlineXiLine}"`
      );
    }

    // C. Competition-Scoped Bans & Injuries exact agreement across Offline Briefing & AI Context
    assert.ok(offline.analysisMarkdown.includes('Lars Injured (Hamstring Strain)'));
    assert.ok(aiCtx.includes('Lars Injured (Hamstring Strain)'));
    assert.ok(offline.analysisMarkdown.includes('Suspended for Next Match (1):** Bram Suspended'));
    assert.ok(offline.analysisMarkdown.includes('Other-Comp Bans Only (Eligible Next Match): Soren Coens'));
    assert.ok(aiCtx.includes('ACTIVE SUSPENSIONS (Eerste Nationale VV) — DO NOT SELECT AS STARTER: Bram Suspended'));
    assert.ok(aiCtx.includes('OTHER-COMPETITION BANS ONLY') && aiCtx.includes('Soren Coens'));

    // D. Transfers <-> Offline Briefing <-> AI Context exact agreement on Surplus Sell & Promote to Backup
    const wolfAdvice = transfers.playerAdvice.find((a) => a.player.name === 'Wolf Ackx');
    assert.equal(wolfAdvice?.verdict, 'Sell / Transfer List');
    assert.ok(aiCtx.includes('Wolf Ackx'));
    assert.ok(offline.analysisMarkdown.includes('Wolf Ackx'));

    const ndefeAdvice = transfers.playerAdvice.find((a) => a.player.name === 'Mauricio Jr Ndefe');
    assert.notEqual(ndefeAdvice?.verdict, 'Loan Out', 'Promote-to-Backup youth must never be loaned out');
    if (ndefeAdvice?.tags.some((t) => t.startsWith('Promote to Backup'))) {
      assert.ok(aiCtx.includes('Promote to Backup (DO NOT LOAN OUT)') && aiCtx.includes('Mauricio Jr Ndefe'));
      assert.ok(offline.analysisMarkdown.includes('Promote to Backup (Do Not Loan Out)') && offline.analysisMarkdown.includes('Mauricio Jr Ndefe'));
    }

    // E. Set-Pieces <-> Offline Briefing <-> AI Context exact agreement
    const topAerial = setPieces.aerialThreats[0];
    const topLeft = setPieces.leftFootTakers[0];
    const topRight = setPieces.rightFootTakers[0];
    assert.equal(topAerial.name, 'Brendan Schoonbaert');
    assert.equal(topLeft.name, 'Lazarus Nkemdirim');
    assert.equal(topRight.name, 'Soren Coens');
    assert.ok(aiCtx.includes(`Aerial: ${topAerial.name}(JR${topAerial.jumpingReach})`));
    assert.ok(aiCtx.includes(`L-Foot: ${topLeft.name}(Cor${topLeft.corners})`));
    assert.ok(aiCtx.includes(`R-Foot: ${topRight.name}(Cor${topRight.corners})`));
    assert.ok(offline.analysisMarkdown.includes(`Aerial: ${topAerial.name} (JR ${topAerial.jumpingReach})`));
    assert.ok(offline.analysisMarkdown.includes(`L-Foot: ${topLeft.name} (Cor ${topLeft.corners})`));
    assert.ok(offline.analysisMarkdown.includes(`R-Foot: ${topRight.name} (Cor ${topRight.corners})`));

    // F. Authentic FM27 IP/OOP Roles ONLY & ZERO retired FM24 roles / legacy duties across all outputs
    for (const slot of [...warRoomWithManual, ...warRoom.rotatedBTeam]) {
      assert.ok(VALID_IP_ROLE_NAMES.has(slot.ipRole), `Non-FM27 IP role emitted: ${slot.ipRole}`);
      assert.ok(VALID_OOP_ROLE_NAMES.has(slot.oopRole), `Non-FM27 OOP role emitted: ${slot.oopRole}`);
    }

    const combinedText = `${aiCtx}\n${offline.analysisMarkdown}`;
    for (const retired of RETIRED_FM24_ROLES) {
      assert.equal(
        new RegExp(`\\b${retired}\\b`, 'i').test(combinedText),
        false,
        `Retired FM24 role "${retired}" must never appear in War Room / Offline Briefing / AI Context`
      );
    }
    assert.doesNotMatch(
      combinedText,
      /\b(?:Winger|Full-Back|Centre-Back|Midfielder|Forward)\s*\((?:Attack|Support|Defend)\)/i,
      'Legacy FM24 duties (Attack/Support/Defend) must never appear'
    );
  });
});
