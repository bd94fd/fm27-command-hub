import { PlayerRecord } from '../types/fm27';
import { inferFm27Roles } from './fm27RoleMatcher';
import { MISSING_VALUE } from './squadViewHelpers';

export interface FmBinaryInspectionResult {
  fileName: string;
  fileSizeBytes: number;
  fileSizeLabel: string;
  lastModifiedIso: string;
  containerFormat: string;
  magicHex: string;
  isCompressedOrEncrypted: boolean;
  canExtractFullTables: boolean;
  detectedVersion: string | null;
  detectedDates: string[];
  detectedClubsOrKeywords: string[];
  matchedSquadPlayers: string[];
  diagnosticSummary: string;
  promptContext: string;
}

export interface ParsedPlayerDelta {
  name: string;
  position?: string;
  apps?: string;
  minutes?: number;
  rating?: number | null;
  goals?: number;
  xG?: number;
  xGPer90?: number;
  assists?: number;
  xA?: number;
  xAPer90?: number;
  drbPer90?: number;
  prPassesPer90?: number;
  hdrPct?: number;
  intPer90?: number;
  tckPct?: number;
  personality?: string;
  age?: number;
  ability?: number;
  potential?: number;
  expires?: string;
  nation?: string;
  wagePw?: number;
  attributes?: Partial<PlayerRecord['attributes']>;
}

export interface ParsedFmExportResult {
  fileName: string;
  format: 'CSV' | 'HTML' | 'RTF_TEXT';
  exportType:
    | 'FM_ATTRIBUTES_TABLE'
    | 'FM_STATS_TABLE'
    | 'FM_SCHEDULE_TABLE'
    | 'FM_GENERIC_TABLE';
  rowCount: number;
  headers: string[];
  parsedPlayers: ParsedPlayerDelta[];
  rawPreviewLines: string[];
  detectedDate: string | null;
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

const FM_KEYWORDS = [
  'KVV Zelzate',
  'Zelzate',
  'Bobby Dean',
  '1e Nationale',
  '1st National',
  'Backline Arena',
  'Jong Cercle',
  'Royal Knokke',
  'RC Harelbeke',
  'KVK Tienen',
  'Football Manager',
  'Sports Interactive',
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Normalizes player names to handle minor OCR / FM export spelling variations
 * (e.g., Nathan Kaninda <-> Nathan Karinda, Bjerre Verlinden <-> Bjarne Verlinden, diacritics).
 */
export function normalizePlayerName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned === 'nathan kaninda') return 'nathan karinda';
  if (cleaned === 'bjerre verlinden') return 'bjarne verlinden';
  return cleaned;
}

/**
 * Inspects a Football Manager .fm / .fmf binary buffer locally.
 * Reads container magic bytes, checks compression/encryption, and extracts any readable
 * plaintext ASCII/UTF-8 header strings (game version, dates, club/manager names, player names).
 * Never fabricates locked numeric tables.
 */
export function inspectFmSaveBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  lastModifiedMs: number,
  knownPlayers: string[]
): FmBinaryInspectionResult {
  const bytes = new Uint8Array(buffer);
  const magicBytes = Array.from(bytes.slice(0, 12));
  const magicHex = magicBytes
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  const asciiHeader = String.fromCharCode(
    ...magicBytes.map((b) => (b >= 32 && b <= 126 ? b : 46))
  );

  let containerFormat = 'Sports Interactive Proprietary Binary (.fm)';
  let isCompressedOrEncrypted = true;

  if (bytes.length >= 4 && asciiHeader.includes('fmf')) {
    containerFormat = 'Sports Interactive FMF Archive Container (.fm / .fmf)';
    isCompressedOrEncrypted = true;
  } else if (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  ) {
    containerFormat = 'Zstandard-Compressed FM Save Container (zstd)';
    isCompressedOrEncrypted = true;
  } else if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    containerFormat = 'GZIP-Compressed FM Save Container';
    isCompressedOrEncrypted = true;
  } else if (
    bytes.length >= 2 &&
    bytes[0] === 0x78 &&
    (bytes[1] === 0x9c || bytes[1] === 0xda || bytes[1] === 0x01)
  ) {
    containerFormat = 'Zlib-Compressed FM Save Container';
    isCompressedOrEncrypted = true;
  } else if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    containerFormat = 'ZIP-Packaged FM Archive';
    isCompressedOrEncrypted = true;
  } else if (asciiHeader.startsWith('SQLite')) {
    containerFormat = 'SQLite Database Container';
    isCompressedOrEncrypted = false;
  }

  // Extract printable ASCII runs (length >= 4) safely without blowing memory
  const scanLimit = Math.min(bytes.length, 4 * 1024 * 1024);
  const extractedRuns: string[] = [];
  let current = '';
  for (let i = 0; i < scanLimit; i++) {
    const code = bytes[i];
    if (code >= 32 && code <= 126) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= 4) {
        extractedRuns.push(current);
      }
      current = '';
    }
  }
  if (current.length >= 4) {
    extractedRuns.push(current);
  }

  const joinedText = extractedRuns.join('\n');

  // Detect FM version strings e.g. 27.1.0, 27.0.2, 26.4.0, FM27
  const versionMatch = joinedText.match(
    /\b(?:2[4-9]\.\d+\.\d+(?:\.\d+)?|FM\s?2[4-9](?:\.\d+)?|Football Manager 20?2[4-9])\b/i
  );
  const detectedVersion = versionMatch ? versionMatch[0] : null;

  // Detect in-game dates (DD/MM/YYYY or YYYY-MM-DD or "18 Sep 2027")
  const dateRegex =
    /\b(?:\d{2}\/\d{2}\/202\d|202\d-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+202\d)\b/gi;
  const rawDates = joinedText.match(dateRegex) || [];
  const detectedDates = Array.from(new Set(rawDates)).slice(0, 6);

  // Detect club/manager/save keywords
  const lowerJoined = joinedText.toLowerCase();
  const detectedClubsOrKeywords = FM_KEYWORDS.filter((kw) =>
    lowerJoined.includes(kw.toLowerCase())
  );

  // Detect matched KVV Zelzate squad player names (by full name or distinctive last name >= 6 chars)
  const matchedSquadPlayers = knownPlayers
    .filter((player) => {
      const lowerFull = player.toLowerCase();
      const parts = lowerFull.split(/\s+/);
      const lastName = parts[parts.length - 1] || '';
      return (
        lowerJoined.includes(lowerFull) ||
        (lastName.length >= 6 && lowerJoined.includes(lastName))
      );
    })
    .slice(0, 28);

  const fileSizeLabel = formatBytes(buffer.byteLength);
  const lastModifiedIso = new Date(lastModifiedMs || Date.now()).toISOString();

  const diagnosticSummary = [
    `File: ${fileName} (${fileSizeLabel})`,
    `Container: ${containerFormat} [Header: ${magicHex.slice(0, 23)}]`,
    detectedVersion ? `Version Marker: ${detectedVersion}` : 'Version Marker: Compressed inside binary stream',
    detectedDates.length > 0
      ? `Readable Date Strings Found: ${detectedDates.join(', ')}`
      : 'Readable Date Strings: Encrypted/compressed inside save stream',
    detectedClubsOrKeywords.length > 0
      ? `Matched Metadata Strings: ${detectedClubsOrKeywords.join(', ')}`
      : 'Matched Metadata Strings: None in plaintext header (payload is compressed binary)',
    matchedSquadPlayers.length > 0
      ? `Matched Squad Names in Plaintext Blocks (${matchedSquadPlayers.length}): ${matchedSquadPlayers.join(', ')}`
      : 'Squad / Match Tables: Locked inside Sports Interactive compressed binary payload (not plaintext-readable directly from .fm disk archive).',
  ].join('\n');

  const promptContext = `[IMPORTED .FM SAVE FILE BINARY INSPECTION — HONEST TECHNICAL AUDIT]
${diagnosticSummary}
IMPORTANT ANALYST DIRECTIVE:
- Do NOT fabricate or guess match results, attribute changes, or in-game dates that were NOT readable in the .fm binary above.
- Explain clearly to Bobby what WAS detected in his .fm file and why Sports Interactive's compressed binary .fm format locks out live squad attributes, xG, and fixture results on disk.
- Give him the exact 10-second FM27 workflow that gives 100% full-save parity inside this same chat drop box: press Ctrl+P -> Web Page (.html) or Export CSV on (1) Squad -> Stats/Per-90 View, (2) Squad -> Attributes View, and (3) Schedule / Fixtures View, then drop all 3 files straight here (or paste screenshots) so the app auto-updates every player's attributes, per-90 stats, match log, Google Sheet, and produces his complete forward plan from the exact in-game date.`;

  return {
    fileName,
    fileSizeBytes: buffer.byteLength,
    fileSizeLabel,
    lastModifiedIso,
    containerFormat,
    magicHex,
    isCompressedOrEncrypted,
    canExtractFullTables: false,
    detectedVersion,
    detectedDates,
    detectedClubsOrKeywords,
    matchedSquadPlayers,
    diagnosticSummary,
    promptContext,
  };
}

/**
 * RFC-4180 compliant CSV line splitter supporting quoted fields with commas.
 */
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

/**
 * Parses FM27 Ctrl+P HTML table exports (<table><tr><th>/<td>...) into a 2D matrix.
 */
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
        .trim()
    );

    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Parses FM27 Ctrl+P RTF / Pipe-delimited Text exports (| Name | Pos | Apps | ...) into a 2D matrix.
 */
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

function toNumber(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[%,£€$,\s]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'n/a') {
    return undefined;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Parses any FM27 structured export (.csv, .html, .rtf, .txt) into typed player deltas & prompt context.
 */
export function parseFmStructuredExport(
  content: string,
  fileName: string
): ParsedFmExportResult {
  const lowerName = fileName.toLowerCase();
  let format: 'CSV' | 'HTML' | 'RTF_TEXT' = 'CSV';
  let rows: string[][] = [];

  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    /<table[\s>]/i.test(content)
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

  const rawHeaders = rows[0] || [];
  const rawDataRows = rows.slice(1);

  // FM-View-Exporter resilience:
  // 1. Guard against FM's ~255-column export quirk by capping at 255 columns.
  // 2. Strip blank / icon-only columns (e.g. empty <th>, 'inf', 'rec', 'icon') that can shift or pollute headers.
  const ICON_ONLY_HEADERS = new Set(['', 'inf', 'rec', 'icon', 'status icon', '—', '-']);
  const keptIndices: number[] = [];
  const maxCols = Math.min(rawHeaders.length, 255);
  for (let i = 0; i < maxCols; i++) {
    const normalized = rawHeaders[i].toLowerCase().replace(/\s+/g, ' ').trim();
    if (!ICON_ONLY_HEADERS.has(normalized)) {
      keptIndices.push(i);
    }
  }
  const useIndices = keptIndices.length > 0 ? keptIndices : rawHeaders.slice(0, 255).map((_, i) => i);
  const headers = useIndices.map((i) => rawHeaders[i] ?? '');
  const dataRows = rawDataRows.map((r) => useIndices.map((i) => r[i] ?? ''));
  const lowerHeaders = headers.map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());

  const colIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const exact = lowerHeaders.findIndex((h) => h === c);
      if (exact !== -1) return exact;
    }
    for (const c of candidates) {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRe = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9/])`);
      const bounded = lowerHeaders.findIndex((h) => boundaryRe.test(h));
      if (bounded !== -1) return bounded;
    }
    for (const c of candidates) {
      if (c.length < 4) continue;
      const partial = lowerHeaders.findIndex((h) => h.includes(c));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  const nameIdx = colIndex(['player', 'name']);
  const posIdx = colIndex(['position', 'pos', 'best pos', 'nat pos']);

  // Detect export type
  const hasAttributes =
    colIndex(['pace', 'pac']) !== -1 &&
    colIndex(['stamina', 'sta']) !== -1 &&
    colIndex(['passing', 'pas']) !== -1;
  const hasSeasonStats =
    colIndex(['rating', 'av rat', 'avr', 'avg rat']) !== -1 ||
    colIndex(['xg/90', 'xg']) !== -1 ||
    colIndex(['minutes', 'mins', 'mlg']) !== -1;
  const hasSchedule =
    colIndex(['opponent', 'opposition']) !== -1 &&
    colIndex(['date']) !== -1;

  let exportType: ParsedFmExportResult['exportType'] = 'FM_GENERIC_TABLE';
  if (hasAttributes) exportType = 'FM_ATTRIBUTES_TABLE';
  else if (hasSeasonStats) exportType = 'FM_STATS_TABLE';
  else if (hasSchedule) exportType = 'FM_SCHEDULE_TABLE';

  const parsedPlayers: ParsedPlayerDelta[] = [];

  if ((hasAttributes || hasSeasonStats) && nameIdx !== -1) {
    const appsIdx = colIndex(['apps', 'app']);
    const minsIdx = colIndex(['minutes', 'mins', 'mlg']);
    const ratingIdx = colIndex(['rating', 'av rat', 'avr', 'avg rat']);
    const goalsIdx = colIndex(['goals', 'gls']);
    const xgIdx = colIndex(['xg']);
    const xg90Idx = colIndex(['xg/90']);
    const astIdx = colIndex(['assists', 'ast', 'asts']);
    const xaIdx = colIndex(['xa']);
    const xa90Idx = colIndex(['xa/90']);
    const drb90Idx = colIndex(['drb/90', 'drb pg']);
    const prPassIdx = colIndex(['pr passes/90', 'prog passes/90', 'pr pass/90']);
    const hdrIdx = colIndex(['hdr %', 'hdr%', 'hdrs w/90']);
    const intIdx = colIndex(['int/90']);
    const tckRIdx = colIndex(['tck r', 'tck %', 'tck%']);
    const persIdx = colIndex(['personality', 'pers']);
    const ageIdx = colIndex(['age']);
    const abilIdx = colIndex(['ability', 'ca']);
    const potIdx = colIndex(['potential', 'pa']);
    const expIdx = colIndex(['expires', 'exp']);
    const natIdx = colIndex(['nation', 'nat']);

    // Attribute indices
    const paceIdx = colIndex(['pace', 'pac']);
    const accIdx = colIndex(['acceleration', 'acc']);
    const staIdx = colIndex(['stamina', 'sta']);
    const jrIdx = colIndex(['jumping reach', 'jum']);
    const detIdx = colIndex(['determination', 'det']);
    const pasIdx = colIndex(['passing', 'pas']);
    const finIdx = colIndex(['finishing', 'fin']);
    const tckIdx = colIndex(['tackling', 'tck']);
    const firIdx = colIndex(['first touch', 'fir']);
    const decIdx = colIndex(['decisions', 'dec']);
    const worIdx = colIndex(['work rate', 'wor']);
    const otbIdx = colIndex(['off the ball', 'otb']);

    for (const row of dataRows) {
      const playerName = row[nameIdx]?.trim();
      if (!playerName) continue;

      const delta: ParsedPlayerDelta = { name: playerName };
      if (posIdx !== -1 && row[posIdx]) delta.position = row[posIdx];
      if (appsIdx !== -1 && row[appsIdx]) delta.apps = row[appsIdx];
      if (minsIdx !== -1) delta.minutes = toNumber(row[minsIdx]);
      if (ratingIdx !== -1) {
        const r = toNumber(row[ratingIdx]);
        delta.rating = r !== undefined ? r : null;
      }
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
      if (abilIdx !== -1) delta.ability = toNumber(row[abilIdx]);
      if (potIdx !== -1) delta.potential = toNumber(row[potIdx]);
      if (expIdx !== -1 && row[expIdx]) delta.expires = row[expIdx];
      if (natIdx !== -1 && row[natIdx]) delta.nation = row[natIdx];

      if (hasAttributes) {
        const attrs: Partial<PlayerRecord['attributes']> = {};
        const clamp = (v: number) => Math.max(1, Math.min(20, Math.round(v)));
        const p = toNumber(row[paceIdx]);
        if (p !== undefined) attrs.pace = clamp(p);
        const ac = toNumber(row[accIdx]);
        if (ac !== undefined) attrs.acceleration = clamp(ac);
        const st = toNumber(row[staIdx]);
        if (st !== undefined) attrs.stamina = clamp(st);
        const jr = toNumber(row[jrIdx]);
        if (jr !== undefined) attrs.jumpingReach = clamp(jr);
        const dt = toNumber(row[detIdx]);
        if (dt !== undefined) attrs.determination = clamp(dt);
        const ps = toNumber(row[pasIdx]);
        if (ps !== undefined) attrs.passing = clamp(ps);
        const fn = toNumber(row[finIdx]);
        if (fn !== undefined) attrs.finishing = clamp(fn);
        const tk = toNumber(row[tckIdx]);
        if (tk !== undefined) attrs.tackling = clamp(tk);
        const ft = toNumber(row[firIdx]);
        if (ft !== undefined) attrs.firstTouch = clamp(ft);
        const dc = toNumber(row[decIdx]);
        if (dc !== undefined) attrs.decisions = clamp(dc);
        const wr = toNumber(row[worIdx]);
        if (wr !== undefined) attrs.workRate = clamp(wr);
        const ob = toNumber(row[otbIdx]);
        if (ob !== undefined) attrs.offTheBall = clamp(ob);
        if (Object.keys(attrs).length > 0) {
          delta.attributes = attrs;
        }
      }

      parsedPlayers.push(delta);
    }
  }

  // Attempt to detect latest date from export content
  const dateMatches = content.match(/\b\d{1,2}\/\d{1,2}\/202\d\b/g) || [];
  const detectedDate =
    dateMatches.length > 0 ? dateMatches[dateMatches.length - 1] : null;

  const rawPreviewLines = rows
    .slice(0, 35)
    .map((r) => r.join(' | '));

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
    rawPreviewLines,
    detectedDate,
    promptContext,
  };
}

/**
 * Merges parsed FM27 CSV/HTML/RTF player deltas into the live 28-Man Squad Database
 * and produces an exact human-readable diff of changed stats/attributes.
 */
export function mergeParsedPlayersIntoSquad(
  currentSquad: PlayerRecord[],
  parsedPlayers: ParsedPlayerDelta[]
): SquadMergeResult {
  if (parsedPlayers.length === 0) {
    return { updatedSquad: currentSquad, matchedCount: 0, changedPlayers: [] };
  }

  if (currentSquad.length === 0) {
    const newSquad: PlayerRecord[] = parsedPlayers.map((p, idx) => {
      const { ipRole, oopRole } = inferFm27Roles(p.position || 'UTL', p.attributes);
      const assignedStatus: PlayerRecord['status'] =
        (p.minutes || 0) > 180 || (p.ability && p.ability >= 3.5)
          ? 'Starter'
          : (p.minutes || 0) > 45 || (p.ability && p.ability >= 2.5)
            ? 'Rotation'
            : (p.age && p.age <= 21)
              ? 'Youth'
              : 'Surplus';
      const defaultAttrs: PlayerRecord['attributes'] = {
        pace: 10,
        acceleration: 10,
        stamina: 10,
        jumpingReach: 10,
        determination: 10,
        passing: 10,
        finishing: 10,
        tackling: 10,
        firstTouch: 10,
        decisions: 10,
        workRate: 10,
        offTheBall: 10,
      };
      const finalAttrs: PlayerRecord['attributes'] = {
        ...defaultAttrs,
        ...(p.attributes || {}),
      };
      return {
        id: `imported-${idx + 1}-${normalizePlayerName(p.name).replace(/\s+/g, '-')}`,
        number: idx + 1,
        name: p.name,
        position: p.position || 'UTL',
        apps: p.apps || '0',
        minutes: p.minutes || 0,
        rating: p.rating ?? null,
        goals: p.goals || 0,
        xG: p.xG || 0,
        xGPer90: p.xGPer90 || 0,
        assists: p.assists || 0,
        xA: p.xA || 0,
        xAPer90: p.xAPer90 || 0,
        drbPer90: p.drbPer90 || 0,
        prPassesPer90: p.prPassesPer90 || 0,
        hdrPct: p.hdrPct || 0,
        intPer90: p.intPer90 || 0,
        tckPct: p.tckPct || 0,
        personality: p.personality || 'Balanced',
        age: typeof p.age === 'number' && Number.isFinite(p.age) && p.age > 0 ? p.age : NaN,
        ability: p.ability || 3.0,
        potential: p.potential || 3.5,
        expires: p.expires || MISSING_VALUE,
        nation: p.nation || MISSING_VALUE,
        wagePw:
          typeof p.wagePw === 'number' && Number.isFinite(p.wagePw) ? p.wagePw : NaN,
        status: assignedStatus,
        attributes: finalAttrs,
        ipRole,
        oopRole,
        notes: `Imported from FM27 export view`,
      };
    });
    return {
      updatedSquad: newSquad,
      matchedCount: newSquad.length,
      changedPlayers: newSquad.map((p) => ({
        name: p.name,
        changes: [`Imported new player #${p.number} (${p.position})`],
      })),
    };
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

    // Fallback last-name match when unique
    if (!delta) {
      const lastName = norm.split(' ').slice(-1)[0];
      if (lastName && lastName.length >= 5) {
        const matches = parsedPlayers.filter((p) =>
          normalizePlayerName(p.name).endsWith(` ${lastName}`)
        );
        if (matches.length === 1) {
          delta = matches[0];
        }
      }
    }

    if (!delta) return player;
    matchedCount++;

    const changes: string[] = [];
    const next: PlayerRecord = {
      ...player,
      attributes: { ...player.attributes },
    };

    if (delta.apps !== undefined && delta.apps !== player.apps) {
      changes.push(`Apps ${player.apps}→${delta.apps}`);
      next.apps = delta.apps;
    }
    if (delta.minutes !== undefined && delta.minutes !== player.minutes) {
      changes.push(`Mins ${player.minutes}→${delta.minutes}`);
      next.minutes = delta.minutes;
    }
    if (delta.rating !== undefined && delta.rating !== player.rating) {
      changes.push(
        `Rating ${player.rating ?? '-'}→${delta.rating ?? '-'}`
      );
      next.rating = delta.rating;
    }
    if (delta.goals !== undefined && delta.goals !== player.goals) {
      changes.push(`Goals ${player.goals}→${delta.goals}`);
      next.goals = delta.goals;
    }
    if (delta.xG !== undefined && delta.xG !== player.xG) {
      changes.push(`xG ${player.xG}→${delta.xG}`);
      next.xG = delta.xG;
    }
    if (delta.xGPer90 !== undefined) next.xGPer90 = delta.xGPer90;
    if (delta.assists !== undefined && delta.assists !== player.assists) {
      changes.push(`Assists ${player.assists}→${delta.assists}`);
      next.assists = delta.assists;
    }
    if (delta.xA !== undefined && delta.xA !== player.xA) {
      changes.push(`xA ${player.xA}→${delta.xA}`);
      next.xA = delta.xA;
    }
    if (delta.xAPer90 !== undefined) next.xAPer90 = delta.xAPer90;
    if (delta.drbPer90 !== undefined) next.drbPer90 = delta.drbPer90;
    if (delta.prPassesPer90 !== undefined)
      next.prPassesPer90 = delta.prPassesPer90;
    if (delta.hdrPct !== undefined) next.hdrPct = delta.hdrPct;
    if (delta.intPer90 !== undefined) next.intPer90 = delta.intPer90;
    if (delta.tckPct !== undefined) next.tckPct = delta.tckPct;
    if (delta.personality !== undefined) next.personality = delta.personality;
    if (delta.age !== undefined) next.age = delta.age;
    if (delta.ability !== undefined && delta.ability !== player.ability) {
      changes.push(`CA ${player.ability}★→${delta.ability}★`);
      next.ability = delta.ability;
    }
    if (delta.potential !== undefined && delta.potential !== player.potential) {
      changes.push(`PA ${player.potential}★→${delta.potential}★`);
      next.potential = delta.potential;
    }
    if (delta.expires !== undefined) next.expires = delta.expires;
    if (delta.nation !== undefined) next.nation = delta.nation;

    if (delta.attributes) {
      const attrKeys = Object.keys(delta.attributes) as Array<
        keyof PlayerRecord['attributes']
      >;
      for (const k of attrKeys) {
        const nextVal = delta.attributes[k];
        if (nextVal !== undefined && nextVal !== player.attributes[k]) {
          changes.push(`${k} ${player.attributes[k]}→${nextVal}`);
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
