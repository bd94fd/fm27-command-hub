import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Compass,
  Gauge,
  Search,
  Shield,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CORNER_AND_SET_PIECE_FRAMEWORK,
  DUAL_PHASE_433_FRAMEWORK,
  MANAGERIAL_CHARTER,
  MATCHDAY_DIAGNOSTIC_MATRIX,
  MENTORING_RULES,
  MOOD_SHOUTS,
  PATCH_27_1_0_PHYSICAL_WEIGHTS,
  PLAYBOOK_METADATA,
  POST_MATCH_REST_RULE,
  RECRUITMENT_AND_MEDICAL_RULES,
  TACTICAL_EFFECTIVENESS,
  TACTICAL_TWEAKS,
  THREE_MAN_BOX_RULE,
} from '../data/playbookV2';
import { FM27_ROLES, getRoleFitScore } from '../domain/playerCatalog';
import type { PlayerRecord } from '../domain/types';

interface PlaybookReferenceViewProps {
  players: PlayerRecord[];
}

export function PlaybookReferenceView({ players }: PlaybookReferenceViewProps) {
  const [subTab, setSubTab] = useState<'manual' | 'roles'>('manual');
  const [rolePhase, setRolePhase] = useState<'All' | 'In Possession' | 'Out of Possession'>('All');
  const [roleGroup, setRoleGroup] = useState<string>('All');
  const [roleSearch, setRoleSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | ''>('');
  const [tweakScope, setTweakScope] = useState<'All' | 'Team' | 'Individual'>('All');

  const positionGroups = useMemo(
    () => ['All', ...Array.from(new Set(FM27_ROLES.map((r) => r.positionGroup)))],
    [],
  );

  const selectedPlayer = useMemo(
    () =>
      selectedPlayerId !== ''
        ? players.find((p) => p.id === Number(selectedPlayerId)) ?? null
        : null,
    [players, selectedPlayerId],
  );

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return FM27_ROLES.filter((role) => {
      if (rolePhase !== 'All' && role.phase !== rolePhase) return false;
      if (roleGroup !== 'All' && role.positionGroup !== roleGroup) return false;
      if (!q) return true;
      const attrNames = Object.keys(role.priorities).join(' ').replace(/_/g, ' ').toLowerCase();
      return (
        role.name.toLowerCase().includes(q) ||
        role.positionGroup.toLowerCase().includes(q) ||
        attrNames.includes(q)
      );
    });
  }, [rolePhase, roleGroup, roleSearch]);

  const filteredTweaks = useMemo(
    () =>
      tweakScope === 'All'
        ? TACTICAL_TWEAKS
        : TACTICAL_TWEAKS.filter((t) => t.scope === tweakScope),
    [tweakScope],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Header Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#39333f] bg-[#14111a] px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#734096] bg-[#34223f] text-[#dc87ff]">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[13px] font-bold text-white">{PLAYBOOK_METADATA.title}</div>
            <div className="text-[11px] text-[#b2acbb]">
              {PLAYBOOK_METADATA.edition} · Verified for {PLAYBOOK_METADATA.patchBaseline} ·{' '}
              {FM27_ROLES.length} Dual-Phase IP/OOP Roles
            </div>
          </div>
        </div>

        <div className="flex items-center rounded-[5px] border border-[#39333f] bg-[#0e0c12] p-0.5">
          <button
            type="button"
            onClick={() => setSubTab('manual')}
            className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${
              subTab === 'manual'
                ? 'bg-[#34223f] text-[#ecc2ff]'
                : 'text-[#b2acbb] hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Playbook v2.0 Manual</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('roles')}
            className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${
              subTab === 'roles'
                ? 'bg-[#142c21] text-emerald-300'
                : 'text-[#b2acbb] hover:text-white'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>68 IP/OOP Role Explorer</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {subTab === 'roles' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Role Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-[#39333f] bg-[#14111a] p-3.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {(['All', 'In Possession', 'Out of Possession'] as const).map((ph) => (
                <button
                  key={ph}
                  type="button"
                  onClick={() => setRolePhase(ph)}
                  className={`rounded-[4px] border px-3 py-1 text-[12px] font-semibold cursor-pointer ${
                    rolePhase === ph
                      ? 'border-[#dc87ff] bg-[#34223f] text-white'
                      : 'border-[#39333f] bg-[#1a151e] text-[#b2acbb] hover:text-white'
                  }`}
                >
                  {ph}
                </button>
              ))}

              <select
                aria-label="Filter by position group"
                value={roleGroup}
                onChange={(e) => setRoleGroup(e.target.value)}
                className="h-[32px] rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
              >
                {positionGroups.map((g) => (
                  <option key={g} value={g}>
                    {g === 'All' ? 'All Position Groups' : g}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {players.length > 0 && (
                <select
                  aria-label="Test role fit for loaded player"
                  value={selectedPlayerId}
                  onChange={(e) =>
                    setSelectedPlayerId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="h-[32px] max-w-[230px] rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12px] text-[#ecc2ff] focus:border-[#dc87ff] focus:outline-none"
                >
                  <option value="">Score against loaded player…</option>
                  {players.slice(0, 150).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.positionText})
                    </option>
                  ))}
                </select>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9c92a6]" />
                <input
                  type="text"
                  aria-label="Search roles or attributes"
                  placeholder="Search role or attribute…"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  className="h-[32px] w-[210px] rounded-[5px] border border-[#59515f] bg-[#202128] pl-8 pr-2.5 text-[12px] text-[#f0edf4] placeholder:text-[#8e8598] focus:border-[#dc87ff] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredRoles.map((role) => {
                const entries = Object.entries(role.priorities);
                const primaries = entries.filter(([, p]) => p === 'primary').map(([k]) => k);
                const secondaries = entries.filter(([, p]) => p === 'secondary').map(([k]) => k);
                const fitScore = selectedPlayer
                  ? getRoleFitScore(selectedPlayer.attributes, role.phase, role.name)
                  : null;

                return (
                  <div
                    key={`${role.phase}-${role.positionGroup}-${role.name}`}
                    className="flex flex-col justify-between rounded-[7px] border border-[#39333f] bg-[#14111a] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            role.phase === 'In Possession'
                              ? 'bg-[#142c21] text-emerald-300'
                              : 'bg-[#34223f] text-[#e4adff]'
                          }`}
                        >
                          {role.phase}
                        </span>
                        <h3 className="mt-1.5 text-[15px] font-bold text-white">{role.name}</h3>
                        <div className="text-[11px] text-[#9c92a6]">{role.positionGroup}</div>
                      </div>
                      {fitScore !== null && (
                        <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[11.5px] font-bold text-emerald-300">
                          Fit {fitScore}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div>
                        <div className="mb-1 font-semibold uppercase tracking-wider text-emerald-400">
                          Primary ({primaries.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {primaries.map((attr) => (
                            <span
                              key={attr}
                              className="rounded border border-emerald-500/35 bg-[#17372a] px-2 py-0.5 capitalize text-[#89f0c0]"
                            >
                              {attr.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>

                      {secondaries.length > 0 && (
                        <div>
                          <div className="mb-1 font-semibold uppercase tracking-wider text-[#6fb1ff]">
                            Secondary ({secondaries.length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {secondaries.map((attr) => (
                              <span
                                key={attr}
                                className="rounded border border-[#4493ff]/35 bg-[#1a2941] px-2 py-0.5 capitalize text-[#9cc6ff]"
                              >
                                {attr.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          {/* 1. Managerial Charter & Golden Rule */}
          <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-3">
            <h2 className="fm-font-display text-[17px] font-bold text-[#dc87ff]">
              1. Managerial Charter &amp; Golden Rule of One Change
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[12.5px]">
              <div className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-3.5 space-y-1.5">
                <div className="font-bold text-white">Philosophy &amp; Realism Guardrail</div>
                <p className="text-[#d4ced8]">{MANAGERIAL_CHARTER.philosophy}</p>
                <p className="text-[#b2acbb]">{MANAGERIAL_CHARTER.realismGuardrail}</p>
              </div>
              <div className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-3.5 space-y-1.5">
                <div className="font-bold text-amber-300">Golden Rule &amp; Slider Math</div>
                <p className="text-[#d4ced8]">{MANAGERIAL_CHARTER.goldenRuleOfOneChange}</p>
                <p className="text-emerald-300">{MANAGERIAL_CHARTER.sliderFamiliarityMath.summary}</p>
              </div>
            </div>
          </section>

          {/* 2. Dual-Phase 4-3-3 Framework & Templates */}
          <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-4">
            <div>
              <h2 className="fm-font-display text-[17px] font-bold text-[#dc87ff]">
                2. Dual-Phase 4-3-3 IP / 4-1-4-1 OOP Framework
              </h2>
              <p className="mt-1 text-[12.5px] text-[#d4ced8]">
                {DUAL_PHASE_433_FRAMEWORK.corePrinciple}
              </p>
              <p className="mt-1 text-[12px] text-amber-300">
                {DUAL_PHASE_433_FRAMEWORK.legacyNotice}
              </p>
            </div>

            <div className="overflow-x-auto rounded-[6px] border border-[#39333f]">
              <table className="fm-grid-table w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="h-[36px] px-3 text-left">Slot Group</th>
                    <th className="h-[36px] px-3 text-left">In Possession (IP)</th>
                    <th className="h-[36px] px-3 text-left">Out of Possession (OOP)</th>
                    <th className="h-[36px] px-3 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {DUAL_PHASE_433_FRAMEWORK.rolePrinciples.map((rp) => (
                    <tr key={rp.positionGroup} className="border-b border-white/[0.04]">
                      <td className="px-3 py-2.5 font-bold text-white whitespace-nowrap">
                        {rp.positionGroup}
                      </td>
                      <td className="px-3 py-2.5 text-emerald-300">{rp.inPossessionRole}</td>
                      <td className="px-3 py-2.5 text-[#ecc2ff]">{rp.outOfPossessionRole}</td>
                      <td className="px-3 py-2.5 text-[#b2acbb]">{rp.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[12px]">
              {DUAL_PHASE_433_FRAMEWORK.templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-4 space-y-2"
                >
                  <div className="font-bold text-white">{tpl.name}</div>
                  <div className="text-[#9c92a6]">
                    {tpl.context} · Mentality: <strong className="text-[#dc87ff]">{tpl.mentality}</strong>
                  </div>
                  <div>
                    <div className="font-semibold text-emerald-400">In Possession:</div>
                    <ul className="list-disc pl-4 text-[#d4ced8]">
                      {tpl.inPossession.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#dc87ff]">Out of Possession:</div>
                    <ul className="list-disc pl-4 text-[#d4ced8]">
                      {tpl.outOfPossession.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            <ul className="space-y-1 text-[12px] text-[#b2acbb] list-disc pl-5">
              {DUAL_PHASE_433_FRAMEWORK.engineGuardrails.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </section>

          {/* 3. Patch 27.1.0 Physics & Tactical Effectiveness */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-emerald-400" />
                <h2 className="fm-font-display text-[17px] font-bold text-white">
                  3. Patch 27.1.0 Physical Engine &amp; Load Caps
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 font-mono text-[11.5px]">
                <div className="rounded bg-[#1a1622] p-2.5 border border-[#39333f]">
                  <div className="text-[#9c92a6]">Top Speed</div>
                  <div className="font-bold text-emerald-300">
                    {PATCH_27_1_0_PHYSICAL_WEIGHTS.topSpeedFormula}
                  </div>
                </div>
                <div className="rounded bg-[#1a1622] p-2.5 border border-[#39333f]">
                  <div className="text-[#9c92a6]">Jump Height</div>
                  <div className="font-bold text-emerald-300">
                    {PATCH_27_1_0_PHYSICAL_WEIGHTS.jumpHeightFormula}
                  </div>
                </div>
                <div className="rounded bg-[#1a1622] p-2.5 border border-[#39333f]">
                  <div className="text-[#9c92a6]">Sprint Drain</div>
                  <div className="font-bold text-[#ecc2ff]">
                    {PATCH_27_1_0_PHYSICAL_WEIGHTS.sprintDrainFormula}
                  </div>
                </div>
              </div>
              <p className="text-[12px] text-[#d4ced8]">
                {PATCH_27_1_0_PHYSICAL_WEIGHTS.fitnessVsMoraleRule}
              </p>
              <div className="rounded-[6px] border border-emerald-500/30 bg-[#0d1f19] p-3 text-[12px] text-emerald-200 space-y-1">
                <div>
                  <strong>Double-GW Cap:</strong> &le;
                  {PATCH_27_1_0_PHYSICAL_WEIGHTS.doubleGameweekLoadCaps.standardOutfielderMaxMinutes}m
                  standard / &le;
                  {PATCH_27_1_0_PHYSICAL_WEIGHTS.doubleGameweekLoadCaps.highStaminaMaxMinutes}m for
                  Stamina &ge;
                  {PATCH_27_1_0_PHYSICAL_WEIGHTS.doubleGameweekLoadCaps.highStaminaExceptionThreshold}
                </div>
                <div>
                  <strong>Subs:</strong> {PATCH_27_1_0_PHYSICAL_WEIGHTS.substitutionBatchingRule}
                </div>
                <div>
                  <strong>Post-Match Rest Rule:</strong> Slashes daily training injury probability from{' '}
                  <span className="text-[#ff8fa2]">
                    {POST_MATCH_REST_RULE.normalTrainingInjuryProbabilityPct}%
                  </span>{' '}
                  to{' '}
                  <span className="text-emerald-300">
                    {POST_MATCH_REST_RULE.restDayInjuryProbabilityPct}%
                  </span>
                  .
                </div>
              </div>
            </section>

            <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#dc87ff]" />
                <h2 className="fm-font-display text-[17px] font-bold text-white">
                  4. Three-Man Box Rule &amp; Set Pieces
                </h2>
              </div>
              <p className="text-[12px] text-[#d4ced8]">{THREE_MAN_BOX_RULE.rule}</p>
              <p className="text-[11.5px] text-amber-300">
                {THREE_MAN_BOX_RULE.attackBoxInstructions.caution}
              </p>
              <div className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-3 text-[12px] space-y-1.5">
                <div className="font-bold text-white">Rest Defence Lock &amp; Defending Corners</div>
                <p className="text-emerald-300">{CORNER_AND_SET_PIECE_FRAMEWORK.restDefenceLock}</p>
                <ul className="list-disc pl-4 text-[#b2acbb]">
                  {CORNER_AND_SET_PIECE_FRAMEWORK.defendingCornersBlueprint.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* 5. Tactical Effectiveness & Tweaks */}
          <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-3">
            <h2 className="fm-font-display text-[17px] font-bold text-[#dc87ff]">
              5. Tactical Effectiveness (8 Areas) &amp; Decay Timeline
            </h2>
            <p className="text-[12px] text-[#b2acbb]">
              Step-change thresholds: <code className="text-white">{TACTICAL_EFFECTIVENESS.stepChangeBands.join(' / ')}</code> ·{' '}
              {TACTICAL_EFFECTIVENESS.decayTimeline}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[12px]">
              {TACTICAL_EFFECTIVENESS.eightFamiliarityAreas.map((area) => (
                <div
                  key={area.area}
                  className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#9c92a6]">
                      {area.phase}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        area.matchWeight === 'Highest'
                          ? 'bg-[#34223f] text-[#dc87ff]'
                          : 'bg-[#202128] text-[#d4ced8]'
                      }`}
                    >
                      {area.matchWeight}
                    </span>
                  </div>
                  <div className="font-bold text-white">{area.area}</div>
                  <div className="text-[11px] text-[#b2acbb]">{area.trainingFocusNote}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. Tactical Tweaks & Mood Shouts */}
          <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="fm-font-display text-[17px] font-bold text-[#dc87ff]">
                6. Tactical Tweaks (15 Team + 6 Individual) &amp; Mood Shouts
              </h2>
              <div className="flex gap-1.5">
                {(['All', 'Team', 'Individual'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setTweakScope(sc)}
                    className={`rounded px-2.5 py-1 text-[11.5px] font-semibold cursor-pointer ${
                      tweakScope === sc
                        ? 'bg-[#34223f] text-white'
                        : 'bg-[#1a1622] text-[#9c92a6] hover:text-white'
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[12px]">
              {filteredTweaks.map((tw) => (
                <div
                  key={tw.id}
                  className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white">{tw.name}</span>
                    <span className="rounded bg-[#251f2d] px-1.5 py-0.5 text-[10px] font-bold text-[#dc87ff]">
                      {tw.scope}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#b2acbb]">{tw.whenToUse}</div>
                  {tw.caution && (
                    <div className="flex items-start gap-1 text-[11px] text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{tw.caution}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[12px] pt-2">
              {MOOD_SHOUTS.map((sh) => (
                <div
                  key={sh.name}
                  className="rounded-[6px] border border-[#2d4039] bg-[#0d1f19]/60 p-3 space-y-1"
                >
                  <div className="font-bold text-emerald-300">Shout: {sh.name}</div>
                  <div className="text-[11px] text-[#d4ced8]">Best: {sh.bestTrigger}</div>
                  <div className="text-[11px] text-[#9c92a6]">Avoid: {sh.avoidWhen}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 7. Matchday Diagnostic Matrix + Mentoring + Day 1 Takeover */}
          <section className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-4">
            <h2 className="fm-font-display text-[17px] font-bold text-[#dc87ff]">
              7. Matchday Diagnostic Matrix, Mentoring &amp; Day-1 Takeover Checklist
            </h2>

            <div className="overflow-x-auto rounded-[6px] border border-[#39333f]">
              <table className="fm-grid-table w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="h-[36px] px-3 text-left">Symptom</th>
                    <th className="h-[36px] px-3 text-left">First Diagnostic Question</th>
                    <th className="h-[36px] px-3 text-left">Authentic Playbook v2.0 Response</th>
                  </tr>
                </thead>
                <tbody>
                  {MATCHDAY_DIAGNOSTIC_MATRIX.map((row) => (
                    <tr key={row.symptom} className="border-b border-white/[0.04]">
                      <td className="px-3 py-2.5 font-bold text-[#ff8fa2]">{row.symptom}</td>
                      <td className="px-3 py-2.5 text-[#d4ced8]">{row.firstQuestion}</td>
                      <td className="px-3 py-2.5 text-emerald-300">{row.authenticResponse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-[12px]">
              <div className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-4 space-y-2">
                <div className="font-bold text-white">Mentoring &amp; Recruitment Rules</div>
                <p className="text-[#d4ced8]">
                  <strong>Mentoring ({MENTORING_RULES.groupSize}-player groups):</strong>{' '}
                  {MENTORING_RULES.direction} {MENTORING_RULES.postUnitsPrerequisite}
                </p>
                <div className="font-semibold text-[#dc87ff] pt-1">Staff Hiring Priority:</div>
                <ul className="space-y-0.5 text-[#b2acbb]">
                  {RECRUITMENT_AND_MEDICAL_RULES.staffHiringOrder.map((st) => (
                    <li key={st}>{st}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[6px] border border-[#39333f] bg-[#1a1622] p-4 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Day-1 Journeyman Takeover Checklist</span>
                </div>
                <ul className="space-y-1 text-[#d4ced8]">
                  {RECRUITMENT_AND_MEDICAL_RULES.day1TakeoverChecklist.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
