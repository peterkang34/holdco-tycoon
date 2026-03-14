import { describe, it, expect } from 'vitest';
import { calculateLendingSynergyDiscount, generateDealStructures } from '../deals';
import { createMockBusiness } from './helpers';
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
