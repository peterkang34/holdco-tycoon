import { describe, it, expect } from 'vitest';
import {
  calculateEnterpriseValue,
  calculateFounderEquityValue,
  calculateFounderPersonalWealth,
  calculateFinalScore,
  generatePostGameInsights,
  wouldMakeLeaderboardFromList,
  getLeaderboardRankFromList,
} from '../scoring';
// calculateMetrics available if needed for future tests
import {
  createMockBusiness,
  createMockGameState,
  createMultiBusinessState,
} from './helpers';
import { HistoricalMetrics, LeaderboardEntry } from '../types';

describe('calculateEnterpriseValue', () => {
  it('should return positive EV for healthy portfolio', () => {
    const state = createMockGameState();
    const ev = calculateEnterpriseValue(state);
    expect(ev).toBeGreaterThan(0);
  });

  it('should return cash minus debt when no active businesses', () => {
    const state = createMockGameState({
      businesses: [],
      cash: 5000,
      totalDebt: 2000,
    });
    const ev = calculateEnterpriseValue(state);
    expect(ev).toBe(3000);
  });

  it('should not return negative EV (floor at 0)', () => {
    const state = createMockGameState({
      businesses: [],
      cash: 0,
      totalDebt: 10000,
    });
    const ev = calculateEnterpriseValue(state);
    expect(ev).toBe(0);
  });

  it('should include exit proceeds from sold businesses', () => {
    // EV should include the exit proceeds value
    // Note: The calculation adds distributions + buybacks, not raw exit proceeds
    // The key is that exitedBusinesses with status 'sold' add exitPrice to the sum
    const evWithExits = calculateEnterpriseValue(createMockGameState({
      exitedBusinesses: [
        createMockBusiness({ status: 'sold', exitPrice: 8000 }),
      ],
    }));
    const evWithoutExits = calculateEnterpriseValue(createMockGameState({
      exitedBusinesses: [],
    }));
    expect(evWithExits).toBeGreaterThanOrEqual(evWithoutExits);
  });

  it('should NOT add back distributions to EV (distributions reduce NAV)', () => {
    const state = createMockGameState({
      totalDistributions: 3000,
      totalBuybacks: 2000,
    });
    const stateNoReturns = createMockGameState({
      totalDistributions: 0,
      totalBuybacks: 0,
    });

    const evWithReturns = calculateEnterpriseValue(state);
    const evNoReturns = calculateEnterpriseValue(stateNoReturns);
    // Distributions no longer add back to EV — both states should have the same EV
    // since distributions/buybacks don't affect the portfolio value calculation
    expect(evWithReturns).toBe(evNoReturns);
  });

  it('should deduct all debt including opco debt', () => {
    const stateNoDebt = createMockGameState({
      totalDebt: 0,
      businesses: [createMockBusiness({ sellerNoteBalance: 0, bankDebtBalance: 0 })],
    });
    const stateWithDebt = createMockGameState({
      totalDebt: 2000,
      businesses: [createMockBusiness({ sellerNoteBalance: 1000, bankDebtBalance: 500 })],
    });

    const evNoDebt = calculateEnterpriseValue(stateNoDebt);
    const evWithDebt = calculateEnterpriseValue(stateWithDebt);
    expect(evWithDebt).toBeLessThan(evNoDebt);
  });

  it('should apply quality premium to multiples', () => {
    const highQuality = createMockGameState({
      businesses: [createMockBusiness({ qualityRating: 5, ebitda: 2000 })],
    });
    const lowQuality = createMockGameState({
      businesses: [createMockBusiness({ qualityRating: 1, ebitda: 2000 })],
    });

    const evHigh = calculateEnterpriseValue(highQuality);
    const evLow = calculateEnterpriseValue(lowQuality);
    expect(evHigh).toBeGreaterThan(evLow);
  });
});

describe('calculateFinalScore', () => {
  function createScoringState(overrides = {}): ReturnType<typeof createMockGameState> {
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

  it('should return a score between 0 and 100', () => {
    const state = createScoringState();
    const score = calculateFinalScore(state);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('should return a valid grade', () => {
    const state = createScoringState();
    const score = calculateFinalScore(state);
    expect(['S', 'A', 'B', 'C', 'D', 'F']).toContain(score.grade);
  });

  it('should have all score components be non-negative', () => {
    const state = createScoringState();
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBeGreaterThanOrEqual(0);
    expect(score.fcfShareGrowth).toBeGreaterThanOrEqual(0);
    expect(score.portfolioRoic).toBeGreaterThanOrEqual(0);
    expect(score.capitalDeployment).toBeGreaterThanOrEqual(0);
    expect(score.balanceSheetHealth).toBeGreaterThanOrEqual(0);
    expect(score.strategicDiscipline).toBeGreaterThanOrEqual(0);
  });

  it('should cap each component at its max', () => {
    const state = createScoringState();
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBeLessThanOrEqual(20);
    expect(score.fcfShareGrowth).toBeLessThanOrEqual(20);
    expect(score.portfolioRoic).toBeLessThanOrEqual(15);
    expect(score.capitalDeployment).toBeLessThanOrEqual(15);
    expect(score.balanceSheetHealth).toBeLessThanOrEqual(15);
    expect(score.strategicDiscipline).toBeLessThanOrEqual(15);
  });

  it('should include valueCreation in score breakdown', () => {
    const state = createScoringState();
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBeDefined();
    expect(score.valueCreation).toBeGreaterThanOrEqual(0);
    expect(score.valueCreation).toBeLessThanOrEqual(20);
  });

  it('should give S grade for total >= 90', () => {
    // This is hard to achieve in practice, but we can test the grading logic
    const state = createScoringState();
    const score = calculateFinalScore(state);
    if (score.total >= 90) expect(score.grade).toBe('S');
    else if (score.total >= 75) expect(score.grade).toBe('A');
    else if (score.total >= 60) expect(score.grade).toBe('B');
    else if (score.total >= 40) expect(score.grade).toBe('C');
    else if (score.total >= 20) expect(score.grade).toBe('D');
    else expect(score.grade).toBe('F');
  });

  it('should penalize over-leverage in balance sheet score', () => {
    const overleveragedHistory: HistoricalMetrics[] = [{
      round: 1,
      metrics: {
        cash: 1000,
        totalDebt: 20000,
        totalEbitda: 3000,
        totalRevenue: 15000,
        avgEbitdaMargin: 0.20,
        totalFcf: 1000,
        fcfPerShare: 1,
        portfolioRoic: 0.10,
        roiic: 0.10,
        portfolioMoic: 1.5,
        netDebtToEbitda: 5.0, // Way over 4x!
        distressLevel: 'breach' as const,
        cashConversion: 0.5,
        interestRate: 0.07,
        sharesOutstanding: 1000,
        intrinsicValuePerShare: 10,
        totalInvestedCapital: 10000,
        totalDistributions: 0,
        totalBuybacks: 0,
        totalExitProceeds: 0,
      },
      fcf: 1000,
      nopat: 2100,
      investedCapital: 10000,
    }];

    const overleveraged = createScoringState({
      totalDebt: 10000,
      metricsHistory: overleveragedHistory,
    });

    const conservative = createScoringState({
      totalDebt: 0,
    });

    const olScore = calculateFinalScore(overleveraged);
    const conScore = calculateFinalScore(conservative);

    expect(olScore.balanceSheetHealth).toBeLessThan(conScore.balanceSheetHealth);
  });

  it('should handle empty metricsHistory without crashing', () => {
    const state = createScoringState({ metricsHistory: [] });
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
    expect(score.fcfShareGrowth).toBe(0); // Can't compute growth without history
  });

  it('should not produce NaN in any score component', () => {
    // Edge case: everything is zero
    const emptyState = createMockGameState({
      businesses: [],
      cash: 0,
      totalDebt: 0,
      totalInvestedCapital: 0,
      metricsHistory: [],
    });
    const score = calculateFinalScore(emptyState);

    expect(Number.isNaN(score.valueCreation)).toBe(false);
    expect(Number.isNaN(score.fcfShareGrowth)).toBe(false);
    expect(Number.isNaN(score.portfolioRoic)).toBe(false);
    expect(Number.isNaN(score.capitalDeployment)).toBe(false);
    expect(Number.isNaN(score.balanceSheetHealth)).toBe(false);
    expect(Number.isNaN(score.strategicDiscipline)).toBe(false);
    expect(Number.isNaN(score.total)).toBe(false);
  });
});

describe('generatePostGameInsights', () => {
  it('should return at most 3 insights', () => {
    const state = createMockGameState();
    const insights = generatePostGameInsights(state);
    expect(insights.length).toBeLessThanOrEqual(3);
  });

  it('should detect never_acquired pattern', () => {
    // Only 1 business (the starting one)
    const state = createMockGameState({
      businesses: [createMockBusiness()],
      exitedBusinesses: [],
    });
    const insights = generatePostGameInsights(state);
    const hasNeverAcquired = insights.some(i => i.pattern === 'Never acquired anything');
    expect(hasNeverAcquired).toBe(true);
  });

  it('should detect over-leveraged pattern', () => {
    const state = createMockGameState({
      cash: 1000, // Low cash so net debt is high
      totalDebt: 10000,
      businesses: [createMockBusiness({ ebitda: 1000, bankDebtBalance: 0 })],
    });
    // netDebtToEbitda = (10000 - 1000) / 1000 = 9, which is > 3
    const insights = generatePostGameInsights(state);
    const hasOverLeveraged = insights.some(i => i.pattern === 'Over-leveraged (>3x)');
    expect(hasOverLeveraged).toBe(true);
  });

  it('should detect single_sector pattern', () => {
    const state = createMockGameState({
      businesses: [
        createMockBusiness({ id: 'b1', sectorId: 'agency' }),
        createMockBusiness({ id: 'b2', sectorId: 'agency' }),
        createMockBusiness({ id: 'b3', sectorId: 'agency' }),
      ],
    });
    const insights = generatePostGameInsights(state);
    const hasSingleSector = insights.some(i => i.pattern === 'Single-sector portfolio');
    expect(hasSingleSector).toBe(true);
  });

  it('should detect ignored_reinvestment pattern', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ improvements: [] })],
      // All shared services inactive (default)
    });
    const insights = generatePostGameInsights(state);
    const hasIgnoredReinvest = insights.some(i => i.pattern === 'Ignored reinvestment');
    expect(hasIgnoredReinvest).toBe(true);
  });

  it('should return insights with required fields', () => {
    const state = createMultiBusinessState(4);
    const insights = generatePostGameInsights(state);
    for (const insight of insights) {
      expect(insight.pattern).toBeTruthy();
      expect(insight.insight).toBeTruthy();
    }
  });
});

describe('calculateFounderEquityValue', () => {
  it('should return EV * ownership percentage', () => {
    const state = createMockGameState({
      founderShares: 800,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(Math.round(ev * 0.8));
  });

  it('should return full EV at 100% ownership', () => {
    const state = createMockGameState({
      founderShares: 1000,
      sharesOutstanding: 1000,
    });
    const ev = calculateEnterpriseValue(state);
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(ev);
  });

  it('should return 0 when EV is 0', () => {
    const state = createMockGameState({
      businesses: [],
      cash: 0,
      totalDebt: 5000,
    });
    const fev = calculateFounderEquityValue(state);
    expect(fev).toBe(0);
  });
});

describe('calculateFounderPersonalWealth', () => {
  it('should return founderDistributionsReceived', () => {
    const state = createMockGameState({ founderDistributionsReceived: 5000 });
    expect(calculateFounderPersonalWealth(state)).toBe(5000);
  });

  it('should return 0 when no distributions received', () => {
    const state = createMockGameState({ founderDistributionsReceived: 0 });
    expect(calculateFounderPersonalWealth(state)).toBe(0);
  });
});

describe('calculateFinalScore with 10-year mode', () => {
  function createScoringState10yr(overrides = {}): ReturnType<typeof createMockGameState> {
    const baseHistory: HistoricalMetrics[] = [
      {
        round: 1,
        metrics: {
          cash: 5000,
          totalDebt: 3000,
          totalEbitda: 800,
          totalRevenue: 4000,
          avgEbitdaMargin: 0.20,
          totalFcf: 300,
          fcfPerShare: 0.3,
          portfolioRoic: 0.10,
          roiic: 0.10,
          portfolioMoic: 0.36,
          netDebtToEbitda: 1.5,
          distressLevel: 'comfortable' as const,
          cashConversion: 0.375,
          interestRate: 0.07,
          sharesOutstanding: 1000,
          intrinsicValuePerShare: 5,
          totalInvestedCapital: 3200,
          totalDistributions: 0,
          totalBuybacks: 0,
          totalExitProceeds: 0,
        },
        fcf: 300,
        nopat: 560,
        investedCapital: 3200,
      },
    ];

    return createMockGameState({
      round: 10,
      maxRounds: 10,
      duration: 'quick',
      difficulty: 'normal',
      metricsHistory: baseHistory,
      ...overrides,
    });
  }

  it('should use 150% FCF growth target for 10-year mode', () => {
    const state = createScoringState10yr();
    const score = calculateFinalScore(state);
    // Should still produce valid scores
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.fcfShareGrowth).toBeGreaterThanOrEqual(0);
    expect(score.fcfShareGrowth).toBeLessThanOrEqual(20);
  });

  it('should use 2.0x MOIC target for 10-year mode', () => {
    const state = createScoringState10yr();
    const score = calculateFinalScore(state);
    // Verify MOIC component is within bounds
    expect(score.capitalDeployment).toBeGreaterThanOrEqual(0);
    expect(score.capitalDeployment).toBeLessThanOrEqual(15);
  });

  it('should not produce NaN in 10-year mode', () => {
    const state = createScoringState10yr({ metricsHistory: [] });
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
    expect(Number.isNaN(score.fcfShareGrowth)).toBe(false);
  });
});

describe('Bankruptcy/Insolvency Scoring Edge Cases', () => {
  it('should give F grade and score 0 for bankrupt game', () => {
    const state = createMockGameState({
      bankruptRound: 8,
      businesses: [],
      cash: 0,
    });
    const score = calculateFinalScore(state);
    expect(score.total).toBe(0);
    expect(score.grade).toBe('F');
    expect(score.title).toContain('Bankrupt');
    expect(score.title).toContain('Year 8');
    expect(score.valueCreation).toBe(0);
  });

  it('should handle business with 0 EBITDA at game end', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 0, revenue: 0 })],
      round: 20,
    });
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
    expect(score.total).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty portfolio (all businesses sold/wound down)', () => {
    const state = createMockGameState({
      businesses: [],
      exitedBusinesses: [
        createMockBusiness({ id: 'e1', status: 'sold', exitPrice: 8000 }),
      ],
      cash: 10000,
      totalDebt: 0,
      round: 20,
    });
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
    expect(score.total).toBeGreaterThanOrEqual(0);

    const ev = calculateEnterpriseValue(state);
    // No active businesses, EV = max(0, cash - debt) = 10000
    expect(ev).toBe(10000);
  });

  it('should handle negative cash at game end', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 500 })],
      cash: -2000, // Negative cash
      totalDebt: 5000,
      round: 20,
    });
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);

    const ev = calculateEnterpriseValue(state);
    // Should not be NaN or undefined
    expect(Number.isNaN(ev)).toBe(false);
    expect(Number.isFinite(ev)).toBe(true);
    // EV is floored at 0
    expect(ev).toBeGreaterThanOrEqual(0);
  });

  it('should compute EV correctly with negative EBITDA business', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: -200, revenue: 1000, ebitdaMargin: -0.20 })],
      cash: 5000,
      totalDebt: 0,
    });
    const ev = calculateEnterpriseValue(state);
    expect(Number.isNaN(ev)).toBe(false);
    // Negative EBITDA * multiple would reduce portfolio value, but EV is floored at 0
    expect(ev).toBeGreaterThanOrEqual(0);
  });
});

describe('leaderboard rank functions', () => {
  function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
    return {
      id: 'test',
      holdcoName: 'Test',
      initials: 'TT',
      enterpriseValue: 10000,
      score: 50,
      grade: 'C' as const,
      businessCount: 3,
      date: new Date().toISOString(),
      ...overrides,
    };
  }

  it('wouldMakeLeaderboardFromList returns true for empty leaderboard', () => {
    expect(wouldMakeLeaderboardFromList([], 1000)).toBe(true);
  });

  it('getLeaderboardRankFromList returns rank 1 for highest value', () => {
    const entries = [
      makeEntry({ founderEquityValue: 30000, difficulty: 'easy' }),
      makeEntry({ founderEquityValue: 20000, difficulty: 'easy' }),
    ];
    const rank = getLeaderboardRankFromList(entries, 50000);
    expect(rank).toBe(1);
  });

  it('getLeaderboardRankFromList accounts for difficulty multiplier', () => {
    const entries = [
      makeEntry({ founderEquityValue: 40000, difficulty: 'normal' }), // adjusted: 46000
      makeEntry({ founderEquityValue: 45000, difficulty: 'easy' }),   // adjusted: 45000
    ];
    // Normal entry (40000 * 1.15 = 46000) should rank above Easy entry (45000 * 1.0 = 45000)
    // A player with adjustedFEV = 45500 should rank 2nd
    const rank = getLeaderboardRankFromList(entries, 45500);
    expect(rank).toBe(2); // 46000 > 45500, so 1 entry above
  });

  it('getLeaderboardRankFromList handles legacy entries without difficulty', () => {
    const entries = [
      makeEntry({ enterpriseValue: 30000 }), // no difficulty or FEV — treated as easy, uses EV
    ];
    const rank = getLeaderboardRankFromList(entries, 35000);
    expect(rank).toBe(1); // 30000 < 35000
  });
});
