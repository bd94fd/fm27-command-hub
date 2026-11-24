import { Type, type Schema } from '@google/genai';

export const ANALYZE_SCREENSHOT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    screenDetected: {
      type: Type.STRING,
      description: 'Detected FM27 screen type and in-game date',
    },
    inGameDate: {
      type: Type.STRING,
      description: 'In-game date in DD/MM/YYYY format',
    },
    competition: {
      type: Type.STRING,
      description: 'Competition and matchday',
    },
    opponent: {
      type: Type.STRING,
      description: 'Opponent club name',
    },
    venue: {
      type: Type.STRING,
      description: 'H for Home or A for Away',
    },
    result: {
      type: Type.STRING,
      description: 'W, D, or L from managed club perspective',
    },
    score: {
      type: Type.STRING,
      description: 'Scoreline from managed club perspective (e.g. 2 - 0)',
    },
    xGFor: {
      type: Type.NUMBER,
      description: 'Managed club expected goals if explicitly visible',
    },
    xGAgainst: {
      type: Type.NUMBER,
      description: 'Opponent expected goals if explicitly visible',
    },
    possession: {
      type: Type.NUMBER,
      description: 'Managed club possession percentage integer if visible',
    },
    passCompletion: {
      type: Type.NUMBER,
      description: 'Managed club pass completion percentage integer if visible',
    },
    shotsFor: {
      type: Type.STRING,
      description: 'Managed club shots (on target) string if visible',
    },
    shotsAgainst: {
      type: Type.STRING,
      description: 'Opponent shots (on target) string if visible',
    },
    cccFor: {
      type: Type.NUMBER,
      description: 'Managed club clear cut chances integer if visible',
    },
    cccAgainst: {
      type: Type.NUMBER,
      description: 'Opponent clear cut chances integer if visible',
    },
    goalTimeline: {
      type: Type.STRING,
      description: 'Minute-by-minute goal scorers and assists',
    },
    potm: {
      type: Type.STRING,
      description: 'Player of the Match name, rating, and key stats',
    },
    defensiveWatchpoints: {
      type: Type.STRING,
      description: 'Defensive unit ratings and tactical watchpoints',
    },
    headlineTitle: {
      type: Type.STRING,
      description: 'Match fixture or event title',
    },
    outcomeMetric: {
      type: Type.STRING,
      description: 'Result, scoreline, and xG summary',
    },
    executiveBullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-4 sharp tactical & Data Hub insights',
    },
    recommendedClicks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 immediate in-game clicks before hitting Continue',
    },
    tacticalAuditSummary: {
      type: Type.STRING,
      description: '1-paragraph synthesis for Table 1G & Chronicles',
    },
  },
  required: [
    'screenDetected',
    'inGameDate',
    'headlineTitle',
    'outcomeMetric',
    'executiveBullets',
    'recommendedClicks',
    'tacticalAuditSummary',
  ],
};

export const TACTICAL_CHAT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    screenDetected: {
      type: Type.STRING,
      description:
        'Concise label of what you analyzed on this turn (e.g. "Tactical Follow-Up: Flank Overload & Role Pairing", "Live .fm Save Full Club Audit", "Data Hub Match Report", etc.)',
    },
    inGameDate: {
      type: Type.STRING,
      description: 'In-game date in DD/MM/YYYY format (or "--" if not yet loaded)',
    },
    analysisMarkdown: {
      type: Type.STRING,
      description:
        'Clever, context-aware Markdown response directly answering the manager’s question or auditing the save/screenshot using FM27 Patch 27.1.0 physics, Dual-Phase IP/OOP mechanics, Playbook v2.0 rules, and the live squad/fixture data without fabricating any missing numbers.',
    },
    immediateClicks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '3 concrete in-game clicks/actions tailored to this exact turn. Do NOT prefix items with "1.", "2.", "3." because the UI renders them in a numbered list.',
    },
    followUpQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '3 smart, context-aware follow-up questions or tactical scenarios the manager can click next to continue this conversation',
    },
    chronicleTitle: {
      type: Type.STRING,
      description: 'Optional concise headline title for this tactical turn',
    },
    chronicleOutcomeMetric: {
      type: Type.STRING,
      description: 'Optional one-line key outcome or tactical summary',
    },
    isMatchResult: {
      type: Type.BOOLEAN,
      description:
        'True ONLY if this submission reports a newly completed match result not already in the Match Log',
    },
    matchFields: {
      type: Type.OBJECT,
      properties: {
        competition: { type: Type.STRING },
        opponent: { type: Type.STRING },
        venue: { type: Type.STRING },
        result: { type: Type.STRING },
        score: { type: Type.STRING },
        xGFor: { type: Type.NUMBER },
        xGAgainst: { type: Type.NUMBER },
        possession: { type: Type.NUMBER },
        passCompletion: { type: Type.NUMBER },
        shotsFor: { type: Type.STRING },
        shotsAgainst: { type: Type.STRING },
        cccFor: { type: Type.NUMBER },
        cccAgainst: { type: Type.NUMBER },
        goalTimeline: { type: Type.STRING },
        potm: { type: Type.STRING },
        defensiveWatchpoints: { type: Type.STRING },
        tacticalAudit: { type: Type.STRING },
      },
    },
    playerUpdates: {
      type: Type.ARRAY,
      description:
        'ONLY populate when the manager explicitly asks to update/save a player role, status, or note, OR when a newly uploaded screenshot reports fresh match stats/roles. Leave EMPTY [] for pure Q&A, player comparisons, hypothetical fitness questions, or tactical discussions.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Exact player name from the squad',
          },
          ipRole: {
            type: Type.STRING,
            description: 'Updated In-Possession (IP) role if changed or recommended',
          },
          oopRole: {
            type: Type.STRING,
            description: 'Updated Out-of-Possession (OOP) role if changed or recommended',
          },
          status: {
            type: Type.STRING,
            description: 'Updated squad status if changed: Starter, Rotation, Youth, Surplus, or Injured',
          },
          condition: {
            type: Type.NUMBER,
            description: 'Updated condition percentage (1-100) if explicitly reported',
          },
          rating: {
            type: Type.NUMBER,
            description: 'Updated or latest match rating if explicitly shown',
          },
          goalsAdded: {
            type: Type.NUMBER,
            description: 'Goals scored in a new match to add to total',
          },
          assistsAdded: {
            type: Type.NUMBER,
            description: 'Assists in a new match to add to total',
          },
          minutesAdded: {
            type: Type.NUMBER,
            description: 'Minutes played in a new match to add to total',
          },
          notes: {
            type: Type.STRING,
            description:
              'Updated tactical, role, scouting, mentoring, or medical report note for this player',
          },
        },
        required: ['name', 'notes'],
      },
    },
  },
  required: [
    'screenDetected',
    'inGameDate',
    'analysisMarkdown',
    'immediateClicks',
    'followUpQuestions',
    'isMatchResult',
  ],
};

export const MATCH_DEBRIEF_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    headlineVerdict: {
      type: Type.STRING,
      description: '1-sentence post-match tactical headline verdict',
    },
    xgAndExecutionAudit: {
      type: Type.STRING,
      description:
        'Concise xG, shot quality, possession, and clinicality comparison',
    },
    primaryTacticalFlaws: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '2-3 specific tactical or transition flaws detected from the match metrics',
    },
    subOptimalRoleCombinations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '2-3 FM27 Dual-Phase IP/OOP role pairing warnings or improvements',
    },
    inGameAdjustmentRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '3 actionable in-game tactical adjustments for the next fixture',
    },
  },
  required: [
    'headlineVerdict',
    'xgAndExecutionAudit',
    'primaryTacticalFlaws',
    'subOptimalRoleCombinations',
    'inGameAdjustmentRecommendations',
  ],
};

export const JOURNEY_REPORT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description: 'Sharp 1-sentence executive headline summarizing the save-to-save journey arc',
    },
    journeyArc: {
      type: Type.STRING,
      description:
        'Concise executive paragraph capturing how the club evolved between the two save dates across results, xG, finances, squad, and tactics',
    },
    whatImproved: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-5 concrete improvements backed by exact numbers/player names from the snapshot delta',
    },
    whatWorsened: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-4 concrete regressions, warning signs, or dips backed by exact numbers/player names',
    },
    thingsToNote: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-4 notable tactical shifts, contract cliffs, squad turnover, or breakout trends',
    },
    tacticalEvolution: {
      type: Type.STRING,
      description:
        'FM27 Patch 27.1.0 Dual-Phase IP/OOP tactical reflection referencing the club tactic, formation, xG trend, and role balance',
    },
    governanceAndPromisesAudit: {
      type: Type.STRING,
      description:
        'Assessment of manager contract tenure, board/supporter standing (only if exposed), objectives, and active playing-time promises',
    },
    priorityNextActions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-4 prioritized in-game actions to take next based on the journey trajectory',
    },
  },
  required: [
    'headline',
    'journeyArc',
    'whatImproved',
    'whatWorsened',
    'thingsToNote',
    'tacticalEvolution',
    'governanceAndPromisesAudit',
    'priorityNextActions',
  ],
};


