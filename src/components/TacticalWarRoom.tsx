import React, { useState } from 'react';
import { Shield, BookOpen, Target, Crosshair, Users, ChevronRight } from 'lucide-react';

interface RolePairing {
  pos: string;
  ip: string;
  oop: string;
  notes: string;
}

const PLAYBOOK_DUAL_PHASE_ROLES: RolePairing[] = [
  {
    pos: 'GK',
    ip: 'No-Nonsense GK (NGK) / Goalkeeper (GK)',
    oop: 'Goalkeeper (GK) / Sweeper Keeper',
    notes: 'Reliable distribution into CBs/FBs unless pressed high. Prioritise Positional Familiarity, Agility & Reflexes.',
  },
  {
    pos: 'Centre-Backs (2)',
    ip: '1x Centre-Back (CB) + 1x Ball-Playing CB (BCB)',
    oop: 'Centre-Back (CB) baseline',
    notes: 'Defend first. Never sub both starting CBs simultaneously when protecting a lead or parity.',
  },
  {
    pos: 'Full-Backs (2)',
    ip: 'Full-Back (FB) baseline / Wing-Back (WB)',
    oop: 'Full-Back (FB) / Holding Full-Back (HFB)',
    notes: 'Flank security first; never let both full-backs vacate rest defence together. Holding Full-Back locks down overlaps.',
  },
  {
    pos: 'Deepest Midfielder (DM)',
    ip: 'Half-Back (HB) at home / Defensive Midfielder (DM) away',
    oop: 'Defensive Midfielder (DM) / Screening DM',
    notes: 'Screens Zone 5 in front of CBs and offers the safe first pass on regains. Never pull DM for 4-2-4 against a 3-man midfield.',
  },
  {
    pos: 'Central Midfield Pair (2)',
    ip: '1x Connector (CM / DLP) + 1x Runner (AM / Channel Mid)',
    oop: '1x Central Midfielder (CM) + 1x Wide Covering CM',
    notes: 'Asymmetric balance between ball progression and late penalty-box arrival.',
  },
  {
    pos: 'Wide Forwards (2)',
    ip: '1x Touchline Winger (W) + 1x Inside Forward (IF)',
    oop: 'Tracking Winger (TW) baseline',
    notes: 'Never crowd the same lane. Tracking Winger protects against 2v1 overloads; Wide Outlet Winger only vs passive FBs.',
  },
  {
    pos: 'Central Striker (1)',
    ip: 'Poacher (P) / Channel Forward (CF) / Target Forward (TF)',
    oop: 'Outlet Centre Forward (OCF) / Tracking CF',
    notes: 'Always needs nearby midfield and wide runners to satisfy the Three-Man Box Rule.',
  },
];

export const TacticalWarRoom: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'charter' | 'framework' | 'box_setpieces' | 'touchline'>('framework');

  return (
    <div className="space-y-8">
      {/* Playbook Header & Section Selector */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Bobby Dean Journeyman Playbook v2.0</span>
              <span>&middot;</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">Club-Independent Reference</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              Portable FM27 Tactics &amp; Dual-Phase Engine Playbook
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Verified for Football Manager 27 on PC (Patch 27.1.0 Baseline). Zero synthetic match-engine exploits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveSection('framework')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'framework'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Dual-Phase 4-3-3
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('charter')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'charter'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Realism Charter
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('box_setpieces')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'box_setpieces'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Three-Man Box &amp; Corners
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('touchline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'touchline'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Touchline Rules
            </button>
          </div>
        </div>

        {/* Section 1: Realism Charter */}
        {activeSection === 'charter' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Philosophy
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Pragmatic &amp; Purposeful
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Compact and organised without the ball, rapid and purposeful after regains, decisive in the final third. Direct when space is there — never aimless long-ball football.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Realism Guardrail
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Zero Match-Engine Exploits
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Zero synthetic meta-chasing (such as copying broken narrow back-five setups purely to game win-rate ceilings). Realistic 4-3-3 and 4-2-3-1 hybrids paired with well-drilled athletic personnel.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Golden Rule
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                One Change At A Time
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Never overhaul formation, mentality, roles, and instructions together after a loss. Adjusting one slider shaves roughly 3 familiarity points (10% of stored record) until retrained.
              </p>
            </div>
          </div>
        )}

        {/* Section 2: Framework & Dual-Phase Roles Table */}
        {activeSection === 'framework' && (
          <div className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Template 1 · Home / Front-Foot Positive
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  <strong>Positive Mentality:</strong> Standard/Direct Passing &middot; Higher Tempo &middot; Counter-Attack &middot; Balanced Ground Build-Up &middot; Short/Mixed GK kicks &middot; Mid Block with Step Up More.
                </div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Template 2 · Away / Controlled Road Variant
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  <strong>Balanced Mentality:</strong> Standard Passing &middot; Standard Tempo &middot; Low Crosses &middot; Full-Backs on FB/FB &middot; DM on DM/DM &middot; Compact Mid Block with Tracking Wingers OOP.
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Slot</th>
                    <th className="py-2.5 pr-4">In-Possession (IP) Role</th>
                    <th className="py-2.5 pr-4">Out-of-Possession (OOP) Role</th>
                    <th className="py-2.5">Tactical Role Principles &amp; Patch 27.1.0 Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {PLAYBOOK_DUAL_PHASE_ROLES.map((r) => (
                    <tr key={r.pos} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 pr-4 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {r.pos}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {r.ip}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.oop}
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-400">
                        {r.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 3: Three-Man Box & Corners */}
        {activeSection === 'box_setpieces' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Target className="w-4 h-4" />
                <span>The Three-Man Box Rule</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Whenever the ball enters an advanced wide area, ensure <strong>3 distinct threats attack the penalty box</strong> (1 Central Striker, 1 Far-Side Wide Runner, 1 Late Central Midfielder) plus 1 player patrolling the edge of the box for cut-backs and second balls.
              </p>
              <div className="pt-2 text-xs text-slate-700 dark:text-slate-300">
                <strong>Attack Box Depth:</strong> Assigning Attack Box Depth to players with low Off The Ball lowers Player Ability inside Tactical Effectiveness.
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Crosshair className="w-4 h-4" />
                <span>Set-Piece Architecture</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Organise around four ranked Creator buckets: <strong>Aerial Threats, Box Threats, Creators, Recovery Defenders</strong>.
              </p>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 list-disc list-inside">
                <li>Separate Left-Footed and Right-Footed Takers for Inswingers.</li>
                <li>Routine 1: Far Post Isolation &middot; Routine 2: Centre Six-Yard Box &middot; Routine 3: Short 3v2.</li>
                <li>Defending Corners: 3 aerial defenders mark 6-yd box, 1 second-ball hub on edge of area, 1 rapid outlet forward.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Section 4: Touchline Rules */}
        {activeSection === 'touchline' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Rule 1 — Dual CB Continuity</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Never substitute both starting CBs simultaneously when protecting a lead or parity. Central defensive partnership continuity is paramount to avoiding late concession.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Rule 2 — 2-Window Substitution Batching</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Batch all 5 substitutions across Window 1 (60&apos;–65&apos;: 2–3 subs) and Window 2 (75&apos;+: 2 subs), keeping 3 midfielders on the pitch (never pull DM for a 4-2-4).
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Rule 3 — Dual-Phase 4-3-3 Balance</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Balanced Ground Build-Up, Short/Mixed GK Distribution to CBs/FBs, Standard Passing Directness, and Tracking Wingers OOP on both flanks to prevent full-back overloads.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Rule 4 — Late Midfield Retention</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                When chasing a goal late (70m–85m+), do not switch to a 4-2-4 against a 3-man midfield. Trigger FM27 Touchline Tweaks (Play With More Urgency + Swap Wings) while keeping DM solid.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
