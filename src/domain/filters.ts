import { getBestStaffRoleRating } from './staffRatings';
import type {
  AppSettings,
  ClubFilterCriteria,
  ClubRecord,
  CompetitionFilterCriteria,
  CompetitionRecord,
  PlayerAttributes,
  PlayerFilterCriteria,
  PlayerRecord,
  PositionCode,
  StaffFilterCriteria,
  StaffRecord,
} from './types';

export function createEmptyPlayerFilter(): PlayerFilterCriteria {
  return {
    nameContains: '',
    gender: 'Any',
    playingNation: '',
    playingCompetition: '',
    ageMin: null,
    ageMax: null,
    heightMin: null,
    heightMax: null,
    club: '',
    weeklySalaryMax: null,
    askingPriceMin: null,
    askingPriceMax: null,
    contractEndFrom: '',
    contractEndTo: '',
    caMin: null,
    paMin: null,
    transferListedOnly: false,
    loanListedOnly: false,
    positions: {},
    attributes: {},
  };
}

export function createEmptyStaffFilter(): StaffFilterCriteria {
  return {
    nameContains: '',
    job: '',
    club: '',
    nationality: '',
    bestRole: '',
    minStars: null,
    caMin: null,
  };
}

export function createEmptyClubFilter(): ClubFilterCriteria {
  return {
    nameContains: '',
    nation: '',
    competition: '',
    reputationMin: null,
    balanceMin: null,
  };
}

export function createEmptyCompetitionFilter(): CompetitionFilterCriteria {
  return {
    nameContains: '',
    nation: '',
    gender: 'Any',
    reputationMin: null,
  };
}

export function isPlayerFilterActive(f: PlayerFilterCriteria): boolean {
  return Boolean(
    f.nameContains.trim() ||
      f.gender !== 'Any' ||
      f.playingNation ||
      f.playingCompetition ||
      f.ageMin !== null ||
      f.ageMax !== null ||
      f.heightMin !== null ||
      f.heightMax !== null ||
      f.club ||
      f.weeklySalaryMax !== null ||
      f.askingPriceMin !== null ||
      f.askingPriceMax !== null ||
      f.contractEndFrom ||
      f.contractEndTo ||
      f.caMin !== null ||
      f.paMin !== null ||
      f.transferListedOnly ||
      f.loanListedOnly ||
      Object.values(f.positions).some((v) => (v ?? 0) > 0) ||
      Object.values(f.attributes).some((v) => (v ?? 0) > 0),
  );
}

export function isStaffFilterActive(f: StaffFilterCriteria): boolean {
  return Boolean(
    f.nameContains.trim() ||
      f.job ||
      f.club ||
      f.nationality ||
      f.bestRole ||
      f.minStars !== null ||
      f.caMin !== null,
  );
}

export function isClubFilterActive(f: ClubFilterCriteria): boolean {
  return Boolean(
    f.nameContains.trim() ||
      f.nation ||
      f.competition ||
      f.reputationMin !== null ||
      f.balanceMin !== null,
  );
}

export function isCompetitionFilterActive(f: CompetitionFilterCriteria): boolean {
  return Boolean(
    f.nameContains.trim() || f.nation || f.gender !== 'Any' || f.reputationMin !== null,
  );
}

export function filterPlayers(players: PlayerRecord[], f: PlayerFilterCriteria): PlayerRecord[] {
  const nameLower = f.nameContains.trim().toLowerCase();
  const activePositions = Object.entries(f.positions).filter(([, min]) => (min ?? 0) > 0) as [
    PositionCode,
    number,
  ][];
  const activeAttrs = Object.entries(f.attributes).filter(([, min]) => (min ?? 0) > 0) as [
    keyof PlayerAttributes,
    number,
  ][];

  return players.filter((p) => {
    if (nameLower && !p.name.toLowerCase().includes(nameLower)) return false;
    if (f.gender !== 'Any' && p.gender !== f.gender) return false;
    if (f.playingNation && p.playingNation !== f.playingNation && p.nationality !== f.playingNation) {
      return false;
    }
    if (f.playingCompetition && p.playingCompetition !== f.playingCompetition) return false;
    if (f.ageMin !== null && (p.age === null || p.age < f.ageMin)) return false;
    if (f.ageMax !== null && (p.age === null || p.age > f.ageMax)) return false;
    if (f.heightMin !== null && (p.heightCm === null || p.heightCm < f.heightMin)) return false;
    if (f.heightMax !== null && (p.heightCm === null || p.heightCm > f.heightMax)) return false;
    if (f.club && p.club !== f.club && p.playingClub !== f.club) return false;
    if (f.weeklySalaryMax !== null && (p.wagePw === null || p.wagePw > f.weeklySalaryMax)) {
      return false;
    }
    if (f.askingPriceMin !== null) {
      const price = p.askingPrice ?? p.estimatedValue;
      if (price === null || price < f.askingPriceMin) return false;
    }
    if (f.askingPriceMax !== null) {
      const price = p.askingPrice ?? p.estimatedValue;
      if (price === null || price > f.askingPriceMax) return false;
    }
    const contractEnd = p.contractEnd ?? p.expires;
    if (f.contractEndFrom && (!contractEnd || contractEnd < f.contractEndFrom)) {
      return false;
    }
    if (f.contractEndTo && (!contractEnd || contractEnd > f.contractEndTo)) {
      return false;
    }
    if (f.caMin !== null && (p.ca === null || p.ca < f.caMin)) return false;
    if (f.paMin !== null && (p.pa === null || p.pa < f.paMin)) return false;
    if (f.transferListedOnly && !p.transferListed) return false;
    if (f.loanListedOnly && !p.listedForLoan) return false;

    for (const [pos, minFam] of activePositions) {
      if ((p.positions[pos] ?? 1) < minFam) return false;
    }
    for (const [attr, minVal] of activeAttrs) {
      const val = p.attributes[attr];
      if (val === null || val === undefined || val < minVal) return false;
    }
    return true;
  });
}

export function filterStaff(staff: StaffRecord[], f: StaffFilterCriteria): StaffRecord[] {
  const nameLower = f.nameContains.trim().toLowerCase();
  return staff.filter((s) => {
    if (nameLower && !s.name.toLowerCase().includes(nameLower)) return false;
    if (f.job && s.job !== f.job) return false;
    if (f.club && s.club !== f.club) return false;
    if (f.nationality && s.nationality !== f.nationality) return false;
    if (f.caMin !== null && (s.ca === null || s.ca < f.caMin)) return false;
    if (f.bestRole || f.minStars !== null) {
      const best = getBestStaffRoleRating(s);
      if (f.bestRole && best.label !== f.bestRole) return false;
      if (f.minStars !== null && best.stars < f.minStars) return false;
    }
    return true;
  });
}

export function filterClubs(clubs: ClubRecord[], f: ClubFilterCriteria): ClubRecord[] {
  const nameLower = f.nameContains.trim().toLowerCase();
  return clubs.filter((c) => {
    if (nameLower && !c.name.toLowerCase().includes(nameLower)) return false;
    if (f.nation && c.nation !== f.nation) return false;
    if (f.competition && c.competition !== f.competition) return false;
    if (f.reputationMin !== null && (c.reputation === null || c.reputation < f.reputationMin)) {
      return false;
    }
    if (f.balanceMin !== null && (c.balance === null || c.balance < f.balanceMin)) {
      return false;
    }
    return true;
  });
}

export function filterCompetitions(
  competitions: CompetitionRecord[],
  f: CompetitionFilterCriteria,
): CompetitionRecord[] {
  const nameLower = f.nameContains.trim().toLowerCase();
  return competitions.filter((c) => {
    if (nameLower && !c.name.toLowerCase().includes(nameLower)) return false;
    if (f.nation && c.nation !== f.nation) return false;
    if (f.gender !== 'Any' && c.gender !== f.gender) return false;
    if (f.reputationMin !== null && (c.reputation === null || c.reputation < f.reputationMin)) {
      return false;
    }
    return true;
  });
}

const CURRENCY_RATES: Record<AppSettings['currency'], { symbol: string; mult: number }> = {
  GBP: { symbol: '£', mult: 1 },
  EUR: { symbol: '€', mult: 1.17 },
  USD: { symbol: '$', mult: 1.28 },
};

export function formatMoney(amountGbp: number | null | undefined, settings: AppSettings): string {
  if (amountGbp === null || amountGbp === undefined || !Number.isFinite(amountGbp)) return '—';
  const { symbol, mult } = CURRENCY_RATES[settings.currency];
  const converted = Math.round(amountGbp * mult);
  const abs = Math.abs(converted);
  const sign = converted < 0 ? '-' : '';
  return `${sign}${symbol}${abs.toLocaleString('en-GB')}`;
}

export function formatWage(weeklyGbp: number | null | undefined, settings: AppSettings): string {
  if (weeklyGbp === null || weeklyGbp === undefined || !Number.isFinite(weeklyGbp)) return '—';
  const periodMult =
    settings.wagePeriod === 'annual' ? 52 : settings.wagePeriod === 'monthly' ? 4.333 : 1;
  return formatMoney(Math.round(weeklyGbp * periodMult), settings);
}

export function wagePeriodSuffix(settings: AppSettings): string {
  if (settings.wagePeriod === 'annual') return 'p/y';
  if (settings.wagePeriod === 'monthly') return 'p/m';
  return 'p/w';
}

export interface ChatSlashCommand {
  name: string;
  description: string;
  question: string;
  requirement: string;
  executeImmediately: boolean;
}

export const SLASH_COMMANDS: ChatSlashCommand[] = [
  {
    name: '/squad',
    description: 'Review squad depth, weak positions and contract risks',
    question:
      'Analyze squad depth, weak positions, injuries, fatigue and contract risks for my managed club using the loaded FM27 data.',
    requirement: 'Focus on',
    executeImmediately: false,
  },
  {
    name: '/lineup',
    description: 'Best XI for your active dual-phase tactic · tactic required',
    question:
      'Build the best starting XI for my managed club using my active FM27 dual-phase tactic, explaining IP/OOP choices, substitutions and alternatives.',
    requirement: 'Requirements',
    executeImmediately: false,
  },
  {
    name: '/opposition',
    description: "Analyze your next opponent's strengths and weaknesses",
    question:
      "Summarize my next opponent's strengths, weaknesses, key players and unavailable players, and recommend a practical match approach.",
    requirement: 'Focus on',
    executeImmediately: true,
  },
  {
    name: '/recruit',
    description: 'Find transfer targets for a position or role',
    question:
      'Return realistic transfer targets for my managed club using squad needs, position fit, asking price and wage affordability.',
    requirement: 'Requirements',
    executeImmediately: false,
  },
  {
    name: '/compare',
    description: 'Compare players and their fit for my club',
    question:
      'Compare the named players, including their tactical fit, physical engine metrics, cost, potential and risks for my club.',
    requirement: 'Players and requirements',
    executeImmediately: false,
  },
  {
    name: '/staff',
    description: 'Find or assess staff and 9-role coaching star ratings',
    question:
      'Find or assess staff for my club, including 9-role coaching star ratings and Playbook v2.0 hiring priorities.',
    requirement: 'Requirements',
    executeImmediately: false,
  },
  {
    name: '/club',
    description: 'Inspect a club, budget, facilities and squad context',
    question:
      'Summarize the club profile, finances, debts and squad context for the named club (or my managed club if none is named).',
    requirement: 'Club and requirements',
    executeImmediately: false,
  },
];

export const CHAT_COMMANDS = SLASH_COMMANDS;

export function matchSlashCommands(input: string): ChatSlashCommand[] {
  if (!input || !input.startsWith('/')) return [];
  const token = input.split(/\s/, 2)[0].toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(token));
}

export function expandSlashCommand(
  input: string,
): { command: ChatSlashCommand; expanded: string } | null {
  if (!input || !input.startsWith('/')) return null;
  const match = input.match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const cmdName = match[1].toLowerCase();
  const trailing = (match[2] ?? '').trim();
  const command = SLASH_COMMANDS.find((c) => c.name === cmdName);
  if (!command) return null;
  const expanded = trailing
    ? `${command.question} ${command.requirement}: ${trailing}`
    : command.question;
  return { command, expanded };
}
