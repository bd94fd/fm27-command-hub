import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  decodeFm27RoleFromBinary,
  decodeFm27StyleFourCC,
  decodeFm27TeamInstructionsFromBytes,
} from './fm27NativeBinaryDecoder';
import { buildLastMatchTacticBlueprint } from './clubGovernanceAndTactics';
import { createSeedFm27BinaryDictionary } from './fm27BinaryDictionary';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { RawTacticSettingUnit } from '../types/fmSave';

function makeUnit(secondHigh: number, index = 0): RawTacticSettingUnit {
  return {
    index,
    headHex: '0x0b',
    firstBits: 0,
    secondLow: 0,
    secondMid: 0,
    secondHigh,
    signature: `0b.0.0.0.${secondHigh.toString(16)}`,
  };
}

test('Native 64-bit FM27 IP role decoder matches all 10 verified FM27 27.1.0+2505117 examples (rhiever/fmsave#122)', () => {
  const verifiedIpExamples: Array<{
    label: string;
    secondHigh: number;
    trailBits: string | number;
    expectedRole: string;
    expectedBit: number;
  }> = [
    { label: 'BGK', secondHigh: 0x401000, trailBits: '0x0', expectedRole: 'Ball-Playing Goalkeeper', expectedBit: 12 },
    { label: 'WB', secondHigh: 0x400008, trailBits: '0x0', expectedRole: 'Wing-Back', expectedBit: 3 },
    { label: 'CB', secondHigh: 0x200002, trailBits: '0x0', expectedRole: 'Centre-Back', expectedBit: 1 },
    { label: 'BCB', secondHigh: 0x1200000, trailBits: '0x0', expectedRole: 'Ball-Playing Centre-Back', expectedBit: 24 },
    { label: 'AP', secondHigh: 0x820000, trailBits: '0x0', expectedRole: 'Advanced Playmaker', expectedBit: 17 },
    { label: 'DM', secondHigh: 0x200010, trailBits: '0x0', expectedRole: 'Defensive Midfielder', expectedBit: 4 },
    { label: 'DLP', secondHigh: 0x408000, trailBits: '0x0', expectedRole: 'Deep-Lying Playmaker', expectedBit: 15 },
    { label: 'IW (high 32-bit trail_bits)', secondHigh: 0x400000, trailBits: 131072, expectedRole: 'Inside Winger', expectedBit: 49 },
    { label: 'IF', secondHigh: 0x8800000, trailBits: '0x0', expectedRole: 'Inside Forward', expectedBit: 27 },
    { label: 'CHF', secondHigh: 0x80800000, trailBits: '0x0', expectedRole: 'Channel Forward', expectedBit: 31 },
  ];

  for (const ex of verifiedIpExamples) {
    const res = decodeFm27RoleFromBinary({
      phase: 'ip',
      settingUnits: [makeUnit(0x0, 0), makeUnit(ex.secondHigh, 1)],
      trailBits: ex.trailBits,
    });
    assert.ok(res, `Expected native IP decode for ${ex.label}`);
    assert.equal(res.roleName, ex.expectedRole, `Mismatch for IP ${ex.label}`);
    assert.equal(res.bitIndex, ex.expectedBit, `Bit mismatch for IP ${ex.label}`);
    assert.equal(res.source, 'native_binary');
  }
});

test('Native 64-bit FM27 OOP role decoder matches all 8 verified FM27 27.1.0+2505117 examples (rhiever/fmsave#122)', () => {
  const verifiedOopExamples: Array<{
    label: string;
    secondHigh: number;
    trailBits: string | number;
    expectedRole: string;
    expectedBit: number;
  }> = [
    { label: 'SK', secondHigh: 0x800002, trailBits: '0x0', expectedRole: 'Sweeper Keeper', expectedBit: 1 },
    { label: 'FB', secondHigh: 0x200200, trailBits: '0x0', expectedRole: 'Full-Back', expectedBit: 9 },
    { label: 'CB', secondHigh: 0x200008, trailBits: '0x0', expectedRole: 'Centre-Back', expectedBit: 3 },
    { label: 'PCM', secondHigh: 0x8800000, trailBits: '0x0', expectedRole: 'Pressing Central Midfielder', expectedBit: 27 },
    { label: 'DM', secondHigh: 0x208000, trailBits: '0x0', expectedRole: 'Defensive Midfielder', expectedBit: 15 },
    { label: 'CM', secondHigh: 0x500000, trailBits: '0x0', expectedRole: 'Central Midfielder', expectedBit: 20 },
    { label: 'W (high 32-bit trail_bits)', secondHigh: 0x400000, trailBits: '0x40', expectedRole: 'Winger', expectedBit: 38 },
    { label: 'CFD (high 32-bit trail_bits)', secondHigh: 0x400000, trailBits: '0x400', expectedRole: 'Centre Forward', expectedBit: 42 },
  ];

  for (const ex of verifiedOopExamples) {
    const res = decodeFm27RoleFromBinary({
      phase: 'oop',
      settingUnits: [makeUnit(ex.secondHigh, 0)],
      trailBits: ex.trailBits,
    });
    assert.ok(res, `Expected native OOP decode for ${ex.label}`);
    assert.equal(res.roleName, ex.expectedRole, `Mismatch for OOP ${ex.label}`);
    assert.equal(res.bitIndex, ex.expectedBit, `Bit mismatch for OOP ${ex.label}`);
  }
});

test('Native 64-bit role decoder handles >53-bit roles safely using BigInt (No-Nonsense GK, Midfield Playmaker)', () => {
  // Bit 53 -> trailBits = 1 << (53 - 32) = 1 << 21 = 0x200000
  const nngk = decodeFm27RoleFromBinary({
    phase: 'ip',
    settingUnits: [makeUnit(0x200000, 0)],
    trailBits: '0x200000',
  });
  assert.equal(nngk?.roleName, 'No-Nonsense Goalkeeper');
  assert.equal(nngk?.bitIndex, 53);

  // Bit 57 -> trailBits = 1 << (57 - 32) = 1 << 25 = 0x2000000
  const mp = decodeFm27RoleFromBinary({
    phase: 'ip',
    settingUnits: [makeUnit(0x400000, 0)],
    trailBits: '0x2000000',
  });
  assert.equal(mp?.roleName, 'Midfield Playmaker');
  assert.equal(mp?.bitIndex, 57);
});

test('Native 19-byte FM27 Team Instructions decoder decodes IP, In Transition, OOP, compound codes & FourCC styles', () => {
  // Construct a realistic Gegenpress 19-byte vector
  const bytes = new Array(19).fill(0);
  bytes[2] = 5; // Positive
  bytes[6] = 0x08 | 0x20 | 0x80; // Shorter Passing + Pass Into Space + Play Through Press (low bit)
  bytes[7] = 0x10 | 0x20; // Low Crosses + Run At Defence
  bytes[8] = 0x02 | 0x08 | 0x04; // Work Ball Into Box + Counter-Attack + Play For Set Pieces
  bytes[9] = 0x10; // Overlap Both Flanks
  bytes[10] = 0x08; // Distribute to Centre-Backs
  bytes[11] = 0x04 | 0x10 | 0x80; // Distribute Quickly + Short Goal Kicks + Higher Tempo
  bytes[12] = 0x08 | 0x40; // Wider + Be More Expressive
  bytes[13] = 0x20 | 0x02; // High Press + Higher Defensive Line
  bytes[14] = 0x40 | 0x20 | 0x04; // Counter-Press + Prevent Short GK Distribution + Trigger Press More Often
  bytes[15] = 0x10 | 0x01; // Step Up More + Get Stuck In
  bytes[16] = 0x04 | 0x02; // Stop Crosses + Trap Outside

  // ASCII 'GEGE' big-endian = 0x47454745
  const res = decodeFm27TeamInstructionsFromBytes(bytes, 0x47454745);
  assert.equal(res.mentality, 'Positive');
  assert.equal(res.styleName, 'Gegenpress');
  assert.equal(res.passingDirectness, 'Shorter Passing');
  assert.equal(res.tempo, 'Higher Tempo');
  assert.equal(res.width, 'Wider');
  assert.equal(res.lineOfEngagement, 'High Press');
  assert.equal(res.defensiveLine, 'Higher Defensive Line');
  assert.equal(res.pressingIntensity, 'Trigger Press More Often');

  assert.ok(res.inPossession.includes('Shorter Passing'));
  assert.ok(res.inPossession.includes('Pass Into Space'));
  assert.ok(res.inPossession.includes('Play Through Press'));
  assert.ok(res.inPossession.includes('Low Crosses'));
  assert.ok(res.inPossession.includes('Run At Defence'));
  assert.ok(res.inPossession.includes('Work Ball Into Box'));
  assert.ok(res.inPossession.includes('Play For Set Pieces'));
  assert.ok(res.inPossession.includes('Overlap Both Flanks'));
  assert.ok(res.inPossession.includes('Higher Tempo'));
  assert.ok(res.inPossession.includes('Be More Expressive'));

  assert.ok(res.inTransition.includes('Counter-Attack'));
  assert.ok(res.inTransition.includes('Counter-Press'));
  assert.ok(res.inTransition.includes('Distribute to Centre-Backs'));
  assert.ok(res.inTransition.includes('Distribute Quickly'));
  assert.ok(res.inTransition.includes('Short Goal Kicks'));

  assert.ok(res.outOfPossession.includes('High Press'));
  assert.ok(res.outOfPossession.includes('Higher Defensive Line'));
  assert.ok(res.outOfPossession.includes('Trigger Press More Often'));
  assert.ok(res.outOfPossession.includes('Prevent Short GK Distribution'));
  assert.ok(res.outOfPossession.includes('Step Up More'));
  assert.ok(res.outOfPossession.includes('Get Stuck In'));
  assert.ok(res.outOfPossession.includes('Stop Crosses'));
  assert.ok(res.outOfPossession.includes('Trap Outside'));

  // Compound codes: b[8] == 0x01 -> Counter-Attack, (b[12] & 0xfc) == 0x50 -> Narrower + Balanced creative freedom
  const compound = new Array(19).fill(0);
  compound[8] = 0x01;
  compound[12] = 0x50;
  const compRes = decodeFm27TeamInstructionsFromBytes(compound, null);
  assert.ok(compRes.inTransition.includes('Counter-Attack'));
  assert.equal(compRes.width, 'Narrower');
  assert.ok(!compRes.inPossession.includes('Be More Expressive'));
  assert.ok(!compRes.inPossession.includes('Be More Disciplined'));

  // Little-endian FourCC 'CONT' = 0x544e4f43
  assert.equal(decodeFm27StyleFourCC(0x544e4f43), 'Control Possession');
  assert.equal(decodeFm27StyleFourCC(0x54494b49), 'Tiki-Taka');
});

test('End-to-end buildLastMatchTacticBlueprint auto-decodes roles & team instructions with EMPTY dictionary (zero manual calibration)', () => {
  const emptyDict = createSeedFm27BinaryDictionary('27.1.0+2505117');
  const bytes = new Array(19).fill(0);
  bytes[2] = 5; // Positive
  bytes[6] = 0x08; // Shorter Passing
  bytes[13] = 0x20 | 0x02; // High Press + Higher Defensive Line
  bytes[14] = 0x40 | 0x04; // Counter-Press + Trigger Press More Often

  const payload = {
    meta: {
      game: 'FM27',
      build: '27.1.0+2505117',
      knownBuild: true,
      saveName: 'zelzate.fm',
      clubName: 'KVV Zelzate',
      managerName: 'Coach',
      fmsaveVersion: '0.14.3',
      gameDateDmy: '15/09/2027',
    },
    players: [],
    tactics: [
      {
        index: 0,
        name: 'Zelzate Press',
        styleName: '',
        mentality: 'Balanced',
        inPossessionFormation: '4-3-3 DM Wide',
        outOfPossessionFormation: '4-5-1',
        teamInstructions: {
          inPossession: [],
          inTransition: [],
          outOfPossession: [],
          rawTeamInstructionBytes: bytes,
          styleCode: 0x47454745, // GEGE -> Gegenpress
        },
        slots: [
          {
            slotIndex: 0,
            position: 'GK',
            outOfPossessionPosition: 'GK',
            playerName: 'Rene Vanden Borre',
            ipRoleBits: '0x1',
            ipTrailBits: '0x0',
            ipSettingUnits: [makeUnit(0x401000, 0)], // Ball-Playing Goalkeeper
            oopRoleBits: '0x1',
            oopTrailBits: '0x0',
            oopSettingUnits: [makeUnit(0x800002, 0)], // Sweeper Keeper
          },
          {
            slotIndex: 1,
            position: 'AMR',
            outOfPossessionPosition: 'MR',
            playerName: 'Quinten Boudry',
            ipRoleBits: '0x80',
            ipTrailBits: '0x20000',
            ipSettingUnits: [makeUnit(0x400000, 0)], // Inside Winger (bit 49)
            oopRoleBits: '0x80',
            oopTrailBits: '0x40',
            oopSettingUnits: [makeUnit(0x400000, 0)], // Winger (bit 38)
          },
        ],
      },
    ],
  } as unknown as DecodedFmSavePayload;

  const bp = buildLastMatchTacticBlueprint(payload, [], 0, { bySlot: {}, byFingerprint: {} }, emptyDict);
  assert.ok(bp);
  assert.equal(bp.styleName, 'Gegenpress');
  assert.equal(bp.mentality, 'Positive');
  assert.ok(bp.teamInstructions.inPossession.includes('Shorter Passing'));
  assert.ok(bp.teamInstructions.inTransition.includes('Counter-Press'));
  assert.ok(bp.teamInstructions.outOfPossession.includes('High Press'));
  assert.equal(bp.starters[0].inPossessionRole, 'Ball-Playing Goalkeeper');
  assert.equal(bp.starters[0].outOfPossessionRole, 'Sweeper Keeper');
  assert.equal(bp.starters[0].ipRoleSource, 'save_decoded');
  assert.equal(bp.starters[0].oopRoleSource, 'save_decoded');
  assert.equal(bp.starters[1].inPossessionRole, 'Inside Winger');
  assert.equal(bp.starters[1].outOfPossessionRole, 'Winger');
  assert.equal(bp.starters[1].ipRoleSource, 'save_decoded');
  assert.equal(bp.starters[1].oopRoleSource, 'save_decoded');
});

test('Python fm-save-mapper.py contains native 64-bit role decoder, 19-byte TI decoder, OOP permutation fix (#119), human manager contract fix (#41), and FM27 staff job codes', () => {
  const mapperSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-mapper.py'),
    'utf8'
  );
  assert.match(mapperSrc, /def _decode_fm27_native_role\(/);
  assert.match(mapperSrc, /_FM27_IP_ROLE_BY_BIT/);
  assert.match(mapperSrc, /_FM27_OOP_ROLE_BY_BIT/);
  assert.match(mapperSrc, /valid_oop_perm/);
  assert.match(mapperSrc, /FM27_STAFF_JOB_CODE_LABELS/);
  assert.match(mapperSrc, /is_human_mgr/);
  assert.match(mapperSrc, /Play Through Press/);
  assert.match(mapperSrc, /Prevent Short GK Distribution/);
});
