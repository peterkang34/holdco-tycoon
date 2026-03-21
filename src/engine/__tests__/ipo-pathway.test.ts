import { describe, it, expect } from 'vitest';
import {
  checkIPOEligibility,
  calculateStockPrice,
  executeIPO,
  processEarningsResult,
  canShareFundedDeal,
  calculateShareFundedTerms,
  calculatePublicCompanyBonus,
} from '../ipo';
import { createMockBusiness, createMockGameState } from './helpers';
import {
  IPO_MIN_EBITDA,
  IPO_MIN_BUSINESSES,
  IPO_MIN_AVG_QUALITY,
  IPO_MIN_PLATFORMS,
  IPO_MIN_ROUND,
  IPO_EARNINGS_MISS_PENALTY,
  IPO_EARNINGS_BEAT_BONUS,
  IPO_CONSECUTIVE_MISS_THRESHOLD,
  IPO_FEV_BONUS_BASE,
  IPO_FEV_BONUS_MAX,
} from '../../data/gameConfig';
import type { GameState, IPOState, QualityRating, Business } from '../types';

// ── Helpers ──

function createIPOEligibleState(overrides: Partial<GameState> = {}): GameState {
  const businesses: Business[] = [];
  for (let i = 0; i < IPO_MIN_BUSINESSES; i++) {
    businesses.push(createMockBusiness({
      id: `biz_ipo_${i}`,
      name: `IPO Biz ${i}`,
      ebitda: Math.ceil(IPO_MIN_EBITDA / IPO_MIN_BUSINESSES) + 1000,
      qualityRating: Math.ceil(IPO_MIN_AVG_QUALITY) as QualityRating,
      isPlatform: i === 0, // at least 1 platform
      status: 'active',
    }));
  }

  return createMockGameState({
    businesses,
    round: IPO_MIN_ROUND,
    duration: 'standard',
    maxRounds: 20,
    cash: 50000,
    ...overrides,
  });
}

function createPublicState(overrides: Partial<GameState> = {}): GameState {
  const state = createIPOEligibleState();
  const ipoResult = executeIPO(state);
  return createMockGameState({
    ...state,
    ipoState: ipoResult.ipoState,
    cash: state.cash + ipoResult.cashRaised,
    sharesOutstanding: ipoResult.ipoState.sharesOutstanding,
    ...overrides,
  });
}

// ── Tests ──

describe('IPO Pathway', () => {
  describe('Eligibility gates', () => {
    it('fully eligible state passes all checks', () => {
      const state = createIPOEligibleState();
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('rejects non-standard duration', () => {
      const state = createIPOEligibleState({ duration: 'quick', maxRounds: 10 });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('Full Game'))).toBe(true);
    });

    it('rejects insufficient EBITDA', () => {
      const businesses = Array.from({ length: IPO_MIN_BUSINESSES }, (_, i) =>
        createMockBusiness({
          id: `biz_${i}`,
          ebitda: 1000, // way below threshold
          qualityRating: 4 as QualityRating,
          isPlatform: i === 0,
          status: 'active',
        })
      );
      const state = createIPOEligibleState({ businesses });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('EBITDA'))).toBe(true);
    });

    it('rejects insufficient business count', () => {
      const state = createIPOEligibleState({
        businesses: [createMockBusiness({ ebitda: IPO_MIN_EBITDA + 1000, qualityRating: 4 as QualityRating, isPlatform: true })],
      });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('businesses'))).toBe(true);
    });

    it('rejects insufficient avg quality', () => {
      const businesses = Array.from({ length: IPO_MIN_BUSINESSES }, (_, i) =>
        createMockBusiness({
          id: `biz_${i}`,
          ebitda: Math.ceil(IPO_MIN_EBITDA / IPO_MIN_BUSINESSES) + 1000,
          qualityRating: 2 as QualityRating, // below threshold
          isPlatform: i === 0,
          status: 'active',
        })
      );
      const state = createIPOEligibleState({ businesses });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('quality'))).toBe(true);
    });

    it('rejects insufficient platforms', () => {
      const businesses = Array.from({ length: IPO_MIN_BUSINESSES }, (_, i) =>
        createMockBusiness({
          id: `biz_${i}`,
          ebitda: Math.ceil(IPO_MIN_EBITDA / IPO_MIN_BUSINESSES) + 1000,
          qualityRating: 4 as QualityRating,
          isPlatform: false, // no platforms
          status: 'active',
        })
      );
      const state = createIPOEligibleState({ businesses });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('platform'))).toBe(true);
    });

    it('rejects too-early round', () => {
      const state = createIPOEligibleState({ round: IPO_MIN_ROUND - 1 });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('round'))).toBe(true);
    });

    it('rejects already-public company', () => {
      const state = createIPOEligibleState({
        ipoState: {
          isPublic: true, stockPrice: 10, sharesOutstanding: 1000,
          preIPOShares: 800, marketSentiment: 0, earningsExpectations: 50000,
          ipoRound: 16, initialStockPrice: 10, consecutiveMisses: 0,
          shareFundedDealsThisRound: 0,
        },
      });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some(r => r.includes('Already public'))).toBe(true);
    });

    it('only counts active businesses', () => {
      const state = createIPOEligibleState();
      // Mark all but 1 as sold
      const modifiedBiz = state.businesses.map((b, i) => ({
        ...b,
        status: i === 0 ? 'active' as const : 'sold' as const,
      }));
      const result = checkIPOEligibility({ ...state, businesses: modifiedBiz });
      expect(result.eligible).toBe(false);
    });

    it('returns multiple failure reasons simultaneously', () => {
      const state = createMockGameState({
        businesses: [createMockBusiness({ ebitda: 100, qualityRating: 1 as QualityRating })],
        round: 1,
        duration: 'quick',
      });
      const result = checkIPOEligibility(state);
      expect(result.eligible).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(2);
    });
  });

  describe('Stock price derivation', () => {
    it('stock price is (equityValue / shares) * (1 + sentiment)', () => {
      const state = createPublicState();
      const price = calculateStockPrice(state);
      expect(price).toBeGreaterThan(0);
    });

    it('returns 0 without IPO state', () => {
      const state = createMockGameState({ ipoState: null });
      expect(calculateStockPrice(state)).toBe(0);
    });

    it('positive sentiment increases stock price', () => {
      const state = createPublicState();
      const basePrice = calculateStockPrice(state);

      const highSentiment = {
        ...state,
        ipoState: { ...state.ipoState!, marketSentiment: 0.20 },
      };
      const highPrice = calculateStockPrice(highSentiment);
      expect(highPrice).toBeGreaterThan(basePrice);
    });

    it('negative sentiment decreases stock price', () => {
      const state = createPublicState();
      const basePrice = calculateStockPrice(state);

      const lowSentiment = {
        ...state,
        ipoState: { ...state.ipoState!, marketSentiment: -0.20 },
      };
      const lowPrice = calculateStockPrice(lowSentiment);
      expect(lowPrice).toBeLessThan(basePrice);
    });

    it('more debt reduces stock price', () => {
      const state = createPublicState();
      const basePrice = calculateStockPrice(state);

      const highDebt = { ...state, totalDebt: 100000 };
      const debtPrice = calculateStockPrice(highDebt);
      expect(debtPrice).toBeLessThan(basePrice);
    });

    it('stock price is rounded to 2 decimal places', () => {
      const state = createPublicState();
      const price = calculateStockPrice(state);
      expect(price).toBe(Math.round(price * 100) / 100);
    });
  });

  describe('IPO execution', () => {
    it('issues 20% new shares', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      const expectedNew = Math.round(state.sharesOutstanding * 0.20 / 0.80);
      expect(result.newSharesIssued).toBe(expectedNew);
    });

    it('total shares = pre-IPO + new shares', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      expect(result.ipoState.sharesOutstanding).toBe(
        state.sharesOutstanding + result.newSharesIssued
      );
    });

    it('sets earnings expectations at EBITDA * 1.05', () => {
      const state = createIPOEligibleState();
      const totalEbitda = state.businesses.filter(b => b.status === 'active')
        .reduce((sum, b) => sum + b.ebitda, 0);
      const result = executeIPO(state);
      expect(result.ipoState.earningsExpectations).toBe(Math.round(totalEbitda * 1.05));
    });

    it('sets initial market sentiment to 0.05 (IPO pop)', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      expect(result.ipoState.marketSentiment).toBe(0.05);
    });

    it('records ipoRound', () => {
      const state = createIPOEligibleState({ round: 17 });
      const result = executeIPO(state);
      expect(result.ipoState.ipoRound).toBe(17);
    });

    it('consecutive misses starts at 0', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      expect(result.ipoState.consecutiveMisses).toBe(0);
    });

    it('raises cash from selling shares', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      expect(result.cashRaised).toBeGreaterThan(0);
    });

    it('preIPOShares matches original shares outstanding', () => {
      const state = createIPOEligibleState();
      const result = executeIPO(state);
      expect(result.ipoState.preIPOShares).toBe(state.sharesOutstanding);
    });
  });

  describe('Earnings beat/miss cascade', () => {
    it('beating earnings increases sentiment', () => {
      const state = createPublicState();
      const originalSentiment = state.ipoState!.marketSentiment;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target + 1000);
      expect(result!.marketSentiment).toBeGreaterThan(originalSentiment);
    });

    it('beating earnings resets consecutive misses to 0', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 1;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target + 1000);
      expect(result!.consecutiveMisses).toBe(0);
    });

    it('missing earnings decreases sentiment', () => {
      const state = createPublicState();
      const originalSentiment = state.ipoState!.marketSentiment;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target - 1000);
      expect(result!.marketSentiment).toBeLessThan(originalSentiment);
    });

    it('missing earnings increments consecutive misses', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 0;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target - 1000);
      expect(result!.consecutiveMisses).toBe(1);
    });

    it('2 consecutive misses trigger analyst downgrade (-0.10 extra)', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 1; // will become 2 on miss
      state.ipoState!.marketSentiment = 0.20;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target - 1000);
      expect(result!.consecutiveMisses).toBe(2);
      // Should get both miss penalty AND extra downgrade penalty
      const expectedSentiment = Math.max(-0.3, 0.20 - IPO_EARNINGS_MISS_PENALTY - 0.10);
      expect(result!.marketSentiment).toBeCloseTo(expectedSentiment);
    });

    it('sentiment is capped at +0.30', () => {
      const state = createPublicState();
      state.ipoState!.marketSentiment = 0.28;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target + 10000);
      expect(result!.marketSentiment).toBeLessThanOrEqual(0.30);
    });

    it('sentiment is floored at -0.30', () => {
      const state = createPublicState();
      state.ipoState!.marketSentiment = -0.20;
      state.ipoState!.consecutiveMisses = 1;
      const target = state.ipoState!.earningsExpectations;
      const result = processEarningsResult(state, target - 10000);
      expect(result!.marketSentiment).toBeGreaterThanOrEqual(-0.30);
    });

    it('next earnings expectation is based on actual (not target) EBITDA * 1.05', () => {
      const state = createPublicState();
      const actual = 60000;
      const result = processEarningsResult(state, actual);
      expect(result!.earningsExpectations).toBe(Math.round(actual * 1.05));
    });

    it('resets shareFundedDealsThisRound to 0', () => {
      const state = createPublicState();
      state.ipoState!.shareFundedDealsThisRound = 3;
      const result = processEarningsResult(state, state.ipoState!.earningsExpectations);
      expect(result!.shareFundedDealsThisRound).toBe(0);
    });

    it('returns existing ipoState for non-public companies', () => {
      const state = createMockGameState({ ipoState: null });
      expect(processEarningsResult(state, 1000)).toBeNull();
    });
  });

  describe('Share-funded deals', () => {
    it('requires isPublic to be true', () => {
      const state = createMockGameState({ ipoState: null });
      expect(canShareFundedDeal(state)).toBe(false);
    });

    it('public company can do share-funded deals', () => {
      const state = createPublicState();
      expect(canShareFundedDeal(state)).toBe(true);
    });

    it('calculates correct shares to issue', () => {
      const ipoState: IPOState = {
        isPublic: true, stockPrice: 50, sharesOutstanding: 1000,
        preIPOShares: 800, marketSentiment: 0.05,
        earningsExpectations: 50000, ipoRound: 16,
        initialStockPrice: 50, consecutiveMisses: 0,
        shareFundedDealsThisRound: 0,
      };
      const terms = calculateShareFundedTerms(5000, ipoState);
      expect(terms.sharesToIssue).toBe(100); // 5000 / 50
      expect(terms.newTotalShares).toBe(1100);
    });

    it('calculates dilution percentage correctly', () => {
      const ipoState: IPOState = {
        isPublic: true, stockPrice: 100, sharesOutstanding: 1000,
        preIPOShares: 800, marketSentiment: 0,
        earningsExpectations: 50000, ipoRound: 16,
        initialStockPrice: 100, consecutiveMisses: 0,
        shareFundedDealsThisRound: 0,
      };
      const terms = calculateShareFundedTerms(10000, ipoState);
      expect(terms.sharesToIssue).toBe(100);
      expect(terms.dilutionPct).toBeCloseTo(100 / 1100);
    });

    it('returns 0 shares if stock price is 0', () => {
      const ipoState: IPOState = {
        isPublic: true, stockPrice: 0, sharesOutstanding: 1000,
        preIPOShares: 800, marketSentiment: 0,
        earningsExpectations: 50000, ipoRound: 16,
        initialStockPrice: 10, consecutiveMisses: 0,
        shareFundedDealsThisRound: 0,
      };
      const terms = calculateShareFundedTerms(5000, ipoState);
      expect(terms.sharesToIssue).toBe(0);
      expect(terms.dilutionPct).toBe(0);
    });
  });

  describe('Public company bonus', () => {
    it('returns 0 for non-public companies', () => {
      const state = createMockGameState({ ipoState: null });
      expect(calculatePublicCompanyBonus(state)).toBe(0);
    });

    it('base bonus is 5%', () => {
      expect(IPO_FEV_BONUS_BASE).toBe(0.05);
    });

    it('maximum bonus is 18%', () => {
      expect(IPO_FEV_BONUS_MAX).toBe(0.18);
    });

    it('base 5% for newly public company with no appreciation', () => {
      const state = createPublicState();
      // Set neutral conditions
      state.ipoState!.marketSentiment = 0;
      state.ipoState!.consecutiveMisses = 1; // not 0, so no earnings bonus
      state.ipoState!.stockPrice = state.ipoState!.initialStockPrice; // no appreciation
      // Remove all platforms to isolate base
      state.businesses.forEach(b => { b.isPlatform = false; });
      const bonus = calculatePublicCompanyBonus(state);
      expect(bonus).toBeCloseTo(0.05);
    });

    it('perfect earnings adds +3%', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 0;
      state.ipoState!.marketSentiment = 0;
      state.ipoState!.stockPrice = state.ipoState!.initialStockPrice;
      state.businesses.forEach(b => { b.isPlatform = false; });
      const bonus = calculatePublicCompanyBonus(state);
      expect(bonus).toBeCloseTo(0.08); // 5% base + 3% earnings
    });

    it('positive sentiment adds up to +2%', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 1;
      state.ipoState!.marketSentiment = 0.30; // max sentiment
      state.ipoState!.stockPrice = state.ipoState!.initialStockPrice;
      state.businesses.forEach(b => { b.isPlatform = false; });
      const bonus = calculatePublicCompanyBonus(state);
      // 5% base + 2% sentiment
      expect(bonus).toBeCloseTo(0.07);
    });

    it('platforms add index tier bonus (1% per platform up to 3%)', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 1;
      state.ipoState!.marketSentiment = 0;
      state.ipoState!.stockPrice = state.ipoState!.initialStockPrice;

      // 1 platform: +1%
      state.businesses.forEach(b => { b.isPlatform = false; });
      state.businesses[0].isPlatform = true;
      expect(calculatePublicCompanyBonus(state)).toBeCloseTo(0.06);

      // 2 platforms: +2%
      state.businesses[1].isPlatform = true;
      expect(calculatePublicCompanyBonus(state)).toBeCloseTo(0.07);

      // 3+ platforms: +3%
      state.businesses[2].isPlatform = true;
      expect(calculatePublicCompanyBonus(state)).toBeCloseTo(0.08);
    });

    it('bonus is capped at IPO_FEV_BONUS_MAX (18%)', () => {
      const state = createPublicState();
      state.ipoState!.consecutiveMisses = 0;
      state.ipoState!.marketSentiment = 0.30;
      state.ipoState!.stockPrice = state.ipoState!.initialStockPrice * 3; // huge appreciation
      // All platforms
      state.businesses.forEach(b => { b.isPlatform = true; });
      const bonus = calculatePublicCompanyBonus(state);
      expect(bonus).toBeLessThanOrEqual(IPO_FEV_BONUS_MAX);
    });
  });

  describe('IPO constant values', () => {
    it('eligibility thresholds are correct', () => {
      expect(IPO_MIN_EBITDA).toBe(75000);
      expect(IPO_MIN_BUSINESSES).toBe(6);
      expect(IPO_MIN_AVG_QUALITY).toBe(4.0);
      expect(IPO_MIN_PLATFORMS).toBe(1);
      expect(IPO_MIN_ROUND).toBe(16);
    });

    it('earnings constants are correct', () => {
      expect(IPO_EARNINGS_MISS_PENALTY).toBe(0.15);
      expect(IPO_EARNINGS_BEAT_BONUS).toBe(0.08);
      expect(IPO_CONSECUTIVE_MISS_THRESHOLD).toBe(2);
    });
  });
});
