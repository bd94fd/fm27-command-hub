import type { PatchCompatibilitySectionStatus } from '../types/fmSave';
import type { PatchDiagnosticPayload } from './fm27PatchDiagnostics';

export const FM27_BUILD_MEMORY_STORAGE_KEY = 'fm27-build-memory-v1';

export interface BuildMemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Fm27BuildSectionMemory {
  id: string;
  label: string;
  status: PatchCompatibilitySectionStatus;
  fallbacks: number;
  lastSeenIso: string;
}

export interface Fm27BuildProfile {
  build: string;
  fmsaveVersion: string;
  layoutStatus: string;
  layoutBase: string | null;
  firstSeenIso: string;
  lastSeenIso: string;
  seenCount: number;
  cleanCount: number;
  patchedCount: number;
  fallbackCount: number;
  unavailableCount: number;
  sections: Record<string, Fm27BuildSectionMemory>;
}

export interface Fm27BuildMemory {
  schema: 'fm27-build-memory/v1';
  profiles: Record<string, Fm27BuildProfile>;
}

function emptyMemory(): Fm27BuildMemory {
  return { schema: 'fm27-build-memory/v1', profiles: {} };
}

function defaultStorage(): BuildMemoryStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function buildMemoryKey(build: string, fmsaveVersion: string): string {
  return `${build || 'unknown'}::${fmsaveVersion || 'unknown'}`;
}

export function loadFm27BuildMemory(
  storage: BuildMemoryStorage | null | undefined = undefined
): Fm27BuildMemory {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return emptyMemory();
  try {
    const raw = target.getItem(FM27_BUILD_MEMORY_STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as Partial<Fm27BuildMemory> | null;
    if (
      !parsed ||
      parsed.schema !== 'fm27-build-memory/v1' ||
      typeof parsed.profiles !== 'object' ||
      parsed.profiles === null
    ) {
      return emptyMemory();
    }
    return { schema: 'fm27-build-memory/v1', profiles: parsed.profiles };
  } catch {
    return emptyMemory();
  }
}

export function saveFm27BuildMemory(
  memory: Fm27BuildMemory,
  storage: BuildMemoryStorage | null | undefined = undefined
): boolean {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return false;
  try {
    target.setItem(FM27_BUILD_MEMORY_STORAGE_KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}

export function getFm27BuildProfile(
  build: string,
  fmsaveVersion = 'unknown',
  storage: BuildMemoryStorage | null | undefined = undefined
): Fm27BuildProfile | null {
  if (!build) return null;
  const memory = loadFm27BuildMemory(storage);
  const exact = memory.profiles[buildMemoryKey(build, fmsaveVersion)];
  if (exact) return exact;

  const sameBuild = Object.values(memory.profiles)
    .filter((profile) => profile.build === build)
    .sort((a, b) => b.lastSeenIso.localeCompare(a.lastSeenIso));
  return sameBuild[0] ?? null;
}

export function recordFm27BuildRun(
  payload: PatchDiagnosticPayload | null | undefined,
  storage: BuildMemoryStorage | null | undefined = undefined
): Fm27BuildProfile | null {
  const meta = payload?.meta ?? {};
  const compat = meta.patchCompatibility ?? null;
  if (!compat?.detectedBuild) return null;

  const build = compat.detectedBuild;
  const fmsaveVersion = meta.fmsaveVersion || 'unknown';
  const key = buildMemoryKey(build, fmsaveVersion);
  const memory = loadFm27BuildMemory(storage);
  const existing = memory.profiles[key] ?? null;
  const now = new Date().toISOString();

  const currentSections = Array.isArray(compat.sections) ? compat.sections : [];
  const sections: Record<string, Fm27BuildSectionMemory> = {
    ...(existing?.sections ?? {}),
  };
  const counts: Record<PatchCompatibilitySectionStatus, number> = {
    clean: 0,
    patched: 0,
    fallback: 0,
    unavailable: 0,
  };
  for (const section of currentSections) {
    counts[section.status] += 1;
    sections[section.id] = {
      id: section.id,
      label: section.label,
      status: section.status,
      fallbacks: section.fallbacks ?? 0,
      lastSeenIso: now,
    };
  }

  const profile: Fm27BuildProfile = {
    build,
    fmsaveVersion,
    layoutStatus: compat.layoutStatus,
    layoutBase: compat.layoutBase,
    firstSeenIso: existing?.firstSeenIso ?? now,
    lastSeenIso: now,
    seenCount: (existing?.seenCount ?? 0) + 1,
    cleanCount: counts.clean,
    patchedCount: counts.patched,
    fallbackCount: counts.fallback,
    unavailableCount: counts.unavailable,
    sections,
  };
  memory.profiles[key] = profile;
  saveFm27BuildMemory(memory, storage);
  return profile;
}
