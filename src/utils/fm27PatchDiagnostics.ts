import type {
  PatchCompatibilitySectionStatus,
  PatchCompatibilitySummary,
} from '../types/fmSave';

export interface PatchDiagnosticManifest {
  totalPlayers?: number;
  staff?: number;
  playedMatches?: number;
  upcomingFixtures?: number;
  playerMatchStats?: number;
  playerSeasonHistory?: number;
  tactics?: number;
  warningsCount?: number;
}

export interface PatchDiagnosticPayload {
  meta?: {
    build?: string;
    game?: string;
    saveName?: string;
    gameDateDmy?: string | null;
    clubUid?: number | null;
    clubName?: string;
    managerName?: string;
    knownBuild?: boolean;
    fmsaveVersion?: string;
    importScope?: string;
    fastSync?: boolean;
    patchCompatibility?: PatchCompatibilitySummary | null;
  } | null;
  extractionManifest?: PatchDiagnosticManifest | null;
  warnings?: string[];
  extractionWarnings?: string[];
}

export interface Fm27HandoffVerdict {
  headline: string;
  detail: string;
  needsAttention: boolean;
}

export interface Fm27AgentHandoffSection {
  id: string;
  label: string;
  status: PatchCompatibilitySectionStatus;
  fallbacks: number;
  detail: string;
}

export interface Fm27AgentHandoff {
  schema: 'fm27-build-handoff/v1';
  generatedAtIso: string;
  build: string;
  game: string;
  saveName: string;
  gameDate: string;
  club: string;
  manager: string;
  fmsaveVersion: string;
  importScope: string;
  fastSync: boolean;
  layout: {
    status: string;
    base: string | null;
    newOrUntested: boolean;
    runtimePatchesApplied: boolean;
    dynamicBuildRegistered: boolean;
    summary: string;
    advisory: string | null;
  } | null;
  verdict: Fm27HandoffVerdict;
  counts: Record<PatchCompatibilitySectionStatus, number>;
  sections: Fm27AgentHandoffSection[];
  needsAttention: Fm27AgentHandoffSection[];
  extraction: Record<string, number>;
  readerNotes: string[];
  nextProbes: string[];
}

const SECTION_PROBES: Record<string, string> = {
  tactics_set_piece:
    'Compare the tactics taker-marker sequence and the ten selector lists against the 27.1 layout.',
  squad_planner:
    'Compare the SquadPlanner lead bytes before 48000102 0f2d0764 and the selector count.',
  managed_club:
    'Check whether manager_name is followed by club.uid or club.unique_id in save_game_summary.',
  scouting_budget:
    'Check the two scouting dates and the budget/remaining pair after 48000102 0f2d0764.',
  club_table:
    'Compare the ClubTable finance tail: 27.0 uses a 0-byte tail, 27.1 uses a 5-byte tail.',
  players: 'Compare the player attribute block stride and section start/end offsets.',
  staff: 'Compare the staff record stride and the department/job fields.',
  finances: 'Compare the finance table tail and the wage/balance field offsets.',
  tactics: 'Compare the tactic region markers and the selection block boundaries.',
  selections: 'Compare the selection block start/end and the set-piece marker handling.',
  set_pieces: 'Compare the set-piece taker marker sequence.',
  season_stats: 'Compare the season-stat row stride and competition IDs.',
  fixtures: 'Compare the fixture date/competition/opponent field order.',
  league_table: 'Compare the league-table row width and tie-break fields.',
  governance: 'Compare the board/manager-contract probe offsets.',
  binary_forensics: 'Compare the section inventory offsets and lengths.',
};

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function describeFm27HandoffVerdict(
  compat?: PatchCompatibilitySummary | null
): Fm27HandoffVerdict {
  if (!compat) {
    return {
      headline: 'No build diagnostics available',
      detail: 'The decoder did not return a compatibility summary. Re-import the save to populate it.',
      needsAttention: true,
    };
  }

  if (!compat.isFm27) {
    return {
      headline: 'Not an FM27 save',
      detail: 'The runtime FM27 layout overlay was not used for this build.',
      needsAttention: false,
    };
  }

  const fallbackCount = compat.sections.filter((section) => section.status === 'fallback').length;
  const unavailableCount = compat.sections.filter(
    (section) => section.status === 'unavailable'
  ).length;

  if (unavailableCount > 0) {
    return {
      headline: 'Decoded with gaps',
      detail: `${unavailableCount} section${unavailableCount === 1 ? '' : 's'} returned no rows. Check the handoff packet before trusting the affected screens.`,
      needsAttention: true,
    };
  }

  if (fallbackCount > 0) {
    return {
      headline: 'Decoded with fallbacks',
      detail: `${fallbackCount} section${fallbackCount === 1 ? '' : 's'} needed a runtime fallback. The save is usable, but review those sections before trusting edge-case fields.`,
      needsAttention: true,
    };
  }

  if (compat.isUntestedBuild || compat.layoutStatus === 'dynamic') {
    return {
      headline: 'New FM27 build — decoded cleanly',
      detail:
        'The app inherited the closest 27.x layout and no section needed a fallback. Spot-check new fields before relying on them.',
      needsAttention: false,
    };
  }

  return {
    headline: 'Decoded normally',
    detail: 'No fallback or missing section was reported for this build.',
    needsAttention: false,
  };
}

export function buildFm27AgentHandoff(
  payload: PatchDiagnosticPayload | null | undefined
): Fm27AgentHandoff {
  const meta = payload?.meta ?? {};
  const compat = meta.patchCompatibility ?? null;
  const verdict = describeFm27HandoffVerdict(compat);
  const sections: Fm27AgentHandoffSection[] = (compat?.sections ?? []).map((section) => ({
    id: section.id,
    label: section.label,
    status: section.status,
    fallbacks: section.fallbacks ?? 0,
    detail: section.detail ?? '',
  }));
  const counts: Record<PatchCompatibilitySectionStatus, number> = {
    clean: 0,
    patched: 0,
    fallback: 0,
    unavailable: 0,
  };
  for (const section of sections) counts[section.status] += 1;

  const needsAttention = sections.filter(
    (section) => section.status === 'fallback' || section.status === 'unavailable'
  );
  const nextProbes = uniqueStrings(
    needsAttention.map((section) => SECTION_PROBES[section.id] ?? '')
  );
  if (nextProbes.length === 0 && compat?.isUntestedBuild) {
    nextProbes.push(
      'No section failed. Compare the new build against the 27.1 layout only if a specific field looks wrong.'
    );
  }

  const extraction: Record<string, number> = {};
  for (const [key, value] of Object.entries(payload?.extractionManifest ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) extraction[key] = value;
  }

  return {
    schema: 'fm27-build-handoff/v1',
    generatedAtIso: new Date().toISOString(),
    build: compat?.detectedBuild || meta.build || 'unknown',
    game: meta.game || 'FM',
    saveName: meta.saveName || 'unknown',
    gameDate: meta.gameDateDmy || 'unknown',
    club: meta.clubName || 'unknown',
    manager: meta.managerName || 'unknown',
    fmsaveVersion: meta.fmsaveVersion || 'unknown',
    importScope: meta.importScope || 'unknown',
    fastSync: Boolean(meta.fastSync),
    layout: compat
      ? {
          status: compat.layoutStatus,
          base: compat.layoutBase,
          newOrUntested: compat.isUntestedBuild || compat.layoutStatus === 'dynamic',
          runtimePatchesApplied: compat.runtimePatchesApplied,
          dynamicBuildRegistered: compat.dynamicBuildRegistered,
          summary: compat.summary,
          advisory: compat.advisory ?? null,
        }
      : null,
    verdict,
    counts,
    sections,
    needsAttention,
    extraction,
    readerNotes: uniqueStrings([
      ...(payload?.warnings ?? []),
      ...(payload?.extractionWarnings ?? []),
    ]),
    nextProbes,
  };
}

export function formatFm27AgentHandoff(handoff: Fm27AgentHandoff): string {
  const lines: string[] = [
    `# FM27 build handoff — ${handoff.build}`,
    '',
    '## What this is',
    'A decode run of an FM27 save. Use this packet to find the layout or schema change.',
    'Do not invent values. Ask for the .fm file if you need byte-level probes.',
    '',
    '## Save',
    `- Build: ${handoff.build}`,
    `- fmsave: ${handoff.fmsaveVersion}`,
    `- Game: ${handoff.game}`,
    `- Save: ${handoff.saveName}`,
    `- Date: ${handoff.gameDate}`,
    `- Club: ${handoff.club}`,
    `- Manager: ${handoff.manager}`,
    `- Import scope: ${handoff.importScope}`,
    `- Fast sync: ${handoff.fastSync ? 'yes' : 'no'}`,
    '',
    '## Verdict',
    `**${handoff.verdict.headline}.** ${handoff.verdict.detail}`,
    `Counts: clean ${handoff.counts.clean} · patched ${handoff.counts.patched} · fallback ${handoff.counts.fallback} · unavailable ${handoff.counts.unavailable}`,
  ];

  if (handoff.layout) {
    lines.push(
      `Layout: ${handoff.layout.status}${handoff.layout.base ? ` (${handoff.layout.base} base)` : ''} · runtime patches ${handoff.layout.runtimePatchesApplied ? 'applied' : 'inactive'}`
    );
    if (handoff.layout.advisory) lines.push(`Advisory: ${handoff.layout.advisory}`);
  }

  if (handoff.needsAttention.length > 0) {
    lines.push('', '## Sections needing attention');
    for (const section of handoff.needsAttention) {
      lines.push(
        `- ${section.label}: ${section.status}${section.fallbacks ? ` (${section.fallbacks} fallback${section.fallbacks === 1 ? '' : 's'})` : ''}${section.detail ? ` — ${section.detail}` : ''}`
      );
    }
  }

  if (handoff.extraction && Object.keys(handoff.extraction).length > 0) {
    lines.push('', '## Extracted');
    lines.push(
      Object.entries(handoff.extraction)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    );
  }

  if (handoff.readerNotes.length > 0) {
    lines.push('', '## Reader notes');
    lines.push(handoff.readerNotes.map((note) => `- ${note}`).join('\n'));
  }

  if (handoff.nextProbes.length > 0) {
    lines.push('', '## Suggested next probes');
    lines.push(handoff.nextProbes.map((probe, index) => `${index + 1}. ${probe}`).join('\n'));
  }

  lines.push(
    '',
    '## Agent instruction',
    'Work out why the sections above failed. Return a minimal patch plan: the section, the layout assumption, the byte pattern to inspect, and the smallest safe change. Do not guess decoded values.'
  );

  return lines.join('\n');
}

export function isNewFm27BuildDetected(
  compat?: PatchCompatibilitySummary | null
): boolean {
  if (!compat || !compat.isFm27) return false;
  return Boolean(compat.isUntestedBuild) || compat.layoutStatus === 'dynamic';
}

export function describePatchLayout(compat: PatchCompatibilitySummary): string {
  switch (compat.layoutStatus) {
    case 'dynamic':
      return `dynamic layout (${compat.layoutBase ?? '27.x'} base)`;
    case 'known':
      return 'known layout';
    case 'not-fm27':
      return 'non-FM27 build';
    default:
      return 'unverified layout';
  }
}

const SECTION_STATUS_ORDER: PatchCompatibilitySectionStatus[] = [
  'fallback',
  'unavailable',
  'patched',
  'clean',
];

export function buildPatchDiagnosticReport(
  payload: PatchDiagnosticPayload | null | undefined
): string {
  const meta = payload?.meta ?? {};
  const compat = meta.patchCompatibility ?? null;
  const build = compat?.detectedBuild || meta.build || 'unknown';
  const lines: string[] = [`FM27 PATCH DIAGNOSTIC · ${build}`];

  const saveBits = [
    meta.saveName,
    meta.gameDateDmy,
    meta.fmsaveVersion ? `fmsave ${meta.fmsaveVersion}` : null,
  ].filter((bit): bit is string => Boolean(bit));
  if (saveBits.length > 0) lines.push(`Save: ${saveBits.join(' · ')}`);

  if (compat) {
    const buildState = isNewFm27BuildDetected(compat)
      ? 'NEW/UNTESTED — layouts inherited, extraction continued'
      : 'verified for this layout';
    lines.push(
      `Layout: ${describePatchLayout(compat)} · runtime patches ${
        compat.runtimePatchesApplied ? 'applied' : 'inactive'
      }`
    );
    lines.push(`Build: ${buildState}`);

    if (compat.sections.length > 0) {
      lines.push('Sections:');
      for (const status of SECTION_STATUS_ORDER) {
        const labels = compat.sections
          .filter((section) => section.status === status)
          .map((section) => {
            const count = section.fallbacks && section.fallbacks > 0 ? ` (${section.fallbacks})` : '';
            return `${section.label}${count}`;
          });
        if (labels.length > 0) lines.push(`- ${status}: ${labels.join(', ')}`);
      }
    }
  } else {
    lines.push('Patch compatibility: unavailable for this save (no runtime summary returned).');
  }

  const manifest = payload?.extractionManifest;
  if (manifest) {
    const stats = (manifest.playerMatchStats ?? 0) + (manifest.playerSeasonHistory ?? 0);
    const extractedBits = [
      `players ${manifest.totalPlayers ?? 0}`,
      `staff ${manifest.staff ?? 0}`,
      `results ${manifest.playedMatches ?? 0}`,
      `fixtures ${manifest.upcomingFixtures ?? 0}`,
      `tactics ${manifest.tactics ?? 0}`,
      `stats ${stats}`,
    ];
    lines.push(`Extracted: ${extractedBits.join(' · ')}`);
  }

  const warnings = new Set([
    ...(payload?.warnings ?? []),
    ...(payload?.extractionWarnings ?? []),
  ]);
  const warningCount = warnings.size || manifest?.warningsCount || 0;
  if (warningCount > 0) lines.push(`Reader notes: ${warningCount}`);

  if (compat?.advisory) lines.push(`Note: ${compat.advisory}`);

  return lines.join('\n');
}
