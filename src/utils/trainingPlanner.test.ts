import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyPlannerFromDynamicSchedule,
  parseFm27TrainerSchedule,
  summarizeWeeklyTrainingLoad,
} from './trainingPlanner';
import {
  buildCoachingCategoryMatrix,
  classifyStaffDepartment,
  isStaffContractExpiringSoon,
} from './staffRatings';
import {
  createSaveHistoryPoint,
  diffSaveHistoryPoints,
} from '../services/saveCache';
import { PlayerRecord, StaffRecord } from '../types/fm27';

describe('trainingPlanner', () => {
  it('parses SemHiel2003/fm27-trainer JSON schedule into 7 Mon-Sun days', () => {
    const json = JSON.stringify({
      name: 'Playbook High-Tempo Week',
      days: [
        { day: 'Monday', sessions: ['Quickness', 'Match Tactics', 'Team Bonding'] },
        { day: 'Tuesday', sessions: ['Attacking Movement', 'Defending Engaged', 'Set Pieces'] },
        { day: 'Wednesday', sessions: ['Match Preview', 'Ball Retention', 'Rest'] },
        { day: 'Saturday', sessions: ['Matchday', 'Rest', 'Rest'] },
        { day: 'Sunday', sessions: ['Recovery', 'Match Review', 'Rest'] },
      ],
    });
    const parsed = parseFm27TrainerSchedule(json);
    assert.ok(parsed);
    assert.equal(parsed.sourceLabel, 'Playbook High-Tempo Week');
    assert.equal(parsed.days.length, 7);
    assert.equal(parsed.days[0].dayShort, 'Mon');
    assert.equal(parsed.days[0].slots[0].category, 'physical');
    assert.equal(parsed.days[5].slots[0].category, 'match');
    assert.equal(parsed.days[6].slots[0].category, 'recovery');
  });

  it('parses CSV schedule and computes fatigue summary', () => {
    const csv = [
      'Day,Slot 1,Slot 2,Slot 3',
      'Mon,Match Tactics,Attacking Movement,Rest',
      'Tue,Quickness,Defending Engaged,Set Pieces',
      'Sun,Recovery,Match Review,Rest',
    ].join('\n');
    const parsed = parseFm27TrainerSchedule(csv);
    assert.ok(parsed);
    const summary = summarizeWeeklyTrainingLoad(parsed.days);
    assert.ok(summary.fatigueIndex >= 0 && summary.fatigueIndex <= 100);
    assert.ok(summary.restCount >= 2);
  });

  it('builds 7-day planner from dynamic schedule rows including UK DD/MM/YYYY date range alignment', () => {
    const days = buildWeeklyPlannerFromDynamicSchedule([]);
    assert.equal(days.length, 7);
    assert.equal(days[0].dayShort, 'Mon');
    assert.equal(days[6].dayShort, 'Sun');

    const ukAligned = buildWeeklyPlannerFromDynamicSchedule([
      {
        week: 'W1',
        date: '16/02/2027', // Tuesday
        fixtureContext: 'Training Day',
        slot1: 'Quickness',
        slot2: 'Ball Retention',
        slot3: 'Rest',
        directive: 'Speed work',
      },
      {
        week: 'W1',
        date: '15/02/2027', // Monday
        fixtureContext: 'Training Day',
        slot1: 'Match Tactics',
        slot2: 'Attacking Movement',
        slot3: 'Team Bonding',
        directive: 'Tactical prep',
      },
    ]);
    assert.equal(ukAligned[0].dayShort, 'Mon');
    assert.equal(ukAligned[0].dateLabel, '15/02/2027');
    assert.ok(ukAligned[0].slots.some((s) => s.label === 'Match Tactics'));
    assert.equal(ukAligned[1].dayShort, 'Tue');
    assert.equal(ukAligned[1].dateLabel, '16/02/2027');
    assert.ok(ukAligned[1].slots.some((s) => s.label === 'Quickness'));
  });

  it('parses real SemHiel2003/fm27-trainer v0.2.8 weeks[] JSON and 8-column EN/NL CSV formats', () => {
    const v028Json = JSON.stringify({
      effectiveness: { overall: 92 },
      weeks: [
        {
          start: '2027-02-15',
          schedule_name: 'High Tempo 1-Match Week',
          days: [
            { date: '2027-02-15', role: 'training', slots: ['Quickness', 'Match Tactics', 'Team Bonding'] },
            { date: '2027-02-20', role: 'match', slots: ['Matchday', 'Rest', 'Rest'] },
            { date: '2027-02-21', role: 'recovery', slots: ['Recovery', 'Match Review', 'Rest'] },
          ],
        },
      ],
    });
    const parsedJson = parseFm27TrainerSchedule(v028Json);
    assert.ok(parsedJson);
    assert.equal(parsedJson.sourceLabel, 'High Tempo 1-Match Week');
    assert.equal(parsedJson.days[0].slots[0].label, 'Quickness');
    assert.equal(parsedJson.days[5].slots[0].category, 'match');
    assert.equal(parsedJson.days[6].slots[0].category, 'recovery');

    const en8ColCsv = [
      'date,day,period,type,session1,session2,extra,schedule',
      '2027-02-15,Monday,In-Season,Training,Quickness,Match Tactics,Team Bonding,High Tempo 1-Match Week',
      '2027-02-20,Saturday,In-Season,Match,Matchday,Rest,Rest,High Tempo 1-Match Week',
    ].join('\n');
    const parsedEnCsv = parseFm27TrainerSchedule(en8ColCsv);
    assert.ok(parsedEnCsv);
    assert.equal(parsedEnCsv.sourceLabel, 'High Tempo 1-Match Week');
    assert.equal(parsedEnCsv.days[0].slots[0].label, 'Quickness');
    assert.equal(parsedEnCsv.days[5].slots[0].category, 'match');

    const nl8ColCsv = [
      'datum,dag,periode,type,sessie1,sessie2,extra,schema',
      '2027-02-15,maandag,Seizoen,Training,Snelheid,Wedstrijdtactiek,Teambinding,Hoog Tempo',
      '2027-02-21,zondag,Seizoen,Herstel,Herstel,Nabespreking,Rust,Hoog Tempo',
    ].join('\n');
    const parsedNlCsv = parseFm27TrainerSchedule(nl8ColCsv);
    assert.ok(parsedNlCsv);
    assert.equal(parsedNlCsv.sourceLabel, 'Hoog Tempo');
    assert.equal(parsedNlCsv.days[0].slots[0].label, 'Snelheid');
    assert.equal(parsedNlCsv.days[6].slots[0].label, 'Herstel');
  });
});

describe('staffRatings coaching matrix & expiring contracts', () => {
  const sampleStaff: StaffRecord[] = [
    {
      id: 'st-1',
      name: 'Coach Alpha',
      role: 'First Team Coach',
      age: 41,
      nation: 'BEL',
      club: 'KVV Zelzate',
      wagePw: 850,
      expires: '30 Jun 2027',
      attributes: {
        attacking: 16,
        defending: 12,
        fitness: 10,
        goalkeeping: 4,
        mental: 14,
        possession: 15,
        set_pieces: 13,
        tactical: 15,
        technical: 16,
        working_with_youngsters: 14,
        adaptability: 12,
        authority: 16,
        determination: 17,
        judging_player_ability: 12,
        judging_player_potential: 12,
        judging_staff_ability: 11,
        man_management: 14,
        motivating: 16,
        negotiating: 8,
        physiotherapy: 3,
        sports_science: 4,
        tactical_knowledge: 15,
        analysing_data: 10,
      },
    },
    {
      id: 'st-2',
      name: 'Physio Beta',
      role: 'Head Physio',
      age: 38,
      nation: 'BEL',
      club: 'KVV Zelzate',
      wagePw: 600,
      expires: '30 Jun 2029',
      attributes: {
        attacking: 2,
        defending: 2,
        fitness: 6,
        goalkeeping: 1,
        mental: 10,
        possession: 2,
        set_pieces: 2,
        tactical: 2,
        technical: 2,
        working_with_youngsters: 10,
        adaptability: 11,
        authority: 10,
        determination: 15,
        judging_player_ability: 5,
        judging_player_potential: 5,
        judging_staff_ability: 5,
        man_management: 14,
        motivating: 12,
        negotiating: 4,
        physiotherapy: 18,
        sports_science: 14,
        tactical_knowledge: 4,
        analysing_data: 6,
      },
    },
  ];

  it('classifies staff departments and builds 9-category coaching matrix', () => {
    assert.equal(classifyStaffDepartment(sampleStaff[0]), 'coaching');
    assert.equal(classifyStaffDepartment(sampleStaff[1]), 'medical');

    const matrix = buildCoachingCategoryMatrix(sampleStaff);
    assert.equal(matrix.length, 9);
    const attTech = matrix.find((r) => r.key === 'att_tech');
    assert.ok(attTech);
    assert.equal(attTech.leadCoachName, 'Coach Alpha');
    assert.ok(attTech.stars >= 4.0);
    assert.equal(attTech.workload, 'Heavy / Overloaded');
  });

  it('flags expiring contracts relative to saveDate', () => {
    assert.equal(isStaffContractExpiringSoon('30 Jun 2027', '15 Feb 2027'), true);
    assert.equal(isStaffContractExpiringSoon('30 Jun 2029', '15 Feb 2027'), false);
  });
});

describe('saveCache enriched snapshot diffing', () => {
  it('computes risers, departures, contract changes, and KPI deltas', () => {
    const basePlayer = (overrides: Partial<PlayerRecord>): PlayerRecord =>
      ({
        id: 'p1',
        uid: 101,
        name: 'Player One',
        position: 'CM',
        age: 21,
        ability: 110,
        potential: 135,
        marketValue: 500000,
        wagePw: 1200,
        expires: '30 Jun 2027',
        ...overrides,
      }) as PlayerRecord;

    const prev = createSaveHistoryPoint({
      saveName: 'zelzate.fm',
      inGameDate: '2026-09-01',
      clubName: 'KVV Zelzate',
      balance: '£250K',
      leaguePosition: 8,
      players: [
        basePlayer({ uid: 101, name: 'Player One', ability: 110, wagePw: 1200, expires: '30 Jun 2027' }),
        basePlayer({ uid: 102, name: 'Departing Vet', ability: 105, wagePw: 1500, expires: '30 Jun 2027' }),
      ],
    });

    const curr = createSaveHistoryPoint({
      saveName: 'zelzate.fm',
      inGameDate: '2027-02-01',
      clubName: 'KVV Zelzate',
      balance: '£400K',
      leaguePosition: 3,
      players: [
        basePlayer({ uid: 101, name: 'Player One', ability: 116, wagePw: 1600, expires: '30 Jun 2029' }),
        basePlayer({ uid: 103, name: 'Youth Newgen', age: 16, ability: 88, wagePw: 200, expires: '30 Jun 2029' }),
      ],
    });

    const diff = diffSaveHistoryPoints(prev, curr);
    assert.equal(diff.risers.length, 1);
    assert.equal(diff.risers[0].abilityDelta, 6);
    assert.equal(diff.departed.length, 1);
    assert.equal(diff.departed[0].name, 'Departing Vet');
    assert.equal(diff.newgens.length, 1);
    assert.equal(diff.newgens[0].name, 'Youth Newgen');
    assert.equal(diff.contractChanges.length, 1);
    assert.equal(diff.contractChanges[0].wageDeltaPw, 400);
    assert.equal(diff.kpiDeltas.toLeaguePosition, 3);
    assert.equal(diff.kpiDeltas.totalWageDeltaPw, -900);
  });
});
