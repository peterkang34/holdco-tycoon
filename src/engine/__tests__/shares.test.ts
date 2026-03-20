/**
 * Share mechanics tests — verifying that share counts properly reflect
 * all transactions: issue equity, buyback, IPO, share-funded deals,
 * equity demand events, and emergency raises.
 */
import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../simulation';
import { executeIPO, calculateShareFundedTerms, calculateStockPrice } from '../ipo';
import { createMockBusiness, createMockGameState } from './helpers';
import { GameState, IPOState } from '../types';
import {
  EQUITY_DILUTION_STEP,
  EQUITY_DILUTION_FLOOR,
  EQUITY_BUYBACK_COOLDOWN,
  MIN_FOUNDER_OWNERSHIP,
  MIN_PUBLIC_FOUNDER_OWNERSHIP,
} from '../../data/gameConfig';

// ── Helpers ──

/** Simulate issueEquity logic from the store (pure function version) */
function simulateIssueEquity(state: GameState, amount: number): GameState | null {
  if (amount <= 0) return null;
  if (state.requiresRestructuring) return null;
  if (state.lastBuybackRound > 0 && state.round - state.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN) return null;

  const isPublic = !!state.ipoState?.isPublic;
  const metrics = calculateMetrics(state);
  if (metrics.intrinsicValuePerShare <= 0) return null;

  let effectivePrice: number;
  let discount: number;
  if (isPublic) {
    const stockPrice = calculateStockPrice(state);
    if (stockPrice <= 0) return null;
    effectivePrice = stockPrice;
    discount = 0;
  } else {
    discount = 1 - Math.max(1 - EQUITY_DILUTION_STEP * state.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
    effectivePrice = metrics.intrinsicValuePerShare * (1 - discount);
  }

  const newShares = Math.round((amount / effectivePrice) * 1000) / 1000;
  if (newShares <= 0) return null;

  const newTotalShares = state.sharesOutstanding + newShares;
  const newFounderOwnership = state.founderShares / newTotalShares;

  const effectiveFloor = isPublic ? MIN_PUBLIC_FOUNDER_OWNERSHIP : MIN_FOUNDER_OWNERSHIP;
  if (newFounderOwnership < effectiveFloor) return null;

  const result: GameState = {
    ...state,
    cash: state.cash + amount,
    sharesOutstanding: newTotalShares,
    equityRaisesUsed: state.equityRaisesUsed + 1,
    lastEquityRaiseRound: state.round,
  };

  return result;
}

/** Simulate buybackShares logic from the store (pure function version) */
function simulateBuyback(state: GameState, amount: number): GameState | null {
  if (state.cash < amount) return null;
  const activeCount = state.businesses.filter(b => b.status === 'active').length;
  if (activeCount === 0) return null;
  if (state.lastEquityRaiseRound > 0 && state.round - state.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN) return null;

  const isPublic = !!state.ipoState?.isPublic;
  const metrics = calculateMetrics(state);
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

/** Simulate emergency equity raise */
function simulateEmergencyRaise(state: GameState, amount: number): GameState | null {
  if (amount <= 0) return null;
  const metrics = calculateMetrics(state);
  if (metrics.intrinsicValuePerShare <= 0) return null;

  const emergencyPrice = metrics.intrinsicValuePerShare * 0.5;
  const newShares = Math.round((amount / emergencyPrice) * 1000) / 1000;

  return {
    ...state,
    cash: state.cash + amount,
    sharesOutstanding: state.sharesOutstanding + newShares,
    equityRaisesUsed: state.equityRaisesUsed + 1,
    lastEquityRaiseRound: state.round,
  };
}

/** Simulate granting equity demand event (matches store fix: syncs IPO state) */
function simulateGrantEquityDemand(state: GameState, dilutionShares: number): GameState {
  const newTotalShares = state.sharesOutstanding + dilutionShares;
  const result: GameState = {
    ...state,
    sharesOutstanding: newTotalShares,
  };
  // Sync IPO state if public (this was the bug — must keep ipoState.sharesOutstanding in sync)
  if (result.ipoState?.isPublic) {
    result.ipoState = {
      ...result.ipoState,
      sharesOutstanding: newTotalShares,
    };
    result.ipoState.stockPrice = calculateStockPrice(result);
  }
  return result;
}

// ── Tests ──

describe('Share mechanics — initial state', () => {
  it('Easy mode starts with correct shares (80% ownership)', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
    });
    expect(state.sharesOutstanding).toBe(1000);
    expect(state.founderShares).toBe(800);
    expect(state.founderShares / state.sharesOutstanding).toBeCloseTo(0.80);
  });

  it('Normal mode starts with correct shares (100% ownership)', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 1000,
    });
    expect(state.sharesOutstanding).toBe(1000);
    expect(state.founderShares).toBe(1000);
    expect(state.founderShares / state.sharesOutstanding).toBeCloseTo(1.0);
  });
});

describe('Share mechanics — issue equity', () => {
  it('issuing equity increases sharesOutstanding', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateIssueEquity(state, 5000);
    expect(result).not.toBeNull();
    expect(result!.sharesOutstanding).toBeGreaterThan(1000);
  });

  it('issuing equity does NOT change founderShares', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateIssueEquity(state, 5000);
    expect(result).not.toBeNull();
    expect(result!.founderShares).toBe(800);
  });

  it('issuing equity decreases ownership percentage', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const ownershipBefore = state.founderShares / state.sharesOutstanding;
    const result = simulateIssueEquity(state, 5000);
    expect(result).not.toBeNull();
    const ownershipAfter = result!.founderShares / result!.sharesOutstanding;
    expect(ownershipAfter).toBeLessThan(ownershipBefore);
  });

  it('issuing equity adds cash', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateIssueEquity(state, 5000);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(21000);
  });

  it('escalating discount applies to subsequent raises', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
      equityRaisesUsed: 0,
    });

    // First raise — no discount
    const after1 = simulateIssueEquity(state, 2000)!;
    const shares1 = after1.sharesOutstanding - 1000;

    // Simulate second raise from after1 state (advance round to avoid cooldown)
    const state2 = { ...after1, round: 6, lastBuybackRound: 0 };
    const after2 = simulateIssueEquity(state2, 2000)!;
    const shares2 = after2.sharesOutstanding - state2.sharesOutstanding;

    // Second raise should issue MORE shares (worse price for founder due to discount)
    expect(shares2).toBeGreaterThan(shares1);
  });

  it('blocks equity raise during cooldown', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
      lastBuybackRound: 2, // Buyback last round — within cooldown
    });
    const result = simulateIssueEquity(state, 5000);
    expect(result).toBeNull();
  });

  it('blocks equity raise that would breach 51% ownership floor', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    // Try raising enormous amount that would push ownership below 51%
    const result = simulateIssueEquity(state, 500000);
    expect(result).toBeNull();
  });
});

describe('Share mechanics — buyback', () => {
  it('buyback decreases sharesOutstanding', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateBuyback(state, 2000);
    expect(result).not.toBeNull();
    expect(result!.sharesOutstanding).toBeLessThan(1200);
  });

  it('buyback does NOT change founderShares', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateBuyback(state, 2000);
    expect(result).not.toBeNull();
    expect(result!.founderShares).toBe(800);
  });

  it('buyback increases ownership percentage', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const ownershipBefore = state.founderShares / state.sharesOutstanding;
    const result = simulateBuyback(state, 2000);
    expect(result).not.toBeNull();
    const ownershipAfter = result!.founderShares / result!.sharesOutstanding;
    expect(ownershipAfter).toBeGreaterThan(ownershipBefore);
  });

  it('buyback removes cash', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });
    const result = simulateBuyback(state, 2000);
    expect(result).not.toBeNull();
    expect(result!.cash).toBe(14000);
  });

  it('blocks buyback when no outside shares', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 1000, // 100% ownership
      cash: 16000,
      round: 3,
    });
    const result = simulateBuyback(state, 2000);
    expect(result).toBeNull();
  });

  it('caps buyback at available outside shares', () => {
    const state = createMockGameState({
      sharesOutstanding: 1010,
      founderShares: 1000,
      cash: 500000, // Huge cash
      round: 3,
    });
    // Even with huge amount, can only buy 10 outside shares
    const result = simulateBuyback(state, 500000);
    expect(result).not.toBeNull();
    // Should snap to exactly founderShares when buying all outside
    expect(result!.sharesOutstanding).toBe(1000);
  });

  it('blocks buyback during cooldown', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
      lastEquityRaiseRound: 2, // Raise last round — within cooldown
    });
    const result = simulateBuyback(state, 2000);
    expect(result).toBeNull();
  });

  it('blocks buyback with no active businesses', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
      businesses: [], // No businesses
    });
    const result = simulateBuyback(state, 2000);
    expect(result).toBeNull();
  });
});

describe('Share mechanics — issue then buyback round-trip', () => {
  it('issue equity then buyback restores ownership closer to original', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 1,
    });
    const originalOwnership = state.founderShares / state.sharesOutstanding;

    // Issue equity
    const afterIssue = simulateIssueEquity(state, 3000)!;
    expect(afterIssue).not.toBeNull();
    const issuedShares = afterIssue.sharesOutstanding - 1000;
    expect(issuedShares).toBeGreaterThan(0);
    const ownershipAfterIssue = afterIssue.founderShares / afterIssue.sharesOutstanding;
    expect(ownershipAfterIssue).toBeLessThan(originalOwnership);

    // Advance enough rounds for cooldown
    const readyForBuyback = { ...afterIssue, round: 5, lastEquityRaiseRound: 1 };

    // Buyback with same cash amount
    const afterBuyback = simulateBuyback(readyForBuyback, 3000);
    expect(afterBuyback).not.toBeNull();
    const ownershipAfterBuyback = afterBuyback!.founderShares / afterBuyback!.sharesOutstanding;

    // After buyback, ownership should be higher than after issue
    expect(ownershipAfterBuyback).toBeGreaterThan(ownershipAfterIssue);
    // But may not fully return to original due to price differences
  });

  it('multiple issues compound dilution correctly', () => {
    let state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 1,
    });

    // Issue 3 times with advancing rounds for cooldown
    for (let i = 0; i < 3; i++) {
      const result = simulateIssueEquity(state, 1000);
      if (!result) break;
      state = { ...result, round: result.round + EQUITY_BUYBACK_COOLDOWN + 1, lastBuybackRound: 0 };
    }

    // Shares should have increased significantly
    expect(state.sharesOutstanding).toBeGreaterThan(1000);
    // Founder shares unchanged
    expect(state.founderShares).toBe(800);
    // Ownership decreased
    expect(state.founderShares / state.sharesOutstanding).toBeLessThan(0.80);
    // Should have used 3 equity raises
    expect(state.equityRaisesUsed).toBe(3);
  });
});

describe('Share mechanics — IPO', () => {
  it('IPO increases sharesOutstanding by ~25% (20% dilution)', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 16,
      duration: 'standard',
      maxRounds: 20,
      businesses: [
        createMockBusiness({ ebitda: 10000, qualityRating: 4, isPlatform: true }),
        createMockBusiness({ id: 'biz_2', ebitda: 8000, qualityRating: 4 }),
        createMockBusiness({ id: 'biz_3', ebitda: 6000, qualityRating: 3 }),
      ],
    });

    const result = executeIPO(state);
    expect(result.ipoState.isPublic).toBe(true);
    expect(result.ipoState.sharesOutstanding).toBeGreaterThan(1000);
    expect(result.newSharesIssued).toBeGreaterThan(0);
    // 20% of company sold → new shares = current * 0.20 / 0.80 = current * 0.25
    expect(result.ipoState.sharesOutstanding).toBe(1000 + result.newSharesIssued);
  });

  it('IPO state sharesOutstanding matches math', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
    });
    const result = executeIPO(state);
    // newShares = Math.round(1000 * 0.20 / 0.80) = 250
    expect(result.newSharesIssued).toBe(250);
    expect(result.ipoState.sharesOutstanding).toBe(1250);
  });
});

describe('Share mechanics — share-funded acquisition terms', () => {
  it('calculates correct shares for deal', () => {
    const ipoState: IPOState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1250,
      preIPOShares: 1000,
      marketSentiment: 0.05,
      earningsExpectations: 25000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };

    const terms = calculateShareFundedTerms(5000, ipoState);
    // 5000 / 100 = 50 shares
    expect(terms.sharesToIssue).toBe(50);
    expect(terms.newTotalShares).toBe(1300);
    expect(terms.dilutionPct).toBeCloseTo(50 / 1300);
  });

  it('handles zero stock price gracefully', () => {
    const ipoState: IPOState = {
      isPublic: true,
      stockPrice: 0,
      sharesOutstanding: 1250,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: 0,
      ipoRound: 16,
      initialStockPrice: 0,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };

    const terms = calculateShareFundedTerms(5000, ipoState);
    expect(terms.sharesToIssue).toBe(0);
    expect(terms.newTotalShares).toBe(1250);
    expect(terms.dilutionPct).toBe(0);
  });
});

describe('Share mechanics — equity demand event', () => {
  it('granting equity demand increases sharesOutstanding', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
    });
    const result = simulateGrantEquityDemand(state, 25);
    expect(result.sharesOutstanding).toBe(1025);
    expect(result.founderShares).toBe(800); // unchanged
  });

  it('granting equity demand dilutes ownership', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
    });
    const result = simulateGrantEquityDemand(state, 25);
    const ownership = result.founderShares / result.sharesOutstanding;
    expect(ownership).toBeCloseTo(800 / 1025);
    expect(ownership).toBeLessThan(0.80);
  });
});

describe('Share mechanics — emergency equity raise', () => {
  it('emergency raise issues shares at 50% of intrinsic value', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
      requiresRestructuring: true,
    });
    const metrics = calculateMetrics(state);
    const intrinsicPricePerShare = metrics.intrinsicValuePerShare;
    const emergencyPrice = intrinsicPricePerShare * 0.5;

    const result = simulateEmergencyRaise(state, 2000);
    expect(result).not.toBeNull();

    const expectedShares = Math.round((2000 / emergencyPrice) * 1000) / 1000;
    expect(result!.sharesOutstanding).toBeCloseTo(1000 + expectedShares, 2);
  });

  it('emergency raise doubles dilution vs normal raise', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });

    const normalResult = simulateIssueEquity(state, 2000);
    const emergencyResult = simulateEmergencyRaise(state, 2000);

    expect(normalResult).not.toBeNull();
    expect(emergencyResult).not.toBeNull();

    const normalNewShares = normalResult!.sharesOutstanding - 1000;
    const emergencyNewShares = emergencyResult!.sharesOutstanding - 1000;

    // Emergency at 50% price → ~2x the shares
    expect(emergencyNewShares).toBeCloseTo(normalNewShares * 2, 0);
  });
});

describe('Share mechanics — calculateMetrics reflects share changes', () => {
  it('FCF per share decreases after equity issuance (more shares)', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });

    const metricsBefore = calculateMetrics(state);
    const afterIssue = simulateIssueEquity(state, 3000);
    expect(afterIssue).not.toBeNull();
    const metricsAfter = calculateMetrics(afterIssue!);

    // More shares → lower FCF/share (assuming same FCF)
    // Cash goes up but EBITDA unchanged, so FCF similar
    expect(metricsAfter.sharesOutstanding).toBeGreaterThan(metricsBefore.sharesOutstanding);
  });

  it('intrinsic value per share changes after buyback', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 16000,
      round: 3,
    });

    const metricsBefore = calculateMetrics(state);
    const afterBuyback = simulateBuyback(state, 2000);
    expect(afterBuyback).not.toBeNull();
    const metricsAfter = calculateMetrics(afterBuyback!);

    // Fewer shares → metrics.sharesOutstanding decreased
    expect(metricsAfter.sharesOutstanding).toBeLessThan(metricsBefore.sharesOutstanding);
  });

  it('metrics.sharesOutstanding matches state.sharesOutstanding', () => {
    const state = createMockGameState({
      sharesOutstanding: 1234,
      founderShares: 800,
    });
    const metrics = calculateMetrics(state);
    expect(metrics.sharesOutstanding).toBe(1234);
  });
});

describe('Share mechanics — complex multi-operation scenario', () => {
  it('issue → advance rounds → buyback → issue → verify all counts', () => {
    // Start: Easy mode, 80% ownership
    let state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 30000,
      round: 1,
    });

    // Step 1: Issue equity raising $5M
    const step1 = simulateIssueEquity(state, 5000)!;
    expect(step1).not.toBeNull();
    expect(step1.sharesOutstanding).toBeGreaterThan(1000);
    expect(step1.founderShares).toBe(800);
    expect(step1.cash).toBe(35000);
    const step1Shares = step1.sharesOutstanding;

    // Step 2: Advance rounds past cooldown
    state = { ...step1, round: 5, lastEquityRaiseRound: 1, lastBuybackRound: 0 };

    // Step 3: Buyback $3M
    const step3 = simulateBuyback(state, 3000)!;
    expect(step3).not.toBeNull();
    expect(step3.sharesOutstanding).toBeLessThan(step1Shares);
    expect(step3.founderShares).toBe(800);
    expect(step3.cash).toBe(state.cash - 3000);
    const step3Shares = step3.sharesOutstanding;

    // Step 4: Advance rounds past cooldown
    state = { ...step3, round: 8, lastBuybackRound: 5, lastEquityRaiseRound: 1 };

    // Step 5: Issue equity again
    const step5 = simulateIssueEquity(state, 2000)!;
    expect(step5).not.toBeNull();
    expect(step5.sharesOutstanding).toBeGreaterThan(step3Shares);
    expect(step5.founderShares).toBe(800);
    expect(step5.equityRaisesUsed).toBe(2);

    // Verify ownership is monotonically tracking
    const finalOwnership = step5.founderShares / step5.sharesOutstanding;
    expect(finalOwnership).toBeLessThan(0.80); // Diluted from original 80%
    expect(finalOwnership).toBeGreaterThan(MIN_FOUNDER_OWNERSHIP); // Still above floor
  });

  it('equity demand + buyback restores ownership', () => {
    let state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      cash: 30000,
      round: 5,
    });
    const originalOwnership = 0.80;

    // Grant equity demand: 25 shares
    state = simulateGrantEquityDemand(state, 25);
    expect(state.sharesOutstanding).toBe(1025);
    const dilutedOwnership = state.founderShares / state.sharesOutstanding;
    expect(dilutedOwnership).toBeLessThan(originalOwnership);

    // Buyback to restore ownership
    const afterBuyback = simulateBuyback(state, 5000);
    expect(afterBuyback).not.toBeNull();
    const restoredOwnership = afterBuyback!.founderShares / afterBuyback!.sharesOutstanding;
    // Should be higher than after equity demand
    expect(restoredOwnership).toBeGreaterThan(dilutedOwnership);
  });
});

describe('Share mechanics — invariants', () => {
  it('founderShares never exceeds sharesOutstanding', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
    });

    // After issue
    const afterIssue = simulateIssueEquity(state, 5000)!;
    expect(afterIssue.founderShares).toBeLessThanOrEqual(afterIssue.sharesOutstanding);

    // After buyback
    const forBuyback = { ...afterIssue, round: 5, lastEquityRaiseRound: 1, lastBuybackRound: 0 };
    const afterBuyback = simulateBuyback(forBuyback, 2000)!;
    expect(afterBuyback.founderShares).toBeLessThanOrEqual(afterBuyback.sharesOutstanding);
  });

  it('sharesOutstanding always positive', () => {
    const state = createMockGameState({
      sharesOutstanding: 1010,
      founderShares: 1000,
      cash: 500000,
      round: 3,
    });
    // Even buying all outside shares, total >= founderShares
    const afterBuyback = simulateBuyback(state, 500000)!;
    expect(afterBuyback.sharesOutstanding).toBeGreaterThan(0);
    expect(afterBuyback.sharesOutstanding).toBeGreaterThanOrEqual(afterBuyback.founderShares);
  });

  it('outside shares are always non-negative', () => {
    const state = createMockGameState({
      sharesOutstanding: 1010,
      founderShares: 1000,
      cash: 500000,
      round: 3,
    });
    const afterBuyback = simulateBuyback(state, 500000)!;
    expect(afterBuyback.sharesOutstanding - afterBuyback.founderShares).toBeGreaterThanOrEqual(0);
  });
});

describe('Share mechanics — IPO state sync (Bug fix: equity demand desync)', () => {
  it('equity demand on public company syncs ipoState.sharesOutstanding', () => {
    const ipoState: IPOState = {
      isPublic: true,
      stockPrice: 50,
      sharesOutstanding: 1250,
      preIPOShares: 1000,
      marketSentiment: 0.05,
      earningsExpectations: 25000,
      ipoRound: 16,
      initialStockPrice: 50,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };

    const state = createMockGameState({
      sharesOutstanding: 1250,
      founderShares: 800,
      cash: 50000,
      round: 18,
      ipoState,
      duration: 'standard',
      maxRounds: 20,
      businesses: [
        createMockBusiness({ ebitda: 10000, qualityRating: 4, isPlatform: true }),
        createMockBusiness({ id: 'biz_2', ebitda: 8000, qualityRating: 4 }),
        createMockBusiness({ id: 'biz_3', ebitda: 6000, qualityRating: 3 }),
      ],
    });

    // Verify pre-condition: both in sync
    expect(state.sharesOutstanding).toBe(state.ipoState!.sharesOutstanding);

    // Grant equity demand
    const afterGrant = simulateGrantEquityDemand(state, 25);

    // Both should be updated
    expect(afterGrant.sharesOutstanding).toBe(1275);
    expect(afterGrant.ipoState!.sharesOutstanding).toBe(1275);
    // Key invariant: state-level and IPO-level sharesOutstanding must match
    expect(afterGrant.sharesOutstanding).toBe(afterGrant.ipoState!.sharesOutstanding);
  });

  it('equity demand on private company does not create spurious ipoState', () => {
    const state = createMockGameState({
      sharesOutstanding: 1000,
      founderShares: 800,
      ipoState: null,
    });

    const afterGrant = simulateGrantEquityDemand(state, 25);
    expect(afterGrant.sharesOutstanding).toBe(1025);
    expect(afterGrant.ipoState).toBeNull();
  });

  it('stock price recalculates correctly after equity demand sync', () => {
    const ipoState: IPOState = {
      isPublic: true,
      stockPrice: 50,
      sharesOutstanding: 1250,
      preIPOShares: 1000,
      marketSentiment: 0.05,
      earningsExpectations: 25000,
      ipoRound: 16,
      initialStockPrice: 50,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };

    const state = createMockGameState({
      sharesOutstanding: 1250,
      founderShares: 800,
      cash: 50000,
      round: 18,
      ipoState,
      duration: 'standard',
      maxRounds: 20,
      businesses: [
        createMockBusiness({ ebitda: 10000, qualityRating: 4 }),
        createMockBusiness({ id: 'biz_2', ebitda: 8000, qualityRating: 4 }),
      ],
    });

    const priceBefore = calculateStockPrice(state);
    const afterGrant = simulateGrantEquityDemand(state, 25);
    const priceAfter = calculateStockPrice(afterGrant);

    // More shares outstanding → lower stock price (same equity value / more shares)
    expect(priceAfter).toBeLessThan(priceBefore);
  });

  it('IPO → equity demand → share-funded deal: all counts stay consistent', () => {
    // Start with post-IPO state
    const ipoState: IPOState = {
      isPublic: true,
      stockPrice: 40,
      sharesOutstanding: 1250,
      preIPOShares: 1000,
      marketSentiment: 0.05,
      earningsExpectations: 25000,
      ipoRound: 16,
      initialStockPrice: 40,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };

    const state = createMockGameState({
      sharesOutstanding: 1250,
      founderShares: 800,
      cash: 50000,
      round: 18,
      ipoState,
      duration: 'standard',
      maxRounds: 20,
      businesses: [
        createMockBusiness({ ebitda: 10000, qualityRating: 4 }),
      ],
    });

    // Step 1: equity demand grants 30 shares
    const afterGrant = simulateGrantEquityDemand(state, 30);
    expect(afterGrant.sharesOutstanding).toBe(1280);
    expect(afterGrant.ipoState!.sharesOutstanding).toBe(1280);

    // Step 2: share-funded acquisition
    const terms = calculateShareFundedTerms(2000, afterGrant.ipoState!);
    expect(terms.newTotalShares).toBeGreaterThan(1280);

    // The terms should build on top of the updated 1280, not the stale 1250
    expect(terms.newTotalShares).toBe(1280 + terms.sharesToIssue);
  });
});

describe('Share mechanics — buyback guards', () => {
  it('buyback with intrinsic value <= 0 returns null', () => {
    // Create a state where portfolio equity is negative (lots of debt, low EBITDA)
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 100,
      round: 3,
      totalDebt: 500000, // Massive debt
      holdcoLoanBalance: 500000,
      businesses: [createMockBusiness({ ebitda: 100 })],
    });
    const result = simulateBuyback(state, 50);
    // Should be blocked because intrinsic value per share is negative
    expect(result).toBeNull();
  });

  it('buyback blocked when no active businesses (prevents FEV exploit)', () => {
    const state = createMockGameState({
      sharesOutstanding: 1200,
      founderShares: 800,
      cash: 50000,
      round: 3,
      businesses: [createMockBusiness({ status: 'sold' })],
    });
    const result = simulateBuyback(state, 2000);
    expect(result).toBeNull();
  });
});
