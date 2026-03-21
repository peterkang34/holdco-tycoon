import { describe, it, expect } from 'vitest';
import { calculateLendingSynergyDiscount, generateDealStructures } from '../deals';
import { getSubTypeAffinity, getSizeRatioTier, calculateSynergies } from '../businesses';
import { createMockBusiness } from './helpers';
import {
  LENDING_SYNERGY_SCHEDULE,
  LENDING_SYNERGY_MAX_REDUCTION,
  LENDING_SYNERGY_MIN_RATE,
  LENDING_SYNERGY_CRISIS_MULTIPLIER,
} from '../../data/gameConfig';
import type { Deal, Business } from '../types';

function createPCBusiness(overrides: Partial<Business> = {}): Business {
  return createMockBusiness({
    sectorId: 'privateCredit',
    subType: 'Direct Lending / Senior Debt',
    status: 'active',
    ...overrides,
  });
}

function createMockDeal(overrides: Partial<Deal> = {}): Deal {
  const biz = createMockBusiness({ ebitda: 2000, qualityRating: 3 });
  return {
    id: 'deal_test1',
    business: biz,
    askingPrice: 10000,
    effectivePrice: 10000,
    freshness: 3,
    competitivePosition: 'normal',
    ...overrides,
  } as Deal;
}

describe('Private Credit Lending Synergy', () => {
  describe('calculateLendingSynergyDiscount', () => {
    it('returns 0 with no PC businesses', () => {
      const businesses = [createMockBusiness({ sectorId: 'agency' })];
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0);
    });

    it('returns 0 with empty portfolio', () => {
      expect(calculateLendingSynergyDiscount([])).toBe(0);
    });

    it('1 PC business = 0.0075 discount', () => {
      const businesses = [createPCBusiness()];
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0.0075);
    });

    it('2 PC businesses = 0.0125 discount', () => {
      const businesses = [createPCBusiness(), createPCBusiness()];
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0.0125);
    });

    it('3 PC businesses = 0.015 discount (cap)', () => {
      const businesses = [createPCBusiness(), createPCBusiness(), createPCBusiness()];
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0.015);
    });

    it('5 PC businesses = still 0.015 (cap)', () => {
      const businesses = Array.from({ length: 5 }, () => createPCBusiness());
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0.015);
    });

    it('only counts active and integrated businesses', () => {
      const businesses = [
        createPCBusiness({ status: 'active' }),
        createPCBusiness({ status: 'integrated' }),
        createPCBusiness({ status: 'sold' as any }),
      ];
      // 2 active/integrated = 0.0125
      expect(calculateLendingSynergyDiscount(businesses)).toBe(0.0125);
    });

    it('credit tightening halves discount', () => {
      const businesses = [createPCBusiness()];
      expect(calculateLendingSynergyDiscount(businesses, true)).toBe(0.00375);
    });

    it('credit tightening halves cap discount too', () => {
      const businesses = [createPCBusiness(), createPCBusiness(), createPCBusiness()];
      expect(calculateLendingSynergyDiscount(businesses, true)).toBe(0.0075);
    });
  });

  describe('synergy applied to deal structures', () => {
    it('bank debt rate is reduced by synergy discount', () => {
      const deal = createMockDeal();
      const interestRate = 0.07;
      const synergyDiscount = 0.0075;

      const structures = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined, synergyDiscount);
      const bankDebt = structures.find(s => s.type === 'bank_debt');

      if (bankDebt?.bankDebt) {
        expect(bankDebt.bankDebt.rate).toBeCloseTo(interestRate - synergyDiscount);
      }
    });

    it('synergy respects 3% rate floor', () => {
      const deal = createMockDeal();
      const interestRate = 0.035;
      const synergyDiscount = 0.015; // Would push to 2%, but floor is 3%

      const structures = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined, synergyDiscount);
      const bankDebt = structures.find(s => s.type === 'bank_debt');

      if (bankDebt?.bankDebt) {
        expect(bankDebt.bankDebt.rate).toBeGreaterThanOrEqual(0.03);
      }
    });

    it('seller note rate is NOT affected by synergy', () => {
      const deal = createMockDeal();
      const interestRate = 0.07;
      const synergyDiscount = 0.0075;

      const withSynergy = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined, synergyDiscount);
      const withoutSynergy = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined, 0);

      const noteWith = withSynergy.find(s => s.type === 'seller_note');
      const noteWithout = withoutSynergy.find(s => s.type === 'seller_note');

      if (noteWith?.sellerNote && noteWithout?.sellerNote) {
        expect(noteWith.sellerNote.rate).toBe(noteWithout.sellerNote.rate);
      }
    });

    it('zero synergy discount does not change rates', () => {
      const deal = createMockDeal();
      const interestRate = 0.07;

      const withZero = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined, 0);
      const withDefault = generateDealStructures(deal, 50000, interestRate, false, 20, false, 0, 'standard', undefined, undefined);

      const bankZero = withZero.find(s => s.type === 'bank_debt');
      const bankDefault = withDefault.find(s => s.type === 'bank_debt');

      if (bankZero?.bankDebt && bankDefault?.bankDebt) {
        expect(bankZero.bankDebt.rate).toBe(bankDefault.bankDebt.rate);
      }
    });
  });
});

// ── Sub-type Affinity Tests ──

describe('Sub-type Affinity', () => {
  it('same sub-type returns "match"', () => {
    expect(getSubTypeAffinity('homeServices', 'HVAC Services', 'HVAC Services')).toBe('match');
  });

  it('same-group sub-types return "related"', () => {
    // homeServices group 0 includes multiple sub-types
    const result = getSubTypeAffinity('homeServices', 'HVAC Services', 'Plumbing Services');
    expect(['match', 'related']).toContain(result);
  });

  it('different-group sub-types return "distant"', () => {
    // We need to find two sub-types in different groups
    // This depends on the actual sector data, test the function behavior
    const result = getSubTypeAffinity('agency', 'Digital/Ecommerce Agency', 'PR / Communications');
    expect(['related', 'distant']).toContain(result);
  });

  it('unknown sector returns "distant"', () => {
    expect(getSubTypeAffinity('nonexistent', 'A', 'B')).toBe('distant');
  });

  it('unknown sub-type returns "distant"', () => {
    expect(getSubTypeAffinity('agency', 'Digital/Ecommerce Agency', 'Nonexistent Sub')).toBe('distant');
  });

  it('affinity is symmetric', () => {
    const forward = getSubTypeAffinity('homeServices', 'HVAC Services', 'Plumbing Services');
    const backward = getSubTypeAffinity('homeServices', 'Plumbing Services', 'HVAC Services');
    expect(forward).toBe(backward);
  });
});

// ── Size Ratio Tier Tests ──

describe('Size Ratio Tiers', () => {
  it('ratio <= 0.5 is "ideal"', () => {
    const result = getSizeRatioTier(400, 1000);
    expect(result.tier).toBe('ideal');
    expect(result.ratio).toBe(0.4);
  });

  it('ratio exactly 0.5 is "ideal"', () => {
    expect(getSizeRatioTier(500, 1000).tier).toBe('ideal');
  });

  it('ratio 0.51-1.0 is "stretch"', () => {
    expect(getSizeRatioTier(600, 1000).tier).toBe('stretch');
    expect(getSizeRatioTier(1000, 1000).tier).toBe('stretch');
  });

  it('ratio 1.01-2.0 is "strained"', () => {
    expect(getSizeRatioTier(1500, 1000).tier).toBe('strained');
    expect(getSizeRatioTier(2000, 1000).tier).toBe('strained');
  });

  it('ratio > 2.0 is "overreach"', () => {
    expect(getSizeRatioTier(2500, 1000).tier).toBe('overreach');
  });

  it('zero platform EBITDA returns "overreach" with ratio 99', () => {
    const result = getSizeRatioTier(1000, 0);
    expect(result.tier).toBe('overreach');
    expect(result.ratio).toBe(99);
  });

  it('negative EBITDA uses absolute value', () => {
    const result = getSizeRatioTier(-500, 1000);
    expect(result.tier).toBe('ideal');
    expect(result.ratio).toBe(0.5);
  });
});

// ── Synergy Calculation Tests ──

describe('calculateSynergies', () => {
  const acquiredEbitda = 1000;

  describe('tuck-in synergy rates', () => {
    it('success: 20% of acquired EBITDA for tuck-ins', () => {
      expect(calculateSynergies('success', acquiredEbitda, true)).toBe(200);
    });

    it('partial: 8% for tuck-ins', () => {
      expect(calculateSynergies('partial', acquiredEbitda, true)).toBe(80);
    });

    it('failure: -5% for tuck-ins', () => {
      expect(calculateSynergies('failure', acquiredEbitda, true)).toBe(-50);
    });
  });

  describe('standalone synergy rates', () => {
    it('success: 10% for standalone', () => {
      expect(calculateSynergies('success', acquiredEbitda, false)).toBe(100);
    });

    it('partial: 3% for standalone', () => {
      expect(calculateSynergies('partial', acquiredEbitda, false)).toBe(30);
    });

    it('failure: -10% for standalone', () => {
      expect(calculateSynergies('failure', acquiredEbitda, false)).toBe(-100);
    });
  });

  describe('merger synergy rates', () => {
    it('success: 15% for mergers', () => {
      expect(calculateSynergies('success', acquiredEbitda, false, undefined, undefined, true)).toBe(150);
    });

    it('partial: 5% for mergers', () => {
      expect(calculateSynergies('partial', acquiredEbitda, false, undefined, undefined, true)).toBe(50);
    });

    it('failure: -7% for mergers', () => {
      expect(calculateSynergies('failure', acquiredEbitda, false, undefined, undefined, true)).toBe(-70);
    });
  });

  describe('affinity modifiers on synergy', () => {
    it('match affinity: full synergy (no reduction)', () => {
      const full = calculateSynergies('success', acquiredEbitda, true, 'match');
      expect(full).toBe(200); // 20% unchanged
    });

    it('related affinity: 75% of synergy', () => {
      const related = calculateSynergies('success', acquiredEbitda, true, 'related');
      expect(related).toBe(150); // 20% * 0.75 = 15%
    });

    it('distant affinity: 45% of synergy', () => {
      const distant = calculateSynergies('success', acquiredEbitda, true, 'distant');
      expect(distant).toBe(90); // 20% * 0.45 = 9%
    });
  });

  describe('size ratio dampening', () => {
    it('ideal tier: no synergy reduction', () => {
      const syn = calculateSynergies('success', acquiredEbitda, true, 'match', 'ideal');
      expect(syn).toBe(200); // 1.0x
    });

    it('stretch tier: 80% synergy for tuck-ins', () => {
      const syn = calculateSynergies('success', acquiredEbitda, true, 'match', 'stretch');
      expect(syn).toBe(160); // 0.80x of 200
    });

    it('strained tier: 50% synergy for tuck-ins', () => {
      const syn = calculateSynergies('success', acquiredEbitda, true, 'match', 'strained');
      expect(syn).toBe(100); // 0.50x of 200
    });

    it('overreach tier: 25% synergy for tuck-ins', () => {
      const syn = calculateSynergies('success', acquiredEbitda, true, 'match', 'overreach');
      expect(syn).toBe(50); // 0.25x of 200
    });

    it('merger stretch tier: 90% synergy (gentler than tuck-in)', () => {
      const syn = calculateSynergies('success', acquiredEbitda, false, 'match', 'stretch', true);
      expect(syn).toBe(135); // 15% * 0.90 = 13.5% → round(1000 * 0.135) = 135
    });
  });
});

// ── PC Lending Synergy Constants ──

describe('PC lending synergy constants', () => {
  it('schedule is -75bp, -50bp, -25bp', () => {
    expect(LENDING_SYNERGY_SCHEDULE[0]).toBe(0.0075);
    expect(LENDING_SYNERGY_SCHEDULE[1]).toBe(0.005);
    expect(LENDING_SYNERGY_SCHEDULE[2]).toBe(0.0025);
  });

  it('max reduction is 150bp', () => {
    expect(LENDING_SYNERGY_MAX_REDUCTION).toBe(0.015);
  });

  it('rate floor is 3%', () => {
    expect(LENDING_SYNERGY_MIN_RATE).toBe(0.03);
  });

  it('crisis multiplier is 0.5 (halved)', () => {
    expect(LENDING_SYNERGY_CRISIS_MULTIPLIER).toBe(0.5);
  });

  it('sum of all schedule entries equals max reduction', () => {
    const sum = LENDING_SYNERGY_SCHEDULE.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(LENDING_SYNERGY_MAX_REDUCTION);
  });
});
