export type DecoderFieldOrigin =
  | 'decoder'
  | 'decoder-optional'
  | 'derived'
  | 'guessed'
  | 'unused'
  | 'stale';

export interface DecoderFieldExpectation {
  group: string;
  path: string;
  label: string;
  required: boolean;
  origin: DecoderFieldOrigin;
  note?: string;
}

export type DecoderFieldStatus =
  | 'supplied'
  | 'partial'
  | 'missing'
  | 'empty'
  | 'derived'
  | 'guessed'
  | 'unused'
  | 'stale';

export interface DecoderFieldCoverageRow extends DecoderFieldExpectation {
  values: number;
  present: number;
  nullCount: number;
  emptyCount: number;
  status: DecoderFieldStatus;
}

export interface DecoderFieldCoverageSummary {
  rows: number;
  supplied: number;
  partial: number;
  missing: number;
  empty: number;
  derived: number;
  guessed: number;
  unused: number;
  stale: number;
}

const PLAYER_ATTRIBUTES = [
  'corners',
  'crossing',
  'dribbling',
  'finishing',
  'firstTouch',
  'freeKicks',
  'heading',
  'longShots',
  'longThrows',
  'marking',
  'passing',
  'penalties',
  'tackling',
  'technique',
  'aggression',
  'anticipation',
  'bravery',
  'composure',
  'concentration',
  'decisions',
  'determination',
  'flair',
  'leadership',
  'offTheBall',
  'positioning',
  'teamwork',
  'vision',
  'workRate',
  'acceleration',
  'agility',
  'balance',
  'jumpingReach',
  'naturalFitness',
  'pace',
  'stamina',
  'strength',
  'aerialReach',
  'commandOfArea',
  'communication',
  'eccentricity',
  'handling',
  'kicking',
  'oneOnOnes',
  'punching',
  'reflexes',
  'rushingOut',
  'throwing',
] as const;

const PLAYER_ATTRIBUTE_ALIASES = [
  'firstTouchGk',
  'passingGk',
  'throwingDistance',
  'freeKickTaking',
  'penaltyTaking',
] as const;

const STAFF_ATTRIBUTES = [
  'attacking',
  'defending',
  'fitness',
  'goalkeeping',
  'mental',
  'possession',
  'set_pieces',
  'tactical',
  'technical',
  'working_with_youngsters',
  'adaptability',
  'authority',
  'determination',
  'judging_player_ability',
  'judging_player_potential',
  'judging_staff_ability',
  'man_management',
  'motivating',
  'negotiating',
  'physiotherapy',
  'sports_science',
  'tactical_knowledge',
  'analysing_data',
] as const;

function row(
  group: string,
  path: string,
  label: string,
  required: boolean,
  origin: DecoderFieldOrigin,
  note?: string
): DecoderFieldExpectation {
  return { group, path, label, required, origin, note };
}

export const DECODER_FIELD_EXPECTATIONS: DecoderFieldExpectation[] = [
  row('Save meta', 'meta.game', 'Game name', true, 'decoder'),
  row('Save meta', 'meta.build', 'FM build', true, 'decoder'),
  row('Save meta', 'meta.knownBuild', 'Known build flag', true, 'decoder'),
  row('Save meta', 'meta.saveName', 'Save name', true, 'decoder'),
  row('Save meta', 'meta.gameDateIso', 'In-game date (ISO)', true, 'decoder'),
  row('Save meta', 'meta.gameDateDmy', 'In-game date (DD/MM/YYYY)', true, 'decoder'),
  row('Save meta', 'meta.clubUid', 'Club UID', true, 'decoder'),
  row('Save meta', 'meta.clubName', 'Club name', true, 'decoder'),
  row('Save meta', 'meta.managerName', 'Manager name', true, 'decoder'),
  row('Save meta', 'meta.balance', 'Meta bank balance', false, 'decoder-optional'),
  row('Save meta', 'meta.scoutingBudget', 'Scouting budget', false, 'unused', 'Decoded and typed, but no UI or Analyst consumer.'),
  row('Save meta', 'meta.scoutingBudgetRemaining', 'Scouting budget remaining', false, 'unused', 'Decoded and typed, but no UI or Analyst consumer.'),
  row('Save meta', 'meta.fmsaveVersion', 'fmsave version', true, 'decoder'),
  row('Save meta', 'meta.fileName', 'Save file name', false, 'decoder-optional'),
  row('Save meta', 'meta.fileSizeMb', 'Save file size', false, 'decoder-optional'),
  row('Save meta', 'meta.decodedAtIso', 'Decode timestamp', false, 'decoder-optional'),
  row('Save meta', 'meta.importScope', 'Import scope', false, 'decoder-optional'),
  row('Save meta', 'meta.fastSync', 'Fast-sync flag', false, 'stale', 'Duplicated by the top-level fastSync field.'),
  row('Save meta', 'meta.mountMode', 'Mount mode', false, 'decoder-optional'),
  row('Save meta', 'meta.patchCompatibility', 'Patch compatibility summary', false, 'decoder-optional'),

  row('Squad profile', 'players[].uid', 'Player UID', true, 'decoder'),
  row('Squad profile', 'players[].name', 'Player name', true, 'decoder'),
  row('Squad profile', 'players[].shirtNumber', 'Shirt number', false, 'guessed', 'Hydrator falls back to 0 when absent.'),
  row('Squad profile', 'players[].position', 'Position', true, 'decoder'),
  row('Squad profile', 'players[].primaryPosition', 'Primary position', false, 'decoder-optional'),
  row('Squad profile', 'players[].secondaryPositions', 'Secondary positions', false, 'decoder-optional'),
  row('Squad profile', 'players[].age', 'Age', true, 'decoder'),
  row('Squad profile', 'players[].heightCm', 'Height', false, 'decoder-optional'),
  row('Squad profile', 'players[].nation', 'Nationality', false, 'decoder-optional'),
  row('Squad profile', 'players[].morale', 'Morale', false, 'guessed', 'UI may fall back to a neutral label when absent.'),
  row('Squad profile', 'players[].personalityLabel', 'Personality label', false, 'guessed', 'Hydrator derives a label from attributes when absent.'),
  row('Squad profile', 'players[].condition', 'Condition', true, 'decoder'),
  row('Squad profile', 'players[].sharpness', 'Sharpness', true, 'decoder'),
  row('Squad profile', 'players[].leftFoot', 'Left foot', false, 'decoder-optional'),
  row('Squad profile', 'players[].rightFoot', 'Right foot', false, 'decoder-optional'),
  row('Squad profile', 'players[].preferredFoot', 'Preferred foot', false, 'guessed', 'Hydrator infers it from left/right foot strength.'),
  row('Squad profile', 'players[].abilityStars', 'Ability stars', false, 'derived', 'The decoder scrubs raw CA/PA; stars are the safe display value.'),
  row('Squad profile', 'players[].potentialStars', 'Potential stars', false, 'derived'),
  row('Squad profile', 'players[].potentialUncertain', 'Potential range flag', false, 'decoder-optional'),
  row('Squad profile', 'players[].positionRatings', 'Position familiarity', false, 'decoder-optional'),
  row('Squad profile', 'players[].attributes', 'Attribute block', true, 'decoder'),
  row('Squad profile', 'players[].traits', 'Traits', false, 'decoder-optional'),
  row('Squad profile', 'players[].scoutBadges', 'Scout badges', false, 'guessed', 'Hydrator derives badges from attributes when internal reliability is absent.'),
  row('Squad profile', 'players[].internalReliability', 'Internal reliability flags', false, 'decoder-optional', 'Not emitted by the current decoder; scout badges fall back to attribute heuristics.'),
  row('Squad profile', 'players[].hiddenPersonality', 'Hidden personality values', false, 'decoder-optional', 'Not emitted by the current decoder; personality falls back to visible attributes.'),
  row('Squad profile', 'players[].activeSuspensions', 'Player suspensions', false, 'decoder-optional'),
  row('Squad profile', 'players[].suspensionsCount', 'Suspension count', true, 'decoder'),

  row('Squad contract', 'players[].wagePw', 'Weekly wage', true, 'decoder'),
  row('Squad contract', 'players[].expires', 'Contract expiry', true, 'decoder'),
  row('Squad contract', 'players[].contractExpiryMonths', 'Contract expiry months', false, 'decoder-optional'),
  row('Squad contract', 'players[].contractDetails', 'Contract detail block', false, 'decoder-optional'),
  row('Squad contract', 'players[].contractDetails.promisedPlayingTime', 'Promised playing time', false, 'guessed', 'Squad status is derived from this when present, otherwise from minutes and stars.'),
  row('Squad contract', 'players[].contractDetails.releaseClauses', 'Release clauses', false, 'decoder-optional'),
  row('Squad contract', 'players[].contractDetails.optionalExtensionYears', 'Optional extension years', false, 'decoder-optional'),
  row('Squad contract', 'players[].contractDetails.bonuses', 'Contract bonuses', false, 'decoder-optional'),
  row('Squad contract', 'players[].contractDetails.loanWageContributionPct', 'Loan wage contribution', false, 'decoder-optional', 'Null for permanent contracts; the UI shows no loan contribution.'),
  row('Squad contract', 'players[].onLoan', 'Loan flag', true, 'decoder'),
  row('Squad contract', 'players[].teamSlot', 'Squad slot', true, 'decoder'),

  row('Squad stats', 'players[].apps', 'Appearances', true, 'decoder'),
  row('Squad stats', 'players[].minutes', 'Minutes', true, 'decoder'),
  row('Squad stats', 'players[].rating', 'Average rating', false, 'decoder-optional', 'Null for players without match stats; the UI shows --.'),
  row('Squad stats', 'players[].goals', 'Goals', true, 'decoder'),
  row('Squad stats', 'players[].xG', 'Expected goals', true, 'decoder'),
  row('Squad stats', 'players[].xGPer90', 'xG per 90', true, 'decoder'),
  row('Squad stats', 'players[].assists', 'Assists', true, 'decoder'),
  row('Squad stats', 'players[].xA', 'Expected assists', true, 'decoder'),
  row('Squad stats', 'players[].xAPer90', 'xA per 90', true, 'decoder'),
  row('Squad stats', 'players[].drbPer90', 'Dribbles per 90', true, 'decoder'),
  row('Squad stats', 'players[].prPassesPer90', 'Progressive passes per 90', true, 'decoder'),
  row('Squad stats', 'players[].hdrPct', 'Header percentage', true, 'decoder'),
  row('Squad stats', 'players[].intPer90', 'Interceptions per 90', true, 'decoder'),
  row('Squad stats', 'players[].tckPct', 'Tackle percentage', true, 'decoder'),
  row('Squad stats', 'players[].distanceKm', 'Distance covered', true, 'decoder'),
  row('Squad stats', 'players[].yellowCards', 'Yellow cards', true, 'decoder'),
  row('Squad stats', 'players[].redCards', 'Red cards', true, 'decoder'),
  row('Squad stats', 'players[].marketValue', 'Market value', false, 'decoder-optional'),
  row('Squad stats', 'players[].marketValueState', 'Market value state', false, 'decoder-optional'),
  row('Squad stats', 'players[].marketValueCapped', 'Market value cap flag', false, 'decoder-optional'),
  row('Squad stats', 'players[].last5Ratings', 'Last-five ratings', false, 'decoder-optional'),
  row('Squad stats', 'players[].seasonHistory', 'Season history', false, 'decoder-optional'),
  row('Squad stats', 'playerMatchStats', 'Player match-stat map', false, 'decoder-optional'),
  row('Squad stats', 'playerSeasonHistory', 'Player season-history map', false, 'decoder-optional'),

  ...PLAYER_ATTRIBUTES.map((key) =>
    row('Squad attributes', `players[].attributes.${key}`, key, true, 'decoder')
  ),
  ...PLAYER_ATTRIBUTE_ALIASES.map((key) =>
    row('Squad attributes', `players[].attributes.${key}`, `${key} alias`, false, 'decoder-optional')
  ),

  row('Staff', 'staff[].uid', 'Staff UID', true, 'decoder'),
  row('Staff', 'staff[].name', 'Staff name', true, 'decoder'),
  row('Staff', 'staff[].role', 'Role', true, 'decoder'),
  row('Staff', 'staff[].age', 'Age', false, 'decoder-optional'),
  row('Staff', 'staff[].nation', 'Nationality', false, 'decoder-optional'),
  row('Staff', 'staff[].club', 'Club', false, 'decoder-optional'),
  row('Staff', 'staff[].wagePw', 'Weekly wage', false, 'decoder-optional'),
  row('Staff', 'staff[].expires', 'Contract expiry', false, 'decoder-optional'),
  row('Staff', 'staff[].secondaryJob', 'Secondary job', false, 'decoder-optional', 'Not emitted by the current decoder; the Staff card hides the secondary-job pill when null.'),
  row('Staff', 'staff[].jobRatings', 'Preferred Job Affinity block', false, 'decoder-optional', 'Missing for 3 of 118 staff; the detail modal hides the affinity table for those rows.'),
  row('Staff', 'staff[].jobRatings.fitness_coach', 'Fitness coach affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].jobRatings.goalkeeping_coach', 'Goalkeeping coach affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].jobRatings.set_piece_coach', 'Set-piece coach affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].jobRatings.loan_manager', 'Loan manager affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].jobRatings.physio', 'Physio affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].jobRatings.sports_scientist', 'Sports scientist affinity', false, 'decoder-optional'),
  row('Staff', 'staff[].coachingDefending', 'Coaching defending', false, 'stale', 'Legacy flat copy of staff.attributes.defending.'),
  row('Staff', 'staff[].coachingAttacking', 'Coaching attacking', false, 'stale', 'Legacy flat copy of staff.attributes.attacking.'),
  row('Staff', 'staff[].coachingTactical', 'Coaching tactical', false, 'stale', 'Legacy flat copy of staff.attributes.tactical.'),
  row('Staff', 'staff[].judgingAbility', 'Judging ability', false, 'stale', 'Legacy flat copy of staff.attributes.judging_player_ability.'),
  row('Staff', 'staff[].judgingPotential', 'Judging potential', false, 'stale', 'Legacy flat copy of staff.attributes.judging_player_potential.'),
  ...STAFF_ATTRIBUTES.map((key) =>
    row('Staff attributes', `staff[].attributes.${key}`, key, true, 'decoder')
  ),

  row('Matches', 'playedMatches[].matchId', 'Match ID', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].dateIso', 'Date (ISO)', true, 'decoder'),
  row('Matches', 'playedMatches[].dateDmy', 'Date (DD/MM/YYYY)', true, 'decoder'),
  row('Matches', 'playedMatches[].competitionId', 'Competition ID', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].competition', 'Competition', true, 'decoder'),
  row('Matches', 'playedMatches[].opponent', 'Opponent', true, 'decoder'),
  row('Matches', 'playedMatches[].venue', 'Venue', true, 'decoder'),
  row('Matches', 'playedMatches[].result', 'Result', true, 'decoder'),
  row('Matches', 'playedMatches[].score', 'Score', true, 'decoder'),
  row('Matches', 'playedMatches[].xGFor', 'xG for', false, 'decoder-optional', 'Null on one cup match in the audit set; the match card shows --.'),
  row('Matches', 'playedMatches[].xGAgainst', 'xG against', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].possession', 'Possession', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].passCompletion', 'Pass completion', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].shotsFor', 'Shots for', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].shotsAgainst', 'Shots against', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].cccFor', 'Chances created for', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].cccAgainst', 'Chances created against', false, 'decoder-optional'),
  row('Matches', 'playedMatches[].distanceKm', 'Distance covered', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].matchId', 'Team-stat match ID', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].date', 'Team-stat date', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].opponent', 'Team-stat opponent', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].isHome', 'Team-stat home flag', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].goalsFor', 'Team-stat goals for', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].goalsAgainst', 'Team-stat goals against', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].xgFor', 'Team-stat xG for', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].xgAgainst', 'Team-stat xG against', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].shots', 'Team-stat shots', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].shotsOnTarget', 'Team-stat shots on target', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].oppShots', 'Team-stat opponent shots', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].oppShotsOnTarget', 'Team-stat opponent shots on target', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].possession', 'Team-stat possession', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].passCompletion', 'Team-stat pass completion', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].cccFor', 'Team-stat chances created', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].cccAgainst', 'Team-stat chances conceded', false, 'decoder-optional'),
  row('Matches', 'teamMatchStats[].distanceKm', 'Team-stat distance', false, 'decoder-optional'),

  row('League', 'leagueStanding.competitionId', 'Competition ID', false, 'decoder-optional'),
  row('League', 'leagueStanding.competitionName', 'Competition name', false, 'decoder-optional', 'Null in auto_save_v03_; the Hub omits the league table for that save.'),
  row('League', 'leagueStanding.position', 'Position', true, 'decoder'),
  row('League', 'leagueStanding.totalTeams', 'Total teams', true, 'decoder'),
  row('League', 'leagueStanding.played', 'Played', true, 'decoder'),
  row('League', 'leagueStanding.won', 'Won', true, 'decoder'),
  row('League', 'leagueStanding.drawn', 'Drawn', true, 'decoder'),
  row('League', 'leagueStanding.lost', 'Lost', true, 'decoder'),
  row('League', 'leagueStanding.goalsFor', 'Goals for', true, 'decoder'),
  row('League', 'leagueStanding.goalsAgainst', 'Goals against', true, 'decoder'),
  row('League', 'leagueStanding.goalDiff', 'Goal difference', true, 'decoder'),
  row('League', 'leagueStanding.points', 'Points', true, 'decoder'),
  row('League', 'leagueStanding.nextOpponentStanding', 'Next opponent standing', false, 'decoder-optional'),
  row('League', 'leagueStanding.top5', 'Top-five rows', false, 'decoder-optional'),
  row('League', 'leagueStanding.rows', 'Full table rows', false, 'decoder-optional'),
  row('League', 'upcomingFixtures[].dateIso', 'Fixture date (ISO)', true, 'decoder'),
  row('League', 'upcomingFixtures[].dateDmy', 'Fixture date (DD/MM/YYYY)', true, 'decoder'),
  row('League', 'upcomingFixtures[].competitionId', 'Fixture competition ID', false, 'decoder-optional'),
  row('League', 'upcomingFixtures[].competition', 'Fixture competition', true, 'decoder'),
  row('League', 'upcomingFixtures[].opponent', 'Fixture opponent', true, 'decoder'),
  row('League', 'upcomingFixtures[].venue', 'Fixture venue', true, 'decoder'),

  row('Finances', 'finances.month', 'Finance month', true, 'decoder'),
  row('Finances', 'finances.balance', 'Bank balance', true, 'decoder'),
  row('Finances', 'finances.wagePayrollWeekly', 'Club wage payroll', true, 'decoder'),
  row('Finances', 'finances.wageBudgetWeekly', 'Wage budget', true, 'decoder'),
  row('Finances', 'finances.transferBudgetRemaining', 'Transfer budget remaining', true, 'decoder'),
  row('Finances', 'monthlyFinances[].month', 'Monthly finance month', true, 'decoder'),
  row('Finances', 'monthlyFinances[].balance', 'Monthly balance', true, 'decoder'),
  row('Finances', 'monthlyFinances[].wageSpend', 'Monthly wage spend', true, 'decoder'),
  row('Finances', 'monthlyFinances[].netCashflow', 'Monthly net cashflow', true, 'decoder'),
  row('Finances', 'sponsorships[].club_name', 'Sponsor club name', false, 'stale', 'The decoder emits snake_case; the SponsorshipDeal type exposes camelCase aliases.'),
  row('Finances', 'sponsorships[].kind', 'Sponsor kind', false, 'stale', 'The decoder emits a kind object; the type expects name/type strings.'),
  row('Finances', 'sponsorships[].start', 'Sponsor start date', false, 'stale'),
  row('Finances', 'sponsorships[].end', 'Sponsor end date', false, 'stale'),
  row('Finances', 'sponsorships[].annual_value', 'Sponsor annual value', false, 'stale'),
  row('Finances', 'sponsorships[].dates_reordered', 'Sponsor date-reorder flag', false, 'stale'),
  row('Finances', 'transferWindows.isOpen', 'Transfer window open', false, 'decoder-optional'),
  row('Finances', 'transferWindows.windows', 'Transfer window rows', false, 'decoder-optional'),
  row('Finances', 'competitionRules.competitionName', 'Competition rules name', false, 'decoder-optional'),
  row('Finances', 'competitionRules.maxSquadSize', 'Max squad size', false, 'decoder-optional', 'Null in all three audit saves; the rules card omits it.'),
  row('Finances', 'competitionRules.matchdaySubsLimit', 'Matchday subs limit', false, 'decoder-optional', 'Null in all three audit saves.'),
  row('Finances', 'competitionRules.maxForeignPlayers', 'Max foreign players', false, 'decoder-optional', 'Null in all three audit saves.'),

  row('Injuries and bans', 'activeInjuries[].playerUid', 'Injured player UID', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].playerName', 'Injured player name', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].typeName', 'Injury type', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].date', 'Injury date', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].expectedReturn', 'Expected return', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].severity', 'Injury severity', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].cause', 'Injury cause', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeInjuries[].kind', 'Injury kind', false, 'decoder-optional', 'No injuries in the audit saves; an empty list is valid.'),
  row('Injuries and bans', 'activeSuspensions[].playerUid', 'Suspended player UID', true, 'decoder'),
  row('Injuries and bans', 'activeSuspensions[].playerName', 'Suspended player name', false, 'decoder-optional'),
  row('Injuries and bans', 'activeSuspensions[].matchesRemaining', 'Matches remaining', true, 'decoder'),
  row('Injuries and bans', 'activeSuspensions[].competitionName', 'Suspension competition', true, 'decoder'),
  row('Injuries and bans', 'activeSuspensions[].scope', 'Suspension scope', true, 'decoder'),
  row('Injuries and bans', 'activeSuspensions[].reason', 'Suspension reason', true, 'decoder'),

  row('Tactics', 'tactics[].index', 'Tactic index', false, 'decoder-optional', 'last_save_overwrite_backup has no tactics because its team-block check failed; the tactic card hides.'),
  row('Tactics', 'tactics[].name', 'Tactic name', true, 'decoder'),
  row('Tactics', 'tactics[].styleName', 'Style name', true, 'decoder'),
  row('Tactics', 'tactics[].mentality', 'Mentality', true, 'decoder'),
  row('Tactics', 'tactics[].inPossessionFormation', 'In-possession formation', false, 'decoder-optional'),
  row('Tactics', 'tactics[].outOfPossessionFormation', 'Out-of-possession formation', false, 'decoder-optional'),
  row('Tactics', 'tactics[].isActive', 'Active tactic flag', false, 'decoder-optional'),
  row('Tactics', 'tactics[].teamInstructions', 'Team instructions', false, 'decoder-optional'),
  row('Tactics', 'tactics[].slots', 'Tactic slots', false, 'decoder-optional'),
  row('Tactics', 'tactics[].slots[].playerUid', 'Slot player UID', false, 'decoder-optional'),
  row('Tactics', 'tactics[].slots[].position', 'Slot position', false, 'decoder-optional'),
  row('Tactics', 'tactics[].slots[].inPossessionRole', 'Slot in-possession role', false, 'decoder-optional'),
  row('Tactics', 'tactics[].slots[].outOfPossessionRole', 'Slot out-of-possession role', false, 'decoder-optional'),
  row('Tactics', 'training', 'Training block', false, 'unused', 'Decoded but no UI or live Analyst consumer yet.'),
  row('Tactics', 'setPieces', 'Set-piece block', false, 'unused', 'Decoded but no UI or live Analyst consumer yet.'),
  row('Tactics', 'selections', 'Selection block', false, 'derived', 'Used by the governance builder for matchday selection.'),
  row('Tactics', 'mentoring[].groupNumber', 'Mentoring group number', true, 'decoder'),
  row('Tactics', 'mentoring[].label', 'Mentoring label', true, 'decoder'),
  row('Tactics', 'mentoring[].members', 'Mentoring members', true, 'decoder'),
  row('Tactics', 'squadPlanner[].seasonOffset', 'Planner season offset', true, 'decoder'),
  row('Tactics', 'squadPlanner[].slot', 'Planner slot', true, 'decoder'),
  row('Tactics', 'squadPlanner[].positionCode', 'Planner position code', false, 'stale', 'Emitted by the decoder but missing from the DecodedFmSavePayload type.'),
  row('Tactics', 'squadPlanner[].playerUids', 'Planner player UIDs', true, 'decoder'),
  row('Tactics', 'squadPlanner[].playerNames', 'Planner player names', true, 'decoder'),

  row('Recruitment', 'recruitmentTargets[].uid', 'Target UID', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].name', 'Target name', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].age', 'Target age', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].nationality', 'Target nationality', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].primaryPosition', 'Target primary position', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].secondaryPositions', 'Target secondary positions', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].positionRatings', 'Target position ratings', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].currentClub', 'Target current club', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].shortlistOrigin', 'Shortlist origin', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].shortlistDate', 'Shortlist date', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].personality', 'Target personality', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].preferredFoot', 'Target preferred foot', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].heightCm', 'Target height', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].currentWagePw', 'Target current wage', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].transferValue', 'Target transfer value', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].transferValueState', 'Target value state', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].contractDetails', 'Target contract details', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].isFreeAgent', 'Target free-agent flag', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].isLoanCandidate', 'Target loan flag', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].parentClubWagePw', 'Target parent-club wage', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].contractExpiryMonths', 'Target expiry months', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].expires', 'Target expiry', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].demandedWageEur', 'Target demanded wage', true, 'decoder'),
  row('Recruitment', 'recruitmentTargets[].scoutBadges', 'Target scout badges', false, 'decoder-optional', 'Empty in all three audit saves; the target card hides the badge row.'),
  row('Recruitment', 'recruitmentTargets[].traits', 'Target traits', false, 'decoder-optional'),
  row('Recruitment', 'recruitmentTargets[].attributes', 'Target attributes', true, 'decoder'),
  row('Recruitment', 'jobVacancies[].club_name', 'Vacancy club name', false, 'stale', 'Normalized by normalizeJobVacancy.'),
  row('Recruitment', 'jobVacancies[].unknown', 'Vacancy raw role block', false, 'stale', 'Role code is read from the raw unknown block.'),
  row('Recruitment', 'jobVacancies[].advertised_date', 'Vacancy advertised date', false, 'stale'),
  row('Recruitment', 'jobVacancies[].league_position', 'Vacancy league position', false, 'stale'),
  row('Recruitment', 'jobVacancies[].team_slot', 'Vacancy team slot', false, 'stale'),

  row('Governance', 'governance.managerContract', 'Manager contract', false, 'decoder-optional'),
  row('Governance', 'governance.boardConfidence', 'Board confidence', false, 'decoder-optional'),
  row('Governance', 'governance.supporterConfidence', 'Supporter confidence', false, 'decoder-optional'),
  row('Governance', 'governance.boardObjectives', 'Board objectives', false, 'decoder-optional', 'Empty in all three audit saves; the governance card shows no objectives.'),
  row('Governance', 'governance.clubPromises', 'Club promises', false, 'decoder-optional', 'Empty in all three audit saves; the governance card shows no promises.'),
  row('Governance', 'governance.binaryProbedFields', 'Binary governance probes', false, 'decoder-optional'),
  row('Governance', 'divisionBenchmarks.competitionName', 'Benchmark competition', false, 'decoder-optional', 'The whole block is null in all three audit saves; Transfers falls back to squad-relative benchmarks.'),
  row('Governance', 'divisionBenchmarks.scope', 'Benchmark scope', false, 'decoder-optional', 'The whole block is null in all three audit saves.'),
  row('Governance', 'divisionBenchmarks.clubCount', 'Benchmark club count', false, 'decoder-optional', 'The whole block is null in all three audit saves.'),
  row('Governance', 'divisionBenchmarks.byPositionGroup', 'Benchmarks by position', false, 'decoder-optional', 'The whole block is null in all three audit saves.'),
  row('Governance', 'facilities', 'Facilities block', false, 'decoder-optional'),
  row('Governance', 'facilities.training', 'Training facilities', false, 'decoder-optional', 'Only corporate facilities are emitted; training and youth read as Unknown.'),
  row('Governance', 'facilities.youth', 'Youth facilities', false, 'decoder-optional', 'Only corporate facilities are emitted; training and youth read as Unknown.'),
  row('Governance', 'facilities.corporate', 'Corporate facilities', false, 'decoder-optional'),

  row('Diagnostics', 'extractionManifest.seniorSquad', 'Senior squad count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.youthReserves', 'Youth/reserve count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.totalPlayers', 'Total player count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.shortlistScouted', 'Scouted shortlist count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.staff', 'Staff count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.playedMatches', 'Played-match count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.upcomingFixtures', 'Fixture count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.activeInjuries', 'Injury count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.activeSuspensions', 'Suspension count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.playerMatchStats', 'Player match-stat count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.playerSeasonHistory', 'Player season-history count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.teamMatchStats', 'Team match-stat count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.tactics', 'Tactic count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.tacticInstructionsCount', 'Instruction count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.squadPlannerSlots', 'Planner slot count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.setPieceRoutines', 'Set-piece count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.mentoringGroups', 'Mentoring group count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.sponsorships', 'Sponsorship count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.hasFinances', 'Finance availability', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.hasLeagueStanding', 'League availability', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.hasManagerContract', 'Manager contract availability', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.hasBoardConfidence', 'Board confidence availability', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.hasSupporterConfidence', 'Supporter confidence availability', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.hasBoardObjectives', 'Board objectives availability', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.promisesCount', 'Promise count', false, 'decoder-optional'),
  row('Diagnostics', 'extractionManifest.warningsCount', 'Warning count', true, 'decoder'),
  row('Diagnostics', 'extractionManifest.fastSync', 'Fast-sync flag', true, 'decoder'),
  row('Diagnostics', 'fastSync', 'Top-level fast-sync flag', true, 'decoder'),
  row('Diagnostics', 'warnings', 'Warnings', false, 'decoder-optional', 'Empty when no decoder warning fired; an empty list is valid.'),
  row('Diagnostics', 'extractionWarnings', 'Extraction warnings', false, 'decoder-optional', 'Empty when no decoder warning fired; an empty list is valid.'),
  row('Diagnostics', 'stepTimingsMs', 'Step timings', true, 'decoder'),
  row('Diagnostics', 'binaryForensics', 'Binary forensics', false, 'unused', 'Diagnostics only; deliberately not sent to the Analyst.'),
];

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function collectPath(
  value: unknown,
  segments: string[],
  index: number,
  out: { total: number; nullCount: number; emptyCount: number }
): void {
  if (index >= segments.length) {
    out.total += 1;
    if (value === undefined || value === null) out.nullCount += 1;
    else if (isEmptyValue(value)) out.emptyCount += 1;
    return;
  }

  const segment = segments[index];
  const isArray = segment.endsWith('[]');
  const key = isArray ? segment.slice(0, -2) : segment;
  let next: unknown = value;

  if (key) {
    if (!next || typeof next !== 'object' || !(key in (next as Record<string, unknown>))) {
      out.total += 1;
      out.nullCount += 1;
      return;
    }
    next = (next as Record<string, unknown>)[key];
  }

  if (isArray) {
    if (!Array.isArray(next)) {
      out.total += 1;
      out.nullCount += 1;
      return;
    }
    if (next.length === 0) {
      out.total += 1;
      out.emptyCount += 1;
      return;
    }
    for (const item of next) collectPath(item, segments, index + 1, out);
    return;
  }

  collectPath(next, segments, index + 1, out);
}

function statusFor(
  expectation: DecoderFieldExpectation,
  total: number,
  nullCount: number,
  emptyCount: number
): DecoderFieldStatus {
  if (expectation.origin === 'derived') return 'derived';
  if (expectation.origin === 'guessed') return 'guessed';
  if (expectation.origin === 'unused') return 'unused';
  if (expectation.origin === 'stale') return 'stale';
  const present = total - nullCount - emptyCount;
  if (total > 0 && present === total) return 'supplied';
  if (present > 0) return 'partial';
  if (emptyCount > 0 && nullCount === 0) return 'empty';
  return 'missing';
}

export function auditDecoderFieldCoverage(
  payload: unknown,
  expectations: DecoderFieldExpectation[] = DECODER_FIELD_EXPECTATIONS
): DecoderFieldCoverageRow[] {
  return expectations.map((expectation) => {
    const counts = { total: 0, nullCount: 0, emptyCount: 0 };
    collectPath(payload, expectation.path.split('.'), 0, counts);
    const present = counts.total - counts.nullCount - counts.emptyCount;
    return {
      ...expectation,
      values: counts.total,
      present,
      nullCount: counts.nullCount,
      emptyCount: counts.emptyCount,
      status: statusFor(expectation, counts.total, counts.nullCount, counts.emptyCount),
    };
  });
}

export function summarizeDecoderFieldCoverage(
  rows: DecoderFieldCoverageRow[]
): DecoderFieldCoverageSummary {
  const summary: DecoderFieldCoverageSummary = {
    rows: rows.length,
    supplied: 0,
    partial: 0,
    missing: 0,
    empty: 0,
    derived: 0,
    guessed: 0,
    unused: 0,
    stale: 0,
  };
  for (const row of rows) summary[row.status] += 1;
  return summary;
}

export function mergeDecoderFieldCoverage(
  audits: Array<{ label: string; rows: DecoderFieldCoverageRow[] }>
): Array<DecoderFieldCoverageRow & { saves: string }> {
  const byPath = new Map<string, DecoderFieldCoverageRow & { saves: string[] }>();
  for (const audit of audits) {
    for (const row of audit.rows) {
      const existing = byPath.get(row.path);
      if (!existing) {
        byPath.set(row.path, { ...row, saves: [audit.label] });
        continue;
      }
      existing.values += row.values;
      existing.present += row.present;
      existing.nullCount += row.nullCount;
      existing.emptyCount += row.emptyCount;
      existing.saves.push(audit.label);
    }
  }
  return [...byPath.values()].map((row) => ({
    ...row,
    saves: row.saves.join(', '),
    status: statusFor(row, row.values, row.nullCount, row.emptyCount),
  }));
}


export function formatDecoderCoverageMarkdown(
  rows: Array<DecoderFieldCoverageRow & { saves?: string }>,
  meta: { date: string; saves: number; source: string }
): string {
  const summary = summarizeDecoderFieldCoverage(rows);
  const lines = [
    `# Decoder field coverage audit`,
    ``,
    `Date: ${meta.date}`,
    `Source: ${meta.source}`,
    `Saves audited: ${meta.saves}`,
    ``,
    `| Status | Fields |`,
    `| --- | ---: |`,
    `| Supplied | ${summary.supplied} |`,
    `| Partial | ${summary.partial} |`,
    `| Missing | ${summary.missing} |`,
    `| Empty | ${summary.empty} |`,
    `| Derived | ${summary.derived} |`,
    `| Guessed | ${summary.guessed} |`,
    `| Unused | ${summary.unused} |`,
    `| Stale | ${summary.stale} |`,
    ``,
    `| Group | Field | Path | Origin | Present | Status | Note |`,
    `| --- | --- | --- | --- | ---: | --- | --- |`,
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.group} | ${row.label} | \`${row.path}\` | ${row.origin} | ${row.present}/${row.values} | ${row.status} | ${row.note ?? ''} |`
    );
  }
  return lines.join('\n');
}
