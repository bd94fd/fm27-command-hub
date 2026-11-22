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

/**
 * Normalizes dynamic fixture-periodised rows into a 7-day Mon-Sun planner.
 */
export function buildWeeklyPlannerFromDynamicSchedule(
  rows: DynamicTrainingInputRow[]
): WeeklyTrainingDay[] {
  const byDay = new Map<number, DynamicTrainingInputRow>();

  for (const row of rows.slice(0, 7)) {
    const parsed = Date.parse(row.date);
    if (!Number.isNaN(parsed)) {
      const jsDay = new Date(parsed).getDay(); // 0=Sun..6=Sat
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
  if (lower.startsWith('mon')) return 0;
  if (lower.startsWith('tue')) return 1;
  if (lower.startsWith('wed')) return 2;
  if (lower.startsWith('thu')) return 3;
  if (lower.startsWith('fri')) return 4;
  if (lower.startsWith('sat')) return 5;
  if (lower.startsWith('sun')) return 6;
  return Math.max(0, Math.min(6, fallbackIndex));
}

/**
 * Parses SemHiel2003/fm27-trainer JSON or CSV schedule exports into a 7-day planner.
 */
export function parseFm27TrainerSchedule(
  rawText: string
): { days: WeeklyTrainingDay[]; sourceLabel: string } | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Try JSON (fm27-trainer formats: { days: [...] }, { schedule: { Monday: [...] } }, or [...])
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const slotsByDay = new Map<number, [string, string, string]>();
      let sourceLabel = 'Imported fm27-trainer JSON';

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.name === 'string' && obj.name.trim()) {
          sourceLabel = obj.name.trim();
        }
        const rawDays = Array.isArray(obj.days)
          ? obj.days
          : Array.isArray(obj.schedule)
            ? obj.schedule
            : null;

        if (rawDays) {
          rawDays.slice(0, 7).forEach((entry, idx) => {
            if (entry && typeof entry === 'object') {
              const rec = entry as Record<string, unknown>;
              const dIdx = resolveDayIndex(String(rec.day ?? rec.name ?? ''), idx);
              const arr = Array.isArray(rec.sessions)
                ? rec.sessions
                : Array.isArray(rec.slots)
                  ? rec.slots
                  : [rec.slot1 ?? rec.session1, rec.slot2 ?? rec.session2, rec.slot3 ?? rec.extra ?? rec.session3];
              slotsByDay.set(dIdx, [
                String(arr[0] ?? 'Rest'),
                String(arr[1] ?? 'Rest'),
                String(arr[2] ?? 'Rest'),
              ]);
            }
          });
        } else if (obj.schedule && typeof obj.schedule === 'object') {
          const sched = obj.schedule as Record<string, unknown>;
          Object.entries(sched).forEach(([k, v], idx) => {
            const dIdx = resolveDayIndex(k, idx);
            if (Array.isArray(v)) {
              slotsByDay.set(dIdx, [
                String(v[0] ?? 'Rest'),
                String(v[1] ?? 'Rest'),
                String(v[2] ?? 'Rest'),
              ]);
            }
          });
        }
      } else if (Array.isArray(parsed)) {
        parsed.slice(0, 7).forEach((entry, idx) => {
          if (Array.isArray(entry)) {
            slotsByDay.set(idx, [
              String(entry[0] ?? 'Rest'),
              String(entry[1] ?? 'Rest'),
              String(entry[2] ?? 'Rest'),
            ]);
          } else if (entry && typeof entry === 'object') {
            const rec = entry as Record<string, unknown>;
            const dIdx = resolveDayIndex(String(rec.day ?? rec.name ?? ''), idx);
            const arr = Array.isArray(rec.sessions)
              ? rec.sessions
              : Array.isArray(rec.slots)
                ? rec.slots
                : [rec.slot1 ?? rec.session1, rec.slot2 ?? rec.session2, rec.slot3 ?? rec.extra ?? rec.session3];
            slotsByDay.set(dIdx, [
              String(arr[0] ?? 'Rest'),
              String(arr[1] ?? 'Rest'),
              String(arr[2] ?? 'Rest'),
            ]);
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
              fixtureContext: 'Custom Schedule',
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

  // 2. Try CSV (Day, Slot 1, Slot 2, Slot 3)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const dataLines = /^day\s*[,;\t]/i.test(lines[0]) ? lines.slice(1) : lines;
  const slotsByDay = new Map<number, [string, string, string]>();

  dataLines.slice(0, 7).forEach((line, idx) => {
    const cols = line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length >= 4) {
      const dIdx = resolveDayIndex(cols[0], idx);
      slotsByDay.set(dIdx, [cols[1] || 'Rest', cols[2] || 'Rest', cols[3] || 'Rest']);
    } else if (cols.length === 3) {
      slotsByDay.set(idx, [cols[0] || 'Rest', cols[1] || 'Rest', cols[2] || 'Rest']);
    }
  });

  if (slotsByDay.size === 0) return null;

  return {
    sourceLabel: 'Imported CSV Schedule',
    days: WEEKDAYS.map((wd, idx) => {
      const tuple = slotsByDay.get(idx) ?? ['Rest', 'Rest', 'Rest'];
      return {
        dayIndex: idx,
        dayShort: wd.short,
        dayFull: wd.full,
        fixtureContext: 'Custom CSV Schedule',
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
