/**
 * Bobby Dean — Portable FM27 Tactics & Journeyman Playbook v2.0
 * Club-Independent Edition | Verified for Football Manager 27 on PC (Patch 27.1.0 Baseline)
 *
 * Pure static tactical/operational reference rules — zero club-specific or fake roster data.
 */

export interface PlaybookRolePrinciple {
  positionGroup: string;
  inPossessionRole: string;
  outOfPossessionRole: string;
  notes: string;
}

export interface PlaybookTacticalTemplate {
  id: string;
  name: string;
  context: string;
  mentality: string;
  inPossession: string[];
  outOfPossession: string[];
}

export interface PlaybookTacticalEffectivenessArea {
  phase: 'In Possession' | 'Out of Possession';
  area: string;
  matchWeight: 'Highest' | 'High' | 'Standard';
  trainingFocusNote: string;
}

export interface PlaybookTacticTweak {
  id: string;
  name: string;
  scope: 'Team' | 'Individual';
  category:
    | 'Build-Up & Directness'
    | 'Tempo & Urgency'
    | 'Width & Shape'
    | 'Pressing'
    | 'Game-State Extremes'
    | 'Individual Role Macro';
  whenToUse: string;
  caution?: string;
}

export interface PlaybookShout {
  name: string;
  effectType: 'Mood & Body Language';
  bestTrigger: string;
  avoidWhen: string;
}

export interface PlaybookDiagnosticRow {
  symptom: string;
  firstQuestion: string;
  authenticResponse: string;
}

export const PLAYBOOK_METADATA = {
  title: 'Bobby Dean — Portable FM27 Tactics & Journeyman Playbook v2.0',
  edition: 'Club-Independent Edition',
  patchBaseline: 'Patch 27.1.0',
} as const;

export const MANAGERIAL_CHARTER = {
  philosophy:
    'Pragmatic, compact, organised without the ball, quick and purposeful after regains, and decisive in the final third. Direct when space is there — never aimless long-ball football.',
  realismGuardrail:
    "Zero match-engine exploits or synthetic meta-chasing. Build balanced, realistic football squads using FM27's genuine intended mechanics: Dual-Phase In-Possession / Out-of-Possession shapes, Tactical Effectiveness, Tactical Tweaks, and realistic recruitment profiles.",
  goldenRuleOfOneChange:
    'Never overhaul formation, mentality, roles, and team instructions together after a poor result. Keep Tactical Complexity low-to-moderate, test one adjustment across a 3-to-5 match sample, and judge via match evidence and Data Hub maps.',
  sliderFamiliarityMath: {
    singleSliderPenaltyPoints: 3,
    singleSliderPenaltyPctApprox: 10,
    complexityPenaltyPer10Points: 2.5,
    summary:
      'Adjusting even a single tactical slider shaves roughly 3 familiarity points (~10% of stored familiarity) until retrained. Every 10 points of Tactical Complexity reduces familiarity by ~2.5 points per tactical area.',
  },
} as const;

export const DUAL_PHASE_433_FRAMEWORK = {
  corePrinciple:
    'Retain a familiar 4-3-3 In Possession (IP) while defending in a compact 4-1-4-1 / 4-3-3 Mid-Block Out of Possession (OOP). Keep every starter in a natural, familiar position rather than forcing unnatural dual-phase shifts.',
  legacyNotice:
    'Legacy duties (Defend, Support, Attack) and retired hybrid roles (Mezzala, Enganche, Trequartista) are retired in FM27. Assign separate IP and OOP roles to every slot.',
  engineGuardrails: [
    'Always use the Combined view on the Tactics screen when swapping starting personnel so changes propagate across both IP and OOP formations automatically.',
    'Inspect every phase shift inside the 9-zone (3x3) Tactics Visualiser to confirm players are not sprinting across the pitch between phases and opening central channels.',
    'Avoid playing starters out of position: fielding players at positional rating 10 costs ~0.85 points per game (and for goalkeepers, slashes save rate from 75% to 60%, conceding +0.7 extra goals per game).',
    'Keep Opposition Instructions (OIs) selective: every OI toggled increases Tactical Complexity. Never blanket-press or tight-mark rapid strikers, which drags defenders out of shape and invites runs in behind.',
  ],
  rolePrinciples: [
    {
      positionGroup: 'GK',
      inPossessionRole: 'No-Nonsense Goalkeeper, Goalkeeper, or Ball-Playing Goalkeeper (high Composure)',
      outOfPossessionRole: 'Goalkeeper, Sweeper Keeper (high line), or Line-Holding Goalkeeper (deep block)',
      notes:
        'Reliable distribution into CBs/FBs unless pressed overwhelmingly high. Prioritise natural GK familiarity, Agility, and Reflexes.',
    },
    {
      positionGroup: 'Centre-Backs (2)',
      inPossessionRole: '1x Centre-Back + 1x Ball-Playing Centre-Back (if Passing/Composure allow)',
      outOfPossessionRole: 'Centre-Back baseline (Stopping Centre-Back or Covering Centre-Back if tailored)',
      notes:
        'Defend first. Never sub both starting CBs simultaneously when protecting a late lead.',
    },
    {
      positionGroup: 'Full-Backs (2)',
      inPossessionRole: 'Full-Back baseline; one may step to Wing-Back only if opposite FB holds',
      outOfPossessionRole: 'Full-Back or Holding Full-Back (or Pressing Full-Back vs passive threats)',
      notes:
        'Flank security first so both full-backs never vacate rest defence together. Patch 27.1.0 buffed Holding Full-Back pressing aggression.',
    },
    {
      positionGroup: 'Deepest Midfielder (DM)',
      inPossessionRole: 'Half-Back (home) or Defensive Midfielder (away)',
      outOfPossessionRole: 'Defensive Midfielder, Screening DM, or Dropping DM',
      notes:
        'Screens Zone 5 in front of the CBs and offers the safe first pass on regains. Never sacrifice the DM to switch to a 4-2-4 against a 3-man opposition midfield.',
    },
    {
      positionGroup: 'Central Midfield Pair (2)',
      inPossessionRole: '1x Connector (Central Midfielder or Midfield Playmaker) + 1x Runner (Attacking Midfielder or Channel Midfielder)',
      outOfPossessionRole: '1x Central Midfielder + 1x Wide Covering Central Midfielder or Screening Central Midfielder',
      notes: 'Asymmetric balance between ball progression and late box arrival.',
    },
    {
      positionGroup: 'Wide Forwards (2)',
      inPossessionRole: 'Complementary lanes: 1x touchline Winger + 1x Inside Forward or Inside Winger',
      outOfPossessionRole: 'Tracking Winger vs overlapping FBs; Wide Outlet Winger only vs passive FBs',
      notes:
        'Never crowd the same lane. Tracking Winger protects against 2v1 wide overloads; Wide Outlet Winger demands reliable flank cover behind them.',
    },
    {
      positionGroup: 'Central Striker (1)',
      inPossessionRole: 'Poacher, Channel Forward, or Target Forward',
      outOfPossessionRole: 'Central Outlet Centre Forward or Tracking Centre Forward',
      notes: 'Must always have nearby midfield and wide support to satisfy the Three-Man Box Rule.',
    },
  ] satisfies PlaybookRolePrinciple[],
  templates: [
    {
      id: 'home-front-foot-positive',
      name: 'Template 1 — Home / Front-Foot Positive',
      context: 'Home fixtures or favourites expecting territorial control without reckless rest-defence risk',
      mentality: 'Positive',
      inPossession: [
        'Standard or Slightly More Direct Passing',
        'Higher Tempo',
        'Standard or Wider Width',
        'Counter-Attack',
        'Whipped Crosses (good turf)',
        'Balanced Ground Build-Up (toggle Play Through Press against deep blocks)',
        'Short/Mixed Goal Kicks to CBs/FBs',
      ],
      outOfPossession: [
        'Mid Block',
        'Lower/Standard Defensive Line',
        'Step Up More',
        'Trigger Press More Often',
        'Trap Outside (remove Trap Outside if facing overlapping opposition wing-backs)',
      ],
    },
    {
      id: 'away-controlled-road',
      name: 'Template 2 — Away / Controlled Road Variant',
      context: 'Away trips, tough opposition, or heavy/windy pitches requiring compact legs and retention',
      mentality: 'Positive or Balanced',
      inPossession: [
        'Standard Passing Directness',
        'Standard Tempo (preserves away legs and ball retention)',
        'Low Crosses (wet, windy, or heavy pitches)',
        'Balanced Ground Build-Up',
        'Both Full-Backs on Full-Back IP/OOP and DM on Defensive Midfielder IP/OOP',
      ],
      outOfPossession: [
        'Compact Mid Block',
        'Tracking Wingers OOP on both flanks',
      ],
    },
  ] satisfies PlaybookTacticalTemplate[],
} as const;

export const THREE_MAN_BOX_RULE = {
  rule: 'Whenever the ball enters an advanced wide area, ensure 3 distinct threats attack the penalty box (1 Central Striker, 1 Far-Side Wide Runner, 1 Late Central Midfielder) plus 1 player patrolling the edge of the box for cut-backs and second balls.',
  attackBoxInstructions: {
    side: 'Assign near post, far post, or central areas to separate runs cleanly without spiking Tactical Complexity.',
    depth: 'Assign arriving late in the box (for cut-backs) or attacking the defensive line directly.',
    caution:
      'Attack Box execution depends heavily on Anticipation, Off the Ball, and squad cohesion. Assigning Attack Box – Depth to a player with poor Off the Ball actively lowers their Player Ability rating inside Tactical Effectiveness.',
  },
} as const;

export const CORNER_AND_SET_PIECE_FRAMEWORK = {
  setupPrinciples: [
    'Hire a dedicated Set Piece Coach and organise around the four dynamically ranked Creator buckets: Aerial Threats, Box Threats, Creators, and Recovery Defenders.',
    'Separate Left-Footed Takers (Right-Side Inswingers) and Right-Footed Takers (Left-Side Inswingers) with "Default taker from both sides" turned OFF.',
    'Keep open-play default on Keep Ball in Play rather than Play For Set Pieces unless your squad overwhelmingly dominates aerially.',
  ],
  attackingRoutines: [
    { name: 'Routine 1: Far Post Isolation', purpose: 'Target far-post mismatch with primary aerial threat isolating weaker full-back.' },
    { name: 'Routine 2: Central Six-Yard Box', purpose: 'Inswinging delivery into crowded six-yard corridor with keeper blocker and near/far runners.' },
    { name: 'Routine 3: Short 3v2 Corner Triangle', purpose: 'Taker + Come Short + Lurk Near Side to create superior crossing angles or edge-of-box cut-backs.' },
  ],
  restDefenceLock:
    'Always lock 2 quick Recovery Defenders on Stay Back and set the 3rd Recovery Defender sub-instruction to Lurk Outside Area (never Go Forward into six-yard traffic).',
  defendingCornersBlueprint: [
    '3 best aerial defenders zonally mark the 6-yard box (Near Centre, Centre, Far Centre).',
    '2 physical players Player Mark top opposition aerial threats.',
    '2 lower-jumping players guard Near & Far Posts.',
    '1 tracker Player Marks secondary runners.',
    '1 composed midfielder patrols Edge of Area to clear second balls and stop repeat corner sieges.',
    '1 rapid outlet Stays Forward (Centre) to pin opposing defenders back.',
  ],
} as const;

export const TACTICAL_EFFECTIVENESS = {
  pillars: [
    'Tactical Understanding (Familiarity)',
    'Player Ability',
    'Player Buy-In',
    'Next Match Info',
  ],
  eightFamiliarityAreas: [
    { phase: 'In Possession', area: 'In-Possession Shape', matchWeight: 'Standard', trainingFocusNote: 'Keep primary shape consistent across fixtures.' },
    { phase: 'In Possession', area: 'Passing Style', matchWeight: 'High', trainingFocusNote: 'Avoid flipping directness recklessly game-to-game.' },
    { phase: 'In Possession', area: 'Build Up', matchWeight: 'High', trainingFocusNote: 'Balanced ground build-up requires regular repetition.' },
    { phase: 'In Possession', area: 'Chance Creation', matchWeight: 'Highest', trainingFocusNote: 'Prioritise in Tactical Understanding training blocks until starters exceed 51.' },
    { phase: 'Out of Possession', area: 'Out-of-Possession Shape', matchWeight: 'High', trainingFocusNote: 'Schedule alongside Pressing Intensity when bedding in new starters.' },
    { phase: 'Out of Possession', area: 'Line of Engagement', matchWeight: 'Standard', trainingFocusNote: 'Coordinate engagement height with defensive line speed.' },
    { phase: 'Out of Possession', area: 'Pressing Intensity', matchWeight: 'Highest', trainingFocusNote: 'Highest OOP match impact; drill until starters clear the 51 threshold.' },
    { phase: 'Out of Possession', area: 'Pressing Trap', matchWeight: 'Standard', trainingFocusNote: 'Disable Trap Outside when facing overlapping opposition wing-backs.' },
  ] satisfies PlaybookTacticalEffectivenessArea[],
  weights: {
    trainingContribution: 0.6,
    matchExposure: 0.3,
    playerTacticalAbility: 0.25,
    tacticalSimplicity: 0.25,
    low20ToHigh80ExpectedPointsGain: 0.52,
  },
  stepChangeBands: [16, 34, 41, 51, 67, 81, 91],
  decayTimeline:
    'Full value in week 1, half after ~3 weeks, one-sixth after ~3 months, zero after ~8 months without reinforcement.',
} as const;

export const POST_MATCH_REST_RULE = {
  restDayInjuryProbabilityPct: 4.0,
  normalTrainingInjuryProbabilityPct: 13.8,
  recommendedTacticalBlocksPerMonth: 8,
  starterFamiliarityFloor: 51,
  u18TacticalBlocksPerMonth: 0,
  rules: [
    'Audit starters individually in Player View rather than squad averages (which hide newly signed starters sitting at ~25).',
    'Schedule ~8 Tactical Understanding sessions per month focusing on Chance Creation, Pressing Intensity, and Out-of-Possession Shape until every regular starter exceeds 51.',
    'Cluster drills onto fewer days and leave a complete Rest day immediately after every match: full Rest skips the daily training injury roll, slashing training injury probability from 13.8% down to 4.0% with negligible growth loss.',
    'Run zero Tactical Understanding blocks in the U18 schedule; dedicate academy calendars to Footballing Development, Physicals, and Match Practice.',
    'Assign separate IP and OOP role focuses, functional Individual Development focuses, and Quickness (outfielders under 23) or Agility & Reflexes (goalkeepers) as Additional Focuses.',
  ],
} as const;

export const TACTICAL_TWEAKS: PlaybookTacticTweak[] = [
  // 15 Team Tactical Tweaks
  {
    id: 'play-out-from-back',
    name: 'Play Out From the Back',
    scope: 'Team',
    category: 'Build-Up & Directness',
    whenToUse: 'Against deep blocks or passive presses to keep structured ground build-up.',
  },
  {
    id: 'go-long',
    name: 'Go Long',
    scope: 'Team',
    category: 'Build-Up & Directness',
    whenToUse: 'When an aggressive high press pins centre-backs and short exits repeatedly turn over.',
  },
  {
    id: 'pass-into-space',
    name: 'Pass Into Space',
    scope: 'Team',
    category: 'Build-Up & Directness',
    whenToUse: 'Against high defensive lines when rapid wide/central runners have space behind.',
  },
  {
    id: 'work-ball-into-box',
    name: 'Work Ball Into Box',
    scope: 'Team',
    category: 'Build-Up & Directness',
    whenToUse: 'When wasteful long shots inflate shot count without quality xG.',
  },
  {
    id: 'hit-early-crosses',
    name: 'Hit Early Crosses',
    scope: 'Team',
    category: 'Build-Up & Directness',
    whenToUse: 'On fast counter-transitions targeting strikers attacking an unsettled back line.',
  },
  {
    id: 'play-with-more-urgency',
    name: 'Play With More Urgency',
    scope: 'Team',
    category: 'Tempo & Urgency',
    whenToUse: 'When trailing late (70m–85m+) or struggling to break a settled block.',
  },
  {
    id: 'take-a-breather',
    name: 'Take a Breather',
    scope: 'Team',
    category: 'Tempo & Urgency',
    whenToUse: 'Selectively when comfortably ahead to preserve stamina across double gameweeks.',
    caution: 'Never trigger too early or it invites sudden AI momentum comebacks.',
  },
  {
    id: 'exploit-the-width',
    name: 'Exploit the Width',
    scope: 'Team',
    category: 'Width & Shape',
    whenToUse: 'When opponents pack central zones narrowly and leave flank channels open.',
  },
  {
    id: 'go-narrower',
    name: 'Go Narrower',
    scope: 'Team',
    category: 'Width & Shape',
    whenToUse: 'When wide players are isolated on the touchline with nobody arriving inside the box.',
  },
  {
    id: 'swap-wings',
    name: 'Swap Wings',
    scope: 'Team',
    category: 'Width & Shape',
    whenToUse: 'To isolate a tired, slow, or yellow-carded opposing full-back.',
  },
  {
    id: 'press-aggressively',
    name: 'Press Aggressively',
    scope: 'Team',
    category: 'Pressing',
    whenToUse: 'Target low-Composure or low-First-Touch opposition defenders.',
  },
  {
    id: 'reduce-pressing',
    name: 'Reduce Pressing',
    scope: 'Team',
    category: 'Pressing',
    whenToUse: 'Preserve stamina late in matches or when legs fade in congested schedules.',
  },
  {
    id: 'counter-attack-focus',
    name: 'Counter-Attack Focus',
    scope: 'Team',
    category: 'Game-State Extremes',
    whenToUse: 'When opponents commit numbers high and leave space on transition regains.',
  },
  {
    id: 'shut-up-shop',
    name: 'Shut Up Shop / Lock It Down',
    scope: 'Team',
    category: 'Game-State Extremes',
    whenToUse: 'Strictly for protecting a narrow lead in the final 10–15 minutes.',
    caution: 'Whole-match use suppresses chances at both ends and costs ~0.20 xPts/game.',
  },
  {
    id: 'throw-kitchen-sink',
    name: 'Throw the Kitchen Sink',
    scope: 'Team',
    category: 'Game-State Extremes',
    whenToUse: 'Late desperation (82m+) in knockout ties or must-win fixtures when trailing.',
  },
  // 6 Individual Tactical Tweaks
  {
    id: 'ind-ease-off-tackles',
    name: 'Ease Off Tackles',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Immediately on yellow-carded aggressive midfielders or full-backs.',
  },
  {
    id: 'ind-tackle-harder',
    name: 'Tackle Harder / Disrupt',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Targeted at delicate opposition playmakers when match officials are lenient.',
  },
  {
    id: 'ind-stay-wider',
    name: 'Hold Width / Hug Touchline',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Stretch narrow back-fours and open half-space pockets for CM runners.',
  },
  {
    id: 'ind-cut-inside',
    name: 'Attack Inside Channel',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Satisfy Three-Man Box Rule when far-side wide forward stays too deep.',
  },
  {
    id: 'ind-hold-position',
    name: 'Hold Rest-Defence Position',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Lock one full-back or DM deeper against rapid counter-attacking threats.',
  },
  {
    id: 'ind-gk-up-set-pieces',
    name: 'GK To Go Up On Set-Pieces',
    scope: 'Individual',
    category: 'Individual Role Macro',
    whenToUse: 'Stoppage time only when chasing an equaliser, with fast recovery cover back.',
  },
];

export const MOOD_SHOUTS: PlaybookShout[] = [
  {
    name: 'Well Done',
    effectType: 'Mood & Body Language',
    bestTrigger: '2+ goals up or during a dominant spell.',
    avoidWhen: 'Drawing level or struggling for control.',
  },
  {
    name: 'No Pressure',
    effectType: 'Mood & Body Language',
    bestTrigger: 'Level scoreline or tight away fixture.',
    avoidWhen: 'Complacent heavy favourites at home.',
  },
  {
    name: 'Calm Down',
    effectType: 'Mood & Body Language',
    bestTrigger: 'Early yellow cards or protecting a narrow 1-goal lead.',
    avoidWhen: 'Flat, passive opening 20 minutes.',
  },
  {
    name: 'Up Your Game',
    effectType: 'Mood & Body Language',
    bestTrigger: 'Trailing or starting flat.',
    avoidWhen: 'Already winning comfortably.',
  },
  {
    name: 'Wake Up',
    effectType: 'Mood & Body Language',
    bestTrigger: 'Complacency or immediately after conceding.',
    avoidWhen: 'High-morale dominant performances.',
  },
  {
    name: 'Dig Deeper',
    effectType: 'Mood & Body Language',
    bestTrigger: 'Tired legs grinding out a late result.',
    avoidWhen: 'Early first half before fatigue sets in.',
  },
];

export const MENTORING_RULES = {
  groupSize: 3,
  direction: 'Downward-only (high-hierarchy, high-Determination/Professionalism Core Social Group seniors mentoring U24 mentees).',
  postUnitsPrerequisite:
    'Because FM27 removed legacy senior training units, promote or explicitly add youth prospects to train with the senior squad BEFORE adding them to mentoring groups.',
  goal: 'Shape hidden Professionalism, Ambition, Pressure, Temperament, and player traits without diluting senior leaders.',
} as const;

export const PATCH_27_1_0_PHYSICAL_WEIGHTS = {
  topSpeedFormula: '8.05 + 0.11 * Pace (m/s)',
  jumpHeightFormula: '(Jumping Reach + 5) / 30 (m above standing reach)',
  sprintDrainFormula: '2.5 - 0.075 * Stamina (lower is better)',
  ninetyMinuteFadePct: 10,
  fitnessVsMoraleRule:
    'FM27 Hawk-Eye physics cause Agility, Balance, and Acceleration to fade ~10% across 90m. On matchday, always favour the fresher, sharper starter over a tired star riding Superb morale.',
  empiricalPointsCost: {
    startingAt80PctCondition: -0.8,
    startingAt75PctSharpness: -0.37,
    startingAt50PctSharpness: -1.0,
    outOfPositionRating10: -0.85,
  },
  automaticIntensityCaps: [
    { condition: 'Very Poor', multiplier: '0x (No Pitch/Gym Work)' },
    { condition: 'Poor', multiplier: '0.5x (Half Intensity)' },
    { condition: 'Normal', multiplier: '1.0x (Normal Intensity)' },
    { condition: 'Good / Superb (Green)', multiplier: '2.0x (Double Intensity)' },
  ],
  doubleGameweekLoadCaps: {
    standardOutfielderMaxMinutes: 125,
    highStaminaExceptionThreshold: 13,
    highStaminaMaxMinutes: 150,
    protectedWarningThreshold: 115,
  },
  substitutionBatchingRule:
    'Batch all 5 substitutions across at most 2 second-half stoppage windows (60m–65m and 75m+, plus optional HT free stoppage) so 3 stoppages are never burned early.',
} as const;

export const MATCHDAY_DIAGNOSTIC_MATRIX: PlaybookDiagnosticRow[] = [
  {
    symptom: 'Striker isolated / aimless punts',
    firstQuestion: 'Are defenders lumping long instead of finding midfield?',
    authenticResponse:
      'Switch Build-Up to Balanced, Goal Kicks to Short/Mixed to CBs, or toggle Tweaks -> Play Out From the Back.',
  },
  {
    symptom: 'Conceding back-post overlaps',
    firstQuestion: 'Is an opposing full-back running past our winger?',
    authenticResponse:
      'Switch AML/AMR OOP role from Wide Outlet Winger to Tracking Winger; remove Trap Outside if it invites overlapping crosses.',
  },
  {
    symptom: 'Possession without threat',
    firstQuestion: 'Are wide players stuck on the touchline with nobody in the box?',
    authenticResponse:
      'Narrow Attacking Width one notch or toggle Tweaks -> Go Narrower / Swap Wings; verify Three-Man Box runners.',
  },
  {
    symptom: 'Played through midfield',
    firstQuestion: 'Are CMs pushing too high or facing a narrow 5-man midfield?',
    authenticResponse:
      'Keep DM intact, shift one CM to Screening Central Midfielder OOP, or adjust Line of Engagement.',
  },
  {
    symptom: '45m–60m stamina dip',
    firstQuestion: 'Are low-stamina starters fading after half-time?',
    authenticResponse:
      'Batch subs cleanly across 2 second-half windows (60m–65m and 75m+); use Tweaks -> Take a Breather selectively when stable.',
  },
  {
    symptom: 'Protecting a late 1-goal lead (75m+)',
    firstQuestion: 'Are we giving away cheap transitions?',
    authenticResponse:
      'Keep starting CB pairing intact, toggle Tweaks -> Shut Up Shop (late only), and use Shout: Calm Down or Dig Deeper.',
  },
  {
    symptom: 'Trailing late (70m–85m+)',
    firstQuestion: 'Do we need urgency without losing midfield shape?',
    authenticResponse:
      'Keep 3 midfielders on pitch, toggle Tweaks -> Play With More Urgency + Swap Wings, and use Shout: Up Your Game or Wake Up.',
  },
];

export const RECRUITMENT_AND_MEDICAL_RULES = {
  injuryPronenessDecoder: [
    { range: '1–11', reportText: 'No warning' },
    { range: '12–14', reportText: 'Fairly susceptible to injuries' },
    { range: '15–17', reportText: 'Might have problems with injuries' },
    { range: '18–20', reportText: 'Could have real problems with injuries' },
  ],
  staffHiringOrder: [
    '1. Elite Fitness Coaches (cover ~46% of match-winning attribute weights across all squads)',
    '2. Physiotherapists & Sports Scientists (shorten recovery, lower recurring injuries, slow jadedness)',
    '3. Set Piece Coach (unlocks structured dead-ball execution)',
    '4. Head of Youth Development (hire primarily for elite Personality & matching Preferred Formation)',
    '5. Performance Analysts & Scouts (Analysing Data + JPA/JPP)',
  ],
  day1TakeoverChecklist: [
    '1. Verify Continue Flow, Information Display density, Bookmark Bar, and keep saves outside OneDrive sync.',
    '2. Audit Squad Contracts view for expiring deals, dangerous clauses, excess Star Player statuses, and SCR headroom.',
    '3. Set Staff Responsibilities: keep manual control of Senior General Training, Individual Training, First-Team Transfers/Contracts, Set Pieces, and Matchday Tactics/Tweaks.',
    '4. Map best natural XI to 4-3-3 IP / 4-1-4-1 OOP via Combined view and inspect 3x3 Tactics Visualiser.',
    '5. Upgrade Fitness Coaches, Medical Staff, Set Piece Coach, and high-personality HOYD.',
    '6. Designate 1 Primary Trained Tactic, ~8 Tactical Understanding blocks/month, protect post-match Rest days (4.0% vs 13.8% injury roll), add Fatigue column, and build 3-player downward mentoring groups.',
    '7. Launch IP/OOP Recruitment Focuses (or 2-week Free Trials) and deliver realistic Day-1 Team Meeting.',
    '8. Enforce Five-Game Block Decision Gates (MD1–5 stability, MD6–15 efficiency, Mid-Season gap fixes, Run-In pragmatism).',
  ],
} as const;

export const PLAYBOOK_V2_SUMMARY_FOR_AI = `
BOBBY DEAN — PORTABLE FM27 TACTICS & JOURNEYMAN PLAYBOOK v2.0 (PATCH 27.1.0 BASELINE, CLUB-INDEPENDENT):
1. GOLDEN RULE: Never overhaul formation, mentality, roles, and team instructions together. Change ONE variable at a time and test over 3–5 matches (changing 1 slider shaves ~3 familiarity pts / ~10%; every 10 Tactical Complexity pts reduces familiarity by ~2.5 pts/area).
2. DUAL-PHASE FM27 MODEL: Legacy FM24 duties (Defend/Support/Attack) and retired roles (Mezzala, Enganche, Trequartista) do NOT exist. Every slot uses separate In-Possession (IP) and Out-of-Possession (OOP) roles. Core portable shape: 4-3-3 IP / 4-1-4-1 or 4-3-3 Mid-Block OOP. Keep starters in natural positions (rating 10 OOP costs ~0.85 pts/game; GK OOP drops save rate 75%->60%).
3. THREE-MAN BOX RULE & SET PIECES: Attack wide entries with 3 box runners (ST + Far-Side Wide Runner + Late CM) + 1 edge-of-box patrol. Attacking corners: Left-footed right-side / Right-footed left-side inswingers, 2 quick Recovery Defenders Stay Back + 1 Lurk Outside Area. Defending corners: 3 zonal 6-yard, 2 Player Mark, 2 posts, 1 tracker, 1 edge-of-area clearing midfielder, 1 rapid outlet Stay Forward.
4. TACTICAL EFFECTIVENESS & TRAINING: 8 familiarity areas (Chance Creation IP & Pressing Intensity OOP carry highest match weight). Training contribution weights 2x Match Exposure (0.6 vs 0.3). Step-change thresholds: 16/34/41/51/67/81/91. Schedule ~8 Tactical Understanding blocks/month until starters >51; U18s run 0 tactical blocks. Always leave a full Rest day immediately after every match (cuts daily training injury roll from 13.8% down to 4.0%).
5. MENTORING & SUBSTITUTIONS: 3-player downward-only mentoring groups led by Core Social Group seniors; promote youth to senior training before adding to mentoring. Batch all 5 subs across at most 2 second-half windows (60m–65m and 75m+, plus optional HT). Never sub both starting CBs simultaneously when protecting a lead; keep 3 midfielders on pitch late.
6. PATCH 27.1.0 PHYSICAL ENGINE: Pace top speed = 8.05 + 0.11*Pace m/s; Jumping height = (JR + 5)/30 m; Sprint drain = 2.5 - 0.075*Stamina. Agility/Balance/Acceleration fade ~10% over 90m. Matchday selection favours fresher/sharper starters (80% Condition costs ~0.80 pts/game; 75% Sharpness ~0.37 pts/game; 50% Sharpness ~1.00 pt/game). Double-gameweek load guideline: <=125m for standard outfielders, <=150m for Stamina >=13.
7. TACTICAL TWEAKS & SHOUTS: 15 Team + 6 Individual Tweaks (use Shut Up Shop strictly late, Ease Off on yellow-carded mids, Play With More Urgency + Swap Wings when chasing). 6 Mood Shouts (Well Done, No Pressure, Calm Down, Up Your Game, Wake Up, Dig Deeper) modify mood/body language only.
`.trim();
