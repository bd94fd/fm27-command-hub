import type { PatchCompatibilitySummary } from '../types/fmSave';

export type SaveCompatibilityLevel =
  | 'verified'
  | 'supported'
  | 'untested'
  | 'unsupported'
  | 'unknown';

export interface SaveCompatibilityMatrixRow {
  id: string;
  label: string;
  buildPrefixes: string[];
  layoutBase: string | null;
  level: Exclude<SaveCompatibilityLevel, 'unknown' | 'unsupported'>;
  fieldsChanged: string[];
  note: string;
}

/**
 * Known FM27 patches and the save-format fields they changed. 27.1 is the verified
 * baseline; 27.0 is accepted on its own layout; later 27.x builds inherit 27.1 and
 * must be treated as untested until their sections decode cleanly.
 */
export const FM27_SAVE_COMPATIBILITY_MATRIX: SaveCompatibilityMatrixRow[] = [
  {
    id: '27.1',
    label: 'FM27 27.1.x',
    buildPrefixes: ['27.1'],
    layoutBase: '27.1',
    level: 'verified',
    fieldsChanged: [
      'Staff Preferred Jobs (job_ratings)',
      'Staff secondary job',
      'Sponsorship dates_reordered warning',
      'ClubTable 5-byte finance tail',
      'Tactics set-piece markers',
    ],
    note: 'Verified baseline. These fields are expected to decode cleanly.',
  },
  {
    id: '27.0',
    label: 'FM27 27.0.x',
    buildPrefixes: ['27.0'],
    layoutBase: '27.0',
    level: 'supported',
    fieldsChanged: [
      'ClubTable 0-byte finance tail',
      'No Preferred Jobs on staff records',
      'Older tactics set-piece layout',
    ],
    note: 'Supported on the 27.0 layout. Newer 27.1 fields may be absent.',
  },
  {
    id: '27.2',
    label: 'FM27 27.2.x',
    buildPrefixes: ['27.2'],
    layoutBase: '27.1',
    level: 'untested',
    fieldsChanged: ['Layout inherited from 27.1', 'Dynamic build registration'],
    note: 'Import continues with the 27.1 layout. Review fallback and unavailable sections before trusting edge-case fields.',
  },
];

export interface SaveCompatibilityMetaInput {
  build?: string | null;
  game?: string | null;
  knownBuild?: boolean | null;
  fmsaveVersion?: string | null;
  patchCompatibility?: PatchCompatibilitySummary | null;
}

export interface SaveCompatibilityResolution {
  level: SaveCompatibilityLevel;
  rowId: string;
  label: string;
  build: string;
  fmsaveVersion: string;
  layoutBase: string | null;
  fieldsChanged: string[];
  message: string;
  needsAttention: boolean;
}

const UNSUPPORTED_MESSAGE =
  'Unsupported save. This is not a recognised FM27 27.x build, so the Hub does not trust any FM27 field from it. Import a save from a supported FM27 27.0 or 27.1 build.';

function unsupported(
  build: string,
  fmsaveVersion: string,
  label = 'Unsupported save'
): SaveCompatibilityResolution {
  return {
    level: 'unsupported',
    rowId: 'unsupported',
    label,
    build,
    fmsaveVersion,
    layoutBase: null,
    fieldsChanged: [],
    message: UNSUPPORTED_MESSAGE,
    needsAttention: true,
  };
}

function matchRow(build: string): SaveCompatibilityMatrixRow | null {
  const normalised = build.trim().toLowerCase();
  return (
    FM27_SAVE_COMPATIBILITY_MATRIX.find((row) =>
      row.buildPrefixes.some((prefix) => normalised.startsWith(prefix))
    ) ?? null
  );
}

/**
 * Resolves the current save against the known compatibility matrix. The UI and the Analyst
 * use this one answer so a save is never "verified" on one surface and "unsupported" on another.
 */
export function resolveSaveCompatibility(
  meta: SaveCompatibilityMetaInput | null | undefined
): SaveCompatibilityResolution {
  const compat = meta?.patchCompatibility ?? null;
  const build = (compat?.detectedBuild || meta?.build || 'unknown').trim() || 'unknown';
  const fmsaveVersion = meta?.fmsaveVersion || 'unknown';

  if (compat && compat.isFm27 === false) {
    return unsupported(build, fmsaveVersion, 'Not an FM27 save');
  }

  const game = (meta?.game || '').trim().toLowerCase();
  if (game && !game.includes('fm27') && !game.includes('football manager 27')) {
    return unsupported(build, fmsaveVersion, 'Not an FM27 save');
  }

  const row = matchRow(build);
  if (row) {
    const inherited = compat?.layoutStatus === 'dynamic' || compat?.isUntestedBuild;
    const level: SaveCompatibilityLevel =
      row.level === 'verified' && inherited ? 'untested' : row.level;
    const message =
      level === 'verified'
        ? 'Verified. These fields decode on the known 27.1 layout.'
        : level === 'supported'
          ? 'Supported. The save uses the 27.0 layout, so newer 27.1 fields may be absent.'
          : 'Untested build. Import continues with the inherited layout; check fallback and unavailable sections before trusting edge-case fields.';
    return {
      level,
      rowId: row.id,
      label: row.label,
      build,
      fmsaveVersion,
      layoutBase: compat?.layoutBase ?? row.layoutBase,
      fieldsChanged: row.fieldsChanged,
      message,
      needsAttention: level === 'untested',
    };
  }

  if (compat && (compat.isUntestedBuild || compat.layoutStatus === 'dynamic')) {
    return {
      level: 'untested',
      rowId: 'dynamic',
      label: 'New FM27 build',
      build,
      fmsaveVersion,
      layoutBase: compat.layoutBase,
      fieldsChanged: ['Layout inherited from the closest 27.x base'],
      message:
        'Untested build. Import continues with the inherited layout; check fallback and unavailable sections before trusting edge-case fields.',
      needsAttention: true,
    };
  }

  if (meta?.knownBuild === false) {
    return {
      level: 'untested',
      rowId: 'unknown',
      label: 'Unverified FM27 build',
      build,
      fmsaveVersion,
      layoutBase: compat?.layoutBase ?? null,
      fieldsChanged: [],
      message:
        'Unverified build. The decoder could not confirm this layout, so check every section before relying on it.',
      needsAttention: true,
    };
  }

  return unsupported(build, fmsaveVersion, 'Build not recognised');
}

export function formatSaveCompatibilityForAnalyst(
  resolution: SaveCompatibilityResolution
): string {
  return [
    `Save compatibility: ${resolution.label} · ${resolution.build} · fmsave ${resolution.fmsaveVersion}`,
    `Level: ${resolution.level}${resolution.layoutBase ? ` · layout ${resolution.layoutBase}` : ''}`,
    resolution.fieldsChanged.length > 0
      ? `Fields changed: ${resolution.fieldsChanged.join('; ')}`
      : null,
    `Behavior: ${resolution.message}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}
