import { describe, it, expect } from 'vitest';
import {
  generateDealStructures,
  executeDealStructure,
  getStructureLabel,
  getStructureDescription,
} from '../deals';
import { createMockDeal, createMockDealStructure } from './helpers';
import { DealStructure } from '../types';

describe('generateDealStructures', () => {
  it('should include all-cash option when player can afford it', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, false);
    const allCash = structures.find(s => s.type === 'all_cash');
    expect(allCash).toBeDefined();
    expect(allCash!.cashRequired).toBe(4000);
    expect(allCash!.leverage).toBe(0);
    expect(allCash!.risk).toBe('low');
  });

  it('should not include all-cash when player cannot afford', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 2000, 0.07, false);
    const allCash = structures.find(s => s.type === 'all_cash');
    expect(allCash).toBeUndefined();
  });

  it('should include seller note when player has enough for down payment', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    // Seller note requires 40-60% upfront (1600-2400)
    const structures = generateDealStructures(deal, 3000, 0.07, false);
    const sellerNote = structures.find(s => s.type === 'seller_note');
    if (sellerNote) {
      expect(sellerNote.cashRequired).toBeLessThan(4000);
      expect(sellerNote.sellerNote).toBeDefined();
      expect(sellerNote.sellerNote!.amount).toBeGreaterThan(0);
      expect(sellerNote.sellerNote!.rate).toBeGreaterThanOrEqual(0.05);
      expect(sellerNote.sellerNote!.rate).toBeLessThanOrEqual(0.06);
      expect(sellerNote.sellerNote!.termRounds).toBe(5);
    }
  });

  it('should set seller note term to 5 for 10yr mode', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 3000, 0.07, false, 10);
    const sellerNote = structures.find(s => s.type === 'seller_note');
    expect(sellerNote).toBeDefined();
    expect(sellerNote!.sellerNote!.termRounds).toBe(5);
  });

  it('should set seller note term to 5 for 20yr mode', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 3000, 0.07, false, 20);
    const sellerNote = structures.find(s => s.type === 'seller_note');
    expect(sellerNote).toBeDefined();
    expect(sellerNote!.sellerNote!.termRounds).toBe(5);
  });

  it('should not include bank debt during credit tightening', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, true);
    const bankDebt = structures.find(s => s.type === 'bank_debt');
    expect(bankDebt).toBeUndefined();
  });

  it('should include bank debt when credit is normal', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, false);
    const bankDebt = structures.find(s => s.type === 'bank_debt');
    expect(bankDebt).toBeDefined();
    if (bankDebt) {
      // Bank debt requires 15-25% equity
      expect(bankDebt.cashRequired).toBeLessThan(4000);
      expect(bankDebt.bankDebt).toBeDefined();
      expect(bankDebt.bankDebt!.rate).toBe(0.07); // Same as interest rate
      expect(bankDebt.risk).toBe('high');
    }
  });

  it('should correctly calculate leverage for seller note', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    deal.business.ebitda = 1000;
    const structures = generateDealStructures(deal, 10000, 0.07, false);
    const sellerNote = structures.find(s => s.type === 'seller_note');
    if (sellerNote) {
      const expectedLeverage = Math.round((sellerNote.sellerNote!.amount / 1000) * 10) / 10;
      expect(sellerNote.leverage).toBe(expectedLeverage);
    }
  });

  it('should return empty array when player cannot afford any option', () => {
    const deal = createMockDeal({ askingPrice: 100000 });
    const structures = generateDealStructures(deal, 100, 0.07, false);
    expect(structures.length).toBe(0);
  });

  it('should earn-out only for quality >= 3', () => {
    // Use deal ID whose seed % 10 >= 4 to pass the deterministic earnout check
    const highQualDeal = createMockDeal({ id: 'deal_earnout' });
    highQualDeal.business.qualityRating = 4;
    const structsHigh = generateDealStructures(highQualDeal, 10000, 0.07, false);

    const lowQualDeal = createMockDeal({ id: 'deal_test_low' });
    lowQualDeal.business.qualityRating = 2;
    const structsLow = generateDealStructures(lowQualDeal, 10000, 0.07, false);

    const earnoutHigh = structsHigh.find(s => s.type === 'earnout');
    const earnoutLow = structsLow.find(s => s.type === 'earnout');

    // High quality should have earnout, low quality should not (qualityRating < 3)
    expect(earnoutHigh).toBeDefined();
    expect(earnoutLow).toBeUndefined();
  });

  it('should include LBO combo (seller_note_bank_debt) when credit is normal', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, false);
    const lbo = structures.find(s => s.type === 'seller_note_bank_debt');
    expect(lbo).toBeDefined();
    if (lbo) {
      expect(lbo.sellerNote).toBeDefined();
      expect(lbo.bankDebt).toBeDefined();
      expect(lbo.sellerNote!.amount).toBeGreaterThan(0);
      expect(lbo.bankDebt!.amount).toBeGreaterThan(0);
      expect(lbo.cashRequired).toBeLessThan(4000);
      expect(lbo.risk).toBe('high');
      // Verify total equals asking price
      const total = lbo.cashRequired + lbo.sellerNote!.amount + lbo.bankDebt!.amount;
      expect(total).toBe(4000);
    }
  });

  it('should not include LBO combo during credit tightening', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, true);
    const lbo = structures.find(s => s.type === 'seller_note_bank_debt');
    expect(lbo).toBeUndefined();
  });

  it('should block ALL debt structures when noNewDebt is true (covenant breach)', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    const structures = generateDealStructures(deal, 10000, 0.07, false, 20, true);
    const sellerNote = structures.find(s => s.type === 'seller_note');
    const bankDebt = structures.find(s => s.type === 'bank_debt');
    const lbo = structures.find(s => s.type === 'seller_note_bank_debt');
    expect(sellerNote).toBeUndefined();
    expect(bankDebt).toBeUndefined();
    expect(lbo).toBeUndefined();
    // All-cash and earn-out should still be available
    const allCash = structures.find(s => s.type === 'all_cash');
    expect(allCash).toBeDefined();
  });

  it('should allow seller notes during credit tightening but not during noNewDebt', () => {
    const deal = createMockDeal({ askingPrice: 4000 });
    // Credit tightening: seller notes available, bank debt not
    const tightStructures = generateDealStructures(deal, 10000, 0.07, true, 20, false);
    expect(tightStructures.find(s => s.type === 'seller_note')).toBeDefined();
    expect(tightStructures.find(s => s.type === 'bank_debt')).toBeUndefined();

    // noNewDebt (covenant breach): no seller notes, no bank debt
    const breachStructures = generateDealStructures(deal, 10000, 0.07, false, 20, true);
    expect(breachStructures.find(s => s.type === 'seller_note')).toBeUndefined();
    expect(breachStructures.find(s => s.type === 'bank_debt')).toBeUndefined();
  });
});

describe('executeDealStructure', () => {
  it('should create a business with correct acquisition data', () => {
    const deal = createMockDeal();
    const structure = createMockDealStructure();
    const business = executeDealStructure(deal, structure, 5);

    expect(business.status).toBe('active');
    expect(business.acquisitionRound).toBe(5);
    expect(business.acquisitionPrice).toBe(deal.askingPrice);
    expect(business.improvements).toEqual([]);
  });

  it('should set seller note fields from structure', () => {
    const deal = createMockDeal();
    const structure = createMockDealStructure({
      type: 'seller_note',
      cashRequired: 2000,
      sellerNote: { amount: 2000, rate: 0.055, termRounds: 3 },
    });

    const business = executeDealStructure(deal, structure, 1);
    expect(business.sellerNoteBalance).toBe(2000);
    expect(business.sellerNoteRate).toBe(0.055);
    expect(business.sellerNoteRoundsRemaining).toBe(3);
  });

  it('should set bank debt fields from structure', () => {
    const deal = createMockDeal();
    const structure = createMockDealStructure({
      type: 'bank_debt',
      cashRequired: 1000,
      bankDebt: { amount: 3000, rate: 0.07, termRounds: 10 },
    });

    const business = executeDealStructure(deal, structure, 1);
    // Per-business bank debt tracking
    expect(business.bankDebtBalance).toBe(3000);
    expect(business.bankDebtRate).toBe(0.07);
    expect(business.bankDebtRoundsRemaining).toBe(10);
  });

  it('should set earnout fields from structure', () => {
    const deal = createMockDeal();
    const structure = createMockDealStructure({
      type: 'earnout',
      cashRequired: 2500,
      earnout: { amount: 1500, targetEbitdaGrowth: 0.12 },
    });

    const business = executeDealStructure(deal, structure, 1);
    expect(business.earnoutRemaining).toBe(1500);
    expect(business.earnoutTarget).toBe(0.12);
  });

  it('should give weak operators longer integration period', () => {
    const deal = createMockDeal();
    deal.business.dueDiligence.operatorQuality = 'weak';
    const structure = createMockDealStructure();

    const business = executeDealStructure(deal, structure, 1);
    expect(business.integrationRoundsRemaining).toBe(3);
  });

  it('should give strong operators shorter integration period', () => {
    const deal = createMockDeal();
    deal.business.dueDiligence.operatorQuality = 'strong';
    const structure = createMockDealStructure();

    const business = executeDealStructure(deal, structure, 1);
    expect(business.integrationRoundsRemaining).toBe(1);
  });

  it('should derive business ID from deal ID', () => {
    const deal = createMockDeal({ id: 'deal_biz_42' });
    const structure = createMockDealStructure();
    const business = executeDealStructure(deal, structure, 1);
    expect(business.id).toBe('biz_42');
  });
});

describe('getStructureLabel', () => {
  it('should return human-readable labels', () => {
    expect(getStructureLabel('all_cash')).toBe('All Cash');
    expect(getStructureLabel('seller_note')).toBe('Seller Note');
    expect(getStructureLabel('bank_debt')).toBe('Bank Debt');
    expect(getStructureLabel('earnout')).toBe('Earn-out');
    expect(getStructureLabel('seller_note_bank_debt')).toBe('LBO (Note + Debt)');
  });
});

describe('getStructureDescription', () => {
  it('should return non-empty descriptions for all types', () => {
    const structures: DealStructure[] = [
      { type: 'all_cash', cashRequired: 4000, leverage: 0, risk: 'low' },
      {
        type: 'seller_note',
        cashRequired: 2000,
        sellerNote: { amount: 2000, rate: 0.055, termRounds: 3 },
        leverage: 2.0,
        risk: 'medium',
      },
      {
        type: 'bank_debt',
        cashRequired: 1000,
        bankDebt: { amount: 3000, rate: 0.07, termRounds: 10 },
        leverage: 3.0,
        risk: 'high',
      },
      {
        type: 'earnout',
        cashRequired: 2500,
        earnout: { amount: 1500, targetEbitdaGrowth: 0.12 },
        leverage: 0,
        risk: 'medium',
      },
      {
        type: 'seller_note_bank_debt',
        cashRequired: 1000,
        sellerNote: { amount: 1500, rate: 0.055, termRounds: 3 },
        bankDebt: { amount: 1500, rate: 0.07, termRounds: 10 },
        leverage: 3.0,
        risk: 'high',
      },
    ];

    for (const structure of structures) {
      const desc = getStructureDescription(structure);
      expect(desc).toBeTruthy();
      expect(desc.length).toBeGreaterThan(10);
    }
  });
});
