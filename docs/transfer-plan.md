# Planning moves without touching the save

The Finances tab has a panel called **Plan several moves**. It answers the question the single
**What if…** box above it cannot: what happens when you make four moves in the same window.

## What you can plan

| Move | What it does to the numbers |
| --- | --- |
| Sign | Adds the wage you offer, takes the fee out of the bank, adds one player to that position group |
| Sell | Removes the wage the save records for that player, brings the fee in, takes one player out of the group |
| Release | Removes the wage, no fee, takes one player out of the group |
| Wage change | Applies the difference between the new wage and the wage in the save |

Moves stack. The panel shows the combined result, not four separate guesses: squad contracts per
week before and after, squad size, cap headroom with the plan, runway with the plan, balance and
monthly net after the plan, and depth in each of goalkeeper, defender, midfielder and forward.

Warnings are only raised for things that are actually true of the plan: a group left with nobody,
a group left with one player, and a planned player who has since left the save.

## Why it is safe

A plan is stored in its own key, `fm27_command_hub_transfer_plan_v1`. It is never merged into the
decoded save, never written over `fm27_command_hub_state_v1`, and clearing the plan cannot clear
the save. The unit tests in `src/services/transferPlan.test.ts` assert exactly that: the save key
is byte-identical before and after saving and clearing a plan.

A move keeps the player's id. If the player is gone on the next save, the move still shows, marked
as "player left the save", and the wage recorded when the move was added is used so the total does
not silently drop.

## Where the money comes from

Every money figure goes through `projectFinanceScenario` in `src/utils/financeScenarios.ts`, the
same function the **What if…** panel uses. That keeps one arithmetic for balance, monthly net,
runway and cap headroom, so the two panels cannot disagree.

A planned fee is the user's estimate. FM27 does not offer the fee you would actually be charged, so
the panel says so in one line rather than implying the game's valuation.

## The wage sign fix in this change

Building this exposed a sign error in `projectFinanceScenario`: a weekly wage rise was added to the
monthly net, so a signing looked like it improved cash flow and a sale looked like it worsened it.
The wage cost is now subtracted, which is what the panel's own label ("negative for a sale, positive
for a signing") always promised. The finance tests were corrected and a direction test now asserts
that a wage rise must worsen the monthly net and a wage saving must improve it.

## Files

- `src/utils/transferPlan.ts` — `buildPlanImpact`, move and impact types.
- `src/services/transferPlan.ts` — load, save, clear and normalise a plan.
- `src/components/TransferPlanSandbox.tsx` — the panel on the Finances tab.
- `src/utils/transferPlan.test.ts`, `src/services/transferPlan.test.ts` — selector and storage tests.

## Not in scope

The plan is not sent to the Analyst. It is the user's intention, not a decoded fact, so the prompt
keeps reporting the save as it is. Comparing two full saves already exists in the Save Journey tab
(`SaveSnapshotDiffPanel`), which diffs any two saved points; this panel is the forward-looking half
of the same roadmap item.
