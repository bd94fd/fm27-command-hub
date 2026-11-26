import type { DecodedFmSavePayload } from './fmSaveHydrator';
import { auditDecoderFieldCoverage } from './decoderFieldCoverage';

export type DataQualitySeverity = 'ok' | 'info' | 'warn' | 'critical';

export interface DataQualityGap {
  key: string;
  label: string;
  total: number;
  missing: number;
  pct: number;
  severity: DataQualitySeverity;
}

export interface DataQualitySection {
  id: string;
  title: string;
  gaps: DataQualityGap[];
}

export interface DataQualityCoverage {
  total: number;
  supplied: number;
  partial: number;
  missing: number;
  empty: number;
  pct: number;
}

export interface SaveDataQualityReport {
  clubName: string;
  saveDate: string;
  fileName: string;
  scorePct: number;
  checks: { total: number; missing: number };
  coverage: DataQualityCoverage;
  sections: DataQualitySection[];
  warnings: string[];
  missingSections: string[];
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function gap(
  key: string,
  label: string,
  total: number,
  missing: number,
  severity: DataQualitySeverity
): DataQualityGap {
  const safeTotal = Math.max(0, total);
  const safeMissing = Math.min(safeTotal, Math.max(0, missing));
  return {
    key,
    label,
    total: safeTotal,
    missing: safeMissing,
    pct: safeTotal > 0 ? Math.round(((safeTotal - safeMissing) / safeTotal) * 100) : 100,
    severity: safeMissing > 0 ? severity : 'ok',
  };
}

function countMissing<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.reduce((count, item) => (predicate(item) ? count + 1 : count), 0);
}

function coverageFor(payload: DecodedFmSavePayload): DataQualityCoverage {
  const rows = auditDecoderFieldCoverage(payload).filter(
    (row) => row.origin === 'decoder' || row.origin === 'decoder-optional'
  );
  const total = rows.length;
  const supplied = rows.filter((row) => row.status === 'supplied').length;
  const partial = rows.filter((row) => row.status === 'partial').length;
  const missing = rows.filter((row) => row.status === 'missing').length;
  const empty = rows.filter((row) => row.status === 'empty').length;
  return {
    total,
    supplied,
    partial,
    missing,
    empty,
    pct: total > 0 ? Math.round((supplied / total) * 100) : 100,
  };
}

export function buildSaveDataQualityReport(
  payload: DecodedFmSavePayload
): SaveDataQualityReport {
  const players = Array.isArray(payload.players) ? payload.players : [];
  const staff = Array.isArray(payload.staff) ? payload.staff : [];
  const matches = Array.isArray(payload.playedMatches) ? payload.playedMatches : [];
  const targets = Array.isArray(payload.recruitmentTargets)
    ? payload.recruitmentTargets
    : [];
  const tactics = Array.isArray(payload.tactics) ? payload.tactics : [];
  const monthlyFinances = Array.isArray(payload.monthlyFinances)
    ? payload.monthlyFinances
    : [];
  const sponsorships = Array.isArray(payload.sponsorships) ? payload.sponsorships : [];
  const fixtures = Array.isArray(payload.upcomingFixtures)
    ? payload.upcomingFixtures
    : [];

  const squadGaps = [
    gap(
      'player-wages',
      'Player wages',
      players.length,
      countMissing(players, (p) => !isNumber(p.wagePw)),
      'critical'
    ),
    gap(
      'player-ages',
      'Player ages',
      players.length,
      countMissing(players, (p) => !isNumber(p.age)),
      'warn'
    ),
    gap(
      'player-contracts',
      'Player contracts',
      players.length,
      countMissing(players, (p) => !isText(p.expires)),
      'warn'
    ),
    gap(
      'player-positions',
      'Player positions',
      players.length,
      countMissing(players, (p) => !isText(p.position)),
      'critical'
    ),
    gap(
      'player-attributes',
      'Player attributes',
      players.length,
      countMissing(players, (p) => !p.attributes),
      'critical'
    ),
    gap(
      'player-values',
      'Player market values',
      players.length,
      countMissing(players, (p) => !isNumber(p.marketValue) || p.marketValue <= 0),
      'info'
    ),
  ];

  const staffGaps = [
    gap(
      'staff-roles',
      'Staff roles',
      staff.length,
      countMissing(staff, (s) => !isText(s.role)),
      'critical'
    ),
    gap(
      'staff-wages',
      'Staff wages',
      staff.length,
      countMissing(staff, (s) => !isNumber(s.wagePw)),
      'warn'
    ),
    gap(
      'staff-contracts',
      'Staff contracts',
      staff.length,
      countMissing(staff, (s) => !isText(s.expires)),
      'warn'
    ),
    gap(
      'staff-affinity',
      'Preferred job affinity',
      staff.length,
      countMissing(staff, (s) => !s.jobRatings),
      'info'
    ),
    gap(
      'staff-secondary-job',
      'Secondary jobs',
      staff.length,
      countMissing(staff, (s) => !isText(s.secondaryJob)),
      'info'
    ),
  ];

  const matchGaps = [
    gap(
      'match-dates',
      'Match dates',
      matches.length,
      countMissing(matches, (m) => !isText(m.dateIso) && !isText(m.dateDmy)),
      'warn'
    ),
    gap(
      'match-opponents',
      'Match opponents',
      matches.length,
      countMissing(matches, (m) => !isText(m.opponent)),
      'warn'
    ),
    gap(
      'match-xg',
      'Match xG',
      matches.length,
      countMissing(matches, (m) => !isNumber(m.xGFor) || !isNumber(m.xGAgainst)),
      'info'
    ),
  ];

  const recruitmentGaps = [
    gap(
      'target-wages',
      'Target wages',
      targets.length,
      countMissing(
        targets,
        (t) => !isNumber(t.currentWagePw) && !isNumber(t.demandedWageEur)
      ),
      'warn'
    ),
    gap(
      'target-values',
      'Target values',
      targets.length,
      countMissing(targets, (t) => !isNumber(t.transferValue)),
      'info'
    ),
  ];

  const missingSections: string[] = [];
  if (!payload.leagueStanding) missingSections.push('League table');
  if (!payload.finances) missingSections.push('Club finances');
  if (monthlyFinances.length === 0) missingSections.push('Monthly finances');
  if (tactics.length === 0) missingSections.push('Tactics');
  if (sponsorships.length === 0) missingSections.push('Sponsorships');
  if (targets.length === 0) missingSections.push('Recruitment targets');
  if (fixtures.length === 0) missingSections.push('Upcoming fixtures');

  const warnings = Array.from(
    new Set(
      [
        ...(Array.isArray(payload.warnings) ? payload.warnings : []),
        ...(Array.isArray(payload.extractionWarnings) ? payload.extractionWarnings : []),
      ].filter((warning): warning is string => isText(warning))
    )
  );

  const sections: DataQualitySection[] = [
    { id: 'squad', title: 'Squad', gaps: squadGaps },
    { id: 'staff', title: 'Staff', gaps: staffGaps },
    { id: 'matches', title: 'Matches', gaps: matchGaps },
    { id: 'recruitment', title: 'Recruitment', gaps: recruitmentGaps },
  ];

  const scoredGaps = sections
    .flatMap((section) => section.gaps)
    .filter((item) => item.severity !== 'info' && item.total > 0);
  const scoredTotal = scoredGaps.reduce((sum, item) => sum + item.total, 0);
  const scoredMissing = scoredGaps.reduce((sum, item) => sum + item.missing, 0);

  return {
    clubName: payload.meta?.clubName || 'Managed Club',
    saveDate: payload.meta?.gameDateDmy || payload.meta?.gameDateIso || '--',
    fileName: payload.meta?.fileName || payload.meta?.saveName || 'fm27-save',
    scorePct:
      scoredTotal > 0
        ? Math.round(((scoredTotal - scoredMissing) / scoredTotal) * 100)
        : 100,
    checks: { total: scoredTotal, missing: scoredMissing },
    coverage: coverageFor(payload),
    sections,
    warnings,
    missingSections,
  };
}

export function formatSaveDataQualityForAnalyst(
  report: SaveDataQualityReport
): string {
  const gaps = report.sections
    .flatMap((section) =>
      section.gaps
        .filter((item) => item.missing > 0 && item.severity !== 'info')
        .map((item) => `${item.label} ${item.missing}/${item.total} missing`)
    )
    .slice(0, 8);
  const warningLines = report.warnings.slice(0, 5);
  return `=== SAVE DATA QUALITY (SHARED WITH THE HUB DATA TAB) ===
Completeness: ${report.scorePct}% (${report.checks.missing} missing checks out of ${report.checks.total}) | Field coverage: ${report.coverage.supplied}/${report.coverage.total} supplied, ${report.coverage.partial} partial, ${report.coverage.missing} missing, ${report.coverage.empty} empty.
Missing sections: ${report.missingSections.length > 0 ? report.missingSections.join(', ') : 'none'}
Gaps: ${gaps.length > 0 ? gaps.join('; ') : 'none'}
Reader warnings: ${warningLines.length > 0 ? warningLines.join('; ') : 'none'}
Never invent a missing value. If the save does not supply it, say so and name the gap.
`;
}
