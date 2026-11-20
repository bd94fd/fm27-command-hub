import { createDefaultPositions, createNullPlayerAttributes } from './emptyState';
import type {
  ActiveInjuryRecord,
  ClubFinancesSummary,
  ClubRecord,
  CompetitionRecord,
  DoubleGwTrackerRow,
  FixtureRecord,
  LeagueStandingSummary,
  MatchLogEntry,
  MentoringGroupRecord,
  PlayerAttributes,
  PlayerClause,
  PlayerContract,
  PlayerRecord,
  PlayerSeasonStats,
  PositionCode,
  StaffAttributes,
  StaffRecord,
  TacticDefinition,
  TacticSlot,
  WorkspaceSnapshot,
} from './types';

export type SaveImportScope = 'managed_only' | 'scouting_pool' | 'extended_pool';

export interface FmSaveImportSummary {
  game: string;
  build: string;
  knownBuild: boolean;
  saveName: string;
  gameDate: string | null;
  gameDateDmy: string | null;
  fmsaveVersion: string;
  managedClubName: string | null;
  managerName: string | null;
  managedSquadCount: number;
  managedStaffCount: number;
  importedPlayers: number;
  totalPlayersInSave: number;
  importedStaff: number;
  totalStaffInSave: number;
  importedClubs: number;
  totalClubsInSave: number;
  importedFixtures: number;
  importedMatchLogs: number;
  importedTactics: number;
  warnings: string[];
}

export interface NormalizedSaveImport {
  snapshot: WorkspaceSnapshot;
  managedClubName: string | null;
  tactics: TacticDefinition[];
  doubleGwRows: DoubleGwTrackerRow[];
  summary: FmSaveImportSummary;
}

export const FM_NATION_DB_NAMES: Record<number, string> = {
  752: 'Albania',
  753: 'Andorra',
  754: 'Armenia',
  755: 'Austria',
  756: 'Azerbaijan',
  757: 'Belgium',
  758: 'Belarus',
  759: 'Bosnia & Herzegovina',
  760: 'Bulgaria',
  761: 'Croatia',
  762: 'Cyprus',
  763: 'Czechia',
  764: 'Denmark',
  765: 'England',
  766: 'Estonia',
  767: 'Faroe Islands',
  768: 'Finland',
  769: 'France',
  770: 'Georgia',
  771: 'Germany',
  772: 'Greece',
  773: 'Hungary',
  774: 'Iceland',
  775: 'Republic of Ireland',
  776: 'Italy',
  777: 'Israel',
  778: 'Kazakhstan',
  779: 'Latvia',
  780: 'Liechtenstein',
  781: 'Lithuania',
  782: 'Luxembourg',
  783: 'Moldova',
  784: 'Netherlands',
  785: 'Northern Ireland',
  786: 'Norway',
  787: 'Poland',
  788: 'Portugal',
  789: 'Romania',
  790: 'Russia',
  791: 'North Macedonia',
  792: 'San Marino',
  793: 'Scotland',
  794: 'Slovenia',
  795: 'Serbia',
  796: 'Spain',
  797: 'Sweden',
  798: 'Switzerland',
  799: 'Turkey',
  800: 'Ukraine',
  801: 'Wales',
  802: 'Malta',
  803: 'Moldova',
  62002127: 'Montenegro',
  214873: 'Kosovo',
  1: 'Algeria',
  4: 'Cameroon',
  10: 'DR Congo',
  14: 'Egypt',
  19: 'Ghana',
  22: 'Ivory Coast',
  29: 'Mali',
  32: 'Morocco',
  35: 'Nigeria',
  39: 'Senegal',
  43: 'South Africa',
  48: 'Tunisia',
  106: 'Australia',
  110: 'China PR',
  116: 'Indonesia',
  117: 'Iran',
  119: 'Japan',
  135: 'South Korea',
  130: 'Saudi Arabia',
  144: 'New Zealand',
  364: 'Canada',
  379: 'Mexico',
  390: 'United States',
  377: 'Jamaica',
  366: 'Costa Rica',
  1649: 'Argentina',
  1650: 'Bolivia',
  1651: 'Brazil',
  1652: 'Chile',
  1653: 'Colombia',
  1654: 'Ecuador',
  1655: 'Paraguay',
  1656: 'Peru',
  1657: 'Uruguay',
  1658: 'Venezuela',
};

export const FM_COMPETITION_DB_NAMES: Record<number, string> = {
  11: 'Premier League',
  12: 'Sky Bet Championship',
  13: 'Sky Bet League One',
  14: 'Sky Bet League Two',
  29: 'Eredivisie',
  30: 'Keuken Kampioen Divisie',
  22: 'Bundesliga',
  23: '2. Bundesliga',
  67: 'La Liga',
  68: 'La Liga 2',
  32: 'Serie A',
  33: 'Serie B',
  16: 'Ligue 1',
  17: 'Ligue 2',
  60: 'Liga Portugal',
  1: 'Jupiler Pro League',
  45: 'Scottish Premiership',
  1301394: 'UEFA Champions League',
  1301395: 'UEFA Europa League',
  2000015926: 'UEFA Conference League',
  1301406: 'FA Cup',
  1301407: 'Carabao Cup',
  1301417: 'KNVB Beker',
};

export function resolveNationName(dbId: number | null | undefined): string | null {
  if (dbId === null || dbId === undefined) return null;
  return FM_NATION_DB_NAMES[dbId] ?? `Nation #${dbId}`;
}

export function resolveCompetitionName(
  name: string | null | undefined,
  dbId: number | null | undefined,
): string {
  if (name && name.trim()) return name.trim();
  if (dbId !== null && dbId !== undefined) {
    return FM_COMPETITION_DB_NAMES[dbId] ?? `Competition #${dbId}`;
  }
  return 'Domestic Competition';
}

export function formatStaffJobLabel(rawJob: string | null | undefined): string {
  if (!rawJob) return 'Staff Member';
  return rawJob
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function numOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function derivePreferredFoot(
  leftFoot: number | null,
  rightFoot: number | null,
): PlayerRecord['preferredFoot'] {
  if (leftFoot === null || rightFoot === null) return null;
  if (leftFoot >= 15 && rightFoot >= 15) return 'Either';
  if (leftFoot > rightFoot) return rightFoot <= 8 ? 'Left Only' : 'Left';
  return leftFoot <= 8 ? 'Right Only' : 'Right';
}

export function formatFmPositionText(positions: Record<PositionCode, number>): string {
  if ((positions.GK ?? 0) >= 15) return 'GK';

  const threshold = 15;
  const pickSides = (l: number, c: number, r: number): string => {
    let s = '';
    if (r >= threshold) s += 'R';
    if (l >= threshold) s += 'L';
    if (c >= threshold) s += 'C';
    return s;
  };

  const parts: string[] = [];

  const dSides = pickSides(positions.DL ?? 0, positions.DC ?? 0, positions.DR ?? 0);
  const wbSides = pickSides(positions.WBL ?? 0, 0, positions.WBR ?? 0);
  if (dSides && wbSides && dSides === wbSides) {
    parts.push(`D/WB(${dSides})`);
  } else {
    if (dSides) parts.push(`D(${dSides})`);
    if (wbSides) parts.push(`WB(${wbSides})`);
  }

  if ((positions.DM ?? 0) >= threshold) {
    parts.push('DM');
  }

  const mSides = pickSides(positions.ML ?? 0, positions.MC ?? 0, positions.MR ?? 0);
  const amSides = pickSides(positions.AML ?? 0, positions.AMC ?? 0, positions.AMR ?? 0);
  if (mSides && amSides && mSides === amSides) {
    parts.push(`M/AM(${mSides})`);
  } else {
    if (mSides) parts.push(`M(${mSides})`);
    if (amSides) parts.push(`AM(${amSides})`);
  }

  if ((positions.ST ?? 0) >= threshold) {
    parts.push('ST');
  }

  if (parts.length > 0) {
    return parts.join(',');
  }

  let bestCode: PositionCode = 'MC';
  let bestVal = -1;
  (Object.keys(positions) as PositionCode[]).forEach((code) => {
    if ((positions[code] ?? 0) > bestVal) {
      bestVal = positions[code] ?? 0;
      bestCode = code;
    }
  });

  const singleMap: Record<PositionCode, string> = {
    GK: 'GK',
    DL: 'D(L)',
    DC: 'D(C)',
    DR: 'D(R)',
    WBL: 'WB(L)',
    WBR: 'WB(R)',
    DM: 'DM',
    ML: 'M(L)',
    MC: 'M(C)',
    MR: 'M(R)',
    AML: 'AM(L)',
    AMC: 'AM(C)',
    AMR: 'AM(R)',
    ST: 'ST',
  };
  return singleMap[bestCode] ?? 'M(C)';
}

function parsePositionsFromText(posText: string): Record<PositionCode, number> {
  const pos = createDefaultPositions();
  if (!posText) return pos;
  const upper = posText.toUpperCase();
  if (/\bGK\b/.test(upper)) pos.GK = 20;
  if (/D[^M]*L|DL|\bLB\b/.test(upper)) pos.DL = 20;
  if (/D[^M]*C|DC|\bCB\b/.test(upper)) pos.DC = 20;
  if (/D[^M]*R|DR|\bRB\b/.test(upper)) pos.DR = 20;
  if (/WB.*L|WBL/.test(upper)) pos.WBL = 20;
  if (/WB.*R|WBR/.test(upper)) pos.WBR = 20;
  if (/\bDM\b|\bCDM\b/.test(upper)) pos.DM = 20;
  if (/(?:^|[^A])M\s*\([^)]*L|\bML\b|\bLM\b/.test(upper)) pos.ML = 20;
  if (/(?:^|[^A])M\s*\([^)]*C|\bMC\b|\bCM\b/.test(upper)) pos.MC = 20;
  if (/(?:^|[^A])M\s*\([^)]*R|\bMR\b|\bRM\b/.test(upper)) pos.MR = 20;
  if (/AM\s*\([^)]*L|\bAML\b|\bLW\b/.test(upper)) pos.AML = 20;
  if (/AM\s*\([^)]*C|\bAMC\b|\bCAM\b/.test(upper)) pos.AMC = 20;
  if (/AM\s*\([^)]*R|\bAMR\b|\bRW\b/.test(upper)) pos.AMR = 20;
  if (/\bST\b|\bCF\b/.test(upper)) pos.ST = 20;
  return pos;
}

export function detectFmFileHeader(
  bytes: Uint8Array,
  fileName: string,
): 'fm_save' | 'json_snapshot' | 'html_export' | 'csv_export' | 'rtf_export' | 'unknown' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.fm')) return 'fm_save';
  if (lower.endsWith('.json')) return 'json_snapshot';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html_export';
  if (lower.endsWith('.csv')) return 'csv_export';
  if (lower.endsWith('.rtf')) return 'rtf_export';

  if (bytes.length >= 4) {
    if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
      return 'fm_save';
    }
    if (
      (bytes[0] === 0x1f && bytes[1] === 0x8b) ||
      (bytes[0] === 0x78 && (bytes[1] === 0x9c || bytes[1] === 0xda || bytes[1] === 0x01))
    ) {
      return 'fm_save';
    }
    const headAscii = String.fromCharCode(...bytes.slice(0, Math.min(32, bytes.length)));
    if (headAscii.includes('fmf') || headAscii.includes('FMF')) {
      return 'fm_save';
    }
    const trimmed = headAscii.trimStart();
    if (trimmed.startsWith('{')) return 'json_snapshot';
    if (
      trimmed.toLowerCase().startsWith('<!doctype') ||
      trimmed.toLowerCase().startsWith('<html') ||
      trimmed.toLowerCase().startsWith('<table')
    ) {
      return 'html_export';
    }
  }
  return 'unknown';
}

function mapTacticPosition(rawPos: string | undefined, slotIndex: number): TacticSlot {
  switch (rawPos) {
    case 'GOALKEEPER':
      return {
        slotIndex,
        position: 'GK',
        inPossessionRole: 'Ball-Playing Goalkeeper',
        outOfPossessionRole: 'Sweeper Keeper',
      };
    case 'DEFENDER_RIGHT':
      return {
        slotIndex,
        position: 'DR',
        inPossessionRole: 'Full-Back',
        outOfPossessionRole: 'Full-Back',
      };
    case 'DEFENDER_LEFT':
      return {
        slotIndex,
        position: 'DL',
        inPossessionRole: 'Full-Back',
        outOfPossessionRole: 'Full-Back',
      };
    case 'DEFENDER_CENTRE':
      return {
        slotIndex,
        position: 'DC',
        inPossessionRole: 'Ball-Playing Centre-Back',
        outOfPossessionRole: 'Centre-Back',
      };
    case 'DEFENSIVE_MIDFIELDER':
      return {
        slotIndex,
        position: 'DM',
        inPossessionRole: 'Defensive Midfielder',
        outOfPossessionRole: 'Defensive Midfielder',
      };
    case 'MIDFIELDER_RIGHT':
      return {
        slotIndex,
        position: 'MR',
        inPossessionRole: 'Winger',
        outOfPossessionRole: 'Wide Midfielder',
      };
    case 'MIDFIELDER_LEFT':
      return {
        slotIndex,
        position: 'ML',
        inPossessionRole: 'Winger',
        outOfPossessionRole: 'Wide Midfielder',
      };
    case 'ATTACKING_MIDFIELDER_RIGHT':
      return {
        slotIndex,
        position: 'AMR',
        inPossessionRole: 'Inside Forward',
        outOfPossessionRole: 'Tracking Winger',
      };
    case 'ATTACKING_MIDFIELDER_LEFT':
      return {
        slotIndex,
        position: 'AML',
        inPossessionRole: 'Inside Forward',
        outOfPossessionRole: 'Tracking Winger',
      };
    case 'ATTACKING_MIDFIELDER_CENTRE':
      return {
        slotIndex,
        position: 'AMC',
        inPossessionRole: 'Attacking Midfielder',
        outOfPossessionRole: 'Pressing Attacking Midfielder',
      };
    case 'STRIKER_CENTRE':
      return {
        slotIndex,
        position: 'ST',
        inPossessionRole: 'Channel Forward',
        outOfPossessionRole: 'Central Outlet Centre Forward',
      };
    default:
      return {
        slotIndex,
        position: 'MC',
        inPossessionRole: 'Central Midfielder',
        outOfPossessionRole: 'Central Midfielder',
      };
  }
}

function inferFormationFromSlots(slots: TacticSlot[]): string {
  let def = 0;
  let dm = 0;
  let mid = 0;
  let am = 0;
  let st = 0;
  for (const sl of slots) {
    if (sl.position === 'GK') continue;
    if (
      sl.position === 'DL' ||
      sl.position === 'DC' ||
      sl.position === 'DR' ||
      sl.position === 'WBL' ||
      sl.position === 'WBR'
    ) {
      def++;
    } else if (sl.position === 'DM') {
      dm++;
    } else if (sl.position === 'ML' || sl.position === 'MC' || sl.position === 'MR') {
      mid++;
    } else if (sl.position === 'AML' || sl.position === 'AMC' || sl.position === 'AMR') {
      am++;
    } else if (sl.position === 'ST') {
      st++;
    }
  }
  const lines = [def, dm + mid, am, st].filter((n) => n > 0);
  return lines.length >= 2 ? lines.join('-') : '4-3-3';
}

function formatMentality(raw: string | undefined): string {
  if (!raw) return 'Balanced';
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function mapRawPlayerAttributes(attrs: Record<string, unknown> | null | undefined): PlayerAttributes {
  if (!attrs) return createNullPlayerAttributes();
  return {
    crossing: numOrNull(attrs.crossing),
    dribbling: numOrNull(attrs.dribbling),
    finishing: numOrNull(attrs.finishing),
    first_touch: numOrNull(attrs.first_touch ?? attrs.firstTouch),
    heading: numOrNull(attrs.heading),
    long_shots: numOrNull(attrs.long_shots),
    marking: numOrNull(attrs.marking),
    passing: numOrNull(attrs.passing),
    tackling: numOrNull(attrs.tackling),
    technique: numOrNull(attrs.technique),
    corners: numOrNull(attrs.corners),
    free_kicks: numOrNull(attrs.free_kicks ?? attrs.free_kick_taking),
    long_throws: numOrNull(attrs.long_throws),
    penalties: numOrNull(attrs.penalties ?? attrs.penalty_taking),
    aggression: numOrNull(attrs.aggression),
    anticipation: numOrNull(attrs.anticipation),
    bravery: numOrNull(attrs.bravery),
    composure: numOrNull(attrs.composure),
    concentration: numOrNull(attrs.concentration),
    decisions: numOrNull(attrs.decisions),
    determination: numOrNull(attrs.determination),
    flair: numOrNull(attrs.flair),
    leadership: numOrNull(attrs.leadership),
    off_the_ball: numOrNull(attrs.off_the_ball ?? attrs.offTheBall),
    positioning: numOrNull(attrs.positioning),
    teamwork: numOrNull(attrs.teamwork),
    vision: numOrNull(attrs.vision),
    work_rate: numOrNull(attrs.work_rate ?? attrs.workRate),
    acceleration: numOrNull(attrs.acceleration),
    agility: numOrNull(attrs.agility),
    balance: numOrNull(attrs.balance),
    jumping_reach: numOrNull(attrs.jumping_reach ?? attrs.jumpingReach),
    natural_fitness: numOrNull(attrs.natural_fitness),
    pace: numOrNull(attrs.pace),
    stamina: numOrNull(attrs.stamina),
    strength: numOrNull(attrs.strength),
    aerial_ability: numOrNull(attrs.aerial_ability ?? attrs.aerial_reach),
    command_of_area: numOrNull(attrs.command_of_area),
    communication: numOrNull(attrs.communication),
    eccentricity: numOrNull(attrs.eccentricity),
    handling: numOrNull(attrs.handling),
    kicking: numOrNull(attrs.kicking),
    one_on_ones: numOrNull(attrs.one_on_ones),
    reflexes: numOrNull(attrs.reflexes),
    rushing_out: numOrNull(attrs.rushing_out),
    tendency_to_punch: numOrNull(attrs.tendency_to_punch ?? attrs.punching),
    throwing: numOrNull(attrs.throwing),
    adaptability: numOrNull(attrs.adaptability),
    ambition: numOrNull(attrs.ambition),
    consistency: numOrNull(attrs.consistency),
    controversy: numOrNull(attrs.controversy),
    dirtiness: numOrNull(attrs.dirtiness),
    important_matches: numOrNull(attrs.important_matches),
    injury_proneness: numOrNull(attrs.injury_proneness),
    loyalty: numOrNull(attrs.loyalty),
    pressure: numOrNull(attrs.pressure),
    professionalism: numOrNull(attrs.professionalism),
    sportsmanship: numOrNull(attrs.sportsmanship),
    temperament: numOrNull(attrs.temperament),
    versatility: numOrNull(attrs.versatility),
  };
}

/**
 * Normalizes raw JSON emitted by `fm-save-mapper.py` (or `fmsave-worker.js`) into a unified
 * `WorkspaceSnapshot` without fabricating missing facilities, coefficients, attributes, or match xG.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeImportedSavePayload(raw: any): NormalizedSaveImport {
  const meta = raw?.meta ?? {};
  const gameDate: string | null = meta.gameDate ?? meta.gameDateIso ?? null;
  const gameDateDmy: string | null = meta.gameDateDmy ?? null;
  const saveName: string = meta.saveName || meta.fileName || 'FM27 Save';
  const managedClubName: string | null = raw?.managedClub?.name ?? meta.clubName ?? null;
  const managedClubUid: number | null = numOrNull(raw?.managedClub?.uid ?? meta.clubUid);
  const managerName: string | null = raw?.managedClub?.managerName ?? meta.managerName ?? null;

  // 1. Clubs (NEVER fabricate facilities=14 or synthetic UEFA coefficients)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClubs: any[] = Array.isArray(raw?.clubs) ? raw.clubs : [];
  const clubNationByUid = new Map<number, string>();
  const clubs: ClubRecord[] = rawClubs.map((c, idx) => {
    const nation = c.nation ?? resolveNationName(c.nationDbId);
    if (nation && c.uid !== undefined && c.uid !== null) {
      clubNationByUid.set(Number(c.uid), nation);
    }
    const fin = c.finances ?? {};

    return {
      id: Number(c.uid ?? idx + 1),
      uniqueId: Number(c.uniqueId ?? c.uid ?? idx + 1),
      name: String(c.name ?? `Club ${idx + 1}`),
      competition: c.competition ? String(c.competition) : nation ? `${nation} League` : null,
      nation,
      reputation: numOrNull(c.reputation),
      trainingFacilities: numOrNull(c.trainingFacilities),
      youthFacilities: numOrNull(c.youthFacilities),
      youthCoaching: numOrNull(c.youthCoaching),
      youthRecruitment: numOrNull(c.youthRecruitment),
      corporateFacilities: numOrNull(c.corporateFacilities),
      balance: numOrNull(fin.balance),
      transferBudget: numOrNull(fin.transferBudget ?? fin.transferBudgetRemaining),
      payrollBudgetWeekly: numOrNull(fin.wageBudgetWeekly),
      currentWagesWeekly: numOrNull(fin.wagePayrollWeekly),
      financialDate: fin.month ?? gameDate,
      loans: Array.isArray(c.loans) ? c.loans : [],
      income: fin.balance !== undefined
        ? [
            {
              category: 'Total Operating Income',
              thisMonth: numOrNull(fin.thisMonthIncome),
              lastMonth: numOrNull(fin.lastMonthIncome),
              thisSeason: numOrNull(fin.thisSeasonIncome),
              lastSeason: null,
            },
            {
              category: 'Net Transfer Activity',
              thisMonth: numOrNull(fin.thisMonthTransfers),
              lastMonth: null,
              thisSeason: numOrNull(fin.thisSeasonTransfers),
              lastSeason: null,
            },
          ]
        : [],
      expenditure: fin.balance !== undefined
        ? [
            {
              category: 'Player & Staff Wages',
              thisMonth: numOrNull(fin.thisMonthWages),
              lastMonth: numOrNull(fin.lastMonthWages),
              thisSeason: numOrNull(fin.thisSeasonWages),
              lastSeason: null,
            },
            {
              category: 'Total Operating Expenditure',
              thisMonth: numOrNull(fin.thisMonthExp),
              lastMonth: numOrNull(fin.lastMonthExp),
              thisSeason: numOrNull(fin.thisSeasonExp),
              lastSeason: null,
            },
          ]
        : [],
      coefficients: c.coefficients ?? null,
    };
  });

  // 2. Players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPlayers: any[] = Array.isArray(raw?.players) ? raw.players : [];
  const players: PlayerRecord[] = rawPlayers.map((p, idx) => {
    const pos: Record<PositionCode, number> = p.positions
      ? {
          GK: Number(p.positions.GK ?? p.positions.gk ?? 1),
          DL: Number(p.positions.DL ?? p.positions.dl ?? 1),
          DC: Number(p.positions.DC ?? p.positions.dc ?? 1),
          DR: Number(p.positions.DR ?? p.positions.dr ?? 1),
          WBL: Number(p.positions.WBL ?? p.positions.wbl ?? 1),
          WBR: Number(p.positions.WBR ?? p.positions.wbr ?? 1),
          DM: Number(p.positions.DM ?? p.positions.dm ?? 1),
          ML: Number(p.positions.ML ?? p.positions.ml ?? 1),
          MC: Number(p.positions.MC ?? p.positions.mc ?? 1),
          MR: Number(p.positions.MR ?? p.positions.mr ?? 1),
          AML: Number(p.positions.AML ?? p.positions.aml ?? 1),
          AMC: Number(p.positions.AMC ?? p.positions.amc ?? 1),
          AMR: Number(p.positions.AMR ?? p.positions.amr ?? 1),
          ST: Number(p.positions.ST ?? p.positions.st ?? 1),
        }
      : parsePositionsFromText(String(p.position ?? ''));

    const nationality: string | null = p.nationality ?? resolveNationName(p.nationDbId);
    let playingNation: string | null = null;
    if (p.clubNationDbId !== null && p.clubNationDbId !== undefined) {
      playingNation = resolveNationName(p.clubNationDbId);
    } else if (p.clubUid !== undefined && p.clubUid !== null) {
      playingNation = clubNationByUid.get(Number(p.clubUid)) ?? null;
    }
    if (!playingNation) {
      playingNation = nationality;
    }

    const attributes = mapRawPlayerAttributes(p.attributes);

    const clauses: PlayerClause[] = Array.isArray(p.clauses)
      ? p.clauses.map((cl: { kind?: string; value?: number | null }) => ({
          kind: String(cl.kind ?? ''),
          value: numOrNull(cl.value),
        }))
      : [];

    const minFeeClause = clauses.find((cl) => cl.kind.includes('MINIMUM_FEE') && cl.value !== null);
    const rawSquadStatus = String(p.squadStatus || '');
    const squadStatusLabel = rawSquadStatus ? formatStaffJobLabel(rawSquadStatus) : null;
    const clubName = String(p.club ?? managedClubName ?? '');
    const playingClubName = String(p.playingClub ?? clubName);
    const wagePw = numOrNull(p.salaryWeekly ?? p.wagePw);
    const contractStart: string | null = p.contractStart ?? null;
    const contractEnd: string | null = p.contractEnd ?? p.expires ?? null;

    const contracts: PlayerContract[] = [];
    if (clubName || wagePw !== null || contractEnd) {
      contracts.push({
        type: p.onLoan ? 'Loan' : 'Full-Time',
        club: playingClubName || clubName || 'Free Agent',
        weeklyWage: wagePw,
        startDate: contractStart ?? gameDate,
        endDate: contractEnd,
        squadStatus: squadStatusLabel,
        releaseClause: minFeeClause?.value ?? null,
      });
    }

    const rep = numOrNull(p.reputationCurrent);
    const leftFoot = numOrNull(p.leftFoot);
    const rightFoot = numOrNull(p.rightFoot);

    const hasSeasonStatsObj = Boolean(p.seasonStats) ||
      p.minutes !== undefined ||
      p.apps !== undefined ||
      p.rating !== undefined ||
      p.goals !== undefined;
    const ss = p.seasonStats ?? p;
    const seasonStats: PlayerSeasonStats | undefined = hasSeasonStatsObj
      ? {
          apps: ss.apps !== undefined ? (ss.apps === null ? null : String(ss.apps)) : null,
          minutes: numOrNull(ss.minutes),
          rating: numOrNull(ss.rating),
          goals: numOrNull(ss.goals),
          xG: numOrNull(ss.xG),
          xGPer90: numOrNull(ss.xGPer90),
          assists: numOrNull(ss.assists),
          xA: numOrNull(ss.xA),
          xAPer90: numOrNull(ss.xAPer90),
          drbPer90: numOrNull(ss.drbPer90),
          prPassesPer90: numOrNull(ss.prPassesPer90),
          hdrPct: numOrNull(ss.hdrPct),
          intPer90: numOrNull(ss.intPer90),
          tckPct: numOrNull(ss.tckPct),
          distanceKm: numOrNull(ss.distanceKm),
          yellowCards: numOrNull(ss.yellowCards),
          redCards: numOrNull(ss.redCards),
        }
      : undefined;

    const hiddenPersonality = p.hiddenPersonality
      ? {
          professionalism: numOrNull(p.hiddenPersonality.professionalism),
          ambition: numOrNull(p.hiddenPersonality.ambition),
          pressure: numOrNull(p.hiddenPersonality.pressure),
          temperament: numOrNull(p.hiddenPersonality.temperament),
          loyalty: numOrNull(p.hiddenPersonality.loyalty),
        }
      : attributes.professionalism !== null ||
          attributes.ambition !== null ||
          attributes.pressure !== null ||
          attributes.temperament !== null ||
          attributes.loyalty !== null
        ? {
            professionalism: attributes.professionalism,
            ambition: attributes.ambition,
            pressure: attributes.pressure,
            temperament: attributes.temperament,
            loyalty: attributes.loyalty,
          }
        : null;

    const ca = numOrNull(p.ca);
    const pa = numOrNull(p.pa) ?? ca;

    return {
      id: Number(p.uid ?? idx + 1),
      uniqueId: numOrNull(p.uniqueId) ?? undefined,
      name: String(p.name ?? `Player ${idx + 1}`),
      age: numOrNull(p.age),
      dateOfBirth: p.dob ?? null,
      gender: 'Male',
      heightCm: numOrNull(p.heightCm),
      weightKg: numOrNull(p.weightKg),
      preferredFoot: derivePreferredFoot(leftFoot, rightFoot),
      nationality,
      playingNation,
      playingCompetition: playingNation ? `${playingNation} League` : null,
      club: clubName,
      playingClub: playingClubName,
      positionText: p.position ? String(p.position) : formatFmPositionText(pos),
      positions: pos,
      ca,
      pa,
      condition: numOrNull(p.condition),
      sharpness: numOrNull(p.sharpness),
      wagePw,
      askingPrice: numOrNull(p.askingPrice ?? p.estimatedValue),
      estimatedValue: numOrNull(p.estimatedValue),
      expires: contractEnd,
      contractStart,
      contractEnd,
      squadStatus: squadStatusLabel,
      clauses,
      contracts,
      onLoan: Boolean(p.onLoan),
      teamSlot: numOrNull(p.teamSlot),
      transferListed: rawSquadStatus.includes('SURPLUS'),
      listedForLoan: Boolean(p.onLoan),
      transferAgreed: false,
      futureTransferClub: null,
      futureTransferDate: null,
      futureContractEndDate: null,
      injured: Boolean(p.injured),
      injury: p.injury ?? null,
      injuryLightTrainingDays: null,
      injuryFullTrainingDays: null,
      injuryExpectedReturn: null,
      suspensionsCount: Number(p.suspensionsCount ?? 0),
      onDuty: false,
      dutyReason: null,
      currentReputation: rep,
      homeReputation: rep,
      worldReputation: rep !== null ? Math.round(rep * 0.85) : null,
      personality: p.personality ?? null,
      hiddenPersonality,
      notes: p.notes ?? null,
      attributes,
      seasonStats,
    };
  });

  // 3. Staff (keep missing attributes null — never fabricate!)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawStaff: any[] = Array.isArray(raw?.staff) ? raw.staff : [];
  const staff: StaffRecord[] = rawStaff.map((s, idx) => {
    const nation = s.nationality ?? resolveNationName(s.nationDbId);
    const clubNation =
      s.clubUid !== null && s.clubUid !== undefined ? clubNationByUid.get(Number(s.clubUid)) : null;
    const sa = s.attributes ?? {};
    const ca = numOrNull(s.ca);
    const pa = numOrNull(s.pa) ?? ca;

    const attributes: StaffAttributes = {
      attacking: numOrNull(sa.attacking),
      defending: numOrNull(sa.defending),
      fitness: numOrNull(sa.fitness),
      goalkeeping: numOrNull(sa.goalkeeping),
      mental: numOrNull(sa.mental ?? sa.manManagement),
      possession: numOrNull(sa.possession),
      set_pieces: numOrNull(sa.setPieces ?? sa.set_pieces),
      tactical: numOrNull(sa.tactical),
      technical: numOrNull(sa.technical),
      working_with_youngsters: numOrNull(sa.workingWithYoungsters ?? sa.working_with_youngsters),
      adaptability: numOrNull(sa.adaptability),
      authority: numOrNull(sa.levelOfDiscipline ?? sa.authority),
      determination: numOrNull(sa.determination),
      judging_player_ability: numOrNull(sa.judgingPlayerAbility ?? sa.judging_player_ability),
      judging_player_potential: numOrNull(sa.judgingPlayerPotential ?? sa.judging_player_potential),
      judging_staff_ability: numOrNull(sa.judgingStaffAbility ?? sa.judging_staff_ability),
      man_management: numOrNull(sa.manManagement ?? sa.man_management),
      motivating: numOrNull(sa.motivating),
      negotiating: numOrNull(sa.negotiating),
      physiotherapy: numOrNull(sa.physiotherapy),
      sports_science: numOrNull(sa.sportsScience ?? sa.sports_science),
      tactical_knowledge: numOrNull(sa.tacticalKnowledge ?? sa.tactical_knowledge),
      analysing_data: numOrNull(sa.analysingData ?? sa.analysing_data),
    };

    return {
      id: Number(s.uid ?? idx + 1),
      name: String(s.name ?? `Staff ${idx + 1}`),
      job: s.isHumanManager ? 'Manager (You)' : formatStaffJobLabel(s.job),
      club: String(s.club ?? ''),
      division: clubNation ? `${clubNation} League` : '',
      nationality: nation,
      age: numOrNull(s.age),
      ca,
      pa,
      salaryWeekly: numOrNull(s.salaryWeekly),
      contractEndDate: s.contractEnd ?? null,
      worldReputation: numOrNull(s.worldReputation),
      preferredFormation: s.preferredFormation ?? null,
      tacticalStyle: s.tacticalStyle ?? null,
      attributes,
    };
  });

  // 4. Competitions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawComps: any[] = Array.isArray(raw?.competitions) ? raw.competitions : [];
  const competitions: CompetitionRecord[] = rawComps.map((c, idx) => ({
    id: Number(c.id ?? idx + 1),
    name: resolveCompetitionName(c.name, c.databaseId),
    nation: c.nation ?? null,
    reputation: numOrNull(c.reputation),
    gender: 'Male',
    tier: numOrNull(c.tier),
    teamsCount: numOrNull(c.teamsCount),
  }));

  // 5. Fixtures (from raw.fixtures + raw.upcomingFixtures if present)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawFixtures: any[] = Array.isArray(raw?.fixtures) ? raw.fixtures : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawUpcoming: any[] = Array.isArray(raw?.upcomingFixtures) ? raw.upcomingFixtures : [];
  const fixtures: FixtureRecord[] = [];

  if (rawFixtures.length > 0) {
    rawFixtures.forEach((fx, idx) => {
      const homeClub = String(fx.homeClub ?? 'Home');
      const awayClub = String(fx.awayClub ?? 'Away');
      const isHome = managedClubName
        ? homeClub.toLowerCase() === managedClubName.toLowerCase()
        : true;
      const opponent = isHome ? awayClub : homeClub;
      const score =
        fx.status === 'Played' && fx.homeGoals !== null && fx.awayGoals !== null
          ? `${fx.homeGoals} - ${fx.awayGoals}`
          : undefined;
      fixtures.push({
        id: idx + 1,
        kickoffDate: String(fx.date ?? gameDate ?? ''),
        kickoffTime: fx.kickOff ? String(fx.kickOff) : null,
        opponent,
        home: isHome,
        competition: resolveCompetitionName(fx.competitionName, fx.competitionDbId),
        venue: fx.venue ? String(fx.venue) : null,
        homeClub,
        awayClub,
        status: fx.status === 'Played' ? 'Played' : 'Upcoming',
        score,
      });
    });
  } else if (rawUpcoming.length > 0) {
    rawUpcoming.forEach((uf, idx) => {
      const isHome = uf.venue === 'H';
      const clubLabel = managedClubName || 'Managed Club';
      const opp = String(uf.opponent ?? 'Opponent');
      fixtures.push({
        id: idx + 1,
        kickoffDate: String(uf.dateIso ?? uf.dateDmy ?? gameDate ?? ''),
        kickoffTime: null,
        opponent: opp,
        home: isHome,
        competition: String(uf.competition ?? 'Domestic Competition'),
        venue: null,
        homeClub: isHome ? clubLabel : opp,
        awayClub: isHome ? opp : clubLabel,
        status: 'Upcoming',
      });
    });
  }

  // 6. MatchLogs (strictly null for xG / possession / passCompletion / CCC if not in save)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPlayedMatches: any[] = Array.isArray(raw?.playedMatches) ? raw.playedMatches : [];
  const matchLogs: MatchLogEntry[] = [];
  if (rawPlayedMatches.length > 0) {
    rawPlayedMatches.forEach((pm, idx) => {
      const dateStr = String(pm.dateDmy || pm.dateIso || gameDate || '');
      const opponent = String(pm.opponent ?? 'Opponent');
      matchLogs.push({
        id: `fm-match-${idx + 1}-${dateStr}`,
        eventNumber: idx + 1,
        date: dateStr,
        competition: String(pm.competition ?? 'Domestic Competition'),
        opponent,
        venue: pm.venue === 'A' ? 'A' : 'H',
        result: pm.result === 'W' || pm.result === 'L' ? pm.result : 'D',
        score: String(pm.score ?? '0 - 0'),
        xGFor: numOrNull(pm.xGFor),
        xGAgainst: numOrNull(pm.xGAgainst),
        possession: numOrNull(pm.possession),
        passCompletion: numOrNull(pm.passCompletion),
        shotsFor: pm.shotsFor ?? null,
        shotsAgainst: pm.shotsAgainst ?? null,
        cccFor: numOrNull(pm.cccFor),
        cccAgainst: numOrNull(pm.cccAgainst),
        distanceKm: numOrNull(pm.distanceKm),
        goalTimeline: pm.goalTimeline ?? null,
        potm: pm.potm ?? null,
        defensiveWatchpoints: pm.defensiveWatchpoints ?? null,
        tacticalAudit: pm.tacticalAudit ?? null,
        source: 'FM_SAVE',
      });
    });
  } else {
    fixtures
      .filter((fx) => fx.status === 'Played' && fx.score)
      .forEach((fx, idx) => {
        const parts = (fx.score ?? '').split(/\s*[-–]\s*/);
        const hg = Number.parseInt(parts[0] ?? '', 10);
        const ag = Number.parseInt(parts[1] ?? '', 10);
        const gf = fx.home ? hg : ag;
        const ga = fx.home ? ag : hg;
        const result: 'W' | 'D' | 'L' =
          Number.isFinite(gf) && Number.isFinite(ga)
            ? gf > ga
              ? 'W'
              : gf < ga
                ? 'L'
                : 'D'
            : 'D';
        matchLogs.push({
          id: `fm-match-${fx.id}-${fx.kickoffDate}`,
          eventNumber: idx + 1,
          date: fx.kickoffDate,
          competition: fx.competition,
          opponent: fx.opponent,
          venue: fx.home ? 'H' : 'A',
          result,
          score: Number.isFinite(gf) && Number.isFinite(ga) ? `${gf} - ${ga}` : fx.score!,
          xGFor: null,
          xGAgainst: null,
          possession: null,
          passCompletion: null,
          shotsFor: null,
          shotsAgainst: null,
          cccFor: null,
          cccAgainst: null,
          distanceKm: null,
          goalTimeline: null,
          potm: null,
          defensiveWatchpoints: null,
          tacticalAudit: null,
          source: 'FM_SAVE',
        });
      });
  }

  // 7. Tactics (strictly dual-phase IP / OOP slots — ZERO legacy duties)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTactics: any[] = Array.isArray(raw?.tactics) ? raw.tactics : [];
  const tactics: TacticDefinition[] = rawTactics
    .filter((t) => Array.isArray(t.slots) && t.slots.length >= 10)
    .map((t, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slots: TacticSlot[] = t.slots.slice(0, 11).map((sl: any, sIdx: number) => {
        const primaryPos = Array.isArray(sl.positions) ? sl.positions[0] : undefined;
        return mapTacticPosition(primaryPos, sIdx);
      });
      const name = String(t.name || `Saved Tactic ${idx + 1}`);
      return {
        id: `save-tactic-${idx + 1}-${Date.now()}`,
        fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.fmf`,
        name,
        formation: inferFormationFromSlots(slots),
        mentality: formatMentality(t.mentality),
        tacticalStyle: String(t.styleName || 'Custom'),
        inPossessionInstructions: [],
        inTransitionInstructions: [],
        outOfPossessionInstructions: [],
        lastModified: gameDate,
        slots,
      };
    });

  // 8. Active Injuries, Mentoring, Finances, League Standing
  const activeInjuries: ActiveInjuryRecord[] = Array.isArray(raw?.activeInjuries)
    ? raw.activeInjuries
    : [];
  const mentoring: MentoringGroupRecord[] = Array.isArray(raw?.mentoring) ? raw.mentoring : [];

  const managedClubObj = managedClubUid
    ? clubs.find((c) => c.id === managedClubUid)
    : managedClubName
      ? clubs.find((c) => c.name.toLowerCase() === managedClubName.toLowerCase())
      : clubs[0];

  const finances: ClubFinancesSummary | null = raw?.finances
    ? {
        month: raw.finances.month ?? gameDate,
        balance: numOrNull(raw.finances.balance),
        wagePayrollWeekly: numOrNull(raw.finances.wagePayrollWeekly),
        wageBudgetWeekly: numOrNull(raw.finances.wageBudgetWeekly),
        transferBudgetRemaining: numOrNull(raw.finances.transferBudgetRemaining),
      }
    : managedClubObj &&
        (managedClubObj.balance !== null ||
          managedClubObj.currentWagesWeekly !== null ||
          managedClubObj.transferBudget !== null)
      ? {
          month: managedClubObj.financialDate,
          balance: managedClubObj.balance,
          wagePayrollWeekly: managedClubObj.currentWagesWeekly,
          wageBudgetWeekly: managedClubObj.payrollBudgetWeekly,
          transferBudgetRemaining: managedClubObj.transferBudget,
        }
      : null;

  const leagueStanding: LeagueStandingSummary | null = raw?.leagueStanding ?? null;
  const warnings: string[] = Array.isArray(raw?.warnings) ? raw.warnings.map(String) : [];

  const snapshot: WorkspaceSnapshot = {
    metadata: {
      status: 'loaded',
      game: String(meta.game ?? 'FM27'),
      build: String(meta.build ?? 'Unknown'),
      knownBuild: Boolean(meta.knownBuild ?? true),
      saveName,
      gameDate,
      gameDateDmy,
      loadedAt: new Date().toISOString(),
      sourceLabel: `${meta.game || 'FM27'} save (${saveName})`,
      freshness: 'current',
      managedClubName,
      managedClubUid,
      managerName,
      fmsaveVersion: String(meta.fmsaveVersion ?? '0.14.1'),
      totalPlayersInWorld: Number(meta.totalPlayersInSave ?? players.length),
      totalStaffInWorld: Number(meta.totalStaffInSave ?? staff.length),
      totalClubsInWorld: Number(meta.totalClubsInSave ?? clubs.length),
      totalCompetitionsInWorld: competitions.length,
      warnings,
    },
    players,
    staff,
    clubs,
    competitions,
    fixtures,
    matchLogs,
    tactics,
    activeInjuries,
    mentoring,
    finances,
    leagueStanding,
  };

  const summary: FmSaveImportSummary = {
    game: String(meta.game ?? 'FM27'),
    build: String(meta.build ?? 'Unknown'),
    knownBuild: Boolean(meta.knownBuild ?? true),
    saveName,
    gameDate,
    gameDateDmy,
    fmsaveVersion: String(meta.fmsaveVersion ?? '0.14.1'),
    managedClubName,
    managerName,
    managedSquadCount: Number(meta.managedSquadCount ?? players.length),
    managedStaffCount: Number(meta.managedStaffCount ?? staff.length),
    importedPlayers: players.length,
    totalPlayersInSave: Number(meta.totalPlayersInSave ?? players.length),
    importedStaff: staff.length,
    totalStaffInSave: Number(meta.totalStaffInSave ?? staff.length),
    importedClubs: clubs.length,
    totalClubsInSave: Number(meta.totalClubsInSave ?? clubs.length),
    importedFixtures: fixtures.length,
    importedMatchLogs: matchLogs.length,
    importedTactics: tactics.length,
    warnings,
  };

  const doubleGwRows: DoubleGwTrackerRow[] = Array.isArray(raw?.doubleGwRows)
    ? raw.doubleGwRows
    : [];

  return { snapshot, managedClubName, tactics, doubleGwRows, summary };
}

// =============================================================================
// Structured FM27 Export Parsers (CSV, Ctrl+P HTML, RTF / Pipe Text)
// Zero fabricated attribute averages — missing attributes remain null!
// =============================================================================

export interface ParsedPlayerDelta {
  name: string;
  club?: string;
  position?: string;
  age?: number | null;
  ca?: number | null;
  pa?: number | null;
  wagePw?: number | null;
  estimatedValue?: number | null;
  expires?: string | null;
  nation?: string | null;
  personality?: string | null;
  apps?: string | null;
  minutes?: number | null;
  rating?: number | null;
  goals?: number | null;
  xG?: number | null;
  xGPer90?: number | null;
  assists?: number | null;
  xA?: number | null;
  xAPer90?: number | null;
  drbPer90?: number | null;
  prPassesPer90?: number | null;
  hdrPct?: number | null;
  intPer90?: number | null;
  tckPct?: number | null;
  attributes?: Partial<PlayerAttributes>;
}

export interface ParsedFmExportResult {
  fileName: string;
  format: 'CSV' | 'HTML' | 'RTF_TEXT';
  exportType:
    | 'FM_ATTRIBUTES_TABLE'
    | 'FM_STATS_TABLE'
    | 'FM_SCHEDULE_TABLE'
    | 'FM_SQUAD_OVERVIEW_TABLE'
    | 'FM_GENERIC_TABLE';
  rowCount: number;
  headers: string[];
  parsedPlayers: ParsedPlayerDelta[];
  players: PlayerRecord[];
  detectedClub: string | null;
  detectedDate: string | null;
  rawPreviewLines: string[];
  promptContext: string;
}

export interface SquadMergeResult {
  updatedSquad: PlayerRecord[];
  matchedCount: number;
  changedPlayers: Array<{
    name: string;
    changes: string[];
  }>;
}

export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
  }

  return rows;
}

export function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cellMatches = tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [];
    if (cellMatches.length === 0) continue;

    const cells = cellMatches.map((cell) =>
      cell
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim(),
    );

    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

export function parsePipeTableRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) continue;
    if (/^[\|\-\s=+]+$/.test(trimmed)) continue;

    const parts = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => {
        if (idx === 0 && arr[0] === '') return false;
        if (idx === arr.length - 1 && arr[arr.length - 1] === '') return false;
        return true;
      });

    if (parts.length >= 2) {
      rows.push(parts);
    }
  }
  return rows;
}

function toNumber(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[%,£€$,\s]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned.toLowerCase() === 'n/a') {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseMoneyString(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,kKmM-]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const mult = /[mM]$/.test(cleaned) ? 1_000_000 : /[kK]$/.test(cleaned) ? 1_000 : 1;
  const num = Number(cleaned.replace(/[kKmM]$/, '').replace(/,/g, ''));
  return Number.isFinite(num) ? Math.round(num * mult) : null;
}

const ATTRIBUTE_HEADER_ALIASES: Array<[keyof PlayerAttributes, string[]]> = [
  ['crossing', ['crossing', 'cro']],
  ['dribbling', ['dribbling', 'dri']],
  ['finishing', ['finishing', 'fin']],
  ['first_touch', ['first touch', 'fir']],
  ['heading', ['heading', 'hea']],
  ['long_shots', ['long shots', 'lon']],
  ['marking', ['marking', 'mar']],
  ['passing', ['passing', 'pas']],
  ['tackling', ['tackling', 'tck']],
  ['technique', ['technique', 'tec']],
  ['corners', ['corners', 'cor']],
  ['free_kicks', ['free kick taking', 'free kicks', 'fre']],
  ['long_throws', ['long throws', 'l th']],
  ['penalties', ['penalty taking', 'penalties', 'pen']],
  ['aggression', ['aggression', 'agg']],
  ['anticipation', ['anticipation', 'ant']],
  ['bravery', ['bravery', 'bra']],
  ['composure', ['composure', 'cmp']],
  ['concentration', ['concentration', 'cnt']],
  ['decisions', ['decisions', 'dec']],
  ['determination', ['determination', 'det']],
  ['flair', ['flair', 'fla']],
  ['leadership', ['leadership', 'ldr']],
  ['off_the_ball', ['off the ball', 'otb']],
  ['positioning', ['positioning', 'pos']],
  ['teamwork', ['teamwork', 'tea']],
  ['vision', ['vision', 'vis']],
  ['work_rate', ['work rate', 'wor']],
  ['acceleration', ['acceleration', 'acc']],
  ['agility', ['agility', 'agi']],
  ['balance', ['balance', 'bal']],
  ['jumping_reach', ['jumping reach', 'jum']],
  ['natural_fitness', ['natural fitness', 'nat fit']],
  ['pace', ['pace', 'pac']],
  ['stamina', ['stamina', 'sta']],
  ['strength', ['strength', 'str']],
  ['aerial_ability', ['aerial reach', 'aerial ability', 'aer']],
  ['command_of_area', ['command of area', 'cmd']],
  ['communication', ['communication', 'com']],
  ['eccentricity', ['eccentricity', 'ecc']],
  ['handling', ['handling', 'han']],
  ['kicking', ['kicking', 'kic']],
  ['one_on_ones', ['one on ones', '1v1']],
  ['reflexes', ['reflexes', 'ref']],
  ['rushing_out', ['rushing out', 'tro']],
  ['tendency_to_punch', ['tendency to punch', 'pun']],
  ['throwing', ['throwing', 'thr']],
];

/**
 * Parses FM27 structured exports (.csv, Ctrl+P .html, .rtf / pipe .txt)
 * into typed player deltas & full PlayerRecord[] with ZERO fabricated attributes.
 */
export function parseFmStructuredExport(
  content: string,
  fileName: string,
): ParsedFmExportResult {
  const lowerName = fileName.toLowerCase();
  let format: 'CSV' | 'HTML' | 'RTF_TEXT' = 'CSV';
  let rows: string[][] = [];

  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    /<tr[\s>]/i.test(content)
  ) {
    format = 'HTML';
    rows = parseHtmlTableRows(content);
  } else if (
    lowerName.endsWith('.rtf') ||
    (lowerName.endsWith('.txt') && content.includes('|'))
  ) {
    format = 'RTF_TEXT';
    rows = parsePipeTableRows(content);
  } else {
    format = 'CSV';
    rows = parseCsvRows(content);
  }

  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const colIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const exact = lowerHeaders.findIndex((h) => h === c);
      if (exact !== -1) return exact;
    }
    for (const c of candidates) {
      if (c.length <= 3) continue;
      const partial = lowerHeaders.findIndex((h) => h.includes(c));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  const nameIdx = colIndex(['name', 'player']);
  const posIdx = colIndex(['position', 'pos']);

  const hasAttributes =
    colIndex(['pace', 'pac']) !== -1 &&
    colIndex(['stamina', 'sta']) !== -1 &&
    colIndex(['passing', 'pas']) !== -1;
  const hasSeasonStats =
    colIndex(['rating', 'av rat']) !== -1 ||
    colIndex(['xg/90', 'xg']) !== -1 ||
    colIndex(['minutes', 'mins']) !== -1;
  const hasSchedule =
    colIndex(['opponent', 'opposition']) !== -1 && colIndex(['date']) !== -1;
  const hasSquadOverview =
    nameIdx !== -1 && (colIndex(['current ability', 'ca']) !== -1 || colIndex(['wage', 'salary']) !== -1);

  let exportType: ParsedFmExportResult['exportType'] = 'FM_GENERIC_TABLE';
  if (hasAttributes) exportType = 'FM_ATTRIBUTES_TABLE';
  else if (hasSeasonStats) exportType = 'FM_STATS_TABLE';
  else if (hasSchedule) exportType = 'FM_SCHEDULE_TABLE';
  else if (hasSquadOverview) exportType = 'FM_SQUAD_OVERVIEW_TABLE';

  const parsedPlayers: ParsedPlayerDelta[] = [];
  const players: PlayerRecord[] = [];
  const clubCounts = new Map<string, number>();

  if (nameIdx !== -1 && (hasAttributes || hasSeasonStats || hasSquadOverview)) {
    const clubIdx = colIndex(['club', 'team']);
    const appsIdx = colIndex(['apps']);
    const minsIdx = colIndex(['minutes', 'mins']);
    const ratingIdx = colIndex(['rating', 'av rat']);
    const goalsIdx = colIndex(['goals', 'gls']);
    const xgIdx = colIndex(['xg']);
    const xg90Idx = colIndex(['xg/90']);
    const astIdx = colIndex(['assists', 'ast']);
    const xaIdx = colIndex(['xa']);
    const xa90Idx = colIndex(['xa/90']);
    const drb90Idx = colIndex(['drb/90']);
    const prPassIdx = colIndex(['pr passes/90', 'prog passes/90']);
    const hdrIdx = colIndex(['hdr %', 'hdr%']);
    const intIdx = colIndex(['int/90']);
    const tckRIdx = colIndex(['tck r', 'tck %']);
    const persIdx = colIndex(['personality']);
    const ageIdx = colIndex(['age']);
    const abilIdx = colIndex(['current ability', 'ability', 'ca']);
    const potIdx = colIndex(['potential ability', 'potential', 'pa']);
    const expIdx = colIndex(['expires', 'contract end']);
    const natIdx = colIndex(['nationality', 'nation', 'nat']);
    const wageIdx = colIndex(['wage', 'salary']);
    const valIdx = colIndex(['transfer value', 'asking price', 'value']);

    const attrIndices = ATTRIBUTE_HEADER_ALIASES.map(([key, aliases]) => ({
      key,
      idx: colIndex(aliases),
    })).filter((entry) => entry.idx !== -1);

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const playerName = row[nameIdx]?.trim();
      if (!playerName) continue;

      const club = clubIdx !== -1 && row[clubIdx]?.trim() ? row[clubIdx].trim() : '';
      if (club) clubCounts.set(club, (clubCounts.get(club) ?? 0) + 1);

      const delta: ParsedPlayerDelta = { name: playerName };
      if (club) delta.club = club;
      if (posIdx !== -1 && row[posIdx]) delta.position = row[posIdx];
      if (appsIdx !== -1 && row[appsIdx]) delta.apps = row[appsIdx];
      if (minsIdx !== -1) delta.minutes = toNumber(row[minsIdx]);
      if (ratingIdx !== -1) delta.rating = toNumber(row[ratingIdx]);
      if (goalsIdx !== -1) delta.goals = toNumber(row[goalsIdx]);
      if (xgIdx !== -1) delta.xG = toNumber(row[xgIdx]);
      if (xg90Idx !== -1) delta.xGPer90 = toNumber(row[xg90Idx]);
      if (astIdx !== -1) delta.assists = toNumber(row[astIdx]);
      if (xaIdx !== -1) delta.xA = toNumber(row[xaIdx]);
      if (xa90Idx !== -1) delta.xAPer90 = toNumber(row[xa90Idx]);
      if (drb90Idx !== -1) delta.drbPer90 = toNumber(row[drb90Idx]);
      if (prPassIdx !== -1) delta.prPassesPer90 = toNumber(row[prPassIdx]);
      if (hdrIdx !== -1) delta.hdrPct = toNumber(row[hdrIdx]);
      if (intIdx !== -1) delta.intPer90 = toNumber(row[intIdx]);
      if (tckRIdx !== -1) delta.tckPct = toNumber(row[tckRIdx]);
      if (persIdx !== -1 && row[persIdx]) delta.personality = row[persIdx];
      if (ageIdx !== -1) delta.age = toNumber(row[ageIdx]);
      if (abilIdx !== -1) delta.ca = toNumber(row[abilIdx]);
      if (potIdx !== -1) delta.pa = toNumber(row[potIdx]);
      if (expIdx !== -1 && row[expIdx]) delta.expires = row[expIdx];
      if (natIdx !== -1 && row[natIdx]) delta.nation = row[natIdx];
      if (wageIdx !== -1) delta.wagePw = parseMoneyString(row[wageIdx]);
      if (valIdx !== -1) delta.estimatedValue = parseMoneyString(row[valIdx]);

      const attrsObj = createNullPlayerAttributes();
      const deltaAttrs: Partial<PlayerAttributes> = {};
      for (const { key, idx } of attrIndices) {
        const val = toNumber(row[idx]);
        if (val !== null) {
          attrsObj[key] = val;
          deltaAttrs[key] = val;
        }
      }
      if (Object.keys(deltaAttrs).length > 0) {
        delta.attributes = deltaAttrs;
      }

      parsedPlayers.push(delta);

      const posText = delta.position ?? 'MC';
      const positions = parsePositionsFromText(posText);
      const hasAnyStat =
        delta.apps !== undefined ||
        delta.minutes !== undefined ||
        delta.rating !== undefined ||
        delta.goals !== undefined ||
        delta.assists !== undefined;

      players.push({
        id: 900000 + r + 1,
        name: playerName,
        age: delta.age ?? null,
        dateOfBirth: null,
        gender: 'Male',
        heightCm: null,
        weightKg: null,
        preferredFoot: null,
        nationality: delta.nation ?? null,
        playingNation: null,
        playingCompetition: null,
        club,
        playingClub: club,
        positionText: posText,
        positions,
        ca: delta.ca ?? null,
        pa: delta.pa ?? delta.ca ?? null,
        condition: null,
        sharpness: null,
        wagePw: delta.wagePw ?? null,
        askingPrice: delta.estimatedValue ?? null,
        estimatedValue: delta.estimatedValue ?? null,
        expires: delta.expires ?? null,
        contractStart: null,
        contractEnd: delta.expires ?? null,
        squadStatus: null,
        clauses: [],
        contracts:
          club || delta.wagePw !== undefined || delta.expires
            ? [
                {
                  type: 'Full-Time',
                  club: club || 'Managed Club',
                  weeklyWage: delta.wagePw ?? null,
                  startDate: null,
                  endDate: delta.expires ?? null,
                  squadStatus: null,
                },
              ]
            : [],
        onLoan: false,
        teamSlot: null,
        transferListed: false,
        listedForLoan: false,
        transferAgreed: false,
        futureTransferClub: null,
        futureTransferDate: null,
        futureContractEndDate: null,
        injured: false,
        injury: null,
        injuryLightTrainingDays: null,
        injuryFullTrainingDays: null,
        injuryExpectedReturn: null,
        suspensionsCount: 0,
        onDuty: false,
        dutyReason: null,
        currentReputation: null,
        homeReputation: null,
        worldReputation: null,
        personality: delta.personality ?? null,
        attributes: attrsObj,
        seasonStats: hasAnyStat
          ? {
              apps: delta.apps ?? null,
              minutes: delta.minutes ?? null,
              rating: delta.rating ?? null,
              goals: delta.goals ?? null,
              xG: delta.xG ?? null,
              xGPer90: delta.xGPer90 ?? null,
              assists: delta.assists ?? null,
              xA: delta.xA ?? null,
              xAPer90: delta.xAPer90 ?? null,
              drbPer90: delta.drbPer90 ?? null,
              prPassesPer90: delta.prPassesPer90 ?? null,
              hdrPct: delta.hdrPct ?? null,
              intPer90: delta.intPer90 ?? null,
              tckPct: delta.tckPct ?? null,
              distanceKm: null,
              yellowCards: null,
              redCards: null,
            }
          : undefined,
      });
    }
  }

  let detectedClub: string | null = null;
  let maxCount = 0;
  for (const [club, count] of clubCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      detectedClub = club;
    }
  }

  const dateMatches = content.match(/\b\d{1,2}\/\d{1,2}\/202\d\b/g) || [];
  const detectedDate = dateMatches.length > 0 ? dateMatches[dateMatches.length - 1] : null;
  const rawPreviewLines = rows.slice(0, 35).map((r) => r.join(' | '));
  const promptContext = `[IMPORTED FM27 ${format} EXPORT: ${fileName} | Type: ${exportType} | Rows: ${dataRows.length}]
Columns: ${headers.join(', ')}
${rawPreviewLines.join('\n')}`;

  return {
    fileName,
    format,
    exportType,
    rowCount: dataRows.length,
    headers,
    parsedPlayers,
    players,
    detectedClub,
    detectedDate,
    rawPreviewLines,
    promptContext,
  };
}

/**
 * Merges parsed FM27 CSV/HTML/RTF player deltas into an existing squad without overwriting
 * populated attributes or stats with nulls.
 */
export function mergeParsedPlayersIntoSquad(
  currentSquad: PlayerRecord[],
  parsedPlayers: ParsedPlayerDelta[],
): SquadMergeResult {
  if (parsedPlayers.length === 0) {
    return { updatedSquad: currentSquad, matchedCount: 0, changedPlayers: [] };
  }

  const byNormalizedName = new Map<string, ParsedPlayerDelta>();
  for (const p of parsedPlayers) {
    byNormalizedName.set(normalizePlayerName(p.name), p);
  }

  let matchedCount = 0;
  const changedPlayers: Array<{ name: string; changes: string[] }> = [];

  const updatedSquad = currentSquad.map((player) => {
    const norm = normalizePlayerName(player.name);
    let delta = byNormalizedName.get(norm);

    if (!delta) {
      const lastName = norm.split(' ').slice(-1)[0];
      if (lastName && lastName.length >= 5) {
        const matches = parsedPlayers.filter((p) =>
          normalizePlayerName(p.name).endsWith(` ${lastName}`),
        );
        if (matches.length === 1) {
          delta = matches[0];
        }
      }
    }

    if (!delta) return player;
    matchedCount++;

    const changes: string[] = [];
    const nextStats: PlayerSeasonStats = {
      apps: player.seasonStats?.apps ?? null,
      minutes: player.seasonStats?.minutes ?? null,
      rating: player.seasonStats?.rating ?? null,
      goals: player.seasonStats?.goals ?? null,
      xG: player.seasonStats?.xG ?? null,
      xGPer90: player.seasonStats?.xGPer90 ?? null,
      assists: player.seasonStats?.assists ?? null,
      xA: player.seasonStats?.xA ?? null,
      xAPer90: player.seasonStats?.xAPer90 ?? null,
      drbPer90: player.seasonStats?.drbPer90 ?? null,
      prPassesPer90: player.seasonStats?.prPassesPer90 ?? null,
      hdrPct: player.seasonStats?.hdrPct ?? null,
      intPer90: player.seasonStats?.intPer90 ?? null,
      tckPct: player.seasonStats?.tckPct ?? null,
      distanceKm: player.seasonStats?.distanceKm ?? null,
      yellowCards: player.seasonStats?.yellowCards ?? null,
      redCards: player.seasonStats?.redCards ?? null,
    };

    if (delta.apps !== undefined && delta.apps !== null && delta.apps !== nextStats.apps) {
      changes.push(`Apps ${nextStats.apps ?? '—'}→${delta.apps}`);
      nextStats.apps = delta.apps;
    }
    if (
      delta.minutes !== undefined &&
      delta.minutes !== null &&
      delta.minutes !== nextStats.minutes
    ) {
      changes.push(`Mins ${nextStats.minutes ?? '—'}→${delta.minutes}`);
      nextStats.minutes = delta.minutes;
    }
    if (delta.rating !== undefined && delta.rating !== null && delta.rating !== nextStats.rating) {
      changes.push(`Rating ${nextStats.rating ?? '—'}→${delta.rating}`);
      nextStats.rating = delta.rating;
    }
    if (delta.goals !== undefined && delta.goals !== null && delta.goals !== nextStats.goals) {
      changes.push(`Goals ${nextStats.goals ?? '—'}→${delta.goals}`);
      nextStats.goals = delta.goals;
    }
    if (delta.xG !== undefined && delta.xG !== null && delta.xG !== nextStats.xG) {
      changes.push(`xG ${nextStats.xG ?? '—'}→${delta.xG}`);
      nextStats.xG = delta.xG;
    }
    if (delta.xGPer90 !== undefined && delta.xGPer90 !== null) nextStats.xGPer90 = delta.xGPer90;
    if (
      delta.assists !== undefined &&
      delta.assists !== null &&
      delta.assists !== nextStats.assists
    ) {
      changes.push(`Assists ${nextStats.assists ?? '—'}→${delta.assists}`);
      nextStats.assists = delta.assists;
    }
    if (delta.xA !== undefined && delta.xA !== null) nextStats.xA = delta.xA;
    if (delta.xAPer90 !== undefined && delta.xAPer90 !== null) nextStats.xAPer90 = delta.xAPer90;
    if (delta.drbPer90 !== undefined && delta.drbPer90 !== null) nextStats.drbPer90 = delta.drbPer90;
    if (delta.prPassesPer90 !== undefined && delta.prPassesPer90 !== null) {
      nextStats.prPassesPer90 = delta.prPassesPer90;
    }
    if (delta.hdrPct !== undefined && delta.hdrPct !== null) nextStats.hdrPct = delta.hdrPct;
    if (delta.intPer90 !== undefined && delta.intPer90 !== null) nextStats.intPer90 = delta.intPer90;
    if (delta.tckPct !== undefined && delta.tckPct !== null) nextStats.tckPct = delta.tckPct;

    const next: PlayerRecord = {
      ...player,
      attributes: { ...player.attributes },
      seasonStats: nextStats,
    };

    if (delta.personality) next.personality = delta.personality;
    if (delta.age !== undefined && delta.age !== null) next.age = delta.age;
    if (delta.ca !== undefined && delta.ca !== null && delta.ca !== player.ca) {
      changes.push(`CA ${player.ca ?? '—'}→${delta.ca}`);
      next.ca = delta.ca;
    }
    if (delta.pa !== undefined && delta.pa !== null && delta.pa !== player.pa) {
      changes.push(`PA ${player.pa ?? '—'}→${delta.pa}`);
      next.pa = delta.pa;
    }
    if (delta.expires) {
      next.expires = delta.expires;
      next.contractEnd = delta.expires;
    }
    if (delta.nation) next.nationality = delta.nation;
    if (delta.wagePw !== undefined && delta.wagePw !== null && delta.wagePw !== player.wagePw) {
      changes.push(`Wage ${player.wagePw ?? '—'}→${delta.wagePw}`);
      next.wagePw = delta.wagePw;
    }

    if (delta.attributes) {
      for (const k of Object.keys(delta.attributes) as Array<keyof PlayerAttributes>) {
        const nextVal = delta.attributes[k];
        if (nextVal !== undefined && nextVal !== null && nextVal !== player.attributes[k]) {
          changes.push(`${k} ${player.attributes[k] ?? '—'}→${nextVal}`);
          next.attributes[k] = nextVal;
        }
      }
    }

    if (changes.length > 0) {
      changedPlayers.push({ name: player.name, changes });
    }

    return next;
  });

  return { updatedSquad, matchedCount, changedPlayers };
}
