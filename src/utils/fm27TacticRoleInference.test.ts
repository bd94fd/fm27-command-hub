import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedFm27BinaryDictionary } from './fm27BinaryDictionary.ts';
import {
  buildTacticOverrideKey,
  getSlotPositionBucket,
  getValidFm27RolesForSlot,
  resolveSlotDualPhaseRoles,
} from './fm27TacticRoleInference.ts';

const RETIRED_FM24_ROLE_RE =
  /\b(mezzala|enganche|trequartista|carrilero|raumdeuter|segundo volante)\b/i;

test('buildTacticOverrideKey and getSlotPositionBucket normalize tactic keys and position buckets', () => {
  assert.equal(buildTacticOverrideKey('4-3-3 Counter Positive', 0), '4-3-3_counter_positive#0');
  assert.equal(getSlotPositionBucket('GK'), 'GK');
  assert.equal(getSlotPositionBucket('DCR'), 'DC');
  assert.equal(getSlotPositionBucket('DR'), 'FB');
  assert.equal(getSlotPositionBucket('WBR'), 'WB');
  assert.equal(getSlotPositionBucket('DM'), 'DM');
  assert.equal(getSlotPositionBucket('MCL'), 'MC');
  assert.equal(getSlotPositionBucket('ML'), 'WM');
  assert.equal(getSlotPositionBucket('AMR'), 'W');
  assert.equal(getSlotPositionBucket('AMC'), 'AMC');
  assert.equal(getSlotPositionBucket('ST'), 'ST');
});

test('getValidFm27RolesForSlot narrows FB vs WB vs W roles and never includes retired FM24 roles', () => {
  const fbOop = getValidFm27RolesForSlot('DR', 'oop').map((r) => r.name);
  assert.ok(fbOop.includes('Holding Full-Back'));
  assert.ok(fbOop.includes('Full-Back'));

  const wbOop = getValidFm27RolesForSlot('WBR', 'oop').map((r) => r.name);
  assert.ok(wbOop.includes('Wing-Back'));
  assert.ok(!wbOop.includes('Holding Full-Back'));

  const wOop = getValidFm27RolesForSlot('AML', 'oop').map((r) => r.name);
  assert.ok(wOop.includes('Tracking Winger'));

  for (const pos of ['GK', 'DC', 'DR', 'WBR', 'DM', 'MC', 'MR', 'AML', 'AMC', 'STC']) {
    for (const phase of ['ip', 'oop'] as const) {
      const roles = getValidFm27RolesForSlot(pos, phase);
      assert.ok(roles.length > 0, `Expected valid ${phase} roles for ${pos}`);
      for (const r of roles) {
        assert.equal(RETIRED_FM24_ROLE_RE.test(r.name), false, `Retired role found: ${r.name}`);
      }
    }
  }
});

test('resolveSlotDualPhaseRoles obeys precedence: confirmed override > explicit save > fingerprint > inferred', () => {
  const emptyDict = createSeedFm27BinaryDictionary();
  const tacticKey = buildTacticOverrideKey('4-3-3 Counter', 0);

  // 1. User confirmed override wins over everything
  const confirmed = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 8,
      position: 'AML',
      outOfPossessionPosition: 'AML',
      inPossessionRole: 'Winger',
      outOfPossessionRole: 'Wide Outlet Winger',
    },
    slotIndex: 8,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey,
    overrides: {
      bySlot: {
        [`${tacticKey}::8`]: {
          ipRole: 'Inside Forward',
          oopRole: 'Tracking Winger',
        },
      },
      byFingerprint: {},
    },
    dictionary: emptyDict,
  });
  assert.equal(confirmed.ipRole, 'Inside Forward');
  assert.equal(confirmed.ipSource, 'confirmed');
  assert.equal(confirmed.ipConfidence, 100);
  assert.equal(confirmed.oopRole, 'Tracking Winger');
  assert.equal(confirmed.oopSource, 'confirmed');

  // 2. Explicit save role wins when no override or dictionary/native bitmask matches
  const explicit = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 8,
      position: 'AML',
      outOfPossessionPosition: 'AML',
      inPossessionRole: 'Inside Forward',
      outOfPossessionRole: 'Tracking Winger',
    },
    slotIndex: 8,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey,
    overrides: { bySlot: {}, byFingerprint: {} },
    dictionary: emptyDict,
  });
  assert.equal(explicit.ipRole, 'Inside Forward');
  assert.equal(explicit.ipSource, 'save_decoded');
  assert.equal(explicit.oopRole, 'Tracking Winger');
  assert.equal(explicit.oopSource, 'save_decoded');

  // 3. Legacy fingerprint match wins over inference when explicit save role is absent
  const fingerprinted = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 8,
      position: 'AML',
      outOfPossessionPosition: 'AML',
      ipBinaryFingerprint: 'fp_ip_01',
      oopBinaryFingerprint: 'fp_oop_01',
    },
    slotIndex: 8,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey,
    overrides: {
      bySlot: {},
      byFingerprint: {
        'W::ip::fp_ip_01': 'Winger',
        'W::oop::fp_oop_01': 'Tracking Winger',
      },
    },
    dictionary: emptyDict,
  });
  assert.equal(fingerprinted.ipRole, 'Winger');
  assert.equal(fingerprinted.ipSource, 'fingerprint_matched');
  assert.equal(fingerprinted.oopRole, 'Tracking Winger');
  assert.equal(fingerprinted.oopSource, 'fingerprint_matched');

  // 4. Clean deterministic inference fallback when no binary or override exists
  const inferred = resolveSlotDualPhaseRoles({
    slot: { slotIndex: 10, position: 'STC', outOfPossessionPosition: 'STC' },
    slotIndex: 10,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey,
    overrides: { bySlot: {}, byFingerprint: {} },
    dictionary: emptyDict,
  });
  assert.equal(inferred.ipSource, 'inferred');
  assert.equal(inferred.oopSource, 'inferred');
  assert.ok(inferred.validIpRoles.includes(inferred.ipRole));
  assert.ok(inferred.validOopRoles.includes(inferred.oopRole));
  assert.equal(RETIRED_FM24_ROLE_RE.test(inferred.ipRole), false);
  assert.equal(RETIRED_FM24_ROLE_RE.test(inferred.oopRole), false);
});
