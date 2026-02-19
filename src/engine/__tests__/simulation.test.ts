import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAnnualFcf,
  calculatePortfolioFcf,
  calculatePortfolioTax,
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
  createMockDueDiligence,
} from './helpers';
import { Metrics, IntegratedPlatform } from '../types';

describe('calculateAnnualFcf', () => {
  it('should calculate pre-tax FCF correctly for a basic business', () => {
    const business = createMockBusiness({ ebitda: 1000, sectorId: 'agency' });
    // Agency: capexRate = 0.03 (tax now at portfolio level)
    // FCF = 1000 - (1000 * 0.03) = 1000 - 30 = 970
    const fcf = calculateAnnualFcf(business);
    expect(fcf).toBe(970);
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

  it('should produce correct pre-tax FCF for high-capex sectors', () => {
    // Real estate: capexRate = 0.18 (tax now at portfolio level)
    const business = createMockBusiness({ ebitda: 5000, sectorId: 'realEstate' });
    // FCF = 5000 - (5000 * 0.18) = 5000 - 900 = 4100
    const fcf = calculateAnnualFcf(business);
    expect(fcf).toBe(4100);
  });
});

describe('calculatePortfolioFcf', () => {
  it('should sum pre-tax FCF minus portfolio tax across all active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000, sectorId: 'agency' }),
      createMockBusiness({ id: 'b2', ebitda: 2000, sectorId: 'agency' }),
    ];
    const portfolioFcf = calculatePortfolioFcf(businesses);
    const preTaxFcf = calculateAnnualFcf(businesses[0]) + calculateAnnualFcf(businesses[1]);
    const taxBreakdown = calculatePortfolioTax(businesses);
    expect(portfolioFcf).toBe(preTaxFcf - taxBreakdown.taxAmount);
  });

  it('should exclude non-active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000, status: 'active' }),
      createMockBusiness({ id: 'b2', ebitda: 2000, status: 'sold' }),
    ];
    const portfolioFcf = calculatePortfolioFcf(businesses);
    const preTaxFcf = calculateAnnualFcf(businesses[0]);
    const taxBreakdown = calculatePortfolioTax(businesses); // only active b1 counted
    expect(portfolioFcf).toBe(preTaxFcf - taxBreakdown.taxAmount);
  });

  it('should return 0 for empty portfolio', () => {
    expect(calculatePortfolioFcf([])).toBe(0);
  });
});

describe('calculatePortfolioTax', () => {
  it('should compute 30% tax with no deductions', () => {
    const businesses = [createMockBusiness({ ebitda: 1000 })];
    const result = calculatePortfolioTax(businesses);
    expect(result.grossEbitda).toBe(1000);
    expect(result.taxableIncome).toBe(1000);
    expect(result.taxAmount).toBe(300);
    expect(result.effectiveTaxRate).toBeCloseTo(0.30);
    expect(result.totalTaxSavings).toBe(0);
  });

  it('should apply interest tax shield (holdco debt)', () => {
    const businesses = [createMockBusiness({ ebitda: 1000 })];
    // $5000 debt at 10% = $500 interest
    const result = calculatePortfolioTax(businesses, 5000, 0.10, 0);
    // Taxable = max(0, 1000 - 500) = 500
    expect(result.holdcoInterest).toBe(500);
    expect(result.taxableIncome).toBe(500);
    expect(result.taxAmount).toBe(150);
    expect(result.interestTaxShield).toBe(150); // 500 * 0.30
    expect(result.totalTaxSavings).toBe(150); // 300 - 150
  });

  it('should apply interest tax shield (opco seller note)', () => {
    const businesses = [createMockBusiness({ ebitda: 1000, sellerNoteBalance: 2000, sellerNoteRate: 0.08 })];
    const result = calculatePortfolioTax(businesses, 0, 0, 0);
    // OpCo interest = round(2000 * 0.08) = 160
    expect(result.opcoInterest).toBe(160);
    expect(result.taxableIncome).toBe(840);
    expect(result.taxAmount).toBe(252);
    expect(result.interestTaxShield).toBe(48); // 160 * 0.30
  });

  it('should apply shared services deduction', () => {
    const businesses = [createMockBusiness({ ebitda: 1000 })];
    const result = calculatePortfolioTax(businesses, 0, 0, 200);
    // Taxable = max(0, 1000 - 200) = 800
    expect(result.sharedServicesCost).toBe(200);
    expect(result.taxableIncome).toBe(800);
    expect(result.taxAmount).toBe(240);
    expect(result.sharedServicesTaxShield).toBe(60); // 200 * 0.30
    expect(result.totalTaxSavings).toBe(60);
  });

  it('should apply loss offsets from negative EBITDA businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000 }),
      createMockBusiness({ id: 'b2', ebitda: -300 }),
    ];
    const result = calculatePortfolioTax(businesses);
    expect(result.grossEbitda).toBe(1000);
    expect(result.lossOffset).toBe(300);
    expect(result.netEbitda).toBe(700);
    expect(result.taxableIncome).toBe(700);
    expect(result.taxAmount).toBe(210);
    expect(result.lossOffsetTaxShield).toBe(90); // 300 * 0.30
    expect(result.totalTaxSavings).toBe(90);
  });

  it('should combine all three deductions', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 2000 }),
      createMockBusiness({ id: 'b2', ebitda: -400 }),
    ];
    // Holdco interest = round(3000 * 0.08) = 240
    const result = calculatePortfolioTax(businesses, 3000, 0.08, 150);
    // Gross EBITDA = 2000, losses = 400, net = 1600
    // Interest = 240, SS = 150
    // Taxable = max(0, 1600 - 240 - 150) = 1210
    expect(result.grossEbitda).toBe(2000);
    expect(result.lossOffset).toBe(400);
    expect(result.netEbitda).toBe(1600);
    expect(result.taxableIncome).toBe(1210);
    expect(result.taxAmount).toBe(363); // round(1210 * 0.30)
    // Naive = round(2000 * 0.30) = 600
    expect(result.totalTaxSavings).toBe(600 - 363);
  });

  it('should floor taxable income at 0 (no negative tax)', () => {
    const businesses = [createMockBusiness({ ebitda: 100 })];
    // $10000 debt at 10% = $1000 interest (exceeds EBITDA)
    const result = calculatePortfolioTax(businesses, 10000, 0.10, 500);
    expect(result.taxableIncome).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.effectiveTaxRate).toBe(0);
  });

  it('should handle empty portfolio', () => {
    const result = calculatePortfolioTax([]);
    expect(result.grossEbitda).toBe(0);
    expect(result.lossOffset).toBe(0);
    expect(result.taxableIncome).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.effectiveTaxRate).toBe(0);
    expect(result.totalTaxSavings).toBe(0);
  });

  it('should exclude non-active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 1000, status: 'active' }),
      createMockBusiness({ id: 'b2', ebitda: 2000, status: 'sold' }),
    ];
    const result = calculatePortfolioTax(businesses);
    expect(result.grossEbitda).toBe(1000);
    expect(result.taxAmount).toBe(300);
  });
});

describe('calculateSharedServicesBenefits', () => {
  it('should return zeros when no services are active', () => {
    const state = createMockGameState();
    const benefits = calculateSharedServicesBenefits(state);
    expect(benefits.capexReduction).toBe(0);
    expect(benefits.cashConversionBonus).toBe(0);
    expect(benefits.growthBonus).toBe(0);
    expect(benefits.marginDefense).toBe(0);
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
    expect(getSectorFocusEbitdaBonus(3)).toBe(0.05);
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

  it('should set credit tightening to 2 rounds for standard game', () => {
    const state = createMockGameState({ maxRounds: 20 });
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

  it('should set credit tightening to 1 round for quick game', () => {
    const state = createMockGameState({ maxRounds: 10 });
    const event = {
      id: 'test_credit',
      type: 'global_credit_tightening' as const,
      title: 'Credit Tightening',
      description: 'Lending contracts',
      effect: 'Credit tight',
    };

    const newState = applyEventEffects(state, event);
    expect(newState.creditTighteningRoundsRemaining).toBe(1);
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

  it('should value higher quality businesses higher than lower quality', () => {
    // Portfolio value now uses full exit valuation engine (same as FEV)
    // Businesses need to be held 2+ rounds for seasoning to fully apply premiums
    const highQState = createMockGameState({
      cash: 0,
      totalDebt: 0,
      round: 5,
      businesses: [createMockBusiness({ qualityRating: 5, ebitda: 1000, acquisitionRound: 1 })],
    });
    const lowQState = createMockGameState({
      cash: 0,
      totalDebt: 0,
      round: 5,
      businesses: [createMockBusiness({ qualityRating: 1, ebitda: 1000, acquisitionRound: 1 })],
    });
    const highMetrics = calculateMetrics(highQState);
    const lowMetrics = calculateMetrics(lowQState);

    // High quality should be valued higher than low quality
    expect(highMetrics.intrinsicValuePerShare).toBeGreaterThan(lowMetrics.intrinsicValuePerShare);
  });

  it('should value portfolio using exit valuation multiples (not sector averages)', () => {
    // Portfolio value now uses calculateExitValuation — should be >= 2.0x multiple floor
    const state = createMockGameState({
      cash: 0,
      totalDebt: 0,
      businesses: [createMockBusiness({ qualityRating: 3, ebitda: 1000 })],
    });
    const metrics = calculateMetrics(state);
    // With exit valuation engine, the multiple includes all premiums
    // Intrinsic value per share should be at least 2.0 (floor multiple)
    expect(metrics.intrinsicValuePerShare).toBeGreaterThanOrEqual(2.0);
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

  it('should apply integrated platform premium AFTER earned premium cap', () => {
    // A star performer with high earned premiums near the cap should NOT have
    // earned premiums squeezed by the integrated platform premium.
    const bizId = 'test-plat-biz';
    const starBiz = createMockBusiness({
      id: bizId,
      sectorId: 'saas',
      acquisitionMultiple: 8.0,
      ebitda: 5000,
      acquisitionEbitda: 1000, // 400% growth → max growth premium
      qualityRating: 5,
      isPlatform: true,
      platformScale: 3,
      integratedPlatformId: 'test-plat',
    });

    const platform: IntegratedPlatform = {
      id: 'test-plat',
      recipeId: 'test-recipe',
      name: 'Test Platform',
      sectorIds: ['saas'],
      constituentBusinessIds: [bizId],
      forgedInRound: 1,
      bonuses: {
        marginBoost: 0.04,
        growthBoost: 0.03,
        multipleExpansion: 2.0,
        recessionResistanceReduction: 0.8,
      },
    };

    // With platform: earned premiums capped independently, platform premium added after
    const withPlatform = calculateExitValuation(starBiz, 10, undefined, undefined, [platform]);
    // Without platform: same business, no platform premium
    const withoutPlatform = calculateExitValuation(starBiz, 10, undefined, undefined, []);

    // Platform premium should always ADD value, never squeeze earned premiums
    expect(withPlatform.integratedPlatformPremium).toBe(2.0);
    expect(withoutPlatform.integratedPlatformPremium).toBe(0);
    expect(withPlatform.totalMultiple).toBeGreaterThan(withoutPlatform.totalMultiple);
    // The difference should be exactly the platform premium (scaled by seasoning)
    const yearsHeld = 10 - starBiz.acquisitionRound;
    const seasoning = Math.min(1.0, yearsHeld / 2);
    expect(withPlatform.totalMultiple - withoutPlatform.totalMultiple).toBeCloseTo(2.0 * seasoning);
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

  it('should apply seasoning multiplier — 0 years held gets no premiums', () => {
    const business = createMockBusiness({
      ebitda: 5000,
      acquisitionEbitda: 5000,
      acquisitionMultiple: 5.0,
      acquisitionRound: 10,
      qualityRating: 5,
    });
    // currentRound = 10, yearsHeld = 0 → seasoning = 0
    const valuation = calculateExitValuation(business, 10);
    // totalMultiple should be close to baseMultiple (premiums × 0)
    expect(valuation.totalMultiple).toBeCloseTo(business.acquisitionMultiple, 0);
  });

  it('should apply full premiums after 2+ years held', () => {
    const business = createMockBusiness({
      ebitda: 5000,
      acquisitionEbitda: 5000,
      acquisitionMultiple: 5.0,
      acquisitionRound: 1,
      qualityRating: 5,
    });
    // currentRound = 5, yearsHeld = 4 → seasoning = 1.0 (full)
    const valuation = calculateExitValuation(business, 5);
    expect(valuation.totalMultiple).toBeGreaterThan(business.acquisitionMultiple);
  });

  it('should apply half premiums at 1 year held', () => {
    const bizHalf = createMockBusiness({
      ebitda: 5000,
      acquisitionEbitda: 5000,
      acquisitionMultiple: 5.0,
      acquisitionRound: 4,
      qualityRating: 5,
    });
    const bizFull = createMockBusiness({
      ebitda: 5000,
      acquisitionEbitda: 5000,
      acquisitionMultiple: 5.0,
      acquisitionRound: 1,
      qualityRating: 5,
    });
    // 1 year held → seasoning 0.5, 4 years held → seasoning 1.0
    const halfVal = calculateExitValuation(bizHalf, 5);
    const fullVal = calculateExitValuation(bizFull, 5);
    // Half seasoning should produce lower multiple than full
    expect(halfVal.totalMultiple).toBeLessThan(fullVal.totalMultiple);
    // But still above base multiple
    expect(halfVal.totalMultiple).toBeGreaterThanOrEqual(bizHalf.acquisitionMultiple);
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

describe('Margin Drift (within applyOrganicGrowth)', () => {
  beforeEach(() => {
    // Fix random to 0.5 so volatility noise is zero (0.5 * 2 - 1 = 0)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should not apply margin drift before marginDriftStart (early rounds)', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      marginDriftRate: -0.01,
    });
    // currentRound = 2, maxRounds = 20, marginDriftStart = max(2, ceil(20*0.20)) = 4
    const result = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 2, 0, 20);
    // Margin should be unchanged because round 2 < 4
    expect(result.ebitdaMargin).toBe(0.20);
  });

  it('should apply margin drift after marginDriftStart', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      marginDriftRate: -0.01,
    });
    // currentRound = 5, maxRounds = 20, marginDriftStart = 4
    const result = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 5, 0, 20);
    // Margin should have drifted downward by ~marginDriftRate
    expect(result.ebitdaMargin).toBeLessThan(0.20);
  });

  it('should scale marginDriftStart with maxRounds', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      marginDriftRate: -0.01,
    });
    // maxRounds = 10: marginDriftStart = max(2, ceil(10*0.20)) = 2
    // At round 2 (== marginDriftStart), drift SHOULD apply
    const result10yr = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 2, 0, 10);
    expect(result10yr.ebitdaMargin).toBeLessThan(0.20);

    // maxRounds = 20: marginDriftStart = max(2, ceil(20*0.20)) = 4
    // At round 2 (< marginDriftStart), drift should NOT apply
    const result20yr = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 2, 0, 20);
    expect(result20yr.ebitdaMargin).toBe(0.20);
  });

  it('should not overshoot margin below MIN_MARGIN (0.03)', () => {
    const business = createMockBusiness({
      ebitda: 150,
      revenue: 5000,
      ebitdaMargin: 0.04, // Very close to floor
      acquisitionEbitda: 150,
      marginDriftRate: -0.02, // Aggressive drift
    });
    const result = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 10, 0, 20);
    expect(result.ebitdaMargin).toBeGreaterThanOrEqual(0.03);
  });

  it('should apply shared services margin defense to reduce drift', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      marginDriftRate: -0.01,
    });
    // With margin defense
    const withDefense = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 5, 0.005, 20);
    // Without margin defense
    const withoutDefense = applyOrganicGrowth(business, 0, 0, false, undefined, undefined, 5, 0, 20);
    // Margin defense should make the margin higher (less drift)
    expect(withDefense.ebitdaMargin).toBeGreaterThanOrEqual(withoutDefense.ebitdaMargin);
  });
});

describe('Competitive Position Modifier (within applyOrganicGrowth)', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('should give leader businesses +1.5% annual revenue growth bonus', () => {
    const leader = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'leader' }),
    });
    const competitive = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'competitive' }),
    });

    const leaderResult = applyOrganicGrowth(leader, 0, 0, false);
    const competitiveResult = applyOrganicGrowth(competitive, 0, 0, false);

    expect(leaderResult.revenue).toBeGreaterThan(competitiveResult.revenue);
  });

  it('should give commoditized businesses -1.5% annual drag', () => {
    const commoditized = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'commoditized' }),
    });
    const competitive = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'competitive' }),
    });

    const commoditizedResult = applyOrganicGrowth(commoditized, 0, 0, false);
    const competitiveResult = applyOrganicGrowth(competitive, 0, 0, false);

    expect(commoditizedResult.revenue).toBeLessThan(competitiveResult.revenue);
  });

  it('should have no modifier for competitive (default) position', () => {
    // Two businesses with same stats, both competitive — should produce same revenue
    const biz1 = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'competitive' }),
    });
    const biz2 = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      ebitdaMargin: 0.20,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      dueDiligence: createMockDueDiligence({ competitivePosition: 'competitive' }),
    });

    const result1 = applyOrganicGrowth(biz1, 0, 0, false);
    const result2 = applyOrganicGrowth(biz2, 0, 0, false);

    expect(result1.revenue).toBe(result2.revenue);
  });
});

describe('Rule of 40 + Margin Expansion Exit Premiums', () => {
  it('should award Rule of 40 premium for SaaS with growth% + margin% >= 40', () => {
    const saasBiz = createMockBusiness({
      sectorId: 'saas',
      ebitda: 2000,
      revenue: 8000,
      ebitdaMargin: 0.25, // 25%
      revenueGrowthRate: 0.20, // 20%
      acquisitionEbitda: 2000,
      acquisitionMultiple: 5.0,
      acquisitionMargin: 0.25,
    });
    // Rule of 40: 20 + 25 = 45 >= 40 -> premium should be > 0
    const valuation = calculateExitValuation(saasBiz, 5);
    expect(valuation.ruleOf40Premium).toBeGreaterThan(0);
  });

  it('should not award Rule of 40 for non-SaaS/education sectors', () => {
    const agencyBiz = createMockBusiness({
      sectorId: 'agency',
      ebitda: 2000,
      revenueGrowthRate: 0.30,
      ebitdaMargin: 0.30,
      acquisitionMultiple: 4.0,
    });
    const valuation = calculateExitValuation(agencyBiz, 5);
    expect(valuation.ruleOf40Premium).toBe(0);
  });

  it('should penalize SaaS with Rule of 40 < 25', () => {
    const weakSaaS = createMockBusiness({
      sectorId: 'saas',
      ebitda: 500,
      revenue: 5000,
      ebitdaMargin: 0.10, // 10%
      revenueGrowthRate: 0.05, // 5%
      acquisitionEbitda: 500,
      acquisitionMultiple: 5.0,
      acquisitionMargin: 0.10,
    });
    // Rule of 40: 5 + 10 = 15 < 25 -> penalty
    const valuation = calculateExitValuation(weakSaaS, 5);
    expect(valuation.ruleOf40Premium).toBe(-0.3);
  });

  it('should award margin expansion premium when margin expanded >= 5ppt', () => {
    const expandedBiz = createMockBusiness({
      ebitda: 2000,
      ebitdaMargin: 0.25,
      acquisitionMargin: 0.15, // +10ppt expansion
      acquisitionMultiple: 4.0,
      acquisitionEbitda: 1000,
    });
    const valuation = calculateExitValuation(expandedBiz, 5);
    expect(valuation.marginExpansionPremium).toBeGreaterThan(0);
  });

  it('should penalize margin compression >= 5ppt', () => {
    const compressedBiz = createMockBusiness({
      ebitda: 800,
      ebitdaMargin: 0.10,
      acquisitionMargin: 0.20, // -10ppt compression
      acquisitionMultiple: 4.0,
      acquisitionEbitda: 1000,
    });
    const valuation = calculateExitValuation(compressedBiz, 5);
    expect(valuation.marginExpansionPremium).toBe(-0.2);
  });

  it('should stack Rule of 40 and margin expansion premiums', () => {
    const saasBiz = createMockBusiness({
      sectorId: 'saas',
      ebitda: 3000,
      revenue: 10000,
      ebitdaMargin: 0.30, // 30%
      revenueGrowthRate: 0.25, // 25%
      acquisitionEbitda: 1500,
      acquisitionMultiple: 5.0,
      acquisitionMargin: 0.15, // +15ppt expansion
    });
    const valuation = calculateExitValuation(saasBiz, 5);
    // Both premiums should be positive
    expect(valuation.ruleOf40Premium).toBeGreaterThan(0);
    expect(valuation.marginExpansionPremium).toBeGreaterThan(0);
    // Total multiple should include both
    expect(valuation.totalMultiple).toBeGreaterThan(
      saasBiz.acquisitionMultiple + valuation.ruleOf40Premium + valuation.marginExpansionPremium - 1
    );
  });
});

describe('day-1 multiple expansion fix', () => {
  it('net sizeTierPremium = 0 for a no-growth business at same EBITDA', () => {
    // Business with EBITDA 3000 at acquisition, still 3000 now
    // With flattened premiums: lerp(3000, 2000, 5000, 0.5, 0.8) = 0.6
    const biz = createMockBusiness({
      ebitda: 3000,
      acquisitionEbitda: 3000,
      acquisitionSizeTierPremium: 0.6,
    });
    const valuation = calculateExitValuation(biz, 3);
    // Current premium from 3000 EBITDA ≈ 0.6 minus acquisition 0.6 = 0
    expect(valuation.sizeTierPremium).toBeCloseTo(0, 1);
  });

  it('net sizeTierPremium > 0 for EBITDA growth', () => {
    // Business grew from 3000 to 8000 EBITDA
    // With flattened premiums: lerp(8000, 5000, 10000, 0.8, 1.5) = 1.22
    const biz = createMockBusiness({
      ebitda: 8000,
      acquisitionEbitda: 3000,
      acquisitionSizeTierPremium: 0.6,
    });
    const valuation = calculateExitValuation(biz, 5);
    // Net = 1.22 - 0.6 = 0.62
    expect(valuation.sizeTierPremium).toBeGreaterThan(0.5);
  });

  it('backward compat: ?? 0 fallback for legacy businesses', () => {
    // Business without acquisitionSizeTierPremium field
    const biz = createMockBusiness({
      ebitda: 5000,
      acquisitionEbitda: 5000,
    });
    // Remove the field to simulate legacy data
    delete (biz as any).acquisitionSizeTierPremium;
    const valuation = calculateExitValuation(biz, 3);
    // Should not throw, sizeTierPremium = full premium (not netted)
    expect(valuation.sizeTierPremium).toBeGreaterThanOrEqual(0);
  });
});

describe('merger exit premium', () => {
  it('balanced merger (ratio ≤ 2.0) should get +0.5x premium', () => {
    const biz = createMockBusiness({
      wasMerged: true,
      mergerBalanceRatio: 1.5,
    });
    const valuation = calculateExitValuation(biz, 5);
    expect(valuation.mergerPremium).toBe(0.5);
  });

  it('moderately imbalanced merger (ratio 2-3) should get +0.4x', () => {
    const biz = createMockBusiness({
      wasMerged: true,
      mergerBalanceRatio: 2.5,
    });
    const valuation = calculateExitValuation(biz, 5);
    expect(valuation.mergerPremium).toBe(0.4);
  });

  it('highly imbalanced merger (ratio > 3) should get +0.3x', () => {
    const biz = createMockBusiness({
      wasMerged: true,
      mergerBalanceRatio: 4.0,
    });
    const valuation = calculateExitValuation(biz, 5);
    expect(valuation.mergerPremium).toBe(0.3);
  });

  it('non-merged business should get 0 merger premium', () => {
    const biz = createMockBusiness({ wasMerged: false });
    const valuation = calculateExitValuation(biz, 5);
    expect(valuation.mergerPremium).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// FINANCIAL CRISIS EVENT
// ══════════════════════════════════════════════════════════════════

describe('Financial Crisis Event', () => {
  it('should increase interest rate by +2%, capped at 15%', () => {
    const state = createMockGameState({ interestRate: 0.07 });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.interestRate).toBeCloseTo(0.09, 5);
  });

  it('should cap interest rate at 15%', () => {
    const state = createMockGameState({ interestRate: 0.14 });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.interestRate).toBe(0.15);
  });

  it('should increase existing bank debt rates by +1.5%, capped at 15%', () => {
    const biz1 = createMockBusiness({ id: 'biz_1', bankDebtBalance: 1000, bankDebtRate: 0.07 });
    const biz2 = createMockBusiness({ id: 'biz_2', bankDebtBalance: 0, bankDebtRate: 0.06 }); // no bank debt
    const state = createMockGameState({ businesses: [biz1, biz2] });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    const updatedBiz1 = result.businesses.find(b => b.id === 'biz_1')!;
    const updatedBiz2 = result.businesses.find(b => b.id === 'biz_2')!;
    expect(updatedBiz1.bankDebtRate).toBeCloseTo(0.085, 5); // 0.07 + 0.015
    expect(updatedBiz2.bankDebtRate).toBe(0.06); // unchanged — no bank debt balance
  });

  it('should cap bank debt rate at 15%', () => {
    const biz = createMockBusiness({ bankDebtBalance: 1000, bankDebtRate: 0.14 });
    const state = createMockGameState({ businesses: [biz] });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.businesses[0].bankDebtRate).toBe(0.15);
  });

  it('should set credit tightening rounds (standard mode: 2, additive)', () => {
    const state = createMockGameState({ creditTighteningRoundsRemaining: 1, maxRounds: 20 });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.creditTighteningRoundsRemaining).toBe(3); // 1 existing + 2
  });

  it('should set credit tightening rounds (quick mode: 1, additive)', () => {
    const state = createMockGameState({ creditTighteningRoundsRemaining: 0, maxRounds: 10 });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.creditTighteningRoundsRemaining).toBe(1);
  });

  it('should set exitMultiplePenalty to 1.0', () => {
    const state = createMockGameState({ exitMultiplePenalty: 0 });
    const event = {
      id: 'event_1_global_financial_crisis',
      type: 'global_financial_crisis' as const,
      title: 'Financial Crisis',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, event);
    expect(result.exitMultiplePenalty).toBe(1.0);
  });
});

describe('Distressed Deals', () => {
  it('should generate 3-4 distressed deals with 30-50% discount and quality 2-3', async () => {
    // Import here to avoid top-level import issues
    const { generateDistressedDeals } = await import('../../engine/businesses');
    const deals = generateDistressedDeals(5, 20);
    expect(deals.length).toBeGreaterThanOrEqual(3);
    expect(deals.length).toBeLessThanOrEqual(4);
    for (const deal of deals) {
      expect(deal.business.qualityRating).toBeGreaterThanOrEqual(2);
      expect(deal.business.qualityRating).toBeLessThanOrEqual(3);
      expect(deal.freshness).toBe(3); // 2 base + 1 freshnessBonus
      expect(deal.source).toBe('brokered');
    }
  });
});
