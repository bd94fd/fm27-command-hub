import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDictionaryMerge,
  CompactBinaryDiffSnapshot,
  computeFmBinaryDiff,
  countDictionaryMappings,
  decodeGovernanceFromDictionary,
  decodePlayerInstructionsFromDictionary,
  decodeRoleFromDictionary,
  decodeTeamInstructionsFromDictionary,
  deleteDictionaryRule,
  exportAnonymizedProbeSummary,
  exportDictionaryJson,
  loadFm27BinaryDictionary,
  previewDictionaryMerge,
  resetFm27BinaryDictionary,
  upsertGovernanceOffsetRule,
  upsertPlayerInstructionMapping,
  upsertRoleDictionaryMapping,
  upsertStyleCodeMapping,
  upsertTeamInstructionMapping,
} from './fm27BinaryDictionary';
import {
  clearTacticRoleOverrides,
  resolveSlotDualPhaseRoles,
  saveTacticRoleOverride,
} from './fm27TacticRoleInference';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type {
  BinaryForensicsSnapshot,
  DeepTacticRecord,
  TacticSlotAssignment,
} from '../types/fmSave';

// Minimal Node window + localStorage shim so dictionary & override persistence run deterministically
function installMemoryStorage() {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: memoryStorage },
    configurable: true,
    writable: true,
  });
  return memoryStorage;
}

function makeSlot(overrides: Partial<TacticSlotAssignment> = {}): TacticSlotAssignment {
  return {
    slotIndex: 0,
    position: 'MC',
    outOfPossessionPosition: 'MC',
    playerUid: 1001,
    playerName: 'Test Midfielder',
    ipRoleBits: '001101',
    ipTrailBits: '10',
    ipRoleCoreSignature: 'r:001101|t:10',
    ipBinaryFingerprint: 'r:001101|t:10|u:0b.4.1.0.0',
    ipSettingUnits: [
      { index: 0, headHex: '0b', firstBits: 4, secondLow: 1, secondMid: 0, secondHigh: 0, signature: '0b.4.1.0.0' },
    ],
    oopRoleBits: '010011',
    oopTrailBits: '01',
    oopRoleCoreSignature: 'r:010011|t:01',
    oopBinaryFingerprint: 'r:010011|t:01|u:1c.2.0.1.0',
    oopSettingUnits: [
      { index: 0, headHex: '1c', firstBits: 2, secondLow: 0, secondMid: 1, secondHigh: 0, signature: '1c.2.0.1.0' },
    ],
    inPossessionRole: null,
    outOfPossessionRole: null,
    inPossessionInstructions: [],
    outOfPossessionInstructions: [],
    ...overrides,
  };
}

function makeTactic(overrides: Partial<DeepTacticRecord> = {}): DeepTacticRecord {
  const tiBytes = new Array<number>(19).fill(0);
  tiBytes[2] = 0x05;
  tiBytes[7] = 0x14; // bit 0x04 + bit 0x10
  return {
    index: 0,
    name: '4-3-3 Press',
    inPossessionFormation: '4-3-3 DM Wide',
    outOfPossessionFormation: '4-4-2 Mid Block',
    mentality: 'Positive',
    styleName: 'Custom Style',
    slots: [makeSlot()],
    teamInstructions: {
      mentality: 'Positive',
      styleCode: 9,
      rawTeamInstructionBytes: tiBytes,
      inPossession: [],
      inTransition: [],
      outOfPossession: [],
    },
    ...overrides,
  };
}

function makeForensics(): BinaryForensicsSnapshot {
  const u8 = new Array<number>(128).fill(0);
  u8[12] = 84; // Board confidence 84% -> A
  u8[13] = 72; // Supporter confidence 72% -> B+
  u8[14] = 88; // Job security 88% -> Untouchable (88%)
  // Manager wage £1,500/wk in u16_le at offset 20 (0x05dc => 0xdc, 0x05)
  u8[20] = 0xdc;
  u8[21] = 0x05;

  return {
    fmBuild: 'FM27 (27.1.0)',
    fmsaveVersion: '0.14.3',
    sections: [
      { name: 'humans', schema: 1, sizeBytes: 42000 },
      { name: 'board_confidence', schema: 2, sizeBytes: 8192 },
    ],
    governanceProbes: [
      {
        id: 'humans_manager_name_0',
        section: 'humans',
        anchorLabel: 'manager_name',
        anchorOffset: 1024,
        windowStart: 1024,
        u8Values: u8,
        bytesHex: u8.map((b) => b.toString(16).padStart(2, '0')).join(''),
        candidateDates: [{ relOffset: 40, dmy: '30/06/2029' }],
      },
    ],
    promiseCandidates: [
      {
        id: 'promises_512',
        section: 'promises',
        anchorOffset: 512,
        playerUid: 1001,
        playerName: 'Test Midfielder',
        dueDateDmy: '30/06/2028',
        typeCode: 7,
        rawHex: '07000000',
      },
    ],
    managerContractProbes: [
      {
        source: 'humans',
        wagePw: 1200,
        expiresDmy: '30/06/2029',
        confidence: 'high',
      },
    ],
  };
}

test('decodes IP/OOP roles decoupled from individual Player Instruction setting units', () => {
  installMemoryStorage();
  const base = resetFm27BinaryDictionary();

  const dict = upsertRoleDictionaryMapping(base, {
    positionCode: 'MC',
    phase: 'ip',
    roleBits: '001101',
    trailBits: '10',
    roleCoreSignature: 'r:001101|t:10',
    roleName: 'Channel Midfielder',
    provenance: 'diff_calibrated',
  });

  // Slot with 1 PI unit
  const slotA = makeSlot();
  const hitA = decodeRoleFromDictionary(dict, {
    positionCode: slotA.position,
    phase: 'ip',
    roleBits: slotA.ipRoleBits,
    trailBits: slotA.ipTrailBits,
    roleCoreSignature: slotA.ipRoleCoreSignature,
  });
  assert.equal(hitA?.roleName, 'Channel Midfielder');

  // Same role bits + trail bits, completely different PI units (must still decode!)
  const slotB = makeSlot({
    ipBinaryFingerprint: 'r:001101|t:10|u:0b.4.1.0.0,ff.9.2.1.0,aa.1.0.0.1',
    ipSettingUnits: [
      { index: 0, headHex: '0b', firstBits: 4, secondLow: 1, secondMid: 0, secondHigh: 0, signature: '0b.4.1.0.0' },
      { index: 1, headHex: 'ff', firstBits: 9, secondLow: 2, secondMid: 1, secondHigh: 0, signature: 'ff.9.2.1.0' },
      { index: 2, headHex: 'aa', firstBits: 1, secondLow: 0, secondMid: 0, secondHigh: 1, signature: 'aa.1.0.0.1' },
    ],
  });
  const hitB = decodeRoleFromDictionary(dict, {
    positionCode: slotB.position,
    phase: 'ip',
    roleBits: slotB.ipRoleBits,
    trailBits: slotB.ipTrailBits,
    roleCoreSignature: slotB.ipRoleCoreSignature,
  });
  assert.equal(hitB?.roleName, 'Channel Midfielder');

  // Different role bits must NOT match
  const slotC = makeSlot({
    ipRoleBits: '111111',
    ipRoleCoreSignature: 'r:111111|t:10',
  });
  assert.equal(
    decodeRoleFromDictionary(dict, {
      positionCode: slotC.position,
      phase: 'ip',
      roleBits: slotC.ipRoleBits,
      trailBits: slotC.ipTrailBits,
      roleCoreSignature: slotC.ipRoleCoreSignature,
    }),
    null
  );
});

test('auto-learns into binary dictionary on role override save and resolves Tier-1 dictionary_decoded', () => {
  installMemoryStorage();
  resetFm27BinaryDictionary();
  clearTacticRoleOverrides();

  const slot = makeSlot();
  saveTacticRoleOverride({
    tacticKey: '4-3-3_press#0',
    slotIndex: 0,
    phase: 'ip',
    roleName: 'Box-to-Box Playmaker',
    positionCode: 'MC',
    binaryFingerprint: slot.ipBinaryFingerprint,
    roleBits: slot.ipRoleBits,
    trailBits: slot.ipTrailBits,
    roleCoreSignature: slot.ipRoleCoreSignature,
  });
  saveTacticRoleOverride({
    tacticKey: '4-3-3_press#0',
    slotIndex: 0,
    phase: 'oop',
    roleName: 'Pressing Central Midfielder',
    positionCode: 'MC',
    binaryFingerprint: slot.oopBinaryFingerprint,
    roleBits: slot.oopRoleBits,
    trailBits: slot.oopTrailBits,
    roleCoreSignature: slot.oopRoleCoreSignature,
  });

  // Clear per-tactic overrides to prove the dictionary itself learned the decoupled binary IDs
  clearTacticRoleOverrides();

  const resolved = resolveSlotDualPhaseRoles({
    slot: makeSlot({
      ipSettingUnits: [
        { index: 0, headHex: '99', firstBits: 1, secondLow: 1, secondMid: 1, secondHigh: 1, signature: '99.1.1.1.1' },
      ],
    }),
    slotIndex: 0,
    player: null,
    styleName: 'Custom Style',
    mentality: 'Positive',
    tacticKey: 'different_tactic#1',
    overrides: { bySlot: {}, byFingerprint: {} },
  });

  assert.equal(resolved.ipRole, 'Box-to-Box Playmaker');
  assert.equal(resolved.ipSource, 'dictionary_decoded');
  assert.equal(resolved.oopRole, 'Pressing Central Midfielder');
  assert.equal(resolved.oopSource, 'dictionary_decoded');
});

test('decodes 19-byte Team Instructions (exact + bitmask), styleCode, and TacticSettingUnit PIs into LastMatchTacticBlueprint', () => {
  installMemoryStorage();
  let dict = resetFm27BinaryDictionary();

  dict = upsertTeamInstructionMapping(dict, {
    byteIndex: 2,
    matchType: 'exact_value',
    matchValue: 0x05,
    phase: 'in_possession',
    category: 'Passing Directness',
    label: 'Shorter Passing',
    provenance: 'diff_calibrated',
  });
  dict = upsertTeamInstructionMapping(dict, {
    byteIndex: 7,
    matchType: 'bitmask',
    matchValue: 0x04,
    phase: 'in_transition',
    category: 'When Possession Is Lost',
    label: 'Counter-Press',
    provenance: 'diff_calibrated',
  });
  dict = upsertTeamInstructionMapping(dict, {
    byteIndex: 7,
    matchType: 'bitmask',
    matchValue: 0x10,
    phase: 'out_of_possession',
    category: 'Pressing Intensity',
    label: 'Trigger Press Much More Often',
    provenance: 'diff_calibrated',
  });
  dict = upsertStyleCodeMapping(dict, 9, 'Gegenpress', 'diff_calibrated');
  dict = upsertPlayerInstructionMapping(dict, {
    phase: 'ip',
    unitSignature: '0b.4.1.0.0',
    label: 'Take More Risks',
    provenance: 'diff_calibrated',
  });
  dict = upsertPlayerInstructionMapping(dict, {
    phase: 'oop',
    unitSignature: '1c.2.0.1.0',
    label: 'Tackle Harder',
    provenance: 'diff_calibrated',
  });

  const reloaded = loadFm27BinaryDictionary();
  const tactic = makeTactic();

  const tiDecoded = decodeTeamInstructionsFromDictionary(reloaded, {
    rawBytes: tactic.teamInstructions?.rawTeamInstructionBytes,
    styleCode: tactic.teamInstructions?.styleCode,
  });
  assert.equal(tiDecoded.styleName, 'Gegenpress');
  assert.ok(tiDecoded.inPossession.some((s) => s.includes('Shorter Passing')));
  assert.ok(tiDecoded.inTransition.some((s) => s.includes('Counter-Press')));
  assert.ok(tiDecoded.outOfPossession.some((s) => s.includes('Trigger Press Much More Often')));

  const ipPi = decodePlayerInstructionsFromDictionary(reloaded, tactic.slots?.[0]?.ipSettingUnits, 'ip');
  const oopPi = decodePlayerInstructionsFromDictionary(reloaded, tactic.slots?.[0]?.oopSettingUnits, 'oop');
  assert.ok(ipPi.decodedLabels.includes('Take More Risks'));
  assert.ok(oopPi.decodedLabels.includes('Tackle Harder'));

  const payload = {
    meta: { clubName: 'Test FC', gameDateDmy: '15/09/2027' },
    tactics: [tactic],
    playedMatches: [],
  } as unknown as DecodedFmSavePayload;

  const blueprint = buildLastMatchTacticBlueprint(payload, []);
  assert.ok(blueprint);
  assert.equal(blueprint.styleName, 'Gegenpress');
  assert.ok(blueprint.teamInstructions.inPossession.some((s) => s.includes('Shorter Passing')));
  assert.ok(blueprint.teamInstructions.inTransition.some((s) => s.includes('Counter-Press')));
  assert.ok(
    blueprint.teamInstructions.outOfPossession.some((s) =>
      s.includes('Trigger Press Much More Often')
    )
  );
  assert.ok(blueprint.starters[0].inPossessionInstructions?.includes('Take More Risks'));
  assert.ok(blueprint.starters[0].outOfPossessionInstructions?.includes('Tackle Harder'));
});

test('decodes governance offset rules & manager contract probes inside buildClubGovernanceState', () => {
  installMemoryStorage();
  let dict = resetFm27BinaryDictionary();

  dict = upsertGovernanceOffsetRule(dict, {
    targetField: 'board_confidence',
    section: 'humans',
    anchorLabel: 'manager_name',
    relOffset: 12,
    encoding: 'u8_percent_0_100',
    provenance: 'diff_calibrated',
  });
  dict = upsertGovernanceOffsetRule(dict, {
    targetField: 'supporter_confidence',
    section: 'humans',
    anchorLabel: 'manager_name',
    relOffset: 13,
    encoding: 'u8_percent_0_100',
    provenance: 'diff_calibrated',
  });
  dict = upsertGovernanceOffsetRule(dict, {
    targetField: 'job_security',
    section: 'humans',
    anchorLabel: 'manager_name',
    relOffset: 14,
    encoding: 'u8_percent_0_100',
    provenance: 'diff_calibrated',
  });
  dict = upsertGovernanceOffsetRule(dict, {
    targetField: 'manager_wage_pw',
    section: 'humans',
    anchorLabel: 'manager_name',
    relOffset: 20,
    encoding: 'u16_le',
    provenance: 'diff_calibrated',
  });

  const forensics = makeForensics();
  const reloaded = loadFm27BinaryDictionary();
  const directGov = decodeGovernanceFromDictionary(reloaded, forensics);
  assert.equal(directGov.boardConfidence?.grade, 'A');
  assert.equal(directGov.supporterConfidence?.grade, 'B+');
  assert.equal(directGov.jobSecurity, 'Untouchable (88%)');
  assert.equal(directGov.managerWagePw, 1500);

  const payload = {
    meta: { clubName: 'Test FC', managerName: 'Alex Manager', gameDateDmy: '15/09/2027' },
    playedMatches: [],
    staff: [],
    binaryForensics: forensics,
  } as unknown as DecodedFmSavePayload;

  const govState = buildClubGovernanceState(payload, []);
  assert.equal(govState.boardConfidence.available, true);
  assert.equal(govState.boardConfidence.grade, 'A');
  assert.equal(govState.supporterConfidence.available, true);
  assert.equal(govState.supporterConfidence.grade, 'B+');
  assert.equal(govState.managerContract.available, true);
  assert.equal(govState.managerContract.wagePw, 1500);
  assert.equal(govState.managerContract.expires, '30/06/2029');
  assert.equal(govState.managerContract.jobSecurity, 'Untouchable (88%)');
  assert.equal(govState.clubPromises.length, 1);
  assert.equal(govState.clubPromises[0].targetName, 'Test Midfielder');
});

test('isolates pure PI toggles, role changes, TI byte XORs, governance byte deltas, and promise deltas in computeFmBinaryDiff', () => {
  const tacticA = makeTactic({
    slots: [
      makeSlot({ slotIndex: 0, position: 'MC' }),
      makeSlot({
        slotIndex: 1,
        position: 'STC',
        outOfPossessionPosition: 'STC',
        playerName: 'Striker One',
        ipRoleBits: '101010',
        ipTrailBits: '00',
        ipRoleCoreSignature: 'r:101010|t:00',
        ipSettingUnits: [],
      }),
    ],
  });

  const bytesB = [...(tacticA.teamInstructions?.rawTeamInstructionBytes || [])];
  bytesB[4] = 0x08; // toggled single bit
  const tacticB = makeTactic({
    teamInstructions: {
      ...tacticA.teamInstructions!,
      styleCode: 12,
      rawTeamInstructionBytes: bytesB,
    },
    slots: [
      // Slot 0: SAME role bits, added 1 PI unit -> pure PI toggle
      makeSlot({
        slotIndex: 0,
        position: 'MC',
        ipSettingUnits: [
          { index: 0, headHex: '0b', firstBits: 4, secondLow: 1, secondMid: 0, secondHigh: 0, signature: '0b.4.1.0.0' },
          { index: 1, headHex: '2a', firstBits: 7, secondLow: 1, secondMid: 1, secondHigh: 0, signature: '2a.7.1.1.0' },
        ],
      }),
      // Slot 1: CHANGED role bits -> role change
      makeSlot({
        slotIndex: 1,
        position: 'STC',
        outOfPossessionPosition: 'STC',
        playerName: 'Striker One',
        ipRoleBits: '110011',
        ipTrailBits: '01',
        ipRoleCoreSignature: 'r:110011|t:01',
        ipSettingUnits: [],
      }),
    ],
  });

  const forensicsA = makeForensics();
  const forensicsB = makeForensics();
  forensicsB.governanceProbes[0].u8Values = [...forensicsA.governanceProbes[0].u8Values];
  forensicsB.governanceProbes[0].u8Values[12] = 78; // -6 change -> plausible rating candidate
  forensicsB.promiseCandidates = [
    {
      id: 'promises_640',
      section: 'promises',
      anchorOffset: 640,
      playerUid: 2002,
      playerName: 'New Promise Player',
      dueDateDmy: '30/06/2029',
      typeCode: 11,
      rawHex: '0b000000',
    },
  ];

  const snapA: CompactBinaryDiffSnapshot = {
    label: 'Before.fm',
    inGameDate: '10/09/2027',
    tactics: [tacticA],
    binaryForensics: forensicsA,
  };
  const snapB: CompactBinaryDiffSnapshot = {
    label: 'After.fm',
    inGameDate: '15/09/2027',
    tactics: [tacticB],
    binaryForensics: forensicsB,
  };

  const diff = computeFmBinaryDiff(snapA, snapB);
  assert.equal(diff.styleCodeChanges.length, 1);
  assert.equal(diff.styleCodeChanges[0].beforeCode, 9);
  assert.equal(diff.styleCodeChanges[0].afterCode, 12);

  assert.equal(diff.teamInstructionByteDiffs.length, 1);
  assert.equal(diff.teamInstructionByteDiffs[0].byteIndex, 4);
  assert.equal(diff.teamInstructionByteDiffs[0].xorMask, 0x08);

  assert.equal(diff.roleBitDiffs.length, 1);
  assert.equal(diff.roleBitDiffs[0].slotIndex, 1);
  assert.equal(diff.roleBitDiffs[0].afterRoleBits, '110011');

  const purePi = diff.settingUnitDiffs.filter((u) => !u.roleBitsChanged);
  assert.equal(purePi.length, 1);
  assert.equal(purePi[0].unit.signature, '2a.7.1.1.0');
  assert.equal(purePi[0].change, 'added');

  assert.equal(diff.governanceByteDiffs.length, 1);
  assert.equal(diff.governanceByteDiffs[0].relOffset, 12);
  assert.equal(diff.governanceByteDiffs[0].delta, -6);
  assert.equal(diff.governanceByteDiffs[0].plausibleRatingCandidate, true);

  assert.equal(diff.newPromiseCandidates.length, 1);
  assert.equal(diff.newPromiseCandidates[0].playerUid, 2002);
  assert.equal(diff.resolvedPromiseCandidates.length, 1);
  assert.equal(diff.resolvedPromiseCandidates[0].playerUid, 1001);
});

test('supports shareable JSON export, conflict-safe merge preview/apply, rule deletion, and privacy-safe anonymized probe export', () => {
  installMemoryStorage();
  const base = resetFm27BinaryDictionary();

  const localDict = upsertRoleDictionaryMapping(base, {
    positionCode: 'MC',
    phase: 'ip',
    roleBits: '001101',
    trailBits: '10',
    roleCoreSignature: 'r:001101|t:10',
    roleName: 'Channel Midfielder',
    provenance: 'user_confirmed',
  });

  // Build an incoming community JSON with 1 conflicting role + 1 new role + 1 new TI
  const incomingObj = JSON.parse(exportDictionaryJson(localDict));
  const existingRoleKey = Object.keys(incomingObj.roleMappings)[0];
  incomingObj.roleMappings[existingRoleKey].roleName = 'Central Midfielder';
  incomingObj.roleMappings['STC::ip::r:110011|t:01'] = {
    key: 'STC::ip::r:110011|t:01',
    positionBucket: 'STC',
    phase: 'ip',
    roleBits: '110011',
    trailBits: '01',
    roleCoreSignature: 'r:110011|t:01',
    roleName: 'Channel Forward',
    provenance: 'diff_calibrated',
    updatedAtIso: new Date().toISOString(),
  };
  incomingObj.teamInstructionMappings['ti_2_5'] = {
    key: 'ti_2_5',
    byteIndex: 2,
    matchType: 'exact_value',
    matchValue: 5,
    phase: 'in_possession',
    category: 'Passing Directness',
    label: 'Shorter Passing',
    provenance: 'diff_calibrated',
    updatedAtIso: new Date().toISOString(),
  };

  const preview = previewDictionaryMerge(localDict, JSON.stringify(incomingObj));
  assert.equal(preview.valid, true);
  assert.equal(preview.stats.newRoles, 1);
  assert.equal(preview.stats.newTeamInstructions, 1);
  assert.equal(preview.stats.conflicts, 1);

  // Merge keeping local on conflict
  const mergedKeepLocal = applyDictionaryMerge(localDict, preview.incoming!, false);
  assert.equal(mergedKeepLocal.roleMappings[existingRoleKey].roleName, 'Channel Midfielder');
  assert.equal(mergedKeepLocal.roleMappings['STC::ip::r:110011|t:01'].roleName, 'Channel Forward');
  assert.equal(countDictionaryMappings(mergedKeepLocal).total, 3);

  // Merge overwriting conflicts
  const mergedOverwrite = applyDictionaryMerge(localDict, preview.incoming!, true);
  assert.equal(mergedOverwrite.roleMappings[existingRoleKey].roleName, 'Central Midfielder');

  // Delete rule
  const afterDelete = deleteDictionaryRule(mergedKeepLocal, 'teamInstructionMappings', 'ti_2_5');
  assert.equal(afterDelete.teamInstructionMappings['ti_2_5'], undefined);

  // Privacy-safe Anonymized Probe Export (must strip player/manager/club names and never contain CA/PA)
  const probeJson = exportAnonymizedProbeSummary({
    fmBuild: 'FM27 (27.1.0)',
    fmsaveVersion: '0.14.3',
    tactics: [makeTactic()],
    binaryForensics: makeForensics(),
  });
  assert.ok(!probeJson.includes('Test Midfielder'));
  assert.ok(!probeJson.includes('Alex Manager'));
  assert.ok(!probeJson.includes('currentAbility'));
  assert.ok(!probeJson.includes('potentialAbility'));
  const parsedProbe = JSON.parse(probeJson);
  assert.equal(parsedProbe.probeFormatVersion, 1);
  assert.equal(parsedProbe.tactics[0].slots[0].ipRoleBits, '001101');
  assert.equal(parsedProbe.governanceProbes.length, 1);
  assert.equal(parsedProbe.promiseCandidateCount, 1);
});
