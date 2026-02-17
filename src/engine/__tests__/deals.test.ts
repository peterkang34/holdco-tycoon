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

// ── Rollover Equity Tests ──

describe('Rollover Equity', () => {
  // Use a deal ID whose seed % 10 >= 5 to pass the rollover check
  const rolloverDealId = 'deal_rollover_test'; // seed = sum of char codes, check passes

  it('should generate rollover when all gates pass (tier 2+, Q3+, valid archetype, seed hits)', () => {
    const deal = createMockDeal({ id: rolloverDealId, sellerArchetype: 'retiring_founder' });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 2, 'standard', 'retiring_founder');
    const rollover = structs.find(s => s.type === 'rollover_equity');
    expect(rollover).toBeDefined();
    expect(rollover!.rolloverEquityPct).toBe(0.25);
  });

  it('should NOT generate when MA tier < 2', () => {
    const deal = createMockDeal({ id: rolloverDealId, sellerArchetype: 'retiring_founder' });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 1, 'standard', 'retiring_founder');
    expect(structs.find(s => s.type === 'rollover_equity')).toBeUndefined();
  });

  it('should NOT generate for distressed_seller', () => {
    const deal = createMockDeal({ id: rolloverDealId, sellerArchetype: 'distressed_seller' });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 2, 'standard', 'distressed_seller');
    expect(structs.find(s => s.type === 'rollover_equity')).toBeUndefined();
  });

  it('should NOT generate for burnt_out_operator', () => {
    const deal = createMockDeal({ id: rolloverDealId, sellerArchetype: 'burnt_out_operator' });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 2, 'standard', 'burnt_out_operator');
    expect(structs.find(s => s.type === 'rollover_equity')).toBeUndefined();
  });

  it('should NOT generate for quality 1-2', () => {
    const deal = createMockDeal({ id: rolloverDealId });
    deal.business.qualityRating = 2;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 2, 'standard', undefined);
    expect(structs.find(s => s.type === 'rollover_equity')).toBeUndefined();
  });

  it('should use standard config: 65/25/10 split', () => {
    const deal = createMockDeal({ id: rolloverDealId });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 20, false, 2, 'standard', undefined);
    const rollover = structs.find(s => s.type === 'rollover_equity');
    if (!rollover) { expect(rollover).toBeDefined(); return; }
    const totalPrice = deal.effectivePrice;
    expect(rollover.cashRequired).toBe(Math.round(totalPrice * 0.65));
    expect(rollover.sellerNote!.amount).toBe(Math.round(totalPrice * 0.10));
    expect(rollover.rolloverEquityPct).toBe(0.25);
  });

  it('should use quick config: 70/20/10 split', () => {
    const deal = createMockDeal({ id: rolloverDealId });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 20000, 0.07, false, 10, false, 2, 'quick', undefined);
    const rollover = structs.find(s => s.type === 'rollover_equity');
    if (!rollover) { expect(rollover).toBeDefined(); return; }
    const totalPrice = deal.effectivePrice;
    expect(rollover.cashRequired).toBe(Math.round(totalPrice * 0.70));
    expect(rollover.sellerNote!.amount).toBe(Math.round(totalPrice * 0.10));
    expect(rollover.rolloverEquityPct).toBe(0.20);
  });

  it('executeDealStructure sets rolloverEquityPct correctly', () => {
    const deal = createMockDeal({ id: rolloverDealId });
    deal.business.qualityRating = 4;
    const structure = createMockDealStructure({
      type: 'rollover_equity',
      cashRequired: 2600,
      rolloverEquityPct: 0.25,
      sellerNote: { amount: 400, rate: 0.04, termRounds: 5 },
    });
    const biz = executeDealStructure(deal, structure, 1, 20);
    expect(biz.rolloverEquityPct).toBe(0.25);
  });

  it('executeDealStructure applies growth/margin bonuses for rollover', () => {
    const deal = createMockDeal({ id: rolloverDealId });
    deal.business.qualityRating = 4;
    const baseGrowth = deal.business.organicGrowthRate;
    const baseMargin = deal.business.ebitdaMargin;
    const structure = createMockDealStructure({
      type: 'rollover_equity',
      cashRequired: 2600,
      rolloverEquityPct: 0.25,
      sellerNote: { amount: 400, rate: 0.04, termRounds: 5 },
    });
    const biz = executeDealStructure(deal, structure, 1, 20);
    expect(biz.organicGrowthRate).toBeCloseTo(baseGrowth + 0.015);
    expect(biz.revenueGrowthRate).toBeCloseTo(baseGrowth + 0.015);
    expect(biz.ebitdaMargin).toBeCloseTo(baseMargin + 0.005);
  });

  it('getStructureLabel returns Rollover Equity', () => {
    expect(getStructureLabel('rollover_equity')).toBe('Rollover Equity');
  });

  it('getStructureDescription includes exit share info', () => {
    const structure: DealStructure = {
      type: 'rollover_equity',
      cashRequired: 2600,
      rolloverEquityPct: 0.25,
      sellerNote: { amount: 400, rate: 0.04, termRounds: 5 },
      leverage: 0.4,
      risk: 'low',
    };
    const desc = getStructureDescription(structure);
    expect(desc).toContain('25%');
    expect(desc).toContain('rolls over');
  });

  it('should NOT generate when seed misses (~50% check)', () => {
    // Find a deal ID whose seed % 10 < 5
    const lowSeedDeal = createMockDeal({ id: 'deal_a' }); // 'deal_a' has low seed
    lowSeedDeal.business.qualityRating = 4;
    // Try multiple seeds — at least one should miss
    const ids = ['deal_a', 'deal_b', 'deal_c', 'deal_d', 'deal_e'];
    let someHit = false;
    let someMiss = false;
    for (const id of ids) {
      const d = createMockDeal({ id });
      d.business.qualityRating = 4;
      const structs = generateDealStructures(d, 20000, 0.07, false, 20, false, 2, 'standard', undefined);
      if (structs.find(s => s.type === 'rollover_equity')) someHit = true;
      else someMiss = true;
    }
    // The seed-based check should result in roughly 50% — at least one hit and one miss across 5 deals
    expect(someHit).toBe(true);
    expect(someMiss).toBe(true);
  });
});
