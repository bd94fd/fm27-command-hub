import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import {
  buildSaveDataQualityReport,
  formatSaveDataQualityForAnalyst,
} from './saveDataQuality';

function basePayload(): Record<string, unknown> {
  return {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'kvv',
      gameDateIso: '2026-11-01',
      gameDateDmy: '01/11/2026',
      clubUid: 1,
      clubName: 'KVV Zelzate',
      managerName: 'Manager',
      balance: 1000,
      fmsaveVersion: '1.0',
      fileName: 'kvv.fm',
    },
    players: [
      {
        uid: 1,
        name: 'Player One',
        position: 'ST',
        wagePw: 1000,
        age: 25,
        expires: '30/06/2028',
        attributes: { finishing: 12 },
        marketValue: 500000,
      },
      {
        uid: 2,
        name: 'Player Two',
        position: 'CB',
        wagePw: null,
        age: null,
        expires: null,
        attributes: null,
        marketValue: 0,
      },
    ],
    staff: [
      {
        uid: 11,
        name: 'Staff One',
        role: null,
        wagePw: null,
        expires: null,
        jobRatings: null,
        secondaryJob: null,
      },
    ],
    playedMatches: [
      {
        dateIso: '2026-10-01',
        dateDmy: '01/10/2026',
        opponent: 'Opponent',
        xGFor: null,
        xGAgainst: null,
      },
    ],
    upcomingFixtures: [],
    tactics: [],
    monthlyFinances: [],
    sponsorships: [],
    recruitmentTargets: [
      {
        uid: 21,
        name: 'Target One',
        currentWagePw: null,
        demandedWageEur: null,
        transferValue: null,
      },
    ],
    activeInjuries: [],
    mentoring: [],
    warnings: ['Decoder note one'],
    extractionWarnings: ['Decoder note one', 'Decoder note two'],
  };
}

test('reports missing wages, ages, contracts, staff roles and sections', () => {
  const report = buildSaveDataQualityReport(
    basePayload() as unknown as DecodedFmSavePayload
  );

  const squad = report.sections.find((section) => section.id === 'squad');
  const staff = report.sections.find((section) => section.id === 'staff');
  const matches = report.sections.find((section) => section.id === 'matches');

  assert.equal(squad?.gaps.find((gap) => gap.key === 'player-wages')?.missing, 1);
  assert.equal(squad?.gaps.find((gap) => gap.key === 'player-ages')?.missing, 1);
  assert.equal(squad?.gaps.find((gap) => gap.key === 'player-contracts')?.missing, 1);
  assert.equal(staff?.gaps.find((gap) => gap.key === 'staff-roles')?.missing, 1);
  assert.equal(matches?.gaps.find((gap) => gap.key === 'match-xg')?.missing, 1);
  assert.ok(report.scorePct < 100);
  assert.ok(report.checks.missing > 0);
  assert.ok(report.coverage.total > 0);

  for (const section of [
    'League table',
    'Club finances',
    'Monthly finances',
    'Tactics',
    'Sponsorships',
    'Upcoming fixtures',
  ]) {
    assert.ok(report.missingSections.includes(section), `missing ${section}`);
  }

  assert.deepEqual(report.warnings, ['Decoder note one', 'Decoder note two']);
});

test('formats the shared report for the Analyst without leaking player names', () => {
  const report = buildSaveDataQualityReport(
    basePayload() as unknown as DecodedFmSavePayload
  );
  const block = formatSaveDataQualityForAnalyst(report);

  assert.match(block, /=== SAVE DATA QUALITY/);
  assert.match(block, /Player wages 1\/2 missing/);
  assert.match(block, /Staff roles 1\/1 missing/);
  assert.match(block, /Missing sections: League table/);
  assert.match(block, /Never invent a missing value/);
  assert.doesNotMatch(block, /Player Two|Staff One|Target One/);
});

test('a complete payload scores 100 and has no blocking gaps', () => {
  const payload = basePayload();
  payload.players = [
    {
      uid: 1,
      name: 'Player One',
      position: 'ST',
      wagePw: 1000,
      age: 25,
      expires: '30/06/2028',
      attributes: { finishing: 12 },
      marketValue: 500000,
    },
  ];
  payload.staff = [
    {
      uid: 11,
      name: 'Staff One',
      role: 'Coach',
      wagePw: 500,
      expires: '30/06/2028',
      jobRatings: { fitness_coach: 10 },
      secondaryJob: 'Fitness Coach',
    },
  ];
  payload.playedMatches = [
    {
      dateIso: '2026-10-01',
      dateDmy: '01/10/2026',
      opponent: 'Opponent',
      xGFor: 1.2,
      xGAgainst: 0.8,
    },
  ];
  payload.upcomingFixtures = [
    { dateIso: '2026-11-05', dateDmy: '05/11/2026', opponent: 'Next', venue: 'H' },
  ];
  payload.tactics = [{ index: 0, name: '4-3-3', styleName: 'Counter', mentality: 'Positive' }];
  payload.monthlyFinances = [
    { month: 'October', balance: 1000, wageSpend: 500, netCashflow: 10 },
  ];
  payload.sponsorships = [
    { name: 'Sponsor', type: 'Main', annualValue: 1000, expires: '30/06/2027' },
  ];
  payload.recruitmentTargets = [
    {
      uid: 21,
      name: 'Target One',
      currentWagePw: 900,
      demandedWageEur: 900,
      transferValue: 100000,
    },
  ];
  payload.finances = {
    month: 'October',
    balance: 1000,
    wagePayrollWeekly: 1000,
    wageBudgetWeekly: 1200,
    transferBudgetRemaining: 5000,
  };
  payload.leagueStanding = {
    competitionName: 'League',
    position: 1,
    totalTeams: 16,
    played: 10,
    won: 7,
    drawn: 2,
    lost: 1,
    goalsFor: 20,
    goalsAgainst: 8,
    goalDiff: 12,
    points: 23,
    nextOpponentStanding: null,
    top5: [],
  };

  const report = buildSaveDataQualityReport(
    payload as unknown as DecodedFmSavePayload
  );
  assert.equal(report.scorePct, 100);
  assert.equal(report.checks.missing, 0);
  assert.deepEqual(report.missingSections, []);
  const blocking = report.sections
    .flatMap((section) => section.gaps)
    .filter((gap) => gap.missing > 0 && gap.severity !== 'info');
  assert.deepEqual(blocking, []);
});

test('the Hub exposes the shared report in a Data Quality surface', () => {
  const hub = readFileSync(
    new URL('../components/AutoSyncWorkspace.tsx', import.meta.url),
    'utf8'
  );
  const panel = readFileSync(
    new URL('../components/DataQualityPanel.tsx', import.meta.url),
    'utf8'
  );
  assert.match(hub, /mobileHubView === 'data'/);
  assert.match(hub, /<DataQualityPanel report=\{dataQualityReport\} \/>/);
  assert.match(panel, /Save Data Quality/);
  assert.match(panel, /focus-visible:ring-2/);
});
