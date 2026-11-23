/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerRecord } from '../types/fm27';
import {
  evaluatePlayerClubDna,
  loadPersistedClubDnaWeights,
} from './clubDnaEngine';

export const FM27_PROGRESSION_ARCHIVE_KEY =
  'fm27_command_hub_progression_archive_v1';
export const MAX_PROGRESSION_SNAPSHOTS = 120;
const PROGRESSION_IDB_NAME = 'fm27_progression_history_db';
const PROGRESSION_IDB_STORE = 'archives';
const PROGRESSION_IDB_KEY = 'default';

/**
 * Clean human-readable labels for all FM27 camelCase player attributes.
 */
const ATTRIBUTE_LABELS: Record<string, string> = {
  // Physical
  acceleration: 'Acceleration',
  agility: 'Agility',
  balance: 'Balance',
  jumpingReach: 'Jumping Reach',
  naturalFitness: 'Natural Fitness',
  pace: 'Pace',
  stamina: 'Stamina',
  strength: 'Strength',
  // Mental
  aggression: 'Aggression',
  anticipation: 'Anticipation',
  bravery: 'Bravery',
  composure: 'Composure',
  concentration: 'Concentration',
  decisions: 'Decisions',
  determination: 'Determination',
  flair: 'Flair',
  leadership: 'Leadership',
  offTheBall: 'Off the Ball',
  positioning: 'Positioning',
  teamwork: 'Teamwork',
  vision: 'Vision',
  workRate: 'Work Rate',
  // Technical (Outfield)
  corners: 'Corners',
  crossing: 'Crossing',
  dribbling: 'Dribbling',
  finishing: 'Finishing',
  firstTouch: 'First Touch',
  freeKicks: 'Free Kicks',
  heading: 'Heading',
  longShots: 'Long Shots',
  longThrows: 'Long Throws',
  marking: 'Marking',
  passing: 'Passing',
  penalties: 'Penalties',
  tackling: 'Tackling',
  technique: 'Technique',
  // Goalkeeping
  aerialReach: 'Aerial Reach',
  commandOfArea: 'Command of Area',
  communication: 'Communication',
  eccentricity: 'Eccentricity',
  handling: 'Handling',
  kicking: 'Kicking',
  oneOnOnes: 'One on Ones',
  punching: 'Punching',
  reflexes: 'Reflexes',
  rushingOut: 'Rushing Out',
  throwing: 'Throwing',
};

const GK_ONLY_ATTRIBUTES = new Set([
  'aerialReach',
  'commandOfArea',
  'communication',
  'eccentricity',
  'handling',
  'kicking',
  'oneOnOnes',
  'punching',
  'reflexes',
  'rushingOut',
  'throwing',
]);

const OUTFIELD_ONLY_NOISE_FOR_GK = new Set([
  'corners',
  'crossing',
  'dribbling',
  'finishing',
  'flair',
  'freeKicks',
  'heading',
  'longShots',
  'longThrows',
  'marking',
  'offTheBall',
  'penalties',
  'tackling',
  'technique',
]);

const UNIVERSAL_KEY_ATTRIBUTES = new Set([
  'pace',
  'acceleration',
  'stamina',
  'determination',
  'decisions',
  'composure',
  'anticipation',
  'workRate',
]);

export function formatAttributeLabel(attrKey: string): string {
  if (ATTRIBUTE_LABELS[attrKey]) return ATTRIBUTE_LABELS[attrKey];
  // Fallback humanizer for any future camelCase or snake_case attribute key
  return attrKey
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function isGoalkeeperPosition(position: string): boolean {
  const upper = (position || '').toUpperCase().trim();
  return upper === 'GK' || /\bGK\b/.test(upper);
}

/**
 * Filters out goalkeeper-only attributes on outfield players and irrelevant
 * outfield-only attributes (finishing, crossing, long throws, etc.) on goalkeepers.
 */
export function isAttributeRelevantForPosition(
  attrKey: string,
  position: string
): boolean {
  const isGk = isGoalkeeperPosition(position);
  if (isGk) {
    return !OUTFIELD_ONLY_NOISE_FOR_GK.has(attrKey);
  }
  return !GK_ONLY_ATTRIBUTES.has(attrKey);
}

/**
 * Flags attributes that meaningfully impact match performance for a given position
 * (physical engine + core mental + position-defining technical/GK skills).
 */
export function isKeyRoleAttribute(attrKey: string, position: string): boolean {
  const pos = (position || '').toUpperCase();
  if (isGoalkeeperPosition(pos)) {
    return (
      attrKey === 'reflexes' ||
      attrKey === 'handling' ||
      attrKey === 'aerialReach' ||
      attrKey === 'oneOnOnes' ||
      attrKey === 'commandOfArea' ||
      attrKey === 'positioning' ||
      attrKey === 'decisions' ||
      attrKey === 'agility' ||
      attrKey === 'kicking' ||
      attrKey === 'concentration' ||
      attrKey === 'determination'
    );
  }
  if (UNIVERSAL_KEY_ATTRIBUTES.has(attrKey)) return true;
  if (/\bST\b|\bSTC\b|\bCF\b/.test(pos)) {
    return (
      attrKey === 'finishing' ||
      attrKey === 'offTheBall' ||
      attrKey === 'firstTouch' ||
      attrKey === 'dribbling' ||
      attrKey === 'jumpingReach' ||
      attrKey === 'strength'
    );
  }
  if (/\bD\s*\([RLC]*C|\bDC\b|\bCB\b/.test(pos)) {
    return (
      attrKey === 'jumpingReach' ||
      attrKey === 'tackling' ||
      attrKey === 'marking' ||
      attrKey === 'positioning' ||
      attrKey === 'strength' ||
      attrKey === 'concentration' ||
      attrKey === 'heading'
    );
  }
  if (/\b(D|WB)\s*\([RL]|\bDL\b|\bDR\b|\bWBL\b|\bWBR\b/.test(pos)) {
    return (
      attrKey === 'tackling' ||
      attrKey === 'marking' ||
      attrKey === 'positioning' ||
      attrKey === 'crossing' ||
      attrKey === 'dribbling' ||
      attrKey === 'passing'
    );
  }
  if (/\bDM\b|\bMC\b|\bCM\b|\bM\s*\(C/.test(pos)) {
    return (
      attrKey === 'passing' ||
      attrKey === 'firstTouch' ||
      attrKey === 'vision' ||
      attrKey === 'tackling' ||
      attrKey === 'positioning' ||
      attrKey === 'technique'
    );
  }
  // Wingers / Attacking Mids
  return (
    attrKey === 'dribbling' ||
    attrKey === 'firstTouch' ||
    attrKey === 'passing' ||
    attrKey === 'crossing' ||
    attrKey === 'offTheBall' ||
    attrKey === 'finishing' ||
    attrKey === 'vision' ||
    attrKey === 'agility'
  );
}

/**
 * Mirrors progression snapshots to IndexedDB (non-blocking) so multi-season
 * journeyman saves are preserved even if mobile localStorage hits quota limits.
 */
export async function saveProgressionArchiveToIdb(
  snapshots: ProgressionSnapshot[]
): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(PROGRESSION_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROGRESSION_IDB_STORE)) {
          db.createObjectStore(PROGRESSION_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(PROGRESSION_IDB_STORE, 'readwrite');
          tx.objectStore(PROGRESSION_IDB_STORE).put(
            snapshots.slice(-MAX_PROGRESSION_SNAPSHOTS),
            PROGRESSION_IDB_KEY
          );
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadProgressionArchiveFromIdb(): Promise<
  ProgressionSnapshot[] | null
> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(PROGRESSION_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROGRESSION_IDB_STORE)) {
          db.createObjectStore(PROGRESSION_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(PROGRESSION_IDB_STORE, 'readonly');
          const getReq = tx
            .objectStore(PROGRESSION_IDB_STORE)
            .get(PROGRESSION_IDB_KEY);
          getReq.onsuccess = () => {
            const val = getReq.result;
            db.close();
            resolve(
              Array.isArray(val) ? (val as ProgressionSnapshot[]) : null
            );
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlayerProgressionSnapshot {
  uid: number;
  name: string;
  position: string;
  age: number;
  abilityStars?: number;
  potentialStars?: number;
  attributes: Record<string, number>;
}

export interface ProgressionSnapshot {
  saveDate: string;
  clubName: string;
  capturedAt: string;
  players: Record<number, PlayerProgressionSnapshot>;
}

export type ProgressionImpactTier = 'major' | 'key' | 'minor';

export interface AttributeDeltaEntry {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  attributeName: string;
  attributeLabel: string;
  isKeyStat: boolean;
  impactTier: ProgressionImpactTier;
  fromValue: number;
  toValue: number;
  delta: number;
}

export interface PlayerProgressionSummary {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  netDelta: number;
  totalRises: number;
  totalFalls: number;
  majorCount: number;
  keyCount: number;
  minorCount: number;
  impactScore: number;
  meaningfulDeltas: AttributeDeltaEntry[];
  minorDeltas: AttributeDeltaEntry[];
  deltas: AttributeDeltaEntry[];
}

export interface YouthIntakeFlag {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  isYouthIntakeHighlight: boolean;
  abilityStars: number;
  potentialStars: number;
  clubDnaFitPct: number;
  bestArchetypeShortLabel: string;
  physicalEngineScore: number;
  determination: number;
  pace: number;
}

export interface ProgressionDiffReport {
  baselineSaveDate: string;
  latestSaveDate: string;
  risers: AttributeDeltaEntry[];
  fallers: AttributeDeltaEntry[];
  majorShiftsCount: number;
  filteredIrrelevantCount: number;
  playerSummaries: PlayerProgressionSummary[];
  mentoringDeterminationJumps: AttributeDeltaEntry[];
  newgenRadar: YouthIntakeFlag[];
  youthIntakeHighlights: YouthIntakeFlag[];
}

function getDefaultStorage(): StorageLike | null {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  if (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  ) {
    return true;
  }
  if (e.code === 22 || e.code === 1014) {
    return true;
  }
  if (
    typeof e.message === 'string' &&
    e.message.toLowerCase().includes('quota')
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts only numeric camelCase attributes (1-20) from a PlayerRecord.
 * Explicitly excludes any raw CA/PA fields.
 */
function extractNumericCamelCaseAttributes(
  attrs: PlayerRecord['attributes'] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!attrs || typeof attrs !== 'object') return out;
  for (const [key, val] of Object.entries(attrs)) {
    if (key.includes('_')) continue;
    const lower = key.toLowerCase();
    if (
      lower === 'ca' ||
      lower === 'pa' ||
      lower === 'currentability' ||
      lower === 'potentialability'
    ) {
      continue;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Computes the FM27 Patch 27.1.0 Physical Engine Score (0-100) from 1-20 attributes.
 */
function computeSnapshotPhysicalEngineScore(
  attrs: Record<string, number>
): number {
  const pace = Number(attrs.pace) || 10;
  const acceleration = Number(attrs.acceleration) || pace;
  const jumpingReach = Number(attrs.jumpingReach) || 10;
  const stamina = Number(attrs.stamina) || 10;
  const raw =
    pace * 1.4 + acceleration * 1.5 + jumpingReach * 1.1 + stamina * 1.0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Estimates relative 1.0-5.0 star ratings from visible 1-20 attributes when an older
 * snapshot did not store abilityStars/potentialStars (strictly zero raw CA/PA).
 */
function estimateStarsFromVisibleAttributes(
  attrs: Record<string, number>,
  age: number
): { abilityStars: number; potentialStars: number } {
  const vals = Object.values(attrs).filter(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 20
  );
  const avg =
    vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 11;
  const rawAbility = Math.min(5, Math.max(1, 1.5 + (avg - 8) * 0.35));
  const abilityStars = Math.round(rawAbility * 2) / 2;
  const youthRoom = age <= 18 ? 1.5 : age <= 21 ? 1.0 : 0.5;
  const potentialStars = Math.min(
    5,
    Math.max(abilityStars, abilityStars + youthRoom)
  );
  return { abilityStars, potentialStars };
}

/**
 * Builds a compact progression snapshot keyed by numeric player `uid`.
 */
export function buildProgressionSnapshot(
  saveDate: string,
  clubName: string,
  players: PlayerRecord[],
  capturedAt: string = new Date().toISOString()
): ProgressionSnapshot {
  const playersByUid: Record<number, PlayerProgressionSnapshot> = {};

  for (const p of players) {
    if (typeof p.uid !== 'number' || !Number.isFinite(p.uid) || p.uid <= 0) {
      continue;
    }
    const abilityStars =
      typeof p.ability === 'number' && Number.isFinite(p.ability)
        ? Math.min(5, Math.max(1, p.ability))
        : undefined;
    const potentialStars =
      typeof p.potential === 'number' && Number.isFinite(p.potential)
        ? Math.min(5, Math.max(abilityStars ?? 1, p.potential))
        : undefined;
    playersByUid[p.uid] = {
      uid: p.uid,
      name: p.name,
      position: p.position,
      age: p.age,
      abilityStars,
      potentialStars,
      attributes: extractNumericCamelCaseAttributes(p.attributes),
    };
  }

  return {
    saveDate: saveDate.trim() || 'Unknown Date',
    clubName: clubName.trim() || 'Managed Club',
    capturedAt,
    players: playersByUid,
  };
}

/**
 * Loads the rolling progression snapshot archive from storage.
 */
export function loadProgressionArchive(
  storage?: StorageLike | null
): ProgressionSnapshot[] {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return [];

  try {
    const raw = store.getItem(FM27_PROGRESSION_ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ProgressionSnapshot =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.saveDate === 'string' &&
        Boolean(item.players) &&
        typeof item.players === 'object'
    );
  } catch {
    return [];
  }
}

/**
 * Persists the rolling progression archive, capping at MAX_PROGRESSION_SNAPSHOTS
 * and automatically pruning oldest entries if `QuotaExceededError` is thrown.
 */
export function saveProgressionArchive(
  archive: ProgressionSnapshot[],
  storage?: StorageLike | null
): { saved: boolean; prunedCount: number; count: number } {
  const store = storage === undefined ? getDefaultStorage() : storage;
  const working = archive.slice(-MAX_PROGRESSION_SNAPSHOTS);
  let prunedCount = Math.max(0, archive.length - working.length);

  if (!store) {
    return { saved: false, prunedCount, count: working.length };
  }

  while (working.length > 0) {
    try {
      store.setItem(FM27_PROGRESSION_ARCHIVE_KEY, JSON.stringify(working));
      return { saved: true, prunedCount, count: working.length };
    } catch (err) {
      if (isQuotaExceededError(err)) {
        working.shift();
        prunedCount += 1;
      } else {
        return { saved: false, prunedCount, count: working.length };
      }
    }
  }

  try {
    store.setItem(FM27_PROGRESSION_ARCHIVE_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
  return { saved: false, prunedCount, count: 0 };
}

/**
 * Captures a new snapshot into the rolling archive, deduplicating by
 * `saveDate` and auto-pruning oldest entries on quota exhaustion.
 */
export function captureProgressionSnapshot(
  saveDate: string,
  clubName: string,
  players: PlayerRecord[],
  storage?: StorageLike | null,
  capturedAt?: string
): {
  archive: ProgressionSnapshot[];
  saved: boolean;
  prunedCount: number;
} {
  const snapshot = buildProgressionSnapshot(
    saveDate,
    clubName,
    players,
    capturedAt
  );
  if (Object.keys(snapshot.players).length === 0) {
    const existing = loadProgressionArchive(storage);
    return { archive: existing, saved: false, prunedCount: 0 };
  }

  const existing = loadProgressionArchive(storage);
  const normalizedDate = snapshot.saveDate.toLowerCase();
  const deduped = existing.filter(
    (entry) => entry.saveDate.trim().toLowerCase() !== normalizedDate
  );
  deduped.push(snapshot);

  const capped = deduped.slice(-MAX_PROGRESSION_SNAPSHOTS);
  const result = saveProgressionArchive(capped, storage);

  const finalArchive =
    result.count < capped.length
      ? capped.slice(capped.length - result.count)
      : capped;

  return {
    archive: finalArchive,
    saved: result.saved,
    prunedCount: result.prunedCount,
  };
}

/**
 * Clears the progression snapshot archive from storage.
 */
export function clearProgressionArchive(storage?: StorageLike | null): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(FM27_PROGRESSION_ARCHIVE_KEY);
  } catch {
    // ignore
  }
}

function tierRank(tier: ProgressionImpactTier): number {
  return tier === 'major' ? 0 : tier === 'key' ? 1 : 2;
}

/**
 * Computes position-filtered, humanized attribute risers/fallers, player-grouped
 * impact summaries, Mentoring Determination Jumps (`delta >= 2`), and Youth Intake /
 * Newgen Radar.
 */
export function computeProgressionDiff(
  baseline: ProgressionSnapshot,
  latest: ProgressionSnapshot
): ProgressionDiffReport {
  const risers: AttributeDeltaEntry[] = [];
  const fallers: AttributeDeltaEntry[] = [];
  const mentoringDeterminationJumps: AttributeDeltaEntry[] = [];
  const playerSummaries: PlayerProgressionSummary[] = [];
  const newgenRadar: YouthIntakeFlag[] = [];
  let filteredIrrelevantCount = 0;
  let majorShiftsCount = 0;

  const baselinePlayers = baseline.players || {};
  const latestPlayers = latest.players || {};
  const dnaWeights = loadPersistedClubDnaWeights();

  for (const latestPlayer of Object.values(latestPlayers)) {
    const uid = latestPlayer.uid;
    const basePlayer = baselinePlayers[uid];

    if (!basePlayer) {
      const dnaEval = evaluatePlayerClubDna(
        latestPlayer.position,
        latestPlayer.attributes as Partial<PlayerRecord['attributes']>,
        dnaWeights
      );
      const physicalEngineScore = computeSnapshotPhysicalEngineScore(
        latestPlayer.attributes
      );
      const estimatedStars = estimateStarsFromVisibleAttributes(
        latestPlayer.attributes,
        latestPlayer.age
      );
      const abilityStars =
        typeof latestPlayer.abilityStars === 'number' &&
        Number.isFinite(latestPlayer.abilityStars)
          ? latestPlayer.abilityStars
          : estimatedStars.abilityStars;
      const potentialStars =
        typeof latestPlayer.potentialStars === 'number' &&
        Number.isFinite(latestPlayer.potentialStars)
          ? Math.max(abilityStars, latestPlayer.potentialStars)
          : estimatedStars.potentialStars;

      newgenRadar.push({
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        isYouthIntakeHighlight: latestPlayer.age <= 18,
        abilityStars,
        potentialStars,
        clubDnaFitPct: dnaEval.overallDnaScore,
        bestArchetypeShortLabel: dnaEval.bestArchetypeShortLabel,
        physicalEngineScore,
        determination: latestPlayer.attributes.determination ?? 0,
        pace: latestPlayer.attributes.pace ?? 0,
      });
      continue;
    }

    const playerDeltas: AttributeDeltaEntry[] = [];
    let totalRises = 0;
    let totalFalls = 0;
    let majorCount = 0;
    let keyCount = 0;
    let minorCount = 0;

    for (const [attrName, toVal] of Object.entries(latestPlayer.attributes)) {
      const fromVal = basePlayer.attributes[attrName];
      if (typeof fromVal !== 'number' || typeof toVal !== 'number') continue;
      const delta = toVal - fromVal;
      if (delta === 0) continue;

      // Filter out irrelevant GK-only stats on outfielders (and outfield-only noise on GKs)
      if (!isAttributeRelevantForPosition(attrName, latestPlayer.position)) {
        filteredIrrelevantCount += 1;
        continue;
      }

      const isKeyStat = isKeyRoleAttribute(attrName, latestPlayer.position);
      const impactTier: ProgressionImpactTier =
        Math.abs(delta) >= 2 ? 'major' : isKeyStat ? 'key' : 'minor';

      if (impactTier === 'major') {
        majorCount += 1;
        majorShiftsCount += 1;
      } else if (impactTier === 'key') {
        keyCount += 1;
      } else {
        minorCount += 1;
      }

      const entry: AttributeDeltaEntry = {
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        attributeName: attrName,
        attributeLabel: formatAttributeLabel(attrName),
        isKeyStat,
        impactTier,
        fromValue: fromVal,
        toValue: toVal,
        delta,
      };

      playerDeltas.push(entry);

      if (delta > 0) {
        risers.push(entry);
        totalRises += delta;
        if (attrName === 'determination' && delta >= 2) {
          mentoringDeterminationJumps.push(entry);
        }
      } else {
        fallers.push(entry);
        totalFalls += Math.abs(delta);
      }
    }

    if (playerDeltas.length > 0) {
      playerDeltas.sort(
        (a, b) =>
          tierRank(a.impactTier) - tierRank(b.impactTier) ||
          Math.abs(b.delta) - Math.abs(a.delta) ||
          b.delta - a.delta ||
          a.attributeLabel.localeCompare(b.attributeLabel)
      );
      const meaningfulDeltas = playerDeltas.filter(
        (d) => d.impactTier === 'major' || d.impactTier === 'key'
      );
      const minorDeltas = playerDeltas.filter((d) => d.impactTier === 'minor');
      // Impact score prioritizes major shifts (|Δ|>=2) first, then key role stats, then total magnitude
      const impactScore =
        majorCount * 10 +
        keyCount * 3 +
        Math.abs(totalRises - totalFalls) +
        minorCount * 0.5;

      playerSummaries.push({
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        netDelta: totalRises - totalFalls,
        totalRises,
        totalFalls,
        majorCount,
        keyCount,
        minorCount,
        impactScore,
        meaningfulDeltas,
        minorDeltas,
        deltas: playerDeltas,
      });
    }
  }

  risers.sort(
    (a, b) =>
      b.delta - a.delta ||
      tierRank(a.impactTier) - tierRank(b.impactTier) ||
      a.playerName.localeCompare(b.playerName)
  );
  fallers.sort(
    (a, b) =>
      a.delta - b.delta ||
      tierRank(a.impactTier) - tierRank(b.impactTier) ||
      a.playerName.localeCompare(b.playerName)
  );
  mentoringDeterminationJumps.sort(
    (a, b) => b.delta - a.delta || a.playerName.localeCompare(b.playerName)
  );
  playerSummaries.sort(
    (a, b) =>
      b.impactScore - a.impactScore ||
      b.netDelta - a.netDelta ||
      a.playerName.localeCompare(b.playerName)
  );
  newgenRadar.sort(
    (a, b) =>
      Number(b.isYouthIntakeHighlight) - Number(a.isYouthIntakeHighlight) ||
      b.potentialStars - a.potentialStars ||
      b.clubDnaFitPct - a.clubDnaFitPct ||
      b.physicalEngineScore - a.physicalEngineScore ||
      b.abilityStars - a.abilityStars ||
      a.age - b.age ||
      a.playerName.localeCompare(b.playerName)
  );

  return {
    baselineSaveDate: baseline.saveDate,
    latestSaveDate: latest.saveDate,
    risers,
    fallers,
    majorShiftsCount,
    filteredIrrelevantCount,
    playerSummaries,
    mentoringDeterminationJumps,
    newgenRadar,
    youthIntakeHighlights: newgenRadar.filter((f) => f.isYouthIntakeHighlight),
  };
}

export interface PlayerProgressionPoint {
  saveDate: string;
  capturedAt: string;
  age: number;
  abilityStars: number | null;
  potentialStars: number | null;
  avgCoreAttr: number;
  netDeltaFromStart: number;
}

/**
 * Builds a chronological progression series for a single player UID across
 * saved snapshots (strictly zero raw CA/PA — uses relative star ratings and
 * visible attribute averages/deltas).
 */
export function buildPlayerProgressionSeries(
  uid: number | undefined,
  archive: ProgressionSnapshot[]
): PlayerProgressionPoint[] {
  if (
    typeof uid !== 'number' ||
    !Number.isFinite(uid) ||
    !Array.isArray(archive)
  ) {
    return [];
  }

  const points: PlayerProgressionPoint[] = [];
  let baselineAttrs: Record<string, number> | null = null;

  for (const snap of archive) {
    const entry = snap.players?.[uid];
    if (!entry) continue;

    const attrs = entry.attributes || {};
    const relevantEntries = Object.entries(attrs).filter(
      ([k, v]) =>
        typeof v === 'number' &&
        Number.isFinite(v) &&
        isAttributeRelevantForPosition(k, entry.position)
    );
    const values = relevantEntries.map(([, v]) => v);
    const avgCoreAttr =
      values.length > 0
        ? Number(
            (values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(2)
          )
        : 0;

    if (!baselineAttrs) {
      baselineAttrs = attrs;
    }

    let netDeltaFromStart = 0;
    for (const [k, v] of relevantEntries) {
      const base = baselineAttrs[k];
      if (typeof v === 'number' && typeof base === 'number') {
        netDeltaFromStart += v - base;
      }
    }

    points.push({
      saveDate: snap.saveDate,
      capturedAt: snap.capturedAt,
      age: entry.age,
      abilityStars:
        typeof entry.abilityStars === 'number' &&
        Number.isFinite(entry.abilityStars)
          ? entry.abilityStars
          : null,
      potentialStars:
        typeof entry.potentialStars === 'number' &&
        Number.isFinite(entry.potentialStars)
          ? entry.potentialStars
          : null,
      avgCoreAttr,
      netDeltaFromStart,
    });
  }

  return points;
}
