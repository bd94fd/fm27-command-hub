import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { formatClubMoney } from '../utils/clubFinances';
import { formatWeeklyWage, getPositionGroup } from '../utils/squadViewHelpers';
import {
  PLAN_MOVE_LABELS,
  PLAN_POSITION_LABELS,
  PlanFinanceContext,
  PlanMove,
  PlanMoveKind,
  PlanPositionGroup,
  buildPlanImpact,
} from '../utils/transferPlan';
import {
  clearPlanMoves,
  loadPlanMoves,
  makePlanMoveId,
  savePlanMoves,
} from '../services/transferPlan';

interface TransferPlanSandboxProps {
  squad: PlayerRecord[];
  finance: PlanFinanceContext;
}

const KIND_ORDER: PlanMoveKind[] = ['sign', 'sell', 'release', 'wage'];
const GROUP_ORDER: PlanPositionGroup[] = ['GK', 'DEF', 'MID', 'FWD'];

const parseAmount = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s£$€]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({
  label,
  value,
  hint,
  tone,
}) => (
  <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-2.5 min-w-0">
    <div className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
      {label}
    </div>
    <div
      className={`mt-0.5 font-mono text-sm font-bold break-words tabular-nums ${
        tone || 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </div>
    {hint && <div className="text-micro text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
  </div>
);

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ id, label, hint, children }) => (
  <div className="min-w-0">
    <label
      htmlFor={id}
      className="block text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    >
      {label}
    </label>
    <div className="mt-1">{children}</div>
    {hint && (
      <p id={`${id}-hint`} className="mt-1 text-micro text-slate-500 dark:text-slate-400">
        {hint}
      </p>
    )}
  </div>
);

const inputClass =
  'w-full min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * A planning board for transfers, sales, releases and wage changes. It stacks any number of
 * moves and projects the money through `buildPlanImpact`, which reuses the same finance
 * projection the What if panel above uses. The plan is kept in its own storage key, so
 * nothing here can rewrite the decoded save.
 */
export const TransferPlanSandbox: React.FC<TransferPlanSandboxProps> = ({ squad, finance }) => {
  const [moves, setMoves] = useState<PlanMove[]>(() => loadPlanMoves());
  const [kind, setKind] = useState<PlanMoveKind>('sign');
  const [name, setName] = useState('');
  const [group, setGroup] = useState<PlanPositionGroup>('FWD');
  const [playerId, setPlayerId] = useState('');
  const [wage, setWage] = useState('');
  const [fee, setFee] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (moves.length === 0) {
      clearPlanMoves();
      return;
    }
    const ok = savePlanMoves(moves);
    setSavedNote(ok ? null : 'This device refused to store the plan, so it will be lost on reload.');
  }, [moves]);

  const selectedPlayer = useMemo(
    () => squad.find((player) => player.id === playerId) ?? null,
    [squad, playerId]
  );

  const impact = useMemo(
    () => buildPlanImpact(squad, moves, finance),
    [squad, moves, finance]
  );

  const resetForm = useCallback(() => {
    setName('');
    setPlayerId('');
    setWage('');
    setFee('');
  }, []);

  const addMove = useCallback(() => {
    if (kind === 'sign') {
      const trimmed = name.trim();
      const offered = parseAmount(wage);
      if (!trimmed || offered === null) return;
      setMoves((current) => [
        ...current,
        {
          id: makePlanMoveId(),
          kind,
          playerId: null,
          playerName: trimmed,
          position: group,
          age: null,
          wagePw: offered,
          fee: parseAmount(fee) ?? 0,
          note: null,
        },
      ]);
    } else {
      if (!selectedPlayer) return;
      const newWage = kind === 'wage' ? parseAmount(wage) : null;
      if (kind === 'wage' && newWage === null) return;
      setMoves((current) => [
        ...current,
        {
          id: makePlanMoveId(),
          kind,
          playerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          position: getPositionGroup(selectedPlayer.position),
          age: selectedPlayer.age,
          wagePw: kind === 'wage' ? newWage : selectedPlayer.wagePw ?? null,
          fee: kind === 'sell' ? parseAmount(fee) ?? 0 : 0,
          note: null,
        },
      ]);
    }
    resetForm();
  }, [fee, group, kind, name, resetForm, selectedPlayer, wage]);

  const canAdd =
    kind === 'sign'
      ? name.trim().length > 0 && parseAmount(wage) !== null
      : selectedPlayer !== null && (kind !== 'wage' || parseAmount(wage) !== null);

  const removeMove = (id: string) => setMoves((current) => current.filter((move) => move.id !== id));

  const money = (amount: number | null) => formatClubMoney(amount, finance.currencySymbol);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Plan several moves
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stack signings, sales, releases and wage changes and see the combined effect. The
            plan is kept on this device and never changes your save.
          </p>
        </div>
        {moves.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmClear) {
                setMoves([]);
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 min-h-11 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {confirmClear ? 'Tap again to clear' : 'Clear plan'}
          </button>
        )}
      </div>

      <div role="group" aria-label="Type of planned move" className="flex flex-wrap gap-1.5">
        {KIND_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => {
              setKind(option);
              resetForm();
            }}
            className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              kind === option
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/45'
                : 'bg-slate-100 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {PLAN_MOVE_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {kind === 'sign' ? (
          <>
            <Field id="plan-name" label="Player name">
              <input
                id="plan-name"
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who are you signing?"
                className={inputClass}
              />
            </Field>
            <Field id="plan-group" label="Position">
              <select
                id="plan-group"
                value={group}
                onChange={(e) => setGroup(e.target.value as PlanPositionGroup)}
                className={inputClass}
              >
                {GROUP_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {PLAN_POSITION_LABELS[option]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field
            id="plan-player"
            label="Squad member"
            hint={selectedPlayer ? `Currently ${formatWeeklyWage(selectedPlayer.wagePw)}` : undefined}
          >
            <select
              id="plan-player"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              aria-describedby="plan-player-hint"
              className={inputClass}
            >
              <option value="">Choose a player…</option>
              {squad.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} — {player.position} — {formatWeeklyWage(player.wagePw)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {kind !== 'sell' && kind !== 'release' && (
          <Field
            id="plan-wage"
            label={kind === 'wage' ? 'New weekly wage' : 'Weekly wage offered'}
            hint={
              kind === 'wage' && selectedPlayer
                ? `Was ${formatWeeklyWage(selectedPlayer.wagePw)}`
                : 'Per week, the way the squad screens show it.'
            }
          >
            <input
              id="plan-wage"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={wage}
              onChange={(e) => setWage(e.target.value)}
              aria-describedby="plan-wage-hint"
              placeholder="0"
              className={`${inputClass} font-mono tabular-nums`}
            />
          </Field>
        )}

        {(kind === 'sign' || kind === 'sell') && (
          <Field
            id="plan-fee"
            label={kind === 'sign' ? 'Transfer fee paid' : 'Transfer fee received'}
            hint="Cash moving now, in the club's currency."
          >
            <input
              id="plan-fee"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
              className={`${inputClass} font-mono tabular-nums`}
            />
          </Field>
        )}
      </div>

      <button
        type="button"
        onClick={addMove}
        disabled={!canAdd}
        className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/45 px-3 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add to plan
      </button>

      {savedNote && (
        <p className="text-micro text-amber-700 dark:text-amber-300">{savedNote}</p>
      )}

      {moves.length === 0 ? (
        <p className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400">
          No moves planned yet. Add one above and the combined effect appears here.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-300 dark:border-slate-800 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-950/60 text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Planned moves ({moves.length})
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {impact.moves.map((row) => (
              <li key={row.moveId} className="flex items-start justify-between gap-2 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white break-words">
                    {row.label}
                  </div>
                  <div className="mt-0.5 text-micro text-slate-500 dark:text-slate-400 break-words">
                    {row.wageDeltaWeekly === 0
                      ? 'no wage change'
                      : `${row.wageDeltaWeekly > 0 ? '+' : '-'}${formatWeeklyWage(Math.abs(row.wageDeltaWeekly))}`}
                    {row.feeIn > 0 && ` · ${money(row.feeIn)} in`}
                    {row.feeOut > 0 && ` · ${money(row.feeOut)} out`}
                    {row.status === 'stale' && ' · player left the save'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMove(row.moveId)}
                  aria-label={`Remove ${row.label} from the plan`}
                  className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {impact.hasMoves && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5">
            <Stat
              label="Squad contracts"
              value={`${formatWeeklyWage(impact.squadWageAfter)}`}
              hint={`was ${formatWeeklyWage(impact.squadWageBefore)}`}
              tone={
                impact.wageDeltaWeekly > 0
                  ? 'text-rose-600 dark:text-rose-300'
                  : impact.wageDeltaWeekly < 0
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : undefined
              }
            />
            <Stat
              label="Squad size"
              value={`${impact.squadSizeAfter}`}
              hint={`was ${impact.squadSizeBefore}`}
            />
            <Stat
              label="Cap headroom with plan"
              value={impact.finance.wageHeadroomAfterLabel}
              tone={
                impact.finance.wageHeadroomAfterWeekly !== null &&
                impact.finance.wageHeadroomAfterWeekly < 0
                  ? 'text-rose-600 dark:text-rose-300'
                  : 'text-emerald-600 dark:text-emerald-300'
              }
            />
            <Stat
              label="Runway with plan"
              value={impact.finance.runwayAfterLabel}
              hint={
                impact.finance.available
                  ? `now ${impact.finance.runwayBeforeLabel}`
                  : undefined
              }
              tone={
                impact.finance.statusAfter === 'Critical'
                  ? 'text-rose-600 dark:text-rose-300'
                  : impact.finance.statusAfter === 'Warning'
                    ? 'text-amber-600 dark:text-amber-300'
                    : 'text-emerald-600 dark:text-emerald-300'
              }
            />
          </div>

          <p className="text-micro text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Cash after the plan: balance {impact.finance.balanceAfterLabel} · monthly net{' '}
            {impact.finance.monthlyNetAfterLabel}
          </p>

          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200"
          >
            {impact.verdict}
            {!impact.finance.available && impact.finance.unavailableReason
              ? ` ${impact.finance.unavailableReason}`
              : ''}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {impact.depth.map((row) => (
              <div
                key={row.group}
                className={`rounded-lg border px-2 py-1.5 min-w-0 ${
                  row.warning
                    ? 'border-amber-500/45 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                }`}
              >
                <div className="text-micro uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {row.label}
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {row.before} → {row.after}
                </div>
              </div>
            ))}
          </div>

          {impact.warnings.length > 0 && (
            <ul className="space-y-1">
              {impact.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {moves.length > 0 && (
        <p className="text-micro text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Trash2 className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
          Plans are estimates: they use the wages and fees you enter, not anything the game
          would charge.
        </p>
      )}
    </div>
  );
};
