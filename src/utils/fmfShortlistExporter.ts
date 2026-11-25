/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 4: Clean-room FM27 Shortlist Export (CSV / JSON / UID manifest) &
 * AI Tactical Context Enrichment (combining Dual-Phase Roles, Meta Score & Tactical Effectiveness).
 */

import { PlayerRecord } from '../types/fm27';
import {
  evaluateDualPhaseRoles,
  recommendTrainingFromEffectiveness,
  TacticalEffectivenessFactor,
} from './dualPhaseRoleEngine';
import { evaluatePlayerMetaScore } from './metaScoreEngine';
import { formatAge } from './squadViewHelpers';

export interface ShortlistExportEntry {
  uid: number | null;
  name: string;
  position: string;
  age: number;
  wagePw: number;
  marketValue: number | null;
  metaScore: number | null;
  paMetaScore: number | null;
  bestIpRole: string;
  bestOopRole: string;
}

export function buildShortlistExportEntries(
  players: PlayerRecord[]
): ShortlistExportEntry[] {
  return players.map((p) => {
    const meta = evaluatePlayerMetaScore(p);
    const roles = evaluateDualPhaseRoles(p, 1);
    return {
      uid: typeof p.uid === 'number' ? p.uid : null,
      name: p.name,
      position: p.position,
      age: p.age,
      wagePw: p.wagePw,
      marketValue: p.marketValue ?? null,
      metaScore: meta.metaScore,
      paMetaScore: meta.paMetaScore,
      bestIpRole: roles.bestInPossession?.name ?? '--',
      bestOopRole: roles.bestOutOfPossession?.name ?? '--',
    };
  });
}

function escapeCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 CSV shortlist with FM Unique IDs, Meta Scores, and Dual-Phase roles.
 */
export function exportShortlistToCsv(players: PlayerRecord[]): string {
  const headers = [
    'UID',
    'Name',
    'Position',
    'Age',
    'WagePW',
    'MarketValue',
    'MetaScore',
    'PAMetaScore',
    'BestIPRole',
    'BestOOPRole',
  ];
  const entries = buildShortlistExportEntries(players);
  const rows = entries.map((e) =>
    [
      e.uid,
      e.name,
      e.position,
      Number.isFinite(e.age) ? e.age : '',
      Number.isFinite(e.wagePw) ? e.wagePw : '',
      e.marketValue,
      e.metaScore,
      e.paMetaScore,
      e.bestIpRole,
      e.bestOopRole,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generates a compact FM27 UID manifest JSON payload for importable shortlist tooling.
 */
export function exportShortlistUidManifest(
  shortlistName: string,
  players: PlayerRecord[]
): string {
  const uids = players
    .map((p) => p.uid)
    .filter((uid): uid is number => typeof uid === 'number' && Number.isFinite(uid));

  return JSON.stringify(
    {
      format: 'fm27-command-hub-shortlist-v1',
      name: shortlistName.trim() || 'FM27 Shortlist',
      exportedAt: new Date().toISOString(),
      count: uids.length,
      playerUids: uids,
    },
    null,
    2
  );
}

/**
 * Builds an AI-ready tactical & scouting summary block for Gemini prompts.
 */
export function buildAiResearchContextBlock(params: {
  clubName: string;
  players: PlayerRecord[];
  effectivenessFactors?: TacticalEffectivenessFactor[];
  includeMeta?: boolean;
  includeDualPhase?: boolean;
}): string {
  if (params.players.length === 0) {
    return `Club: ${params.clubName || '--'} | Status: Awaiting .fm Save (no squad data loaded).`;
  }

  const lines: string[] = [`### FM27 Research Intelligence — ${params.clubName || 'Club'}`];

  const topMeta = params.players
    .map((p) => ({
      player: p,
      meta: evaluatePlayerMetaScore(p),
      roles: evaluateDualPhaseRoles(p, 1),
    }))
    .sort((a, b) => (b.meta.metaScore ?? 0) - (a.meta.metaScore ?? 0))
    .slice(0, 8);

  if (params.includeMeta !== false) {
    lines.push(
      `**Top Squad Meta Scores (FM-Arena weighted, ranked across all ${params.players.length} players in the pool):**`
    );
    for (const item of topMeta) {
      const m = item.meta.metaScore != null ? item.meta.metaScore.toFixed(1) : '--';
      const paM = item.meta.paMetaScore != null ? item.meta.paMetaScore.toFixed(1) : '--';
      const roleStr =
        params.includeDualPhase !== false
          ? ` | IP: ${item.roles.bestInPossession?.name ?? '--'} / OOP: ${item.roles.bestOutOfPossession?.name ?? '--'}`
          : '';
      lines.push(`- ${item.player.name} (${item.player.position}, ${formatAge(item.player.age)}y): Meta ${m} (Pot ${paM})${roleStr}`);
    }
  }

  if (params.effectivenessFactors && params.effectivenessFactors.length > 0) {
    const recs = recommendTrainingFromEffectiveness(params.effectivenessFactors, 3);
    if (recs.length > 0) {
      lines.push('**Tactical Effectiveness Priority Training:**');
      for (const r of recs) {
        lines.push(`- [${r.priority}] ${r.area} — ${r.factorLabel} (${r.score}%): ${r.recommendedSession}`);
      }
    }
  }

  return lines.join('\n');
}
