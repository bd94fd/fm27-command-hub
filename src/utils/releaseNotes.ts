/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReleaseSectionKey = 'breaking' | 'added' | 'fixed' | 'changed' | 'maintenance';

export interface ReleaseCommitInput {
  hash: string;
  subject: string;
  author?: string | null;
}

export interface ParsedReleaseCommit {
  hash: string;
  shortHash: string;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  summary: string;
  prNumber: number | null;
  author: string | null;
}

export interface ReleaseNoteItem {
  summary: string;
  hash: string;
  shortHash: string;
  prNumber: number | null;
}

export interface ReleaseNoteSection {
  key: ReleaseSectionKey;
  title: string;
  items: ReleaseNoteItem[];
}

export interface BuildReleaseNotesOptions {
  version: string;
  date: string;
  commits: ReleaseCommitInput[];
  previousTag?: string | null;
  repoUrl?: string | null;
}

export interface ReleaseNotes {
  version: string;
  date: string;
  previousTag: string | null;
  sections: ReleaseNoteSection[];
  totalCommits: number;
  markdown: string;
}

const SECTION_TITLES: Record<ReleaseSectionKey, string> = {
  breaking: 'Breaking changes',
  added: 'Added',
  fixed: 'Fixed',
  changed: 'Changed',
  maintenance: 'Maintenance',
};

const SECTION_ORDER: ReleaseSectionKey[] = ['breaking', 'added', 'fixed', 'changed', 'maintenance'];

const CONVENTIONAL_SUBJECT =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<summary>.+)$/i;
const PR_SUFFIX = /\s*\(#(?<pr>\d+)\)\s*$/;

export function parseReleaseCommit(commit: ReleaseCommitInput): ParsedReleaseCommit {
  const rawSubject = commit.subject.trim();
  const match = CONVENTIONAL_SUBJECT.exec(rawSubject);
  const type = match?.groups?.type?.toLowerCase() ?? null;
  const scope = match?.groups?.scope ?? null;
  let summary = match?.groups?.summary?.trim() ?? rawSubject;

  const prMatch = PR_SUFFIX.exec(summary);
  const prNumber = prMatch?.groups?.pr ? Number(prMatch.groups.pr) : null;
  if (prNumber !== null) summary = summary.replace(PR_SUFFIX, '').trim();

  return {
    hash: commit.hash,
    shortHash: commit.hash.slice(0, 7),
    type,
    scope,
    breaking: Boolean(match?.groups?.breaking) || /\bBREAKING[ -]CHANGE\b/i.test(rawSubject),
    summary: summary || rawSubject,
    prNumber,
    author: commit.author ?? null,
  };
}

function sectionKeyFor(commit: ParsedReleaseCommit): ReleaseSectionKey {
  if (commit.breaking) return 'breaking';
  switch (commit.type) {
    case 'feat':
      return 'added';
    case 'fix':
      return 'fixed';
    case 'perf':
    case 'refactor':
    case 'revert':
      return 'changed';
    case 'docs':
    case 'test':
    case 'chore':
    case 'ci':
    case 'build':
    case 'style':
      return 'maintenance';
    default:
      return 'changed';
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function renderItem(item: ReleaseNoteItem, repoUrl: string | null): string {
  const links: string[] = [];
  if (repoUrl && item.prNumber !== null) {
    links.push(`[#${item.prNumber}](${repoUrl}/pull/${item.prNumber})`);
  } else if (item.prNumber !== null) {
    links.push(`#${item.prNumber}`);
  }
  if (repoUrl) {
    links.push(`[${item.shortHash}](${repoUrl}/commit/${item.hash})`);
  } else {
    links.push(item.shortHash);
  }
  return `- ${item.summary} (${links.join(', ')})`;
}

export function buildReleaseNotes(options: BuildReleaseNotesOptions): ReleaseNotes {
  const repoUrl = options.repoUrl ? trimTrailingSlash(options.repoUrl) : null;
  const grouped = new Map<ReleaseSectionKey, ReleaseNoteItem[]>();
  for (const key of SECTION_ORDER) grouped.set(key, []);

  for (const commit of options.commits) {
    const parsed = parseReleaseCommit(commit);
    const item: ReleaseNoteItem = {
      summary: parsed.summary,
      hash: parsed.hash,
      shortHash: parsed.shortHash,
      prNumber: parsed.prNumber,
    };
    grouped.get(sectionKeyFor(parsed))?.push(item);
  }

  const sections = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    items: grouped.get(key) ?? [],
  })).filter((section) => section.items.length > 0);

  const lines = [`# ${options.version}`, '', `Released ${options.date}.`, ''];
  if (options.previousTag) {
    lines.push(`Changes since ${options.previousTag}.`, '');
  } else {
    lines.push('Changes since the start of the recorded history.', '');
  }

  if (sections.length === 0) {
    lines.push('No changes recorded.', '');
  } else {
    for (const section of sections) {
      lines.push(`## ${section.title}`, '');
      for (const item of section.items) lines.push(renderItem(item, repoUrl));
      lines.push('');
    }
  }

  return {
    version: options.version,
    date: options.date,
    previousTag: options.previousTag ?? null,
    sections,
    totalCommits: options.commits.length,
    markdown: `${lines.join('\n').trimEnd()}\n`,
  };
}
