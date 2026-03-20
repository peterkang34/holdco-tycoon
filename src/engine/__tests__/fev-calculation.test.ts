/**
 * FEV (Founder Equity Value) Calculation Tests
 *
 * FEV = Enterprise Value × (founderShares / sharesOutstanding)
 * EV  = (Portfolio EBITDA × Blended Exit Multiple) + Cash − All Debt − Rollover Claims
 *
 * FEV is the PRIMARY leaderboard ranking metric. These tests verify:
 * 1. The formula is applied correctly
 * 2. Ownership dilution is reflected
 * 3. Debt and rollover claims reduce FEV
 * 4. Edge cases (0 shares, 0 businesses, bankruptcy) are handled
 * 5. The Value Creation score dimension uses FEV correctly
 */
import { describe, it, expect } from 'vitest';
import {
  calculateEnterpriseValue,
  calculateFounderEquityValue,
  calculateFinalScore,
} from '../scoring';
import { createMockBusiness, createMockGameState } from './helpers';
import { HistoricalMetrics } from '../types';

describe('FEV Formula: EV × Ownership%', () => {
  it('should return EV × (founderShares / sharesOutstanding)', () => {
    const state = createMockGameState({
      founderShares: 600,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(Math.round(ev * 0.6));
  });

  it('should return full EV when ownership is 100%', () => {
    const state = createMockGameState({
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(ev);
  });

  it('should return half EV when ownership is 50%', () => {
    const state = createMockGameState({
      founderShares: 500,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(Math.round(ev * 0.5));
  });

  it('should return 0 when sharesOutstanding is 0', () => {
    const state = createMockGameState({
      founderShares: 0,
      sharesOutstanding: 0,
    });
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(0);
  });

  it('should return 0 when founderShares is 0', () => {
    const state = createMockGameState({
      founderShares: 0,
      sharesOutstanding: 1000,
    });
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(0);
  });
});

describe('FEV: Ownership Dilution Impact', () => {
  it('FEV decreases when shares are issued (dilution)', () => {
    const baseState = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 1000,
    });
    const dilutedState = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 1200, // 200 new shares issued
    });

    const fevBase = calculateFounderEquityValue(baseState);
    const fevDiluted = calculateFounderEquityValue(dilutedState);
    expect(fevDiluted).toBeLessThan(fevBase);
  });

  it('FEV increases when shares are bought back (anti-dilution)', () => {
    const baseState = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 1000,
    });
    const buybackState = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 900, // 100 shares retired
    });

    const fevBase = calculateFounderEquityValue(baseState);
    const fevBuyback = calculateFounderEquityValue(buybackState);
    expect(fevBuyback).toBeGreaterThan(fevBase);
  });
});

describe('FEV: Debt Impact on Enterprise Value', () => {
  it('higher holdco debt reduces EV and therefore FEV', () => {
    const lowDebt = createMockGameState({
      totalDebt: 1000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const highDebt = createMockGameState({
      totalDebt: 10000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevLow = calculateFounderEquityValue(lowDebt);
    const fevHigh = calculateFounderEquityValue(highDebt);
    expect(fevHigh).toBeLessThan(fevLow);
  });

  it('seller note debt reduces EV and therefore FEV', () => {
    const noSellerNote = createMockGameState({
      businesses: [createMockBusiness({ sellerNoteBalance: 0 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const withSellerNote = createMockGameState({
      businesses: [createMockBusiness({ sellerNoteBalance: 2000 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevNoNote = calculateFounderEquityValue(noSellerNote);
    const fevWithNote = calculateFounderEquityValue(withSellerNote);
    expect(fevWithNote).toBeLessThan(fevNoNote);
  });
});

describe('FEV: Rollover Equity Claims', () => {
  it('rollover equity reduces EV by deducting seller share of net value', () => {
    const noRollover = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 2000, rolloverEquityPct: 0 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const withRollover = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 2000, rolloverEquityPct: 0.25 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevNoRollover = calculateFounderEquityValue(noRollover);
    const fevWithRollover = calculateFounderEquityValue(withRollover);
    expect(fevWithRollover).toBeLessThan(fevNoRollover);
  });
});

describe('FEV: Cash Impact', () => {
  it('more cash increases EV and FEV', () => {
    const lowCash = createMockGameState({
      cash: 1000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const highCash = createMockGameState({
      cash: 20000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevLow = calculateFounderEquityValue(lowCash);
    const fevHigh = calculateFounderEquityValue(highCash);
    expect(fevHigh).toBeGreaterThan(fevLow);
  });
});

describe('FEV: Portfolio Size Impact', () => {
  it('more businesses with positive EBITDA increase FEV', () => {
    const oneBiz = createMockGameState({
      businesses: [createMockBusiness({ id: 'b1', ebitda: 1000 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const twoBiz = createMockGameState({
      businesses: [
        createMockBusiness({ id: 'b1', ebitda: 1000 }),
        createMockBusiness({ id: 'b2', ebitda: 1500, sectorId: 'saas' }),
      ],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevOne = calculateFounderEquityValue(oneBiz);
    const fevTwo = calculateFounderEquityValue(twoBiz);
    expect(fevTwo).toBeGreaterThan(fevOne);
  });

  it('FEV is just cash minus debt when no active businesses', () => {
    const state = createMockGameState({
      businesses: [],
      cash: 5000,
      totalDebt: 2000,
      founderShares: 800,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    expect(ev).toBe(3000);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(Math.round(3000 * 0.8));
  });
});

describe('FEV: Quality Premium', () => {
  it('higher quality businesses produce higher FEV', () => {
    const lowQuality = createMockGameState({
      businesses: [createMockBusiness({ qualityRating: 1, ebitda: 2000 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const highQuality = createMockGameState({
      businesses: [createMockBusiness({ qualityRating: 5, ebitda: 2000 })],
      founderShares: 1000,
      sharesOutstanding: 1000,
    });

    const fevLow = calculateFounderEquityValue(lowQuality);
    const fevHigh = calculateFounderEquityValue(highQuality);
    expect(fevHigh).toBeGreaterThan(fevLow);
  });
});

describe('FEV: Edge Cases', () => {
  it('FEV is floored at 0 (never negative)', () => {
    const state = createMockGameState({
      businesses: [],
      cash: 0,
      totalDebt: 50000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(0);
    expect(fev).toBeGreaterThanOrEqual(0);
  });

  it('FEV is deterministic (same input = same output)', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 1500 })],
      cash: 10000,
      totalDebt: 3000,
      founderShares: 750,
      sharesOutstanding: 1000,
    });
    const fev1 = calculateFounderEquityValue(state);
    const fev2 = calculateFounderEquityValue(state);
    expect(fev1).toBe(fev2);
  });

  it('FEV is always a round number (no decimals)', () => {
    const state = createMockGameState({
      founderShares: 333,
      sharesOutstanding: 1000,
    });
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(Math.round(fev));
  });
});

describe('FEV in Value Creation Score Dimension', () => {
  function createScoringState(overrides = {}) {
    const baseHistory: HistoricalMetrics[] = [
      {
        round: 1,
        metrics: {
          cash: 16000,
          totalDebt: 0,
          totalEbitda: 1000,
          totalRevenue: 5000,
          avgEbitdaMargin: 0.20,
          totalFcf: 500,
          fcfPerShare: 0.5,
          portfolioRoic: 0.10,
          roiic: 0.10,
          portfolioMoic: 1.5,
          netDebtToEbitda: 0,
          distressLevel: 'comfortable' as const,
          cashConversion: 0.5,
          interestRate: 0.07,
          sharesOutstanding: 1000,
          intrinsicValuePerShare: 20,
          totalInvestedCapital: 4000,
          totalDistributions: 0,
          totalBuybacks: 0,
          totalExitProceeds: 0,
        },
        fcf: 500,
        nopat: 700,
        investedCapital: 4000,
      },
    ];

    return createMockGameState({
      round: 20,
      metricsHistory: baseHistory,
      ...overrides,
    });
  }

  it('Value Creation uses FEV / initialRaiseAmount ratio', () => {
    // High FEV relative to initial raise = high value creation
    const highFEV = createScoringState({
      cash: 150000, // $150M cash, no debt → EV ~150M + portfolio
      totalDebt: 0,
      initialRaiseAmount: 20000, // $20M raised
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const scoreHigh = calculateFinalScore(highFEV);

    // Low FEV
    const lowFEV = createScoringState({
      cash: 5000,
      totalDebt: 5000,
      initialRaiseAmount: 20000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const scoreLow = calculateFinalScore(lowFEV);

    expect(scoreHigh.valueCreation).toBeGreaterThan(scoreLow.valueCreation);
  });

  it('Value Creation is 0 when FEV < initialRaiseAmount', () => {
    // State with very low FEV (less than initial raise)
    const state = createScoringState({
      businesses: [],
      cash: 5000,
      totalDebt: 10000,
      initialRaiseAmount: 20000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const score = calculateFinalScore(state);
    // EV = max(0, 5000 - 10000) = 0, FEV = 0 which is < 1x initial raise
    expect(score.valueCreation).toBe(0);
  });

  it('Value Creation is capped at 20 points', () => {
    // Extremely high FEV
    const state = createScoringState({
      cash: 500000, // $500M cash
      totalDebt: 0,
      initialRaiseAmount: 5000, // only raised $5M
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBeLessThanOrEqual(20);
  });

  it('Value Creation is 0 when initialRaiseAmount is 0', () => {
    const state = createScoringState({
      initialRaiseAmount: 0,
    });
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBe(0);
  });

  it('diluted ownership reduces Value Creation score (same EV, lower FEV)', () => {
    const fullOwnership = createScoringState({
      cash: 100000,
      totalDebt: 0,
      initialRaiseAmount: 20000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const dilutedOwnership = createScoringState({
      cash: 100000,
      totalDebt: 0,
      initialRaiseAmount: 20000,
      founderShares: 500, // Only 50% ownership
      sharesOutstanding: 1000,
    });

    const scoreFull = calculateFinalScore(fullOwnership);
    const scoreDiluted = calculateFinalScore(dilutedOwnership);

    expect(scoreFull.valueCreation).toBeGreaterThan(scoreDiluted.valueCreation);
  });
});

describe('FEV: 10-Year vs 20-Year Mode Targets', () => {
  function createScoringState10yr(overrides = {}) {
    return createMockGameState({
      round: 10,
      maxRounds: 10,
      duration: 'quick',
      metricsHistory: [{
        round: 1,
        metrics: {
          cash: 5000, totalDebt: 0, totalEbitda: 800, totalRevenue: 4000,
          avgEbitdaMargin: 0.20, totalFcf: 300, fcfPerShare: 0.3,
          portfolioRoic: 0.10, roiic: 0.10, portfolioMoic: 1.5,
          netDebtToEbitda: 0, distressLevel: 'comfortable' as const,
          cashConversion: 0.375, interestRate: 0.07, sharesOutstanding: 1000,
          intrinsicValuePerShare: 5, totalInvestedCapital: 3200,
          totalDistributions: 0, totalBuybacks: 0, totalExitProceeds: 0,
        },
        fcf: 300, nopat: 560, investedCapital: 3200,
      }],
      ...overrides,
    });
  }

  it('10-year mode uses 5x FEV target (lower than 20yr 10x target)', () => {
    // Create a state that would hit 5x FEV target
    const state10yr = createScoringState10yr({
      cash: 100000,
      totalDebt: 0,
      initialRaiseAmount: 20000,
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const score10 = calculateFinalScore(state10yr);
    // 100K + portfolio value >> 5x * 20K, so should get full 20 points
    expect(score10.valueCreation).toBe(20);
  });
});
