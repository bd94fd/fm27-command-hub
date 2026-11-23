import {
  BinaryForensicsSnapshot,
  BinaryGovernanceProbeWindow,
  BinaryPromiseCandidate,
  DeepTacticRecord,
  GovernanceConfidenceGrade,
  RawTacticSettingUnit,
  TacticSlotAssignment,
} from '../types/fmSave';
import { normalizeTacticPositionToPlannerCode } from './squadPlannerHelper';

export const FM27_DICTIONARY_SCHEMA_VERSION = 1;
export const FM27_DICTIONARY_STORAGE_KEY = 'fm27_binary_dictionary_v1';

export type DictionaryProvenance =
  | 'verified_seed'
  | 'diff_calibrated'
  | 'user_confirmed'
  | 'imported';

export type TeamInstructionPhase = 'in_possession' | 'in_transition' | 'out_of_possession';

export interface RoleDictionaryEntry {
  /** Key format: `${positionBucket}::${phase}::${roleCoreKey}` */
  key: string;
  positionBucket: string;
  phase: 'ip' | 'oop';
  roleBits: string | null;
  trailBits: string | null;
  roleCoreSignature: string | null;
  roleName: string;
  provenance: DictionaryProvenance;
  updatedAtIso: string;
  notes?: string;
}

export interface TeamInstructionByteMapping {
  /** Key format: `ti_${byteIndex}_${value}` (or `ti_${byteIndex}_mask_${bitMask}`) */
  key: string;
  byteIndex: number; // 0..18
  matchType: 'exact_value' | 'bitmask';
  matchValue: number; // exact byte value or bitmask
  phase: TeamInstructionPhase;
  category: string;
  label: string;
  provenance: DictionaryProvenance;
  updatedAtIso: string;
}

export interface StyleCodeMapping {
  styleCode: number;
  styleName: string;
  provenance: DictionaryProvenance;
  updatedAtIso: string;
}

export interface PlayerInstructionUnitMapping {
  /** Key format: `${phase}::${unitSignature}` */
  key: string;
  phase: 'ip' | 'oop';
  unitSignature: string; // e.g. "0b.4.1.0.0"
  label: string;
  provenance: DictionaryProvenance;
  updatedAtIso: string;
}

export type GovernanceTargetField =
  | 'board_confidence'
  | 'supporter_confidence'
  | 'job_security'
  | 'manager_wage_pw';

export type GovernanceValueEncoding =
  | 'u8_percent_0_100'
  | 'u8_grade_0_12'
  | 'u8_scale_0_20'
  | 'u16_le'
  | 'u32_le';

export interface GovernanceOffsetRule {
  id: string;
  targetField: GovernanceTargetField;
  section: string;
  anchorLabel: string;
  /** Byte offset relative to the probe window's start (index into u8Values) */
  relOffset: number;
  encoding: GovernanceValueEncoding;
  provenance: DictionaryProvenance;
  updatedAtIso: string;
  notes?: string;
}

export interface Fm27BinaryDictionary {
  schemaVersion: number;
  fmBuild: string;
  updatedAtIso: string;
  roleMappings: Record<string, RoleDictionaryEntry>;
  teamInstructionMappings: Record<string, TeamInstructionByteMapping>;
  styleCodeMappings: Record<string, StyleCodeMapping>;
  playerInstructionMappings: Record<string, PlayerInstructionUnitMapping>;
  governanceOffsetRules: Record<string, GovernanceOffsetRule>;
}

export interface Fm27TeamInstructionCatalogItem {
  phase: TeamInstructionPhase;
  category: string;
  options: string[];
}

/** Authentic FM27 (Patch 27.1.0) Team Instruction catalog for Calibration Lab dropdowns. */
export const FM27_TEAM_INSTRUCTION_CATALOG: Fm27TeamInstructionCatalogItem[] = [
  // In Possession
  {
    phase: 'in_possession',
    category: 'Passing Directness',
    options: [
      'Much Shorter Passing',
      'Shorter Passing',
      'Standard Passing',
      'More Direct Passing',
      'Much More Direct Passing',
    ],
  },
  {
    phase: 'in_possession',
    category: 'Tempo',
    options: [
      'Much Lower Tempo',
      'Lower Tempo',
      'Standard Tempo',
      'Higher Tempo',
      'Much Higher Tempo',
    ],
  },
  {
    phase: 'in_possession',
    category: 'Attacking Width',
    options: ['Fairly Narrow', 'Standard Width', 'Fairly Wide', 'Wide'],
  },
  {
    phase: 'in_possession',
    category: 'Build-Up',
    options: [
      'Play Out of Defence',
      'Pass Into Space',
      'Focus Play Through the Middle',
      'Focus Play Down the Left',
      'Focus Play Down the Right',
      'Overlap Left',
      'Overlap Right',
      'Underlap Left',
      'Underlap Right',
    ],
  },
  {
    phase: 'in_possession',
    category: 'Final Third',
    options: [
      'Work Ball Into Box',
      'Hit Early Crosses',
      'Low Crosses',
      'Whipped Crosses',
      'Floated Crosses',
      'Shoot On Sight',
      'Run At Defence',
      'Be More Expressive',
      'Be More Disciplined',
      'Time Wasting',
    ],
  },
  // In Transition
  {
    phase: 'in_transition',
    category: 'When Possession Lost',
    options: ['Counter-Press', 'Regroup'],
  },
  {
    phase: 'in_transition',
    category: 'When Possession Won',
    options: ['Counter-Attack', 'Hold Shape'],
  },
  {
    phase: 'in_transition',
    category: 'GK Distribution',
    options: [
      'Distribute Quickly',
      'Slow Pace Down',
      'Roll It Out',
      'Take Short Kicks',
      'Distribute to Centre-Backs',
      'Distribute to Full-Backs',
      'Distribute to Playmaker',
      'Distribute Over Opposition Defence',
    ],
  },
  // Out of Possession
  {
    phase: 'out_of_possession',
    category: 'Line of Engagement',
    options: ['High Press', 'Mid Block', 'Low Block'],
  },
  {
    phase: 'out_of_possession',
    category: 'Defensive Line',
    options: [
      'Much Higher Defensive Line',
      'Higher Defensive Line',
      'Standard Defensive Line',
      'Lower Defensive Line',
    ],
  },
  {
    phase: 'out_of_possession',
    category: 'Trigger Press',
    options: [
      'Much Less Often',
      'Less Often',
      'Standard Pressing',
      'More Often',
      'Much More Often',
    ],
  },
  {
    phase: 'out_of_possession',
    category: 'Pressing & Defending',
    options: [
      'Step Up More',
      'Drop Off More',
      'Prevent Short GK Distribution',
      'Trap Outside',
      'Trap Inside',
      'Get Stuck In',
      'Stay On Feet',
      'Stop Crosses',
      'Invite Crosses',
    ],
  },
];

/** Authentic FM27 Preset Tactical Styles */
export const FM27_PRESET_STYLES: string[] = [
  'Gegenpress',
  'Control Possession',
  'Tiki-Taka',
  'Vertical Tiki-Taka',
  'Fluid Counter-Attack',
  'Direct Counter-Attack',
  'Wing Play',
  'Route One',
  'Catenaccio',
  'Park The Bus',
  'Custom',
];

/** Authentic FM27 Player Instructions for Calibration Lab dropdowns */
export const FM27_PLAYER_INSTRUCTION_CATALOG: Record<'ip' | 'oop', string[]> = {
  ip: [
    'Take More Risks',
    'Take Fewer Risks',
    'More Direct Passes',
    'Shorter Passing',
    'Dribble More',
    'Dribble Less',
    'Shoot More Often',
    'Shoot Less Often',
    'Cross More Often',
    'Cross Less Often',
    'Cross From Byline',
    'Cross From Deep',
    'Cross Aim Near Post',
    'Cross Aim Far Post',
    'Cross Aim Centre',
    'Hold Up Ball',
    'Pass It Shorter',
    'Get Further Forward',
    'Hold Position',
    'Stay Wider',
    'Sit Narrower',
    'Cut Inside With Ball',
    'Move Into Channels',
    'Roam From Position',
    'Run Wide With Ball',
    'Distribute Quickly',
    'Slow Pace Down',
    'Roll It Out',
    'Take Fewer Risks (GK)',
  ],
  oop: [
    'Tackle Harder',
    'Ease Off Tackles',
    'Mark Tighter',
    'Trigger Press More Often',
    'Trigger Press Less Often',
    'Close Down More',
    'Close Down Less',
    'Stay Wider OOP',
    'Sit Narrower OOP',
    'Track Back More',
    'Hold Defensive Shape',
    'Step Up Onto Ball Carrier',
  ],
};

const GRADE_SCALE_0_12 = ['F', 'E', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];

export function scoreToFm27LetterGrade(score: number): string {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 92) return 'A+';
  if (s >= 84) return 'A';
  if (s >= 78) return 'A-';
  if (s >= 72) return 'B+';
  if (s >= 65) return 'B';
  if (s >= 58) return 'B-';
  if (s >= 50) return 'C+';
  if (s >= 42) return 'C';
  if (s >= 35) return 'C-';
  if (s >= 26) return 'D';
  if (s >= 16) return 'E';
  return 'F';
}

export function getCanonicalPositionBucket(positionCode: string | null | undefined): string {
  const code = normalizeTacticPositionToPlannerCode(positionCode);
  if (code === 'GK') return 'GK';
  if (code === 'DC' || code === 'DCR' || code === 'DCL' || code === 'SW') return 'DC';
  if (code === 'DR' || code === 'DL') return 'FB';
  if (code === 'WBR' || code === 'WBL') return 'WB';
  if (code === 'DM' || code === 'DMR' || code === 'DML') return 'DM';
  if (code === 'MC' || code === 'MCR' || code === 'MCL') return 'MC';
  if (code === 'MR' || code === 'ML') return 'WM';
  if (code === 'AMR' || code === 'AML') return 'W';
  if (code === 'AMC' || code === 'AMCR' || code === 'AMCL') return 'AMC';
  if (code === 'STC' || code === 'STCR' || code === 'STCL') return 'ST';
  return 'MC';
}

export function buildRoleCoreKey(params: {
  roleBits?: string | null;
  trailBits?: string | null;
  roleCoreSignature?: string | null;
}): string | null {
  if (params.roleCoreSignature && params.roleCoreSignature.trim()) {
    return params.roleCoreSignature.trim().toLowerCase();
  }
  const parts: string[] = [];
  if (params.roleBits && params.roleBits.trim()) {
    parts.push(`r:${params.roleBits.trim().toLowerCase().replace(/^0x/, '')}`);
  }
  if (params.trailBits && params.trailBits.trim()) {
    parts.push(`t:${params.trailBits.trim().toLowerCase().replace(/^0x/, '')}`);
  }
  return parts.length > 0 ? parts.join('|') : null;
}

export function buildRoleDictionaryKey(params: {
  positionCode: string;
  phase: 'ip' | 'oop';
  roleBits?: string | null;
  trailBits?: string | null;
  roleCoreSignature?: string | null;
}): string | null {
  const coreKey = buildRoleCoreKey(params);
  if (!coreKey) return null;
  const bucket = getCanonicalPositionBucket(params.positionCode);
  return `${bucket}::${params.phase}::${coreKey}`;
}

export function createSeedFm27BinaryDictionary(fmBuild = '27.1.0+2505117'): Fm27BinaryDictionary {
  const now = new Date().toISOString();
  return {
    schemaVersion: FM27_DICTIONARY_SCHEMA_VERSION,
    fmBuild,
    updatedAtIso: now,
    roleMappings: {},
    teamInstructionMappings: {},
    styleCodeMappings: {},
    playerInstructionMappings: {},
    governanceOffsetRules: {},
  };
}

export function loadFm27BinaryDictionary(): Fm27BinaryDictionary {
  const seed = createSeedFm27BinaryDictionary();
  if (typeof window === 'undefined' || !window.localStorage) {
    return seed;
  }
  try {
    const raw = window.localStorage.getItem(FM27_DICTIONARY_STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as Partial<Fm27BinaryDictionary>;
    if (!parsed || typeof parsed !== 'object') return seed;
    return {
      schemaVersion:
        typeof parsed.schemaVersion === 'number'
          ? parsed.schemaVersion
          : FM27_DICTIONARY_SCHEMA_VERSION,
      fmBuild: typeof parsed.fmBuild === 'string' && parsed.fmBuild ? parsed.fmBuild : seed.fmBuild,
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' && parsed.updatedAtIso
          ? parsed.updatedAtIso
          : seed.updatedAtIso,
      roleMappings:
        parsed.roleMappings && typeof parsed.roleMappings === 'object'
          ? { ...seed.roleMappings, ...parsed.roleMappings }
          : seed.roleMappings,
      teamInstructionMappings:
        parsed.teamInstructionMappings && typeof parsed.teamInstructionMappings === 'object'
          ? { ...seed.teamInstructionMappings, ...parsed.teamInstructionMappings }
          : seed.teamInstructionMappings,
      styleCodeMappings:
        parsed.styleCodeMappings && typeof parsed.styleCodeMappings === 'object'
          ? { ...seed.styleCodeMappings, ...parsed.styleCodeMappings }
          : seed.styleCodeMappings,
      playerInstructionMappings:
        parsed.playerInstructionMappings && typeof parsed.playerInstructionMappings === 'object'
          ? { ...seed.playerInstructionMappings, ...parsed.playerInstructionMappings }
          : seed.playerInstructionMappings,
      governanceOffsetRules:
        parsed.governanceOffsetRules && typeof parsed.governanceOffsetRules === 'object'
          ? { ...seed.governanceOffsetRules, ...parsed.governanceOffsetRules }
          : seed.governanceOffsetRules,
    };
  } catch {
    return seed;
  }
}

export function saveFm27BinaryDictionary(dict: Fm27BinaryDictionary): Fm27BinaryDictionary {
  const updated: Fm27BinaryDictionary = {
    ...dict,
    schemaVersion: FM27_DICTIONARY_SCHEMA_VERSION,
    updatedAtIso: new Date().toISOString(),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(FM27_DICTIONARY_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
  }
  return updated;
}

export function resetFm27BinaryDictionary(fmBuild = '27.1.0+2505117'): Fm27BinaryDictionary {
  const seed = createSeedFm27BinaryDictionary(fmBuild);
  return saveFm27BinaryDictionary(seed);
}

// ── Dictionary Mutators (Auto-Learning & Calibration Lab) ────────────────────

export function upsertRoleDictionaryMapping(
  dict: Fm27BinaryDictionary,
  params: {
    positionCode: string;
    phase: 'ip' | 'oop';
    roleBits?: string | null;
    trailBits?: string | null;
    roleCoreSignature?: string | null;
    roleName: string;
    provenance?: DictionaryProvenance;
    notes?: string;
  }
): Fm27BinaryDictionary {
  const key = buildRoleDictionaryKey(params);
  if (!key || !params.roleName.trim()) return dict;
  const bucket = getCanonicalPositionBucket(params.positionCode);
  const entry: RoleDictionaryEntry = {
    key,
    positionBucket: bucket,
    phase: params.phase,
    roleBits: params.roleBits ?? null,
    trailBits: params.trailBits ?? null,
    roleCoreSignature: buildRoleCoreKey(params),
    roleName: params.roleName.trim(),
    provenance: params.provenance ?? 'user_confirmed',
    updatedAtIso: new Date().toISOString(),
    notes: params.notes,
  };
  const next: Fm27BinaryDictionary = {
    ...dict,
    roleMappings: {
      ...dict.roleMappings,
      [key]: entry,
    },
  };
  return saveFm27BinaryDictionary(next);
}

export function upsertTeamInstructionMapping(
  dict: Fm27BinaryDictionary,
  params: {
    byteIndex: number;
    matchType: 'exact_value' | 'bitmask';
    matchValue: number;
    phase: TeamInstructionPhase;
    category: string;
    label: string;
    provenance?: DictionaryProvenance;
  }
): Fm27BinaryDictionary {
  if (!Number.isInteger(params.byteIndex) || params.byteIndex < 0 || params.byteIndex > 18) {
    return dict;
  }
  const key =
    params.matchType === 'bitmask'
      ? `ti_${params.byteIndex}_mask_${params.matchValue}`
      : `ti_${params.byteIndex}_${params.matchValue}`;
  const entry: TeamInstructionByteMapping = {
    key,
    byteIndex: params.byteIndex,
    matchType: params.matchType,
    matchValue: params.matchValue,
    phase: params.phase,
    category: params.category.trim() || 'Instruction',
    label: params.label.trim(),
    provenance: params.provenance ?? 'diff_calibrated',
    updatedAtIso: new Date().toISOString(),
  };
  return saveFm27BinaryDictionary({
    ...dict,
    teamInstructionMappings: {
      ...dict.teamInstructionMappings,
      [key]: entry,
    },
  });
}

export function upsertStyleCodeMapping(
  dict: Fm27BinaryDictionary,
  styleCode: number,
  styleName: string,
  provenance: DictionaryProvenance = 'user_confirmed'
): Fm27BinaryDictionary {
  if (!Number.isFinite(styleCode) || !styleName.trim()) return dict;
  const key = String(Math.trunc(styleCode));
  return saveFm27BinaryDictionary({
    ...dict,
    styleCodeMappings: {
      ...dict.styleCodeMappings,
      [key]: {
        styleCode: Math.trunc(styleCode),
        styleName: styleName.trim(),
        provenance,
        updatedAtIso: new Date().toISOString(),
      },
    },
  });
}

export function upsertPlayerInstructionMapping(
  dict: Fm27BinaryDictionary,
  params: {
    phase: 'ip' | 'oop';
    unitSignature: string;
    label: string;
    provenance?: DictionaryProvenance;
  }
): Fm27BinaryDictionary {
  if (!params.unitSignature.trim() || !params.label.trim()) return dict;
  const key = `${params.phase}::${params.unitSignature.trim().toLowerCase()}`;
  return saveFm27BinaryDictionary({
    ...dict,
    playerInstructionMappings: {
      ...dict.playerInstructionMappings,
      [key]: {
        key,
        phase: params.phase,
        unitSignature: params.unitSignature.trim().toLowerCase(),
        label: params.label.trim(),
        provenance: params.provenance ?? 'diff_calibrated',
        updatedAtIso: new Date().toISOString(),
      },
    },
  });
}

export function upsertGovernanceOffsetRule(
  dict: Fm27BinaryDictionary,
  params: {
    targetField: GovernanceTargetField;
    section: string;
    anchorLabel: string;
    relOffset: number;
    encoding: GovernanceValueEncoding;
    provenance?: DictionaryProvenance;
    notes?: string;
  }
): Fm27BinaryDictionary {
  const id = `${params.targetField}::${params.section}::${params.anchorLabel}::+${params.relOffset}`;
  return saveFm27BinaryDictionary({
    ...dict,
    governanceOffsetRules: {
      ...dict.governanceOffsetRules,
      [id]: {
        id,
        targetField: params.targetField,
        section: params.section,
        anchorLabel: params.anchorLabel,
        relOffset: params.relOffset,
        encoding: params.encoding,
        provenance: params.provenance ?? 'diff_calibrated',
        updatedAtIso: new Date().toISOString(),
        notes: params.notes,
      },
    },
  });
}

export function deleteDictionaryRule(
  dict: Fm27BinaryDictionary,
  table:
    | 'roleMappings'
    | 'teamInstructionMappings'
    | 'styleCodeMappings'
    | 'playerInstructionMappings'
    | 'governanceOffsetRules',
  key: string
): Fm27BinaryDictionary {
  const cloneTable = { ...dict[table] };
  delete (cloneTable as Record<string, unknown>)[key];
  return saveFm27BinaryDictionary({
    ...dict,
    [table]: cloneTable,
  });
}

// ── Deterministic Binary Decoders ────────────────────────────────────────────

export interface DecodedRoleMatch {
  roleName: string;
  matchType: 'exact_core_signature' | 'role_bits_only';
  provenance: DictionaryProvenance;
  confidence: number;
  dictionaryKey: string;
}

/**
 * Decodes a tactic slot's IP or OOP role purely from its decoupled role_bits + trail_bits
 * (unaffected when individual Player Instruction SettingUnits are added or removed).
 */
export function decodeRoleFromDictionary(
  dict: Fm27BinaryDictionary,
  params: {
    positionCode: string;
    phase: 'ip' | 'oop';
    roleBits?: string | null;
    trailBits?: string | null;
    roleCoreSignature?: string | null;
  }
): DecodedRoleMatch | null {
  const exactKey = buildRoleDictionaryKey(params);
  if (exactKey && dict.roleMappings[exactKey]) {
    const hit = dict.roleMappings[exactKey];
    return {
      roleName: hit.roleName,
      matchType: 'exact_core_signature',
      provenance: hit.provenance,
      confidence: 100,
      dictionaryKey: hit.key,
    };
  }

  // Fallback: match by (positionBucket, phase, roleBits) if trailBits differed slightly
  if (params.roleBits) {
    const bucket = getCanonicalPositionBucket(params.positionCode);
    const normBits = params.roleBits.trim().toLowerCase();
    const candidates = Object.values(dict.roleMappings).filter(
      (entry) =>
        entry.positionBucket === bucket &&
        entry.phase === params.phase &&
        entry.roleBits &&
        entry.roleBits.trim().toLowerCase() === normBits
    );
    if (candidates.length === 1) {
      return {
        roleName: candidates[0].roleName,
        matchType: 'role_bits_only',
        provenance: candidates[0].provenance,
        confidence: 97,
        dictionaryKey: candidates[0].key,
      };
    }
  }

  return null;
}

export interface DecodedTeamInstructionsResult {
  styleName: string | null;
  inPossession: string[];
  inTransition: string[];
  outOfPossession: string[];
  decodedByteIndices: number[];
  unmappedByteIndices: number[];
  byteDetails: Array<{
    index: number;
    value: number;
    hex: string;
    decodedLabels: string[];
  }>;
}

export function decodeTeamInstructionsFromDictionary(
  dict: Fm27BinaryDictionary,
  params: {
    rawBytes?: number[] | null;
    styleCode?: number | null;
  }
): DecodedTeamInstructionsResult {
  const rawBytes = Array.isArray(params.rawBytes) ? params.rawBytes : [];
  const inPossession: string[] = [];
  const inTransition: string[] = [];
  const outOfPossession: string[] = [];
  const decodedByteIndices: number[] = [];
  const unmappedByteIndices: number[] = [];
  const byteDetails: DecodedTeamInstructionsResult['byteDetails'] = [];

  const styleHit =
    typeof params.styleCode === 'number'
      ? dict.styleCodeMappings[String(Math.trunc(params.styleCode))]
      : undefined;

  const mappingsByIndex = new Map<number, TeamInstructionByteMapping[]>();
  for (const m of Object.values(dict.teamInstructionMappings)) {
    const arr = mappingsByIndex.get(m.byteIndex) || [];
    arr.push(m);
    mappingsByIndex.set(m.byteIndex, arr);
  }

  for (let i = 0; i < rawBytes.length; i++) {
    const val = rawBytes[i];
    const hex = `0x${(val & 0xff).toString(16).padStart(2, '0')}`;
    const rules = mappingsByIndex.get(i) || [];
    const matchedLabels: string[] = [];

    for (const rule of rules) {
      const matched =
        rule.matchType === 'exact_value'
          ? val === rule.matchValue
          : rule.matchValue > 0 && (val & rule.matchValue) === rule.matchValue;
      if (matched) {
        const display =
          rule.category && !rule.label.toLowerCase().includes(rule.category.toLowerCase())
            ? `${rule.category}: ${rule.label}`
            : rule.label;
        if (!matchedLabels.includes(display)) {
          matchedLabels.push(display);
        }
        const target =
          rule.phase === 'in_possession'
            ? inPossession
            : rule.phase === 'in_transition'
              ? inTransition
              : outOfPossession;
        if (!target.includes(display)) {
          target.push(display);
        }
      }
    }

    if (matchedLabels.length > 0) {
      decodedByteIndices.push(i);
    } else if (val !== 0) {
      unmappedByteIndices.push(i);
    }

    byteDetails.push({
      index: i,
      value: val,
      hex,
      decodedLabels: matchedLabels,
    });
  }

  return {
    styleName: styleHit?.styleName ?? null,
    inPossession,
    inTransition,
    outOfPossession,
    decodedByteIndices,
    unmappedByteIndices,
    byteDetails,
  };
}

export interface DecodedPlayerInstructionsResult {
  decodedLabels: string[];
  unmappedUnits: RawTacticSettingUnit[];
}

export function decodePlayerInstructionsFromDictionary(
  dict: Fm27BinaryDictionary,
  units: RawTacticSettingUnit[] | null | undefined,
  phase: 'ip' | 'oop'
): DecodedPlayerInstructionsResult {
  if (!Array.isArray(units) || units.length === 0) {
    return { decodedLabels: [], unmappedUnits: [] };
  }
  const decodedLabels: string[] = [];
  const unmappedUnits: RawTacticSettingUnit[] = [];

  for (const u of units) {
    const sig = (u.signature || '').trim().toLowerCase();
    const key = `${phase}::${sig}`;
    const hit = dict.playerInstructionMappings[key];
    if (hit) {
      if (!decodedLabels.includes(hit.label)) {
        decodedLabels.push(hit.label);
      }
    } else {
      unmappedUnits.push(u);
    }
  }

  return { decodedLabels, unmappedUnits };
}

export interface DecodedGovernanceFromDictionary {
  boardConfidence: GovernanceConfidenceGrade | null;
  supporterConfidence: GovernanceConfidenceGrade | null;
  jobSecurity: string | null;
  managerWagePw: number | null;
  appliedRuleIds: string[];
}

function readProbeValue(
  probe: BinaryGovernanceProbeWindow,
  relOffset: number,
  encoding: GovernanceValueEncoding
): number | null {
  const bytes = probe.u8Values;
  if (!Array.isArray(bytes) || relOffset < 0 || relOffset >= bytes.length) return null;
  if (encoding === 'u8_percent_0_100' || encoding === 'u8_grade_0_12' || encoding === 'u8_scale_0_20') {
    return bytes[relOffset];
  }
  if (encoding === 'u16_le') {
    if (relOffset + 1 >= bytes.length) return null;
    return bytes[relOffset] | (bytes[relOffset + 1] << 8);
  }
  if (encoding === 'u32_le') {
    if (relOffset + 3 >= bytes.length) return null;
    return (
      (bytes[relOffset] |
        (bytes[relOffset + 1] << 8) |
        (bytes[relOffset + 2] << 16) |
        (bytes[relOffset + 3] << 24)) >>>
      0
    );
  }
  return null;
}

function formatGovernanceRatingFromValue(
  rawVal: number,
  encoding: GovernanceValueEncoding,
  ruleId: string
): GovernanceConfidenceGrade | null {
  if (encoding === 'u8_percent_0_100') {
    if (rawVal < 0 || rawVal > 100) return null;
    return {
      available: true,
      grade: scoreToFm27LetterGrade(rawVal),
      score: rawVal,
      summary: `Decoded from .fm binary (${rawVal}/100)`,
      sourceNote: `Binary rule ${ruleId}`,
    };
  }
  if (encoding === 'u8_scale_0_20') {
    if (rawVal < 0 || rawVal > 20) return null;
    const pct = Math.round((rawVal / 20) * 100);
    return {
      available: true,
      grade: scoreToFm27LetterGrade(pct),
      score: pct,
      summary: `Decoded from .fm binary (${rawVal}/20)`,
      sourceNote: `Binary rule ${ruleId}`,
    };
  }
  if (encoding === 'u8_grade_0_12') {
    if (rawVal < 0 || rawVal >= GRADE_SCALE_0_12.length) return null;
    const grade = GRADE_SCALE_0_12[rawVal];
    const pct = Math.round((rawVal / (GRADE_SCALE_0_12.length - 1)) * 100);
    return {
      available: true,
      grade,
      score: pct,
      summary: `Decoded from .fm binary (Grade ${grade})`,
      sourceNote: `Binary rule ${ruleId}`,
    };
  }
  return null;
}

export function decodeGovernanceFromDictionary(
  dict: Fm27BinaryDictionary,
  forensics: BinaryForensicsSnapshot | null | undefined
): DecodedGovernanceFromDictionary {
  const result: DecodedGovernanceFromDictionary = {
    boardConfidence: null,
    supporterConfidence: null,
    jobSecurity: null,
    managerWagePw: null,
    appliedRuleIds: [],
  };

  if (!forensics || !Array.isArray(forensics.governanceProbes) || forensics.governanceProbes.length === 0) {
    return result;
  }

  const probesByAnchor = new Map<string, BinaryGovernanceProbeWindow>();
  for (const probe of forensics.governanceProbes) {
    const key = `${probe.section}::${probe.anchorLabel}`;
    if (!probesByAnchor.has(key)) {
      probesByAnchor.set(key, probe);
    }
  }

  for (const rule of Object.values(dict.governanceOffsetRules)) {
    const probe = probesByAnchor.get(`${rule.section}::${rule.anchorLabel}`);
    if (!probe) continue;
    const val = readProbeValue(probe, rule.relOffset, rule.encoding);
    if (val === null) continue;

    if (rule.targetField === 'board_confidence' && !result.boardConfidence) {
      const gradeObj = formatGovernanceRatingFromValue(val, rule.encoding, rule.id);
      if (gradeObj) {
        result.boardConfidence = gradeObj;
        result.appliedRuleIds.push(rule.id);
      }
    } else if (rule.targetField === 'supporter_confidence' && !result.supporterConfidence) {
      const gradeObj = formatGovernanceRatingFromValue(val, rule.encoding, rule.id);
      if (gradeObj) {
        result.supporterConfidence = gradeObj;
        result.appliedRuleIds.push(rule.id);
      }
    } else if (rule.targetField === 'job_security' && !result.jobSecurity) {
      const pct =
        rule.encoding === 'u8_scale_0_20'
          ? Math.round((val / 20) * 100)
          : Math.min(100, Math.max(0, val));
      const label =
        pct >= 80
          ? 'Untouchable'
          : pct >= 65
            ? 'Very Secure'
            : pct >= 50
              ? 'Secure'
              : pct >= 35
                ? 'Stable'
                : 'Insecure';
      result.jobSecurity = `${label} (${pct}%)`;
      result.appliedRuleIds.push(rule.id);
    } else if (rule.targetField === 'manager_wage_pw' && result.managerWagePw === null) {
      if (val > 0 && val <= 500_000) {
        result.managerWagePw = val;
        result.appliedRuleIds.push(rule.id);
      }
    }
  }

  return result;
}

// ── Pure .fm-to-.fm Binary Diff Engine ───────────────────────────────────────

export interface CompactBinaryDiffSnapshot {
  label: string;
  inGameDate: string;
  fmBuild?: string;
  tactics: DeepTacticRecord[];
  binaryForensics?: BinaryForensicsSnapshot | null;
}

export interface RoleBitDiffItem {
  tacticIndex: number;
  tacticName: string;
  slotIndex: number;
  position: string;
  playerName: string | null;
  phase: 'ip' | 'oop';
  beforeRoleBits: string | null;
  afterRoleBits: string | null;
  beforeTrailBits: string | null;
  afterTrailBits: string | null;
  beforeCoreSig: string | null;
  afterCoreSig: string | null;
  addedUnits: RawTacticSettingUnit[];
  removedUnits: RawTacticSettingUnit[];
}

export interface SettingUnitDiffItem {
  tacticIndex: number;
  slotIndex: number;
  position: string;
  playerName: string | null;
  phase: 'ip' | 'oop';
  change: 'added' | 'removed';
  unit: RawTacticSettingUnit;
  roleBitsChanged: boolean;
}

export interface TeamInstructionByteDiffItem {
  tacticIndex: number;
  tacticName: string;
  byteIndex: number;
  beforeVal: number;
  afterVal: number;
  beforeHex: string;
  afterHex: string;
  xorMask: number;
  xorHex: string;
}

export interface GovernanceByteDiffItem {
  section: string;
  anchorLabel: string;
  relOffset: number;
  beforeU8: number;
  afterU8: number;
  delta: number;
  plausibleRatingCandidate: boolean;
  plausibleGradeCandidate: boolean;
}

export interface FmBinaryDiffReport {
  fromLabel: string;
  toLabel: string;
  styleCodeChanges: Array<{
    tacticIndex: number;
    tacticName: string;
    beforeCode: number | null;
    afterCode: number | null;
  }>;
  roleBitDiffs: RoleBitDiffItem[];
  settingUnitDiffs: SettingUnitDiffItem[];
  teamInstructionByteDiffs: TeamInstructionByteDiffItem[];
  governanceByteDiffs: GovernanceByteDiffItem[];
  newPromiseCandidates: BinaryPromiseCandidate[];
  resolvedPromiseCandidates: BinaryPromiseCandidate[];
}

export function computeFmBinaryDiff(
  saveA: CompactBinaryDiffSnapshot,
  saveB: CompactBinaryDiffSnapshot
): FmBinaryDiffReport {
  const styleCodeChanges: FmBinaryDiffReport['styleCodeChanges'] = [];
  const roleBitDiffs: RoleBitDiffItem[] = [];
  const settingUnitDiffs: SettingUnitDiffItem[] = [];
  const teamInstructionByteDiffs: TeamInstructionByteDiffItem[] = [];
  const governanceByteDiffs: GovernanceByteDiffItem[] = [];

  const maxTactics = Math.max(saveA.tactics?.length || 0, saveB.tactics?.length || 0);
  for (let ti = 0; ti < maxTactics; ti++) {
    const tacA = saveA.tactics?.[ti];
    const tacB = saveB.tactics?.[ti];
    if (!tacA || !tacB) continue;
    const tName = tacB.name || tacA.name || `Tactic ${ti + 1}`;

    const scA = tacA.teamInstructions?.styleCode ?? null;
    const scB = tacB.teamInstructions?.styleCode ?? null;
    if (scA !== scB) {
      styleCodeChanges.push({
        tacticIndex: ti,
        tacticName: tName,
        beforeCode: scA,
        afterCode: scB,
      });
    }

    const bytesA = tacA.teamInstructions?.rawTeamInstructionBytes || [];
    const bytesB = tacB.teamInstructions?.rawTeamInstructionBytes || [];
    const maxBytes = Math.min(bytesA.length, bytesB.length);
    for (let bIdx = 0; bIdx < maxBytes; bIdx++) {
      if (bytesA[bIdx] !== bytesB[bIdx]) {
        const xor = (bytesA[bIdx] ^ bytesB[bIdx]) & 0xff;
        teamInstructionByteDiffs.push({
          tacticIndex: ti,
          tacticName: tName,
          byteIndex: bIdx,
          beforeVal: bytesA[bIdx],
          afterVal: bytesB[bIdx],
          beforeHex: `0x${(bytesA[bIdx] & 0xff).toString(16).padStart(2, '0')}`,
          afterHex: `0x${(bytesB[bIdx] & 0xff).toString(16).padStart(2, '0')}`,
          xorMask: xor,
          xorHex: `0x${xor.toString(16).padStart(2, '0')}`,
        });
      }
    }

    const slotsA = tacA.slots || [];
    const slotsB = tacB.slots || [];
    const maxSlots = Math.min(slotsA.length, slotsB.length);
    for (let sIdx = 0; sIdx < maxSlots; sIdx++) {
      const slA: TacticSlotAssignment = slotsA[sIdx];
      const slB: TacticSlotAssignment = slotsB[sIdx];

      for (const phase of ['ip', 'oop'] as const) {
        const beforeRb = phase === 'ip' ? (slA.ipRoleBits ?? null) : (slA.oopRoleBits ?? null);
        const afterRb = phase === 'ip' ? (slB.ipRoleBits ?? null) : (slB.oopRoleBits ?? null);
        const beforeTb = phase === 'ip' ? (slA.ipTrailBits ?? null) : (slA.oopTrailBits ?? null);
        const afterTb = phase === 'ip' ? (slB.ipTrailBits ?? null) : (slB.oopTrailBits ?? null);
        const beforeCore = buildRoleCoreKey({
          roleBits: beforeRb,
          trailBits: beforeTb,
          roleCoreSignature: phase === 'ip' ? slA.ipRoleCoreSignature : slA.oopRoleCoreSignature,
        });
        const afterCore = buildRoleCoreKey({
          roleBits: afterRb,
          trailBits: afterTb,
          roleCoreSignature: phase === 'ip' ? slB.ipRoleCoreSignature : slB.oopRoleCoreSignature,
        });

        const unitsA = (phase === 'ip' ? slA.ipSettingUnits : slA.oopSettingUnits) || [];
        const unitsB = (phase === 'ip' ? slB.ipSettingUnits : slB.oopSettingUnits) || [];
        const sigSetA = new Set(unitsA.map((u) => u.signature));
        const sigSetB = new Set(unitsB.map((u) => u.signature));
        const addedUnits = unitsB.filter((u) => !sigSetA.has(u.signature));
        const removedUnits = unitsA.filter((u) => !sigSetB.has(u.signature));

        const pos =
          phase === 'ip'
            ? slB.position || slA.position
            : slB.outOfPossessionPosition || slB.position || slA.position;
        const roleBitsChanged = beforeCore !== afterCore;

        if (roleBitsChanged) {
          roleBitDiffs.push({
            tacticIndex: ti,
            tacticName: tName,
            slotIndex: sIdx,
            position: pos,
            playerName: slB.playerName || slA.playerName || null,
            phase,
            beforeRoleBits: beforeRb,
            afterRoleBits: afterRb,
            beforeTrailBits: beforeTb,
            afterTrailBits: afterTb,
            beforeCoreSig: beforeCore,
            afterCoreSig: afterCore,
            addedUnits,
            removedUnits,
          });
        }

        for (const u of addedUnits) {
          settingUnitDiffs.push({
            tacticIndex: ti,
            slotIndex: sIdx,
            position: pos,
            playerName: slB.playerName || slA.playerName || null,
            phase,
            change: 'added',
            unit: u,
            roleBitsChanged,
          });
        }
        for (const u of removedUnits) {
          settingUnitDiffs.push({
            tacticIndex: ti,
            slotIndex: sIdx,
            position: pos,
            playerName: slB.playerName || slA.playerName || null,
            phase,
            change: 'removed',
            unit: u,
            roleBitsChanged,
          });
        }
      }
    }
  }

  // Align governance probe windows by (section, anchorLabel)
  const probesA = saveA.binaryForensics?.governanceProbes || [];
  const probesB = saveB.binaryForensics?.governanceProbes || [];
  const mapA = new Map<string, BinaryGovernanceProbeWindow>();
  for (const p of probesA) {
    const k = `${p.section}::${p.anchorLabel}`;
    if (!mapA.has(k)) mapA.set(k, p);
  }
  for (const pB of probesB) {
    const pA = mapA.get(`${pB.section}::${pB.anchorLabel}`);
    if (!pA) continue;
    const len = Math.min(pA.u8Values?.length || 0, pB.u8Values?.length || 0);
    for (let off = 0; off < len; off++) {
      const aVal = pA.u8Values[off];
      const bVal = pB.u8Values[off];
      if (aVal !== bVal) {
        const delta = bVal - aVal;
        const plausibleRating =
          aVal >= 10 && aVal <= 100 && bVal >= 10 && bVal <= 100 && Math.abs(delta) <= 25;
        const plausibleGrade =
          aVal >= 0 && aVal <= 13 && bVal >= 0 && bVal <= 13 && Math.abs(delta) <= 4;
        governanceByteDiffs.push({
          section: pB.section,
          anchorLabel: pB.anchorLabel,
          relOffset: off,
          beforeU8: aVal,
          afterU8: bVal,
          delta,
          plausibleRatingCandidate: plausibleRating,
          plausibleGradeCandidate: plausibleGrade,
        });
      }
    }
  }
  governanceByteDiffs.sort((x, y) => {
    const scoreX = (x.plausibleRatingCandidate ? 2 : 0) + (x.plausibleGradeCandidate ? 1 : 0);
    const scoreY = (y.plausibleRatingCandidate ? 2 : 0) + (y.plausibleGradeCandidate ? 1 : 0);
    return scoreY - scoreX || Math.abs(x.delta) - Math.abs(y.delta);
  });

  // Promise candidate deltas
  const promA = saveA.binaryForensics?.promiseCandidates || [];
  const promB = saveB.binaryForensics?.promiseCandidates || [];
  const promKey = (p: BinaryPromiseCandidate) =>
    `${p.section}::${p.playerUid ?? 'club'}::${p.dueDateDmy ?? 'nodate'}::${p.typeCode ?? 'x'}`;
  const setA = new Set(promA.map(promKey));
  const setB = new Set(promB.map(promKey));
  const newPromiseCandidates = promB.filter((p) => !setA.has(promKey(p)));
  const resolvedPromiseCandidates = promA.filter((p) => !setB.has(promKey(p)));

  return {
    fromLabel: saveA.label,
    toLabel: saveB.label,
    styleCodeChanges,
    roleBitDiffs,
    settingUnitDiffs,
    teamInstructionByteDiffs,
    governanceByteDiffs: governanceByteDiffs.slice(0, 80),
    newPromiseCandidates,
    resolvedPromiseCandidates,
  };
}

// ── Shareable JSON Export / Conflict-Safe Merge / Anonymized Probe Export ───

export function exportDictionaryJson(dict: Fm27BinaryDictionary): string {
  return JSON.stringify(dict, null, 2);
}

export interface DictionaryMergePreview {
  valid: boolean;
  error?: string;
  incoming?: Fm27BinaryDictionary;
  stats: {
    newRoles: number;
    newTeamInstructions: number;
    newStyleCodes: number;
    newPlayerInstructions: number;
    newGovernanceRules: number;
    conflicts: number;
    conflictKeys: string[];
  };
}

export function previewDictionaryMerge(
  current: Fm27BinaryDictionary,
  rawJson: string
): DictionaryMergePreview {
  const emptyStats = {
    newRoles: 0,
    newTeamInstructions: 0,
    newStyleCodes: 0,
    newPlayerInstructions: 0,
    newGovernanceRules: 0,
    conflicts: 0,
    conflictKeys: [] as string[],
  };
  try {
    const parsed = JSON.parse(rawJson) as Partial<Fm27BinaryDictionary>;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'JSON root must be an object.', stats: emptyStats };
    }
    if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion < 1) {
      return {
        valid: false,
        error: 'Missing or unsupported schemaVersion. Export a valid FM27 Binary Dictionary JSON.',
        stats: emptyStats,
      };
    }

    const incoming: Fm27BinaryDictionary = {
      schemaVersion: FM27_DICTIONARY_SCHEMA_VERSION,
      fmBuild: typeof parsed.fmBuild === 'string' ? parsed.fmBuild : current.fmBuild,
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
      roleMappings:
        parsed.roleMappings && typeof parsed.roleMappings === 'object' ? parsed.roleMappings : {},
      teamInstructionMappings:
        parsed.teamInstructionMappings && typeof parsed.teamInstructionMappings === 'object'
          ? parsed.teamInstructionMappings
          : {},
      styleCodeMappings:
        parsed.styleCodeMappings && typeof parsed.styleCodeMappings === 'object'
          ? parsed.styleCodeMappings
          : {},
      playerInstructionMappings:
        parsed.playerInstructionMappings && typeof parsed.playerInstructionMappings === 'object'
          ? parsed.playerInstructionMappings
          : {},
      governanceOffsetRules:
        parsed.governanceOffsetRules && typeof parsed.governanceOffsetRules === 'object'
          ? parsed.governanceOffsetRules
          : {},
    };

    const conflictKeys: string[] = [];
    let newRoles = 0;
    for (const [k, v] of Object.entries(incoming.roleMappings)) {
      if (!current.roleMappings[k]) newRoles += 1;
      else if (current.roleMappings[k].roleName !== v.roleName) conflictKeys.push(`role:${k}`);
    }

    let newTeamInstructions = 0;
    for (const [k, v] of Object.entries(incoming.teamInstructionMappings)) {
      if (!current.teamInstructionMappings[k]) newTeamInstructions += 1;
      else if (current.teamInstructionMappings[k].label !== v.label) conflictKeys.push(`ti:${k}`);
    }

    let newStyleCodes = 0;
    for (const [k, v] of Object.entries(incoming.styleCodeMappings)) {
      if (!current.styleCodeMappings[k]) newStyleCodes += 1;
      else if (current.styleCodeMappings[k].styleName !== v.styleName)
        conflictKeys.push(`style:${k}`);
    }

    let newPlayerInstructions = 0;
    for (const [k, v] of Object.entries(incoming.playerInstructionMappings)) {
      if (!current.playerInstructionMappings[k]) newPlayerInstructions += 1;
      else if (current.playerInstructionMappings[k].label !== v.label) conflictKeys.push(`pi:${k}`);
    }

    let newGovernanceRules = 0;
    for (const [k, v] of Object.entries(incoming.governanceOffsetRules)) {
      if (!current.governanceOffsetRules[k]) newGovernanceRules += 1;
      else if (
        current.governanceOffsetRules[k].relOffset !== v.relOffset ||
        current.governanceOffsetRules[k].encoding !== v.encoding
      ) {
        conflictKeys.push(`gov:${k}`);
      }
    }

    return {
      valid: true,
      incoming,
      stats: {
        newRoles,
        newTeamInstructions,
        newStyleCodes,
        newPlayerInstructions,
        newGovernanceRules,
        conflicts: conflictKeys.length,
        conflictKeys,
      },
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid JSON format.',
      stats: emptyStats,
    };
  }
}

export function applyDictionaryMerge(
  current: Fm27BinaryDictionary,
  incoming: Fm27BinaryDictionary,
  overwriteConflicts = false
): Fm27BinaryDictionary {
  const mergeRecord = <T extends { provenance?: DictionaryProvenance }>(
    base: Record<string, T>,
    inc: Record<string, T>
  ): Record<string, T> => {
    const out: Record<string, T> = { ...base };
    for (const [k, v] of Object.entries(inc)) {
      if (!out[k] || overwriteConflicts) {
        out[k] = {
          ...v,
          provenance: 'imported',
        };
      }
    }
    return out;
  };

  return saveFm27BinaryDictionary({
    schemaVersion: FM27_DICTIONARY_SCHEMA_VERSION,
    fmBuild: current.fmBuild || incoming.fmBuild,
    updatedAtIso: new Date().toISOString(),
    roleMappings: mergeRecord(current.roleMappings, incoming.roleMappings),
    teamInstructionMappings: mergeRecord(
      current.teamInstructionMappings,
      incoming.teamInstructionMappings
    ),
    styleCodeMappings: mergeRecord(current.styleCodeMappings, incoming.styleCodeMappings),
    playerInstructionMappings: mergeRecord(
      current.playerInstructionMappings,
      incoming.playerInstructionMappings
    ),
    governanceOffsetRules: mergeRecord(
      current.governanceOffsetRules,
      incoming.governanceOffsetRules
    ),
  });
}

/**
 * Exports a strictly anonymized structural probe (ZERO club/player/manager names, ZERO CA/PA)
 * for rapid FM27 patch offset analysis.
 */
export function exportAnonymizedProbeSummary(params: {
  fmBuild: string;
  fmsaveVersion?: string;
  tactics: DeepTacticRecord[];
  binaryForensics?: BinaryForensicsSnapshot | null;
}): string {
  const anonymizedTactics = (params.tactics || []).map((t, idx) => ({
    tacticIndex: idx,
    inPossessionFormation: t.inPossessionFormation,
    outOfPossessionFormation: t.outOfPossessionFormation,
    mentality: t.mentality,
    styleName: t.styleName,
    styleCode: t.teamInstructions?.styleCode ?? null,
    rawTeamInstructionBytes: t.teamInstructions?.rawTeamInstructionBytes ?? [],
    slots: (t.slots || []).map((sl) => ({
      slotIndex: sl.slotIndex,
      position: sl.position,
      outOfPossessionPosition: sl.outOfPossessionPosition,
      ipRoleBits: sl.ipRoleBits ?? null,
      ipTrailBits: sl.ipTrailBits ?? null,
      ipRoleCoreSignature: sl.ipRoleCoreSignature ?? null,
      oopRoleBits: sl.oopRoleBits ?? null,
      oopTrailBits: sl.oopTrailBits ?? null,
      oopRoleCoreSignature: sl.oopRoleCoreSignature ?? null,
      ipSettingUnits: sl.ipSettingUnits ?? [],
      oopSettingUnits: sl.oopSettingUnits ?? [],
    })),
  }));

  const anonymizedProbes = (params.binaryForensics?.governanceProbes || []).map((p) => ({
    section: p.section,
    anchorLabel: p.anchorLabel,
    windowLen: p.u8Values?.length ?? 0,
    bytesHex: p.bytesHex,
    candidateDates: p.candidateDates ?? [],
  }));

  return JSON.stringify(
    {
      probeFormatVersion: 1,
      exportedAtIso: new Date().toISOString(),
      fmBuild: params.fmBuild,
      fmsaveVersion: params.fmsaveVersion || 'unknown',
      sections: params.binaryForensics?.sections || [],
      tactics: anonymizedTactics,
      governanceProbes: anonymizedProbes,
      promiseCandidateCount: params.binaryForensics?.promiseCandidates?.length ?? 0,
    },
    null,
    2
  );
}

export function countDictionaryMappings(dict: Fm27BinaryDictionary): {
  roles: number;
  teamInstructions: number;
  styleCodes: number;
  playerInstructions: number;
  governanceRules: number;
  total: number;
} {
  const roles = Object.keys(dict.roleMappings).length;
  const teamInstructions = Object.keys(dict.teamInstructionMappings).length;
  const styleCodes = Object.keys(dict.styleCodeMappings).length;
  const playerInstructions = Object.keys(dict.playerInstructionMappings).length;
  const governanceRules = Object.keys(dict.governanceOffsetRules).length;
  return {
    roles,
    teamInstructions,
    styleCodes,
    playerInstructions,
    governanceRules,
    total: roles + teamInstructions + styleCodes + playerInstructions + governanceRules,
  };
}
