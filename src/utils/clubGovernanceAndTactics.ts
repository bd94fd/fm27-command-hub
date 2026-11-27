import { PlayerRecord } from '../types/fm27';
import {
  BoardObjectiveRecord,
  ClubGovernanceState,
  ClubPromiseRecord,
  DeepTacticRecord,
  GovernanceConfidenceGrade,
  LastMatchTacticBlueprint,
  LastMatchTacticSubstitute,
  ManagerContractInfo,
  PlayerPromiseAudit,
  TacticSlotAssignment,
  TacticTeamInstructions,
} from '../types/fmSave';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
} from './matchScopeHelpers';
import { filterMeaningfulInstructions } from './squadPlannerHelper';
import {
  buildTacticOverrideKey,
  getSlotPositionBucket,
  loadTacticRoleOverrides,
  resolveSlotDualPhaseRoles,
  StoredTacticRoleOverrides,
} from './fm27TacticRoleInference';
import {
  decodeGovernanceFromDictionary,
  decodePlayerInstructionsFromDictionary,
  decodeTeamInstructionsFromDictionary,
  Fm27BinaryDictionary,
  loadFm27BinaryDictionary,
} from './fm27BinaryDictionary';
import { decodeFm27TeamInstructionsFromBytes } from './fm27NativeBinaryDecoder';
import { getRolePositionFamiliarity } from './fm27RoleMatcher';

const PROMISED_MINUTES_SHARE_MIN: Array<{ pattern: RegExp; minPct: number; label: string }> = [
  { pattern: /star\s*player|key\s*player/i, minPct: 68, label: 'Star Player' },
  { pattern: /important\s*player/i, minPct: 54, label: 'Important Player' },
  { pattern: /regular\s*starter|first[\s-]*team/i, minPct: 40, label: 'Regular Starter' },
  { pattern: /squad\s*player|rotation/i, minPct: 20, label: 'Squad Player' },
  { pattern: /impact\s*sub/i, minPct: 12, label: 'Impact Sub' },
  { pattern: /fringe|emergency|backup|back[\s-]*up/i, minPct: 5, label: 'Fringe / Backup' },
  { pattern: /breakthrough|future\s*prospect|hot\s*prospect|youngster/i, minPct: 8, label: 'Breakthrough Prospect' },
];

function parseDateDmyToUtcMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  return null;
}

function computeMonthsBetween(fromDate?: string | null, toDate?: string | null): number | null {
  const fromMs = parseDateDmyToUtcMs(fromDate);
  const toMs = parseDateDmyToUtcMs(toDate);
  if (fromMs === null || toMs === null) return null;
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24 * 30.44)));
}

/**
 * Builds the deterministic Club Governance & Promises state strictly from
 * decoded `.fm` save fields (ZERO manual overrides, ZERO fabricated grades).
 */
export function buildClubGovernanceState(
  decoded: DecodedFmSavePayload | null | undefined,
  players: PlayerRecord[],
  dictionary?: Fm27BinaryDictionary
): ClubGovernanceState {
  const activeDict = dictionary ?? loadFm27BinaryDictionary();
  const dictGov = decodeGovernanceFromDictionary(activeDict, decoded?.binaryForensics);
  const rawGov = decoded?.governance ?? null;
  const managerName =
    rawGov?.managerContract?.managerName ||
    decoded?.meta?.managerName ||
    'Manager';
  const gameDate = decoded?.meta?.gameDateDmy || decoded?.meta?.gameDateIso || null;

  // 1. Manager contract: prefer save binary governance block, else match human manager in staff[] or binary probes
  let managerContract: ManagerContractInfo = {
    available: Boolean(rawGov?.managerContract?.available),
    managerName,
    staffUid: rawGov?.managerContract?.staffUid ?? null,
    wagePw: rawGov?.managerContract?.wagePw ?? dictGov.managerWagePw ?? null,
    expires: rawGov?.managerContract?.expires ?? null,
    contractExpiryMonths: rawGov?.managerContract?.contractExpiryMonths ?? null,
    age: rawGov?.managerContract?.age ?? null,
    nation: rawGov?.managerContract?.nation ?? null,
    jobSecurity: rawGov?.managerContract?.jobSecurity ?? dictGov.jobSecurity ?? null,
  };
  if (managerContract.wagePw !== null || managerContract.jobSecurity !== null) {
    managerContract.available = true;
  }

  if ((!managerContract.available || !managerContract.expires || managerContract.wagePw === null) && decoded?.staff && decoded.staff.length > 0) {
    const mgrLower = managerName.trim().toLowerCase();
    const matchedStaff =
      decoded.staff.find(
        (s) =>
          mgrLower &&
          mgrLower !== 'manager' &&
          (s.name || '').trim().toLowerCase() === mgrLower
      ) ||
      decoded.staff.find((s) =>
        /^(manager|head coach|first team manager)$/i.test((s.role || '').trim())
      );

    if (matchedStaff) {
      const hasWage = typeof matchedStaff.wagePw === 'number' && matchedStaff.wagePw > 0;
      const hasExp = Boolean(
        matchedStaff.expires &&
          matchedStaff.expires !== 'N/A' &&
          matchedStaff.expires !== '--'
      );
      if (hasWage || hasExp) {
        const resolvedExpires = managerContract.expires ?? (hasExp ? matchedStaff.expires! : null);
        managerContract = {
          available: true,
          managerName: matchedStaff.name || managerName,
          staffUid: managerContract.staffUid ?? matchedStaff.uid,
          wagePw: managerContract.wagePw ?? (hasWage ? matchedStaff.wagePw! : null),
          expires: resolvedExpires,
          contractExpiryMonths:
            managerContract.contractExpiryMonths ??
            (resolvedExpires ? computeMonthsBetween(gameDate, resolvedExpires) : null),
          age: managerContract.age ?? matchedStaff.age ?? null,
          nation: managerContract.nation ?? matchedStaff.nation ?? null,
          jobSecurity: managerContract.jobSecurity ?? null,
        };
      }
    }
  }

  if ((!managerContract.available || !managerContract.expires || managerContract.wagePw === null) && decoded?.binaryForensics?.managerContractProbes?.length) {
    const bestProbe =
      decoded.binaryForensics.managerContractProbes.find((p) => p.confidence === 'high') ||
      decoded.binaryForensics.managerContractProbes.find((p) => p.confidence === 'medium');
    if (bestProbe && (bestProbe.wagePw || bestProbe.expiresDmy)) {
      const resolvedExpires = managerContract.expires ?? bestProbe.expiresDmy ?? null;
      managerContract = {
        ...managerContract,
        available: true,
        wagePw: managerContract.wagePw ?? bestProbe.wagePw ?? null,
        expires: resolvedExpires,
        contractExpiryMonths:
          managerContract.contractExpiryMonths ??
          bestProbe.contractExpiryMonths ??
          (resolvedExpires ? computeMonthsBetween(gameDate, resolvedExpires) : null),
      };
    }
  }

  // 2. Board & Supporter confidence (binary extracted OR calibrated Binary Dictionary offset rule — never fabricated)
  const boardConfidence: GovernanceConfidenceGrade = rawGov?.boardConfidence?.available
    ? {
        available: true,
        grade: rawGov.boardConfidence.grade ?? null,
        score: rawGov.boardConfidence.score ?? null,
        summary: rawGov.boardConfidence.summary ?? null,
        sourceNote: 'Extracted from .fm save',
      }
    : dictGov.boardConfidence
      ? dictGov.boardConfidence
      : {
          available: false,
          grade: null,
          score: null,
          summary: null,
          sourceNote: 'Not exposed by FM27 save reader yet',
        };

  const supporterConfidence: GovernanceConfidenceGrade = rawGov?.supporterConfidence?.available
    ? {
        available: true,
        grade: rawGov.supporterConfidence.grade ?? null,
        score: rawGov.supporterConfidence.score ?? null,
        summary: rawGov.supporterConfidence.summary ?? null,
        sourceNote: 'Extracted from .fm save',
      }
    : dictGov.supporterConfidence
      ? dictGov.supporterConfidence
      : {
          available: false,
          grade: null,
          score: null,
          summary: null,
          sourceNote: 'Not exposed by FM27 save reader yet',
        };

  // 3. Board objectives: save binary objectives + concrete league competition thresholds when available
  const boardObjectives: BoardObjectiveRecord[] = Array.isArray(rawGov?.boardObjectives)
    ? [...rawGov.boardObjectives]
    : [];

  const rules = decoded?.competitionRules;
  const standing = decoded?.leagueStanding;
  if (rules && standing && boardObjectives.length === 0) {
    if (typeof rules.promotionPlaces === 'number' && rules.promotionPlaces > 0) {
      const inPromo = standing.position <= rules.promotionPlaces;
      boardObjectives.push({
        id: 'rule_promotion_zone',
        category: 'competition',
        title: `${standing.competitionName || 'League'} Promotion Zone`,
        target: `Top ${rules.promotionPlaces} automatic promotion${
          typeof rules.playoffPlaces === 'number' && rules.playoffPlaces > 0
            ? ` · Top ${rules.promotionPlaces + rules.playoffPlaces} playoffs`
            : ''
        }`,
        importance: 'League Rule Context',
        status: inPromo ? 'on_track' : 'info',
        source: 'league_rule_context',
      });
    }
    if (typeof rules.relegationPlaces === 'number' && rules.relegationPlaces > 0 && standing.totalTeams > 0) {
      const safeCutoff = standing.totalTeams - rules.relegationPlaces;
      const isSafe = standing.position <= safeCutoff;
      boardObjectives.push({
        id: 'rule_relegation_line',
        category: 'competition',
        title: `${standing.competitionName || 'League'} Survival Line`,
        target: `Finish Top ${safeCutoff} (avoid bottom ${rules.relegationPlaces})`,
        importance: 'League Rule Context',
        status: isSafe ? 'on_track' : 'at_risk',
        source: 'league_rule_context',
      });
    }
  }

  // 4. Deterministic Playing-Time Promise Audits from every squad contract
  // Count ONLY current-season competitive matches (League + Cup) — never inflate denominator with pre-season Friendlies or prior seasons.
  const currentSeasonLabel = deriveFootballSeasonLabel(decoded?.meta?.gameDateDmy);
  const currentSeasonCompetitiveMatches = (decoded?.playedMatches ?? []).filter((m) => {
    const bucket = classifyMatchCompetitionBucket(m.competition);
    if (bucket === 'friendly') return false;
    if (currentSeasonLabel !== 'Unknown Season') {
      const mSeason = deriveFootballSeasonLabel(m.dateDmy || m.dateIso);
      if (mSeason !== 'Unknown Season' && mSeason !== currentSeasonLabel) return false;
    }
    return true;
  });
  const playedCount = Math.max(
    currentSeasonCompetitiveMatches.length,
    decoded?.leagueStanding?.played ?? 0
  );
  const totalPossibleTeamMinutes = Math.max(90, playedCount * 90);
  const playerPromiseAudits: PlayerPromiseAudit[] = [];

  for (const p of players) {
    const promised = (p.contractDetails?.promisedPlayingTime || '').trim();
    if (!promised || /surplus|not needed|emergency|youngster|youth|future prospect/i.test(promised)) {
      continue;
    }
    const isSenior = p.teamSlot === undefined || p.teamSlot === 0;
    const rule = PROMISED_MINUTES_SHARE_MIN.find((r) => r.pattern.test(promised));
    if (!rule) continue;
    // Only audit reserve/U21/U18 players if they explicitly hold a Regular Starter+ first-team promise
    if (!isSenior && rule.minPct < 55) continue;

    const mins = Math.max(0, Number(p.minutes) || 0);
    const actualSharePct =
      playedCount > 0 ? Math.min(100, Math.round((mins / totalPossibleTeamMinutes) * 100)) : 0;

    let status: PlayerPromiseAudit['status'] = 'preseason';
    let note = `Pre-season (${playedCount} comp GP) — ${rule.label} promise active`;

    if (playedCount >= 6) {
      if (p.status === 'Injured') {
        status = 'on_track';
        note = `Injured (${mins}m played) — monitor reintegration once fit`;
      } else if (actualSharePct >= rule.minPct) {
        status = 'met';
        note = `Meeting ${rule.label} promise (${actualSharePct}% of comp mins)`;
      } else if (actualSharePct >= Math.round(rule.minPct * 0.65)) {
        status = 'on_track';
        note = `Borderline (${actualSharePct}% vs ~${rule.minPct}% target for ${rule.label})`;
      } else if (actualSharePct >= Math.round(rule.minPct * 0.35)) {
        status = 'at_risk';
        note = `Playing-time risk: ${actualSharePct}% comp mins vs ~${rule.minPct}% expected for ${rule.label}`;
      } else {
        status = 'breached';
        note = `High morale/promise risk: only ${mins}m (${actualSharePct}%) across ${playedCount} comp GP on ${rule.label} deal`;
      }
    } else if (playedCount > 0) {
      // Early-season grace (< 6 competitive GP): only flag genuine core starters (Important/Star/Regular) with severely low minutes
      if (p.status === 'Injured') {
        status = 'on_track';
        note = `Injured early season (${playedCount} comp GP) — ${rule.label}`;
      } else if (actualSharePct >= Math.round(rule.minPct * 0.5)) {
        status = 'on_track';
        note = `Early season (${playedCount} comp GP, ${mins}m played) — tracking on ${rule.label}`;
      } else if (playedCount >= 4 && rule.minPct >= 55 && actualSharePct < 20) {
        status = 'at_risk';
        note = `Early-season watch (${playedCount} comp GP, ${mins}m played) on ${rule.label} promise`;
      } else {
        status = 'preseason';
        note = `Early season (${playedCount} comp GP, ${mins}m played) — small competitive sample for ${rule.label}`;
      }
    }

    playerPromiseAudits.push({
      playerUid: p.uid,
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      promisedPlayingTime: promised,
      expectedMinMinutesSharePct: rule.minPct,
      actualMinutesSharePct: actualSharePct,
      minutesPlayed: mins,
      status,
      note,
    });
  }

  const severityRank: Record<PlayerPromiseAudit['status'], number> = {
    breached: 0,
    at_risk: 1,
    on_track: 2,
    met: 3,
    preseason: 4,
  };
  playerPromiseAudits.sort(
    (a, b) =>
      severityRank[a.status] - severityRank[b.status] ||
      b.expectedMinMinutesSharePct - a.expectedMinMinutesSharePct
  );

  // 5. Combine binary club promises, anchored binaryForensics promise candidates, and playing-time audits
  const clubPromises: ClubPromiseRecord[] = Array.isArray(rawGov?.clubPromises)
    ? [...rawGov.clubPromises]
    : [];

  if (Array.isArray(decoded?.binaryForensics?.promiseCandidates)) {
    const existingIds = new Set(clubPromises.map((p) => p.id));
    for (const cand of decoded.binaryForensics.promiseCandidates) {
      const id = `bin_prom_${cand.id}`;
      if (existingIds.has(id)) continue;
      if (!cand.playerName && !cand.dueDateDmy) continue;
      existingIds.add(id);
      clubPromises.push({
        id,
        subject:
          cand.typeCode != null
            ? `Save Promise (Binary Type #${cand.typeCode})`
            : 'Save Promise (Binary Candidate)',
        targetName: cand.playerName || 'Club / Squad',
        summary: `Anchored in '${cand.section}' @ 0x${cand.anchorOffset.toString(16)}${
          cand.dueDateDmy ? ` · Due ${cand.dueDateDmy}` : ''
        }`,
        dueDate: cand.dueDateDmy ?? null,
        status: 'active',
        source: 'save_binary',
      });
    }
  }

  for (const pa of playerPromiseAudits.filter(
    (item) => item.status === 'breached' || item.status === 'at_risk'
  )) {
    clubPromises.push({
      id: `pt_${pa.playerId}`,
      subject: `Playing Time (${pa.promisedPlayingTime})`,
      targetName: pa.playerName,
      summary: pa.note,
      dueDate: null,
      status: pa.status === 'breached' ? 'breached' : 'at_risk',
      source: 'contract_playing_time',
    });
  }

  const promisesAtRiskCount = clubPromises.filter(
    (pr) => pr.status === 'at_risk' || pr.status === 'breached'
  ).length;

  const unavailableNotes: string[] = [];
  if (!managerContract.available) {
    unavailableNotes.push('Manager contract details not exposed in this FM27 save build');
  }
  if (!boardConfidence.available) {
    unavailableNotes.push('Board rating grade not exposed by fmsave for this FM27 build');
  }
  if (!supporterConfidence.available) {
    unavailableNotes.push('Supporter rating grade not exposed by fmsave for this FM27 build');
  }
  if (!rawGov?.boardObjectives || rawGov.boardObjectives.length === 0) {
    unavailableNotes.push(
      boardObjectives.length > 0
        ? 'Binary board vision items not exposed — showing league competition thresholds from save rules'
        : 'Board vision objectives not exposed by fmsave for this FM27 build'
    );
  }

  return {
    managerContract,
    boardConfidence,
    supporterConfidence,
    boardObjectives,
    clubPromises,
    playerPromiseAudits,
    promisesAtRiskCount,
    binaryProbedFields: Array.isArray(rawGov?.binaryProbedFields)
      ? rawGov.binaryProbedFields
      : [],
    unavailableNotes,
  };
}

/**
 * Reconstructs the club's Last-Game / Active FM27 (Patch 27.1.0) Tactic Blueprint
 * in full: IP & OOP formations, mentality, style, 3-lane Team Instructions, all 11
 * starters with IP/OOP roles & decoded player instructions, matchday bench, and
 * FM27 Patch 27.1.0 Tactical Effectiveness assessment.
 */
export function buildLastMatchTacticBlueprint(
  decoded: DecodedFmSavePayload | null | undefined,
  players: PlayerRecord[],
  tacticIndex = 0,
  roleOverrides?: StoredTacticRoleOverrides,
  dictionary?: Fm27BinaryDictionary
): LastMatchTacticBlueprint | null {
  const tactics: DeepTacticRecord[] = decoded?.tactics || [];
  const chosenTactic = tactics[tacticIndex] || tactics[0] || null;
  if (!chosenTactic) return null;

  const activeDict = dictionary ?? loadFm27BinaryDictionary();
  const effectiveOverrides = roleOverrides ?? loadTacticRoleOverrides();
  const tacticKey = buildTacticOverrideKey(chosenTactic.name || 'Club Tactic', chosenTactic.index ?? tacticIndex);
  const nativeTi = decodeFm27TeamInstructionsFromBytes(
    chosenTactic.teamInstructions?.rawTeamInstructionBytes,
    chosenTactic.teamInstructions?.styleCode
  );
  const dictTi = decodeTeamInstructionsFromDictionary(activeDict, {
    rawBytes: chosenTactic.teamInstructions?.rawTeamInstructionBytes,
    styleCode: chosenTactic.teamInstructions?.styleCode,
  });
  const styleName = dictTi.styleName || chosenTactic.styleName || nativeTi.styleName || '';
  const mentality =
    chosenTactic.mentality && chosenTactic.mentality !== 'Balanced'
      ? chosenTactic.mentality
      : nativeTi.mentality || chosenTactic.mentality || 'Balanced';

  const latestMatch = decoded?.playedMatches?.[0] ?? null;

  const normalizeDateKey = (raw?: string | null): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return null;
  };
  const latestMatchIso = normalizeDateKey(
    latestMatch?.dateIso || latestMatch?.dateDmy || null
  );
  const latestOppNorm = (latestMatch?.opponent || '').trim().toLowerCase();

  const playersByUid = new Map<number, PlayerRecord>();
  const playersByName = new Map<string, PlayerRecord>();
  for (const p of players) {
    if (typeof p.uid === 'number') playersByUid.set(p.uid, p);
    playersByName.set(p.name.trim().toLowerCase(), p);
  }

  const findLastMatchStat = (uid?: number | null) => {
    if (uid == null || !decoded?.playerMatchStats) return null;
    const list =
      decoded.playerMatchStats[String(uid)] ||
      decoded.playerMatchStats[uid as unknown as string];
    if (!Array.isArray(list) || list.length === 0) return null;
    if (latestMatch) {
      // player_match_stats is stored chronologically (oldest -> newest); search newest first
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        const mIso = normalizeDateKey(m.date);
        if (latestMatchIso && mIso && mIso === latestMatchIso) {
          return m;
        }
        const mOpp = (m.opponent || '').trim().toLowerCase();
        if (
          latestOppNorm.length >= 4 &&
          mOpp.length >= 4 &&
          (mOpp.includes(latestOppNorm.slice(0, 6)) ||
            latestOppNorm.includes(mOpp.slice(0, 6)))
        ) {
          return m;
        }
      }
      // Player did not appear in the latest match — do NOT fabricate a rating from an older fixture
      return null;
    }
    // No latestMatch metadata available — return the newest recorded appearance
    return list[list.length - 1];
  };

  // Matchday selections from save (starters + substitutes)
  const rawSel = decoded?.selections as
    | {
        starters?: Array<{ slot?: number; playerUid?: number | null; playerName?: string | null }>;
        substitutes?: Array<{ slot?: number; playerUid?: number | null; playerName?: string | null }>;
      }
    | undefined;

  const usedIpByBucket = new Map<string, string[]>();
  const usedOopByBucket = new Map<string, string[]>();

  const starters: TacticSlotAssignment[] = (chosenTactic.slots || []).map((sl, idx) => {
    const selStarter = rawSel?.starters?.[idx];
    const pUid = sl.playerUid ?? selStarter?.playerUid ?? null;
    const pName =
      sl.playerName ||
      selStarter?.playerName ||
      (pUid != null ? playersByUid.get(pUid)?.name : null) ||
      null;
    const matchedPlayer =
      (pUid != null ? playersByUid.get(pUid) : undefined) ||
      (pName ? playersByName.get(pName.trim().toLowerCase()) : undefined);
    const lmStat = findLastMatchStat(pUid ?? matchedPlayer?.uid ?? null);

    const ipBucket = getSlotPositionBucket(sl.position);
    const oopBucket = getSlotPositionBucket(sl.outOfPossessionPosition || sl.position);
    const resolvedRoles = resolveSlotDualPhaseRoles({
      slot: sl,
      slotIndex: sl.slotIndex ?? idx,
      player: matchedPlayer ?? null,
      styleName,
      mentality,
      tacticKey,
      overrides: effectiveOverrides,
      dictionary: activeDict,
      alreadyPickedIpRolesInSameBucket: usedIpByBucket.get(ipBucket) || [],
      alreadyPickedOopRolesInSameBucket: usedOopByBucket.get(oopBucket) || [],
    });

    const ipUsedList = usedIpByBucket.get(ipBucket) || [];
    ipUsedList.push(resolvedRoles.ipRole);
    usedIpByBucket.set(ipBucket, ipUsedList);

    const oopUsedList = usedOopByBucket.get(oopBucket) || [];
    oopUsedList.push(resolvedRoles.oopRole);
    usedOopByBucket.set(oopBucket, oopUsedList);

    const dictIpPi = decodePlayerInstructionsFromDictionary(activeDict, sl.ipSettingUnits, 'ip');
    const dictOopPi = decodePlayerInstructionsFromDictionary(activeDict, sl.oopSettingUnits, 'oop');
    const mergedIpInstr = Array.from(
      new Set([...filterMeaningfulInstructions(sl.inPossessionInstructions), ...dictIpPi.decodedLabels])
    );
    const mergedOopInstr = Array.from(
      new Set([...filterMeaningfulInstructions(sl.outOfPossessionInstructions), ...dictOopPi.decodedLabels])
    );

    return {
      ...sl,
      slotIndex: sl.slotIndex ?? idx,
      playerUid: pUid ?? matchedPlayer?.uid ?? null,
      playerName: pName ?? matchedPlayer?.name ?? null,
      inPossessionRole: resolvedRoles.ipRole,
      outOfPossessionRole: resolvedRoles.oopRole,
      ipRoleSource: resolvedRoles.ipSource,
      oopRoleSource: resolvedRoles.oopSource,
      ipRoleConfidence: resolvedRoles.ipConfidence,
      oopRoleConfidence: resolvedRoles.oopConfidence,
      ipRoleReasoning: resolvedRoles.ipReasoning,
      oopRoleReasoning: resolvedRoles.oopReasoning,
      ipRoleCandidates: resolvedRoles.ipCandidates,
      oopRoleCandidates: resolvedRoles.oopCandidates,
      settingCountIp:
        sl.settingCountIp ??
        (Array.isArray(sl.ipSettingUnits) ? sl.ipSettingUnits.length : Array.isArray(sl.inPossessionInstructions) ? sl.inPossessionInstructions.length : 0),
      settingCountOop:
        sl.settingCountOop ??
        (Array.isArray(sl.oopSettingUnits) ? sl.oopSettingUnits.length : Array.isArray(sl.outOfPossessionInstructions) ? sl.outOfPossessionInstructions.length : 0),
      inPossessionInstructions: mergedIpInstr,
      outOfPossessionInstructions: mergedOopInstr,
      lastMatchRating: lmStat?.rating ?? null,
      lastMatchMinutes: lmStat?.minutes ?? null,
      lastMatchGoals: lmStat?.goals ?? 0,
      lastMatchAssists: lmStat?.assists ?? 0,
    };
  });

  const substitutes: LastMatchTacticSubstitute[] = (rawSel?.substitutes || [])
    .map((sub, idx): LastMatchTacticSubstitute | null => {
      const pUid = sub.playerUid ?? null;
      const matchedPlayer =
        (pUid != null ? playersByUid.get(pUid) : undefined) ||
        (sub.playerName ? playersByName.get(sub.playerName.trim().toLowerCase()) : undefined);
      const lmStat = findLastMatchStat(pUid ?? matchedPlayer?.uid ?? null);
      const name = sub.playerName || matchedPlayer?.name || '';
      if (!name) return null;
      return {
        slot: sub.slot ?? idx + 1,
        playerUid: pUid ?? matchedPlayer?.uid ?? null,
        playerName: name,
        position: matchedPlayer?.position,
        lastMatchRating: lmStat?.rating ?? null,
        lastMatchMinutes: lmStat?.minutes ?? null,
      };
    })
    .filter((x): x is LastMatchTacticSubstitute => x !== null);

  const rawTi = chosenTactic.teamInstructions;
  const teamInstructions: TacticTeamInstructions = rawTi
    ? {
        ...rawTi,
        mentality,
        styleName: styleName || rawTi.styleName || nativeTi.styleName || null,
        passingDirectness: rawTi.passingDirectness || nativeTi.passingDirectness,
        tempo: rawTi.tempo || nativeTi.tempo,
        width: rawTi.width || nativeTi.width,
        defensiveLine: rawTi.defensiveLine || nativeTi.defensiveLine,
        lineOfEngagement: rawTi.lineOfEngagement || nativeTi.lineOfEngagement,
        pressingIntensity: rawTi.pressingIntensity || nativeTi.pressingIntensity,
        inPossession: Array.from(
          new Set([
            ...filterMeaningfulInstructions(rawTi.inPossession),
            ...nativeTi.inPossession,
            ...dictTi.inPossession,
          ])
        ),
        inTransition: Array.from(
          new Set([
            ...filterMeaningfulInstructions(rawTi.inTransition),
            ...nativeTi.inTransition,
            ...dictTi.inTransition,
          ])
        ),
        outOfPossession: Array.from(
          new Set([
            ...filterMeaningfulInstructions(rawTi.outOfPossession),
            ...nativeTi.outOfPossession,
            ...dictTi.outOfPossession,
          ])
        ),
      }
    : {
        inPossession: Array.from(new Set([...nativeTi.inPossession, ...dictTi.inPossession])),
        inTransition: Array.from(new Set([...nativeTi.inTransition, ...dictTi.inTransition])),
        outOfPossession: Array.from(
          new Set([...nativeTi.outOfPossession, ...dictTi.outOfPossession])
        ),
        mentality,
        styleName: styleName || nativeTi.styleName || null,
        passingDirectness: nativeTi.passingDirectness,
        tempo: nativeTi.tempo,
        width: nativeTi.width,
        defensiveLine: nativeTi.defensiveLine,
        lineOfEngagement: nativeTi.lineOfEngagement,
        pressingIntensity: nativeTi.pressingIntensity,
        rawSettings: [],
      };

  const totalTeamInstr =
    (teamInstructions.inPossession?.length ?? 0) +
    (teamInstructions.inTransition?.length ?? 0) +
    (teamInstructions.outOfPossession?.length ?? 0);
  const totalSlotInstr = starters.reduce(
    (sum, s) =>
      sum +
      (s.inPossessionInstructions?.length ?? 0) +
      (s.outOfPossessionInstructions?.length ?? 0),
    0
  );
  const hasDecodedInstructions = totalTeamInstr > 0 || totalSlotInstr > 0;

  // FM27 Patch 27.1.0 Tactical Effectiveness computation across dual-phase IP/OOP roles
  let fitSum = 0;
  let fitCount = 0;
  const effNotes: string[] = [];
  let wowFlankCount = 0;
  let holdingFbCount = 0;
  let lowStaminaDualPhase: string[] = [];

  for (const sl of starters) {
    const p =
      (sl.playerUid != null ? playersByUid.get(sl.playerUid) : undefined) ||
      (sl.playerName ? playersByName.get(sl.playerName.trim().toLowerCase()) : undefined);
    const oopRoleStr = (sl.outOfPossessionRole || '').toLowerCase();
    const ipRoleStr = (sl.inPossessionRole || '').toLowerCase();

    if (/wide\s*outlet\s*winger/i.test(oopRoleStr)) {
      wowFlankCount += 1;
    }
    if (/holding\s*full[\s-]*back/i.test(oopRoleStr) || /holding\s*full[\s-]*back/i.test(ipRoleStr)) {
      holdingFbCount += 1;
    }

    if (p) {
      const posKey = (sl.position || '').toUpperCase().replace(/[^A-Z]/g, '');
      const resolveSlotGroupAndFlank = (
        code: string
      ): { group: string; flank?: 'L' | 'C' | 'R' } => {
        if (code === 'GK') return { group: 'GK', flank: 'C' };
        if (code === 'DL') return { group: 'DL/DR', flank: 'L' };
        if (code === 'DR') return { group: 'DL/DR', flank: 'R' };
        if (code === 'WBL') return { group: 'WBL/WBR', flank: 'L' };
        if (code === 'WBR') return { group: 'WBL/WBR', flank: 'R' };
        if (code.startsWith('DC') || code === 'CB') return { group: 'DC', flank: 'C' };
        if (code.startsWith('DM')) return { group: 'DM', flank: 'C' };
        if (code === 'ML') return { group: 'ML/MR', flank: 'L' };
        if (code === 'MR') return { group: 'ML/MR', flank: 'R' };
        if (code.startsWith('MC') || code === 'CM') return { group: 'MC', flank: 'C' };
        if (code === 'AML') return { group: 'AML/AMR', flank: 'L' };
        if (code === 'AMR') return { group: 'AML/AMR', flank: 'R' };
        if (code.startsWith('AMC')) return { group: 'AMC', flank: 'C' };
        if (code.startsWith('ST') || code === 'CF') return { group: 'ST', flank: 'C' };
        return { group: code };
      };
      const { group, flank } = resolveSlotGroupAndFlank(posKey);
      const roleFam = getRolePositionFamiliarity(p, group, flank);
      const fam =
        roleFam ??
        p.positionRatings?.[posKey] ??
        (p.position.toUpperCase().includes(posKey.slice(0, 2)) ? 17 : 11);
      const stam = p.attributes?.stamina ?? 11;
      const dec = p.attributes?.decisions ?? 11;
      const pace = p.attributes?.pace ?? 11;
      const slotScore = Math.min(
        98,
        Math.max(35, Math.round(fam * 2.8 + stam * 1.1 + dec * 1.1 + pace * 0.9))
      );
      fitSum += slotScore;
      fitCount += 1;

      const phaseShift =
        sl.outOfPossessionPosition && sl.outOfPossessionPosition !== sl.position;
      if (phaseShift && stam <= 11) {
        lowStaminaDualPhase.push(`${p.name} (Sta ${stam})`);
      }
    }
  }

  let effScore = fitCount > 0 ? Math.round(fitSum / fitCount) : 64;
  if (wowFlankCount > 0) {
    effScore = Math.max(40, effScore - wowFlankCount * 5);
    effNotes.push(
      `Patch 27.1.0 Flank Risk: ${wowFlankCount} wide slot(s) set to Wide Outlet Winger OOP — Tracking Winger OOP protects against 2v1 overlaps.`
    );
  }
  if (holdingFbCount > 0) {
    effNotes.push(
      `Patch 27.1.0 Note: Holding Full-Back has increased pressing aggression in 27.1.0 — verify CB recovery Pace covers behind.`
    );
  }
  if (lowStaminaDualPhase.length > 0) {
    effNotes.push(
      `Dual-Phase Transition Load: ${lowStaminaDualPhase.slice(0, 3).join(', ')} shift IP→OOP slots with Stamina ≤ 11 (plan 60–63' Window 1 subs).`
    );
  }
  const inferredRoleCount = starters.filter(
    (s) => s.ipRoleSource === 'inferred' || s.oopRoleSource === 'inferred'
  ).length;
  const nativeDecodedRoleCount = starters.filter(
    (s) => s.ipRoleSource === 'save_decoded' && s.oopRoleSource === 'save_decoded'
  ).length;
  if (nativeDecodedRoleCount > 0 && hasDecodedInstructions) {
    effNotes.push(
      `Auto-decoded ${nativeDecodedRoleCount}/${starters.length} dual-phase IP & OOP roles and ${totalTeamInstr} team instructions directly from your .fm save binary.`
    );
  } else if (!hasDecodedInstructions) {
    effNotes.push(
      inferredRoleCount > 0
        ? `Re-sync your .fm save to auto-decode exact 64-bit IP & OOP roles and 19-byte team instructions directly from the binary.`
        : `Formations, mentality, and IP & OOP roles are live.`
    );
  }

  return {
    source: latestMatch ? 'last_match_reconstructed' : 'active_save_tactic',
    matchDate: latestMatch?.dateDmy || latestMatch?.dateIso || null,
    opponent: latestMatch?.opponent || null,
    competition: latestMatch?.competition || null,
    venue: latestMatch?.venue || null,
    score: latestMatch?.score || null,
    result: latestMatch?.result || null,
    xGFor: latestMatch?.xGFor ?? null,
    xGAgainst: latestMatch?.xGAgainst ?? null,
    possession: latestMatch?.possession ?? null,
    tacticName: chosenTactic.name || 'Club Tactic',
    styleName: styleName || chosenTactic.styleName || nativeTi.styleName || '',
    mentality,
    inPossessionFormation: chosenTactic.inPossessionFormation || '4-3-3 DM Wide',
    outOfPossessionFormation:
      chosenTactic.outOfPossessionFormation ||
      chosenTactic.inPossessionFormation ||
      '4-3-3 DM Wide',
    teamInstructions,
    starters,
    substitutes,
    hasDecodedInstructions,
    tacticalEffectivenessScore: effScore,
    tacticalEffectivenessNotes: effNotes,
  };
}
