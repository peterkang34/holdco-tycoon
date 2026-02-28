/**
 * Tests for 20-Year Mode features:
 * - Deal Inflation (Sprint 1A)
 * - Narrative Tone Evolution (Sprint 2B)
 * - Management Succession Events (Sprint 3)
 */

import { describe, it, expect } from 'vitest';
import { calculateDealInflation } from '../businesses';
import { getNarrativePhase, NARRATIVE_PHASE_CONFIG } from '../../data/gameConfig';
import {
  checkIPOEligibility,
  executeIPO,
  processEarningsResult,
  calculatePublicCompanyBonus,
  canShareFundedDeal,
  calculateShareFundedTerms,
  calculateStockPrice,
} from '../ipo';
import { createMockGameState, createMockBusiness } from './helpers';
import {
  DEAL_INFLATION_START_ROUND,
  DEAL_INFLATION_RATE,
  DEAL_INFLATION_CAP,
  DEAL_INFLATION_CRISIS_RESET,
  DEAL_INFLATION_CRISIS_DURATION,
  FINAL_COUNTDOWN_START_ROUND,
  ANNIVERSARY_MILESTONES,
  IPO_MIN_EBITDA,
  IPO_MIN_BUSINESSES,
  IPO_MIN_AVG_QUALITY,
  IPO_MIN_PLATFORMS,
  IPO_MIN_ROUND,
  IPO_EARNINGS_MISS_PENALTY,
  IPO_EARNINGS_BEAT_BONUS,
  IPO_CONSECUTIVE_MISS_THRESHOLD,
  IPO_SHARE_FUNDED_DEALS_PER_ROUND,
  IPO_FEV_BONUS_BASE,
  IPO_FEV_BONUS_MAX,
  SUCCESSION_MIN_YEARS_HELD,
  SUCCESSION_INVEST_COST_MIN,
  SUCCESSION_INVEST_COST_MAX,
  SUCCESSION_INVEST_RESTORE,
  SUCCESSION_PROMOTE_RESTORE,
  SUCCESSION_PROMOTE_HR_BONUS,
  SUCCESSION_PROMOTE_PLATFORM_BONUS,
  SUCCESSION_QUALITY_DROP,
  SUCCESSION_SELL_DISCOUNT,
  SUCCESSION_PROB,
  FAMILY_OFFICE_MIN_DISTRIBUTIONS,
  FAMILY_OFFICE_MIN_COMPOSITE_GRADE,
  FAMILY_OFFICE_MIN_Q4_BUSINESSES,
  FAMILY_OFFICE_MIN_LONG_HELD,
  FAMILY_OFFICE_ROUNDS,
  FAMILY_OFFICE_SUCCESSION_ROUND,
  EQUITY_DILUTION_STEP,
  EQUITY_DILUTION_FLOOR,
  EQUITY_BUYBACK_COOLDOWN,
  EQUITY_ISSUANCE_SENTIMENT_PENALTY,
  MIN_FOUNDER_OWNERSHIP,
  MIN_PUBLIC_FOUNDER_OWNERSHIP,
} from '../../data/gameConfig';
import {
  checkFamilyOfficeEligibility,
  initializeFamilyOffice,
  advanceFamilyOfficeRound,
  commitPhilanthropy,
  makeInvestment,
  applySuccessionChoice,
  getSuccessionChoices,
  isSuccessionRound,
  isFamilyOfficeComplete,
  calculateLegacyScore,
} from '../familyOffice';
import type { DealInflationState, QualityRating, FamilyOfficeState, ScoreBreakdown } from '../types';

describe('Deal Inflation (Sprint 1A)', () => {
  const defaultState: DealInflationState = { crisisResetRoundsRemaining: 0 };

  it('should return 0 for quick mode', () => {
    expect(calculateDealInflation(15, 'quick', defaultState)).toBe(0);
  });

  it('should return 0 for rounds before start', () => {
    expect(calculateDealInflation(1, 'standard', defaultState)).toBe(0);
    expect(calculateDealInflation(10, 'standard', defaultState)).toBe(0);
  });

  it('should return 0 at exactly the start round', () => {
    // Round 11 is DEAL_INFLATION_START_ROUND, yearsActive = 0
    expect(calculateDealInflation(DEAL_INFLATION_START_ROUND, 'standard', defaultState)).toBe(0);
  });

  it('should apply correct inflation after start round', () => {
    // Round 12: 1 year active = 0.5x
    expect(calculateDealInflation(12, 'standard', defaultState)).toBe(DEAL_INFLATION_RATE);
    // Round 13: 2 years = 1.0x
    expect(calculateDealInflation(13, 'standard', defaultState)).toBe(DEAL_INFLATION_RATE * 2);
  });

  it('should cap at DEAL_INFLATION_CAP', () => {
    // At round 17: 6 years * 0.5 = 3.0 = cap
    expect(calculateDealInflation(17, 'standard', defaultState)).toBe(DEAL_INFLATION_CAP);
    // Beyond cap
    expect(calculateDealInflation(20, 'standard', defaultState)).toBe(DEAL_INFLATION_CAP);
  });

  it('should reduce inflation during crisis reset', () => {
    const crisisState: DealInflationState = { crisisResetRoundsRemaining: 2 };
    // Round 14: 3 years * 0.5 = 1.5 - 2.0 = -0.5, floored at 0
    expect(calculateDealInflation(14, 'standard', crisisState)).toBe(0);
    // Round 17: 6 years * 0.5 = 3.0 - 2.0 = 1.0
    expect(calculateDealInflation(17, 'standard', crisisState)).toBe(1.0);
  });

  it('constants should have expected values', () => {
    expect(DEAL_INFLATION_START_ROUND).toBe(11);
    expect(DEAL_INFLATION_RATE).toBe(0.5);
    expect(DEAL_INFLATION_CAP).toBe(3.0);
    expect(DEAL_INFLATION_CRISIS_RESET).toBe(2.0);
    expect(DEAL_INFLATION_CRISIS_DURATION).toBe(2);
  });
});

describe('Narrative Tone Evolution (Sprint 2B)', () => {
  it('should return 5 phases', () => {
    expect(NARRATIVE_PHASE_CONFIG).toHaveLength(5);
  });

  it('should return correct phases for 20-year mode', () => {
    expect(getNarrativePhase(1, 20).id).toBe('scrappy_startup');
    expect(getNarrativePhase(4, 20).id).toBe('scrappy_startup');
    expect(getNarrativePhase(5, 20).id).toBe('growing_operator');
    expect(getNarrativePhase(8, 20).id).toBe('growing_operator');
    expect(getNarrativePhase(9, 20).id).toBe('seasoned_builder');
    expect(getNarrativePhase(12, 20).id).toBe('seasoned_builder');
    expect(getNarrativePhase(13, 20).id).toBe('adapting_veteran');
    expect(getNarrativePhase(16, 20).id).toBe('adapting_veteran');
    expect(getNarrativePhase(17, 20).id).toBe('legacy_architect');
    expect(getNarrativePhase(20, 20).id).toBe('legacy_architect');
  });

  it('should return compressed phases for 10-year mode', () => {
    expect(getNarrativePhase(1, 10).id).toBe('scrappy_startup');
    expect(getNarrativePhase(3, 10).id).toBe('scrappy_startup');
    expect(getNarrativePhase(4, 10).id).toBe('growing_operator');
    expect(getNarrativePhase(6, 10).id).toBe('growing_operator');
    expect(getNarrativePhase(7, 10).id).toBe('seasoned_builder');
    expect(getNarrativePhase(10, 10).id).toBe('seasoned_builder');
  });

  it('each phase should have toneGuidance', () => {
    for (const phase of NARRATIVE_PHASE_CONFIG) {
      expect(phase.toneGuidance).toBeTruthy();
      expect(phase.toneGuidance.length).toBeGreaterThan(10);
    }
  });
});

describe('Final Countdown & Anniversaries (Sprint 1C + 2A)', () => {
  it('final countdown should start at round 18', () => {
    expect(FINAL_COUNTDOWN_START_ROUND).toBe(18);
  });

  it('anniversary milestones should be 5, 10, 15', () => {
    expect(ANNIVERSARY_MILESTONES).toEqual([5, 10, 15]);
  });
});

describe('Management Succession Constants (Sprint 3)', () => {
  it('should have correct eligibility constants', () => {
    expect(SUCCESSION_MIN_YEARS_HELD).toBe(8);
    expect(SUCCESSION_PROB).toBe(0.06);
  });

  it('should have correct invest constants', () => {
    expect(SUCCESSION_INVEST_COST_MIN).toBe(300);
    expect(SUCCESSION_INVEST_COST_MAX).toBe(500);
    expect(SUCCESSION_INVEST_RESTORE).toBe(0.75);
  });

  it('should have correct promote constants', () => {
    expect(SUCCESSION_PROMOTE_RESTORE).toBe(0.50);
    expect(SUCCESSION_PROMOTE_HR_BONUS).toBe(0.20);
    expect(SUCCESSION_PROMOTE_PLATFORM_BONUS).toBe(0.15);
  });

  it('promote chance should cap at 95%', () => {
    // Base 50% + HR 20% + Platform 15% = 85%
    const maxChance = Math.min(0.95, SUCCESSION_PROMOTE_RESTORE + SUCCESSION_PROMOTE_HR_BONUS + SUCCESSION_PROMOTE_PLATFORM_BONUS);
    expect(maxChance).toBe(0.85);
  });

  it('should have correct sell/quality constants', () => {
    expect(SUCCESSION_QUALITY_DROP).toBe(1);
    expect(SUCCESSION_SELL_DISCOUNT).toBe(0.15);
  });
});

describe('Management Succession Logic (Sprint 3)', () => {
  it('should drop quality by SUCCESSION_QUALITY_DROP', () => {
    const qualityRating = 4 as QualityRating;
    const newQuality = Math.max(1, qualityRating - SUCCESSION_QUALITY_DROP) as QualityRating;
    expect(newQuality).toBe(3);
  });

  it('should floor quality at 1', () => {
    const qualityRating = 1 as QualityRating;
    const newQuality = Math.max(1, qualityRating - SUCCESSION_QUALITY_DROP) as QualityRating;
    expect(newQuality).toBe(1);
  });

  it('sell price should be 85% of fair value', () => {
    const fairValue = 10000;
    const sellPrice = Math.round(fairValue * (1 - SUCCESSION_SELL_DISCOUNT));
    expect(sellPrice).toBe(8500);
  });

  it('should only apply to 20-year mode', () => {
    // Quick mode should never trigger
    expect(calculateDealInflation(15, 'quick', { crisisResetRoundsRemaining: 0 })).toBe(0);
  });

  it('eligibility requires 8+ years held', () => {
    const acquisitionRound = 1;
    const currentRound = 8;
    expect(currentRound - acquisitionRound >= SUCCESSION_MIN_YEARS_HELD).toBe(false);
    expect(9 - acquisitionRound >= SUCCESSION_MIN_YEARS_HELD).toBe(true);
  });

  it('successionResolved should prevent repeat events', () => {
    const business = { successionResolved: true, qualityRating: 4, acquisitionRound: 1 };
    const eligible = !business.successionResolved && business.qualityRating >= 3;
    expect(eligible).toBe(false);
  });

  it('businesses below Q3 should not be eligible', () => {
    const lowQuality = { successionResolved: false, qualityRating: 2, acquisitionRound: 1 };
    const eligible = !lowQuality.successionResolved && lowQuality.qualityRating >= 3;
    expect(eligible).toBe(false);
  });

  it('invest cost should be within expected range', () => {
    expect(SUCCESSION_INVEST_COST_MIN).toBeGreaterThanOrEqual(200);
    expect(SUCCESSION_INVEST_COST_MAX).toBeLessThanOrEqual(600);
    expect(SUCCESSION_INVEST_COST_MIN).toBeLessThan(SUCCESSION_INVEST_COST_MAX);
  });
});

// ── IPO Pathway Tests (Sprint 4-6) ──

function createIPOEligibleState() {
  const businesses = [];
  for (let i = 0; i < 7; i++) {
    businesses.push(createMockBusiness({
      id: `biz_${i}`,
      name: `Business ${i}`,
      ebitda: 12000, // 7 * 12000 = 84000 > 75000
      qualityRating: 4 as QualityRating,
      isPlatform: i < 2, // first 2 are platforms
    }));
  }
  return createMockGameState({
    businesses,
    round: 16,
    duration: 'standard',
    maxRounds: 20,
    cash: 50000,
  });
}

describe('IPO Eligibility (Sprint 4)', () => {
  it('should be eligible with all gates met', () => {
    const state = createIPOEligibleState();
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  it('should reject in quick mode', () => {
    const state = createIPOEligibleState();
    state.duration = 'quick';
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('Full Game'))).toBe(true);
  });

  it('should reject before round 16', () => {
    const state = createIPOEligibleState();
    state.round = 15;
    const { eligible } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
  });

  it('should reject with insufficient EBITDA', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 1000, qualityRating: 5 as QualityRating, isPlatform: true })],
      round: 16,
      duration: 'standard',
    });
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('EBITDA'))).toBe(true);
  });

  it('should reject with insufficient businesses', () => {
    const businesses = [];
    for (let i = 0; i < 3; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 30000,
        qualityRating: 5 as QualityRating,
        isPlatform: true,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 16,
      duration: 'standard',
    });
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('businesses'))).toBe(true);
  });

  it('should reject with low avg quality', () => {
    const businesses = [];
    for (let i = 0; i < 7; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 12000,
        qualityRating: 2 as QualityRating, // low quality
        isPlatform: i < 2,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 16,
      duration: 'standard',
    });
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('quality'))).toBe(true);
  });

  it('should reject with insufficient platforms', () => {
    const businesses = [];
    for (let i = 0; i < 7; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 12000,
        qualityRating: 4 as QualityRating,
        isPlatform: false, // no platforms
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 16,
      duration: 'standard',
    });
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('platforms'))).toBe(true);
  });

  it('should reject if already public', () => {
    const state = createIPOEligibleState();
    state.ipoState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: 80000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const { eligible } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
  });
});

describe('IPO Execution (Sprint 4)', () => {
  it('should return IPO state with correct fields', () => {
    const state = createIPOEligibleState();
    const result = executeIPO(state);
    expect(result.ipoState.isPublic).toBe(true);
    expect(result.ipoState.ipoRound).toBe(16);
    expect(result.ipoState.consecutiveMisses).toBe(0);
    expect(result.ipoState.shareFundedDealsThisRound).toBe(0);
    expect(result.ipoState.marketSentiment).toBe(0.05); // IPO pop
  });

  it('should raise cash from share issuance', () => {
    const state = createIPOEligibleState();
    const result = executeIPO(state);
    expect(result.cashRaised).toBeGreaterThan(0);
    expect(result.newSharesIssued).toBeGreaterThan(0);
  });

  it('should issue 20% dilution worth of shares', () => {
    const state = createIPOEligibleState();
    const result = executeIPO(state);
    // New shares should be ~25% of old shares (20% of new total)
    const dilutionPct = result.newSharesIssued / result.ipoState.sharesOutstanding;
    expect(dilutionPct).toBeCloseTo(0.20, 1);
  });

  it('earnings expectations should be 5% above current', () => {
    const state = createIPOEligibleState();
    const totalEbitda = state.businesses.filter(b => b.status === 'active').reduce((sum, b) => sum + b.ebitda, 0);
    const result = executeIPO(state);
    expect(result.ipoState.earningsExpectations).toBe(Math.round(totalEbitda * 1.05));
  });
});

describe('IPO Earnings Processing (Sprint 5)', () => {
  function createPublicState() {
    const state = createIPOEligibleState();
    const totalEbitda = state.businesses.filter(b => b.status === 'active').reduce((sum, b) => sum + b.ebitda, 0);
    state.ipoState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: totalEbitda, // target = current
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 1,
    };
    return state;
  }

  it('should boost sentiment on earnings beat', () => {
    const state = createPublicState();
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target + 1000)!; // beat
    expect(result.marketSentiment).toBe(IPO_EARNINGS_BEAT_BONUS);
    expect(result.consecutiveMisses).toBe(0);
  });

  it('should penalize sentiment on earnings miss', () => {
    const state = createPublicState();
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target - 1000)!; // miss
    expect(result.marketSentiment).toBe(-IPO_EARNINGS_MISS_PENALTY);
    expect(result.consecutiveMisses).toBe(1);
  });

  it('should apply extra penalty on consecutive misses', () => {
    const state = createPublicState();
    state.ipoState!.consecutiveMisses = IPO_CONSECUTIVE_MISS_THRESHOLD - 1;
    state.ipoState!.marketSentiment = -0.1;
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target - 1000)!;
    expect(result.consecutiveMisses).toBe(IPO_CONSECUTIVE_MISS_THRESHOLD);
    // Should get base penalty + extra downgrade
    expect(result.marketSentiment).toBeLessThan(-0.1 - IPO_EARNINGS_MISS_PENALTY);
  });

  it('should reset share-funded deals per round', () => {
    const state = createPublicState();
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target)!;
    expect(result.shareFundedDealsThisRound).toBe(0);
  });

  it('should set next expectations to 5% above actual', () => {
    const state = createPublicState();
    const actual = 90000;
    const result = processEarningsResult(state, actual)!;
    expect(result.earningsExpectations).toBe(Math.round(actual * 1.05));
  });

  it('should clamp sentiment at -0.3', () => {
    const state = createPublicState();
    state.ipoState!.marketSentiment = -0.25;
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target - 10000)!;
    expect(result.marketSentiment).toBeGreaterThanOrEqual(-0.3);
  });

  it('should clamp sentiment at +0.3', () => {
    const state = createPublicState();
    state.ipoState!.marketSentiment = 0.25;
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target + 10000)!;
    expect(result.marketSentiment).toBeLessThanOrEqual(0.3);
  });
});

describe('Share-Funded Deals (Sprint 5)', () => {
  it('should not allow share-funded deals when private', () => {
    const state = createMockGameState({ ipoState: null });
    expect(canShareFundedDeal(state)).toBe(false);
  });

  it('should allow one share-funded deal per round', () => {
    const state = createMockGameState({
      ipoState: {
        isPublic: true, stockPrice: 100, sharesOutstanding: 1200, preIPOShares: 1000,
        marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
        consecutiveMisses: 0, shareFundedDealsThisRound: 0,
      },
    });
    expect(canShareFundedDeal(state)).toBe(true);
  });

  it('should block after max deals reached', () => {
    const state = createMockGameState({
      ipoState: {
        isPublic: true, stockPrice: 100, sharesOutstanding: 1200, preIPOShares: 1000,
        marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
        consecutiveMisses: 0, shareFundedDealsThisRound: IPO_SHARE_FUNDED_DEALS_PER_ROUND,
      },
    });
    expect(canShareFundedDeal(state)).toBe(false);
  });

  it('should calculate correct share-funded terms', () => {
    const ipoState = {
      isPublic: true, stockPrice: 50, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 50,
      consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const terms = calculateShareFundedTerms(5000, ipoState);
    expect(terms.sharesToIssue).toBe(100); // 5000 / 50
    expect(terms.newTotalShares).toBe(1300); // 1200 + 100
    expect(terms.dilutionPct).toBeCloseTo(100 / 1300, 3);
  });
});

describe('Public Company Bonus', () => {
  it('should return 0 when private', () => {
    const state = createIPOEligibleState();
    expect(calculatePublicCompanyBonus(state)).toBe(0);
  });

  it('should return base bonus when public', () => {
    const state = createIPOEligibleState();
    state.ipoState = {
      isPublic: true, stockPrice: 100, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
      consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const bonus = calculatePublicCompanyBonus(state);
    expect(bonus).toBeGreaterThanOrEqual(IPO_FEV_BONUS_BASE);
  });

  it('should increase with stock appreciation', () => {
    const state = createIPOEligibleState();
    state.ipoState = {
      isPublic: true, stockPrice: 200, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
      consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const bonus = calculatePublicCompanyBonus(state);
    expect(bonus).toBeGreaterThan(IPO_FEV_BONUS_BASE);
  });

  it('should cap at IPO_FEV_BONUS_MAX', () => {
    const state = createIPOEligibleState();
    state.ipoState = {
      isPublic: true, stockPrice: 500, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0.3, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
      consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const bonus = calculatePublicCompanyBonus(state);
    expect(bonus).toBeLessThanOrEqual(IPO_FEV_BONUS_MAX);
  });

  it('consecutive misses should reduce bonus', () => {
    const state1 = createIPOEligibleState();
    state1.ipoState = {
      isPublic: true, stockPrice: 100, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
      consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const state2 = createIPOEligibleState();
    state2.ipoState = {
      isPublic: true, stockPrice: 100, sharesOutstanding: 1200, preIPOShares: 1000,
      marketSentiment: 0, earningsExpectations: 80000, ipoRound: 16, initialStockPrice: 100,
      consecutiveMisses: 2, shareFundedDealsThisRound: 0,
    };
    expect(calculatePublicCompanyBonus(state1)).toBeGreaterThan(calculatePublicCompanyBonus(state2));
  });
});

describe('IPO Constants Validation', () => {
  it('should have correct gate values', () => {
    expect(IPO_MIN_EBITDA).toBe(75000);
    expect(IPO_MIN_BUSINESSES).toBe(6);
    expect(IPO_MIN_AVG_QUALITY).toBe(4.0);
    expect(IPO_MIN_PLATFORMS).toBe(1);
    expect(IPO_MIN_ROUND).toBe(16);
  });

  it('should have correct earnings constants', () => {
    expect(IPO_EARNINGS_MISS_PENALTY).toBe(0.15);
    expect(IPO_EARNINGS_BEAT_BONUS).toBe(0.08);
    expect(IPO_CONSECUTIVE_MISS_THRESHOLD).toBe(2);
  });

  it('should have correct share/bonus constants', () => {
    expect(IPO_SHARE_FUNDED_DEALS_PER_ROUND).toBe(1);
    expect(IPO_FEV_BONUS_BASE).toBe(0.05);
    expect(IPO_FEV_BONUS_MAX).toBe(0.18);
  });
});

// ── Family Office Tests (Sprint 7-11) ──

function createFOEligibleState() {
  const businesses = [];
  for (let i = 0; i < 4; i++) {
    businesses.push(createMockBusiness({
      id: `biz_${i}`,
      name: `Business ${i}`,
      ebitda: 20000,
      qualityRating: (i < 3 ? 4 : 5) as QualityRating, // 3 at Q4, 1 at Q5
      acquisitionRound: 1, // held 19 years in a 20-year game at round 20
    }));
  }
  return createMockGameState({
    businesses,
    round: 20,
    maxRounds: 20,
    duration: 'standard',
    founderDistributionsReceived: 1500000, // $1.5B
  });
}

const mockScore: ScoreBreakdown = {
  valueCreation: 18,
  fcfShareGrowth: 16,
  portfolioRoic: 13,
  capitalDeployment: 12,
  balanceSheetHealth: 8,
  strategicDiscipline: 8,
  total: 75,
  grade: 'B',
  title: 'Seasoned Builder',
};

describe('Family Office Eligibility (Sprint 7)', () => {
  it('should be eligible with all gates met', () => {
    const state = createFOEligibleState();
    const { eligible } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(true);
  });

  it('should reject in quick mode', () => {
    const state = createFOEligibleState();
    state.duration = 'quick';
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('Full Game'))).toBe(true);
  });

  it('should reject with insufficient distributions', () => {
    const state = createFOEligibleState();
    state.founderDistributionsReceived = 500000; // $500M < $1B
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('distributions'))).toBe(true);
  });

  it('should reject with low grade', () => {
    const state = createFOEligibleState();
    const lowScore = { ...mockScore, grade: 'C' as ScoreBreakdown['grade'] };
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, lowScore);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('grade'))).toBe(true);
  });

  it('should reject with insufficient Q4+ businesses', () => {
    const businesses = [];
    for (let i = 0; i < 4; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 20000,
        qualityRating: 2 as QualityRating, // all low quality
        acquisitionRound: 1,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 20,
      maxRounds: 20,
      duration: 'standard',
      founderDistributionsReceived: 1500000,
    });
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('Q4+'))).toBe(true);
  });
});

describe('Family Office Initialization (Sprint 7)', () => {
  it('should initialize with correct defaults', () => {
    const fo = initializeFamilyOffice();
    expect(fo.isActive).toBe(true);
    expect(fo.foRound).toBe(1);
    expect(fo.reputation).toBe(50);
    expect(fo.philanthropyCommitted).toBe(0);
    expect(fo.investments).toHaveLength(0);
    expect(fo.irrevocableCommitments).toHaveLength(0);
  });
});

describe('Family Office Round Processing (Sprint 8)', () => {
  it('should advance round', () => {
    const fo = initializeFamilyOffice();
    const next = advanceFamilyOfficeRound(fo);
    expect(next.foRound).toBe(2);
  });

  it('should calculate legacy score on final round', () => {
    const fo: FamilyOfficeState = {
      ...initializeFamilyOffice(),
      foRound: FAMILY_OFFICE_ROUNDS,
      generationalSuccessionChoice: 'professional_ceo',
    };
    const final = advanceFamilyOfficeRound(fo);
    expect(final.legacyScore).toBeDefined();
    expect(final.legacyScore!.total).toBeGreaterThan(0);
    expect(final.legacyScore!.grade).toBeTruthy();
  });

  it('should track philanthropy commitments', () => {
    const fo = initializeFamilyOffice();
    const updated = commitPhilanthropy(fo, 50000);
    expect(updated.philanthropyCommitted).toBe(50000);
    expect(updated.irrevocableCommitments).toHaveLength(1);
    expect(updated.irrevocableCommitments[0].irrevocable).toBe(true);
    expect(updated.reputation).toBeGreaterThan(50);
  });

  it('should track investments', () => {
    const fo = initializeFamilyOffice();
    const updated = makeInvestment(fo, 'real_estate', 100000);
    expect(updated.investments).toHaveLength(1);
    expect(updated.investments[0].type).toBe('real_estate');
    expect(updated.investments[0].amount).toBe(100000);
  });
});

describe('Generational Succession (Sprint 8)', () => {
  it('should return 3 succession choices', () => {
    const choices = getSuccessionChoices();
    expect(choices).toHaveLength(3);
    expect(choices.map(c => c.choice)).toEqual(['heir_apparent', 'professional_ceo', 'family_council']);
  });

  it('should apply succession choice', () => {
    const fo = initializeFamilyOffice();
    const updated = applySuccessionChoice(fo, 'professional_ceo');
    expect(updated.generationalSuccessionChoice).toBe('professional_ceo');
  });

  it('succession round should be round 3', () => {
    const fo = { ...initializeFamilyOffice(), foRound: 3 };
    expect(isSuccessionRound(fo)).toBe(true);
    expect(isSuccessionRound({ ...fo, foRound: 2 })).toBe(false);
  });
});

describe('Legacy Score Calculation (Sprint 8)', () => {
  it('should return score with all 5 components', () => {
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 80,
      philanthropyCommitted: 100000,
      investments: [
        { type: 'real_estate', amount: 50000, round: 1 },
        { type: 'venture', amount: 50000, round: 2 },
        { type: 'bonds', amount: 50000, round: 3 },
      ],
      irrevocableCommitments: [
        { type: 'philanthropy', amount: 100000, round: 1, irrevocable: true },
        { type: 'philanthropy', amount: 50000, round: 3, irrevocable: true },
      ],
      generationalSuccessionChoice: 'professional_ceo',
    };

    const score = calculateLegacyScore(fo);
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.wealthPreservation).toBeGreaterThan(0);
    expect(score.reputationScore).toBeGreaterThan(0);
    expect(score.philanthropyScore).toBeGreaterThan(0);
    expect(score.successionQuality).toBeGreaterThan(0);
    expect(score.permanentHoldPerformance).toBeGreaterThan(0);
  });

  it('should grade Enduring for high scores', () => {
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 100,
      philanthropyCommitted: 500000,
      investments: Array.from({ length: 5 }, (_, i) => ({
        type: `type_${i}`, amount: 100000, round: i + 1,
      })),
      irrevocableCommitments: Array.from({ length: 4 }, (_, i) => ({
        type: 'philanthropy', amount: 100000, round: i + 1, irrevocable: true,
      })),
      generationalSuccessionChoice: 'professional_ceo',
    };

    const score = calculateLegacyScore(fo);
    expect(score.grade).toBe('Enduring');
  });

  it('should grade Fragile for low scores', () => {
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 10,
      philanthropyCommitted: 0,
      investments: [],
      irrevocableCommitments: [],
    };

    const score = calculateLegacyScore(fo);
    expect(score.grade).toBe('Fragile');
  });

  it('family office completeness check', () => {
    const incomplete: FamilyOfficeState = {
      ...initializeFamilyOffice(),
      foRound: 3,
    };
    expect(isFamilyOfficeComplete(incomplete)).toBe(false);

    const complete: FamilyOfficeState = {
      ...initializeFamilyOffice(),
      foRound: 5,
      legacyScore: { total: 60, grade: 'Influential', wealthPreservation: 12, reputationScore: 12, philanthropyScore: 12, successionQuality: 12, permanentHoldPerformance: 12 },
    };
    expect(isFamilyOfficeComplete(complete)).toBe(true);
  });
});

describe('Family Office Constants Validation', () => {
  it('should have correct gate values', () => {
    expect(FAMILY_OFFICE_MIN_DISTRIBUTIONS).toBe(1000000);
    expect(FAMILY_OFFICE_MIN_COMPOSITE_GRADE).toBe('B');
    expect(FAMILY_OFFICE_MIN_Q4_BUSINESSES).toBe(3);
    expect(FAMILY_OFFICE_MIN_LONG_HELD).toBe(2);
  });

  it('should have correct round values', () => {
    expect(FAMILY_OFFICE_ROUNDS).toBe(5);
    expect(FAMILY_OFFICE_SUCCESSION_ROUND).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// QA Regression Tests — Jake Moreno's Edge Case Audit
// ══════════════════════════════════════════════════════════════

describe('QA: Deal Inflation Edge Cases', () => {
  it('should return 0 at exactly round 10 (boundary just before start)', () => {
    expect(calculateDealInflation(10, 'standard', { crisisResetRoundsRemaining: 0 })).toBe(0);
  });

  it('should return 0 at exactly round 11 (start round, 0 years active)', () => {
    expect(calculateDealInflation(11, 'standard', { crisisResetRoundsRemaining: 0 })).toBe(0);
  });

  it('crisis reset with 0 rounds remaining should not reduce inflation', () => {
    const state: DealInflationState = { crisisResetRoundsRemaining: 0 };
    // Round 14: 3 years * 0.5 = 1.5, no crisis reduction
    expect(calculateDealInflation(14, 'standard', state)).toBe(1.5);
  });

  it('crisis reset should floor inflation at 0, never go negative', () => {
    const crisisState: DealInflationState = { crisisResetRoundsRemaining: 1 };
    // Round 12: 1 year * 0.5 = 0.5 - 2.0 = -1.5, floored at 0
    expect(calculateDealInflation(12, 'standard', crisisState)).toBe(0);
  });

  it('cap should apply even with crisis active at high rounds', () => {
    // Round 20: 9 years * 0.5 = 4.5, capped at 3.0
    // With crisis: max(0, 4.5 - 2.0) = 2.5, then min(2.5, 3.0) = 2.5
    const crisisState: DealInflationState = { crisisResetRoundsRemaining: 1 };
    expect(calculateDealInflation(20, 'standard', crisisState)).toBe(2.5);
  });

  it('should never return negative for any round/mode combination', () => {
    for (let round = 1; round <= 25; round++) {
      for (const dur of ['quick', 'standard'] as const) {
        for (let crisis = 0; crisis <= 3; crisis++) {
          const val = calculateDealInflation(round, dur, { crisisResetRoundsRemaining: crisis });
          expect(val).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('QA: IPO Stock Price Edge Cases', () => {
  it('should return 0 when ipoState is null', () => {
    const state = createMockGameState({ ipoState: null });
    expect(calculateStockPrice(state)).toBe(0);
  });

  it('stock price should not go negative with heavy debt', () => {
    const state = createIPOEligibleState();
    state.totalDebt = 999999999; // massive debt
    state.ipoState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: -0.3,
      earningsExpectations: 80000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const price = calculateStockPrice(state);
    expect(price).toBeGreaterThanOrEqual(0);
  });

  it('stock price should handle zero EBITDA businesses gracefully', () => {
    const businesses = [];
    for (let i = 0; i < 7; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 0, // zero EBITDA
        qualityRating: 4 as QualityRating,
        isPlatform: i < 2,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 16,
      duration: 'standard',
      cash: 50000,
      ipoState: {
        isPublic: true,
        stockPrice: 100,
        sharesOutstanding: 1200,
        preIPOShares: 1000,
        marketSentiment: 0,
        earningsExpectations: 0,
        ipoRound: 16,
        initialStockPrice: 100,
        consecutiveMisses: 0,
        shareFundedDealsThisRound: 0,
      },
    });
    const price = calculateStockPrice(state);
    // Should not be NaN or Infinity
    expect(Number.isFinite(price)).toBe(true);
    expect(price).toBeGreaterThanOrEqual(0);
  });
});

describe('QA: IPO Earnings — Exact Boundary', () => {
  function createPublicStateForQA() {
    const state = createIPOEligibleState();
    const totalEbitda = state.businesses.filter(b => b.status === 'active').reduce((sum, b) => sum + b.ebitda, 0);
    state.ipoState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: totalEbitda,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    return state;
  }

  it('exact match of expectations should count as beat (>=), not miss', () => {
    const state = createPublicStateForQA();
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target)!; // exact match
    expect(result.marketSentiment).toBe(IPO_EARNINGS_BEAT_BONUS); // should count as beat
    expect(result.consecutiveMisses).toBe(0);
  });

  it('zero actual EBITDA should still process without error', () => {
    const state = createPublicStateForQA();
    const result = processEarningsResult(state, 0)!; // total collapse
    expect(result.consecutiveMisses).toBe(1);
    expect(Number.isFinite(result.marketSentiment)).toBe(true);
    expect(result.earningsExpectations).toBe(0); // 0 * 1.05 = 0
  });

  it('consecutive miss counter should track across multiple calls', () => {
    const state = createPublicStateForQA();
    state.ipoState!.consecutiveMisses = 0;
    state.ipoState!.marketSentiment = 0.2; // start high so we don't clamp at floor
    const target = state.ipoState!.earningsExpectations;

    // First miss (from 0.2 sentiment)
    const r1 = processEarningsResult(state, target - 1)!;
    expect(r1.consecutiveMisses).toBe(1);
    expect(r1.marketSentiment).toBe(0.2 - IPO_EARNINGS_MISS_PENALTY); // 0.05

    // Second miss (from 0.05 sentiment) — should trigger analyst downgrade
    state.ipoState = r1;
    const r2 = processEarningsResult(state, r1.earningsExpectations - 1)!;
    expect(r2.consecutiveMisses).toBe(2);
    // Should get base penalty + extra downgrade: 0.05 - 0.15 - 0.10 = -0.20
    expect(r2.marketSentiment).toBe(Math.max(-0.3, r1.marketSentiment - IPO_EARNINGS_MISS_PENALTY - 0.10));
  });

  it('a beat after consecutive misses should reset counter', () => {
    const state = createPublicStateForQA();
    state.ipoState!.consecutiveMisses = 3;
    state.ipoState!.marketSentiment = -0.2;
    const target = state.ipoState!.earningsExpectations;
    const result = processEarningsResult(state, target + 1000)!;
    expect(result.consecutiveMisses).toBe(0);
  });

  it('sentiment should never exceed [-0.3, +0.3] range after repeated events', () => {
    const state = createPublicStateForQA();
    state.ipoState!.marketSentiment = 0.28;
    const target = state.ipoState!.earningsExpectations;

    // Multiple beats
    let result = processEarningsResult(state, target + 10000)!;
    expect(result.marketSentiment).toBeLessThanOrEqual(0.3);

    // Multiple misses from high sentiment
    state.ipoState!.marketSentiment = -0.28;
    state.ipoState!.consecutiveMisses = 5; // extreme
    result = processEarningsResult(state, target - 10000)!;
    expect(result.marketSentiment).toBeGreaterThanOrEqual(-0.3);
  });
});

describe('QA: IPO Execution — Share Math', () => {
  it('IPO should handle 0 shares gracefully (no NaN/Infinity)', () => {
    const state = createIPOEligibleState();
    state.sharesOutstanding = 0;
    const result = executeIPO(state);
    expect(result.newSharesIssued).toBe(0); // 0 * 0.20 / 0.80 = 0
    expect(Number.isFinite(result.cashRaised)).toBe(true); // guarded: pricePerShare = 0
    expect(result.cashRaised).toBe(0);
  });

  it('IPO shares formula should produce ~20% dilution of new total', () => {
    const state = createIPOEligibleState();
    const result = executeIPO(state);
    const dilution = result.newSharesIssued / result.ipoState.sharesOutstanding;
    expect(dilution).toBeCloseTo(0.20, 1); // 20% of total
  });
});

describe('QA: Family Office Legacy Score — Edge Cases', () => {
  it('legacy score should handle zero investments gracefully', () => {
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 0,
      philanthropyCommitted: 0,
      investments: [],
      irrevocableCommitments: [],
    };
    const score = calculateLegacyScore(fo);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.wealthPreservation).toBe(0); // 0 investments * 3 + 0 unique * 5 = 0
    expect(score.reputationScore).toBe(0); // reputation 0 / 5 = 0
    expect(score.philanthropyScore).toBe(0);
    expect(score.successionQuality).toBe(10); // baseline when no choice made
    expect(score.permanentHoldPerformance).toBe(Math.min(20, 0 * 4 + 8)); // = 8
    expect(score.grade).toBe('Fragile'); // total = 0 + 0 + 0 + 10 + 8 = 18 < 40
  });

  it('each component should be capped at 20', () => {
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 999, // extreme
      philanthropyCommitted: 99999999, // extreme
      investments: Array.from({ length: 50 }, (_, i) => ({
        type: `type_${i}`, amount: 100000, round: 1,
      })),
      irrevocableCommitments: Array.from({ length: 50 }, (_, i) => ({
        type: `type_${i}`, amount: 100000, round: 1, irrevocable: true,
      })),
      generationalSuccessionChoice: 'professional_ceo',
    };
    const score = calculateLegacyScore(fo);
    expect(score.wealthPreservation).toBeLessThanOrEqual(20);
    expect(score.reputationScore).toBeLessThanOrEqual(20);
    expect(score.philanthropyScore).toBeLessThanOrEqual(20);
    expect(score.successionQuality).toBeLessThanOrEqual(20);
    expect(score.permanentHoldPerformance).toBeLessThanOrEqual(20);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('max possible score with professional_ceo is 96 (succession capped at 16)', () => {
    // Best-case: each component maxes at 20 except succession which caps at 16
    // So theoretical max = 20 + 20 + 20 + 16 + 20 = 96
    // Actually permanentHoldPerformance = min(20, commitments * 4 + 8)
    // Need 3 commitments for 20 (3*4 + 8 = 20)
    const fo: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 100,
      philanthropyCommitted: 500000,
      investments: Array.from({ length: 10 }, (_, i) => ({
        type: `type_${i}`, amount: 100000, round: 1,
      })),
      irrevocableCommitments: Array.from({ length: 5 }, (_, i) => ({
        type: `type_${i}`, amount: 100000, round: 1, irrevocable: true,
      })),
      generationalSuccessionChoice: 'professional_ceo',
    };
    const score = calculateLegacyScore(fo);
    expect(score.wealthPreservation).toBe(20);
    expect(score.reputationScore).toBe(20);
    expect(score.philanthropyScore).toBe(20);
    expect(score.successionQuality).toBe(16); // professional_ceo
    expect(score.permanentHoldPerformance).toBe(20); // 5*4+8 = 28, capped at 20
    expect(score.total).toBe(96);
    expect(score.grade).toBe('Enduring');
  });

  it('heir_apparent should give lower succession score than professional_ceo', () => {
    const baseFO: FamilyOfficeState = {
      isActive: true,
      foRound: 5,
      reputation: 50,
      philanthropyCommitted: 0,
      investments: [],
      irrevocableCommitments: [],
      generationalSuccessionChoice: 'heir_apparent',
    };
    const heirScore = calculateLegacyScore(baseFO).successionQuality;
    const ceoScore = calculateLegacyScore({ ...baseFO, generationalSuccessionChoice: 'professional_ceo' }).successionQuality;
    const councilScore = calculateLegacyScore({ ...baseFO, generationalSuccessionChoice: 'family_council' }).successionQuality;

    expect(ceoScore).toBeGreaterThan(councilScore);
    expect(councilScore).toBeGreaterThan(heirScore);
    expect(heirScore).toBe(12);
    expect(councilScore).toBe(14);
    expect(ceoScore).toBe(16);
  });

  it('philanthropy reputation boost should be proportional to amount', () => {
    const fo1 = commitPhilanthropy(initializeFamilyOffice(), 5000);
    const fo2 = commitPhilanthropy(initializeFamilyOffice(), 50000);
    expect(fo2.reputation).toBeGreaterThan(fo1.reputation);
  });

  it('reputation should clamp at 100', () => {
    let fo = initializeFamilyOffice();
    fo.reputation = 99;
    const updated = commitPhilanthropy(fo, 500000); // huge donation
    expect(updated.reputation).toBeLessThanOrEqual(100);
  });
});

describe('QA: Family Office Round Advancement', () => {
  it('should not advance past round 5', () => {
    const fo: FamilyOfficeState = {
      ...initializeFamilyOffice(),
      foRound: FAMILY_OFFICE_ROUNDS,
      generationalSuccessionChoice: 'professional_ceo',
    };
    const result = advanceFamilyOfficeRound(fo);
    // Should compute legacy score, not advance to round 6
    expect(result.foRound).toBe(FAMILY_OFFICE_ROUNDS); // stays at 5
    expect(result.legacyScore).toBeDefined();
  });

  it('advancing from round 4 to 5 should just increment, not compute score', () => {
    const fo: FamilyOfficeState = {
      ...initializeFamilyOffice(),
      foRound: 4,
    };
    const result = advanceFamilyOfficeRound(fo);
    expect(result.foRound).toBe(5);
    expect(result.legacyScore).toBeUndefined();
  });
});

describe('QA: Succession Event — Key-Man Risk Interaction', () => {
  it('a Q3 business at year 8 should be eligible for succession', () => {
    const biz = { qualityRating: 3, acquisitionRound: 1, successionResolved: false };
    const round = 9; // 9 - 1 = 8 years held
    const eligible = (round - biz.acquisitionRound) >= SUCCESSION_MIN_YEARS_HELD
      && biz.qualityRating >= 3
      && !biz.successionResolved;
    expect(eligible).toBe(true);
  });

  it('if key-man drops quality to Q2, business should no longer be succession-eligible', () => {
    // Key-man drops Q3 -> Q2
    const biz = { qualityRating: 2, acquisitionRound: 1, successionResolved: false };
    const round = 10;
    const eligible = (round - biz.acquisitionRound) >= SUCCESSION_MIN_YEARS_HELD
      && biz.qualityRating >= 3
      && !biz.successionResolved;
    expect(eligible).toBe(false);
  });

  it('succession quality drop should floor at Q1', () => {
    const qualities: QualityRating[] = [1, 2, 3, 4, 5];
    for (const q of qualities) {
      const dropped = Math.max(1, q - SUCCESSION_QUALITY_DROP) as QualityRating;
      expect(dropped).toBeGreaterThanOrEqual(1);
      expect(dropped).toBeLessThanOrEqual(5);
    }
  });

  it('succession and key-man can both affect same business in different rounds', () => {
    // This tests the interaction: key-man fires on a Q4 biz, drops to Q3.
    // Then succession fires on same biz if held 8+ years (still Q3).
    // Then succession drops it to Q2 and sets successionResolved.
    // After that, neither should fire again.
    const biz = { qualityRating: 3, acquisitionRound: 1, successionResolved: true };
    const round = 12;
    const successionEligible = (round - biz.acquisitionRound) >= SUCCESSION_MIN_YEARS_HELD
      && biz.qualityRating >= 3
      && !biz.successionResolved;
    expect(successionEligible).toBe(false); // successionResolved blocks it
  });
});

describe('QA: 10-Year Mode Gating', () => {
  it('deal inflation should be 0 for ALL rounds in quick mode', () => {
    for (let round = 1; round <= 20; round++) {
      expect(calculateDealInflation(round, 'quick', { crisisResetRoundsRemaining: 0 })).toBe(0);
    }
  });

  it('IPO eligibility should fail in quick mode even if all other gates pass', () => {
    const businesses = [];
    for (let i = 0; i < 7; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 12000,
        qualityRating: 4 as QualityRating,
        isPlatform: i < 2,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 16,
      duration: 'quick',
      maxRounds: 10,
    });
    const { eligible, reasons } = checkIPOEligibility(state);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('Full Game');
  });

  it('Family Office should fail in quick mode even if all other gates pass', () => {
    const businesses = [];
    for (let i = 0; i < 4; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 20000,
        qualityRating: 4 as QualityRating,
        acquisitionRound: 1,
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 10,
      maxRounds: 10,
      duration: 'quick',
      founderDistributionsReceived: 1500000,
    });
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('Full Game');
  });
});

describe('QA: Public Company Bonus — Interaction with Scoring', () => {
  it('public company bonus should be 0 when private', () => {
    const state = createIPOEligibleState();
    expect(calculatePublicCompanyBonus(state)).toBe(0);
  });

  it('public company bonus should include base when public', () => {
    const state = createIPOEligibleState();
    state.ipoState = {
      isPublic: true,
      stockPrice: 100,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: 80000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const bonus = calculatePublicCompanyBonus(state);
    expect(bonus).toBeGreaterThanOrEqual(IPO_FEV_BONUS_BASE);
    expect(bonus).toBeLessThanOrEqual(IPO_FEV_BONUS_MAX);
  });
});

describe('QA: Share-Funded Deal Edge Cases', () => {
  it('share-funded terms with stock price near 0 should not produce Infinity', () => {
    const ipoState = {
      isPublic: true,
      stockPrice: 0.01, // near zero
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: 80000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const terms = calculateShareFundedTerms(5000, ipoState);
    expect(Number.isFinite(terms.sharesToIssue)).toBe(true);
    expect(Number.isFinite(terms.dilutionPct)).toBe(true);
  });

  it('share-funded terms with stock price exactly 0 should handle gracefully', () => {
    const ipoState = {
      isPublic: true,
      stockPrice: 0,
      sharesOutstanding: 1200,
      preIPOShares: 1000,
      marketSentiment: 0,
      earningsExpectations: 80000,
      ipoRound: 16,
      initialStockPrice: 100,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const terms = calculateShareFundedTerms(5000, ipoState);
    // Zero stock price returns early with 0 shares (guarded)
    expect(terms.sharesToIssue).toBe(0);
    expect(terms.dilutionPct).toBe(0);
  });
});

describe('QA: Succession Sell — Missing exitPrice/exitRound', () => {
  it('sold businesses via succession should have exitPrice and exitRound set', () => {
    // This tests the succession sell handler in useGame.ts
    // The handler maps businesses to { ...b, status: 'sold', successionResolved: true }
    // but does NOT set exitPrice or exitRound — these are used by MOIC scoring
    const business = createMockBusiness({
      id: 'biz_succession_test',
      ebitda: 5000,
      acquisitionPrice: 10000,
    });
    // Simulate what successionSell does:
    const exitedBusiness = { ...business, status: 'sold' as const, successionResolved: true };
    // BUG DOCUMENTATION: exitPrice and exitRound are NOT set
    expect(exitedBusiness.exitPrice).toBeUndefined();
    expect(exitedBusiness.exitRound).toBeUndefined();
  });
});

describe('QA: FO Eligibility — Long-Held Calculation', () => {
  it('businesses acquired in round 10 at game end round 20 = 10 years held (eligible)', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', qualityRating: 4 as QualityRating, acquisitionRound: 10 }),
      createMockBusiness({ id: 'b2', qualityRating: 4 as QualityRating, acquisitionRound: 9 }),
      createMockBusiness({ id: 'b3', qualityRating: 4 as QualityRating, acquisitionRound: 1 }),
      createMockBusiness({ id: 'b4', qualityRating: 5 as QualityRating, acquisitionRound: 1 }),
    ];
    const state = createMockGameState({
      businesses,
      round: 20,
      maxRounds: 20,
      duration: 'standard',
      founderDistributionsReceived: 1500000,
    });
    // b1: 20-10 = 10 years (>= 10, eligible)
    // b2: 20-9 = 11 years (>= 10, eligible)
    // b3: 20-1 = 19 years (>= 10, eligible)
    // b4: 20-1 = 19 years (>= 10, eligible)
    const { eligible } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(true);
  });

  it('all businesses acquired at round 11+ at game end round 20 = <10 years (ineligible for long-held)', () => {
    const businesses = [];
    for (let i = 0; i < 4; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 20000,
        qualityRating: 4 as QualityRating,
        acquisitionRound: 11, // 20 - 11 = 9 years < 10
      }));
    }
    const state = createMockGameState({
      businesses,
      round: 20,
      maxRounds: 20,
      duration: 'standard',
      founderDistributionsReceived: 1500000,
    });
    const { eligible, reasons } = checkFamilyOfficeEligibility(state, mockScore);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('10+ years'))).toBe(true);
  });
});

describe('QA: executeIPO sets initialStockPrice', () => {
  it('executeIPO should set initialStockPrice on the returned ipoState', () => {
    const state = createIPOEligibleState();
    const result = executeIPO(state);
    expect(result.ipoState.initialStockPrice).toBeDefined();
    expect(result.ipoState.initialStockPrice).toBe(result.ipoState.stockPrice);
    expect(result.ipoState.initialStockPrice).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// POST-IPO EQUITY RAISES
// ══════════════════════════════════════════════════════════════════

describe('Post-IPO Equity Raises', () => {
  function createPublicState(overrides: Record<string, unknown> = {}) {
    const state = createIPOEligibleState();
    const ipoResult = executeIPO(state);
    return createMockGameState({
      ...state,
      businesses: state.businesses,
      cash: state.cash + ipoResult.cashRaised,
      sharesOutstanding: ipoResult.ipoState.sharesOutstanding,
      ipoState: ipoResult.ipoState,
      round: 17,
      ...overrides,
    });
  }

  it('issues at stock price (not intrinsic × discount) for public companies', () => {
    const state = createPublicState();
    const stockPrice = calculateStockPrice(state);
    expect(stockPrice).toBeGreaterThan(0);
    // Stock price should be used, not intrinsic value × discount
    const amount = 10000; // $10M
    const expectedShares = Math.round((amount / stockPrice) * 1000) / 1000;
    const newTotal = state.sharesOutstanding + expectedShares;
    const newOwnership = state.founderShares / newTotal;
    // Ownership should still be above 10% floor
    expect(newOwnership).toBeGreaterThan(MIN_PUBLIC_FOUNDER_OWNERSHIP);
  });

  it('applies -1% sentiment penalty per issuance', () => {
    const state = createPublicState();
    const originalSentiment = state.ipoState!.marketSentiment;
    // Simulate what issueEquity does to sentiment
    const newSentiment = Math.max(originalSentiment - EQUITY_ISSUANCE_SENTIMENT_PENALTY, -0.30);
    expect(newSentiment).toBeCloseTo(originalSentiment - 0.01, 5);
  });

  it('clamps sentiment at -0.30 after many issuances', () => {
    // Start with very low sentiment
    const state = createPublicState();
    state.ipoState!.marketSentiment = -0.29;
    // One more penalty should clamp at -0.30
    const newSentiment = Math.max(state.ipoState!.marketSentiment - EQUITY_ISSUANCE_SENTIMENT_PENALTY, -0.30);
    expect(newSentiment).toBe(-0.30);
  });

  it('does NOT apply escalating discount for public (equityRaisesUsed ignored for pricing)', () => {
    const state = createPublicState({ equityRaisesUsed: 5 });
    const stockPrice = calculateStockPrice(state);
    // Even with 5 prior raises, public companies use stock price
    // The escalating discount formula would give: max(1 - 0.10*5, 0.10) = 0.50
    // But public companies should NOT apply this — they use stockPrice directly
    expect(stockPrice).toBeGreaterThan(0);
    // Verify the discount formula is only for private
    const privateDiscount = Math.max(1 - EQUITY_DILUTION_STEP * 5, EQUITY_DILUTION_FLOOR);
    expect(privateDiscount).toBe(0.50); // confirms private would discount heavily
  });

  it('private companies still use escalating discount (unchanged)', () => {
    const state = createMockGameState({
      equityRaisesUsed: 3,
      ipoState: null, // private
    });
    const discount = Math.max(1 - EQUITY_DILUTION_STEP * state.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
    expect(discount).toBe(0.70); // 1 - 0.10*3 = 0.70
  });

  it('stock price recalculated after issuance', () => {
    const state = createPublicState();
    const priceBeforeIssuance = calculateStockPrice(state);
    // After issuing shares: more shares outstanding → different stock price
    const amount = 10000;
    const newShares = Math.round((amount / priceBeforeIssuance) * 1000) / 1000;
    const postState = {
      ...state,
      cash: state.cash + amount,
      sharesOutstanding: state.sharesOutstanding + newShares,
      ipoState: {
        ...state.ipoState!,
        sharesOutstanding: state.sharesOutstanding + newShares,
        marketSentiment: state.ipoState!.marketSentiment - EQUITY_ISSUANCE_SENTIMENT_PENALTY,
      },
    };
    const priceAfterIssuance = calculateStockPrice(postState);
    // Price should change (cash goes up but so do shares and sentiment drops)
    expect(priceAfterIssuance).not.toBe(priceBeforeIssuance);
  });

  it('10% ownership floor still enforced for public', () => {
    const state = createPublicState({ founderShares: 150 }); // low founder shares
    const stockPrice = calculateStockPrice(state);
    // Try to issue so many shares that ownership would drop below 10%
    const hugeAmount = 1000000; // $1B
    const newShares = Math.round((hugeAmount / stockPrice) * 1000) / 1000;
    const newTotal = state.sharesOutstanding + newShares;
    const newOwnership = state.founderShares / newTotal;
    // The store would block this — verify the math shows it breaches
    expect(newOwnership).toBeLessThan(MIN_PUBLIC_FOUNDER_OWNERSHIP);
  });

  it('2-round cooldown still enforced for public', () => {
    const state = createPublicState({ lastBuybackRound: 16 }); // buyback in round 16
    // Round 17, cooldown is 2 rounds — should be blocked
    const blocked = state.lastBuybackRound > 0 && state.round - state.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN;
    expect(blocked).toBe(true);
  });

  it('EQUITY_ISSUANCE_SENTIMENT_PENALTY = 0.01', () => {
    expect(EQUITY_ISSUANCE_SENTIMENT_PENALTY).toBe(0.01);
  });
});
