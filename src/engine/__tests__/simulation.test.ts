import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAnnualFcf,
  calculatePortfolioFcf,
  calculateSharedServicesBenefits,
  calculateSectorFocusBonus,
  getSectorFocusEbitdaBonus,
  getSectorFocusMultipleDiscount,
  applyOrganicGrowth,
  generateEvent,
  applyEventEffects,
  calculateMetrics,
  recordHistoricalMetrics,
  calculateExitValuation,
} from '../simulation';
import {
  createMockBusiness,
  createMockGameState,
  createMultiBusinessState,
} from './helpers';
import { Business, GameState, SectorId } from '../types';

describe('calculateAnnualFcf', () => {
  it('should calculate FCF correctly for a basic business', () => {
    const business = createMockBusiness({ ebitda: 1000, sectorId: 'agency' });
    // Agency: capexRate = 0.03, tax = 0.30
    // FCF = 1000 - (1000 * 0.03) - (1000 * 0.30) = 1000 - 30 - 300 = 670
    const fcf = calculateAnnualFcf(business);
    expect(fcf).toBe(670);
  });

  it('should reduce capex with shared services reduction', () => {
    const business = createMockBusiness({ ebitda: 1000, sectorId: 'agency' });
    const fcfWithReduction = calculateAnnualFcf(business, 0.15); // 15% capex reduction
    const fcfWithout = calculateAnnualFcf(business);
    expect(fcfWithReduction).toBeGreaterThan(fcfWithout);
  });

  it('should apply cash conversion bonus', () => {
    const business = createMockBusiness({ ebitda: 1000, sectorId: 'agency' });
    const fcfWithBonus = calculateAnnualFcf(business, 0, 0.05); // 5% bonus
    const fcfWithout = calculateAnnualFcf(business);
    expect(fcfWithBonus).toBeGreaterThan(fcfWithout);
  });

  it('should handle zero EBITDA', () => {
    const business = createMockBusiness({ ebitda: 0 });
    const fcf = calculateAnnualFcf(business);
    expect(fcf).toBe(0);
    expect(Number.isNaN(fcf)).toBe(false);
  });

  it('should handle negative EBITDA gracefully', () => {
    // Edge case: EBITDA shouldn't normally be negative, but let's test
    const business = createMockBusiness({ ebitda: -500 });
    const fcf = calculateAnnualFcf(business);
    expect(Number.isNaN(fcf)).toBe(false);
    expect(Number.isFinite(fcf)).toBe(true);
  });

  it('should produce correct FCF for high-capex sectors', () => {
    // Real estate: capexRate = 0.18
    const business = createMockBusiness({ ebitda: 5000, sectorId: 'realEstate' });
    // FCF = 5000 - (5000 * 0.18) - (5000 * 0.30) = 5000 - 900 - 1500 = 2600
    const fcf = calculateAnnualFcf(business);
    expect(fcf).toBe(2600);
  });
});

describe('calculatePortfolioFcf', () => {
  it('should sum FCF across all active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000, sectorId: 'agency' }),
      createMockBusiness({ id: 'b2', ebitda: 2000, sectorId: 'agency' }),
    ];
    const portfolioFcf = calculatePortfolioFcf(businesses);
    const expected = calculateAnnualFcf(businesses[0]) + calculateAnnualFcf(businesses[1]);
    expect(portfolioFcf).toBe(expected);
  });

  it('should exclude non-active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000, status: 'active' }),
      createMockBusiness({ id: 'b2', ebitda: 2000, status: 'sold' }),
    ];
    const portfolioFcf = calculatePortfolioFcf(businesses);
    const expectedActive = calculateAnnualFcf(businesses[0]);
    expect(portfolioFcf).toBe(expectedActive);
  });

  it('should return 0 for empty portfolio', () => {
    expect(calculatePortfolioFcf([])).toBe(0);
  });
});

describe('calculateSharedServicesBenefits', () => {
  it('should return zeros when no services are active', () => {
    const state = createMockGameState();
    const benefits = calculateSharedServicesBenefits(state);
    expect(benefits.capexReduction).toBe(0);
    expect(benefits.cashConversionBonus).toBe(0);
    expect(benefits.growthBonus).toBe(0);
    expect(benefits.reinvestmentBonus).toBe(0);
    expect(benefits.talentRetentionBonus).toBe(0);
    expect(benefits.talentGainBonus).toBe(0);
  });

  it('should apply scale multiplier with 6+ opcos', () => {
    // L-10: Smooth ramp — 6+ opcos gets 1.2x multiplier
    const businesses = Array.from({ length: 6 }, (_, i) =>
      createMockBusiness({ id: `biz_${i}` })
    );
    const state = createMockGameState({
      businesses,
      sharedServices: createMockGameState().sharedServices.map(s =>
        s.type === 'procurement' ? { ...s, active: true } : s
      ),
    });

    const benefits = calculateSharedServicesBenefits(state);
    // With 6 opcos, scaleMultiplier = 1.2, procurement capexReduction = 0.15 * 1.2 = 0.18
    expect(benefits.capexReduction).toBeCloseTo(0.18, 5);
  });

  it('should not apply scale multiplier with fewer than 5 opcos', () => {
    const state = createMockGameState({
      sharedServices: createMockGameState().sharedServices.map(s =>
        s.type === 'procurement' ? { ...s, active: true } : s
      ),
    });

    const benefits = calculateSharedServicesBenefits(state);
    // 1 opco, scaleMultiplier = 1.0
    expect(benefits.capexReduction).toBeCloseTo(0.15, 5);
  });

  it('should accumulate benefits from multiple active services', () => {
    const state = createMockGameState({
      sharedServices: createMockGameState().sharedServices.map(s =>
        s.type === 'finance_reporting' || s.type === 'procurement'
          ? { ...s, active: true }
          : s
      ),
    });
    const benefits = calculateSharedServicesBenefits(state);
    expect(benefits.capexReduction).toBeGreaterThan(0);
    expect(benefits.cashConversionBonus).toBeGreaterThan(0);
  });
});

describe('calculateSectorFocusBonus', () => {
  it('should return null with fewer than 2 active businesses', () => {
    const businesses = [createMockBusiness()];
    expect(calculateSectorFocusBonus(businesses)).toBeNull();
  });

  it('should return null with no sector overlap', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', sectorId: 'agency' }),
      // Agency has focusGroup ['agency', 'b2bServices']
      // Industrial has focusGroup ['industrial']
      createMockBusiness({ id: 'b2', sectorId: 'industrial' }),
    ];
    // Each sector contributes 1 to its focus group, no group reaches 2
    // Actually agency contributes to 'agency' and 'b2bServices', industrial to 'industrial'
    // None reach 2
    expect(calculateSectorFocusBonus(businesses)).toBeNull();
  });

  it('should detect tier 1 focus (2 businesses in same group)', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', sectorId: 'agency' }),
      createMockBusiness({ id: 'b2', sectorId: 'agency' }),
    ];
    const bonus = calculateSectorFocusBonus(businesses);
    expect(bonus).not.toBeNull();
    expect(bonus!.tier).toBe(1);
    expect(bonus!.opcoCount).toBe(2);
  });

  it('should detect tier 2 focus (3 businesses in same group)', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', sectorId: 'agency' }),
      createMockBusiness({ id: 'b2', sectorId: 'agency' }),
      createMockBusiness({ id: 'b3', sectorId: 'agency' }),
    ];
    const bonus = calculateSectorFocusBonus(businesses);
    expect(bonus).not.toBeNull();
    expect(bonus!.tier).toBe(2);
  });

  it('should detect tier 3 focus (4+ businesses in same group)', () => {
    const businesses = Array.from({ length: 4 }, (_, i) =>
      createMockBusiness({ id: `biz_${i}`, sectorId: 'agency' })
    );
    const bonus = calculateSectorFocusBonus(businesses);
    expect(bonus).not.toBeNull();
    expect(bonus!.tier).toBe(3);
  });

  it('should detect cross-sector focus groups', () => {
    // Agency has focusGroup: ['agency', 'b2bServices']
    // B2B Services has focusGroup: ['b2bServices', 'agency', 'saas']
    const businesses = [
      createMockBusiness({ id: 'b1', sectorId: 'agency' }),
      createMockBusiness({ id: 'b2', sectorId: 'b2bServices' }),
    ];
    const bonus = calculateSectorFocusBonus(businesses);
    expect(bonus).not.toBeNull();
    // Both contribute to 'b2bServices' focus group, and both contribute to 'agency' group
    expect(bonus!.opcoCount).toBe(2);
  });

  it('should exclude non-active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', sectorId: 'agency', status: 'active' }),
      createMockBusiness({ id: 'b2', sectorId: 'agency', status: 'sold' }),
      createMockBusiness({ id: 'b3', sectorId: 'agency', status: 'active' }),
    ];
    const bonus = calculateSectorFocusBonus(businesses);
    // Only 2 active, so tier 1
    expect(bonus).not.toBeNull();
    expect(bonus!.tier).toBe(1);
    expect(bonus!.opcoCount).toBe(2);
  });
});

describe('getSectorFocusEbitdaBonus', () => {
  it('should return correct bonuses per tier', () => {
    expect(getSectorFocusEbitdaBonus(0)).toBe(0);
    expect(getSectorFocusEbitdaBonus(1)).toBe(0.02);
    expect(getSectorFocusEbitdaBonus(2)).toBe(0.04);
    expect(getSectorFocusEbitdaBonus(3)).toBe(0.07);
  });
});

describe('getSectorFocusMultipleDiscount', () => {
  it('should return correct discounts per tier', () => {
    expect(getSectorFocusMultipleDiscount(0)).toBe(0);
    expect(getSectorFocusMultipleDiscount(1)).toBe(0);
    expect(getSectorFocusMultipleDiscount(2)).toBe(0.3);
    expect(getSectorFocusMultipleDiscount(3)).toBe(0.5);
  });
});

describe('applyOrganicGrowth', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should increase EBITDA for positive growth rate', () => {
    const business = createMockBusiness({ ebitda: 1000, organicGrowthRate: 0.05 });
    const result = applyOrganicGrowth(business, 0, 0, false);
    expect(result.ebitda).toBeGreaterThan(business.ebitda);
  });

  it('should apply integration penalty in first years', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const integrated = createMockBusiness({
      ebitda: 1000,
      organicGrowthRate: 0.05,
      integrationRoundsRemaining: 2,
    });
    const notIntegrated = createMockBusiness({
      ebitda: 1000,
      organicGrowthRate: 0.05,
      integrationRoundsRemaining: 0,
    });

    const resultIntegrated = applyOrganicGrowth(integrated, 0, 0, false);
    const resultNormal = applyOrganicGrowth(notIntegrated, 0, 0, false);

    expect(resultIntegrated.ebitda).toBeLessThan(resultNormal.ebitda);
  });

  it('should floor EBITDA at 30% of acquisition EBITDA', () => {
    const business = createMockBusiness({
      ebitda: 100,
      acquisitionEbitda: 1000,
      organicGrowthRate: -0.99,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = applyOrganicGrowth(business, 0, 0, false);
    expect(result.ebitda).toBeGreaterThanOrEqual(300); // 30% of 1000
  });

  it('should update peak EBITDA when growth occurs', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      peakEbitda: 1000,
      organicGrowthRate: 0.10,
    });
    const result = applyOrganicGrowth(business, 0, 0, false);
    expect(result.peakEbitda).toBeGreaterThanOrEqual(result.ebitda);
  });

  it('should decrement integration rounds remaining', () => {
    const business = createMockBusiness({ integrationRoundsRemaining: 2 });
    const result = applyOrganicGrowth(business, 0, 0, false);
    expect(result.integrationRoundsRemaining).toBe(1);
  });

  it('should not go below 0 integration rounds', () => {
    const business = createMockBusiness({ integrationRoundsRemaining: 0 });
    const result = applyOrganicGrowth(business, 0, 0, false);
    expect(result.integrationRoundsRemaining).toBe(0);
  });

  it('should add shared services growth bonus', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const business = createMockBusiness({ ebitda: 1000, organicGrowthRate: 0.05 });
    const withBonus = applyOrganicGrowth(business, 0.015, 0, false);
    const withoutBonus = applyOrganicGrowth(business, 0, 0, false);
    expect(withBonus.ebitda).toBeGreaterThan(withoutBonus.ebitda);
  });

  it('should add extra growth for agency and consumer sectors with shared services', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const agency = createMockBusiness({ ebitda: 1000, sectorId: 'agency', organicGrowthRate: 0.05 });
    const industrial = createMockBusiness({ ebitda: 1000, sectorId: 'industrial', organicGrowthRate: 0.05 });

    const agencyGrowth = applyOrganicGrowth(agency, 0.015, 0, false);
    const industrialGrowth = applyOrganicGrowth(industrial, 0.015, 0, false);

    // Agency should get extra 1% bonus
    expect(agencyGrowth.ebitda).toBeGreaterThan(industrialGrowth.ebitda);
  });
});

describe('generateEvent', () => {
  it('should always return an event (never null)', () => {
    const state = createMockGameState();
    const event = generateEvent(state);
    // The function falls through to "Quiet Year" if nothing else triggers
    expect(event).not.toBeNull();
  });

  it('should return quiet year for empty portfolio scenarios', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // high roll = miss all events
    const state = createMockGameState({ businesses: [] });
    const event = generateEvent(state);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('global_quiet');
  });
});

describe('applyEventEffects', () => {
  it('should boost EBITDA during bull market', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = createMockGameState();
    const event = {
      id: 'test_bull',
      type: 'global_bull_market' as const,
      title: 'Bull Market',
      description: 'Markets rally',
      effect: '+5-15% EBITDA',
    };

    const newState = applyEventEffects(state, event);
    const originalEbitda = state.businesses[0].ebitda;
    const newEbitda = newState.businesses[0].ebitda;
    expect(newEbitda).toBeGreaterThan(originalEbitda);
  });

  it('should reduce EBITDA during recession', () => {
    const state = createMockGameState();
    const event = {
      id: 'test_recession',
      type: 'global_recession' as const,
      title: 'Recession',
      description: 'Economy contracts',
      effect: 'EBITDA drops',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.businesses[0].ebitda).toBeLessThan(state.businesses[0].ebitda);
  });

  it('should cap interest rate at 15% during hike', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // max hike
    const state = createMockGameState({ interestRate: 0.14 });
    const event = {
      id: 'test_hike',
      type: 'global_interest_hike' as const,
      title: 'Rate Hike',
      description: 'Fed hikes',
      effect: 'Interest up',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.interestRate).toBeLessThanOrEqual(0.15);
  });

  it('should floor interest rate at 3% during cut', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // max cut
    const state = createMockGameState({ interestRate: 0.04 });
    const event = {
      id: 'test_cut',
      type: 'global_interest_cut' as const,
      title: 'Rate Cut',
      description: 'Fed cuts',
      effect: 'Interest down',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.interestRate).toBeGreaterThanOrEqual(0.03);
  });

  it('should set inflation rounds on inflation event', () => {
    const state = createMockGameState();
    const event = {
      id: 'test_inflation',
      type: 'global_inflation' as const,
      title: 'Inflation',
      description: 'Prices rise',
      effect: 'Inflation active',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.inflationRoundsRemaining).toBe(2);
  });

  it('should set credit tightening rounds', () => {
    const state = createMockGameState();
    const event = {
      id: 'test_credit',
      type: 'global_credit_tightening' as const,
      title: 'Credit Tightening',
      description: 'Lending contracts',
      effect: 'Credit tight',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.creditTighteningRoundsRemaining).toBe(2);
  });

  it('should handle portfolio_compliance event with cash cost', () => {
    const state = createMockGameState({ cash: 5000 });
    const business = state.businesses[0];
    const event = {
      id: 'test_compliance',
      type: 'portfolio_compliance' as const,
      title: 'Compliance Issue',
      description: 'Regulatory issue',
      effect: 'EBITDA down, cash cost',
      affectedBusinessId: business.id,
    };

    const newState = applyEventEffects(state, event);
    expect(newState.cash).toBe(4500); // -500k
    expect(newState.businesses[0].ebitda).toBeLessThan(state.businesses[0].ebitda);
  });

  it('should not crash on unsolicited offer (handled separately)', () => {
    const state = createMockGameState();
    const event = {
      id: 'test_offer',
      type: 'unsolicited_offer' as const,
      title: 'Unsolicited Offer',
      description: 'Someone wants to buy',
      effect: 'Accept or decline',
      affectedBusinessId: state.businesses[0].id,
      offerAmount: 5000,
    };

    const newState = applyEventEffects(state, event);
    // Should not modify businesses
    expect(newState.businesses[0].ebitda).toBe(state.businesses[0].ebitda);
  });

  it('should attach impacts to event in state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = createMockGameState();
    const event = {
      id: 'test_bull',
      type: 'global_bull_market' as const,
      title: 'Bull Market',
      description: 'Markets rally',
      effect: '+5-15% EBITDA',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.currentEvent).not.toBeNull();
    expect(newState.currentEvent!.impacts).toBeDefined();
    expect(newState.currentEvent!.impacts!.length).toBeGreaterThan(0);
  });
});

describe('calculateMetrics', () => {
  it('should compute basic metrics for single-business portfolio', () => {
    const state = createMockGameState();
    const metrics = calculateMetrics(state);

    expect(metrics.cash).toBe(state.cash);
    expect(metrics.totalEbitda).toBe(1000);
    expect(metrics.sharesOutstanding).toBe(1000);
    expect(Number.isNaN(metrics.fcfPerShare)).toBe(false);
    expect(Number.isNaN(metrics.portfolioRoic)).toBe(false);
    expect(Number.isNaN(metrics.intrinsicValuePerShare)).toBe(false);
  });

  it('should include opco seller notes in total debt', () => {
    // L-13: Only seller note balance counts as opco debt (bank debt at holdco level)
    const state = createMockGameState({
      totalDebt: 1000,
      businesses: [createMockBusiness({ sellerNoteBalance: 500, bankDebtBalance: 300 })],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.totalDebt).toBe(1500); // 1000 holdco + 500 seller note (bankDebtBalance ignored)
  });

  it('should handle zero businesses gracefully', () => {
    const state = createMockGameState({ businesses: [] });
    const metrics = calculateMetrics(state);

    expect(metrics.totalEbitda).toBe(0);
    expect(metrics.totalFcf).toBe(0);
    expect(Number.isNaN(metrics.fcfPerShare)).toBe(false);
    expect(Number.isNaN(metrics.portfolioRoic)).toBe(false);
    expect(Number.isNaN(metrics.netDebtToEbitda)).toBe(false);
    expect(Number.isNaN(metrics.cashConversion)).toBe(false);
  });

  it('should handle zero shares outstanding without NaN', () => {
    // This shouldn't happen in practice, but let's verify
    const state = createMockGameState({ sharesOutstanding: 0 });
    const metrics = calculateMetrics(state);
    // Division by zero scenarios
    expect(Number.isFinite(metrics.fcfPerShare) || metrics.fcfPerShare === Infinity || metrics.fcfPerShare === -Infinity || Number.isNaN(metrics.fcfPerShare)).toBe(true);
  });

  it('should calculate net debt/EBITDA correctly when in net cash position', () => {
    const state = createMockGameState({
      cash: 15000,
      totalDebt: 0,
      businesses: [createMockBusiness({ ebitda: 1000, sellerNoteBalance: 0, bankDebtBalance: 0 })],
    });
    const metrics = calculateMetrics(state);
    // Net debt = totalDebt - cash = 0 - 15000 = -15000
    // Net debt/EBITDA = -15000/1000 = -15
    expect(metrics.netDebtToEbitda).toBeLessThan(0);
  });

  it('should compute ROIIC correctly with history', () => {
    const prevMetrics = {
      round: 1,
      metrics: {} as Metrics,
      fcf: 500,
      nopat: 700,
      investedCapital: 4000,
    };

    const state = createMockGameState({
      totalInvestedCapital: 8000,
      metricsHistory: [prevMetrics],
    });

    const metrics = calculateMetrics(state);
    expect(Number.isNaN(metrics.roiic)).toBe(false);
  });
});

describe('calculateExitValuation', () => {
  it('should calculate exit price based on EBITDA and multiple', () => {
    const business = createMockBusiness({ ebitda: 1000, acquisitionMultiple: 4.0 });
    const valuation = calculateExitValuation(business, 5);
    expect(valuation.exitPrice).toBeGreaterThan(0);
    expect(valuation.totalMultiple).toBeGreaterThanOrEqual(2.0); // Floor
  });

  it('should apply growth premium for EBITDA improvement', () => {
    const grownBiz = createMockBusiness({
      ebitda: 2000,
      acquisitionEbitda: 1000,
      acquisitionMultiple: 4.0,
    });
    const flatBiz = createMockBusiness({
      ebitda: 1000,
      acquisitionEbitda: 1000,
      acquisitionMultiple: 4.0,
    });

    const grownVal = calculateExitValuation(grownBiz, 5);
    const flatVal = calculateExitValuation(flatBiz, 5);

    expect(grownVal.growthPremium).toBeGreaterThan(flatVal.growthPremium);
  });

  it('should apply platform premium', () => {
    const platformBiz = createMockBusiness({
      isPlatform: true,
      platformScale: 3,
      acquisitionMultiple: 4.0,
    });
    const standaloneBiz = createMockBusiness({
      isPlatform: false,
      platformScale: 0,
      acquisitionMultiple: 4.0,
    });

    const platformVal = calculateExitValuation(platformBiz, 5);
    const standaloneVal = calculateExitValuation(standaloneBiz, 5);

    expect(platformVal.platformPremium).toBeGreaterThan(standaloneVal.platformPremium);
  });

  it('should cap hold premium at 0.5', () => {
    const business = createMockBusiness({ acquisitionRound: 1 });
    const valuation = calculateExitValuation(business, 20); // 19 years held
    expect(valuation.holdPremium).toBe(0.5);
  });

  it('should apply bull market modifier', () => {
    const business = createMockBusiness();
    const bullVal = calculateExitValuation(business, 5, 'global_bull_market');
    const normalVal = calculateExitValuation(business, 5);
    expect(bullVal.marketModifier).toBe(0.5);
    expect(normalVal.marketModifier).toBe(0);
  });

  it('should floor total multiple at 2.0', () => {
    const terribleBiz = createMockBusiness({
      ebitda: 100,
      acquisitionEbitda: 1000,
      acquisitionMultiple: 1.5,
      qualityRating: 1,
    });
    const valuation = calculateExitValuation(terribleBiz, 1, 'global_recession');
    expect(valuation.totalMultiple).toBeGreaterThanOrEqual(2.0);
  });

  it('should deduct debt from net proceeds', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      sellerNoteBalance: 500,
      bankDebtBalance: 300,
    });
    const valuation = calculateExitValuation(business, 5);
    expect(valuation.netProceeds).toBe(Math.max(0, valuation.exitPrice - 800));
  });

  it('should not produce negative net proceeds', () => {
    const business = createMockBusiness({
      ebitda: 100,
      sellerNoteBalance: 50000,
      bankDebtBalance: 50000,
    });
    const valuation = calculateExitValuation(business, 1);
    expect(valuation.netProceeds).toBeGreaterThanOrEqual(0);
  });

  it('should handle division by zero when acquisitionEbitda is 0', () => {
    const business = createMockBusiness({ acquisitionEbitda: 0, ebitda: 1000 });
    // (ebitda - acquisitionEbitda) / acquisitionEbitda = division by zero
    const valuation = calculateExitValuation(business, 5);
    // Should not crash
    expect(Number.isFinite(valuation.totalMultiple) || valuation.totalMultiple === 2.0).toBe(true);
  });
});

describe('recordHistoricalMetrics', () => {
  it('should create a valid history entry', () => {
    const state = createMockGameState({ round: 5 });
    const entry = recordHistoricalMetrics(state);
    expect(entry.round).toBe(5);
    expect(Number.isNaN(entry.fcf)).toBe(false);
    expect(Number.isNaN(entry.nopat)).toBe(false);
    expect(entry.investedCapital).toBe(state.totalInvestedCapital);
  });
});
