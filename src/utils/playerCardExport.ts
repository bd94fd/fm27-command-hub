/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FM27_ROLES, scorePlayerForFm27Role } from './fm27RoleMatcher';
import { formatAge, formatContractExpiry, formatNation, formatWeeklyWage } from './squadViewHelpers';
import type { PlayerCardAnalysis } from './playerCardAnalysis';
import type { PlayerRecord } from '../types/fm27';

export interface PlayerCardKeyTile {
  label: string;
  value: number;
}

export interface PlayerCardModel {
  title: string;
  name: string;
  starLine: string;
  metaLine: string;
  ipLine: string;
  oopLine: string;
  engineSummary: string;
  keyGrid: PlayerCardKeyTile[];
  badgeLine: string;
  slug: string;
}

export interface PlayerCardModelInput {
  player: PlayerRecord;
  analysis: Pick<PlayerCardAnalysis, 'physical'>;
  effectiveIpRole: string;
  effectiveOopRole: string;
  isGoalkeeper: boolean;
  scoutBadges: string[];
}

export const PLAYER_CARD_WIDTH = 760;
export const PLAYER_CARD_HEIGHT = 500;

export function slugifyPlayerName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'fm27-player'
  );
}

/**
 * The card is drawn on a canvas, so every string it shows is built here and
 * can be checked without a browser.
 */
export function buildPlayerCardModel({
  player,
  analysis,
  effectiveIpRole,
  effectiveOopRole,
  isGoalkeeper,
  scoutBadges,
}: PlayerCardModelInput): PlayerCardModel {
  const a = player.attributes;
  const ipRoleObj = FM27_ROLES.find(
    (r) => r.phase === 'In Possession' && r.name === effectiveIpRole
  );
  const oopRoleObj = FM27_ROLES.find(
    (r) => r.phase === 'Out of Possession' && r.name === effectiveOopRole
  );
  const ipFitScore = ipRoleObj ? scorePlayerForFm27Role(player, ipRoleObj) : 75;
  const oopFitScore = oopRoleObj ? scorePlayerForFm27Role(player, oopRoleObj) : 75;

  const keyGrid: PlayerCardKeyTile[] = isGoalkeeper
    ? [
        { label: 'Reflexes', value: a.reflexes ?? 10 },
        { label: 'Handling', value: a.handling ?? 10 },
        { label: 'Command Area', value: a.commandOfArea ?? 10 },
        { label: 'Aerial Reach', value: a.aerialReach ?? 10 },
        { label: 'One on Ones', value: a.oneOnOnes ?? 10 },
        { label: 'Kicking', value: a.kicking ?? 10 },
        { label: 'Decisions', value: a.decisions },
        { label: 'Positioning', value: a.positioning ?? 10 },
        { label: 'Determination', value: a.determination },
        { label: 'Agility', value: a.agility ?? 10 },
        { label: 'Pace', value: a.pace },
        { label: 'Passing', value: a.passing },
      ]
    : [
        { label: 'Pace', value: a.pace },
        { label: 'Acceleration', value: a.acceleration },
        { label: 'Stamina', value: a.stamina },
        { label: 'Jumping Reach', value: a.jumpingReach },
        { label: 'Passing', value: a.passing },
        { label: 'First Touch', value: a.firstTouch },
        { label: 'Finishing', value: a.finishing },
        { label: 'Tackling', value: a.tackling },
        { label: 'Decisions', value: a.decisions },
        { label: 'Determination', value: a.determination },
        { label: 'Work Rate', value: a.workRate },
        { label: 'Off The Ball', value: a.offTheBall },
      ];

  return {
    title: 'FM27 COMMAND HUB · DUAL-PHASE PLAYER CARD',
    name: player.name,
    starLine: `${player.ability.toFixed(1)}★ / ${player.potential.toFixed(1)}★ Pot  ·  ${player.position}`,
    metaLine: `Age ${formatAge(player.age)} · ${formatNation(player.nation)} · ${player.preferredFoot || 'Right'} Foot · ${player.personality} · ${formatWeeklyWage(player.wagePw)} (exp ${formatContractExpiry(player.expires)})`,
    ipLine: `IN POSSESSION (IP): ${effectiveIpRole || player.ipRole} (${ipFitScore}% Fit)`,
    oopLine: `OUT OF POSSESSION (OOP): ${effectiveOopRole || player.oopRole} (${oopFitScore}% Fit)`,
    engineSummary: `Physical ${analysis.physical.score}/100 (${analysis.physical.tier}) · ${analysis.physical.topSpeedKmh} km/h · Durability: ${analysis.physical.durability.tier}`,
    keyGrid,
    badgeLine:
      scoutBadges.length > 0
        ? `Scout Badges: ${scoutBadges.join(' · ')}`.slice(0, 88)
        : 'FM27 Command Hub · Relative Squad Stars & 1–20 Attributes',
    slug: slugifyPlayerName(player.name),
  };
}

function attributeColour(value: number): string {
  return value >= 16 ? '#6ee7b7' : value >= 13 ? '#bef264' : value >= 10 ? '#fde68a' : '#94a3b8';
}

export function drawPlayerCard(
  ctx: CanvasRenderingContext2D,
  model: PlayerCardModel
): void {
  const bg = ctx.createLinearGradient(0, 0, PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT);
  bg.addColorStop(0, '#020617');
  bg.addColorStop(0.55, '#0f172a');
  bg.addColorStop(1, '#022c22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT);

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 744, 484);

  ctx.fillStyle = '#10b981';
  ctx.fillRect(28, 28, 704, 4);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(model.title, 28, 54);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(model.name, 28, 92);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(model.starLine, 28, 120);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.fillText(model.metaLine, 28, 144);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(28, 160, 704, 102);
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 160, 704, 102);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(model.ipLine, 44, 185);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(model.oopLine, 44, 209);

  ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
  ctx.beginPath();
  ctx.moveTo(44, 223);
  ctx.lineTo(716, 223);
  ctx.stroke();

  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(model.engineSummary, 44, 246, 672);

  const colWidth = 226;
  const rowHeight = 34;
  model.keyGrid.forEach((item, idx) => {
    const col = Math.floor(idx / 4);
    const row = idx % 4;
    const x = 28 + col * (colWidth + 13);
    const y = 278 + row * (rowHeight + 6);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(x, y, colWidth, rowHeight);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.strokeRect(x, y, colWidth, rowHeight);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px sans-serif';
    ctx.fillText(item.label, x + 12, y + 22);

    ctx.fillStyle = attributeColour(item.value);
    ctx.font = 'bold 15px monospace';
    ctx.fillText(String(item.value).padStart(2, ' '), x + colWidth - 34, y + 22);
  });

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(model.badgeLine, 28, 468);
}

/** Returns false when the environment has no canvas or no 2D context. */
export function exportPlayerCardPng(
  model: PlayerCardModel,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document
): boolean {
  if (!doc) return false;
  const canvas = doc.createElement('canvas');
  canvas.width = PLAYER_CARD_WIDTH;
  canvas.height = PLAYER_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  drawPlayerCard(ctx, model);

  const link = doc.createElement('a');
  link.download = `${model.slug}-card.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  return true;
}
