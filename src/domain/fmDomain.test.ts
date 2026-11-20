import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOOD_SHOUTS,
  POST_MATCH_REST_RULE,
  TACTICAL_EFFECTIVENESS,
  TACTICAL_TWEAKS,
} from '../data/playbookV2';
import { createEmptySnapshot, createNullPlayerAttributes, createDefaultPositions } from './emptyState';
import {
  createEmptyClubFilter,
  createEmptyCompetitionFilter,
  createEmptyPlayerFilter,
  createEmptyStaffFilter,
  expandSlashCommand,
  filterClubs,
  filterCompetitions,
  filterPlayers,
  filterStaff,
  formatMoney,
  formatWage,
  matchSlashCommands,
  SLASH_COMMANDS,
} from './filters';
import {
  computeCompetitiveSummary,
  computeFm27EngineMetrics,
  evaluateDoubleGwLoad,
} from './fmEngine';
import {
  analyzeNextOppositionTool,
  analyzeSquadTool,
  buildTransferShortlistTool,
  optimizeLineupTool,
  runContextualFmTools,
} from './fmTools';
import {
  getRoleFitScore,
  getRolePriorities,
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
} from './playerCatalog';
import {
  calculateAllStaffRoleRatings,
  calculateStaffRoleRating,
  getBestStaffRoleRating,
  STAFF_ROLE_BY_KEY,
  staffQualityLabel,
} from './staffRatings';
import type { MatchLogEntry, PlayerRecord, StaffRecord, TacticDefinition } from './types';

function makeTestPlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  const attrs = createNullPlayerAttributes();
  attrs.pace = 15;
  attrs.acceleration = 15;
  attrs.jumping_reach = 14;
  attrs.stamina = 12;
  attrs.passing = 14;
  attrs.tackling = 14;
  attrs.first_touch = 14;
  attrs.decisions = 13;
  attrs.composure = 13;

  const positions = createDefaultPositions();
  positions.DC = 19;

  return {
    id: 1,
    name: 'Test Defender',
    age: 21,
    dateOfBirth: '2005-05-10',
    gender: 'Male',
    heightCm: 186,
    weightKg: 79,
    preferredFoot: 'Right',
    nationality: 'Netherlands',
    playingNation: 'Netherlands',
    playingCompetition: 'Eredivisie',
    club: 'Test FC',
    playingClub: 'Test FC',
    positionText: 'D(C)',
    positions,
    ca: 135,
    pa: 162,
    condition: 96,
    sharpness: 92,
    wagePw: 8500,
    askingPrice: 12000000,
    estimatedValue: 10500000,
    expires: '2029-06-30',
    contractStart: '2025-07-01',
    contractEnd: '2029-06-30',
    squadStatus: 'Regular Starter',
    clauses: [],
    contracts: [],
    onLoan: false,
    teamSlot: 0,
    transferListed: false,
    listedForLoan: false,
    transferAgreed: false,
    futureTransferClub: null,
    futureTransferDate: null,
    futureContractEndDate: null,
    injured: false,
    injury: null,
    injuryLightTrainingDays: null,
    injuryFullTrainingDays: null,
    injuryExpectedReturn: null,
    suspensionsCount: 0,
    onDuty: false,
    dutyReason: null,
    currentReputation: 6500,
    homeReputation: 6500,
    worldReputation: 5500,
    personality: 'Professional',
    attributes: attrs,
    ...overrides,
  };
}

test('Empty state initializes cleanly into Awaiting .fm Save with zero fake data', () => {
  const empty = createEmptySnapshot();
  assert.equal(empty.metadata.status, 'awaiting_save');
  assert.equal(empty.metadata.freshness, 'awaiting');
  assert.equal(empty.metadata.gameDate, null);
  assert.equal(empty.metadata.managedClubName, null);
  assert.equal(empty.players.length, 0);
  assert.equal(empty.staff.length, 0);
  assert.equal(empty.clubs.length, 0);
  assert.equal(empty.competitions.length, 0);
  assert.equal(empty.fixtures.length, 0);
  assert.equal(empty.matchLogs.length, 0);
  assert.equal(empty.tactics.length, 0);
  assert.equal(empty.activeInjuries.length, 0);
  assert.equal(empty.mentoring.length, 0);
  assert.equal(empty.finances, null);
  assert.equal(empty.leagueStanding, null);

  const tools = runContextualFmTools({
    prompt: '/squad',
    commandName: '/squad',
    snapshot: empty,
    managedClubName: null,
    includeManagedClub: true,
    activeTactic: null,
    includeTactic: false,
    recruitmentCases: [],
    shortlists: [],
  });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].toolName, 'fm27_save_status');
  assert.equal(tools[0].data.status, 'awaiting_save');
});

test('Playbook v2.0 static reference data matches verified Patch 27.1.0 specifications', () => {
  assert.equal(TACTICAL_EFFECTIVENESS.eightFamiliarityAreas.length, 8);
  assert.equal(TACTICAL_TWEAKS.filter((t) => t.scope === 'Team').length, 15);
  assert.equal(TACTICAL_TWEAKS.filter((t) => t.scope === 'Individual').length, 6);
  assert.equal(MOOD_SHOUTS.length, 6);
  assert.equal(POST_MATCH_REST_RULE.restDayInjuryProbabilityPct, 4.0);
  assert.equal(POST_MATCH_REST_RULE.normalTrainingInjuryProbabilityPct, 13.8);
});

test('FM27 role catalog loads all 68 IP/OOP roles and handles null attributes in role fit score', () => {
  assert.equal(IN_POSSESSION_ROLES.length + OUT_OF_POSSESSION_ROLES.length, 68);
  const bpd = getRolePriorities('In Possession', 'Ball-Playing Centre-Back');
  assert.equal(bpd.passing, 'primary');
  assert.equal(bpd.tackling, 'primary');
  assert.equal(bpd.first_touch, 'secondary');

  const nullAttrs = createNullPlayerAttributes();
  assert.equal(getRoleFitScore(nullAttrs, 'In Possession', 'Ball-Playing Centre-Back'), null);

  const populated = makeTestPlayer().attributes;
  const fit = getRoleFitScore(populated, 'In Possession', 'Ball-Playing Centre-Back');
  assert.ok(fit !== null && fit > 13);
});

test('StaffRoleRatingCalculator matches FM27 9-role weighted scoring & star bands', () => {
  const coach: StaffRecord = {
    id: 101,
    name: 'Test Coach',
    job: 'Coach',
    club: 'Test FC',
    division: 'Eredivisie',
    nationality: 'England',
    age: 41,
    ca: 155,
    pa: 170,
    salaryWeekly: 6500,
    contractEndDate: '2028-06-30',
    worldReputation: 6000,
    preferredFormation: '4-3-3',
    tacticalStyle: 'Fluid Counter-Attack',
    attributes: {
      attacking: 14,
      defending: 12,
      fitness: 13,
      goalkeeping: 15,
      mental: 14,
      possession: 16,
      set_pieces: 12,
      tactical: 15,
      technical: 18,
      working_with_youngsters: 15,
      adaptability: 14,
      authority: 14,
      determination: 15,
      judging_player_ability: 14,
      judging_player_potential: 14,
      judging_staff_ability: 12,
      man_management: 15,
      motivating: 14,
      negotiating: 10,
      physiotherapy: 5,
      sports_science: 5,
      tactical_knowledge: 14,
      analysing_data: 12,
    },
  };

  const best = getBestStaffRoleRating(coach);
  assert.equal(best.label, 'Possession - Technical');
  assert.equal(best.stars, 4.5);

  const all = calculateAllStaffRoleRatings(coach);
  assert.equal(all.length, 9);

  // Exact Goalkeeping math: (15*9 + 10*2 + 10*2 + 10*2) = 195 -> 195/15 = 13.0, stars = 3.5
  const gkRating = calculateStaffRoleRating(
    { ...coach.attributes, goalkeeping: 15, authority: 10, determination: 10, motivating: 10 },
    STAFF_ROLE_BY_KEY.goalkeeping,
  );
  assert.equal(gkRating.score20, 13.0);
  assert.equal(gkRating.stars, 3.5);
  assert.equal(staffQualityLabel(gkRating.score20), 'Good');
});

test('Filters handle players, staff, clubs, competitions, and null-safe formatting', () => {
  const p1 = makeTestPlayer();
  const p2 = makeTestPlayer({
    id: 2,
    name: 'Veteran Striker',
    age: 31,
    positionText: 'ST',
    positions: { ...createDefaultPositions(), ST: 20 },
    attributes: { ...createNullPlayerAttributes(), finishing: 16 },
  });

  const pf = createEmptyPlayerFilter();
  pf.ageMax = 23;
  pf.positions = { DC: 18 };
  pf.attributes = { passing: 14 };
  const filteredPlayers = filterPlayers([p1, p2], pf);
  assert.equal(filteredPlayers.length, 1);
  assert.equal(filteredPlayers[0].name, 'Test Defender');

  const sf = createEmptyStaffFilter();
  sf.nameContains = 'missing';
  assert.equal(filterStaff([], sf).length, 0);

  const cf = createEmptyClubFilter();
  cf.reputationMin = 5000;
  assert.equal(
    filterClubs(
      [
        {
          id: 1,
          uniqueId: 1,
          name: 'Null Rep Club',
          competition: null,
          nation: null,
          reputation: null,
          trainingFacilities: null,
          youthFacilities: null,
          youthCoaching: null,
          youthRecruitment: null,
          corporateFacilities: null,
          balance: null,
          transferBudget: null,
          payrollBudgetWeekly: null,
          currentWagesWeekly: null,
          financialDate: null,
          loans: [],
          income: [],
          expenditure: [],
          coefficients: null,
        },
      ],
      cf,
    ).length,
    0,
  );

  const compF = createEmptyCompetitionFilter();
  compF.nation = 'Belgium';
  assert.equal(
    filterCompetitions(
      [{ id: 1, name: '1e Nationale VV', nation: 'Belgium', reputation: 4500, gender: 'Male', tier: 3, teamsCount: 16 }],
      compF,
    ).length,
    1,
  );

  assert.equal(formatMoney(null, { currency: 'GBP', wagePeriod: 'weekly' }), '—');
  assert.equal(formatMoney(8590319, { currency: 'GBP', wagePeriod: 'weekly' }), '£8,590,319');
  assert.equal(formatWage(1000, { currency: 'GBP', wagePeriod: 'annual' }), '£52,000');
  assert.equal(formatMoney(1000, { currency: 'EUR', wagePeriod: 'weekly' }), '€1,170');
});

test('Slash commands include all 7 commands and expand cleanly', () => {
  assert.equal(SLASH_COMMANDS.length, 7);
  const matches = matchSlashCommands('/sq');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, '/squad');

  const expanded = expandSlashCommand('/recruit left-back under 23');
  assert.ok(expanded);
  assert.equal(expanded.command.name, '/recruit');
  assert.match(expanded.expanded, /Requirements: left-back under 23/);
});

test('Patch 27.1.0 engine metrics preserve null for missing attributes and compute exact values when present', () => {
  const nullPlayer = makeTestPlayer({ attributes: createNullPlayerAttributes() });
  const nullMetrics = computeFm27EngineMetrics(nullPlayer);
  assert.equal(nullMetrics.topSpeedMps, null);
  assert.equal(nullMetrics.jumpHeightMeters, null);
  assert.equal(nullMetrics.sprintDrainRate, null);
  assert.equal(nullMetrics.physicalEngineScore, null);

  const populated = makeTestPlayer();
  populated.attributes.stamina = 7;
  const metrics = computeFm27EngineMetrics(populated);
  assert.equal(metrics.topSpeedMps, 9.7); // 8.05 + 0.11 * 15
  assert.equal(metrics.jumpHeightMeters, 0.63); // (14 + 5) / 30
  assert.equal(metrics.sprintDrainRate, 1.98); // 2.5 - 0.075 * 7
  assert.ok(metrics.physicalEngineScore !== null);
});

test('Double-GW load evaluation enforces 125m cap and 150m high-stamina exception', () => {
  const standardCheck = evaluateDoubleGwLoad({
    playerId: 1,
    player: 'Standard Winger',
    stamina: 6,
    match1Minutes: 62,
    match2Minutes: 62,
  });
  assert.equal(standardCheck.combinedMinutes, 124);
  assert.equal(standardCheck.capLimit, 125);
  assert.equal(standardCheck.passed, true);
  assert.equal(standardCheck.riskTier, 'Protected');

  const highStaminaCheck = evaluateDoubleGwLoad({
    playerId: 2,
    player: 'High Stamina Striker',
    stamina: 13,
    match1Minutes: 75,
    match2Minutes: 75,
  });
  assert.equal(highStaminaCheck.combinedMinutes, 150);
  assert.equal(highStaminaCheck.capLimit, 150);
  assert.equal(highStaminaCheck.passed, true);

  const overloadCheck = evaluateDoubleGwLoad({
    playerId: 3,
    player: 'Overworked Mid',
    stamina: 8,
    match1Minutes: 90,
    match2Minutes: 60,
  });
  assert.equal(overloadCheck.combinedMinutes, 150);
  assert.equal(overloadCheck.passed, false);
  assert.equal(overloadCheck.riskTier, 'Overload Risk');
});

test('computeCompetitiveSummary preserves null when xG and possession are absent', () => {
  const matchesWithoutXg: MatchLogEntry[] = [
    {
      id: 'm1',
      eventNumber: 1,
      date: '2027-09-01',
      competition: 'Domestic League',
      opponent: 'Rival FC',
      venue: 'H',
      result: 'W',
      score: '2 - 1',
      xGFor: null,
      xGAgainst: null,
      possession: null,
      passCompletion: null,
      shotsFor: null,
      shotsAgainst: null,
      cccFor: null,
      cccAgainst: null,
      goalTimeline: null,
      potm: null,
      defensiveWatchpoints: null,
      tacticalAudit: null,
      source: 'FM_SAVE',
    },
  ];
  const summary = computeCompetitiveSummary(matchesWithoutXg);
  assert.equal(summary.played, 1);
  assert.equal(summary.wins, 1);
  assert.equal(summary.points, 3);
  assert.equal(summary.totalXgFor, null);
  assert.equal(summary.totalXgAgainst, null);
  assert.equal(summary.xgDiff, null);
  assert.equal(summary.avgPossession, null);
});

test('FM27 contextual tools run accurately on loaded snapshot without legacy duties', () => {
  const empty = createEmptySnapshot();
  const myClubPlayer = makeTestPlayer({ id: 1, name: 'My CB', club: 'Test FC', playingClub: 'Test FC' });
  const targetPlayer = makeTestPlayer({
    id: 2,
    name: 'Scouted CB',
    club: 'Other FC',
    playingClub: 'Other FC',
    age: 20,
    pa: 170,
    askingPrice: 5000000,
    estimatedValue: 5000000,
  });

  const loaded = {
    ...empty,
    metadata: { ...empty.metadata, status: 'loaded' as const, managedClubName: 'Test FC', gameDate: '2026-09-14' },
    players: [myClubPlayer, targetPlayer],
    clubs: [
      {
        id: 1,
        uniqueId: 1,
        name: 'Test FC',
        competition: 'Eredivisie',
        nation: 'Netherlands',
        reputation: 7000,
        trainingFacilities: null,
        youthFacilities: null,
        youthCoaching: null,
        youthRecruitment: null,
        corporateFacilities: null,
        balance: 20000000,
        transferBudget: 15000000,
        payrollBudgetWeekly: 200000,
        currentWagesWeekly: 120000,
        financialDate: '2026-09-14',
        loans: [],
        income: [],
        expenditure: [],
        coefficients: null,
      },
    ],
    fixtures: [
      {
        id: 1,
        kickoffDate: '2026-09-19',
        kickoffTime: '15:00',
        opponent: 'Other FC',
        home: true,
        competition: 'Eredivisie',
        venue: 'Home Ground',
        homeClub: 'Test FC',
        awayClub: 'Other FC',
        status: 'Upcoming' as const,
      },
    ],
  };

  const tactic: TacticDefinition = {
    id: 't1',
    fileName: '433.fmf',
    name: 'Portable 4-3-3',
    formation: '4-3-3',
    mentality: 'Positive',
    tacticalStyle: 'Counter-Attack',
    inPossessionInstructions: [],
    inTransitionInstructions: [],
    outOfPossessionInstructions: [],
    lastModified: '2026-09-14',
    slots: [
      { slotIndex: 0, position: 'DC', inPossessionRole: 'Ball-Playing Centre-Back', outOfPossessionRole: 'Centre-Back' },
    ],
  };

  const squadAnalysis = analyzeSquadTool(loaded, 'Test FC');
  assert.equal(squadAnalysis.data.squadSize, 1);

  const lineup = optimizeLineupTool(loaded, 'Test FC', tactic);
  assert.equal((lineup.data.startingXi as unknown[]).length, 1);

  const opp = analyzeNextOppositionTool(loaded, 'Test FC');
  assert.equal((opp.data.fixture as { opponent: string }).opponent, 'Other FC');

  const shortlist = buildTransferShortlistTool(loaded, 'Test FC', 'Find CB targets under 23');
  assert.equal((shortlist.data.targets as Array<{ name: string }>)[0].name, 'Scouted CB');
});
