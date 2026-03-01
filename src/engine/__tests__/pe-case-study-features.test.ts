/**
 * Tests for 5 PE Case Study Features
 * 1. Visible Multiple Arbitrage (UI-only — tested via exit valuation)
 * 2. Diseconomies of Scale (Complexity Cost)
 * 3. Moat Building Indicator (getMoatTier)
 * 4. Market Cycle Indicator (getMarketCycleIndicator)
 * 5. Multi-Sponsor Deal History (generatePriorOwnershipCount, generateOwnershipHistory)
 */

import { describe, it, expect } from 'vitest';
import { getMoatTier } from '../buyers';
import {
  getMarketCycleIndicator,
  calculateComplexityCost,
  calculateExitValuation,
} from '../simulation';
import { generatePriorOwnershipCount, generateOwnershipHistory } from '../businesses';
import { createMockBusiness, createMockDueDiligence } from './helpers';
import {
  COMPLEXITY_ACTIVATION_THRESHOLD,
  COMPLEXITY_ACTIVATION_THRESHOLD_QUICK,
  COMPLEXITY_COST_PER_OPCO,
  COMPLEXITY_MAX_MARGIN_COMPRESSION,
  COMPETITIVE_POSITION_PREMIUM,
} from '../../data/gameConfig';
import type { Business, IntegratedPlatform } from '../types';

// ── Feature 3: Moat Building Indicator ──

describe('getMoatTier', () => {
  it('returns Narrow for low de-risking premium (<0.3)', () => {
    expect(getMoatTier(0)).toBe('Narrow');
    expect(getMoatTier(0.1)).toBe('Narrow');
    expect(getMoatTier(0.29)).toBe('Narrow');
  });

  it('returns Moderate for medium de-risking premium (0.3-0.69)', () => {
    expect(getMoatTier(0.3)).toBe('Moderate');
    expect(getMoatTier(0.5)).toBe('Moderate');
    expect(getMoatTier(0.69)).toBe('Moderate');
  });

  it('returns Wide for high de-risking premium (0.7-0.99)', () => {
    expect(getMoatTier(0.7)).toBe('Wide');
    expect(getMoatTier(0.8)).toBe('Wide');
    expect(getMoatTier(0.99)).toBe('Wide');
  });

  it('returns Fortress for very high de-risking premium (>=1.0)', () => {
    expect(getMoatTier(1.0)).toBe('Fortress');
    expect(getMoatTier(1.5)).toBe('Fortress');
    expect(getMoatTier(2.0)).toBe('Fortress');
  });
});

// ── Feature 4: Market Cycle Indicator ──

describe('getMarketCycleIndicator', () => {
  it('returns Stable with empty event history', () => {
    expect(getMarketCycleIndicator([])).toBe('Stable');
  });

  it('returns Stable with only portfolio events (non-global)', () => {
    const events = [
      { type: 'portfolio_key_man' },
      { type: 'sector_talent_war' },
    ];
    expect(getMarketCycleIndicator(events)).toBe('Stable');
  });

  it('returns Expansion with multiple bull markets (score > 2)', () => {
    const events = [
      { type: 'global_bull_market' },
      { type: 'global_bull_market' },
    ];
    expect(getMarketCycleIndicator(events)).toBe('Expansion');
  });

  it('returns Growth with moderate positive events (score 1-2)', () => {
    expect(getMarketCycleIndicator([{ type: 'global_interest_cut' }])).toBe('Growth');
  });

  it('returns Contraction with negative events (score -2 to -1)', () => {
    const events = [
      { type: 'global_recession' }, // -2
    ];
    expect(getMarketCycleIndicator(events)).toBe('Contraction');
  });

  it('returns Crisis with very negative events (score < -2)', () => {
    const events = [
      { type: 'global_financial_crisis' }, // -3
    ];
    expect(getMarketCycleIndicator(events)).toBe('Crisis');
  });

  it('uses only last 4 global events', () => {
    const events = [
      { type: 'global_financial_crisis' }, // old — should be dropped
      { type: 'global_bull_market' },
      { type: 'global_bull_market' },
      { type: 'global_interest_cut' },
      { type: 'global_interest_cut' },
    ];
    // Last 4 global: bull+bull+cut+cut = 2+2+1+1 = 6 → Expansion
    expect(getMarketCycleIndicator(events)).toBe('Expansion');
  });

  it('handles mixed positive and negative events', () => {
    const events = [
      { type: 'global_bull_market' },      // +2
      { type: 'global_recession' },        // -2
    ];
    // Score = 0 → Stable
    expect(getMarketCycleIndicator(events)).toBe('Stable');
  });
});

// ── Feature 2: Diseconomies of Scale (Complexity Cost) ──

describe('calculateComplexityCost', () => {
  function makeBizzes(count: number): Business[] {
    return Array.from({ length: count }, (_, i) =>
      createMockBusiness({
        id: `biz_${i}`,
        name: `Business ${i}`,
        revenue: 5000,
        status: 'active',
      })
    );
  }

  it('returns zero cost below threshold (standard mode)', () => {
    const result = calculateComplexityCost(
      makeBizzes(4), // 4 < 5
      [],
      20000,
      'standard',
    );
    expect(result.netCost).toBe(0);
    expect(result.excessCount).toBe(0);
  });

  it('returns zero cost below threshold (quick mode)', () => {
    const result = calculateComplexityCost(
      makeBizzes(3), // 3 < 4
      [],
      15000,
      'quick',
    );
    expect(result.netCost).toBe(0);
  });

  it('charges cost at threshold (5 businesses in standard)', () => {
    const result = calculateComplexityCost(
      makeBizzes(COMPLEXITY_ACTIVATION_THRESHOLD),
      [],
      25000,
      'standard',
    );
    expect(result.effectiveCount).toBe(5);
    expect(result.excessCount).toBe(1); // 5 - (5-1) = 1
    expect(result.grossCostFraction).toBe(COMPLEXITY_COST_PER_OPCO);
    expect(result.netCost).toBeGreaterThan(0);
  });

  it('charges at quick mode threshold (4 businesses)', () => {
    const result = calculateComplexityCost(
      makeBizzes(COMPLEXITY_ACTIVATION_THRESHOLD_QUICK),
      [],
      20000,
      'quick',
    );
    expect(result.effectiveCount).toBe(4);
    expect(result.excessCount).toBe(1);
    expect(result.netCost).toBeGreaterThan(0);
  });

  it('caps cost at 3% of revenue', () => {
    // 15 businesses: excess = 15 - 4 = 11, fraction = 11 * 0.003 = 0.033, capped at 0.03
    const result = calculateComplexityCost(
      makeBizzes(15),
      [],
      100000,
      'standard',
    );
    expect(result.grossCostFraction).toBe(COMPLEXITY_MAX_MARGIN_COMPRESSION);
    expect(result.grossCost).toBe(Math.round(100000 * 0.03));
  });

  it('shared services offset reduces net cost', () => {
    const bizzes = makeBizzes(6);
    const noSS = calculateComplexityCost(bizzes, [], 30000, 'standard');
    const oneSS = calculateComplexityCost(bizzes, [{ active: true }], 30000, 'standard');
    const twoSS = calculateComplexityCost(bizzes, [{ active: true }, { active: true }], 30000, 'standard');
    const threeSS = calculateComplexityCost(
      bizzes,
      [{ active: true }, { active: true }, { active: true }],
      30000,
      'standard',
    );

    expect(noSS.netCost).toBeGreaterThan(0);
    expect(oneSS.netCost).toBeLessThan(noSS.netCost);
    expect(twoSS.netCost).toBeLessThan(oneSS.netCost);
    expect(threeSS.netCost).toBe(0); // 3 active SS = 100% offset
  });

  it('platform constituents count as 1 entity', () => {
    const bizzes = makeBizzes(6); // 6 standalone = effective 6
    const platforms: IntegratedPlatform[] = [{
      id: 'ip_1',
      recipeId: 'test_recipe',
      name: 'Test Platform',
      sectorIds: ['agency'],
      constituentBusinessIds: ['biz_0', 'biz_1', 'biz_2'],
      bonuses: { multipleExpansion: 1.0, marginBoost: 0.02, growthBoost: 0.02, recessionResistanceReduction: 0.5 },
      forgedInRound: 1,
    }];

    const withPlatforms = calculateComplexityCost(bizzes, [], 30000, 'standard', platforms);
    const withoutPlatforms = calculateComplexityCost(bizzes, [], 30000, 'standard');

    // With platform: 3 constituents → 1 entity + 3 standalone = 4 effective (below threshold)
    expect(withPlatforms.effectiveCount).toBe(4);
    expect(withPlatforms.netCost).toBe(0);
    // Without: 6 effective → above threshold
    expect(withoutPlatforms.effectiveCount).toBe(6);
    expect(withoutPlatforms.netCost).toBeGreaterThan(0);
  });

  it('inactive shared services do not offset', () => {
    const bizzes = makeBizzes(6);
    const result = calculateComplexityCost(
      bizzes,
      [{ active: false }, { active: false }],
      30000,
      'standard',
    );
    expect(result.activeSSCount).toBe(0);
    expect(result.offsetFraction).toBe(0);
  });
});

// ── Feature 1: Competitive Position Premium in Exit Valuation ──

describe('competitivePositionPremium in exit valuation', () => {
  it('adds +0.2x premium for market leaders', () => {
    const leaderBiz = createMockBusiness({
      dueDiligence: createMockDueDiligence({ competitivePosition: 'leader' }),
    });
    const competitiveBiz = createMockBusiness({
      dueDiligence: createMockDueDiligence({ competitivePosition: 'competitive' }),
    });

    const leaderVal = calculateExitValuation(leaderBiz, 5);
    const competitiveVal = calculateExitValuation(competitiveBiz, 5);

    expect(leaderVal.competitivePositionPremium).toBe(COMPETITIVE_POSITION_PREMIUM);
    expect(competitiveVal.competitivePositionPremium).toBe(0);
    // Leader total should be higher by the premium amount (before capping)
    expect(leaderVal.competitivePositionPremium).toBe(0.2);
  });
});

// ── Feature 5: Multi-Sponsor Deal History ──

describe('generatePriorOwnershipCount', () => {
  it('returns a non-negative integer for all archetypes', () => {
    const archetypes = [
      'retiring_founder',
      'burnt_out_operator',
      'accidental_holdco',
      'distressed_seller',
      'mbo_candidate',
      'franchise_breakaway',
    ] as const;

    for (const arch of archetypes) {
      const count = generatePriorOwnershipCount(arch);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  it('retiring_founder favors 0 (founder-owned)', () => {
    // With deterministic RNG where next() returns 0.0, should get count 0
    const mockRng = { next: () => 0.0, shuffle: <T>(a: T[]) => a };
    expect(generatePriorOwnershipCount('retiring_founder', mockRng as any)).toBe(0);
  });

  it('mbo_candidate favors higher counts', () => {
    // With RNG returning 0.0, mbo_candidate has only 10% for 0, so 0.0 → 0
    // With RNG returning 0.15, 0.15 - 0.10 = 0.05 → count 1
    const mockRng = { next: () => 0.15, shuffle: <T>(a: T[]) => a };
    expect(generatePriorOwnershipCount('mbo_candidate', mockRng as any)).toBe(1);
  });

  it('accidental_holdco can return count 3', () => {
    // weights: [0.20, 0.30, 0.30, 0.20] — at 0.95, gets count 3
    const mockRng = { next: () => 0.95, shuffle: <T>(a: T[]) => a };
    expect(generatePriorOwnershipCount('accidental_holdco', mockRng as any)).toBe(3);
  });
});

describe('generateOwnershipHistory', () => {
  it('returns founder-owned text for count 0', () => {
    expect(generateOwnershipHistory(0)).toBe('Founder-owned since inception.');
  });

  it('returns non-empty text for counts 1, 2, and 3', () => {
    for (const count of [1, 2, 3]) {
      const text = generateOwnershipHistory(count);
      expect(text.length).toBeGreaterThan(0);
      expect(typeof text).toBe('string');
    }
  });

  it('handles count > 3 by capping at 3-sponsor narratives', () => {
    const text = generateOwnershipHistory(5);
    expect(text.length).toBeGreaterThan(0);
  });
});
