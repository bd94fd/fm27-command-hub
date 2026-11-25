import React, { useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Database,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import { ClubGovernanceState, FmExtractionManifest } from '../types/fmSave';

interface ClubGovernanceBannerProps {
  governance: ClubGovernanceState | null | undefined;
  extractionManifest?: FmExtractionManifest | null;
  onOpenCalibrationLab?: (tab?: 'roles' | 'instructions' | 'diff' | 'governance') => void;
  onAskAnalyst?: (prompt: string) => void;
}

export const ClubGovernanceBanner: React.FC<ClubGovernanceBannerProps> = ({
  governance,
  extractionManifest = null,
  onOpenCalibrationLab,
  onAskAnalyst,
}) => {
  const [showPromises, setShowPromises] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  if (!governance) return null;

  const {
    managerContract,
    boardConfidence,
    supporterConfidence,
    boardObjectives,
    clubPromises,
    playerPromiseAudits,
  } = governance;

  const atRiskAudits = playerPromiseAudits.filter(
    (a) => a.status === 'breached' || a.status === 'at_risk'
  );
  const onTrackAudits = playerPromiseAudits.filter(
    (a) => a.status === 'on_track' || a.status === 'met'
  );

  return (
    <section
      aria-label="Manager Contract, Club Governance and Promises"
      className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-emerald-400 shrink-0" />
          <h2 className="text-sm font-semibold text-white">
            Manager Mandate, Board Standing &amp; Promises
          </h2>
          <span className="text-[11px] text-slate-400">Auto-extracted from .fm save</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenCalibrationLab && (
            <button
              type="button"
              onClick={() => onOpenCalibrationLab('governance')}
              className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-[11px] font-medium text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors whitespace-nowrap"
              title="Optional advanced binary probe inspector"
            >
              Binary Inspector
            </button>
          )}
          {onAskAnalyst && (
            <button
              type="button"
              onClick={() =>
                onAskAnalyst(
                  'Audit my manager contract, board/supporter expectations, and every At-Risk squad playing-time promise in the current save. Give me an exact rotation and contract plan so I satisfy board targets and prevent dressing-room unrest.'
                )
              }
              className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-950 px-3 text-[11px] font-semibold text-emerald-300 hover:border-emerald-500/40 transition-colors"
            >
              Audit Governance in Analyst
            </button>
          )}
        </div>
      </div>

      {/* 4-column flat governance KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        {/* Manager Contract */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Manager Contract
          </div>
          <div className="font-semibold text-white truncate">
            {managerContract.managerName}
          </div>
          {managerContract.available ? (
            <div className="font-mono text-[11px] tabular-nums text-emerald-300">
              {managerContract.wagePw != null
                ? `£${managerContract.wagePw.toLocaleString()}/wk`
                : 'Wage N/A'}
              {' · '}
              {managerContract.expires || 'Expiry N/A'}
              {managerContract.contractExpiryMonths != null && (
                <span className="text-slate-400">
                  {' '}
                  ({managerContract.contractExpiryMonths}m)
                </span>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              Contract wage/expiry not exposed in this FM27 save
            </div>
          )}
        </div>

        {/* Board Rating */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-400" /> Board Rating
          </div>
          {boardConfidence.available ? (
            <>
              <div className="font-mono text-base font-bold text-white tabular-nums">
                {boardConfidence.grade ||
                  (boardConfidence.score != null ? `${boardConfidence.score}/100` : 'Active')}
              </div>
              {boardConfidence.summary && (
                <div className="text-[11px] text-slate-400 truncate">
                  {boardConfidence.summary}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-slate-400">
                Not exposed in this FM27 save
              </div>
              <div className="text-[10px] text-slate-500">
                Strict auto-extract mode (no manual override)
              </div>
            </>
          )}
        </div>

        {/* Supporter Rating */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <Users className="h-3.5 w-3.5 text-amber-400" /> Supporter Rating
          </div>
          {supporterConfidence.available ? (
            <>
              <div className="font-mono text-base font-bold text-white tabular-nums">
                {supporterConfidence.grade ||
                  (supporterConfidence.score != null
                    ? `${supporterConfidence.score}/100`
                    : 'Active')}
              </div>
              {supporterConfidence.summary && (
                <div className="text-[11px] text-slate-400 truncate">
                  {supporterConfidence.summary}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-slate-400">
                Not exposed in this FM27 save
              </div>
              <div className="text-[10px] text-slate-500">
                Strict auto-extract mode (no manual override)
              </div>
            </>
          )}
        </div>

        {/* Playing-Time & Club Promises */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <AlertTriangle
              className={`h-3.5 w-3.5 ${
                atRiskAudits.length > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            />{' '}
            Playing-Time Promises
          </div>
          <div className="font-mono text-sm font-bold tabular-nums text-white">
            <span className={atRiskAudits.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>
              {atRiskAudits.length} At Risk
            </span>
            <span className="text-slate-500 font-normal">
              {' '}
              · {onTrackAudits.length} On Track · {playerPromiseAudits.length} Audited
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {atRiskAudits.length > 0
              ? `Flagged: ${atRiskAudits.slice(0, 2).map((a) => a.playerName).join(', ')}`
              : 'All tracked squad promises currently on track'}
          </div>
        </div>
      </div>

      {/* Board Objectives + Club Promises row (only rendered when extracted from save) */}
      {(boardObjectives.length > 0 || clubPromises.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
          {boardObjectives.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                <Target className="h-3.5 w-3.5 text-emerald-400" /> Board Targets &amp; Rules ({boardObjectives.length})
              </div>
              <ul className="space-y-1.5 text-slate-200">
                {boardObjectives.slice(0, 5).map((obj, idx) => (
                  <li
                    key={`${obj.id}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2"
                  >
                    <span className="leading-snug break-words">
                      <span className="font-medium text-white">{obj.title}</span>
                      {obj.target ? (
                        <span className="text-slate-300"> — {obj.target}</span>
                      ) : null}
                    </span>
                    {obj.importance && (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 self-start sm:self-auto">
                        {obj.importance}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {clubPromises.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Active Promises ({clubPromises.length})
              </div>
              <ul className="space-y-1 text-slate-200">
                {clubPromises.slice(0, 5).map((pr, idx) => (
                  <li key={`${pr.id}-${idx}`} className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="break-words">
                      {pr.subject}
                      {pr.targetName ? ` · ${pr.targetName}` : ''}
                    </span>
                    {pr.dueDate && (
                      <span className="text-[10px] font-mono text-amber-300 shrink-0">
                        {pr.dueDate}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Expandable Playing-Time Promise Audit & Extraction Coverage */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {playerPromiseAudits.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPromises((v) => !v)}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors"
          >
            {showPromises ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Squad Playing-Time Audits ({playerPromiseAudits.length})
          </button>
        )}

        {extractionManifest && (
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Database className="h-3.5 w-3.5 text-sky-400" />
            {showAudit ? 'Hide' : 'Show'} .fm Extraction Coverage
          </button>
        )}
      </div>

      {showPromises && playerPromiseAudits.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 divide-y divide-slate-800/70 max-h-56 overflow-y-auto text-xs">
          {playerPromiseAudits.map((a) => (
            <div
              key={a.playerId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-semibold text-white">{a.playerName}</span>
                <span className="ml-2 text-slate-400">
                  Promised: {a.promisedPlayingTime}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="text-slate-300">
                  {a.minutesPlayed}m ({a.actualMinutesSharePct}% share)
                </span>
                <span
                  className={
                    a.status === 'breached'
                      ? 'text-rose-400 font-semibold'
                      : a.status === 'at_risk'
                        ? 'text-amber-300 font-semibold'
                        : 'text-emerald-400'
                  }
                >
                  {a.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAudit && extractionManifest && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-[11px] font-mono text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>Squad: {extractionManifest.totalPlayers}</div>
          <div>Matches: {extractionManifest.playedMatches}</div>
          <div>Tactics: {extractionManifest.tactics} ({extractionManifest.tacticInstructionsCount ?? 0} instr)</div>
          <div>Planner: {extractionManifest.squadPlannerSlots ?? 0} slots</div>
          <div>Staff: {extractionManifest.staff}</div>
          <div>Shortlist: {extractionManifest.shortlistScouted}</div>
          <div>Set Pieces: {extractionManifest.setPieceRoutines ?? 0}</div>
          <div>Mentoring: {extractionManifest.mentoringGroups ?? 0}</div>
        </div>
      )}
    </section>
  );
};
