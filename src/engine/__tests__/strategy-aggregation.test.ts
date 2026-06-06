import { describe, it, expect } from 'vitest';
import type { GameAction } from '../types';
import {
  aggregateDealStructureTypes,
  countRolloverEquityDeals,
} from '../../utils/strategyAggregation';
import { ACHIEVEMENT_PREVIEW } from '../../data/achievementPreview';

// Mirrors the action shape recorded by the real acquire path in useGame.ts:
// details.structure holds the chosen DealStructureType. This guards the bug
// where the aggregation read a nonexistent `details.dealStructure`, silently
// disabling Deal Architect and the playbook capital breakdown for every game.
function acquire(structure: string): GameAction {
  return { type: 'acquire', round: 1, details: { businessId: 'b', structure } };
}

describe('aggregateDealStructureTypes', () => {
  it('counts acquisitions by the real `structure` field', () => {
    const actions = [acquire('all_cash'), acquire('bank_debt'), acquire('all_cash')];
    expect(aggregateDealStructureTypes(actions)).toEqual({ all_cash: 2, bank_debt: 1 });
  });

  it('counts tuck-in acquisitions too', () => {
    const actions: GameAction[] = [
      { type: 'acquire_tuck_in', round: 2, details: { businessId: 'b2', structure: 'share_funded' } },
    ];
    expect(aggregateDealStructureTypes(actions)).toEqual({ share_funded: 1 });
  });

  it('ignores non-acquire actions and actions without a structure', () => {
    const actions: GameAction[] = [
      { type: 'sell', round: 3, details: { businessId: 'b' } },
      { type: 'acquire', round: 1, details: { businessId: 'b' } }, // no structure
      acquire('seller_note'),
    ];
    expect(aggregateDealStructureTypes(actions)).toEqual({ seller_note: 1 });
  });

  it('does NOT read a legacy `dealStructure` field (regression guard)', () => {
    const actions: GameAction[] = [
      { type: 'acquire', round: 1, details: { businessId: 'b', dealStructure: 'all_cash' } },
    ];
    expect(aggregateDealStructureTypes(actions)).toEqual({});
  });
});

describe('countRolloverEquityDeals', () => {
  it('counts only rollover-equity financed acquisitions', () => {
    const actions = [acquire('rollover_equity'), acquire('all_cash'), acquire('rollover_equity')];
    expect(countRolloverEquityDeals(actions)).toBe(2);
  });
});

describe('deal_architect achievement (end-to-end over real action shape)', () => {
  it('unlocks at 4 unique structures aggregated from real acquire actions', () => {
    const ach = ACHIEVEMENT_PREVIEW.find((a) => a.id === 'deal_architect')!;
    const fourUnique = [
      acquire('all_cash'),
      acquire('bank_debt'),
      acquire('seller_note'),
      acquire('rollover_equity'),
    ];
    const dealStructureTypes = aggregateDealStructureTypes(fourUnique);
    expect(ach.check({ strategyData: { dealStructureTypes } } as any)).toBe(true);
  });

  it('does not unlock with only 3 unique structures', () => {
    const ach = ACHIEVEMENT_PREVIEW.find((a) => a.id === 'deal_architect')!;
    const threeUnique = [acquire('all_cash'), acquire('bank_debt'), acquire('seller_note')];
    const dealStructureTypes = aggregateDealStructureTypes(threeUnique);
    expect(ach.check({ strategyData: { dealStructureTypes } } as any)).toBe(false);
  });
});
