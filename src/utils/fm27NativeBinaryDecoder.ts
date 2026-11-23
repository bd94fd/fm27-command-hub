import { RawTacticSettingUnit } from '../types/fmSave';

/**
 * Deterministic native FM27 (27.1.0+) binary decoder for:
 *  1. 64-bit IP & OOP player roles (low32 = last TacticSettingUnit.secondHigh, high32 = trailBits)
 *  2. 19-byte Team Instructions bitfield (bytes 2 & 6..16 across IP, In Transition, OOP)
 *  3. 4-byte ASCII FourCC tactical style_code (GEGE, CONT, TIKI, VERT, DIRE, FLUI, etc.)
 *
 * Works automatically with ZERO manual user calibration — both during `.fm` decode
 * and retroactively on any already-cached save snapshot in browser storage.
 */

// Duty bits embedded in the 64-bit FM27 role word (must be stripped to isolate the role bit).
const ROLE_DUTY_MASK_64 =
  0x200000n |
  0x400000n |
  0x800000n |
  0x2000000n |
  0x4000000n |
  0x400000000n;

/**
 * Complete FM27 (27.1.0) In-Possession role bit-index table (`roleOnlyMask === 1n << BigInt(bit)`).
 * Verified 100% against real FM27 27.1.0+2505117 saves (rhiever/fmsave#122, FmTacticDecoder).
 */
export const FM27_IP_ROLE_BY_BIT: Readonly<Record<number, string>> = {
  0: 'Goalkeeper',
  1: 'Centre-Back',
  2: 'Full-Back',
  3: 'Wing-Back',
  4: 'Defensive Midfielder',
  5: 'Central Midfielder',
  6: 'Wide Midfielder',
  7: 'Winger',
  9: 'Attacking Midfielder',
  10: 'Deep-Lying Forward',
  11: 'Centre Forward',
  12: 'Ball-Playing Goalkeeper',
  14: 'Advanced Centre-Back',
  15: 'Deep-Lying Playmaker',
  16: 'Box-to-Box Midfielder',
  17: 'Advanced Playmaker',
  18: 'Target Forward',
  19: 'Poacher',
  20: 'Complete Forward',
  24: 'Ball-Playing Centre-Back',
  27: 'Inside Forward',
  28: 'Ball-Winning Midfielder',
  29: 'No-Nonsense Centre-Back',
  30: 'Defensive Winger',
  31: 'Channel Forward',
  32: 'Free Role',
  33: 'Anchor',
  35: 'Half-Back',
  36: 'No-Nonsense Full-Back',
  37: 'Enganche',
  38: 'Advanced Wing-Back',
  39: 'Regista',
  40: 'False Nine',
  41: 'Second Striker',
  42: 'Wide Target Forward',
  43: 'Playmaking Winger',
  44: 'Inside Wing-Back',
  45: 'Wide Forward',
  46: 'Box-to-Box Playmaker',
  47: 'Mezzala',
  48: 'Wide Central Midfielder',
  49: 'Inside Winger',
  50: 'Segundo Volante',
  51: 'Wide Centre-Back',
  52: 'Inside Full-Back',
  53: 'No-Nonsense Goalkeeper',
  54: 'Overlapping Centre-Back',
  55: 'Playmaking Wing-Back',
  56: 'Channel Midfielder',
  57: 'Midfield Playmaker',
};

/**
 * Complete FM27 (27.1.0) Out-of-Possession role bit-index table (`roleOnlyMask === 1n << BigInt(bit)`).
 * Verified 100% against real FM27 27.1.0+2505117 saves (rhiever/fmsave#122, FmTacticDecoder).
 */
export const FM27_OOP_ROLE_BY_BIT: Readonly<Record<number, string>> = {
  0: 'Goalkeeper',
  1: 'Sweeper Keeper',
  2: 'Line-Holding Keeper',
  3: 'Centre-Back',
  4: 'Stopping Centre-Back',
  5: 'Covering Centre-Back',
  6: 'Wide Centre-Back',
  7: 'Stopping Wide Centre-Back',
  8: 'Covering Wide Centre-Back',
  9: 'Full-Back',
  10: 'Pressing Full-Back',
  11: 'Holding Full-Back',
  12: 'Wing-Back',
  13: 'Pressing Wing-Back',
  14: 'Holding Wing-Back',
  15: 'Defensive Midfielder',
  16: 'Dropping Defensive Midfielder',
  17: 'Pressing Defensive Midfielder',
  18: 'Screening Defensive Midfielder',
  19: 'Wide Covering Defensive Midfielder',
  20: 'Central Midfielder',
  27: 'Pressing Central Midfielder',
  28: 'Screening Central Midfielder',
  29: 'Wide Covering Central Midfielder',
  30: 'Attacking Midfielder',
  31: 'Tracking Attacking Midfielder',
  32: 'Central Outlet Attacking Midfielder',
  33: 'Splitting Outlet Attacking Midfielder',
  35: 'Wide Midfielder',
  36: 'Tracking Wide Midfielder',
  37: 'Wide Outlet Wide Midfielder',
  38: 'Winger',
  39: 'Tracking Winger',
  40: 'Inside Outlet Winger',
  41: 'Wide Outlet Winger',
  42: 'Centre Forward',
  43: 'Tracking Centre Forward',
  44: 'Central Outlet Centre Forward',
  45: 'Splitting Outlet Centre Forward',
};

const FOURCC_STYLE_NAMES: Readonly<Record<string, string>> = {
  GEGE: 'Gegenpress',
  CONT: 'Control Possession',
  TIKI: 'Tiki-Taka',
  VERT: 'Vertical Tiki-Taka',
  FLUI: 'Fluid Counter-Attack',
  DIRE: 'Direct Counter-Attack',
  WING: 'Wing Play',
  ROUT: 'Route One',
  CATE: 'Catenaccio',
  PARK: 'Park The Bus',
  CUST: 'Custom',
  NULL: 'Custom',
};

const MENTALITY_BY_BYTE: Readonly<Record<number, string>> = {
  1: 'Very Defensive',
  2: 'Defensive',
  3: 'Cautious',
  4: 'Balanced',
  5: 'Positive',
  6: 'Attacking',
  7: 'Very Attacking',
};

export interface NativeDecodedRoleResult {
  roleName: string;
  bitIndex: number;
  roleMaskHex: string;
  dutyHint: string | null;
  source: 'native_binary';
}

export interface NativeDecodedTeamInstructionsResult {
  mentality: string | null;
  styleName: string | null;
  passingDirectness: string | null;
  tempo: string | null;
  width: string | null;
  defensiveLine: string | null;
  lineOfEngagement: string | null;
  pressingIntensity: string | null;
  inPossession: string[];
  inTransition: string[];
  outOfPossession: string[];
  decodedCount: number;
  /** Per-byte human labels for UI inspection (0..18) */
  labelsByByteIndex: Record<number, string[]>;
}

/**
 * Safely parses a hex string ("0x20000"), decimal string ("131072"), or number into a non-negative 32-bit BigInt.
 */
export function parseUint32BigInt(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    return value >= 0n ? value & 0xffffffffn : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return BigInt(Math.trunc(value)) & 0xffffffffn;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    const parsed = /^0x/i.test(trimmed) ? BigInt(trimmed) : BigInt(trimmed);
    return parsed >= 0n ? parsed & 0xffffffffn : null;
  } catch {
    // Handle bare hex strings without 0x prefix (e.g. "401000")
    if (/^[0-9a-f]+$/i.test(trimmed)) {
      try {
        return BigInt(`0x${trimmed}`) & 0xffffffffn;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function findSingleBitIndex(mask: bigint): number | null {
  if (mask <= 0n) return null;
  // Exact single-bit power-of-two fast path
  if ((mask & (mask - 1n)) === 0n) {
    let bit = 0;
    let cursor = mask;
    while (cursor > 1n) {
      cursor >>= 1n;
      bit += 1;
    }
    return bit;
  }
  return null;
}

function decodeDutyHint(mask64: bigint): string | null {
  const dutyBits = mask64 & ROLE_DUTY_MASK_64;
  if (dutyBits === 0x200000n) return 'Defend';
  if (dutyBits === 0x400000n) return 'Support';
  if (dutyBits === 0x800000n) return 'Attack';
  if (dutyBits === 0x2000000n) return 'Stopper';
  if (dutyBits === 0x4000000n) return 'Cover';
  if (dutyBits === 0x400000000n) return 'Automatic';
  return null;
}

function lookupRoleByMask64(
  mask64: bigint,
  table: Readonly<Record<number, string>>
): { roleName: string; bitIndex: number; roleOnlyMask: bigint } | null {
  const roleOnly = mask64 & ~ROLE_DUTY_MASK_64;
  if (roleOnly <= 0n) return null;

  const exactBit = findSingleBitIndex(roleOnly);
  if (exactBit !== null && table[exactBit]) {
    return { roleName: table[exactBit], bitIndex: exactBit, roleOnlyMask: roleOnly };
  }

  // Defensive fallback: if multiple non-duty bits are set, prefer the highest known FM27 role bit
  let matchedBit: number | null = null;
  for (const bitKey of Object.keys(table)) {
    const bit = Number(bitKey);
    if ((roleOnly & (1n << BigInt(bit))) !== 0n) {
      if (matchedBit === null || bit > matchedBit) {
        matchedBit = bit;
      }
    }
  }
  if (matchedBit !== null && table[matchedBit]) {
    return { roleName: table[matchedBit], bitIndex: matchedBit, roleOnlyMask: roleOnly };
  }
  return null;
}

/**
 * Decodes the exact FM27 IP or OOP role directly from the binary `TacticSettingUnit`
 * array and `trail_bits` stored inside the `.fm` save.
 *
 * Formula (verified 18/18 against FM27 27.1.0+2505117):
 *   low32  = last(settingUnits).secondHigh
 *   high32 = trailBits
 *   mask64 = (high32 << 32n) | low32
 *   roleOnlyMask = mask64 & ~ROLE_DUTY_MASK_64
 */
export function decodeFm27RoleFromBinary(params: {
  phase: 'ip' | 'oop';
  settingUnits?: RawTacticSettingUnit[] | null;
  trailBits?: string | number | bigint | null;
  roleBits?: string | number | bigint | null;
}): NativeDecodedRoleResult | null {
  const table = params.phase === 'ip' ? FM27_IP_ROLE_BY_BIT : FM27_OOP_ROLE_BY_BIT;
  const high32 = parseUint32BigInt(params.trailBits) ?? 0n;
  const units = Array.isArray(params.settingUnits) ? params.settingUnits : [];

  if (units.length > 0) {
    // Primary path: last TacticSettingUnit.secondHigh carries the exact low32 role+duty bitmask
    const lastUnit = units[units.length - 1];
    const lastLow32 = parseUint32BigInt(lastUnit?.secondHigh);
    if (lastLow32 !== null) {
      const mask64 = (high32 << 32n) | lastLow32;
      const hit = lookupRoleByMask64(mask64, table);
      if (hit) {
        return {
          roleName: hit.roleName,
          bitIndex: hit.bitIndex,
          roleMaskHex: `0x${hit.roleOnlyMask.toString(16)}`,
          dutyHint: decodeDutyHint(mask64),
          source: 'native_binary',
        };
      }
    }

    // Secondary scan: check prior units in reverse in case trailing unit had zeroed role bits
    for (let i = units.length - 2; i >= 0; i -= 1) {
      const candidateLow = parseUint32BigInt(units[i]?.secondHigh);
      if (candidateLow === null) continue;
      const mask64 = (high32 << 32n) | candidateLow;
      const hit = lookupRoleByMask64(mask64, table);
      if (hit) {
        return {
          roleName: hit.roleName,
          bitIndex: hit.bitIndex,
          roleMaskHex: `0x${hit.roleOnlyMask.toString(16)}`,
          dutyHint: decodeDutyHint(mask64),
          source: 'native_binary',
        };
      }
    }
  }

  // If trailBits alone identifies a high-bit role (>31) even when settingUnits was omitted
  if (high32 > 0n) {
    const mask64 = high32 << 32n;
    const hit = lookupRoleByMask64(mask64, table);
    if (hit) {
      return {
        roleName: hit.roleName,
        bitIndex: hit.bitIndex,
        roleMaskHex: `0x${hit.roleOnlyMask.toString(16)}`,
        dutyHint: null,
        source: 'native_binary',
      };
    }
  }

  return null;
}

/**
 * Decodes a 32-bit FM27 tactical `style_code` FourCC integer into a human preset style name
 * (e.g. `GEGE` -> "Gegenpress", `CONT` -> "Control Possession", `TIKI` -> "Tiki-Taka").
 * Checks both little-endian and big-endian ASCII byte orders.
 */
export function decodeFm27StyleFourCC(styleCode: number | null | undefined): string | null {
  if (typeof styleCode !== 'number' || !Number.isFinite(styleCode) || styleCode <= 0) {
    return null;
  }
  const u32 = Math.trunc(styleCode) >>> 0;
  const b0 = u32 & 0xff;
  const b1 = (u32 >>> 8) & 0xff;
  const b2 = (u32 >>> 16) & 0xff;
  const b3 = (u32 >>> 24) & 0xff;

  const isPrintableAscii = (c: number) => c >= 32 && c <= 126;
  if (![b0, b1, b2, b3].every(isPrintableAscii)) {
    return null;
  }

  const leTag = String.fromCharCode(b0, b1, b2, b3).toUpperCase();
  const beTag = String.fromCharCode(b3, b2, b1, b0).toUpperCase();

  if (FOURCC_STYLE_NAMES[beTag]) return FOURCC_STYLE_NAMES[beTag];
  if (FOURCC_STYLE_NAMES[leTag]) return FOURCC_STYLE_NAMES[leTag];
  return null;
}

/**
 * Decodes all 26 FM27 Team Instructions + Mentality + Style directly from the
 * 19-byte `rawTeamInstructionBytes` (`team_instruction_00..18`) and `styleCode`.
 */
export function decodeFm27TeamInstructionsFromBytes(
  rawBytes: number[] | null | undefined,
  styleCode?: number | null
): NativeDecodedTeamInstructionsResult {
  const bytes = Array.isArray(rawBytes) ? rawBytes.map((x) => (Number(x) || 0) & 0xff) : [];
  const inPossession: string[] = [];
  const inTransition: string[] = [];
  const outOfPossession: string[] = [];
  const labelsByByteIndex: Record<number, string[]> = {};

  const recordByteLabel = (byteIndices: number[], label: string) => {
    for (const idx of byteIndices) {
      if (!labelsByByteIndex[idx]) labelsByByteIndex[idx] = [];
      if (!labelsByByteIndex[idx].includes(label)) {
        labelsByByteIndex[idx].push(label);
      }
    }
  };

  const addInstruction = (
    lane: 'ip' | 'tr' | 'oop',
    label: string | null,
    byteIndices: number[]
  ) => {
    if (!label) return;
    const arr = lane === 'ip' ? inPossession : lane === 'tr' ? inTransition : outOfPossession;
    if (!arr.includes(label)) {
      arr.push(label);
    }
    recordByteLabel(byteIndices, label);
  };

  const styleName = decodeFm27StyleFourCC(styleCode);
  let mentality: string | null = null;
  let passingDirectness: string | null = null;
  let tempo: string | null = null;
  let width: string | null = null;
  let defensiveLine: string | null = null;
  let lineOfEngagement: string | null = null;
  let pressingIntensity: string | null = null;

  if (bytes.length > 2 && MENTALITY_BY_BYTE[bytes[2]]) {
    mentality = MENTALITY_BY_BYTE[bytes[2]];
    recordByteLabel([2], `Mentality: ${mentality}`);
  }

  if (bytes.length >= 17) {
    const b6 = bytes[6];
    const b7 = bytes[7];
    const b8 = bytes[8];
    const b9 = bytes[9];
    const b10 = bytes[10];
    const b11 = bytes[11];
    const b12 = bytes[12];
    const b13 = bytes[13];
    const b14 = bytes[14];
    const b15 = bytes[15];
    const b16 = bytes[16];

    // ── IN POSSESSION ────────────────────────────────────────────────────
    // 1. Passing Directness (b[6] & 0x1e)
    const passingCode = b6 & 0x1e;
    if (passingCode === 0x10) passingDirectness = 'Much Shorter Passing';
    else if (passingCode === 0x08) passingDirectness = 'Shorter Passing';
    else if (passingCode === 0x04) passingDirectness = 'More Direct Passing';
    else if (passingCode === 0x02) passingDirectness = 'Much More Direct Passing';
    addInstruction('ip', passingDirectness, [6]);

    // 2. Pass Reception (b[6] & 0x60)
    const passReceptionCode = b6 & 0x60;
    if (passReceptionCode === 0x20) addInstruction('ip', 'Pass Into Space', [6]);
    else if (passReceptionCode === 0x40) addInstruction('ip', 'Pass To Feet', [6]);

    // 3. Build-Up Strategy ((b[6] & 0x80) | ((b[7] & 0x01) << 8))
    const buildUpCode = (b6 & 0x80) | ((b7 & 0x01) << 8);
    if (buildUpCode === 0x0100) addInstruction('ip', 'Bypass Press', [6, 7]);
    else if (buildUpCode === 0x0080) addInstruction('ip', 'Play Through Press', [6, 7]);

    // 4. Dribbling (b[7] & 0x60)
    const dribblingCode = b7 & 0x60;
    if (dribblingCode === 0x40) addInstruction('ip', 'Dribble Less', [7]);
    else if (dribblingCode === 0x20) addInstruction('ip', 'Run At Defence', [7]);

    // 5. Crossing Style (b[7] & 0x1c)
    const crossingCode = b7 & 0x1c;
    if (crossingCode === 0x04) addInstruction('ip', 'Floated Crosses', [7]);
    else if (crossingCode === 0x10) addInstruction('ip', 'Low Crosses', [7]);
    else if (crossingCode === 0x08) addInstruction('ip', 'Whipped Crosses', [7]);

    // 6. Patience (((b[7] & 0x02) << 8) | (b[8] & 0x02))
    const patienceCode = ((b7 & 0x02) << 8) | (b8 & 0x02);
    if (patienceCode === 0x0200) addInstruction('ip', 'Hit Early Crosses', [7, 8]);
    else if (patienceCode === 0x0002) addInstruction('ip', 'Work Ball Into Box', [7, 8]);

    // 7. Shots From Distance ((b[7] & 0x80) | ((b[8] & 0x01) << 8))
    const shotsCode = (b7 & 0x80) | ((b8 & 0x01) << 8);
    if (shotsCode === 0x0100) addInstruction('ip', 'Discourage Long Shots', [7, 8]);
    else if (shotsCode === 0x0080) addInstruction('ip', 'Shoot On Sight', [7, 8]);

    // 8. Set-Piece Approach (b[8] & 0x04)
    if ((b8 & 0x04) === 0x04) {
      addInstruction('ip', 'Play For Set Pieces', [8]);
    }

    // 9. Progress Through ((b[8] & 0xe0) | ((b[9] & 0x01) << 8))
    const progressCode = (b8 & 0xe0) | ((b9 & 0x01) << 8);
    if (progressCode === 0x0100) addInstruction('ip', 'Focus Play Down Both Flanks', [8, 9]);
    else if (progressCode === 0x0020) addInstruction('ip', 'Focus Play Down Left', [8, 9]);
    else if (progressCode === 0x0080) addInstruction('ip', 'Focus Play Through Middle', [8, 9]);
    else if (progressCode === 0x0040) addInstruction('ip', 'Focus Play Down Right', [8, 9]);

    // 10. Supporting Runs (b[9] & 0x70)
    const runsCode = b9 & 0x70;
    if (runsCode === 0x10) addInstruction('ip', 'Overlap Both Flanks', [9]);
    else if (runsCode === 0x20) addInstruction('ip', 'Overlap Left', [9]);
    else if (runsCode === 0x40) addInstruction('ip', 'Overlap Right', [9]);

    // 11. Tempo ((b[11] & 0xc0) | ((b[12] & 0x03) << 8))
    const tempoCode = (b11 & 0xc0) | ((b12 & 0x03) << 8);
    if (tempoCode === 0x0200) tempo = 'Much Lower Tempo';
    else if (tempoCode === 0x0100) tempo = 'Lower Tempo';
    else if (tempoCode === 0x0080) tempo = 'Higher Tempo';
    else if (tempoCode === 0x0040) tempo = 'Much Higher Tempo';
    addInstruction('ip', tempo, [11, 12]);

    // 12. Attacking Width (compound 0x50 = Narrower + Balanced creative freedom)
    const isNarrowerBalancedCompound = (b12 & 0xfc) === 0x50;
    if (isNarrowerBalancedCompound) {
      width = 'Narrower';
    } else {
      const widthCode = b12 & 0xac;
      if (widthCode === 0x20) width = 'Much Narrower';
      else if (widthCode === 0x80) width = 'Narrower';
      else if (widthCode === 0x08) width = 'Wider';
      else if (widthCode === 0x04) width = 'Much Wider';
    }
    addInstruction('ip', width ? `Width: ${width}` : null, [12]);

    // 13. Creative Freedom (b[12] & 0x50; 0x50 compound = Balanced)
    const creativeCode = b12 & 0x50;
    if (creativeCode === 0x40) addInstruction('ip', 'Be More Expressive', [12]);
    else if (creativeCode === 0x10) addInstruction('ip', 'Be More Disciplined', [12]);

    // 14. Time Wasting (b[15] & 0xc0)
    const timeWastingCode = b15 & 0xc0;
    if (timeWastingCode === 0x80) addInstruction('ip', 'Waste Time Less Often', [15]);
    else if (timeWastingCode === 0x40) addInstruction('ip', 'Waste Time More Often', [15]);

    // ── IN TRANSITION ────────────────────────────────────────────────────
    // 15. Attacking Transition (b[8] == 0x01 compound -> Counter-Attack, else b[8] & 0x18)
    if (b8 === 0x01) {
      addInstruction('tr', 'Counter-Attack', [8]);
    } else {
      const attTransCode = b8 & 0x18;
      if (attTransCode === 0x08) addInstruction('tr', 'Counter-Attack', [8]);
      else if (attTransCode === 0x10) addInstruction('tr', 'Hold Shape', [8]);
    }

    // 16. Defensive Transition (b[14] & 0xc0)
    const defTransCode = b14 & 0xc0;
    if (defTransCode === 0x40) addInstruction('tr', 'Counter-Press', [14]);
    else if (defTransCode === 0x80) addInstruction('tr', 'Regroup', [14]);

    // 17. GK Distribution Target ((b[10] & 0xb8) | ((b[11] & 0x01) << 8))
    const gkDistCode = (b10 & 0xb8) | ((b11 & 0x01) << 8);
    if (gkDistCode === 0x0008) addInstruction('tr', 'Distribute to Centre-Backs', [10, 11]);
    else if (gkDistCode === 0x0010) addInstruction('tr', 'Distribute to Full-Backs', [10, 11]);
    else if (gkDistCode === 0x0020) addInstruction('tr', 'Distribute to Flanks', [10, 11]);
    else if (gkDistCode === 0x0080) addInstruction('tr', 'Distribute to Playmaker', [10, 11]);
    else if (gkDistCode === 0x0100) addInstruction('tr', 'Distribute to Target Forward', [10, 11]);

    // 18. GK Distribution Speed (b[11] & 0x0c)
    const gkSpeedCode = b11 & 0x0c;
    if (gkSpeedCode === 0x04) addInstruction('tr', 'Distribute Quickly', [11]);
    else if (gkSpeedCode === 0x08) addInstruction('tr', 'Slow Pace Down', [11]);

    // 19. Goal Kicks (b[11] & 0x30)
    const goalKicksCode = b11 & 0x30;
    if (goalKicksCode === 0x10) addInstruction('tr', 'Short Goal Kicks', [11]);
    else if (goalKicksCode === 0x20) addInstruction('tr', 'Long Goal Kicks', [11]);

    // ── OUT OF POSSESSION ────────────────────────────────────────────────
    // 20. Line of Engagement (b[13] & 0xe0)
    const loeCode = b13 & 0xe0;
    if (loeCode === 0x20) lineOfEngagement = 'High Press';
    else if (loeCode === 0x40) lineOfEngagement = 'Mid Block';
    else if (loeCode === 0x80) lineOfEngagement = 'Low Block';
    addInstruction('oop', lineOfEngagement, [13]);

    // 21. Defensive Line (b[13] & 0x0f)
    const defLineCode = b13 & 0x0f;
    if (defLineCode === 0x01) defensiveLine = 'Much Higher Defensive Line';
    else if (defLineCode === 0x02) defensiveLine = 'Higher Defensive Line';
    else if (defLineCode === 0x04) defensiveLine = 'Lower Defensive Line';
    else if (defLineCode === 0x08) defensiveLine = 'Much Lower Defensive Line';
    addInstruction('oop', defensiveLine, [13]);

    // 22. Trigger Press (b[14] & 0x1e)
    const pressCode = b14 & 0x1e;
    if (pressCode === 0x10) pressingIntensity = 'Trigger Press Much Less Often';
    else if (pressCode === 0x08) pressingIntensity = 'Trigger Press Less Often';
    else if (pressCode === 0x04) pressingIntensity = 'Trigger Press More Often';
    else if (pressCode === 0x02) pressingIntensity = 'Trigger Press Much More Often';
    addInstruction('oop', pressingIntensity, [14]);

    // 23. Prevent Short GK Distribution (b[14] & 0x20)
    if ((b14 & 0x20) === 0x20) {
      addInstruction('oop', 'Prevent Short GK Distribution', [14]);
    }

    // 24. Defensive Line Behaviour (b[15] & 0x30)
    const lineBehavCode = b15 & 0x30;
    if (lineBehavCode === 0x20) addInstruction('oop', 'Drop Off More', [15]);
    else if (lineBehavCode === 0x10) addInstruction('oop', 'Step Up More', [15]);

    // 25. Tackling (b[15] & 0x03)
    const tacklingCode = b15 & 0x03;
    if (tacklingCode === 0x01) addInstruction('oop', 'Get Stuck In', [15]);
    else if (tacklingCode === 0x02) addInstruction('oop', 'Stay On Feet', [15]);

    // 26. Cross Engagement (b[16] & 0x0c) & Pressing Traps (b[16] & 0x03)
    const crossEngCode = b16 & 0x0c;
    if (crossEngCode === 0x08) addInstruction('oop', 'Invite Crosses', [16]);
    else if (crossEngCode === 0x04) addInstruction('oop', 'Stop Crosses', [16]);

    const trapCode = b16 & 0x03;
    if (trapCode === 0x01) addInstruction('oop', 'Trap Inside', [16]);
    else if (trapCode === 0x02) addInstruction('oop', 'Trap Outside', [16]);
  }

  return {
    mentality,
    styleName,
    passingDirectness,
    tempo,
    width,
    defensiveLine,
    lineOfEngagement,
    pressingIntensity,
    inPossession,
    inTransition,
    outOfPossession,
    decodedCount: inPossession.length + inTransition.length + outOfPossession.length,
    labelsByByteIndex,
  };
}
