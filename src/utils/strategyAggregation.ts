import type { GameAction } from '../engine/types';

/**
 * Action types that count as an acquisition for strategy aggregation.
 * Tuck-ins are real acquisitions and carry a financing `structure` too.
 */
export const ACQUIRE_ACTION_TYPES = new Set(['acquire', 'acquire_tuck_in']);

/**
 * Count acquisitions by chosen financing structure.
 *
 * Acquire actions record the chosen financing as `details.structure`
 * (a DealStructureType: all_cash / seller_note / bank_debt / earnout /
 * seller_note_bank_debt / rollover_equity / share_funded), set in useGame.ts.
 *
 * NOTE: there is intentionally no `details.dealStructure` field. Reading that
 * name silently returned `{}` for every real game, which disabled the Deal
 * Architect achievement, zeroed rollover counts, and blanked the playbook
 * capital breakdown. Keep this helper as the single aggregation point.
 */
export function aggregateDealStructureTypes(
  actions: GameAction[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    if (ACQUIRE_ACTION_TYPES.has(a.type) && a.details?.structure) {
      const st = String(a.details.structure);
      counts[st] = (counts[st] || 0) + 1;
    }
  }
  return counts;
}

/** Number of acquisitions financed with rollover equity. */
export function countRolloverEquityDeals(actions: GameAction[]): number {
  return actions.filter(
    (a) => ACQUIRE_ACTION_TYPES.has(a.type) && a.details?.structure === 'rollover_equity',
  ).length;
}
