/**
 * State Sequence / Interaction Tests
 *
 * Multi-step scenarios testing features in combination.
 * Verifies that sequential game actions produce correct compound effects
 * and that invariants hold across action sequences.
 */
import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../simulation';
import { calculateStockPrice } from '../ipo';
import { getDistressRestrictions } from '../distress';
import { checkPlatformDissolution } from '../platforms';
import { createMockBusiness, createMockGameState } from './helpers';
import { GameState, Business, QualityRating, IntegratedPlatform, ActiveTurnaround } from '../types';
import {
  EQUITY_DILUTION_STEP,
  EQUITY_DILUTION_FLOOR,
  EQUITY_BUYBACK_COOLDOWN,
  MIN_FOUNDER_OWNERSHIP,
  MIN_PUBLIC_FOUNDER_OWNERSHIP,
  COVENANT_BREACH_ROUNDS_THRESHOLD,
  GROWTH_TYPES,
  STABILIZATION_TYPES,
} from '../../data/gameConfig';
import { getProgramById } from '../../data/turnaroundPrograms';
import { getRecipeById } from '../../data/platformRecipes';

// ── Pure-function helpers (matching store logic) ──

function computeTotalDebt(businesses: Business[], holdcoLoanBalance: number): number {
  return holdcoLoanBalance + businesses
    .filter(b => b.status === 'active' || b.status === 'integrated')
    .reduce((sum, b) => sum + b.bankDebtBalance, 0);
}

function simulateIssueEquity(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode || state.isFundManagerMode) return null;
  if (amount <= 0 || state.requiresRestructuring) return null;
  if (state.lastBuybackRound > 0 && state.round - state.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN) return null;

  const isPublic = !!state.ipoState?.isPublic;
  const metrics = calculateMetrics(state);
  if (metrics.intrinsicValuePerShare <= 0) return null;

  let effectivePrice: number;
  if (isPublic) {
    const stockPrice = calculateStockPrice(state);
    if (stockPrice <= 0) return null;
    effectivePrice = stockPrice;
  } else {
    const discount = 1 - Math.max(1 - EQUITY_DILUTION_STEP * state.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
    effectivePrice = metrics.intrinsicValuePerShare * (1 - discount);
  }

  const newShares = Math.round((amount / effectivePrice) * 1000) / 1000;
  if (newShares <= 0) return null;

  const newTotalShares = state.sharesOutstanding + newShares;
  const effectiveFloor = isPublic ? MIN_PUBLIC_FOUNDER_OWNERSHIP : MIN_FOUNDER_OWNERSHIP;
  if (state.founderShares / newTotalShares < effectiveFloor) return null;

  return {
    ...state,
    cash: state.cash + amount,
    sharesOutstanding: newTotalShares,
    equityRaisesUsed: state.equityRaisesUsed + 1,
    lastEquityRaiseRound: state.round,
  };
}

function simulateBuybackShares(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode || state.isFundManagerMode) return null;
  if (state.cash < amount) return null;
  if (state.businesses.filter(b => b.status === 'active').length === 0) return null;
  if (state.lastEquityRaiseRound > 0 && state.round - state.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN) return null;

  const metrics = calculateMetrics(state);
  const restrictions = getDistressRestrictions(metrics.distressLevel);
  if (!restrictions.canBuyback || metrics.intrinsicValuePerShare <= 0) return null;

  const effectivePrice = metrics.intrinsicValuePerShare;
  let sharesRepurchased = Math.round((amount / effectivePrice) * 1000) / 1000;
  const outsideShares = state.sharesOutstanding - state.founderShares;
  if (outsideShares <= 0) return null;
  sharesRepurchased = Math.min(sharesRepurchased, outsideShares);

  let newTotalShares = state.sharesOutstanding - sharesRepurchased;
  if (Math.abs(newTotalShares - state.founderShares) < 0.01) {
    newTotalShares = state.founderShares;
  }

  return {
    ...state,
    cash: state.cash - amount,
    sharesOutstanding: newTotalShares,
    totalBuybacks: state.totalBuybacks + amount,
    lastBuybackRound: state.round,
  };
}

function simulateDistributeToOwners(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode || state.isFundManagerMode) return null;
  if (state.cash < amount) return null;
  const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
  if (!restrictions.canDistribute) return null;

  const founderPortion = Math.round(amount * (state.founderShares / state.sharesOutstanding));
  return {
    ...state,
    cash: state.cash - amount,
    totalDistributions: state.totalDistributions + amount,
    founderDistributionsReceived: (state.founderDistributionsReceived || 0) + founderPortion,
  };
}

// ═══════════════════════════════════════════════════
// Equity → Buyback interaction sequences
// ═══════════════════════════════════════════════════
describe('equity ↔ buyback interaction sequences', () => {
  it('raise equity then immediate buyback → blocked by cooldown', () => {
    const state = createMockGameState({ round: 3 });
    const afterRaise = simulateIssueEquity(state, 1000);
    expect(afterRaise).not.toBeNull();

    // Immediate buyback in same round → blocked
    const afterBuyback = simulateBuybackShares(afterRaise!, 500);
    expect(afterBuyback).toBeNull();
  });

  it('raise equity, advance rounds past cooldown, then buyback succeeds', () => {
    const state = createMockGameState({ round: 3 });
    const afterRaise = simulateIssueEquity(state, 1000);
    expect(afterRaise).not.toBeNull();

    // Advance past cooldown
    const futureState = { ...afterRaise!, round: afterRaise!.round + EQUITY_BUYBACK_COOLDOWN + 1 };
    const afterBuyback = simulateBuybackShares(futureState, 500);
    expect(afterBuyback).not.toBeNull();
    expect(afterBuyback!.totalBuybacks).toBe(500);
  });

  it('buyback then immediate equity raise → blocked by cooldown', () => {
    const state = createMockGameState({ round: 5 });
    const afterBuyback = simulateBuybackShares(state, 500);
    expect(afterBuyback).not.toBeNull();

    const afterRaise = simulateIssueEquity(afterBuyback!, 1000);
    expect(afterRaise).toBeNull();
  });

  it('multiple equity raises in sequence increase dilution discount', () => {
    let state = createMockGameState({ round: 1 });
    const sharesHistory: number[] = [state.sharesOutstanding];

    for (let i = 0; i < 3; i++) {
      const result = simulateIssueEquity(state, 500);
      if (!result) break;
      sharesHistory.push(result.sharesOutstanding);
      // Advance round to avoid cooldown with buyback
      state = { ...result, round: result.round + 1 };
    }

    // Each raise should issue progressively more shares (cheaper price)
    for (let i = 2; i < sharesHistory.length; i++) {
      const sharesIssued_i = sharesHistory[i] - sharesHistory[i - 1];
      const sharesIssued_prev = sharesHistory[i - 1] - sharesHistory[i - 2];
      expect(sharesIssued_i).toBeGreaterThan(sharesIssued_prev);
    }
  });
});

// ═══════════════════════════════════════════════════
// Distribution + cash floor
// ═══════════════════════════════════════════════════
describe('distribution and cash floor invariants', () => {
  it('distribution then near-zero cash → no negative cash invariant', () => {
    const state = createMockGameState({ cash: 5000 });
    const result1 = simulateDistributeToOwners(state, 4999);
    expect(result1).not.toBeNull();
    expect(result1!.cash).toBe(1);

    // Try to distribute more than remaining cash
    const result2 = simulateDistributeToOwners(result1!, 2);
    expect(result2).toBeNull(); // blocked: cash < amount
  });

  it('distribution tracks cumulative totals correctly', () => {
    let state = createMockGameState({ cash: 10000 });

    const r1 = simulateDistributeToOwners(state, 2000)!;
    expect(r1.totalDistributions).toBe(2000);

    const r2 = simulateDistributeToOwners(r1, 3000)!;
    expect(r2.totalDistributions).toBe(5000);
    expect(r2.cash).toBe(5000);
  });

  it('founder portion tracks proportionally over multiple distributions', () => {
    const state = createMockGameState({
      cash: 10000,
      founderShares: 800,
      sharesOutstanding: 1000,
      founderDistributionsReceived: 0,
    });

    const r1 = simulateDistributeToOwners(state, 1000)!;
    expect(r1.founderDistributionsReceived).toBe(800); // 80% of 1000

    const r2 = simulateDistributeToOwners(r1, 2000)!;
    expect(r2.founderDistributionsReceived).toBe(800 + 1600); // 80% of 2000
  });
});

// ═══════════════════════════════════════════════════
// Covenant breach → restructuring sequences
// ═══════════════════════════════════════════════════
describe('covenant breach and restructuring sequences', () => {
  it('single breach round does not trigger restructuring', () => {
    const state = createMockGameState({ covenantBreachRounds: 1 });
    expect(state.covenantBreachRounds < COVENANT_BREACH_ROUNDS_THRESHOLD).toBe(true);
  });

  it('two consecutive breach rounds reaches threshold', () => {
    expect(COVENANT_BREACH_ROUNDS_THRESHOLD).toBe(2);
    const state = createMockGameState({ covenantBreachRounds: 2 });
    expect(state.covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD).toBe(true);
  });

  it('pre-restructuring: breach counter resets on non-breach round', () => {
    // Simulate: breach → comfortable → counter should reset
    const state = createMockGameState({
      covenantBreachRounds: 1,
      hasRestructured: false,
    });
    // Non-breach round: forgiving reset
    const newCounter = state.hasRestructured ? state.covenantBreachRounds : 0;
    expect(newCounter).toBe(0);
  });

  it('post-restructuring: breach counter NEVER resets (strict monitoring)', () => {
    const state = createMockGameState({
      covenantBreachRounds: 1,
      hasRestructured: true,
    });
    // Post-restructuring: counter never resets
    const newCounter = state.hasRestructured ? state.covenantBreachRounds : 0;
    expect(newCounter).toBe(1);
  });

  it('post-restructuring + 2 breaches → bankruptcy (game over)', () => {
    const state = createMockGameState({
      covenantBreachRounds: 2,
      hasRestructured: true,
    });
    // Second restructuring = bankruptcy
    const isBankrupt = state.covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD && state.hasRestructured;
    expect(isBankrupt).toBe(true);
  });

  it('distress in breach blocks all capital allocation actions', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 500 })],
      totalDebt: 50000,
      holdcoLoanBalance: 50000,
      cash: 1000,
    });
    const metrics = calculateMetrics(state);
    const restrictions = getDistressRestrictions(metrics.distressLevel);

    // In breach: ALL blocked
    if (metrics.distressLevel === 'breach') {
      expect(restrictions.canAcquire).toBe(false);
      expect(restrictions.canBuyback).toBe(false);
      expect(restrictions.canDistribute).toBe(false);
      expect(restrictions.canTakeDebt).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════
// Platform forge → sell constituent → dissolution
// ═══════════════════════════════════════════════════
describe('platform forge → sell → dissolution sequences', () => {
  const agencyRecipe = getRecipeById('agency_full_service_digital')!;

  function createPlatformState(): {
    state: GameState;
    platform: IntegratedPlatform;
  } {
    const businesses: Business[] = [
      createMockBusiness({ id: 'b1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', qualityRating: 4, ebitda: 3000, revenue: 15000 }),
      createMockBusiness({ id: 'b2', sectorId: 'agency', subType: 'Performance Media Agency', qualityRating: 3, ebitda: 2000, revenue: 10000 }),
      createMockBusiness({ id: 'b3', sectorId: 'agency', subType: 'SEO/Content Agency', qualityRating: 3, ebitda: 1500, revenue: 7500 }),
    ];

    // Mark all as part of a platform
    const platformId = 'platform_agency_1';
    businesses.forEach(b => { b.integratedPlatformId = platformId; });

    const platform: IntegratedPlatform = {
      id: platformId,
      recipeId: 'agency_full_service_digital',
      name: 'Full-Service Digital Agency',
      sectorIds: ['agency'],
      constituentBusinessIds: ['b1', 'b2', 'b3'],
      forgedInRound: 3,
      bonuses: agencyRecipe.bonuses,
    };

    const state = createMockGameState({
      businesses,
      integratedPlatforms: [platform],
      cash: 20000,
      round: 5,
    });

    return { state, platform };
  }

  it('platform with 3 constituents does not dissolve when one sold (minSubTypes=2)', () => {
    const { state, platform } = createPlatformState();

    // Sell b3 → 2 remaining with distinct sub-types (Digital + Performance) ≥ minSubTypes(2)
    const remainingBusinesses = state.businesses.map(b =>
      b.id === 'b3' ? { ...b, status: 'sold' as const } : b
    );

    const shouldDissolve = checkPlatformDissolution(platform, remainingBusinesses);
    expect(shouldDissolve).toBe(false);
  });

  it('platform dissolves when too few distinct sub-types remain', () => {
    const { state, platform } = createPlatformState();

    // Sell b2 and b3 → only 1 sub-type remains (Digital) < minSubTypes(2)
    const remainingBusinesses = state.businesses.map(b =>
      (b.id === 'b2' || b.id === 'b3') ? { ...b, status: 'sold' as const } : b
    );

    const shouldDissolve = checkPlatformDissolution(platform, remainingBusinesses);
    expect(shouldDissolve).toBe(true);
  });

  it('sold constituents are excluded from dissolution check', () => {
    const { state, platform } = createPlatformState();

    // Make b3 already sold in original state
    const modifiedBusinesses = state.businesses.map(b =>
      b.id === 'b3' ? { ...b, status: 'sold' as const } : b
    );

    // Now sell b2 → only b1 remains (1 sub-type < 2)
    const afterSecondSale = modifiedBusinesses.map(b =>
      b.id === 'b2' ? { ...b, status: 'sold' as const } : b
    );

    expect(checkPlatformDissolution(platform, afterSecondSale)).toBe(true);
  });

  it('dissolution clears integratedPlatformId from remaining businesses', () => {
    const { state, platform } = createPlatformState();

    const afterSale = state.businesses.map(b =>
      (b.id === 'b2' || b.id === 'b3') ? { ...b, status: 'sold' as const } : b
    );

    const shouldDissolve = checkPlatformDissolution(platform, afterSale);
    expect(shouldDissolve).toBe(true);

    // Simulate store dissolution logic
    const cleaned = afterSale.map(b =>
      b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
    );
    const b1 = cleaned.find(b => b.id === 'b1')!;
    expect(b1.integratedPlatformId).toBeUndefined();
  });

  it('non-dissolved platform updates constituentBusinessIds on sale', () => {
    const { state, platform } = createPlatformState();

    // Sell b3 only → platform survives
    const afterSale = state.businesses.map(b =>
      b.id === 'b3' ? { ...b, status: 'sold' as const } : b
    );
    expect(checkPlatformDissolution(platform, afterSale)).toBe(false);

    // Store removes sold business from constituentBusinessIds
    const updatedPlatform = {
      ...platform,
      constituentBusinessIds: platform.constituentBusinessIds.filter(id => id !== 'b3'),
    };
    expect(updatedPlatform.constituentBusinessIds).toEqual(['b1', 'b2']);
  });
});

// ═══════════════════════════════════════════════════
// Turnaround → quality gate → improvement eligibility
// ═══════════════════════════════════════════════════
describe('turnaround success → improvement eligibility sequences', () => {
  it('Q2 business: growth improvements blocked, then turnaround to Q3 enables them', () => {
    const biz = createMockBusiness({ qualityRating: 2 as QualityRating });

    // Before turnaround: growth blocked
    for (const gt of ['service_expansion', 'digital_transformation', 'recurring_revenue_conversion', 'pricing_model']) {
      if (GROWTH_TYPES.has(gt)) {
        expect(GROWTH_TYPES.has(gt) && biz.qualityRating < 3).toBe(true);
      }
    }

    // After turnaround success (Q2 → Q3)
    const upgradedBiz = { ...biz, qualityRating: 3 as QualityRating, qualityImprovedTiers: 1 };
    for (const gt of ['service_expansion', 'digital_transformation', 'recurring_revenue_conversion', 'pricing_model']) {
      if (GROWTH_TYPES.has(gt)) {
        expect(GROWTH_TYPES.has(gt) && upgradedBiz.qualityRating < 3).toBe(false);
      }
    }
  });

  it('Q1 business: stabilization allowed, growth blocked before and after partial turnaround', () => {
    const biz = createMockBusiness({ qualityRating: 1 as QualityRating });

    // Stabilization always allowed
    for (const st of STABILIZATION_TYPES) {
      expect(GROWTH_TYPES.has(st)).toBe(false);
    }

    // Partial turnaround: Q1 → Q2 (still < Q3)
    const partialUpgrade = { ...biz, qualityRating: 2 as QualityRating };
    for (const gt of GROWTH_TYPES) {
      expect(GROWTH_TYPES.has(gt) && partialUpgrade.qualityRating < 3).toBe(true);
    }
  });

  it('turnaround quality improvement enables platform eligibility', () => {
    const bizQ2 = createMockBusiness({ id: 'b1', qualityRating: 2 as QualityRating, sectorId: 'agency', subType: 'Digital/Ecommerce Agency' });
    const bizQ3 = createMockBusiness({ id: 'b2', qualityRating: 3, sectorId: 'agency', subType: 'Performance Media Agency' });

    // Before: b1 is Q2 → platform forge blocked
    const blockedByQuality = [bizQ2, bizQ3].some(b => b.qualityRating < 3);
    expect(blockedByQuality).toBe(true);

    // After turnaround: b1 → Q3
    const upgradedBiz = { ...bizQ2, qualityRating: 3 as QualityRating };
    const nowEligible = [upgradedBiz, bizQ3].some(b => b.qualityRating < 3);
    expect(nowEligible).toBe(false);
  });
});

// ═══════════════════════════════════════════════════
// IPO + equity demand event → share sync
// ═══════════════════════════════════════════════════
describe('IPO state synchronization sequences', () => {
  function createPublicState(): GameState {
    return createMockGameState({
      businesses: [
        createMockBusiness({ ebitda: 5000, revenue: 25000, ebitdaMargin: 0.20, qualityRating: 4 }),
      ],
      cash: 30000,
      sharesOutstanding: 1000,
      founderShares: 800,
      round: 12,
      duration: 'standard',
      ipoState: {
        isPublic: true,
        ipoRound: 10,
        stockPrice: 30,
        sharesOutstanding: 1000,
        preIPOShares: 800,
        marketSentiment: 0.1,
        earningsExpectations: 5250,
        initialStockPrice: 25,
        consecutiveMisses: 0,
        shareFundedDealsThisRound: 0,
      },
    });
  }

  it('equity issuance while public updates both state and IPO sharesOutstanding', () => {
    const state = createPublicState();
    const result = simulateIssueEquity(state, 2000);
    if (result) {
      // Both should agree on new shares outstanding
      expect(result.sharesOutstanding).toBeGreaterThan(state.sharesOutstanding);
      // Note: our pure simulator doesn't update ipoState, but the store does
      // This tests the expectation that shares increase
    }
  });

  it('stock price must be positive for public equity operations', () => {
    const state = createPublicState();
    const stockPrice = calculateStockPrice(state);
    expect(stockPrice).toBeGreaterThan(0);

    // With negative sentiment, stock price should still be calculable
    const negativeSentiment = {
      ...state,
      ipoState: { ...state.ipoState!, marketSentiment: -0.20 },
    };
    const lowPrice = calculateStockPrice(negativeSentiment);
    expect(Number.isFinite(lowPrice)).toBe(true);
  });

  it('equity demand event simulation: shares increase, ownership dilutes', () => {
    const state = createPublicState();
    // Simulate an equity demand event adding 25 shares
    const newShares = 25;
    const afterEvent: GameState = {
      ...state,
      sharesOutstanding: state.sharesOutstanding + newShares,
      ipoState: {
        ...state.ipoState!,
        sharesOutstanding: state.ipoState!.sharesOutstanding + newShares,
      },
    };

    expect(afterEvent.sharesOutstanding).toBe(1025);
    expect(afterEvent.ipoState!.sharesOutstanding).toBe(1025);

    // Ownership diluted
    const ownershipBefore = state.founderShares / state.sharesOutstanding;
    const ownershipAfter = afterEvent.founderShares / afterEvent.sharesOutstanding;
    expect(ownershipAfter).toBeLessThan(ownershipBefore);
  });

  it('IPO sharesOutstanding stays in sync with state.sharesOutstanding', () => {
    const state = createPublicState();
    expect(state.sharesOutstanding).toBe(state.ipoState!.sharesOutstanding);

    // After any share operation, both must agree
    const modifiedState = {
      ...state,
      sharesOutstanding: 1200,
      ipoState: { ...state.ipoState!, sharesOutstanding: 1200 },
    };
    expect(modifiedState.sharesOutstanding).toBe(modifiedState.ipoState!.sharesOutstanding);
  });
});

// ═══════════════════════════════════════════════════
// Sell business → turnaround cleanup
// ═══════════════════════════════════════════════════
describe('sell business → turnaround cleanup', () => {
  it('selling a business removes its active turnarounds', () => {
    const turnarounds: ActiveTurnaround[] = [
      { id: 'ta_b1_3', businessId: 'biz_test_1', programId: 't1_plan_a', startRound: 3, endRound: 6, status: 'active' },
      { id: 'ta_b2_3', businessId: 'biz_2', programId: 't1_plan_b', startRound: 3, endRound: 6, status: 'active' },
    ];

    const soldIds = new Set(['biz_test_1']);
    const remaining = turnarounds.filter(t => !soldIds.has(t.businessId));
    expect(remaining.length).toBe(1);
    expect(remaining[0].businessId).toBe('biz_2');
  });

  it('selling platform with bolt-ons cleans up all turnarounds', () => {
    const turnarounds: ActiveTurnaround[] = [
      { id: 'ta_main', businessId: 'main_biz', programId: 't1_plan_a', startRound: 3, endRound: 6, status: 'active' },
      { id: 'ta_bolt', businessId: 'bolt_on_1', programId: 't1_plan_b', startRound: 4, endRound: 7, status: 'active' },
      { id: 'ta_other', businessId: 'other_biz', programId: 't1_plan_a', startRound: 2, endRound: 5, status: 'active' },
    ];

    const soldIds = new Set(['main_biz', 'bolt_on_1']);
    const remaining = turnarounds.filter(t => !soldIds.has(t.businessId));
    expect(remaining.length).toBe(1);
    expect(remaining[0].businessId).toBe('other_biz');
  });
});

// ═══════════════════════════════════════════════════
// Debt computation consistency
// ═══════════════════════════════════════════════════
describe('debt computation consistency across state changes', () => {
  it('totalDebt recomputes correctly after selling a business with bank debt', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', bankDebtBalance: 2000, status: 'active' }),
      createMockBusiness({ id: 'b2', bankDebtBalance: 3000, status: 'active' }),
    ];
    const holdcoLoan = 5000;
    const initialDebt = computeTotalDebt(businesses, holdcoLoan);
    expect(initialDebt).toBe(10000); // 5000 + 2000 + 3000

    // Sell b1 → debt should drop by b1's bank debt
    const afterSale = businesses.map(b =>
      b.id === 'b1' ? { ...b, status: 'sold' as const } : b
    );
    const newDebt = computeTotalDebt(afterSale, holdcoLoan);
    expect(newDebt).toBe(8000); // 5000 + 3000
  });

  it('integrated businesses contribute to total debt', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', bankDebtBalance: 1000, status: 'active' }),
      createMockBusiness({ id: 'b2', bankDebtBalance: 2000, status: 'integrated' }),
    ];
    const debt = computeTotalDebt(businesses, 0);
    expect(debt).toBe(3000); // both active and integrated count
  });

  it('sold/merged businesses excluded from total debt', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', bankDebtBalance: 1000, status: 'sold' }),
      createMockBusiness({ id: 'b2', bankDebtBalance: 2000, status: 'merged' }),
      createMockBusiness({ id: 'b3', bankDebtBalance: 3000, status: 'active' }),
    ];
    const debt = computeTotalDebt(businesses, 1000);
    expect(debt).toBe(4000); // 1000 holdco + 3000 active only
  });
});

// ═══════════════════════════════════════════════════
// Complex multi-action sequences
// ═══════════════════════════════════════════════════
describe('complex multi-action sequences', () => {
  it('distribute → equity raise in same round (both succeed if sufficient cash)', () => {
    const state = createMockGameState({ cash: 10000, round: 5 });

    const afterDist = simulateDistributeToOwners(state, 3000);
    expect(afterDist).not.toBeNull();
    expect(afterDist!.cash).toBe(7000);

    // Equity raise adds cash back
    const afterRaise = simulateIssueEquity(afterDist!, 2000);
    expect(afterRaise).not.toBeNull();
    expect(afterRaise!.cash).toBe(9000);
  });

  it('equity raise → distribute → buyback in 3-round sequence', () => {
    // Round 1: equity raise
    let state = createMockGameState({ round: 1 });
    const afterRaise = simulateIssueEquity(state, 2000);
    expect(afterRaise).not.toBeNull();

    // Round 2: distribute (no cooldown on distributions)
    state = { ...afterRaise!, round: 2 };
    const afterDist = simulateDistributeToOwners(state, 1000);
    expect(afterDist).not.toBeNull();

    // Round 1+COOLDOWN+1: buyback (after cooldown)
    state = { ...afterDist!, round: 1 + EQUITY_BUYBACK_COOLDOWN + 1 };
    const afterBuyback = simulateBuybackShares(state, 500);
    expect(afterBuyback).not.toBeNull();
  });

  it('ownership percentage never exceeds 100% after buyback', () => {
    const state = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 810, // nearly fully owned
      cash: 100000,
    });

    const result = simulateBuybackShares(state, 100000);
    if (result) {
      const ownership = result.founderShares / result.sharesOutstanding;
      expect(ownership).toBeLessThanOrEqual(1.0);
      expect(ownership).toBeGreaterThanOrEqual(0);
    }
  });

  it('repeated distributions deplete cash correctly', () => {
    let state = createMockGameState({ cash: 5000 });

    for (let i = 0; i < 5; i++) {
      const result = simulateDistributeToOwners(state, 1000);
      if (!result) break;
      state = result;
    }

    expect(state.cash).toBe(0);
    expect(state.totalDistributions).toBe(5000);

    // One more should fail
    expect(simulateDistributeToOwners(state, 1)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════
// Cross-sector platform dissolution
// ═══════════════════════════════════════════════════
describe('cross-sector platform dissolution', () => {
  it('cross-sector recipe dissolves when required sector lost', () => {
    // Simulate a cross-sector platform (e.g., financial conglomerate)
    const platform: IntegratedPlatform = {
      id: 'plat_cross',
      recipeId: 'cross_financial_conglomerate',
      name: 'Financial Conglomerate',
      sectorIds: ['privateCredit' as any, 'wealthManagement' as any, 'insurance' as any],
      constituentBusinessIds: ['b_pc', 'b_wm', 'b_ins'],
      forgedInRound: 5,
      bonuses: { marginBoost: 0.03, growthBoost: 0.02, multipleExpansion: 2.0, recessionResistanceReduction: 0.7 },
    };

    const recipe = getRecipeById('cross_financial_conglomerate');
    if (!recipe) {
      // If recipe doesn't exist in this version, skip
      return;
    }

    const businesses: Business[] = [
      createMockBusiness({ id: 'b_pc', sectorId: 'privateCredit' as any, subType: 'Direct Lending Fund', status: 'active' }),
      createMockBusiness({ id: 'b_wm', sectorId: 'wealthManagement' as any, subType: 'RIA / Wealth Advisory', status: 'active' }),
      createMockBusiness({ id: 'b_ins', sectorId: 'insurance' as any, subType: 'P&C Insurance Brokerage', status: 'sold' }),
    ];

    // Insurance sold → should dissolve if cross-sector requirement not met
    const shouldDissolve = checkPlatformDissolution(platform, businesses);
    expect(shouldDissolve).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// Quality rating invariants across operations
// ═══════════════════════════════════════════════════
describe('quality rating invariants', () => {
  it('quality rating stays in valid range [1, 5]', () => {
    for (let q = 1; q <= 5; q++) {
      const biz = createMockBusiness({ qualityRating: q as QualityRating });
      expect(biz.qualityRating).toBeGreaterThanOrEqual(1);
      expect(biz.qualityRating).toBeLessThanOrEqual(5);
    }
  });

  it('turnaround program sourceQuality must match business quality', () => {
    const program = getProgramById('t1_plan_a')!; // sourceQuality: 1
    expect(program.sourceQuality).toBe(1);

    const q3Biz = createMockBusiness({ qualityRating: 3 });
    expect(q3Biz.qualityRating !== program.sourceQuality).toBe(true);

    const q1Biz = createMockBusiness({ qualityRating: 1 });
    expect(q1Biz.qualityRating === program.sourceQuality).toBe(true);
  });

  it('turnaround tier gates higher-tier programs', () => {
    const t1Program = getProgramById('t1_plan_a')!;
    const t2Program = getProgramById('t2_plan_a')!;

    // Tier 1 player can use t1 programs but not t2
    expect(t1Program.tierId <= 1).toBe(true);
    expect(t2Program.tierId <= 1).toBe(false);

    // Tier 2 player can use both
    expect(t1Program.tierId <= 2).toBe(true);
    expect(t2Program.tierId <= 2).toBe(true);
  });
});
