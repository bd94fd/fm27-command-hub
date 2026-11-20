import { computeFm27EngineMetrics } from './fmEngine';
import { getRoleFitScore } from './playerCatalog';
import { getBestStaffRoleRating } from './staffRatings';
import type {
  ClubRecord,
  PlayerRecord,
  PositionCode,
  RecruitmentCase,
  ShortlistRecord,
  TacticDefinition,
  WorkspaceSnapshot,
} from './types';

export interface ToolExecutionSummary {
  toolName: string;
  data: Record<string, unknown>;
}

const CORE_POSITIONS: PositionCode[] = ['GK', 'DL', 'DC', 'DR', 'DM', 'MC', 'AML', 'AMC', 'AMR', 'ST'];

export function getClubSquad(snapshot: WorkspaceSnapshot, clubName: string): PlayerRecord[] {
  const lower = clubName.toLowerCase();
  return snapshot.players
    .filter((p) => p.playingClub.toLowerCase() === lower || p.club.toLowerCase() === lower)
    .sort((a, b) => (b.ca ?? 0) - (a.ca ?? 0));
}

export function analyzeSquadTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
): ToolExecutionSummary {
  const club = snapshot.clubs.find((c) => c.name.toLowerCase() === clubName.toLowerCase());
  const squad = getClubSquad(snapshot, clubName);

  const depthByPosition = CORE_POSITIONS.map((pos) => {
    const naturals = squad.filter((p) => (p.positions[pos] ?? 1) >= 15);
    const cas = naturals.map((p) => p.ca).filter((v): v is number => v !== null);
    const bestCa = cas.length > 0 ? Math.max(...cas) : null;
    return {
      position: pos,
      count: naturals.length,
      bestCa,
      players: naturals.slice(0, 4).map((p) => ({
        name: p.name,
        age: p.age,
        ca: p.ca,
        pa: p.pa,
        condition: p.condition,
        sharpness: p.sharpness,
        injured: p.injured,
      })),
    };
  });

  const weakPositions = depthByPosition.filter((d) => d.count < 2);
  const injuredPlayers = squad
    .filter((p) => p.injured)
    .map((p) => ({
      name: p.name,
      position: p.positionText,
      injury: p.injury,
      returnDate: p.injuryExpectedReturn,
    }));

  const gameDate = snapshot.metadata.gameDate;
  const expiringContracts = squad
    .filter((p) => {
      const end = p.contractEnd ?? p.expires;
      if (!end || !gameDate) return false;
      const horizonYear = Number(gameDate.slice(0, 4)) + 1;
      return end <= `${horizonYear}-06-30`;
    })
    .map((p) => ({
      name: p.name,
      age: p.age,
      ca: p.ca,
      contractEnd: p.contractEnd ?? p.expires,
      wagePw: p.wagePw,
    }));

  const ages = squad.map((p) => p.age).filter((v): v is number => v !== null);
  const cas = squad.map((p) => p.ca).filter((v): v is number => v !== null);
  const averageAge =
    ages.length > 0
      ? Math.round((ages.reduce((sum, v) => sum + v, 0) / ages.length) * 10) / 10
      : null;
  const averageCa =
    cas.length > 0
      ? Math.round((cas.reduce((sum, v) => sum + v, 0) / cas.length) * 10) / 10
      : null;

  return {
    toolName: 'fm27_analyze_squad',
    data: {
      club: club?.name ?? clubName,
      gameDate: snapshot.metadata.gameDate,
      squadSize: squad.length,
      averageAge,
      averageCa,
      transferBudgetGbp: club?.transferBudget ?? snapshot.finances?.transferBudgetRemaining ?? null,
      weeklyWageBudgetGbp: club?.payrollBudgetWeekly ?? snapshot.finances?.wageBudgetWeekly ?? null,
      currentWeeklyWagesGbp:
        club?.currentWagesWeekly ?? snapshot.finances?.wagePayrollWeekly ?? null,
      depthByPosition,
      weakPositions: weakPositions.map((w) => ({
        position: w.position,
        count: w.count,
        bestCa: w.bestCa,
      })),
      injuredPlayers,
      expiringContracts,
    },
  };
}

export function optimizeLineupTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
  tactic: TacticDefinition | null,
): ToolExecutionSummary {
  if (!tactic) {
    return {
      toolName: 'fm27_optimize_lineup',
      data: { error: 'No active tactic loaded. Select or import a tactic in the Context panel.' },
    };
  }

  const squad = getClubSquad(snapshot, clubName).filter((p) => !p.injured);
  const usedIds = new Set<number>();
  const startingXi: {
    position: PositionCode;
    inPossessionRole: string;
    outOfPossessionRole: string;
    player: string;
    age: number | null;
    ca: number | null;
    condition: number | null;
    sharpness: number | null;
    ipRoleFit: number | null;
    oopRoleFit: number | null;
    familiarity: number;
    backup: string | null;
  }[] = [];

  for (const slot of tactic.slots) {
    const candidates = squad
      .filter((p) => !usedIds.has(p.id))
      .map((p) => {
        const fam = p.positions[slot.position] ?? 1;
        const ipFit = getRoleFitScore(p.attributes, 'In Possession', slot.inPossessionRole);
        const oopFit = getRoleFitScore(p.attributes, 'Out of Possession', slot.outOfPossessionRole);
        const fitBlend =
          ipFit !== null && oopFit !== null
            ? (ipFit + oopFit) / 2
            : (ipFit ?? oopFit ?? 10);
        const condBonus = p.condition !== null ? (p.condition - 80) * 0.15 : 0;
        const composite = fam * 3.5 + fitBlend * 4.2 + (p.ca ?? 0) * 0.45 + condBonus;
        return { p, fam, ipFit, oopFit, composite };
      })
      .sort((a, b) => b.composite - a.composite);

    const chosen = candidates[0];
    if (chosen) {
      usedIds.add(chosen.p.id);
      startingXi.push({
        position: slot.position,
        inPossessionRole: slot.inPossessionRole,
        outOfPossessionRole: slot.outOfPossessionRole,
        player: chosen.p.name,
        age: chosen.p.age,
        ca: chosen.p.ca,
        condition: chosen.p.condition,
        sharpness: chosen.p.sharpness,
        ipRoleFit: chosen.ipFit,
        oopRoleFit: chosen.oopFit,
        familiarity: chosen.fam,
        backup: candidates[1]?.p.name ?? null,
      });
    }
  }

  const bench = squad
    .filter((p) => !usedIds.has(p.id))
    .slice(0, 7)
    .map((p) => ({
      name: p.name,
      position: p.positionText,
      ca: p.ca,
      age: p.age,
      condition: p.condition,
      sharpness: p.sharpness,
    }));

  return {
    toolName: 'fm27_optimize_lineup',
    data: {
      club: clubName,
      tactic: {
        name: tactic.name,
        formation: tactic.formation,
        mentality: tactic.mentality,
        tacticalStyle: tactic.tacticalStyle,
      },
      startingXi,
      bench,
    },
  };
}

export function analyzeNextOppositionTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
): ToolExecutionSummary {
  const nextFixture = snapshot.fixtures.find(
    (f) =>
      f.status === 'Upcoming' &&
      (f.homeClub.toLowerCase() === clubName.toLowerCase() ||
        f.awayClub.toLowerCase() === clubName.toLowerCase()),
  );

  if (!nextFixture) {
    return {
      toolName: 'fm27_analyze_next_opposition',
      data: { error: `No upcoming fixtures found for ${clubName}.` },
    };
  }

  const opponentName = nextFixture.opponent;
  const opponentClub = snapshot.clubs.find(
    (c) => c.name.toLowerCase() === opponentName.toLowerCase(),
  );
  const opponentSquad = getClubSquad(snapshot, opponentName);
  const keyPlayers = opponentSquad.slice(0, 5).map((p) => ({
    name: p.name,
    position: p.positionText,
    age: p.age,
    ca: p.ca,
    pa: p.pa,
    pace: p.attributes.pace,
    passing: p.attributes.passing,
    finishing: p.attributes.finishing,
  }));
  const unavailable = opponentSquad
    .filter((p) => p.injured || p.onDuty)
    .map((p) => ({ name: p.name, position: p.positionText, injury: p.injury ?? p.dutyReason }));

  return {
    toolName: 'fm27_analyze_next_opposition',
    data: {
      fixture: nextFixture,
      opponentStanding: snapshot.leagueStanding?.nextOpponentStanding ?? null,
      opponentClub: opponentClub
        ? {
            name: opponentClub.name,
            competition: opponentClub.competition,
            reputation: opponentClub.reputation,
            fiveYearRank: opponentClub.coefficients?.fiveYearRank ?? null,
          }
        : { name: opponentName },
      keyPlayers,
      unavailable,
    },
  };
}

export function buildTransferShortlistTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
  userPrompt: string,
): ToolExecutionSummary {
  const club = snapshot.clubs.find((c) => c.name.toLowerCase() === clubName.toLowerCase());
  const budget = club?.transferBudget ?? snapshot.finances?.transferBudgetRemaining ?? null;
  const promptUpper = userPrompt.toUpperCase();

  const positionHints: PositionCode[] = [];
  if (/\b(GK|GOALKEEPER|KEEPER)\b/.test(promptUpper)) positionHints.push('GK');
  if (/\b(CB|DC|CENTRE-BACK|CENTER-BACK|DEFENDER)\b/.test(promptUpper)) positionHints.push('DC');
  if (/\b(LB|DL|LEFT-BACK|WBL)\b/.test(promptUpper)) positionHints.push('DL', 'WBL');
  if (/\b(RB|DR|RIGHT-BACK|WBR)\b/.test(promptUpper)) positionHints.push('DR', 'WBR');
  if (/\b(DM|CDM|HOLDING|ANCHOR|REGISTA)\b/.test(promptUpper)) positionHints.push('DM');
  if (/\b(CM|MC|MIDFIELDER|BOX-TO-BOX|PLAYMAKER)\b/.test(promptUpper)) positionHints.push('MC');
  if (/\b(AM|AMC|CAM|NUMBER 10|#10)\b/.test(promptUpper)) positionHints.push('AMC');
  if (/\b(LW|AML|RW|AMR|WINGER|INSIDE FORWARD)\b/.test(promptUpper)) positionHints.push('AML', 'AMR');
  if (/\b(ST|STRIKER|FORWARD|CF)\b/.test(promptUpper)) positionHints.push('ST');

  const maxAgeMatch = userPrompt.match(/(?:under|u|max\s*age)\s*(\d{2})/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 26;

  const candidates = snapshot.players
    .filter((p) => p.playingClub.toLowerCase() !== clubName.toLowerCase())
    .filter((p) => p.age === null || p.age <= maxAge)
    .filter((p) => {
      if (positionHints.length === 0) return true;
      return positionHints.some((pos) => (p.positions[pos] ?? 1) >= 15);
    })
    .filter((p) => {
      if (budget === null) return true;
      const price = p.askingPrice ?? p.estimatedValue ?? 0;
      return price <= budget * 1.45 || p.listedForLoan || p.transferListed;
    })
    .map((p) => {
      const price = p.askingPrice ?? p.estimatedValue ?? 0;
      const valueRatio = (p.pa ?? 0) * 0.65 + (p.ca ?? 0) * 0.55 - price / 2_500_000;
      return {
        id: p.id,
        name: p.name,
        age: p.age,
        club: p.club,
        nationality: p.nationality,
        position: p.positionText,
        ca: p.ca,
        pa: p.pa,
        askingPriceGbp: p.askingPrice,
        estimatedValueGbp: p.estimatedValue,
        wagePwGbp: p.wagePw,
        contractEnd: p.contractEnd ?? p.expires,
        transferListed: p.transferListed,
        listedForLoan: p.listedForLoan,
        score: Math.round(valueRatio * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    toolName: 'fm27_transfer_shortlist',
    data: {
      managedClub: club?.name ?? clubName,
      transferBudgetGbp: budget,
      positionHints: positionHints.length > 0 ? positionHints : ['All Positions'],
      maxAge,
      targets: candidates,
    },
  };
}

export function comparePlayersTool(
  snapshot: WorkspaceSnapshot,
  userPrompt: string,
): ToolExecutionSummary {
  const lower = userPrompt.toLowerCase();
  const matched = snapshot.players.filter(
    (p) =>
      lower.includes(p.name.toLowerCase()) ||
      p.name
        .toLowerCase()
        .split(' ')
        .some((part) => part.length >= 4 && lower.includes(part)),
  );

  const players = (matched.length >= 2 ? matched : snapshot.players.slice(0, 3)).slice(0, 4);
  return {
    toolName: 'fm27_compare_players',
    data: {
      compared: players.map((p) => ({
        name: p.name,
        club: p.club,
        age: p.age,
        position: p.positionText,
        ca: p.ca,
        pa: p.pa,
        wagePwGbp: p.wagePw,
        askingPriceGbp: p.askingPrice ?? p.estimatedValue,
        contractEnd: p.contractEnd ?? p.expires,
        engineMetrics: computeFm27EngineMetrics(p),
        keyStats: {
          pace: p.attributes.pace,
          acceleration: p.attributes.acceleration,
          jumping_reach: p.attributes.jumping_reach,
          stamina: p.attributes.stamina,
          passing: p.attributes.passing,
          tackling: p.attributes.tackling,
          finishing: p.attributes.finishing,
          decisions: p.attributes.decisions,
          composure: p.attributes.composure,
          determination: p.attributes.determination,
          professionalism: p.attributes.professionalism,
          consistency: p.attributes.consistency,
        },
        seasonStats: p.seasonStats ?? null,
      })),
    },
  };
}

export function assessStaffTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
): ToolExecutionSummary {
  const rated = snapshot.staff.map((s) => {
    const best = getBestStaffRoleRating(s);
    return {
      name: s.name,
      job: s.job,
      club: s.club || 'Unemployed',
      nationality: s.nationality,
      age: s.age,
      ca: s.ca,
      pa: s.pa,
      bestRole: best.label,
      bestStars: best.stars,
      bestScore20: best.score20,
      salaryWeeklyGbp: s.salaryWeekly,
    };
  });

  const clubStaff = rated.filter((s) => s.club.toLowerCase() === clubName.toLowerCase());
  const topMarketStaff = rated
    .filter((s) => s.club.toLowerCase() !== clubName.toLowerCase())
    .sort((a, b) => b.bestStars - a.bestStars || b.bestScore20 - a.bestScore20)
    .slice(0, 8);

  return {
    toolName: 'fm27_assess_staff',
    data: {
      managedClub: clubName,
      currentClubStaff: clubStaff,
      topMarketStaff,
    },
  };
}

export function getClubContextTool(
  snapshot: WorkspaceSnapshot,
  clubName: string,
  userPrompt: string,
): ToolExecutionSummary {
  const lower = userPrompt.toLowerCase();
  const namedClub: ClubRecord | undefined =
    snapshot.clubs.find((c) => lower.includes(c.name.toLowerCase())) ??
    snapshot.clubs.find((c) => c.name.toLowerCase() === clubName.toLowerCase());

  if (!namedClub) {
    return {
      toolName: 'fm27_get_club_context',
      data: {
        clubName,
        leagueStanding: snapshot.leagueStanding,
        finances: snapshot.finances,
        activeInjuries: snapshot.activeInjuries,
        mentoring: snapshot.mentoring,
        recentMatches: snapshot.matchLogs.slice(0, 6),
      },
    };
  }

  const squad = getClubSquad(snapshot, namedClub.name);
  return {
    toolName: 'fm27_get_club_context',
    data: {
      club: {
        name: namedClub.name,
        nation: namedClub.nation,
        competition: namedClub.competition,
        reputation: namedClub.reputation,
        facilities: {
          training: namedClub.trainingFacilities,
          youth: namedClub.youthFacilities,
          youthCoaching: namedClub.youthCoaching,
          youthRecruitment: namedClub.youthRecruitment,
          corporate: namedClub.corporateFacilities,
        },
        finances: {
          balanceGbp: namedClub.balance,
          transferBudgetGbp: namedClub.transferBudget,
          payrollBudgetWeeklyGbp: namedClub.payrollBudgetWeekly,
          currentWagesWeeklyGbp: namedClub.currentWagesWeekly,
          loans: namedClub.loans,
        },
        coefficients: namedClub.coefficients,
      },
      leagueStanding: snapshot.leagueStanding,
      activeInjuries: snapshot.activeInjuries,
      mentoring: snapshot.mentoring,
      recentMatches: snapshot.matchLogs.slice(0, 6),
      topPlayers: squad.slice(0, 8).map((p) => ({
        name: p.name,
        age: p.age,
        position: p.positionText,
        ca: p.ca,
        pa: p.pa,
      })),
    },
  };
}

export function runContextualFmTools(params: {
  prompt: string;
  commandName?: string;
  snapshot: WorkspaceSnapshot;
  managedClubName: string | null;
  includeManagedClub: boolean;
  activeTactic: TacticDefinition | null;
  includeTactic: boolean;
  recruitmentCases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
}): ToolExecutionSummary[] {
  const { prompt, commandName, snapshot, managedClubName, activeTactic, includeTactic } = params;

  if (
    snapshot.metadata.status === 'awaiting_save' ||
    (snapshot.players.length === 0 && snapshot.clubs.length === 0 && snapshot.matchLogs.length === 0)
  ) {
    return [
      {
        toolName: 'fm27_save_status',
        data: {
          status: 'awaiting_save',
          message:
            'No .fm save or FM27 export has been loaded yet. Do not invent any players, clubs, wages, matches, or stats. Guide the user to drop a .fm save file, CSV, Ctrl+P HTML export, or screenshot, or answer general Playbook v2.0 tactical questions.',
        },
      },
    ];
  }

  const effectiveClub =
    managedClubName || snapshot.metadata.managedClubName || snapshot.clubs[0]?.name || 'Managed Club';
  const lower = prompt.toLowerCase();
  const tools: ToolExecutionSummary[] = [];

  if (commandName === '/squad' || /\b(squad|depth|weak position|contract risk|injur)/i.test(lower)) {
    tools.push(analyzeSquadTool(snapshot, effectiveClub));
  }
  if (commandName === '/lineup' || /\b(lineup|starting xi|best xi|formation|tactic)/i.test(lower)) {
    tools.push(optimizeLineupTool(snapshot, effectiveClub, includeTactic ? activeTactic : null));
  }
  if (commandName === '/opposition' || /\b(opponent|opposition|next match|next fixture|preview)/i.test(lower)) {
    tools.push(analyzeNextOppositionTool(snapshot, effectiveClub));
  }
  if (commandName === '/recruit' || /\b(recruit|shortlist|transfer|sign|target|wonderkid|buy)/i.test(lower)) {
    tools.push(buildTransferShortlistTool(snapshot, effectiveClub, prompt));
  }
  if (commandName === '/compare' || /\b(compare|versus|vs\.?)\b/i.test(lower)) {
    tools.push(comparePlayersTool(snapshot, prompt));
  }
  if (commandName === '/staff' || /\b(staff|coach|scout|physio|assistant manager)/i.test(lower)) {
    tools.push(assessStaffTool(snapshot, effectiveClub));
  }
  if (commandName === '/club' || /\b(club|finance|budget|loan|debt|coefficient|facilit)/i.test(lower)) {
    tools.push(getClubContextTool(snapshot, effectiveClub, prompt));
  }

  if (tools.length === 0 && params.includeManagedClub) {
    tools.push(getClubContextTool(snapshot, effectiveClub, prompt));
    tools.push(analyzeSquadTool(snapshot, effectiveClub));
  }

  return tools;
}
