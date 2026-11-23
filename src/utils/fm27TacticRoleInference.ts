import { PlayerRecord } from '../types/fm27';
import { TacticSlotAssignment } from '../types/fmSave';
import { FM27_ROLES, Fm27RoleItem, scorePlayerForFm27Role } from './fm27RoleMatcher';
import { normalizeTacticPositionToPlannerCode } from './squadPlannerHelper';
import {
  decodeRoleFromDictionary,
  Fm27BinaryDictionary,
  loadFm27BinaryDictionary,
  upsertRoleDictionaryMapping,
} from './fm27BinaryDictionary';
import { decodeFm27RoleFromBinary } from './fm27NativeBinaryDecoder';

export type TacticRoleResolutionSource =
  | 'dictionary_decoded'
  | 'save_decoded'
  | 'confirmed'
  | 'fingerprint_matched'
  | 'inferred';

export interface TacticRoleCandidate {
  name: string;
  score: number;
  fitPct: number;
}

export interface ResolvedSlotDualPhaseRoles {
  ipRole: string;
  oopRole: string;
  ipSource: TacticRoleResolutionSource;
  oopSource: TacticRoleResolutionSource;
  ipConfidence: number;
  oopConfidence: number;
  ipReasoning: string;
  oopReasoning: string;
  ipCandidates: TacticRoleCandidate[];
  oopCandidates: TacticRoleCandidate[];
  validIpRoles: string[];
  validOopRoles: string[];
}

export interface StoredTacticRoleOverrides {
  /** Keyed by `${tacticKey}::${slotIndex}` */
  bySlot: Record<string, { ipRole?: string; oopRole?: string }>;
  /** Keyed by `${posBucket}::${phase}::${binaryFingerprint}` */
  byFingerprint: Record<string, string>;
}

const STORAGE_KEY = 'fm27_tactic_role_overrides_v1';

export function buildTacticOverrideKey(tacticName: string, tacticIndex = 0): string {
  const clean = (tacticName || 'tactic').trim().toLowerCase().replace(/\s+/g, '_');
  return `${clean}#${tacticIndex}`;
}

export function loadTacticRoleOverrides(): StoredTacticRoleOverrides {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { bySlot: {}, byFingerprint: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bySlot: {}, byFingerprint: {} };
    const parsed = JSON.parse(raw);
    return {
      bySlot:
        parsed && typeof parsed.bySlot === 'object' && parsed.bySlot !== null
          ? parsed.bySlot
          : {},
      byFingerprint:
        parsed && typeof parsed.byFingerprint === 'object' && parsed.byFingerprint !== null
          ? parsed.byFingerprint
          : {},
    };
  } catch {
    return { bySlot: {}, byFingerprint: {} };
  }
}

export function saveTacticRoleOverride(params: {
  tacticKey: string;
  slotIndex: number;
  phase: 'ip' | 'oop';
  roleName: string;
  positionCode: string;
  binaryFingerprint?: string | null;
  roleBits?: string | null;
  trailBits?: string | null;
  roleCoreSignature?: string | null;
}): StoredTacticRoleOverrides {
  const current = loadTacticRoleOverrides();
  const slotKey = `${params.tacticKey}::${params.slotIndex}`;
  const prev = current.bySlot[slotKey] || {};
  current.bySlot[slotKey] = {
    ...prev,
    ...(params.phase === 'ip' ? { ipRole: params.roleName } : { oopRole: params.roleName }),
  };

  if (params.binaryFingerprint) {
    const bucket = getSlotPositionBucket(params.positionCode);
    const fpKey = `${bucket}::${params.phase}::${params.binaryFingerprint}`;
    current.byFingerprint[fpKey] = params.roleName;
  }

  // Auto-learn decoupled role_bits + trail_bits into the shareable JSON binary dictionary
  if (params.roleBits || params.trailBits || params.roleCoreSignature) {
    const dict = loadFm27BinaryDictionary();
    upsertRoleDictionaryMapping(dict, {
      positionCode: params.positionCode,
      phase: params.phase,
      roleBits: params.roleBits ?? null,
      trailBits: params.trailBits ?? null,
      roleCoreSignature: params.roleCoreSignature ?? null,
      roleName: params.roleName,
      provenance: 'user_confirmed',
    });
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Ignore quota/private-mode errors
    }
  }
  return current;
}

export function clearTacticRoleOverrides(tacticKey?: string): StoredTacticRoleOverrides {
  if (!tacticKey) {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    return { bySlot: {}, byFingerprint: {} };
  }
  const current = loadTacticRoleOverrides();
  const prefix = `${tacticKey}::`;
  for (const k of Object.keys(current.bySlot)) {
    if (k.startsWith(prefix)) {
      delete current.bySlot[k];
    }
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Ignore
    }
  }
  return current;
}

export type SlotPositionBucket =
  | 'GK'
  | 'DC'
  | 'FB'
  | 'WB'
  | 'DM'
  | 'MC'
  | 'WM'
  | 'W'
  | 'AMC'
  | 'ST';

export function getSlotPositionBucket(positionCode: string | null | undefined): SlotPositionBucket {
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

const BUCKET_TO_FM27_GROUP: Record<SlotPositionBucket, string> = {
  GK: 'Goalkeeper',
  DC: 'Centre-Back',
  FB: 'Full-Back / Wing-Back',
  WB: 'Full-Back / Wing-Back',
  DM: 'Defensive Midfielder',
  MC: 'Central Midfielder',
  WM: 'Wide Midfielder / Winger',
  W: 'Wide Midfielder / Winger',
  AMC: 'Attacking Midfielder',
  ST: 'Striker',
};

/**
 * Narrow combined groups (Full-Back/Wing-Back and Wide Midfielder/Winger)
 * to the exact roles valid on that FM27 pitch row (DR/DL vs WBR/WBL, MR/ML vs AMR/AML).
 */
const BUCKET_ROLE_FILTER: Partial<
  Record<SlotPositionBucket, { ip?: ReadonlySet<string>; oop?: ReadonlySet<string> }>
> = {
  FB: {
    ip: new Set([
      'Full-Back',
      'Inside Full-Back',
      'Wing-Back',
      'Inside Wing-Back',
      'Playmaking Wing-Back',
      'Advanced Wing-Back',
    ]),
    oop: new Set(['Holding Full-Back', 'Pressing Full-Back', 'Holding Wing-Back', 'Pressing Wing-Back']),
  },
  WB: {
    ip: new Set(['Wing-Back', 'Inside Wing-Back', 'Playmaking Wing-Back', 'Advanced Wing-Back']),
    oop: new Set(['Holding Wing-Back', 'Pressing Wing-Back']),
  },
  WM: {
    ip: new Set(['Wide Midfielder', 'Winger', 'Inside Winger', 'Playmaking Winger']),
    oop: new Set([
      'Tracking Wide Midfielder',
      'Wide Outlet Wide Midfielder',
      'Tracking Winger',
      'Wide Outlet Winger',
      'Inside Outlet Winger',
    ]),
  },
  W: {
    ip: new Set(['Winger', 'Inside Forward', 'Inside Winger', 'Playmaking Winger', 'Wide Forward']),
    oop: new Set(['Tracking Winger', 'Wide Outlet Winger', 'Inside Outlet Winger']),
  },
};

export function getValidFm27RolesForSlot(
  positionCode: string | null | undefined,
  phase: 'ip' | 'oop'
): Fm27RoleItem[] {
  const bucket = getSlotPositionBucket(positionCode);
  const group = BUCKET_TO_FM27_GROUP[bucket];
  const targetPhase = phase === 'ip' ? 'In Possession' : 'Out of Possession';
  const allInGroup = FM27_ROLES.filter(
    (r) => r.positionGroup === group && r.phase === targetPhase
  );
  const filterSet = BUCKET_ROLE_FILTER[bucket]?.[phase];
  if (!filterSet) return allInGroup;
  const narrowed = allInGroup.filter((r) => filterSet.has(r.name));
  return narrowed.length > 0 ? narrowed : allInGroup;
}

/**
 * Typical FM27 built-in instruction complexity (expected TacticSettingUnit count range)
 * per role, used as a soft signal when binary role_bits aren't yet confirmed.
 */
const ROLE_EXPECTED_SETTING_RANGE: Record<string, [number, number]> = {
  // GK
  'Goalkeeper': [0, 3],
  'No-Nonsense Goalkeeper': [1, 4],
  'Ball-Playing Goalkeeper': [2, 6],
  'Line-Holding Keeper': [0, 2],
  'Sweeper Keeper': [1, 4],
  // DC
  'Centre-Back': [1, 4],
  'No-Nonsense Centre-Back': [2, 5],
  'Ball-Playing Centre-Back': [3, 7],
  'Wide Centre-Back': [3, 7],
  'Overlapping Centre-Back': [4, 8],
  'Advanced Centre-Back': [4, 8],
  'Covering Centre-Back': [1, 4],
  'Stopping Centre-Back': [1, 4],
  // FB / WB
  'Full-Back': [1, 5],
  'Inside Full-Back': [2, 6],
  'Wing-Back': [3, 7],
  'Inside Wing-Back': [3, 7],
  'Playmaking Wing-Back': [4, 8],
  'Advanced Wing-Back': [4, 8],
  'Holding Full-Back': [1, 3],
  'Pressing Full-Back': [2, 5],
  'Holding Wing-Back': [1, 3],
  'Pressing Wing-Back': [2, 5],
  // DM
  'Defensive Midfielder': [2, 6],
  'Deep-Lying Playmaker': [3, 7],
  'Half-Back': [3, 7],
  'Screening Defensive Midfielder': [1, 4],
  'Dropping Defensive Midfielder': [1, 4],
  'Pressing Defensive Midfielder': [2, 5],
  'Wide Covering Defensive Midfielder': [2, 5],
  // MC
  'Central Midfielder': [2, 5],
  'Box-to-Box Midfielder': [3, 7],
  'Channel Midfielder': [4, 8],
  'Midfield Playmaker': [4, 8],
  'Advanced Playmaker': [4, 8],
  'Box-to-Box Playmaker': [4, 8],
  'Wide Central Midfielder': [3, 7],
  'Screening Central Midfielder': [1, 3],
  'Pressing Central Midfielder': [2, 5],
  'Wide Covering Central Midfielder': [2, 5],
  // W / WM
  'Winger': [3, 7],
  'Inside Forward': [4, 8],
  'Inside Winger': [4, 8],
  'Playmaking Winger': [4, 8],
  'Wide Forward': [4, 8],
  'Wide Midfielder': [2, 5],
  'Tracking Winger': [1, 4],
  'Tracking Wide Midfielder': [1, 4],
  'Wide Outlet Winger': [1, 3],
  'Inside Outlet Winger': [1, 3],
  // AMC
  'Attacking Midfielder': [2, 6],
  'Free Role': [4, 8],
  'Second Striker': [4, 8],
  'Tracking Attacking Midfielder': [1, 4],
  'Central Outlet Attacking Midfielder': [1, 3],
  'Splitting Outlet Attacking Midfielder': [1, 3],
  // ST
  'Centre Forward': [2, 5],
  'Poacher': [3, 7],
  'Channel Forward': [4, 8],
  'Deep-Lying Forward': [3, 7],
  'False Nine': [4, 8],
  'Target Forward': [3, 7],
  'Central Outlet Centre Forward': [1, 3],
  'Splitting Outlet Centre Forward': [1, 4],
  'Tracking Centre Forward': [2, 5],
};

/**
 * Tactical style & mentality affinities (bonus points in 0..100 composite score)
 * reflecting authentic FM27 preset & custom style patterns.
 */
function computeStyleMentalityAffinity(
  roleName: string,
  phase: 'ip' | 'oop',
  styleName: string,
  mentality: string
): number {
  const style = (styleName || '').toLowerCase();
  const ment = (mentality || '').toLowerCase();
  const r = roleName.toLowerCase();
  let bonus = 0;

  const isCounter = /counter|direct|route one/i.test(style);
  const isPress = /gegenpress|high press/i.test(style);
  const isPossession = /control|possession|tiki/i.test(style);
  const isWing = /wing play/i.test(style);
  const isDefensiveStyle = /catenaccio|park|defensive|cautious/i.test(style) || /defensive|cautious/i.test(ment);
  const isAttackingMent = /positive|attacking|very attacking/i.test(ment);

  if (phase === 'ip') {
    if (isCounter) {
      if (r === 'channel forward' || r === 'poacher' || r === 'inside forward' || r === 'winger') bonus += 6;
      if (r === 'box-to-box midfielder' || r === 'central midfielder' || r === 'defensive midfielder') bonus += 4;
      if (r === 'wing-back' || r === 'full-back' || r === 'centre-back') bonus += 3;
      if (r === 'false nine' || r === 'playmaking wing-back') bonus -= 4;
    }
    if (isPress) {
      if (r === 'channel forward' || r === 'inside forward' || r === 'box-to-box midfielder' || r === 'wing-back') bonus += 6;
      if (r === 'ball-playing centre-back' || r === 'ball-playing goalkeeper') bonus += 4;
    }
    if (isPossession) {
      if (r.includes('playmaker') || r.includes('ball-playing') || r === 'inside full-back' || r === 'inside wing-back' || r === 'deep-lying forward' || r === 'false nine') bonus += 7;
      if (r.includes('no-nonsense') || r === 'target forward') bonus -= 5;
    }
    if (isWing) {
      if (r === 'winger' || r === 'wing-back' || r === 'advanced wing-back' || r === 'target forward' || r === 'channel midfielder') bonus += 6;
    }
    if (isAttackingMent) {
      if (r === 'wing-back' || r === 'inside forward' || r === 'channel forward' || r === 'channel midfielder' || r === 'box-to-box midfielder') bonus += 2.5;
    }
    if (isDefensiveStyle) {
      if (r === 'full-back' || r === 'centre-back' || r === 'no-nonsense centre-back' || r === 'defensive midfielder' || r === 'no-nonsense goalkeeper') bonus += 4;
      if (r === 'advanced wing-back' || r === 'overlapping centre-back') bonus -= 5;
    }
  } else {
    // Out of Possession
    if (isCounter) {
      if (r === 'central outlet centre forward' || r === 'splitting outlet centre forward') bonus += 7;
      if (r === 'tracking winger' || r === 'screening defensive midfielder' || r === 'holding full-back' || r === 'covering centre-back') bonus += 5;
      if (r === 'pressing central midfielder') bonus += 3;
    }
    if (isPress) {
      if (r.includes('pressing') || r === 'tracking centre forward' || r === 'sweeper keeper' || r === 'stopping centre-back') bonus += 7;
      if (r === 'line-holding keeper' || r === 'dropping defensive midfielder') bonus -= 4;
    }
    if (isPossession) {
      if (r === 'sweeper keeper' || r === 'pressing central midfielder' || r === 'tracking winger' || r === 'screening defensive midfielder') bonus += 5;
    }
    if (isAttackingMent) {
      if (r === 'pressing central midfielder' || r === 'pressing full-back' || r === 'sweeper keeper') bonus += 2;
    }
    if (isDefensiveStyle) {
      if (r.includes('holding') || r.includes('screening') || r.includes('dropping') || r.includes('tracking') || r === 'line-holding keeper') bonus += 5;
      if (r.includes('outlet')) bonus -= 3;
    }
  }

  return bonus;
}

/**
 * Bonus/penalty from IP -> OOP positional shifts (e.g., AMR dropping to MR strongly implies Tracking Winger).
 */
function computeShiftAffinity(
  roleName: string,
  phase: 'ip' | 'oop',
  ipPos: string,
  oopPos: string
): number {
  const ip = normalizeTacticPositionToPlannerCode(ipPos);
  const oop = normalizeTacticPositionToPlannerCode(oopPos);
  if (!ip || !oop || ip === oop) return 0;
  const r = roleName.toLowerCase();

  // Wide forward dropping into midfield line OOP (e.g., AMR->MR, AML->ML)
  if ((ip === 'AMR' || ip === 'AML') && (oop === 'MR' || oop === 'ML')) {
    if (phase === 'oop') {
      if (r.includes('tracking')) return 9;
      if (r.includes('outlet')) return -8;
    }
  }
  // Full-back pushing to wing-back IP (WBR->DR or DR->WBR)
  if ((ip === 'WBR' || ip === 'WBL') && (oop === 'DR' || oop === 'DL')) {
    if (phase === 'ip' && r.includes('wing-back')) return 7;
    if (phase === 'oop' && r.includes('full-back')) return 7;
  }
  // DM dropping into back line or MC dropping to DM OOP
  if ((ip === 'MC' || ip === 'MCR' || ip === 'MCL') && (oop === 'DM' || oop === 'DMR' || oop === 'DML')) {
    if (phase === 'oop' && (r.includes('screening') || r.includes('dropping'))) return 6;
  }
  return 0;
}

function computeSettingCountAffinity(roleName: string, settingCount: number): number {
  if (!Number.isFinite(settingCount) || settingCount <= 0) return 0;
  const range = ROLE_EXPECTED_SETTING_RANGE[roleName];
  if (!range) return 0;
  const [low, high] = range;
  if (settingCount >= low && settingCount <= high) {
    // Reward tight match to the middle of the expected setting complexity band
    const mid = (low + high) / 2;
    const dist = Math.abs(settingCount - mid);
    return Math.max(1, 4 - dist);
  }
  const over = settingCount < low ? low - settingCount : settingCount - high;
  return -Math.min(5, over * 1.5);
}

/**
 * FM27 Patch 27.1.0 built-in tactical tendencies for each role (3 crisp behavioural cues).
 */
const FM27_ROLE_TENDENCIES: Array<[RegExp, string[]]> = [
  [/ball-playing goalkeeper/i, ['Steps out in build-up', 'Plays progressive passes', 'Comfortable under press']],
  [/no-nonsense goalkeeper/i, ['Prioritises safe clearances', 'Low-risk short passes', 'Shot-stopping focus']],
  [/sweeper keeper/i, ['Sweeps behind high line', 'Quick counter distribution', 'Rushes out early']],
  [/line-holding keeper/i, ['Stays close to goal line', 'Conservative claim range', 'Protects shot angles']],
  [/^goalkeeper$/i, ['Standard penalty-area positioning', 'Simple distribution', 'Balanced command']],
  [/ball-playing centre-back/i, ['Carries / passes through lines', 'Initiates vertical build-up', 'Higher passing risk']],
  [/no-nonsense centre-back/i, ['Clears danger immediately', 'Minimal dribbling / risk', 'Pure box defending']],
  [/overlapping centre-back/i, ['Overlaps wide in build-up', 'Creates flank overloads', 'Needs DM rest cover']],
  [/advanced centre-back/i, ['Steps into midfield in IP', 'Adds central build-up body', 'High recovery pace needed']],
  [/wide centre-back/i, ['Splits wide in back 3', 'Supports flank progression', 'Covers wide channels']],
  [/stopping centre-back/i, ['Steps out aggressively', 'Engages striker early', 'Tight front-foot marking']],
  [/covering centre-back/i, ['Drops slightly deeper', 'Sweeps balls in behind', 'Balances stopper partner']],
  [/^centre-back$/i, ['Holds central rest-defence', 'Recycles possession safely', 'Structured box marking']],
  [/holding full-back/i, ['Tucks narrow in rest-defence', 'Aggressive flank press (27.1.0)', 'Limits forward overlaps']],
  [/pressing full-back/i, ['Jumps high onto wide outlets', 'Aggressive touchline press', 'High stamina demand']],
  [/inside full-back/i, ['Tucks into back-3 build-up', 'Protects central transitions', 'Conservative width']],
  [/inside wing-back/i, ['Inverts into midfield half-space', 'Creates central overloads', 'Opens lane for winger']],
  [/playmaking wing-back/i, ['Primary wide playmaker', 'Threads diagonals into box', 'High creative freedom']],
  [/advanced wing-back/i, ['Hugs touchline high up pitch', 'Frequent byline crosses', 'Needs strong rest-defence']],
  [/holding wing-back/i, ['Holds disciplined wide block', 'Prevents overlaps in behind', 'Balanced press height']],
  [/pressing wing-back/i, ['Steps onto opposing full-back', 'High wide counter-press', 'High transition workload']],
  [/^wing-back$/i, ['Provides overlapping width', 'Supports attack & crosses', 'Tracks flank transitions']],
  [/^full-back$/i, ['Balanced flank support', 'Selective overlapping runs', 'Disciplined wide cover']],
  [/deep-lying playmaker/i, ['Dictates build-up tempo', 'Plays line-breaking passes', 'Holds central pocket']],
  [/half-back/i, ['Drops between centre-backs', 'Creates back-3 build-up', 'Frees full-backs forward']],
  [/screening defensive midfielder/i, ['Blocks Zone 14 pass lanes', 'Holds compact central screen', 'Protects back 4']],
  [/dropping defensive midfielder/i, ['Sinks deep toward back line', 'Tracks late box runners', 'Low-block anchor']],
  [/pressing defensive midfielder/i, ['Steps onto ball carriers', 'Disrupts central progression', 'High work-rate press']],
  [/wide covering defensive midfielder/i, ['Shuttles to cover flanks', 'Supports full-back 2v1s', 'Covers wide transitions']],
  [/^defensive midfielder$/i, ['Anchors midfield base', 'Recycles possession cleanly', 'Breaks up counters']],
  [/channel midfielder/i, ['Runs into wide half-spaces', 'Stretches CB–FB gap', 'Arrives high in final third']],
  [/box-to-box playmaker/i, ['Combines shuttling & vision', 'Links deep & final third', 'High creative workload']],
  [/box-to-box midfielder/i, ['Shuttles box to box', 'Late penalty-box arrivals', 'Supports both phases']],
  [/midfield playmaker|advanced playmaker/i, ['Finds pockets between lines', 'Threads final-third passes', 'Higher creative freedom']],
  [/wide central midfielder/i, ['Drifts wide to overload flank', 'Delivers angled crosses', 'Links with winger/FB']],
  [/pressing central midfielder/i, ['Triggers midfield press', 'Closes down aggressively', 'High stamina demand']],
  [/screening central midfielder/i, ['Holds compact central block', 'Blocks vertical lanes', 'Funnels play wide']],
  [/wide covering central midfielder/i, ['Shuttles out to defend flanks', 'Doubles up on opposing wingers', 'Protects attacking FB']],
  [/^central midfielder$/i, ['Balanced link-up & cover', 'Controlled vertical support', 'Flexible midfield hub']],
  [/inside forward/i, ['Cuts inside onto stronger foot', 'Attacks box as 2nd striker', 'Shoots from half-space']],
  [/inside winger/i, ['Drives inside with ball', 'Opens overlap lane for FB', 'Creates diagonal chances']],
  [/playmaking winger/i, ['Comes narrow to dictate', 'Primary wide chance creator', 'Links central runners']],
  [/wide forward/i, ['Stays high & wide in IP', 'Attacks far-post crosses', 'Direct runs in behind']],
  [/wide midfielder/i, ['Measured flank progression', 'Balances crossing & retention', 'Disciplined wide shape']],
  [/tracking winger|tracking wide midfielder/i, ['Tracks overlapping full-backs', 'Prevents 2v1 flank overloads', 'Protects wide channels']],
  [/wide outlet winger|wide outlet wide midfielder/i, ['Holds high touchline position', 'Minimal defensive tracking', 'Immediate counter outlet']],
  [/inside outlet winger/i, ['Stays high in half-space', 'Conserves energy for counters', 'Exploits space behind FB']],
  [/^winger$/i, ['Holds touchline width', 'Beats full-back 1v1', 'Delivers early/byline crosses']],
  [/second striker/i, ['Surges beyond centre-forward', 'Primary box runner from deep', 'High shooting volume']],
  [/free role/i, ['Roams across final third', 'Finds space between lines', 'Maximum creative freedom']],
  [/tracking attacking midfielder/i, ['Drops into midfield block', 'Screens opposition pivot', 'Bridges press & block']],
  [/central outlet attacking midfielder/i, ['Holds central counter pocket', 'Links immediate breaks', 'Conserves pressing energy']],
  [/splitting outlet attacking midfielder/i, ['Splits wide into counter channels', 'Stretches opposing CBs', 'Fast transition target']],
  [/^attacking midfielder$/i, ['Operates in #10 pocket', 'Combines & shoots from edge', 'Links midfield to striker']],
  [/channel forward/i, ['Darts into CB–FB channels', 'Stretches high defensive line', 'Direct runs onto through-balls']],
  [/poacher/i, ['Plays on last defender shoulder', 'Box movement & 1st-time finish', 'Minimal deep link-up']],
  [/deep-lying forward/i, ['Drops between lines to link', 'Brings wide runners into play', 'Holds up central ball']],
  [/false nine/i, ['Drops deep into midfield', 'Drags CBs out of position', 'Playmaking centre-forward']],
  [/target forward/i, ['Aerial hold-up & flick-ons', 'Physical box presence', 'Direct long-ball outlet']],
  [/central outlet centre forward/i, ['Stays high centrally OOP', 'Pins both opposing CBs', 'First counter-attack target']],
  [/splitting outlet centre forward/i, ['Drifts to channel OOP', 'Targets space behind full-backs', 'Direct transition outlet']],
  [/tracking centre forward/i, ['Drops to screen opposition DM', 'Leads coordinated mid/high press', 'High defensive work rate']],
  [/^centre forward$/i, ['Leads line centrally', 'Mixes box presence & runs', 'Balanced striker template']],
];

export function getFm27RoleTendencies(roleName: string | null | undefined): string[] {
  const clean = (roleName || '').trim();
  if (!clean) return [];
  for (const [pattern, tags] of FM27_ROLE_TENDENCIES) {
    if (pattern.test(clean)) return tags;
  }
  return [];
}

/**
 * Works out the most accurate FM27 IP and OOP roles for a single tactic slot
 * using: (1) user confirmation / binary fingerprint learning, (2) save-decoded
 * labels if present, or (3) multi-signal inference across slot position,
 * IP->OOP shift, tactical style/mentality, binary setting count, peer-slot
 * differentiation, and player FM27 attribute fit.
 */
export function resolveSlotDualPhaseRoles(params: {
  slot: TacticSlotAssignment;
  slotIndex: number;
  player?: PlayerRecord | null;
  styleName: string;
  mentality: string;
  tacticKey: string;
  overrides?: StoredTacticRoleOverrides;
  dictionary?: Fm27BinaryDictionary;
  alreadyPickedIpRolesInSameBucket?: string[];
  alreadyPickedOopRolesInSameBucket?: string[];
}): ResolvedSlotDualPhaseRoles {
  const {
    slot,
    slotIndex,
    player = null,
    styleName,
    mentality,
    tacticKey,
    overrides,
    dictionary,
    alreadyPickedIpRolesInSameBucket = [],
    alreadyPickedOopRolesInSameBucket = [],
  } = params;

  const activeDict = dictionary ?? loadFm27BinaryDictionary();

  const ipPos = slot.position || 'MC';
  const oopPos = slot.outOfPossessionPosition || slot.position || 'MC';

  const validIpRoleObjs = getValidFm27RolesForSlot(ipPos, 'ip');
  const validOopRoleObjs = getValidFm27RolesForSlot(oopPos, 'oop');
  const validIpRoles = validIpRoleObjs.map((r) => r.name);
  const validOopRoles = validOopRoleObjs.map((r) => r.name);

  const scoreCandidates = (
    roleObjs: Fm27RoleItem[],
    phase: 'ip' | 'oop',
    settingCount: number,
    alreadyUsed: string[]
  ): TacticRoleCandidate[] => {
    const scored = roleObjs.map((roleObj) => {
      const fitPct = player ? scorePlayerForFm27Role(player, roleObj) : 65;
      const styleBonus = computeStyleMentalityAffinity(roleObj.name, phase, styleName, mentality);
      const shiftBonus = computeShiftAffinity(roleObj.name, phase, ipPos, oopPos);
      const settingBonus = computeSettingCountAffinity(roleObj.name, settingCount);
      // Slight diversity nudger for paired central slots with differing setting counts
      // (e.g., MCR with 7 flags vs MCL with 6 flags) so we don't blindly stamp identical roles
      const duplicatePenalty =
        alreadyUsed.includes(roleObj.name) && phase === 'ip' && settingCount > 0 ? -2.5 : 0;

      const composite = Math.max(
        1,
        Math.min(99, Math.round(fitPct + styleBonus + shiftBonus + settingBonus + duplicatePenalty))
      );
      return {
        name: roleObj.name,
        score: composite,
        fitPct: Math.round(fitPct),
      };
    });
    scored.sort((a, b) => b.score - a.score || b.fitPct - a.fitPct);
    return scored;
  };

  const ipSettingCount = slot.settingCountIp ?? (slot.inPossessionInstructions?.length || 0);
  const oopSettingCount = slot.settingCountOop ?? (slot.outOfPossessionInstructions?.length || 0);

  const ipCandidates = scoreCandidates(
    validIpRoleObjs,
    'ip',
    ipSettingCount,
    alreadyPickedIpRolesInSameBucket
  );
  const oopCandidates = scoreCandidates(
    validOopRoleObjs,
    'oop',
    oopSettingCount,
    alreadyPickedOopRolesInSameBucket
  );

  const slotKey = `${tacticKey}::${slotIndex}`;
  const slotOverride = overrides?.bySlot?.[slotKey];
  const ipBucket = getSlotPositionBucket(ipPos);
  const oopBucket = getSlotPositionBucket(oopPos);
  const ipDictMatch = decodeRoleFromDictionary(activeDict, {
    positionCode: ipPos,
    phase: 'ip',
    roleBits: slot.ipRoleBits,
    trailBits: slot.ipTrailBits,
    roleCoreSignature: slot.ipRoleCoreSignature,
  });
  const oopDictMatch = decodeRoleFromDictionary(activeDict, {
    positionCode: oopPos,
    phase: 'oop',
    roleBits: slot.oopRoleBits,
    trailBits: slot.oopTrailBits,
    roleCoreSignature: slot.oopRoleCoreSignature,
  });
  const ipFpMatch =
    slot.ipBinaryFingerprint && overrides?.byFingerprint
      ? overrides.byFingerprint[`${ipBucket}::ip::${slot.ipBinaryFingerprint}`]
      : undefined;
  const oopFpMatch =
    slot.oopBinaryFingerprint && overrides?.byFingerprint
      ? overrides.byFingerprint[`${oopBucket}::oop::${slot.oopBinaryFingerprint}`]
      : undefined;

  const explicitIp =
    slot.inPossessionRole && slot.inPossessionRole.trim().length > 0
      ? slot.inPossessionRole.trim()
      : null;
  const explicitOop =
    slot.outOfPossessionRole && slot.outOfPossessionRole.trim().length > 0
      ? slot.outOfPossessionRole.trim()
      : null;

  const nativeIpMatch = decodeFm27RoleFromBinary({
    phase: 'ip',
    settingUnits: slot.ipSettingUnits,
    trailBits: slot.ipTrailBits,
    roleBits: slot.ipRoleBits,
  });
  const nativeOopMatch = decodeFm27RoleFromBinary({
    phase: 'oop',
    settingUnits: slot.oopSettingUnits,
    trailBits: slot.oopTrailBits,
    roleBits: slot.oopRoleBits,
  });

  // Resolve IP (User Override -> Custom Binary Dictionary -> Native 64-bit Save Binary / Save Explicit -> Legacy Fingerprint -> Inferred)
  let ipRole: string;
  let ipSource: TacticRoleResolutionSource;
  let ipConfidence: number;
  let ipReasoning: string;

  if (slotOverride?.ipRole) {
    ipRole = slotOverride.ipRole;
    ipSource = 'confirmed';
    ipConfidence = 100;
    ipReasoning = 'Confirmed by you for this tactic slot.';
  } else if (ipDictMatch) {
    ipRole = ipDictMatch.roleName;
    ipSource = 'dictionary_decoded';
    ipConfidence = ipDictMatch.confidence;
    ipReasoning = `Decoded from FM27 Binary Dictionary (${ipDictMatch.dictionaryKey} · decoupled from PI toggles).`;
  } else if (nativeIpMatch) {
    ipRole = nativeIpMatch.roleName;
    ipSource = 'save_decoded';
    ipConfidence = 100;
    ipReasoning = `Auto-decoded directly from .fm 64-bit role bitmask (bit ${nativeIpMatch.bitIndex}).`;
  } else if (explicitIp) {
    ipRole = explicitIp;
    ipSource = 'save_decoded';
    ipConfidence = 100;
    ipReasoning = 'Auto-decoded directly from .fm save file.';
  } else if (ipFpMatch) {
    ipRole = ipFpMatch;
    ipSource = 'fingerprint_matched';
    ipConfidence = 96;
    ipReasoning = `Auto-matched from your calibrated binary role signature (${slot.ipBinaryFingerprint}).`;
  } else {
    const top = ipCandidates[0] || { name: validIpRoles[0] || 'Central Midfielder', score: 70, fitPct: 70 };
    const runner = ipCandidates[1];
    const margin = runner ? Math.max(0, top.score - runner.score) : 12;
    ipRole = top.name;
    ipSource = 'inferred';
    ipConfidence = Math.min(92, Math.max(58, Math.round(64 + margin * 2.1)));
    const bits: string[] = [`${ipPos} slot`];
    if (styleName && styleName !== 'Custom') bits.push(styleName);
    if (ipSettingCount > 0) bits.push(`${ipSettingCount} IP binary flags`);
    if (player) bits.push(`${top.fitPct}% attribute fit`);
    ipReasoning = `Worked out from ${bits.join(' + ')}.`;
  }

  // Resolve OOP
  let oopRole: string;
  let oopSource: TacticRoleResolutionSource;
  let oopConfidence: number;
  let oopReasoning: string;

  if (slotOverride?.oopRole) {
    oopRole = slotOverride.oopRole;
    oopSource = 'confirmed';
    oopConfidence = 100;
    oopReasoning = 'Confirmed by you for this tactic slot.';
  } else if (oopDictMatch) {
    oopRole = oopDictMatch.roleName;
    oopSource = 'dictionary_decoded';
    oopConfidence = oopDictMatch.confidence;
    oopReasoning = `Decoded from FM27 Binary Dictionary (${oopDictMatch.dictionaryKey} · decoupled from PI toggles).`;
  } else if (nativeOopMatch) {
    oopRole = nativeOopMatch.roleName;
    oopSource = 'save_decoded';
    oopConfidence = 100;
    oopReasoning = `Auto-decoded directly from .fm 64-bit OOP role bitmask (bit ${nativeOopMatch.bitIndex}).`;
  } else if (explicitOop) {
    oopRole = explicitOop;
    oopSource = 'save_decoded';
    ipConfidence = Math.max(ipConfidence, 0);
    oopConfidence = 100;
    oopReasoning = 'Auto-decoded directly from .fm save file.';
  } else if (oopFpMatch) {
    oopRole = oopFpMatch;
    oopSource = 'fingerprint_matched';
    oopConfidence = 96;
    oopReasoning = `Auto-matched from your calibrated binary role signature (${slot.oopBinaryFingerprint}).`;
  } else {
    const top = oopCandidates[0] || { name: validOopRoles[0] || 'Screening Central Midfielder', score: 70, fitPct: 70 };
    const runner = oopCandidates[1];
    const margin = runner ? Math.max(0, top.score - runner.score) : 12;
    oopRole = top.name;
    oopSource = 'inferred';
    oopConfidence = Math.min(92, Math.max(58, Math.round(64 + margin * 2.1)));
    const bits: string[] = [];
    if (oopPos !== ipPos) {
      bits.push(`${ipPos}→${oopPos} defensive shift`);
    } else {
      bits.push(`${oopPos} OOP slot`);
    }
    if (styleName && styleName !== 'Custom') bits.push(styleName);
    if (oopSettingCount > 0) bits.push(`${oopSettingCount} OOP binary flags`);
    if (player) bits.push(`${top.fitPct}% attribute fit`);
    oopReasoning = `Worked out from ${bits.join(' + ')}.`;
  }

  return {
    ipRole,
    oopRole,
    ipSource,
    oopSource,
    ipConfidence,
    oopConfidence,
    ipReasoning,
    oopReasoning,
    ipCandidates: ipCandidates.slice(0, 3),
    oopCandidates: oopCandidates.slice(0, 3),
    validIpRoles,
    validOopRoles,
  };
}
