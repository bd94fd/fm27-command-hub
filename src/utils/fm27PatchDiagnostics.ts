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
    fmsaveVersion?: string;
    patchCompatibility?: PatchCompatibilitySummary | null;
  } | null;
  extractionManifest?: PatchDiagnosticManifest | null;
  warnings?: string[];
  extractionWarnings?: string[];
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
