import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { MatchLogEntry, PlayerRecord } from '../types/fm27';
import {
  classifyWageCompliance,
  formatClubMoney,
  resolveCanonicalBalanceNum,
  resolveCanonicalClubFinances,
} from './clubFinances';
import {
  buildSquadTransferAudit,
  classifySquadTier,
  resolvePrimaryPositionBucket,
} from './transferAudit';
import {
  buildProgressionSnapshot,
  computeProgressionDiff,
  formatAttributeLabel,
  isAttributeRelevantForPosition,
} from './progressionDiff';
import { GeminiService } from '../../server/geminiService';
import { loadServerConfig } from '../../server/config';
import { buildJourneyReportSystemPrompt } from '../../server/prompts';
import {
  buildDeepJourneyReport,
  createSaveHistoryPoint,
  JOURNEY_BRIEFING_CACHE_PREFIX,
} from '../services/saveCache';
import { evaluateSeasonProduction, getRealShirtNumber } from './playerCardAnalysis';
import { DecodedFmSavePayload, hydrateAppFromDecodedFmSave } from './fmSaveHydrator';

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    id: 'p1',
    uid: 1001,
    number: 10,
    name: 'Test Player',
    position: 'M (C)',
    apps: '4',
    minutes: 360,
    rating: 7.1,
    goals: 1,
    xG: 0.7,
    xGPer90: 0.18,
    assists: 1,
    xA: 0.6,
    xAPer90: 0.15,
    drbPer90: 1.0,
    prPassesPer90: 4.0,
    hdrPct: 50,
    intPer90: 1.4,
    tckPct: 75,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '30/06/2029',
    nation: 'BEL',
    wagePw: 300,
    status: 'Starter',
    teamSlot: 0,
    onLoan: false,
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 12,
      determination: 14,
      passing: 13,
      finishing: 11,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 13,
      offTheBall: 12,
    },
    ipRole: 'Central Midfielder (CM)',
    oopRole: 'Central Midfielder (CM)',
    notes: '',
    ...overrides,
  };
}

test('KVV Zelzate Fix #1: Single source of truth prevents -£802K vs -£749K mismatch and separates projected vs banked savings', () => {
  // Club finances says -749,000 while save meta says -802,000 -> canonical balance resolves ONCE to -749,000
  const canonicalBal = resolveCanonicalBalanceNum({
    financesBalance: -749_000,
    metaBalance: -802_000,
    monthlyFinances: [{ month: '2027-09', balance: -749_000, wageSpend: 10257, netCashflow: -45000 }],
  });
  assert.equal(canonicalBal, -749_000);
  assert.equal(formatClubMoney(canonicalBal), '-£749K');

  const resolved = resolveCanonicalClubFinances({
    financesBalance: -749_000,
    metaBalance: -802_000,
    wagePayrollWeekly: 10257,
    wageBudgetWeekly: 10203,
  });
  assert.equal(resolved.balanceLabel, '-£749K');
  assert.equal(resolved.wageHeadroomWeekly, -54);
  assert.equal(resolved.wageComplianceSeverity, 'minor_over');
  assert.equal(resolved.isMateriallyOverWageBudget, false);

  const audit = buildSquadTransferAudit(
    [
      makePlayer({ id: 'sr-1', name: 'Senior CM', wagePw: 550, age: 29, ability: 2.5, status: 'Surplus' }),
      makePlayer({ id: 'sr-2', name: 'Starter CM', wagePw: 300, age: 24, ability: 4.0 }),
    ],
    '15/09/2027',
    {
      balanceNum: canonicalBal,
      balanceLabel: '-£802K', // Even if stale label passed, canonical balanceNum wins
      wagePayrollWeekly: 10257,
      wageBudgetWeekly: 10203,
      monthlyBurnRate: 45_000,
    }
  );

  assert.equal(audit.clubProfile.balanceLabel, '-£749K');
  assert.match(audit.clubProfile.strategyHeadline, /-£749K/);
  assert.ok(
    audit.clubProfile.strategyBullets.some((b) => b.includes('-£749K')),
    'Strategy bullet must use canonical -£749K'
  );
  assert.equal(
    audit.clubProfile.strategyBullets.some((b) => b.includes('-£802K')),
    false,
    'Strategy bullet must never show conflicting -£802K'
  );
  // Projected vs actual banked savings are explicitly separated
  assert.equal(audit.projectedWeeklySavings, 550);
  assert.equal(audit.actualBankedWeeklySavings, 0);
});

test('KVV Zelzate Fix #2 & #3: Primary-position headcount avoids multi-position double-counting, splits Senior/Youth/Loan, protects U21 assets, and applies wage materiality threshold', () => {
  const versatile = makePlayer({
    id: 'vers-1',
    name: 'Versatile Utility',
    position: 'D (C), DM, M (C)',
    positionRatings: { DC: 20, DM: 18, MC: 17 },
    age: 26,
    ability: 3.5,
    teamSlot: 0,
  });
  const lowCaHighPotYouth = makePlayer({
    id: 'youth-1',
    uid: 2002,
    name: 'Teen Wonderkid',
    position: 'D (C)',
    positionRatings: { DC: 20 },
    age: 18,
    ability: 2.0,
    potential: 4.5,
    minutes: 0,
    wagePw: 65,
    expires: '30/06/2030',
    status: 'Youth',
    teamSlot: 1,
  });
  const loanedPlayer = makePlayer({
    id: 'loan-1',
    uid: 2003,
    name: 'Loaned Striker',
    position: 'ST (C)',
    positionRatings: { ST: 20 },
    age: 20,
    ability: 2.5,
    potential: 4.0,
    wagePw: 120,
    onLoan: true,
  });

  assert.equal(classifySquadTier(versatile), 'senior');
  assert.equal(classifySquadTier(lowCaHighPotYouth), 'youth_reserve');
  assert.equal(classifySquadTier(loanedPlayer), 'on_loan');
  assert.equal(resolvePrimaryPositionBucket(versatile), 'CB');

  const audit = buildSquadTransferAudit(
    [versatile, lowCaHighPotYouth, loanedPlayer],
    '15/09/2027',
    {
      balanceNum: -749_000,
      wagePayrollWeekly: 10257,
      wageBudgetWeekly: 10203, // -£54/wk = 0.5% minor variance
    }
  );

  // Versatile DC/DM/MC is counted ONCE as senior primary at CB, and marked Versatility/Cover at DM & CM
  const cb = audit.positionalNeeds.find((b) => b.code === 'CB')!;
  const dm = audit.positionalNeeds.find((b) => b.code === 'DM')!;
  const cm = audit.positionalNeeds.find((b) => b.code === 'CM')!;
  const st = audit.positionalNeeds.find((b) => b.code === 'ST')!;

  assert.equal(cb.currentCount, 1);
  assert.equal(cb.seniorPrimaryPlayers.length, 1);
  assert.equal(cb.youthReservePlayers.length, 1);
  assert.equal(dm.currentCount, 0);
  assert.equal(dm.secondaryCoverPlayers.some((p) => p.id === 'vers-1'), true);
  assert.equal(cm.currentCount, 0);
  assert.equal(cm.secondaryCoverPlayers.some((p) => p.id === 'vers-1'), true);
  assert.equal(st.currentCount, 0);
  assert.equal(st.onLoanPlayers.some((p) => p.id === 'loan-1'), true);

  // Actionable needs are surfaced accurately (never falsely Needs (0))
  assert.ok(audit.actionableNeedsCount > 0);

  // Low-CA high-potential U21 prospect is PROTECTED, never told to sell/loan as surplus depth
  const youthAdvice = audit.playerAdvice.find((a) => a.player.id === 'youth-1')!;
  assert.equal(youthAdvice.verdict, 'Protect Youth Asset');
  assert.doesNotMatch(youthAdvice.headline, /surplus/i);

  // Loaned player is NOT told to be loaned out again
  const loanAdvice = audit.playerAdvice.find((a) => a.player.id === 'loan-1')!;
  assert.notEqual(loanAdvice.verdict, 'Loan Out');

  // Minor -£54/wk variance is NOT treated as a material wage-budget breach
  assert.equal(audit.clubProfile.wageComplianceSeverity, 'minor_over');
  assert.equal(audit.clubProfile.isMateriallyOverWageBudget, false);
  assert.ok(
    audit.clubProfile.strategyBullets.some((b) => /minor.*variance/i.test(b)),
    `Expected calm minor variance note, got: ${audit.clubProfile.strategyBullets.join(' | ')}`
  );

  // Genuine large overrun (>3%) IS flagged as material
  const material = classifyWageCompliance(11_500, 10_000);
  assert.equal(material.severity, 'over');
  assert.equal(material.isMateriallyOverWageBudget, true);
});

test('KVV Zelzate Fix #4: Progression diff humanizes attribute names, filters GK stats on outfielders, and ranks meaningful shifts first', () => {
  assert.equal(formatAttributeLabel('jumpingReach'), 'Jumping Reach');
  assert.equal(formatAttributeLabel('aerialReach'), 'Aerial Reach');
  assert.equal(formatAttributeLabel('offTheBall'), 'Off the Ball');
  assert.equal(formatAttributeLabel('oneOnOnes'), 'One on Ones');

  assert.equal(isAttributeRelevantForPosition('aerialReach', 'ST (C)'), false);
  assert.equal(isAttributeRelevantForPosition('reflexes', 'D (C)'), false);
  assert.equal(isAttributeRelevantForPosition('aerialReach', 'GK'), true);
  assert.equal(isAttributeRelevantForPosition('finishing', 'GK'), false);
  assert.equal(isAttributeRelevantForPosition('jumpingReach', 'D (C)'), true);

  const base = buildProgressionSnapshot('2027-07-01', 'KVV Zelzate', [
    makePlayer({
      uid: 501,
      name: 'Outfield Striker',
      position: 'ST (C)',
      age: 19,
      attributes: {
        pace: 13,
        acceleration: 13,
        stamina: 12,
        jumpingReach: 11,
        determination: 12,
        passing: 11,
        finishing: 11,
        tackling: 6,
        firstTouch: 12,
        decisions: 11,
        workRate: 12,
        offTheBall: 12,
        aerialReach: 2,
        oneOnOnes: 3,
        longThrows: 5,
      },
    }),
    makePlayer({
      uid: 502,
      name: 'Minor Fringe Guy',
      position: 'M (C)',
      age: 26,
      attributes: {
        pace: 12,
        acceleration: 12,
        stamina: 12,
        jumpingReach: 10,
        determination: 12,
        passing: 12,
        finishing: 10,
        tackling: 11,
        firstTouch: 12,
        decisions: 12,
        workRate: 12,
        offTheBall: 11,
        longThrows: 6,
      },
    }),
  ]);

  const latest = buildProgressionSnapshot('2027-09-15', 'KVV Zelzate', [
    makePlayer({
      uid: 501,
      name: 'Outfield Striker',
      position: 'ST (C)',
      age: 19,
      attributes: {
        pace: 15, // +2 major
        acceleration: 13,
        stamina: 12,
        jumpingReach: 13, // +2 major
        determination: 14, // +2 mentoring jump
        passing: 11,
        finishing: 12, // +1 key role stat
        tackling: 6,
        firstTouch: 12,
        decisions: 11,
        workRate: 12,
        offTheBall: 12,
        aerialReach: 5, // GK-only -> MUST be filtered out on striker
        oneOnOnes: 6, // GK-only -> MUST be filtered out on striker
        longThrows: 6, // +1 minor
      },
    }),
    makePlayer({
      uid: 502,
      name: 'Minor Fringe Guy',
      position: 'M (C)',
      age: 26,
      attributes: {
        pace: 12,
        acceleration: 12,
        stamina: 12,
        jumpingReach: 10,
        determination: 12,
        passing: 12,
        finishing: 10,
        tackling: 11,
        firstTouch: 12,
        decisions: 12,
        workRate: 12,
        offTheBall: 11,
        longThrows: 7, // only a minor +1
      },
    }),
  ]);

  const diff = computeProgressionDiff(base, latest);
  assert.equal(diff.filteredIrrelevantCount, 2);
  assert.equal(diff.risers.some((r) => r.attributeName === 'aerialReach'), false);
  assert.equal(diff.risers.some((r) => r.attributeName === 'oneOnOnes'), false);

  // Player-grouped summaries rank major-impact striker first
  assert.equal(diff.playerSummaries[0].playerName, 'Outfield Striker');
  assert.equal(diff.playerSummaries[0].majorCount, 3);
  assert.ok(
    diff.playerSummaries[0].meaningfulDeltas.some(
      (d) => d.attributeLabel === 'Jumping Reach' && d.impactTier === 'major'
    )
  );
  assert.equal(diff.playerSummaries[1].meaningfulDeltas.length, 0);
  assert.equal(diff.playerSummaries[1].minorDeltas.length, 1);
});

test('KVV Zelzate Fix #5 & Gemini 404 retry: MatchLogArchive explicitly labels scopes & unbeaten spacing, and GeminiService clears cache on 404 fallback', async () => {
  const matchLogSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/MatchLogArchive.tsx'),
    'utf8'
  );
  const scopeHelperSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/utils/matchScopeHelpers.ts'),
    'utf8'
  );
  assert.match(matchLogSrc, /League Table Only:/);
  assert.match(matchLogSrc, /formatCompetitionFilterLabel/);
  assert.match(scopeHelperSrc, /League Only/);
  assert.match(scopeHelperSrc, /Cup Only/);
  assert.match(scopeHelperSrc, /Friendlies Only/);
  assert.match(scopeHelperSrc, /Competitive \(League \+ Cup\)/);
  assert.match(matchLogSrc, /\$\{s\.longestUnbeatenRun\} unbeaten/);
  assert.doesNotMatch(matchLogSrc, /\}unbeaten/);

  // Verify GeminiService clears discovery cache on 404 NOT_FOUND and retries once with gemini-3.5-flash-lite
  const calledModels: string[] = [];
  let listCallCount = 0;
  const service = new GeminiService({
    config: loadServerConfig({
      GEMINI_API_KEY: 'test-key-not-real',
      GEMINI_MODEL: 'gemini-3.6-flash',
    }),
    clientFactory: () => ({
      models: {
        list: async () => {
          listCallCount += 1;
          return { models: [{ name: 'models/gemini-3.6-flash' }, { name: 'models/gemini-3.5-flash-lite' }] };
        },
        generateContent: async (req) => {
          calledModels.push(req.model);
          if (req.model === 'gemini-3.6-flash') {
            const err = new Error('models/gemini-3.6-flash NOT_FOUND') as Error & { status?: number };
            err.status = 404;
            throw err;
          }
          return { text: '{"ok":true}' } as never;
        },
      },
    }),
  });

  // Seed discovery cache first, then confirm 404 fallback invalidates it
  await service.discoverModels();
  assert.equal(listCallCount, 1);

  const result = await service.generateContent(
    { contents: 'test' },
    { reasoningMode: 'deep_high' }
  );
  assert.equal((result as { text?: string }).text, '{"ok":true}');
  assert.deepEqual(calledModels, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  assert.equal(listCallCount, 1);

  // Discovery cache was invalidated on 404, so next discoverModels re-fetches
  await service.discoverModels();
  assert.equal(listCallCount, 2);
});

test('Irregularity fixes: pre-season 0 GP never blames Fast Sync, no fake shirt numbers, youth preserved on re-sync, and Full Sync falls back to match stats when matches played', () => {
  const zeroPlayer = makePlayer({ id: 'p-1', apps: '0', minutes: 0, goals: 0, assists: 0 });

  // Pre-season Full Sync save (0 matches played) -> preseason_no_matches (NOT fast_sync_missing)
  assert.equal(
    evaluateSeasonProduction(zeroPlayer, [zeroPlayer], {
      isFastSync: false,
      playedMatchesCount: 0,
    }).mode,
    'preseason_no_matches'
  );

  // Mid-season Full Sync save where season_stats unavailable -> stats_unavailable (NOT fast_sync_missing)
  assert.equal(
    evaluateSeasonProduction(zeroPlayer, [zeroPlayer], {
      isFastSync: false,
      playedMatchesCount: 6,
    }).mode,
    'stats_unavailable'
  );

  // True Fast Sync save -> fast_sync_missing
  assert.equal(
    evaluateSeasonProduction(zeroPlayer, [zeroPlayer], {
      isFastSync: true,
      playedMatchesCount: 6,
    }).mode,
    'fast_sync_missing'
  );

  // Hydration should NOT fabricate fake sequential shirt numbers (#10, #16) and SHOULD keep new youth on 2nd save sync
  const basePayload: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'zelzate_save1.fm',
      clubUid: 9901,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      gameDateIso: '2027-07-15',
      gameDateDmy: '15/07/2027',
      balance: -802000,
      fmsaveVersion: '0.14.3',
      fastSync: false,
    },
    players: [
      {
        uid: 1001,
        name: 'Brendan Schoonbaert',
        position: 'DC',
        age: 26,
        condition: 98,
        sharpness: 85,
        wagePw: 420,
        expires: '30/06/2028',
        onLoan: false,
        teamSlot: 0,
        apps: '0',
        minutes: 0,
        rating: null,
        goals: 0,
        xG: 0,
        xGPer90: 0,
        assists: 0,
        xA: 0,
        xAPer90: 0,
        drbPer90: 0,
        prPassesPer90: 0,
        hdrPct: 0,
        intPer90: 0,
        tckPct: 0,
        distanceKm: 0,
        yellowCards: 0,
        redCards: 0,
        suspensionsCount: 0,
        attributes: null,
      },
      {
        uid: 1002,
        name: 'New Youth Prospect',
        position: 'AMC',
        age: 17,
        condition: 95,
        sharpness: 75,
        wagePw: 90,
        expires: '30/06/2029',
        onLoan: false,
        teamSlot: 2,
        apps: '0',
        minutes: 0,
        rating: null,
        goals: 0,
        xG: 0,
        xGPer90: 0,
        assists: 0,
        xA: 0,
        xAPer90: 0,
        drbPer90: 0,
        prPassesPer90: 0,
        hdrPct: 0,
        intPer90: 0,
        tckPct: 0,
        distanceKm: 0,
        yellowCards: 0,
        redCards: 0,
        suspensionsCount: 0,
        attributes: null,
      },
    ],
    staff: [],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    activeInjuries: [],
    tactics: [],
    mentoring: [],
    sponsorships: [],
    warnings: [],
  };

  const firstHydrated = hydrateAppFromDecodedFmSave(basePayload, [], []);
  assert.equal(firstHydrated.updatedSquad.length, 2);
  // Neither player gets a fabricated sequential kit number
  assert.equal(getRealShirtNumber(firstHydrated.updatedSquad[0]), null);
  assert.equal(getRealShirtNumber(firstHydrated.updatedSquad[1]), null);

  // Syncing a 2nd save on top of an existing squad retains newly signed/added youth players (teamSlot: 2, minutes: 0)
  const existingSeniorOnly = [firstHydrated.updatedSquad[0]];
  const secondHydrated = hydrateAppFromDecodedFmSave(basePayload, existingSeniorOnly, []);
  assert.equal(secondHydrated.updatedSquad.length, 2);
  assert.ok(secondHydrated.updatedSquad.some((p) => p.name === 'New Youth Prospect'));

  // On a Full Sync save WITH played matches where season_stats is empty, fallback uses playerMatchStats
  const midSeasonPayload: DecodedFmSavePayload = {
    ...basePayload,
    playedMatches: [
      {
        dateIso: '2027-09-01',
        dateDmy: '01/09/2027',
        competition: 'Eerste Nationale VV',
        venue: 'H',
        opponent: 'KVK Ninove',
        score: '2-1',
        result: 'W',
        xGFor: 1.8,
        xGAgainst: 0.7,
        possession: 54,
        passCompletion: 81,
        shotsFor: '14 (6)',
        shotsAgainst: '7 (2)',
        cccFor: 2,
        cccAgainst: 0,
        distanceKm: 112.4,
      },
    ],
    playerMatchStats: {
      '1001': [
        { date: '2027-09-01', rating: 7.4, goals: 1, assists: 0, opponent: 'KVK Ninove', minutes: 90 },
      ],
    },
  };
  const midHydrated = hydrateAppFromDecodedFmSave(midSeasonPayload, [], []);
  const cb = midHydrated.updatedSquad.find((p) => p.uid === 1001)!;
  assert.equal(cb.minutes, 90);
  assert.equal(cb.goals, 1);
  assert.equal(cb.rating, 7.4);
  assert.equal(cb.statsSource, 'From Recent Matches');
});

test('Journey Report reconciles Club Wage Payroll vs Player Basic Wages and prevents fake Cup+League points', () => {
  const prevPlayers = [
    makePlayer({ id: 'p1', uid: 1, name: 'Player A', wagePw: 5000 }),
    makePlayer({ id: 'p2', uid: 2, name: 'Player B', wagePw: 3090 }),
  ];
  const currPlayers = [
    makePlayer({ id: 'p1', uid: 1, name: 'Player A', wagePw: 5000 }),
    makePlayer({ id: 'p2', uid: 2, name: 'Player B', wagePw: 2987 }),
  ];
  const makeMatch = (overrides: Partial<MatchLogEntry>): MatchLogEntry => ({
    id: 'm1',
    eventNumber: 1,
    date: '22/08/2027',
    competition: 'Eerste Nationale VV',
    opponent: 'Club',
    venue: 'H',
    score: '1-0',
    result: 'W',
    xGFor: 1.0,
    xGAgainst: 0.8,
    possession: 50,
    passCompletion: 80,
    shotsFor: '10',
    shotsAgainst: '6',
    cccFor: 1,
    cccAgainst: 0,
    goalTimeline: '',
    potm: '',
    tacticalAudit: '',
    defensiveWatchpoints: '',
    source: 'FM_SAVE',
    ...overrides,
  });
  const liveMatches: MatchLogEntry[] = [
    makeMatch({ id: 'l1', eventNumber: 1, date: '22/08/2027', opponent: 'Club 1', venue: 'H', score: '2-0', result: 'W', xGFor: 1.5, xGAgainst: 0.8 }),
    makeMatch({ id: 'l2', eventNumber: 2, date: '29/08/2027', opponent: 'Club 2', venue: 'A', score: '2-1', result: 'W', xGFor: 1.2, xGAgainst: 1.1 }),
    makeMatch({ id: 'l3', eventNumber: 3, date: '05/09/2027', opponent: 'Club 3', venue: 'H', score: '1-2', result: 'L', xGFor: 0.9, xGAgainst: 1.2 }),
    makeMatch({ id: 'l4', eventNumber: 4, date: '12/09/2027', opponent: 'Club 4', venue: 'A', score: '0-1', result: 'L', xGFor: 0.68, xGAgainst: 0.94 }),
    makeMatch({ id: 'c1', eventNumber: 5, date: '16/08/2027', competition: 'Croky Cup', opponent: 'Cup 1', venue: 'H', score: '1-1', result: 'D', xGFor: 2.1, xGAgainst: 1.7 }),
    makeMatch({ id: 'c2', eventNumber: 6, date: '08/09/2027', competition: 'Croky Cup', opponent: 'Cup 2', venue: 'A', score: '1-1', result: 'D', xGFor: 2.14, xGAgainst: 1.92 }),
  ];

  // Previous legacy snapshot lacks wagePayrollWeekly; current snapshot has both club payroll & budget
  const prevSnap = createSaveHistoryPoint({
    saveName: 'auto save.fm',
    inGameDate: '11/08/2027',
    clubName: 'KVV Zelzate',
    players: prevPlayers,
    balance: '-£631K',
    balanceNum: -631_000,
    wageBudgetWeekly: 10203,
  });
  const currSnap = createSaveHistoryPoint({
    saveName: 'auto save.fm',
    inGameDate: '15/09/2027',
    clubName: 'KVV Zelzate',
    players: currPlayers,
    matches: liveMatches,
    balance: '-£749K',
    balanceNum: -749_000,
    wagePayrollWeekly: 10257,
    wageBudgetWeekly: 10203,
    leaguePosition: 6,
    played: 4,
    won: 2,
    drawn: 0,
    lost: 2,
    points: 6,
    goalsFor: 5,
    goalsAgainst: 4,
  });

  const report = buildDeepJourneyReport(prevSnap, currSnap, [prevSnap, currSnap], liveMatches);

  // 1. Club payroll is preserved alongside basic player wages without fabricating a fake delta vs legacy snapshot
  assert.equal(report.baseDiff.kpiDeltas.fromTotalWagePw, 8090);
  assert.equal(report.baseDiff.kpiDeltas.toTotalWagePw, 7987);
  assert.equal(report.baseDiff.kpiDeltas.totalWageDeltaPw, -103);
  assert.equal(report.baseDiff.kpiDeltas.fromClubWagePayrollWeekly, null);
  assert.equal(report.baseDiff.kpiDeltas.toClubWagePayrollWeekly, 10257);
  assert.equal(report.baseDiff.kpiDeltas.clubWagePayrollDeltaPw, null);
  assert.equal(report.baseDiff.kpiDeltas.toWageBudgetWeekly, 10203);

  const ai = report.aiPayload as Record<string, any>;
  assert.equal(ai.wageBreakdown.clubPayrollWeeklyTo, 10257);
  assert.equal(ai.wageBreakdown.clubWageBudgetWeeklyTo, 10203);
  assert.equal(ai.wageBreakdown.playerBasicWagesWeeklyTo, 7987);
  assert.equal(ai.wageBreakdown.playerBasicWagesDeltaPw, -103);

  // 2. League table points are strictly 6 pts from 4 league GP, and Cup/Competitive buckets have NO fake points field
  assert.equal(ai.leagueTableSnapshot.current.played, 4);
  assert.equal(ai.leagueTableSnapshot.current.points, 6);
  assert.equal(ai.leagueTableSnapshot.current.position, 6);
  assert.equal(ai.competitionBreakdown.currentSave.league.points, 6);
  assert.equal('points' in ai.competitionBreakdown.currentSave.cup, false);
  assert.equal('points' in ai.competitionBreakdown.currentSave.friendly, false);
  assert.equal('points' in ai.competitionBreakdown.currentCompetitiveOnly, false);
  assert.equal(ai.competitionBreakdown.currentCompetitiveOnly.played, 6);

  // 3. Cache prefix bumped so stale buggy narratives refresh cleanly, and prompt enforces both rules
  assert.equal(JOURNEY_BRIEFING_CACHE_PREFIX, 'journey_brief_v2::');
  const prompt = buildJourneyReportSystemPrompt('KVV Zelzate');
  assert.match(prompt, /Cup knockout ties award ZERO league points/i);
  assert.match(prompt, /FM Club Wage Payroll vs Cap/i);
});


