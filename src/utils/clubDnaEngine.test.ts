import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLUB_DNA_WEIGHTS,
  evaluatePlayerClubDna,
} from './clubDnaEngine.ts';
import { DivisionBenchmarks } from '../types/fmSave.ts';

test('evaluatePlayerClubDna classifies fast pressing winger as HIGH_PRESS_WINGER', () => {
  const res = evaluatePlayerClubDna('AMR', {
    pace: 16,
    acceleration: 16,
    stamina: 15,
    workRate: 15,
    dribbling: 14,
    offTheBall: 14,
    finishing: 10,
  });

  assert.equal(res.bestArchetypeId, 'HIGH_PRESS_WINGER');
  assert.ok(res.overallDnaScore >= 70);
  assert.equal(res.keyAttrChips.length, 3);
});

test('evaluatePlayerClubDna applies division benchmark calibration bonus when player exceeds division median', () => {
  const mockBenchmarks: DivisionBenchmarks = {
    competitionName: 'Belgian National Division 1',
    scope: 'Division',
    clubCount: 18,
    byPositionGroup: {
      GK: { sampleSize: 20, medianWeeklyWage: 400, medianAttributes: { pace: 9, stamina: 10, passing: 10, tackling: 5, decisions: 11 } },
      DEF: { sampleSize: 80, medianWeeklyWage: 450, medianAttributes: { pace: 11, stamina: 11, passing: 10, tackling: 12, decisions: 11 } },
      MID: { sampleSize: 90, medianWeeklyWage: 500, medianAttributes: { pace: 11, stamina: 11, passing: 11, tackling: 11, decisions: 11 } },
      FWD: { sampleSize: 50, medianWeeklyWage: 550, medianAttributes: { pace: 12, stamina: 11, passing: 10, tackling: 7, decisions: 11 } },
    },
  };

  const withoutBench = evaluatePlayerClubDna(
    'MC',
    {
      pace: 15,
      stamina: 16,
      workRate: 16,
      decisions: 15,
      passing: 15,
      tackling: 14,
      positioning: 14,
    },
    DEFAULT_CLUB_DNA_WEIGHTS,
    null
  );

  const withBench = evaluatePlayerClubDna(
    'MC',
    {
      pace: 15,
      stamina: 16,
      workRate: 16,
      decisions: 15,
      passing: 15,
      tackling: 14,
      positioning: 14,
    },
    DEFAULT_CLUB_DNA_WEIGHTS,
    mockBenchmarks
  );

  assert.ok(withBench.divisionCalibrationBonus > 0);
  assert.ok(withBench.overallDnaScore > withoutBench.overallDnaScore);
});
