import {
  MatchLogEntry,
  DoubleGwTrackerRow,
  TrainingSessionDay,
  SetPieceRoutine,
} from '../types/fm27';

/**
 * Zero pre-loaded mock match logs.
 * Populated cleanly when a .fm save or match screenshot is imported.
 */
export const COMPETITIVE_MATCH_LOGS: MatchLogEntry[] = [];

/**
 * Zero pre-loaded double gameweek tracker rows.
 */
export const DOUBLE_GW_LOAD_TRACKER: DoubleGwTrackerRow[] = [];

/**
 * Zero pre-loaded mock set-piece routines.
 */
export const SET_PIECE_ROUTINES: SetPieceRoutine[] = [];

/**
 * Zero pre-loaded mock training calendar days.
 */
export const SEPTEMBER_TRAINING_CALENDAR: TrainingSessionDay[] = [];

/**
 * Authoritative, static, club-independent Bobby Dean FM27 Tactics & Journeyman Playbook v2.0 text.
 * Always available on boot in the Tactical War Room / Playbook v2.0 Reference tab.
 */
export const BOBBY_DEAN_PLAYBOOK_V2_TEXT = `Bobby Dean — Portable FM27 Tactics & Journeyman Playbook v2.0
Club-Independent Edition | Verified for Football Manager 27 on PC (Patch 27.1.0 Baseline)

1. Managerial Identity & Realism Charter
* Football Philosophy: Pragmatic, compact, organised without the ball, quick and purposeful after regains, and decisive in the final third. Direct when space is there — never aimless long-ball football.
* Realism Guardrail: Zero match-engine exploits or synthetic meta-chasing (such as copying synthetic leaderboard narrow back-five setups purely to game win-rate ceilings). Build balanced, realistic football squads using FM27's genuine intended mechanics: Dual-Phase In-Possession / Out-of-Possession shapes, Tactical Effectiveness, Tactical Tweaks, and realistic recruitment profiles. Realistic 4-3-3 and 4-2-3-1 hybrids remain highly effective in career saves when paired with athletic, well-drilled squads.
* The Golden Rule (One Change At A Time): Never overhaul formation, mentality, roles, and team instructions together after a poor result. Keep Tactical Complexity low-to-moderate, test one adjustment across a 3-to-5 match sample, and judge via match evidence and restored Data Hub maps.
* Why Discipline Matters Under the Hood: Adjusting even a single tactical slider shaves roughly 3 familiarity points (about 10% of the stored familiarity record) until retrained. Additionally, every 10 points of Tactical Complexity reduces familiarity by approximately 2.5 points per tactical area across the squad — keeping your shape clean gives your team a permanent comprehension head start.

2. The Portable Dual-Phase 4-3-3 Framework (Adaptable to Any Club)
* Core Principle: Retain a familiar 4-3-3 In Possession (IP) while defending in a compact 4-1-4-1 / 4-3-3 Mid-Block Out of Possession (OOP). Keep every starter in a natural, familiar position rather than forcing unnatural dual-phase shifts.
* Engine Guardrails for Squad Selection & Shape:
   * Always use the Combined view on the Tactics screen when swapping starting personnel so changes propagate across both IP and OOP formations automatically.
   * Inspect every phase shift inside the 9-zone (3x3) Tactics Visualiser to confirm players are not sprinting across the pitch between phases and opening central channels.
   * Avoid playing starters out of position: fielding players at positional rating 10 costs roughly 0.85 points per game (and for goalkeepers, slashes save rate from 75% to 60%, conceding +0.7 extra goals per game).
   * Keep Opposition Instructions (OIs) selective: every OI toggled increases Tactical Complexity, slowing comprehension and penalising lower-ability squads. Never blanket-press or tight-mark rapid strikers, which drags defenders out of shape and invites runs in behind.

Dual-Phase Role Principles (Exact FM27 IP / OOP Roles — Zero Legacy Duties)
Note: Legacy Duties (Defend, Support, Attack) and hybrid roles (Mezzala, Enganche, Trequartista) are retired in FM27. Assign separate IP and OOP roles to every slot.

- GK:
  * IP: No-Nonsense Goalkeeper or Goalkeeper (or Ball-Playing GK with high composure)
  * OOP: Goalkeeper, Sweeper Keeper (high line), or Line-Holding GK (deep block)
  * Notes: Reliable distribution into CBs/FBs unless pressed overwhelmingly high. Prioritise natural positional familiarity, Agility, and Reflexes.
- Centre-Backs (2):
  * IP: 1x Centre-Back (CB) + 1x Ball-Playing CB (BCB) if passing/composure allow
  * OOP: Centre-Back (CB) baseline (Stopping CB / Covering CB if tailored)
  * Notes: Defend first. Never sub both starting CBs simultaneously when protecting a late lead.
- Full-Backs (2):
  * IP: Full-Back (FB) baseline; one may step to Wing-Back (WB) only if opposite FB holds
  * OOP: Full-Back (FB) or Holding Full-Back (or Pressing FB vs passive threats)
  * Notes: Flank security first so both full-backs never vacate rest defence together. Patch 27.1.0 buffed Holding Full-Back pressing aggression and sharpened wide OOP pressing.
- Deepest Midfielder (DM):
  * IP: Half-Back (HB) at home or Defensive Midfielder (DM) away
  * OOP: Defensive Midfielder (DM), Screening DM, or Dropping DM
  * Notes: Screens Zone 5 in front of the CBs and offers the safe first pass on regains. Never sacrifice the DM to switch to a 4-2-4 against a 3-man opposition midfield.
- Central Midfield Pair (2):
  * IP: 1x Connector (Central Midfielder or Midfield Playmaker) + 1x Runner (Attacking Midfielder or Channel Midfielder)
  * OOP: 1x Central Midfielder + 1x Wide Covering CM or Screening CM
  * Notes: Asymmetric balance between ball progression and late box arrival.
- Wide Forwards (2):
  * IP: Complementary lanes: 1x touchline Winger + 1x Inside Forward or Inside Winger
  * OOP: Tracking Winger vs overlapping FBs; Wide Outlet Winger (WOW) only vs passive FBs
  * Notes: Never crowd the same lane. Tracking Winger protects against 2v1 wide overloads; WOW demands reliable flank cover behind them.
- Central Striker (1):
  * IP: Poacher, Channel Forward, or Target Forward
  * OOP: Central Outlet Centre Forward (OCF) or Tracking Centre Forward
  * Notes: Must always have nearby midfield and wide support to satisfy the Three-Man Box Rule.

The Two Portable Tactical Templates:
* Template 1 — Home / Front-Foot Positive:
   * Mentality & IP: Positive Mentality | Standard or Slightly More Direct Passing | Higher Tempo | Standard/Wider Width | Counter-Attack | Whipped Crosses (good turf) | Balanced Ground Build-Up (toggle Play Through Press against deep blocks) | Short/Mixed Goal Kicks to CBs/FBs.
   * OOP: Mid Block | Lower/Standard Defensive Line | Step Up More | Trigger Press More Often | Trap Outside (remove Trap Outside if facing overlapping opposition wing-backs).
* Template 2 — Away / Controlled Road Variant:
   * Mentality & IP: Positive or Balanced Mentality | Standard Passing Directness | Standard Tempo (preserves away legs and ball retention) | Low Crosses (wet, windy, or heavy pitches) | Balanced Ground Build-Up | Both Full-Backs on FB/FB and DM on DM/DM.
   * OOP: Compact Mid Block with Tracking Wingers on both flanks.

3. The Three-Man Box Rule, Attack Box Instructions & Set-Piece Architecture
* The Three-Man Box Rule: Whenever the ball enters an advanced wide area, ensure 3 distinct threats attack the penalty box (1 Central Striker, 1 Far-Side Wide Runner, 1 Late Central Midfielder) plus 1 player patrolling the edge of the box for cut-backs and second balls.
* Attack Box Player Instructions (FM27 Feature):
   * Attack Box – Side: Assign near post, far post, or central areas to separate runs cleanly without spiking Tactical Complexity.
   * Attack Box – Depth: Assign arriving late in the box (for cut-backs) or attacking the defensive line directly.
* Attacking Set-Piece Architecture (3 Routines):
   * Hire a dedicated Set Piece Coach and organise around four dynamically ranked Set Piece Creator buckets: Aerial Threats, Box Threats, Creators, and Recovery Defenders.
   * Separate Left-Footed Takers (Right-Side Inswingers) and Right-Footed Takers (Left-Side Inswingers) with "Default taker from both sides" turned OFF.
   * Routine 1: Far Post Isolation.
   * Routine 2: Central Six-Yard Box.
   * Routine 3: Short 3v2 Corner Triangle (Taker + Come Short + Lurk Near Side).
   * Rest Defence Lock: Always lock 2 quick Recovery Defenders on Stay Back and set the 3rd Recovery Defender sub-instruction to Lurk Outside Area (never Go Forward into six-yard traffic).
* Defending Corners Architecture:
   * 3 best aerial defenders zonally mark the 6-yard box (Near Centre, Centre, Far Centre).
   * 2 physical players Player Mark top opposition threats.
   * 2 lower-jumping players guard Near & Far Posts.
   * 1 tracker Player Marks secondary runners.
   * 1 composed midfielder patrols Edge of Area to clear second balls and stop repeat corner sieges.
   * 1 rapid outlet Stays Forward (Centre) to pin opposing defenders back.

4. Tactical Effectiveness & Post-Units Training Workflow
* Senior General Training: Cluster Drills to protect full Rest days after matches. Full Rest days skip daily training injury rolls entirely, reducing training injuries from 13.8% to 4.0%.
* Individual Focuses: Assign separate IP and OOP role focuses; set Quickness (outfielders under 23) and Agility & Reflexes (goalkeepers) as default Additional Focuses.

5. Touchline Management & Non-Negotiable Directives
* Rule 1 — Dual CB Continuity: Never substitute both starting CBs simultaneously when protecting a lead or parity.
* Rule 2 — 2-Window Substitution Batching: Batch all 5 substitutions across Window 1 (60'–65': 2–3 subs) and Window 2 (75'+: 2 subs), keeping 3 midfielders on the pitch (never pull DM for a 4-2-4).
* Rule 3 — Dual-Phase 4-3-3 Balance: Balanced Ground Build-Up, Short/Mixed GK Distribution to CBs/FBs, Standard Passing Directness, and Tracking Wingers OOP on both flanks to prevent full-back overlaps.`;

export const MASTER_GOOGLE_DOC_CLEAN = BOBBY_DEAN_PLAYBOOK_V2_TEXT;

export interface PlaybookRuleCard {
  id: string;
  section: string;
  title: string;
  tag: string;
  summary: string;
  inGameSetting: string;
}

export const PLAYBOOK_V2_REFERENCE_RULES: PlaybookRuleCard[] = [
  {
    id: 'rule-dual-phase',
    section: 'Section 1 & 2 · Dual-Phase 4-3-3 Architecture',
    title: 'In-Possession 4-3-3 / Out-of-Possession Tracking Wingers',
    tag: 'CORE SHAPE',
    summary:
      'FM27 replaces legacy support/attack duties with separate In-Possession (IP) and Out-of-Possession (OOP) role pairs. Both wide forwards (AML & AMR) must use Tracking Winger (TW) OOP instead of Wide Outlet Winger (WOW) so opposition full-backs can never create 2v1 flank overloads.',
    inGameSetting:
      'Tactics -> Out of Possession -> AML & AMR: Tracking Winger (TW) · Balanced Ground Build-Up · Short/Mixed GK Distribution · Standard Passing Directness.',
  },
  {
    id: 'rule-one-change',
    section: 'Section 3 · The Golden Rule & 3-Man Box Rule',
    title: 'One Tactical Change at a Time + 3-Man Rest-Defence Box',
    tag: 'GOLDEN RULE',
    summary:
      'Never stack multiple tactical instruction edits simultaneously—change one variable and observe 20–25 in-game minutes so you isolate cause and effect. Maintain a 3-man rest-defence base (2 Centre-Backs + 1 holding DM or tucked Full-Back) behind the ball at all times.',
    inGameSetting:
      'Keep DM set to Defensive Midfielder (DM) or Half-Back (HB) IP / DM OOP to anchor Zone 5 in front of both CBs.',
  },
  {
    id: 'rule-sub-windows',
    section: 'Section 4 · 2-Window Substitution Batching & Dual CB Lock',
    title: 'Batch All 5 Subs into 62m & 75m Windows · Never Sub Both CBs',
    tag: 'TOUCHLINE LAW',
    summary:
      'Never burn all 3 substitution stoppages before the 75th minute, and NEVER substitute both starting Centre-Backs simultaneously when protecting a lead or parity. Batch subs into Window 1 (60m–65m: replace lowest-Stamina wingers/full-backs/DM) and Window 2 (75m+: fresh striker/CM closer).',
    inGameSetting:
      'HT (45m Free Window) -> Window 1 (62m: 2–3 fatigue subs) -> Window 2 (75m: 1–2 closer subs). Both starting CBs play full 90m.',
  },
  {
    id: 'rule-late-midfield',
    section: 'Section 5 · Late-Game Chasing & Touchline Tweaks',
    title: 'Keep 3-Man Midfield Intact Late (Never Pull DM for 4-2-4)',
    tag: 'LATE GAME',
    summary:
      'Removing your holding DM after 75m to chase a goal in a 4-2-4 surrenders Zone 5 and kills ball progression into the final third. Keep your 3-man central midfield triangle intact and use FM27 Touchline Tweaks and mood-based Shouts instead.',
    inGameSetting:
      'When trailing 70m+: Keep 4-3-3 shape -> Activate Touchline Tweaks "Play With More Urgency" + "Swap Wings" -> Shout "Up Your Game".',
  },
  {
    id: 'rule-familiarity-rest',
    section: 'Section 6 · 8 Familiarity Areas & Post-Match Rest Buffer',
    title: 'Chance Creation & Pressing Intensity + 13.8% → 4.0% Injury Cut',
    tag: 'PERIODISATION',
    summary:
      'Among FM27’s 8 Tactical Effectiveness areas, Chance Creation, Build Up, and Pressing Intensity carry the highest match engine weight (target 51+ threshold). In Double Gameweeks, cap standard outfielders at <=125 combined minutes and schedule a full Post-Match Rest day to cut training injury rolls from 13.8% to 4.0%.',
    inGameSetting:
      'Training -> Post-Match Day & Double-GW MD-1: Recovery + Rest (Stamina Buffer) · Open Weeks: Build Up + Chance Creation + Pressing Trap.',
  },
  {
    id: 'rule-setpieces-mentoring',
    section: 'Section 7 & 8 · Set-Piece Wall & 3-Player Downward Mentoring',
    title: 'Centre-Delivery Corner Separation & 3-Player Mentoring Triads',
    tag: 'SET PIECES & DEV',
    summary:
      'On Attacking Corners, separate your top 3 Jumping Reach + Heading threats across Near Post (A1), Mark Keeper (A2), and Far Post (A3) with a 3-man counter-press wall on the 18-yard arc. On Defending Corners, station your Second-Ball Hub (B2) at Edge of Area. Structure Mentoring in strict 3-player groups (1 high-Determination veteran + 2 U21 prospects).',
    inGameSetting:
      'Set Pieces -> Attacking: Inswinger Aim For Centre · Defending: Zonal 6-Yard Wall + B2 Edge of Area · Mentoring: 1 Veteran (Det 14+) + 2 U21s.',
  },
];
