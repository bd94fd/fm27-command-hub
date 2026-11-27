import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalystSaveContext,
  collectExtractionWarnings,
  resolveCompetitionRules,
} from './hydrateAnalystContext.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { ActiveSuspensionRecord, RecruitmentTarget } from '../types/fmSave';
import type { PlayerRecord } from '../types/fm27';

const decoded = {
  meta: {
    fmsaveVersion: '0.6.2',
    game: 'FM27',
    build: 1875,
    saveName: 'zelzate.fm',
    clubName: 'KVV Zelzate',
    managerName: 'Boss',
  },
  playedMatches: [
    {
      dateIso: '2027-02-08',
      dateDmy: '8 Feb 2027',
      competition: 'Jupiler Pro League',
      opponent: 'Club Brugge',
      venue: 'H',
      result: 'W',
      score: '2-1',
      xGFor: 1.84,
      xGAgainst: 1.12,
      possession: 52,
      shotsFor: 12,
      shotsAgainst: 9,
      cccFor: 3,
      cccAgainst: 2,
    },
  ],
  upcomingFixtures: [
    {
      dateIso: '2027-02-22',
      dateDmy: '22 Feb 2027',
      competition: 'Jupiler Pro League',
      opponent: 'Anderlecht',
      venue: 'A',
    },
  ],
  activeInjuries: [],
  mentoring: [],
  facilities: null,
  jobVacancies: [],
  sponsorships: [],
  competitionRules: null,
  leagueStanding: null,
  players: [],
  extractionWarnings: [],
  warnings: [],
  fastSync: false,
} as unknown as DecodedFmSavePayload;

const baseInput = () => ({
  decoded,
  saveDateLabel: '15 Feb 2027',
  nextFixtureLabel: '22 Feb 2027 vs Anderlecht (Away)',
  leagueStandingLabel: '4th (51 Pts)',
  wageComplianceLabel: null,
  balanceLabel: '£1,250,000',
  financialRunway: null,
  changedPlayers: [],
  removedPlayers: [] as PlayerRecord[],
  newlyAddedCount: 1,
  recruitmentTargets: [] as RecruitmentTarget[],
  suspensions: [] as ActiveSuspensionRecord[],
});

test('the prompt opens with the exact in-game date, club and balance', () => {
  const prompt = buildAnalystSaveContext(baseInput());
  assert.match(prompt, /^\[LIVE FULL \.FM SAVE DECODED VIA FMSAVE 0\.6\.2/);
  assert.match(prompt, /EXACT CURRENT IN-GAME DATE: 15 Feb 2027/);
  assert.match(prompt, /Managed Club: KVV Zelzate \(Manager: Boss\)/);
  assert.match(prompt, /Live Balance: £1,250,000/);
  assert.match(prompt, /Live League Standing \(undefined\)|Live League Standing/);
});

test('the recent match line keeps the xG and shot detail the analyst is allowed to quote', () => {
  const prompt = buildAnalystSaveContext(baseInput());
  assert.match(prompt, /8 Feb 2027 \[Jupiler Pro League\] vs Club Brugge \(H\): W 2-1/);
  assert.match(prompt, /xG 1\.84 - 1\.12 \| Poss 52% \| Shots 12 vs 9 \| CCC 3-2/);
});

test('a match with no xG from the reader is listed without xG instead of crashing the import', () => {
  const withoutXg = {
    ...decoded,
    playedMatches: [
      {
        dateIso: '2027-02-15',
        dateDmy: '15 Feb 2027',
        competition: 'Jupiler Pro League',
        opponent: 'Gent',
        venue: 'H',
        result: 'D',
        score: '1-1',
        xGFor: undefined,
      },
    ],
  } as unknown as DecodedFmSavePayload;
  const prompt = buildAnalystSaveContext({ ...baseInput(), decoded: withoutXg });
  assert.match(prompt, /15 Feb 2027 \[Jupiler Pro League\] vs Gent \(H\): D 1-1$/m);
  assert.ok(!prompt.includes('xG undefined'));
});

test('a ban in the next fixture competition is marked do-not-start', () => {
  const input = baseInput();
  input.suspensions = [
    {
      playerUid: 101,
      playerName: 'René Vanden Borre',
      competitionName: 'Jupiler Pro League',
      matchesRemaining: 2,
      scope: 'league',
      reason: 'Red card',
    } as ActiveSuspensionRecord,
  ];
  const prompt = buildAnalystSaveContext(input);
  assert.match(prompt, /René Vanden Borre: BANNED FOR NEXT MATCH/);
  assert.match(prompt, /DO NOT SELECT AS STARTER/);
});

test('a ban in another competition says the player is available', () => {
  const input = baseInput();
  input.suspensions = [
    {
      playerUid: 101,
      playerName: 'René Vanden Borre',
      competitionName: 'Belgian Cup',
      matchesRemaining: 1,
      scope: 'cup',
      reason: 'Two yellows',
    } as ActiveSuspensionRecord,
  ];
  const prompt = buildAnalystSaveContext(input);
  assert.match(prompt, /OTHER-COMPETITION BAN ONLY/);
  assert.match(prompt, /AVAILABLE FOR NEXT MATCH/);
});

test('empty sections state that nothing was found instead of going blank', () => {
  const prompt = buildAnalystSaveContext(baseInput());
  assert.match(prompt, /=== ACTIVE INJURIES ===\n- No active injuries reported in save\./);
  assert.match(prompt, /=== ACTIVE SUSPENSIONS \(DO NOT SELECT BANNED STARTERS\) ===\n- No active disciplinary suspensions\./);
  assert.match(prompt, /=== LIVE MENTORING GROUPS IN SAVE ===\n- No mentoring groups returned by reader\./);
  assert.match(prompt, /=== DIFFS AUTO-APPLIED TO SQUAD DATABASE[\s\S]*- Baseline synced directly from \.fm save\./);
});

test('the prompt tells the analyst not to repeat squad detail and not to cite raw CA/PA', () => {
  const prompt = buildAnalystSaveContext(baseInput());
  assert.match(prompt, /SEE THE CANONICAL SQUAD PROFILES BLOCK/);
  assert.match(prompt, /NEVER cite raw hidden CA\/PA/);
});

test('the mission closes with the date so the action plan starts from it', () => {
  const prompt = buildAnalystSaveContext(baseInput());
  assert.match(prompt, /COMPLETE ACTION PLAN FROM 15 Feb 2027 FORWARD/);
  assert.match(prompt, /inGameDate="15 Feb 2027"/);
  assert.match(prompt, /22 Feb 2027 vs Anderlecht \(Away\)/);
});

test('the shortlist summary names the player, club and wage', () => {
  const input = baseInput();
  input.recruitmentTargets = [
    {
      name: 'Target One',
      primaryPosition: 'ST',
      age: 22,
      nationality: 'Belgium',
      currentClub: 'Gent',
      expires: '30 Jun 2027',
      currentWagePw: 900,
      transferValue: 500000,
      transferValueState: 'exact',
    },
  ] as unknown as RecruitmentTarget[];
  const prompt = buildAnalystSaveContext(input);
  assert.match(prompt, /MANAGER'S IN-GAME FM27 SHORTLIST \(1 PLAYERS\)/);
  assert.match(prompt, /- Target One \(ST, Age 22, Belgium\): Gent \(Exp 30 Jun 2027\) · Val £500,000 · Wage ~£900\/wk/);
});

test('a capped transfer value is not quoted as a real number', () => {
  const input = baseInput();
  input.recruitmentTargets = [
    {
      name: 'Target Two',
      primaryPosition: 'CB',
      age: 24,
      nationality: 'Belgium',
      currentClub: 'Gent',
      expires: '30 Jun 2028',
      currentWagePw: 800,
      transferValue: 9000000,
      transferValueState: 'capped',
    },
  ] as unknown as RecruitmentTarget[];
  const prompt = buildAnalystSaveContext(input);
  assert.ok(!prompt.includes('9,000,000'));
});

test('competition rules become one readable line, and null rules produce none', () => {
  const withRules = {
    ...decoded,
    competitionRules: {
      competitionName: 'Jupiler Pro League',
      maxSquadSize: 25,
      minHomegrownClub: 4,
      matchdaySubsLimit: 5,
      u21Exempt: true,
    },
  } as unknown as DecodedFmSavePayload;
  const prompt = buildAnalystSaveContext({ ...baseInput(), decoded: withRules });
  assert.match(
    prompt,
    /Registration & Competition Rules \(Jupiler Pro League\): Max Squad 25 · Min HGC 4 · U21 Exempt: Yes · Subs Limit 5/
  );

  const rules = resolveCompetitionRules({
    competitionRules: null,
    leagueStanding: { competitionName: 'Jupiler Pro League' },
  } as unknown as DecodedFmSavePayload);
  assert.equal(rules, null);
});

test('rules fall back to the league name when the reader omits one', () => {
  const rules = resolveCompetitionRules({
    competitionRules: { maxSquadSize: 25 },
    leagueStanding: { competitionName: 'Jupiler Pro League' },
  } as unknown as DecodedFmSavePayload);
  assert.equal(rules?.competitionName, 'Jupiler Pro League');
  assert.equal(rules?.maxSquadSize, 25);
  assert.equal(rules?.minHomegrownClub, null);
});

test('reader warnings dedupe, and a reversed sponsorship date adds one note', () => {
  const warnings = collectExtractionWarnings({
    extractionWarnings: ['note one'],
    warnings: ['note one', 'note two'],
    sponsorships: [{ dates_reordered: true }],
  } as unknown as DecodedFmSavePayload);
  assert.equal(warnings.length, 3);
  assert.equal(warnings[0], 'note one');
  assert.equal(warnings[1], 'note two');
  assert.match(warnings[2], /reversed the stored dates of 1 ended FM27 contract/);
});

test('contract clauses travel in their own appendix', () => {
  const withClauses = {
    ...decoded,
    players: [
      {
        name: 'René Vanden Borre',
        contractDetails: {
          promisedPlayingTime: 'Star Player',
          optionalExtensionYears: 1,
          releaseClauses: [{ type: 'Relegation', amount: 250000 }],
        },
      },
    ],
  } as unknown as DecodedFmSavePayload;
  const prompt = buildAnalystSaveContext({ ...baseInput(), decoded: withClauses });
  assert.match(prompt, /=== CONTRACT CLAUSES IN SAVE \(1 PLAYERS\) ===/);
  assert.match(prompt, /- René Vanden Borre: PT: Star Player · Club Opt \+1y · Relegation £250K/);
});
