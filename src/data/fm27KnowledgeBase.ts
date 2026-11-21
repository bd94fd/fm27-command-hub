import fm27RolesRaw from './fm27Roles.json';

export type KnowledgeCategory =
  | 'Match Engine & Patch 27.1.0'
  | 'Dual-Phase Tactics (IP/OOP)'
  | 'Tactical Effectiveness'
  | 'Attributes & Engine Metrics'
  | 'Training & Fatigue'
  | 'Set Pieces'
  | 'Recruitment, SCR & Contracts'
  | 'Squad Dynamics & Mentoring';

export interface Fm27KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  patchVerified: string;
  summary: string;
  keyFacts: string[];
  tags: string[];
}

export interface Fm27AccuracyCheckResult {
  passed: boolean;
  warnings: string[];
  citedVerifiedRoles: string[];
  matchedTopicCount: number;
}

interface RawRoleDef {
  positionGroup: string;
  name: string;
  phase: 'In Possession' | 'Out of Possession';
  priorities?: Record<string, string>;
}

export interface Fm27RoleCatalogEntry {
  id: string;
  positionGroup: string;
  name: string;
  phase: 'IP' | 'OOP';
  rawPhase: 'In Possession' | 'Out of Possession';
  primaryAttributes: string[];
  secondaryAttributes: string[];
  priorities: Record<string, string>;
}

function formatAttrLabel(snake: string): string {
  return snake
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const RAW_ROLES: RawRoleDef[] = Array.isArray(fm27RolesRaw)
  ? (fm27RolesRaw as unknown as RawRoleDef[])
  : [];

/**
 * Pure FM27 Patch 27.1.0 Dual-Phase Role Catalog sourced strictly from src/data/fm27Roles.json.
 * Zero legacy Defend/Support/Attack duties and zero retired FM24 roles.
 */
export const FM27_ROLE_CATALOG: Fm27RoleCatalogEntry[] = RAW_ROLES.map(
  (r, idx) => {
    const priorities = r.priorities || {};
    const primaryAttributes: string[] = [];
    const secondaryAttributes: string[] = [];
    for (const [k, tier] of Object.entries(priorities)) {
      if (tier === 'primary') primaryAttributes.push(formatAttrLabel(k));
      else secondaryAttributes.push(formatAttrLabel(k));
    }
    const phase: 'IP' | 'OOP' =
      r.phase === 'Out of Possession' ? 'OOP' : 'IP';
    return {
      id: `${phase.toLowerCase()}-${r.positionGroup.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`,
      positionGroup: r.positionGroup,
      name: r.name,
      phase,
      rawPhase: r.phase,
      primaryAttributes,
      secondaryAttributes,
      priorities,
    };
  }
);

const CANONICAL_ROLE_NAMES: string[] = FM27_ROLE_CATALOG.map((r) => r.name);

export const RETIRED_FM24_ROLES = [
  'Mezzala',
  'Enganche',
  'Trequartista',
  'Carrilero',
  'Raumdeuter',
  'Segundo Volante',
  'Inverted Wing-Back (Attack)',
  'Complete Wing-Back',
  'Roam From Position',
] as const;

export const RETIRED_FM24_DUTY_PATTERNS: RegExp[] = [
  /\b(Defend|Support|Attack)\s+duty\b/i,
  /\((Defend|Support|Attack)\)/i,
  /\b(CB|FB|WB|DM|CM|AM|IW|IF|AF|PF|W)\s*-\s*(De|Su|At)\b/,
];

export const RAW_CA_PA_LEAK_PATTERNS: RegExp[] = [
  /\bCA\s*[:=]?\s*\d{2,3}\b/i,
  /\bPA\s*[:=]?\s*\d{2,3}\b/i,
  /\bCA\s*\d{2,3}\s*\/\s*PA\s*\d{2,3}\b/i,
];

export const FM27_KNOWLEDGE_BASE: Fm27KnowledgeEntry[] = [
  {
    id: 'dual-phase-ip-oop',
    title: 'Dual-Phase Tactics: In-Possession (IP) vs Out-of-Possession (OOP)',
    category: 'Dual-Phase Tactics (IP/OOP)',
    patchVerified: 'FM27 27.1.0',
    summary:
      'FM27 replaces legacy FM24 role duties (Defend/Support/Attack) with separate In-Possession (IP) and Out-of-Possession (OOP) roles for every position slot.',
    keyFacts: [
      'Every outfield slot requires an authentic IP role and an authentic OOP role from the 68-role FM27 dual-phase catalog.',
      'Retired FM24 roles (Mezzala, Enganche, Trequartista, Carrilero, Raumdeuter, Segundo Volante) and legacy Defend/Support/Attack duties do not exist in FM27.',
      'Tracking Winger (TW) OOP on both flanks prevents 2v1 full-back overlaps against attacking wing-backs, whereas Wide Outlet Winger OOP leaves flanks exposed in defensive transition.',
      'Outlet Centre Forward (OCF) OOP stays high as a counter-attacking reference while Pressing Forward OOP triggers high-line harassment.',
    ],
    tags: [
      'ip',
      'oop',
      'roles',
      'tactics',
      'tracking winger',
      'outlet',
      'duties',
      'dual phase',
      '4-3-3',
      '4-2-3-1',
    ],
  },
  {
    id: 'tactical-effectiveness',
    title: 'Tactical Effectiveness System (FM27 Core Loop)',
    category: 'Tactical Effectiveness',
    patchVerified: 'FM27 27.1.0',
    summary:
      'Tactical Effectiveness links your IP/OOP setup, player positional familiarity, match-prep training, scout reports, and opposition analysis into one execution multiplier.',
    keyFacts: [
      'Playing players in natural IP and OOP positions is the fastest way to maximize Tactical Effectiveness.',
      'Avoid stacking excessive team instructions early; build familiarity incrementally across the two highest-impact pillars: Chance Creation and Pressing Intensity.',
      'Patch 27.1.0 rebalanced Tactical Effectiveness and Match Exposure progression, improved semi-pro Training Contribution, and added a Tactical Effectiveness column to Player Discovery and Scout screens.',
      'Employing strong Performance Analysts for Next Match Info lets you tailor specific Tactical Tweaks; against unfamiliar opponents, keep instructions simple and adapt live.',
    ],
    tags: [
      'tactical effectiveness',
      'familiarity',
      'chance creation',
      'pressing intensity',
      'scouting',
      'analyst',
      'semi-pro',
    ],
  },
  {
    id: 'patch-27-1-0-attacking',
    title: 'Patch 27.1.0 Attacking Match Engine Changes',
    category: 'Match Engine & Patch 27.1.0',
    patchVerified: 'FM27 27.1.0 (17 Nov 2026)',
    summary:
      'Update 27.1.0 refined attacking transitions, offside timing, short/long passing accuracy, and AMC wide movement.',
    keyFacts: [
      'Improved passing and dribbling decision-making during counter-attack transitions.',
      'Reduced frequency of attackers drifting offside, resulting in fewer disallowed goals and cleaner through-ball timing.',
      'Improved AMC movement to drift wider in possession to create half-space overloads.',
      'Improved short-pass accuracy under minimal pressure and pass reception logic; fixed rare GK punching during attacking set pieces.',
    ],
    tags: [
      'patch',
      '27.1.0',
      'attacking',
      'counter',
      'offside',
      'amc',
      'passing',
      'shooting',
      'match engine',
    ],
  },
  {
    id: 'patch-27-1-0-defending',
    title: 'Patch 27.1.0 Defending, Pressing & Goalkeeper Changes',
    category: 'Match Engine & Patch 27.1.0',
    patchVerified: 'FM27 27.1.0 (17 Nov 2026)',
    summary:
      'Update 27.1.0 strengthened wide OOP pressing, secondary marker cover, Holding Full Back aggression, and last-man corner discipline.',
    keyFacts: [
      'Improved OOP pressing in wide areas and increased pressing aggression of the Holding Full Back role.',
      'Reworked secondary markers covering positions and pressure when defending.',
      'Last-man defender no longer steps up recklessly, especially when your team takes attacking corners.',
      'Improved 50/50 duel reactions, reduced pushes/yellow cards, and improved GK reactions on back passes (fewer own goals).',
    ],
    tags: [
      'patch',
      '27.1.0',
      'defending',
      'pressing',
      'oop',
      'holding full back',
      'goalkeeper',
      'corners',
      'markers',
    ],
  },
  {
    id: 'engine-attribute-weights',
    title: 'Match Engine Attribute Weights & Physical Dominance',
    category: 'Attributes & Engine Metrics',
    patchVerified: 'FM27 27.1.0',
    summary:
      'Post-27.1.0 community match-engine benchmarks show physical attributes, condition, and sharpness outweigh raw star labels or minor slider tweaks.',
    keyFacts: [
      'Top outfield match-engine drivers: Pace, Acceleration, Jumping Reach, Stamina, and Dribbling/Work Rate.',
      'Match Condition and Match Sharpness exert massive influence over duel win rates and late-game error rates.',
      'Always evaluate players via relative Star Ratings plus custom FM27 Engine Metrics (Speed Index, Aerial Index, Role Fit Score, Stamina Load Risk) rather than hidden internal numbers.',
      'High Pace + Acceleration on wide forwards and full-backs creates disproportionate xG and recovery-tackle value across all tiers.',
    ],
    tags: [
      'attributes',
      'pace',
      'acceleration',
      'jumping reach',
      'stamina',
      'condition',
      'sharpness',
      'engine',
      'meta',
      'ratings',
    ],
  },
  {
    id: 'training-fatigue-subs',
    title: 'Training Schedules, Double-GW Load & Substitution Windows',
    category: 'Training & Fatigue',
    patchVerified: 'FM27 27.1.0',
    summary:
      'Managing fatigue across congested fixtures protects both performance and injury prevention, especially for low-stamina starters.',
    keyFacts: [
      'Double Gameweek cap: avoid exceeding 125–135 minutes across two fixtures in 4 days for players with Stamina <= 10.',
      'Batch all 5 substitutions into 2 second-half windows (60m–65m and 75m+) so you never exhaust all 3 stoppages early.',
      'Never substitute both starting Centre-Backs simultaneously when protecting a lead, and keep a 3-man midfield structure late instead of dropping the DM.',
      'Schedule Recovery + Match Review after congested games; prioritize Chance Creation and Pressing Intensity sessions to maximize Tactical Effectiveness.',
      'FM27 includes the PFA Concussion Recovery Protocol—always rotate concussed players strictly through medical clearance.',
    ],
    tags: [
      'training',
      'fatigue',
      'stamina',
      'substitutions',
      'double gw',
      'rotation',
      'concussion',
      'injury',
      'recovery',
    ],
  },
  {
    id: 'set-pieces-fm27',
    title: 'Attacking & Defending Set Pieces in FM27',
    category: 'Set Pieces',
    patchVerified: 'FM27 27.1.0',
    summary:
      'Inswinging deliveries paired with high Jumping Reach + Heading targets remain one of the highest-ROI xG sources in FM27.',
    keyFacts: [
      'Assign Left-footed takers to Right corners (inswingers) and Right-footed takers to Left corners (inswingers) using highest Corners + Crossing + Technique.',
      'Target Near Post and Central 6-yard zones with your highest Aerial Index (Jumping Reach + Heading + Strength) Centre-Backs and Strikers.',
      'Patch 27.1.0 prevents the last-man defender from stepping up recklessly on attacking corners, reducing counter-attack concessions.',
      'Defensively, place your 2–3 best aerial defenders zonally across the 6-yard box and mark key opposition aerial threats tightly.',
    ],
    tags: [
      'set pieces',
      'corners',
      'free kicks',
      'aerial',
      'jumping reach',
      'heading',
      'inswinging',
      'near post',
    ],
  },
  {
    id: 'recruitment-scr-contracts',
    title: 'Recruitment, Squad Cost Ratio (SCR) & Contract Governance',
    category: 'Recruitment, SCR & Contracts',
    patchVerified: 'FM27 27.1.0',
    summary:
      'FM27 enforces tighter 2026/27 Squad Cost Ratio (SCR) wage/amortization ceilings alongside Tactical Effectiveness scouting columns.',
    keyFacts: [
      'Keep weekly wage payroll cleanly inside board wage budget and monitor expiring contracts 9–12 months ahead.',
      'Use the Patch 27.1.0 Tactical Effectiveness column on Player Discovery and Scout screens to prioritize signings who fit your exact IP/OOP roles immediately.',
      'Avoid bloated release clauses or excessive unused-sub bonuses; align Squad Status promises with realistic minutes to protect dressing-room morale.',
      'Track transfer targets through structured stages (Scouted → Shortlisted → Agent Enquiry → Bid Submitted → Contract Talks → Agreed).',
    ],
    tags: [
      'recruitment',
      'transfers',
      'scr',
      'finances',
      'wages',
      'contracts',
      'shortlist',
      'scouting',
      'budget',
    ],
  },
  {
    id: 'mentoring-dynamics',
    title: 'Squad Dynamics, Hidden Personality & Mentoring Groups',
    category: 'Squad Dynamics & Mentoring',
    patchVerified: 'FM27 27.1.0',
    summary:
      'Effective 3-player mentoring groups transfer Professionalism, Determination, and Pressure handling from senior leaders to high-potential youth.',
    keyFacts: [
      'Build 3-player mentoring groups anchored by a High-Influence senior player with Model Citizen, Professional, or Driven personality.',
      'Never include Low-Determination or Unambitious senior leaders in a youth mentoring group—negative traits transfer just as easily as positive ones.',
      'Consistent dressing-room cohesion and clear playing-time promises reduce morale drops after away defeats.',
    ],
    tags: [
      'mentoring',
      'personality',
      'determination',
      'professionalism',
      'dynamics',
      'youth',
      'development',
      'morale',
    ],
  },
];

/**
 * Searches the verified FM27 Knowledge Base for entries most relevant to a user question or topic.
 */
export function searchFm27KnowledgeBase(
  query: string,
  limit = 4
): Fm27KnowledgeEntry[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return FM27_KNOWLEDGE_BASE.slice(0, limit);
  }

  const tokens = q
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length >= 2);

  const scored = FM27_KNOWLEDGE_BASE.map((entry) => {
    let score = 0;
    const titleLower = entry.title.toLowerCase();
    const summaryLower = entry.summary.toLowerCase();
    const catLower = entry.category.toLowerCase();
    const factsJoined = entry.keyFacts.join(' ').toLowerCase();

    if (titleLower.includes(q)) score += 12;
    if (catLower.includes(q)) score += 8;

    for (const tag of entry.tags) {
      if (q.includes(tag) || tag.includes(q)) score += 6;
      for (const tok of tokens) {
        if (tag.includes(tok)) score += 3;
      }
    }

    for (const tok of tokens) {
      if (titleLower.includes(tok)) score += 4;
      if (summaryLower.includes(tok)) score += 2;
      if (factsJoined.includes(tok)) score += 1;
    }

    return { entry, score };
  });

  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);

  if (matched.length > 0) return matched;
  return FM27_KNOWLEDGE_BASE.slice(0, Math.min(2, limit));
}

/**
 * Formats retrieved FM27 Knowledge Base entries into a compact prompt grounding block
 * so the AI Analyst cross-checks every response against verified FM27 27.1.0 facts.
 */
export function buildFm27KnowledgeGroundingBlock(
  query: string,
  limit = 3
): string {
  const entries = searchFm27KnowledgeBase(query, limit);
  const lines = entries.map(
    (e) =>
      `[${e.category} · ${e.patchVerified}] ${e.title}:\n${e.keyFacts
        .map((f) => `  - ${f}`)
        .join('\n')}`
  );
  return `=== VERIFIED FM27 KNOWLEDGE BASE (FACT-CHECK GROUNDING) ===\n${lines.join('\n\n')}`;
}

/**
 * Fact-checks an AI response (or tactical note) against FM27 Patch 27.1.0 rules:
 * 1. Flags retired FM24 roles (Mezzala, Enganche, Trequartista, etc.)
 * 2. Flags legacy FM24 duties (Defend/Support/Attack)
 * 3. Flags any accidental raw CA/PA number leaks
 * 4. Lists verified canonical FM27 roles cited in the response
 */
export function verifyFm27Accuracy(text: string): Fm27AccuracyCheckResult {
  const safeText = text || '';
  const warnings: string[] = [];

  for (const retired of RETIRED_FM24_ROLES) {
    const regex = new RegExp(`\\b${retired.replace(/[()]/g, '\\$&')}\\b`, 'i');
    if (regex.test(safeText)) {
      warnings.push(
        `Mentioned retired FM24 role "${retired}" — use an authentic FM27 IP/OOP role instead.`
      );
    }
  }

  for (const dutyPattern of RETIRED_FM24_DUTY_PATTERNS) {
    const m = safeText.match(dutyPattern);
    if (m) {
      warnings.push(
        `Mentioned legacy FM24 duty syntax ("${m[0]}") — FM27 uses separate IP and OOP roles.`
      );
      break;
    }
  }

  for (const caPaPattern of RAW_CA_PA_LEAK_PATTERNS) {
    if (caPaPattern.test(safeText)) {
      warnings.push(
        'Detected raw numeric CA/PA reference — display relative Star Ratings and FM27 Engine Metrics only.'
      );
      break;
    }
  }

  const citedVerifiedRoles = CANONICAL_ROLE_NAMES.filter((roleName) => {
    const clean = roleName.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (clean.length < 4) return false;
    return new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
      safeText
    );
  }).slice(0, 8);

  const matchedTopicCount = searchFm27KnowledgeBase(safeText, 5).length;

  return {
    passed: warnings.length === 0,
    warnings,
    citedVerifiedRoles,
    matchedTopicCount,
  };
}
