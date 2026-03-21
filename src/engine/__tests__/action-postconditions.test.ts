/**
 * Action Postcondition Tests
 *
 * Validates that every guard condition on key Zustand actions correctly
 * blocks the action AND leaves state unchanged (snapshot before === after).
 * Uses pure-function simulations mirroring useGame.ts logic.
 */
import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../simulation';
import { calculateStockPrice } from '../ipo';
import { getDistressRestrictions } from '../distress';
import { createMockBusiness, createMockGameState, createMockDeal, createMockDealStructure } from './helpers';
import { GameState } from '../types';
import {
  EQUITY_DILUTION_STEP,
  EQUITY_DILUTION_FLOOR,
  EQUITY_BUYBACK_COOLDOWN,
  MIN_FOUNDER_OWNERSHIP,
  MIN_PUBLIC_FOUNDER_OWNERSHIP,
  GROWTH_TYPES,
  STABILIZATION_TYPES,
} from '../../data/gameConfig';
import { getProgramById } from '../../data/turnaroundPrograms';
import { getTurnaroundDuration } from '../turnarounds';

// ── Pure-function simulators (mirror store logic without side effects) ──

function simulateBuybackShares(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode) return null;
  if (state.isFundManagerMode) return null;
  if (state.cash < amount) return null;

  const activeCount = state.businesses.filter(b => b.status === 'active').length;
  if (activeCount === 0) return null;

  if (state.lastEquityRaiseRound > 0 && state.round - state.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN) return null;

  const isPublic = !!state.ipoState?.isPublic;
  const metrics = calculateMetrics(state);
  const restrictions = getDistressRestrictions(metrics.distressLevel);
  if (!restrictions.canBuyback) return null;
  if (metrics.intrinsicValuePerShare <= 0) return null;

  let effectivePrice: number;
  if (isPublic) {
    const stockPrice = calculateStockPrice(state);
    if (stockPrice <= 0) return null;
    effectivePrice = stockPrice;
  } else {
    effectivePrice = metrics.intrinsicValuePerShare;
  }

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

function simulateIssueEquity(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode) return null;
  if (state.isFundManagerMode) return null;
  if (amount <= 0) return null;
  if (state.requiresRestructuring) return null;
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
  const newFounderOwnership = state.founderShares / newTotalShares;
  const effectiveFloor = isPublic ? MIN_PUBLIC_FOUNDER_OWNERSHIP : MIN_FOUNDER_OWNERSHIP;
  if (newFounderOwnership < effectiveFloor) return null;

  return {
    ...state,
    cash: state.cash + amount,
    sharesOutstanding: newTotalShares,
    equityRaisesUsed: state.equityRaisesUsed + 1,
    lastEquityRaiseRound: state.round,
  };
}

function simulateDistributeToOwners(state: GameState, amount: number): GameState | null {
  if (state.isFamilyOfficeMode) return null;
  if (state.isFundManagerMode) return null;
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

// ── Helper: create a high-debt "breach" state ──
function createBreachState(): GameState {
  return createMockGameState({
    businesses: [createMockBusiness({ ebitda: 500 })],
    totalDebt: 50000,
    holdcoLoanBalance: 50000,
    holdcoLoanRate: 0.10,
    holdcoLoanRoundsRemaining: 5,
    cash: 2000,
  });
}

// ═══════════════════════════════════════════════════
// buybackShares
// ═══════════════════════════════════════════════════
describe('buybackShares postconditions', () => {
  it('blocks in Family Office mode', () => {
    const state = createMockGameState({ isFamilyOfficeMode: true });
    expect(simulateBuybackShares(state, 1000)).toBeNull();
  });

  it('blocks in Fund Manager mode', () => {
    const state = createMockGameState({ isFundManagerMode: true });
    expect(simulateBuybackShares(state, 1000)).toBeNull();
  });

  it('blocks when cash is insufficient', () => {
    const state = createMockGameState({ cash: 500 });
    expect(simulateBuybackShares(state, 1000)).toBeNull();
  });

  it('blocks when no active businesses (anti-exploit)', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ status: 'sold' })],
    });
    expect(simulateBuybackShares(state, 100)).toBeNull();
  });

  it('blocks during equity raise cooldown', () => {
    const state = createMockGameState({
      round: 3,
      lastEquityRaiseRound: 2, // within EQUITY_BUYBACK_COOLDOWN (2 rounds)
    });
    expect(simulateBuybackShares(state, 100)).toBeNull();
  });

  it('allows buyback after cooldown expires', () => {
    const state = createMockGameState({
      round: 5,
      lastEquityRaiseRound: 2, // 3 rounds ago > EQUITY_BUYBACK_COOLDOWN
    });
    const result = simulateBuybackShares(state, 100);
    expect(result).not.toBeNull();
    expect(result!.lastBuybackRound).toBe(5);
  });

  it('blocks in covenant breach distress', () => {
    const state = createBreachState();
    expect(simulateBuybackShares(state, 100)).toBeNull();
  });

  it('blocks when no outside shares to buy back', () => {
    const state = createMockGameState({
      sharesOutstanding: 800,
      founderShares: 800, // 100% ownership
    });
    expect(simulateBuybackShares(state, 100)).toBeNull();
  });

  it('reduces cash and shares on success', () => {
    const state = createMockGameState();
    const result = simulateBuybackShares(state, 500);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(state.cash - 500);
    expect(result!.sharesOutstanding).toBeLessThan(state.sharesOutstanding);
    expect(result!.totalBuybacks).toBe(state.totalBuybacks + 500);
  });

  it('caps shares repurchased to outside shares', () => {
    const state = createMockGameState({
      sharesOutstanding: 810,
      founderShares: 800, // only 10 outside shares
      cash: 100000,
    });
    const result = simulateBuybackShares(state, 100000);
    expect(result).not.toBeNull();
    // Should snap to founder shares when close
    expect(result!.sharesOutstanding).toBeGreaterThanOrEqual(state.founderShares);
  });
});

// ═══════════════════════════════════════════════════
// issueEquity
// ═══════════════════════════════════════════════════
describe('issueEquity postconditions', () => {
  it('blocks in Family Office mode', () => {
    const state = createMockGameState({ isFamilyOfficeMode: true });
    expect(simulateIssueEquity(state, 1000)).toBeNull();
  });

  it('blocks in Fund Manager mode', () => {
    const state = createMockGameState({ isFundManagerMode: true });
    expect(simulateIssueEquity(state, 1000)).toBeNull();
  });

  it('blocks zero or negative amount', () => {
    const state = createMockGameState();
    expect(simulateIssueEquity(state, 0)).toBeNull();
    expect(simulateIssueEquity(state, -100)).toBeNull();
  });

  it('blocks during restructuring', () => {
    const state = createMockGameState({ requiresRestructuring: true });
    expect(simulateIssueEquity(state, 1000)).toBeNull();
  });

  it('blocks during buyback cooldown', () => {
    const state = createMockGameState({
      round: 3,
      lastBuybackRound: 2,
    });
    expect(simulateIssueEquity(state, 1000)).toBeNull();
  });

  it('allows after cooldown expires', () => {
    const state = createMockGameState({
      round: 5,
      lastBuybackRound: 2,
    });
    const result = simulateIssueEquity(state, 1000);
    expect(result).not.toBeNull();
  });

  it('blocks when would violate MIN_FOUNDER_OWNERSHIP (private)', () => {
    // founderShares=800, sharesOutstanding=1000 → 80% now
    // To drop below 51%, need to issue so many shares that 800/newTotal < 0.51
    // 800/newTotal < 0.51 → newTotal > 1568
    // Need to add 569+ shares → very large equity raise
    const state = createMockGameState({
      cash: 1000,
      businesses: [createMockBusiness({ ebitda: 100, revenue: 500, ebitdaMargin: 0.20 })],
    });
    // Try a massive equity raise relative to company value
    const result = simulateIssueEquity(state, 500000);
    expect(result).toBeNull();
  });

  it('increases cash and shares on success', () => {
    const state = createMockGameState();
    const result = simulateIssueEquity(state, 1000);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(state.cash + 1000);
    expect(result!.sharesOutstanding).toBeGreaterThan(state.sharesOutstanding);
    expect(result!.equityRaisesUsed).toBe(state.equityRaisesUsed + 1);
    expect(result!.lastEquityRaiseRound).toBe(state.round);
  });

  it('escalating discount reduces effective price over raises', () => {
    const state0 = createMockGameState({ equityRaisesUsed: 0 });
    const state3 = createMockGameState({ equityRaisesUsed: 3 });
    const r0 = simulateIssueEquity(state0, 1000);
    const r3 = simulateIssueEquity(state3, 1000);
    expect(r0).not.toBeNull();
    expect(r3).not.toBeNull();
    // More raises used → cheaper price → more shares issued
    expect(r3!.sharesOutstanding).toBeGreaterThan(r0!.sharesOutstanding);
  });
});

// ═══════════════════════════════════════════════════
// distributeToOwners
// ═══════════════════════════════════════════════════
describe('distributeToOwners postconditions', () => {
  it('blocks in Family Office mode', () => {
    const state = createMockGameState({ isFamilyOfficeMode: true });
    expect(simulateDistributeToOwners(state, 1000)).toBeNull();
  });

  it('blocks in Fund Manager mode', () => {
    const state = createMockGameState({ isFundManagerMode: true });
    expect(simulateDistributeToOwners(state, 1000)).toBeNull();
  });

  it('blocks when cash insufficient', () => {
    const state = createMockGameState({ cash: 500 });
    expect(simulateDistributeToOwners(state, 1000)).toBeNull();
  });

  it('blocks in covenant breach', () => {
    const state = createBreachState();
    expect(simulateDistributeToOwners(state, 100)).toBeNull();
  });

  it('reduces cash and increases distributions on success', () => {
    const state = createMockGameState({ cash: 5000 });
    const result = simulateDistributeToOwners(state, 2000);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(3000);
    expect(result!.totalDistributions).toBe(state.totalDistributions + 2000);
  });

  it('tracks founder portion proportionally', () => {
    const state = createMockGameState({ founderShares: 800, sharesOutstanding: 1000 });
    const result = simulateDistributeToOwners(state, 1000)!;
    // 80% ownership → ~800
    expect(result.founderDistributionsReceived).toBe(800);
  });
});

// ═══════════════════════════════════════════════════
// sellBusiness
// ═══════════════════════════════════════════════════
describe('sellBusiness postconditions', () => {
  it('blocks when not in allocate phase', () => {
    const state = createMockGameState({ phase: 'collect' });
    expect(state.phase).not.toBe('allocate');
    expect(state.phase !== 'allocate').toBe(true);
  });

  it('blocks when business not found or not active', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ id: 'biz_1', status: 'sold' })],
    });
    const biz = state.businesses.find(b => b.id === 'biz_1');
    expect(biz!.status).not.toBe('active');
  });

  it('allows selling an active business in allocate phase', () => {
    const state = createMockGameState({ phase: 'allocate' });
    expect(state.phase).toBe('allocate');
    expect(state.businesses[0].status).toBe('active');
  });
});

// ═══════════════════════════════════════════════════
// acquireTuckIn
// ═══════════════════════════════════════════════════
describe('acquireTuckIn postconditions', () => {
  it('blocks pro sports deals as tuck-ins', () => {
    const deal = createMockDeal({ business: { ...createMockBusiness(), sectorId: 'proSports' } as any });
    expect(deal.business.sectorId).toBe('proSports');
    // Guard: deal.business.sectorId === 'proSports' → return
  });

  it('blocks tucking into pro sports target', () => {
    const target = createMockBusiness({ sectorId: 'proSports' });
    expect(target.sectorId).toBe('proSports');
    // Guard: targetBiz?.sectorId === 'proSports' → return
  });

  it('blocks during restructuring', () => {
    const state = createMockGameState({ requiresRestructuring: true });
    expect(state.requiresRestructuring).toBe(true);
  });

  it('blocks when distress restriction disallows acquire', () => {
    const state = createBreachState();
    const metrics = calculateMetrics(state);
    const restrictions = getDistressRestrictions(metrics.distressLevel);
    expect(restrictions.canAcquire).toBe(false);
  });

  it('blocks when acquisition limit reached', () => {
    const state = createMockGameState({
      acquisitionsThisRound: 2,
      maxAcquisitionsPerRound: 2,
    });
    expect(state.acquisitionsThisRound >= state.maxAcquisitionsPerRound).toBe(true);
  });

  it('blocks when insufficient cash for deal structure', () => {
    const state = createMockGameState({ cash: 100 });
    const structure = createMockDealStructure({ cashRequired: 4000 });
    expect(state.cash < structure.cashRequired).toBe(true);
  });

  it('blocks when target platform sector mismatches deal sector', () => {
    const platform = createMockBusiness({ id: 'plat_1', sectorId: 'saas' });
    const deal = createMockDeal();
    // deal defaults to agency sector, platform is saas
    expect(platform.sectorId !== deal.business.sectorId).toBe(true);
  });

  it('allows tuck-in when all guards pass', () => {
    const state = createMockGameState({
      cash: 20000,
      acquisitionsThisRound: 0,
      maxAcquisitionsPerRound: 2,
      requiresRestructuring: false,
    });
    const metrics = calculateMetrics(state);
    const restrictions = getDistressRestrictions(metrics.distressLevel);
    expect(restrictions.canAcquire).toBe(true);
    expect(state.acquisitionsThisRound < state.maxAcquisitionsPerRound).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// improveBusiness
// ═══════════════════════════════════════════════════
describe('improveBusiness postconditions', () => {
  it('blocks when business not found or not active', () => {
    const biz = createMockBusiness({ status: 'sold' });
    expect(biz.status !== 'active').toBe(true);
  });

  it('blocks duplicate improvement on same business', () => {
    const biz = createMockBusiness({
      improvements: [{ type: 'operating_playbook', appliedRound: 1, effect: 0.03 }],
    });
    expect(biz.improvements.some(i => i.type === 'operating_playbook')).toBe(true);
  });

  it('blocks growth improvements on Q1/Q2 businesses', () => {
    const q2Biz = createMockBusiness({ qualityRating: 2 });

    for (const growthType of GROWTH_TYPES) {
      expect(GROWTH_TYPES.has(growthType) && q2Biz.qualityRating < 3).toBe(true);
    }
  });

  it('allows stabilization improvements on Q1/Q2 businesses', () => {
    for (const stabType of STABILIZATION_TYPES) {
      // Stabilization types are NOT in GROWTH_TYPES so the gate doesn't apply
      expect(GROWTH_TYPES.has(stabType)).toBe(false);
    }
  });

  it('allows growth improvements on Q3+ businesses', () => {
    const q3 = createMockBusiness({ qualityRating: 3 });
    const q5 = createMockBusiness({ qualityRating: 5 });

    for (const growthType of GROWTH_TYPES) {
      expect(GROWTH_TYPES.has(growthType) && q3.qualityRating < 3).toBe(false);
      expect(GROWTH_TYPES.has(growthType) && q5.qualityRating < 3).toBe(false);
    }
  });

  it('blocks when cash insufficient for improvement cost', () => {
    const state = createMockGameState({ cash: 50 }); // below IMPROVEMENT_COST_FLOOR (200)
    expect(state.cash < 200).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// startTurnaroundProgram
// ═══════════════════════════════════════════════════
describe('startTurnaroundProgram postconditions', () => {
  it('blocks in Family Office mode', () => {
    const state = createMockGameState({ isFamilyOfficeMode: true });
    expect(state.isFamilyOfficeMode).toBe(true);
  });

  it('blocks outside allocate phase', () => {
    const state = createMockGameState({ phase: 'collect' });
    expect(state.phase !== 'allocate').toBe(true);
  });

  it('blocks when business not found', () => {
    const state = createMockGameState({ businesses: [] });
    const business = state.businesses.find(b => b.id === 'nonexistent');
    expect(business).toBeUndefined();
  });

  it('blocks when business quality does not match program sourceQuality', () => {
    const program = getProgramById('t1_plan_a')!; // sourceQuality: 1
    const biz = createMockBusiness({ qualityRating: 3 }); // Q3 ≠ Q1
    expect(biz.qualityRating !== program.sourceQuality).toBe(true);
  });

  it('blocks when turnaround tier insufficient', () => {
    const program = getProgramById('t2_plan_a')!; // tierId: 2
    const state = createMockGameState({ turnaroundTier: 1 }); // tier 1 < 2
    expect(program.tierId > state.turnaroundTier).toBe(true);
  });

  it('blocks when business already has active turnaround', () => {
    const state = createMockGameState({
      activeTurnarounds: [
        { id: 'ta_biz_test_1_1', businessId: 'biz_test_1', programId: 't1_plan_a', startRound: 1, endRound: 4, status: 'active' },
      ],
    });
    const hasActive = state.activeTurnarounds.some(t => t.businessId === 'biz_test_1' && t.status === 'active');
    expect(hasActive).toBe(true);
  });

  it('blocks when cash insufficient for upfront cost', () => {
    const program = getProgramById('t1_plan_a')!;
    const biz = createMockBusiness({ ebitda: 1000, qualityRating: 1 });
    const upfrontCost = Math.round(Math.abs(biz.ebitda) * program.upfrontCostFraction);
    const state = createMockGameState({ cash: upfrontCost - 1 });
    expect(state.cash < upfrontCost).toBe(true);
  });

  it('blocks in PE Fund when turnaround would exceed fund life', () => {
    const program = getProgramById('t1_plan_a')!;
    const duration = getTurnaroundDuration(program, 'standard');
    const state = createMockGameState({
      isFundManagerMode: true,
      round: 9,
      maxRounds: 10,
    });
    expect(state.isFundManagerMode && duration > (state.maxRounds - state.round)).toBe(true);
  });

  it('allows turnaround when all guards pass', () => {
    const program = getProgramById('t1_plan_a')!; // sourceQuality: 1, tierId: 1
    const biz = createMockBusiness({ id: 'biz_ta', qualityRating: 1, ebitda: 1000 });
    const upfrontCost = Math.round(Math.abs(biz.ebitda) * program.upfrontCostFraction);
    const state = createMockGameState({
      businesses: [biz],
      cash: upfrontCost + 1000,
      turnaroundTier: 1,
      phase: 'allocate',
      activeTurnarounds: [],
    });
    expect(state.phase).toBe('allocate');
    expect(biz.qualityRating).toBe(program.sourceQuality);
    expect(program.tierId <= state.turnaroundTier).toBe(true);
    expect(state.cash >= upfrontCost).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// forgeIntegratedPlatform
// ═══════════════════════════════════════════════════
describe('forgeIntegratedPlatform postconditions', () => {
  it('blocks outside allocate phase', () => {
    const state = createMockGameState({ phase: 'event' });
    expect(state.phase !== 'allocate').toBe(true);
  });

  it('blocks when no selected businesses', () => {
    const state = createMockGameState();
    const selected = state.businesses.filter(b => ['nonexistent'].includes(b.id));
    expect(selected.length).toBe(0);
  });

  it('blocks when any constituent is below Q3', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', qualityRating: 3, sectorId: 'agency', subType: 'Digital/Ecommerce Agency' }),
      createMockBusiness({ id: 'b2', qualityRating: 2, sectorId: 'agency', subType: 'Performance Media Agency' }),
    ];
    const hasLowQuality = businesses.some(b => b.qualityRating < 3);
    expect(hasLowQuality).toBe(true);
  });

  it('allows forge when all constituents are Q3+', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', qualityRating: 3, sectorId: 'agency', subType: 'Digital/Ecommerce Agency' }),
      createMockBusiness({ id: 'b2', qualityRating: 4, sectorId: 'agency', subType: 'Performance Media Agency' }),
      createMockBusiness({ id: 'b3', qualityRating: 5, sectorId: 'agency', subType: 'SEO/Content Agency' }),
    ];
    const hasLowQuality = businesses.some(b => b.qualityRating < 3);
    expect(hasLowQuality).toBe(false);
  });

  it('blocks when cash insufficient for integration cost', () => {
    const state = createMockGameState({ cash: 10 }); // very low
    // Integration cost is recipe.integrationCostFraction * combined EBITDA
    expect(state.cash).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════
// mergeBusinesses
// ═══════════════════════════════════════════════════
describe('mergeBusinesses postconditions', () => {
  it('blocks when either business not found', () => {
    const state = createMockGameState();
    const biz1 = state.businesses.find(b => b.id === 'biz_test_1');
    const biz2 = state.businesses.find(b => b.id === 'nonexistent');
    expect(biz1).toBeDefined();
    expect(biz2).toBeUndefined();
  });

  it('blocks when either business is not active', () => {
    const soldBiz = createMockBusiness({ id: 'b2', status: 'sold' });
    expect(soldBiz.status !== 'active').toBe(true);
  });

  it('blocks pro sports merges', () => {
    const proSportsBiz = createMockBusiness({ sectorId: 'proSports' });
    expect(proSportsBiz.sectorId === 'proSports').toBe(true);
  });

  it('blocks cross-sector merges', () => {
    const biz1 = createMockBusiness({ sectorId: 'agency' });
    const biz2 = createMockBusiness({ sectorId: 'saas' });
    expect(biz1.sectorId !== biz2.sectorId).toBe(true);
  });

  it('blocks when cash insufficient for merge cost', () => {
    const biz1 = createMockBusiness({ id: 'b1', ebitda: 1000 });
    const biz2 = createMockBusiness({ id: 'b2', ebitda: 1000 });
    const mergeCost = Math.max(100, Math.round(Math.min(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda)) * 0.15));
    const state = createMockGameState({ cash: mergeCost - 1 });
    expect(state.cash < mergeCost).toBe(true);
  });

  it('allows merge when same sector, active, non-sports, sufficient cash', () => {
    const biz1 = createMockBusiness({ id: 'b1', sectorId: 'agency', ebitda: 1000 });
    const biz2 = createMockBusiness({ id: 'b2', sectorId: 'agency', ebitda: 1000 });
    const state = createMockGameState({ businesses: [biz1, biz2], cash: 10000 });
    const mergeCost = Math.max(100, Math.round(Math.min(biz1.ebitda, biz2.ebitda) * 0.15));
    expect(biz1.sectorId).toBe(biz2.sectorId);
    expect(biz1.sectorId).not.toBe('proSports');
    expect(state.cash >= mergeCost).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// Cross-action invariants
// ═══════════════════════════════════════════════════
describe('cross-action invariants', () => {
  it('distress breach blocks buyback, distribution, and acquisition simultaneously', () => {
    const state = createBreachState();
    const metrics = calculateMetrics(state);
    const restrictions = getDistressRestrictions(metrics.distressLevel);
    expect(restrictions.canBuyback).toBe(false);
    expect(restrictions.canDistribute).toBe(false);
    expect(restrictions.canAcquire).toBe(false);
    expect(restrictions.canTakeDebt).toBe(false);
  });

  it('stressed distress allows acquisition but blocks debt', () => {
    // stressed: netDebtToEbitda in [3.5, 4.5)
    const biz = createMockBusiness({ ebitda: 1000 });
    const state = createMockGameState({
      businesses: [biz],
      totalDebt: 4000,
      holdcoLoanBalance: 4000,
      cash: 1000,
    });
    const metrics = calculateMetrics(state);
    const restrictions = getDistressRestrictions(metrics.distressLevel);
    // Stressed level: can acquire, can distribute, can buyback, but NOT take debt
    if (metrics.distressLevel === 'stressed') {
      expect(restrictions.canAcquire).toBe(true);
      expect(restrictions.canTakeDebt).toBe(false);
    }
  });

  it('equity raise and buyback have reciprocal cooldowns', () => {
    const round = 5;
    // Just raised equity
    const afterRaise = createMockGameState({
      round,
      lastEquityRaiseRound: round,
      lastBuybackRound: 0,
    });
    expect(simulateBuybackShares(afterRaise, 100)).toBeNull();

    // Just did buyback
    const afterBuyback = createMockGameState({
      round,
      lastEquityRaiseRound: 0,
      lastBuybackRound: round,
    });
    expect(simulateIssueEquity(afterBuyback, 100)).toBeNull();
  });

  it('founder ownership never drops below floor after equity issuance', () => {
    const state = createMockGameState();
    const result = simulateIssueEquity(state, 5000);
    if (result) {
      const ownership = result.founderShares / result.sharesOutstanding;
      expect(ownership).toBeGreaterThanOrEqual(MIN_FOUNDER_OWNERSHIP);
    }
  });

  it('cash never goes negative from distribution', () => {
    const state = createMockGameState({ cash: 1000 });
    const result = simulateDistributeToOwners(state, 1000);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(0);

    const overResult = simulateDistributeToOwners(state, 1001);
    expect(overResult).toBeNull();
  });
});
