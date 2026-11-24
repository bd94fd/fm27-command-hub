/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic 7-Day FM27 Training Planner (Mon-Sun, 3 slots/day),
 * category color-coding, intensity/fatigue summary, and SemHiel2003/fm27-trainer JSON/CSV import.
 */

export type TrainingSlotCategory =
  | 'match'
  | 'tactics'
  | 'attacking'
  | 'defending'
  | 'physical'
  | 'set_pieces'
  | 'recovery'
  | 'rest';

export type TrainingIntensity = 'high' | 'medium' | 'low' | 'rest';

export interface WeeklyTrainingSlot {
  label: string;
  category: TrainingSlotCategory;
  intensity: TrainingIntensity;
}

export interface WeeklyTrainingDay {
  dayIndex: number; // 0 = Mon .. 6 = Sun
  dayShort: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  dayFull: string;
  dateLabel?: string;
  fixtureContext?: string;
  directive?: string;
  slots: [WeeklyTrainingSlot, WeeklyTrainingSlot, WeeklyTrainingSlot];
}

export interface WeeklyTrainingLoadSummary {
  highCount: number;
  mediumCount: number;
  lowCount: number;
  restCount: number;
  fatigueIndex: number; // 0-100
  riskTier: 'Optimal / Low Injury Risk' | 'Moderate Load' | 'High Fatigue / Injury Risk';
  summaryNote: string;
}

export const WEEKDAYS: Array<{ short: WeeklyTrainingDay['dayShort']; full: string }> = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

export function classifyTrainingSession(rawName: string): WeeklyTrainingSlot {
  const label = (rawName || 'Rest').trim() || 'Rest';
  const lower = label.toLowerCase();

  if (/\b(matchday|match\s*day|vs\s+|fixture|kick-?off)\b/.test(lower)) {
    return { label, category: 'match', intensity: 'high' };
  }
  if (/^(rest|off|day off|no session|—|-|--)$/i.test(lower) || /\bpost-match rest\b/.test(lower)) {
    return { label, category: 'rest', intensity: 'rest' };
  }
  if (/\b(recovery|regen|light|cooldown|cool down|travel|bonding|outreach|match review)\b/.test(lower)) {
    return { label, category: 'recovery', intensity: 'low' };
  }
  if (/\b(corner|free kick|set piece|penalty|throw-?in)\b/.test(lower)) {
    return { label, category: 'set_pieces', intensity: 'low' };
  }
  if (/\b(quick|endurance|strength|resistance|physical|fitness|aerobic|sprint)/.test(lower)) {
    return { label, category: 'physical', intensity: 'high' };
  }
  if (/\b(attack|chance|finish|shooting|final third|crossing|direct|conversion|box)\b/.test(lower)) {
    return { label, category: 'attacking', intensity: 'medium' };
  }
  if (/\b(defend|press|compact|shape|engaged|aerial|ground|marking|tackling)\b/.test(lower)) {
    return { label, category: 'defending', intensity: 'medium' };
  }
  if (/\b(tactic|shadow|build up|possession|transition|match preview|ball retention|distribution|overall|outfield|goalkeep)\b/.test(lower)) {
    return { label, category: 'tactics', intensity: 'medium' };
  }
  return { label, category: 'tactics', intensity: 'medium' };
}

export interface DynamicTrainingInputRow {
  week: string;
  date: string;
  fixtureContext: string;
  slot1: string;
  slot2: string;
  slot3: string;
  directive: string;
}

function parseTrainingRowDate(rawDate: string): Date | null {
  if (!rawDate) return null;
  // Prefer the last UK DD/MM/YYYY date in range labels like "Now (15/09/2027) → 18/09/2027" or "Before 22/09/2027"
  const dmyMatches = Array.from(rawDate.matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/g));
  if (dmyMatches.length > 0) {
    const match = dmyMatches[dmyMatches.length - 1];
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  const isoMatch = rawDate.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  const parsed = Date.parse(rawDate);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Normalizes dynamic fixture-periodised rows into a 7-day Mon-Sun planner.
 */
export function buildWeeklyPlannerFromDynamicSchedule(
  rows: DynamicTrainingInputRow[]
): WeeklyTrainingDay[] {
  const byDay = new Map<number, DynamicTrainingInputRow>();

  for (const row of rows.slice(0, 7)) {
    const parsedDate = parseTrainingRowDate(row.date);
    if (parsedDate) {
      const jsDay = parsedDate.getUTCDay(); // 0=Sun..6=Sat
      const monIdx = (jsDay + 6) % 7;
      if (!byDay.has(monIdx)) {
        byDay.set(monIdx, row);
      }
    }
  }

  return WEEKDAYS.map((wd, idx) => {
    const matched = byDay.get(idx) ?? rows[idx];
    if (matched) {
      return {
        dayIndex: idx,
        dayShort: wd.short,
        dayFull: wd.full,
        dateLabel: matched.date,
        fixtureContext: matched.fixtureContext,
        directive: matched.directive,
        slots: [
          classifyTrainingSession(matched.slot1),
          classifyTrainingSession(matched.slot2),
          classifyTrainingSession(matched.slot3),
        ],
      };
    }

    const fallbackSlots: [string, string, string] =
      idx === 5
        ? ['Matchday / Match Tactics', 'Match Preview', 'Rest']
        : idx === 6
          ? ['Recovery', 'Match Review', 'Rest']
          : idx === 2
            ? ['Quickness', 'Attacking Movement', 'Team Bonding']
            : ['Match Tactics', 'Ball Retention', 'Set Pieces'];

    return {
      dayIndex: idx,
      dayShort: wd.short,
      dayFull: wd.full,
      fixtureContext: idx === 5 ? 'Matchday Slot' : idx === 6 ? 'Post-Match Recovery' : 'Training Day',
      directive:
        idx === 6
          ? 'Playbook v2.0: Mandatory Post-Match Rest slashes injury roll.'
          : 'Balanced IP/OOP periodisation.',
      slots: [
        classifyTrainingSession(fallbackSlots[0]),
        classifyTrainingSession(fallbackSlots[1]),
        classifyTrainingSession(fallbackSlots[2]),
      ],
    };
  });
}

function resolveDayIndex(label: string, fallbackIndex: number): number {
  const lower = (label || '').trim().toLowerCase();
  // English & Dutch day prefixes (SemHiel2003/fm27-trainer exports EN + NL)
  if (lower.startsWith('mon') || lower.startsWith('maa') || lower === 'ma') return 0;
  if (lower.startsWith('tue') || lower.startsWith('din') || lower === 'di') return 1;
  if (lower.startsWith('wed') || lower.startsWith('woe') || lower === 'wo') return 2;
  if (lower.startsWith('thu') || lower.startsWith('don') || lower === 'do') return 3;
  if (lower.startsWith('fri') || lower.startsWith('vri') || lower === 'vr') return 4;
  if (lower.startsWith('sat') || lower.startsWith('zat') || lower === 'za') return 5;
  if (lower.startsWith('sun') || lower.startsWith('zon') || lower === 'zo') return 6;
  const parsedDate = parseTrainingRowDate(label);
  if (parsedDate) {
    return (parsedDate.getUTCDay() + 6) % 7;
  }
  return Math.max(0, Math.min(6, fallbackIndex));
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses SemHiel2003/fm27-trainer JSON or CSV schedule exports into a 7-day planner.
 * Supports:
 * - Upstream v0.2.8 JSON: { effectiveness, weeks: [{ start, schedule_name, days: [{ date, role, slots }] }] }
 * - Legacy JSON: { days: [...] }, { schedule: [...] | { Monday: [...] } }, or [...]
 * - Upstream v0.2.8 8-column EN/NL CSV: date,day,period,type,session1,session2,extra,schedule
 * - Legacy 3/4-column CSV: Day,Slot1,Slot2,Slot3
 */
export function parseFm27TrainerSchedule(
  rawText: string
): { days: WeeklyTrainingDay[]; sourceLabel: string } | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Try JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const slotsByDay = new Map<number, [string, string, string]>();
      const dateByDay = new Map<number, string>();
      const contextByDay = new Map<number, string>();
      let sourceLabel = 'Imported fm27-trainer JSON';

      const ingestDayArray = (rawDays: unknown[]) => {
        rawDays.slice(0, 7).forEach((entry, idx) => {
          if (entry && typeof entry === 'object') {
            const rec = entry as Record<string, unknown>;
            const daySource = String(rec.day ?? rec.name ?? rec.date ?? '');
            const dIdx = resolveDayIndex(daySource, idx);
            const arr = Array.isArray(rec.sessions)
              ? rec.sessions
              : Array.isArray(rec.slots)
                ? rec.slots
                : [
                    rec.slot1 ?? rec.session1,
                    rec.slot2 ?? rec.session2,
                    rec.slot3 ?? rec.extra ?? rec.session3,
                  ];
            slotsByDay.set(dIdx, [
              String(arr[0] || 'Rest'),
              String(arr[1] || 'Rest'),
              String(arr[2] || 'Rest'),
            ]);
            if (typeof rec.date === 'string' && rec.date.trim()) {
              dateByDay.set(dIdx, rec.date.trim());
            }
            if (typeof rec.role === 'string' && rec.role.trim()) {
              contextByDay.set(dIdx, rec.role.trim());
            }
          }
        });
      };

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.name === 'string' && obj.name.trim()) {
          sourceLabel = obj.name.trim();
        } else if (typeof obj.schedule_name === 'string' && obj.schedule_name.trim()) {
          sourceLabel = obj.schedule_name.trim();
        }

        // Upstream SemHiel2003/fm27-trainer v0.2.8 export format: { effectiveness, weeks: [...] }
        const weeks = Array.isArray(obj.weeks) ? obj.weeks : null;
        const firstWeek =
          weeks && weeks.length > 0 && weeks[0] && typeof weeks[0] === 'object'
            ? (weeks[0] as Record<string, unknown>)
            : null;

        if (firstWeek && Array.isArray(firstWeek.days)) {
          if (
            typeof firstWeek.schedule_name === 'string' &&
            firstWeek.schedule_name.trim()
          ) {
            sourceLabel = firstWeek.schedule_name.trim();
          } else if (typeof firstWeek.start === 'string' && firstWeek.start.trim()) {
            sourceLabel = `fm27-trainer Week (${firstWeek.start.trim()})`;
          }
          ingestDayArray(firstWeek.days);
        } else {
          const rawDays = Array.isArray(obj.days)
            ? obj.days
            : Array.isArray(obj.schedule)
              ? obj.schedule
              : null;

          if (rawDays) {
            ingestDayArray(rawDays);
          } else if (obj.schedule && typeof obj.schedule === 'object') {
            const sched = obj.schedule as Record<string, unknown>;
            Object.entries(sched).forEach(([k, v], idx) => {
              const dIdx = resolveDayIndex(k, idx);
              if (Array.isArray(v)) {
                slotsByDay.set(dIdx, [
                  String(v[0] || 'Rest'),
                  String(v[1] || 'Rest'),
                  String(v[2] || 'Rest'),
                ]);
              }
            });
          }
        }
      } else if (Array.isArray(parsed)) {
        parsed.slice(0, 7).forEach((entry, idx) => {
          if (Array.isArray(entry)) {
            slotsByDay.set(idx, [
              String(entry[0] || 'Rest'),
              String(entry[1] || 'Rest'),
              String(entry[2] || 'Rest'),
            ]);
          } else if (entry && typeof entry === 'object') {
            ingestDayArray([entry]);
          }
        });
      }

      if (slotsByDay.size > 0) {
        return {
          sourceLabel,
          days: WEEKDAYS.map((wd, idx) => {
            const tuple = slotsByDay.get(idx) ?? ['Rest', 'Rest', 'Rest'];
            return {
              dayIndex: idx,
              dayShort: wd.short,
              dayFull: wd.full,
              dateLabel: dateByDay.get(idx),
              fixtureContext: contextByDay.get(idx) ?? 'Custom Schedule',
              slots: [
                classifyTrainingSession(tuple[0]),
                classifyTrainingSession(tuple[1]),
                classifyTrainingSession(tuple[2]),
              ],
            };
          }),
        };
      }
    } catch {
      return null;
    }
  }

  // 2. Try CSV (supports SemHiel2003/fm27-trainer 8-col EN/NL CSV + legacy 3/4-col CSV)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(';') && !firstLine.includes(',')
      ? ';'
      : ',';
  const headerCols = splitDelimitedLine(firstLine, delimiter).map((c) =>
    c.toLowerCase()
  );

  // Detect upstream 8-column header: date,day,period,type,session1,session2,extra,schedule
  // or Dutch: datum,dag,periode,type,sessie1,sessie2,extra,schema
  const isUpstream8ColHeader =
    (headerCols[0] === 'date' || headerCols[0] === 'datum') &&
    headerCols.some((c) => c === 'session1' || c === 'sessie1');
  const isLegacyDayHeader =
    !isUpstream8ColHeader && /^(?:day|dag)\s*[,;\t]/i.test(firstLine);

  const dataLines =
    isUpstream8ColHeader || isLegacyDayHeader ? lines.slice(1) : lines;
  const slotsByDay = new Map<number, [string, string, string]>();
  const dateByDay = new Map<number, string>();
  const contextByDay = new Map<number, string>();
  let csvSourceLabel = 'Imported CSV Schedule';

  const s1Idx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'session1' || c === 'sessie1')
    : -1;
  const s2Idx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'session2' || c === 'sessie2')
    : -1;
  const extraIdx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'extra' || c === 'session3' || c === 'sessie3')
    : -1;
  const dayColIdx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'day' || c === 'dag')
    : 0;
  const typeColIdx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'type')
    : -1;
  const schedColIdx = isUpstream8ColHeader
    ? headerCols.findIndex((c) => c === 'schedule' || c === 'schema')
    : -1;

  dataLines.slice(0, 7).forEach((line, idx) => {
    const cols = splitDelimitedLine(line, delimiter);
    if (isUpstream8ColHeader && s1Idx >= 0) {
      const dayLabel =
        (dayColIdx >= 0 ? cols[dayColIdx] : '') || cols[0] || '';
      const dIdx = resolveDayIndex(dayLabel, idx);
      slotsByDay.set(dIdx, [
        cols[s1Idx] || 'Rest',
        (s2Idx >= 0 ? cols[s2Idx] : '') || 'Rest',
        (extraIdx >= 0 ? cols[extraIdx] : '') || 'Rest',
      ]);
      if (cols[0]) dateByDay.set(dIdx, cols[0]);
      if (typeColIdx >= 0 && cols[typeColIdx]) {
        contextByDay.set(dIdx, cols[typeColIdx]);
      }
      if (schedColIdx >= 0 && cols[schedColIdx]) {
        csvSourceLabel = cols[schedColIdx];
      }
    } else if (cols.length >= 7 && /^\d{4}-\d{2}-\d{2}$/.test(cols[0])) {
      // Headerless upstream 8-column row
      const dIdx = resolveDayIndex(cols[1] || cols[0], idx);
      slotsByDay.set(dIdx, [
        cols[4] || 'Rest',
        cols[5] || 'Rest',
        cols[6] || 'Rest',
      ]);
      dateByDay.set(dIdx, cols[0]);
      if (cols[3]) contextByDay.set(dIdx, cols[3]);
      if (cols[7]) csvSourceLabel = cols[7];
    } else if (cols.length >= 4) {
      const dIdx = resolveDayIndex(cols[0], idx);
      slotsByDay.set(dIdx, [cols[1] || 'Rest', cols[2] || 'Rest', cols[3] || 'Rest']);
    } else if (cols.length === 3) {
      slotsByDay.set(idx, [cols[0] || 'Rest', cols[1] || 'Rest', cols[2] || 'Rest']);
    }
  });

  if (slotsByDay.size === 0) return null;

  return {
    sourceLabel: csvSourceLabel,
    days: WEEKDAYS.map((wd, idx) => {
      const tuple = slotsByDay.get(idx) ?? ['Rest', 'Rest', 'Rest'];
      return {
        dayIndex: idx,
        dayShort: wd.short,
        dayFull: wd.full,
        dateLabel: dateByDay.get(idx),
        fixtureContext: contextByDay.get(idx) ?? 'Custom CSV Schedule',
        slots: [
          classifyTrainingSession(tuple[0]),
          classifyTrainingSession(tuple[1]),
          classifyTrainingSession(tuple[2]),
        ],
      };
    }),
  };
}

/**
 * Deterministic intensity & fatigue summary across all 21 weekly training slots.
 */
export function summarizeWeeklyTrainingLoad(
  days: WeeklyTrainingDay[]
): WeeklyTrainingLoadSummary {
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let restCount = 0;

  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.intensity === 'high') highCount += 1;
      else if (slot.intensity === 'medium') mediumCount += 1;
      else if (slot.intensity === 'low') lowCount += 1;
      else restCount += 1;
    }
  }

  const rawLoad = highCount * 10 + mediumCount * 5 + lowCount * 2;
  const fatigueIndex = Math.max(0, Math.min(100, Math.round((rawLoad / 115) * 100)));

  let riskTier: WeeklyTrainingLoadSummary['riskTier'] = 'Optimal / Low Injury Risk';
  let summaryNote =
    'Balanced weekly load with post-match recovery slots keeping training injury risk near the 4.0% Playbook v2.0 target.';

  if (fatigueIndex >= 72 || restCount < 2) {
    riskTier = 'High Fatigue / Injury Risk';
    summaryNote =
      'Heavy physical/match density with fewer than 2 rest slots. Swap an extra slot to Recovery or Rest after matchday to protect durability.';
  } else if (fatigueIndex >= 52) {
    riskTier = 'Moderate Load';
    summaryNote =
      'Solid development load. Monitor players below 13 Stamina / Natural Fitness during midweek fixture congestion.';
  }

  return {
    highCount,
    mediumCount,
    lowCount,
    restCount,
    fatigueIndex,
    riskTier,
    summaryNote,
  };
}
