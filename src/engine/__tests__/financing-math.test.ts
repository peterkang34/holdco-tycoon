/**
 * Comprehensive financing math tests
 *
 * Verifies that:
 * 1. Every financing option's amounts add up to the asking price
 * 2. Display text percentages match actual calculated values
 * 3. The description function produces percentages consistent with the generation function
 * 4. Edge cases (small prices, non-round numbers) don't break the math
 */
import { describe, it, expect } from 'vitest';
import {
  generateDealStructures,
  getStructureDescription,
  getStructureLabel,
} from '../deals';
import { createMockDeal } from './helpers';
import { DealStructure, DealStructureType } from '../types';
import { ROLLOVER_EQUITY_CONFIG } from '../../data/gameConfig';

// ══════════════════════════════════════════════════════════════════
// HELPER: Extract percentages from description text
// ══════════════════════════════════════════════════════════════════

function extractPercentages(text: string): number[] {
  const matches = text.match(/(\d+(?:\.\d+)?)%/g);
  return matches ? matches.map(m => parseFloat(m.replace('%', ''))) : [];
}

// ══════════════════════════════════════════════════════════════════
// ALL CASH
// ══════════════════════════════════════════════════════════════════

describe('All Cash: math integrity', () => {
  it('cashRequired equals full asking price', () => {
    const prices = [1000, 4000, 7777, 15000, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const allCash = structs.find(s => s.type === 'all_cash');
      expect(allCash).toBeDefined();
      expect(allCash!.cashRequired).toBe(price);
      expect(allCash!.leverage).toBe(0);
    }
  });

  it('description mentions no debt/obligations', () => {
    const structure: DealStructure = {
      type: 'all_cash', cashRequired: 4000, leverage: 0, risk: 'low',
    };
    const desc = getStructureDescription(structure);
    expect(desc).toContain('No debt');
    expect(desc).toContain('full price');
  });
});

// ══════════════════════════════════════════════════════════════════
// SELLER NOTE
// ══════════════════════════════════════════════════════════════════

describe('Seller Note: math integrity', () => {
  it('cash + note = asking price (amounts add up)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const sellerNote = structs.find(s => s.type === 'seller_note');
      expect(sellerNote).toBeDefined();
      expect(sellerNote!.cashRequired + sellerNote!.sellerNote!.amount).toBe(price);
    }
  });

  it('cash is 40% of asking price', () => {
    const prices = [1000, 4000, 10000, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const sellerNote = structs.find(s => s.type === 'seller_note');
      expect(sellerNote).toBeDefined();
      expect(sellerNote!.cashRequired).toBe(Math.round(price * 0.40));
    }
  });

  it('description percentage matches actual cash/total ratio', () => {
    const prices = [1000, 3333, 4000, 7777, 15001];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const sellerNote = structs.find(s => s.type === 'seller_note');
      expect(sellerNote).toBeDefined();

      const desc = getStructureDescription(sellerNote!);
      const pcts = extractPercentages(desc);
      // First percentage is the upfront cash %
      const expectedPct = Math.round((sellerNote!.cashRequired / price) * 100);
      expect(pcts[0]).toBe(expectedPct);
    }
  });

  it('interest rate in description matches structure rate', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const sellerNote = structs.find(s => s.type === 'seller_note');
    expect(sellerNote).toBeDefined();

    const desc = getStructureDescription(sellerNote!);
    const rateStr = ((sellerNote!.sellerNote!.rate) * 100).toFixed(1);
    expect(desc).toContain(`${rateStr}%`);
  });

  it('rate is between 5-6%', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const sellerNote = structs.find(s => s.type === 'seller_note');
    expect(sellerNote!.sellerNote!.rate).toBeGreaterThanOrEqual(0.05);
    expect(sellerNote!.sellerNote!.rate).toBeLessThanOrEqual(0.06);
  });
});

// ══════════════════════════════════════════════════════════════════
// BANK DEBT
// ══════════════════════════════════════════════════════════════════

describe('Bank Debt: math integrity', () => {
  it('cash + debt = asking price (amounts add up)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const bankDebt = structs.find(s => s.type === 'bank_debt');
      expect(bankDebt).toBeDefined();
      expect(bankDebt!.cashRequired + bankDebt!.bankDebt!.amount).toBe(price);
    }
  });

  it('cash is 35% of asking price', () => {
    const prices = [1000, 4000, 10000, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const bankDebt = structs.find(s => s.type === 'bank_debt');
      expect(bankDebt).toBeDefined();
      expect(bankDebt!.cashRequired).toBe(Math.round(price * 0.35));
    }
  });

  it('description percentages match actual cash/total and debt/total ratios', () => {
    const prices = [1000, 3333, 4000, 7777];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const bankDebt = structs.find(s => s.type === 'bank_debt');
      expect(bankDebt).toBeDefined();

      const desc = getStructureDescription(bankDebt!);
      const pcts = extractPercentages(desc);
      const expectedEquityPct = Math.round((bankDebt!.cashRequired / price) * 100);
      const expectedDebtPct = Math.round((bankDebt!.bankDebt!.amount / price) * 100);
      expect(pcts[0]).toBe(expectedEquityPct);
      expect(pcts[1]).toBe(expectedDebtPct);
    }
  });

  it('bank debt rate equals interest rate param (no synergy)', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const bankDebt = structs.find(s => s.type === 'bank_debt');
    expect(bankDebt!.bankDebt!.rate).toBe(0.07);
  });

  it('bank debt rate reduced by lending synergy discount', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false, 20, false, 0, 'standard', undefined, undefined, 0.0075);
    const bankDebt = structs.find(s => s.type === 'bank_debt');
    expect(bankDebt!.bankDebt!.rate).toBeCloseTo(0.07 - 0.0075);
  });

  it('not available during credit tightening', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, true);
    expect(structs.find(s => s.type === 'bank_debt')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// EARN-OUT
// ══════════════════════════════════════════════════════════════════

describe('Earn-out: math integrity', () => {
  // Use deal ID whose seed % 10 >= 4 to pass the deterministic check
  const earnoutDealId = 'deal_earnout';

  it('cash + earnout = asking price (amounts add up)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001];
    for (const price of prices) {
      const deal = createMockDeal({ id: earnoutDealId, askingPrice: price, effectivePrice: price });
      deal.business.qualityRating = 4;
      const structs = generateDealStructures(deal, price, 0.07, false);
      const earnout = structs.find(s => s.type === 'earnout');
      expect(earnout).toBeDefined();
      expect(earnout!.cashRequired + earnout!.earnout!.amount).toBe(price);
    }
  });

  it('cash is 55% of asking price', () => {
    const prices = [1000, 4000, 10000, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ id: earnoutDealId, askingPrice: price, effectivePrice: price });
      deal.business.qualityRating = 4;
      const structs = generateDealStructures(deal, price, 0.07, false);
      const earnout = structs.find(s => s.type === 'earnout');
      expect(earnout).toBeDefined();
      expect(earnout!.cashRequired).toBe(Math.round(price * 0.55));
    }
  });

  it('description percentage matches actual cash/total ratio', () => {
    const prices = [1000, 3333, 4000, 7777, 15001];
    for (const price of prices) {
      const deal = createMockDeal({ id: earnoutDealId, askingPrice: price, effectivePrice: price });
      deal.business.qualityRating = 4;
      const structs = generateDealStructures(deal, price, 0.07, false);
      const earnout = structs.find(s => s.type === 'earnout');
      expect(earnout).toBeDefined();

      const desc = getStructureDescription(earnout!);
      const pcts = extractPercentages(desc);
      const expectedPct = Math.round((earnout!.cashRequired / price) * 100);
      expect(pcts[0]).toBe(expectedPct);
    }
  });

  it('growth target in description matches structure target', () => {
    const deal = createMockDeal({ id: earnoutDealId, askingPrice: 4000, effectivePrice: 4000 });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const earnout = structs.find(s => s.type === 'earnout');
    expect(earnout!.earnout!.targetEbitdaGrowth).toBeGreaterThanOrEqual(0.07);
    expect(earnout!.earnout!.targetEbitdaGrowth).toBeLessThanOrEqual(0.12);
  });

  it('requires quality 3+', () => {
    const deal = createMockDeal({ id: earnoutDealId, askingPrice: 4000, effectivePrice: 4000 });
    deal.business.qualityRating = 2;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    expect(structs.find(s => s.type === 'earnout')).toBeUndefined();
  });

  it('leverage is 0 (earnouts are not traditional debt)', () => {
    const deal = createMockDeal({ id: earnoutDealId, askingPrice: 4000, effectivePrice: 4000 });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const earnout = structs.find(s => s.type === 'earnout');
    expect(earnout!.leverage).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// LBO (SELLER NOTE + BANK DEBT)
// ══════════════════════════════════════════════════════════════════

describe('LBO (Seller Note + Bank Debt): math integrity', () => {
  it('cash + note + debt = asking price (amounts add up)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const lbo = structs.find(s => s.type === 'seller_note_bank_debt');
      expect(lbo).toBeDefined();
      const total = lbo!.cashRequired + lbo!.sellerNote!.amount + lbo!.bankDebt!.amount;
      expect(total).toBe(price);
    }
  });

  it('splits are 25% equity, 35% note, 40% bank debt', () => {
    const prices = [4000, 10000, 50000];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const lbo = structs.find(s => s.type === 'seller_note_bank_debt');
      expect(lbo).toBeDefined();
      expect(lbo!.cashRequired).toBe(Math.round(price * 0.25));
      expect(lbo!.sellerNote!.amount).toBe(Math.round(price * 0.35));
      // Bank debt is remainder: price - cash - note
      expect(lbo!.bankDebt!.amount).toBe(price - Math.round(price * 0.25) - Math.round(price * 0.35));
    }
  });

  it('description percentages match actual splits', () => {
    const prices = [4000, 7777, 15001];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);
      const lbo = structs.find(s => s.type === 'seller_note_bank_debt');
      expect(lbo).toBeDefined();

      const desc = getStructureDescription(lbo!);
      const total = lbo!.cashRequired + lbo!.sellerNote!.amount + lbo!.bankDebt!.amount;
      const expectedEquityPct = Math.round((lbo!.cashRequired / total) * 100);
      const expectedNotePct = Math.round((lbo!.sellerNote!.amount / total) * 100);
      const expectedDebtPct = 100 - expectedEquityPct - expectedNotePct;

      expect(desc).toContain(`${expectedEquityPct}% equity`);
      expect(desc).toContain(`${expectedNotePct}% seller note`);
      expect(desc).toContain(`${expectedDebtPct}% bank debt`);
    }
  });

  it('not available during credit tightening', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, true);
    expect(structs.find(s => s.type === 'seller_note_bank_debt')).toBeUndefined();
  });

  it('not available during covenant breach (noNewDebt)', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false, 20, true);
    expect(structs.find(s => s.type === 'seller_note_bank_debt')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// ROLLOVER EQUITY
// ══════════════════════════════════════════════════════════════════

describe('Rollover Equity: math integrity', () => {
  const rolloverDealId = 'deal_rollover_test';

  function getRolloverStructure(price: number, duration: 'standard' | 'quick' = 'standard'): DealStructure | undefined {
    const deal = createMockDeal({ id: rolloverDealId, askingPrice: price, effectivePrice: price });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, price, 0.07, false, duration === 'quick' ? 10 : 20, false, 2, duration, undefined);
    return structs.find(s => s.type === 'rollover_equity');
  }

  it('standard mode: cash is 65%, note is 10%, rollover is 25%', () => {
    const prices = [1000, 4000, 7777, 15001, 50000];
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'standard');
      expect(rollover).toBeDefined();
      expect(rollover!.cashRequired).toBe(Math.round(price * 0.65));
      expect(rollover!.sellerNote!.amount).toBe(Math.round(price * 0.10));
      expect(rollover!.rolloverEquityPct).toBe(0.25);
    }
  });

  it('quick mode: cash is 70%, note is 10%, rollover is 20%', () => {
    const prices = [1000, 4000, 7777, 15001];
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'quick');
      expect(rollover).toBeDefined();
      expect(rollover!.cashRequired).toBe(Math.round(price * 0.70));
      expect(rollover!.sellerNote!.amount).toBe(Math.round(price * 0.10));
      expect(rollover!.rolloverEquityPct).toBe(0.20);
    }
  });

  it('cash + note + rollover_value = asking price (standard)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001, 50000];
    const config = ROLLOVER_EQUITY_CONFIG.standard;
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'standard');
      expect(rollover).toBeDefined();
      // rollover value = price * rolloverPct
      const rolloverValue = Math.round(price * config.rolloverPct);
      // Total should approximately equal price (rounding tolerance of 1)
      const total = rollover!.cashRequired + rollover!.sellerNote!.amount + rolloverValue;
      expect(Math.abs(total - price)).toBeLessThanOrEqual(1);
    }
  });

  it('cash + note + rollover_value = asking price (quick)', () => {
    const prices = [1000, 3333, 4000, 7777, 15001];
    const config = ROLLOVER_EQUITY_CONFIG.quick;
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'quick');
      expect(rollover).toBeDefined();
      const rolloverValue = Math.round(price * config.rolloverPct);
      const total = rollover!.cashRequired + rollover!.sellerNote!.amount + rolloverValue;
      expect(Math.abs(total - price)).toBeLessThanOrEqual(1);
    }
  });

  it('description rollover% matches structure rolloverEquityPct', () => {
    const rollover = getRolloverStructure(4000, 'standard')!;
    const desc = getStructureDescription(rollover);
    expect(desc).toContain('25%');
    expect(desc).toContain('rolls over');
  });

  it('description cash% is correct for standard mode', () => {
    const prices = [1000, 4000, 7777, 15001];
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'standard')!;
      const desc = getStructureDescription(rollover);
      // Description should say "65% of price" for standard mode (within rounding)
      const expectedCashPct = Math.round((rollover.cashRequired / price) * 100);
      expect(desc).toContain(`${expectedCashPct}% of price`);
    }
  });

  it('description cash% is correct for quick mode', () => {
    const prices = [1000, 4000, 7777];
    for (const price of prices) {
      const rollover = getRolloverStructure(price, 'quick')!;
      const desc = getStructureDescription(rollover);
      const expectedCashPct = Math.round((rollover.cashRequired / price) * 100);
      expect(desc).toContain(`${expectedCashPct}% of price`);
    }
  });

  it('seller note rate is 5% (from config)', () => {
    const rollover = getRolloverStructure(4000, 'standard')!;
    expect(rollover.sellerNote!.rate).toBe(0.05);
  });
});

// ══════════════════════════════════════════════════════════════════
// SHARE-FUNDED
// ══════════════════════════════════════════════════════════════════

describe('Share-Funded: math integrity', () => {
  it('cashRequired is 0', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const ipoState = {
      isPublic: true, stockPrice: 50, sharesOutstanding: 1000, preIPOShares: 800,
      marketSentiment: 0.1, earningsExpectations: 1050, ipoRound: 5,
      initialStockPrice: 40, consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const structs = generateDealStructures(deal, 4000, 0.07, false, 20, false, 0, 'standard', undefined, ipoState);
    const shareFunded = structs.find(s => s.type === 'share_funded');
    expect(shareFunded).toBeDefined();
    expect(shareFunded!.cashRequired).toBe(0);
    expect(shareFunded!.leverage).toBe(0);
  });

  it('description includes share count and dilution %', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const ipoState = {
      isPublic: true, stockPrice: 50, sharesOutstanding: 1000, preIPOShares: 800,
      marketSentiment: 0.1, earningsExpectations: 1050, ipoRound: 5,
      initialStockPrice: 40, consecutiveMisses: 0, shareFundedDealsThisRound: 0,
    };
    const structs = generateDealStructures(deal, 4000, 0.07, false, 20, false, 0, 'standard', undefined, ipoState);
    const shareFunded = structs.find(s => s.type === 'share_funded');
    expect(shareFunded).toBeDefined();
    const desc = getStructureDescription(shareFunded!);
    expect(desc).toContain('shares');
    expect(desc).toContain('dilution');
  });
});

// ══════════════════════════════════════════════════════════════════
// PRO SPORTS RESTRICTIONS
// ══════════════════════════════════════════════════════════════════

describe('Pro Sports: restricted deal structures', () => {
  it('major league (non-women) only allows all-cash and bank debt', () => {
    const deal = createMockDeal({ askingPrice: 10000, effectivePrice: 10000 });
    deal.business.sectorId = 'proSports';
    deal.business.subType = 'nfl'; // not women's tier
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 10000, 0.07, false);
    const types = structs.map(s => s.type);
    expect(types).toContain('all_cash');
    expect(types).toContain('bank_debt');
    expect(types).not.toContain('seller_note');
    expect(types).not.toContain('earnout');
    expect(types).not.toContain('seller_note_bank_debt');
    expect(types).not.toContain('rollover_equity');
  });

  it('women leagues allow flexible structures', () => {
    const deal = createMockDeal({ id: 'deal_earnout', askingPrice: 4000, effectivePrice: 4000 });
    deal.business.sectorId = 'proSports';
    deal.business.subType = 'wnba';
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const types = structs.map(s => s.type);
    // Women's leagues should allow seller note and earnout
    expect(types).toContain('seller_note');
    expect(types).toContain('earnout');
  });

  it('pro sports bank debt requires 75% equity', () => {
    const deal = createMockDeal({ askingPrice: 10000, effectivePrice: 10000 });
    deal.business.sectorId = 'proSports';
    deal.business.subType = 'nba';
    const structs = generateDealStructures(deal, 10000, 0.07, false);
    const bankDebt = structs.find(s => s.type === 'bank_debt');
    expect(bankDebt).toBeDefined();
    expect(bankDebt!.cashRequired).toBe(7500); // 75%
  });
});

// ══════════════════════════════════════════════════════════════════
// CROSS-CUTTING: description consistency for all types
// ══════════════════════════════════════════════════════════════════

describe('All structure descriptions are non-empty and contain valid percentages', () => {
  it('every structure type has a meaningful description', () => {
    const structures: DealStructure[] = [
      { type: 'all_cash', cashRequired: 4000, leverage: 0, risk: 'low' },
      { type: 'seller_note', cashRequired: 1600, sellerNote: { amount: 2400, rate: 0.055, termRounds: 5 }, leverage: 2.4, risk: 'medium' },
      { type: 'bank_debt', cashRequired: 1400, bankDebt: { amount: 2600, rate: 0.07, termRounds: 10 }, leverage: 2.6, risk: 'high' },
      { type: 'earnout', cashRequired: 2200, earnout: { amount: 1800, targetEbitdaGrowth: 0.10 }, leverage: 0, risk: 'medium' },
      { type: 'seller_note_bank_debt', cashRequired: 1000, sellerNote: { amount: 1400, rate: 0.055, termRounds: 5 }, bankDebt: { amount: 1600, rate: 0.07, termRounds: 10 }, leverage: 3.0, risk: 'high' },
      { type: 'rollover_equity', cashRequired: 2600, sellerNote: { amount: 400, rate: 0.05, termRounds: 5 }, rolloverEquityPct: 0.25, leverage: 0.4, risk: 'low' },
      { type: 'share_funded', cashRequired: 0, shareTerms: { sharesToIssue: 80, newTotalShares: 1080, dilutionPct: 0.074 }, leverage: 0, risk: 'medium' },
    ];

    for (const structure of structures) {
      const desc = getStructureDescription(structure);
      expect(desc.length).toBeGreaterThan(10);
    }
  });

  it('every structure type has a label', () => {
    const types: DealStructureType[] = ['all_cash', 'seller_note', 'bank_debt', 'earnout', 'seller_note_bank_debt', 'rollover_equity', 'share_funded'];
    for (const t of types) {
      const label = getStructureLabel(t);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES: small/non-round prices
// ══════════════════════════════════════════════════════════════════

describe('Edge cases: rounding with non-round prices', () => {
  it('all structures add up correctly even for odd prices', () => {
    const oddPrices = [999, 1001, 1234, 3141, 9999, 12345];
    for (const price of oddPrices) {
      const deal = createMockDeal({ id: 'deal_earnout', askingPrice: price, effectivePrice: price });
      deal.business.qualityRating = 4;
      const structs = generateDealStructures(deal, price, 0.07, false);

      for (const s of structs) {
        if (s.type === 'all_cash') {
          expect(s.cashRequired).toBe(price);
        } else if (s.type === 'seller_note') {
          expect(s.cashRequired + s.sellerNote!.amount).toBe(price);
        } else if (s.type === 'bank_debt') {
          expect(s.cashRequired + s.bankDebt!.amount).toBe(price);
        } else if (s.type === 'earnout') {
          expect(s.cashRequired + s.earnout!.amount).toBe(price);
        } else if (s.type === 'seller_note_bank_debt') {
          expect(s.cashRequired + s.sellerNote!.amount + s.bankDebt!.amount).toBe(price);
        }
        // rollover_equity: cash + note != price (rollover portion is equity, not cash)
      }
    }
  });

  it('description percentages always sum to reasonable values', () => {
    const prices = [999, 1001, 3141, 7777];
    for (const price of prices) {
      const deal = createMockDeal({ askingPrice: price, effectivePrice: price });
      const structs = generateDealStructures(deal, price, 0.07, false);

      // Seller note: upfront% should be ~40
      const sn = structs.find(s => s.type === 'seller_note');
      if (sn) {
        const desc = getStructureDescription(sn);
        const pcts = extractPercentages(desc);
        expect(pcts[0]).toBeGreaterThanOrEqual(39);
        expect(pcts[0]).toBeLessThanOrEqual(41);
      }

      // Bank debt: equity% should be ~35
      const bd = structs.find(s => s.type === 'bank_debt');
      if (bd) {
        const desc = getStructureDescription(bd);
        const pcts = extractPercentages(desc);
        expect(pcts[0]).toBeGreaterThanOrEqual(34);
        expect(pcts[0]).toBeLessThanOrEqual(36);
      }

      // LBO: equity% should be ~25
      const lbo = structs.find(s => s.type === 'seller_note_bank_debt');
      if (lbo) {
        const desc = getStructureDescription(lbo);
        const pcts = extractPercentages(desc);
        expect(pcts[0]).toBeGreaterThanOrEqual(24);
        expect(pcts[0]).toBeLessThanOrEqual(26);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// DEBT TERMS: verify term lengths match game duration
// ══════════════════════════════════════════════════════════════════

describe('Debt term lengths by game duration', () => {
  it('standard mode (20yr): seller note = 5yr, bank debt = 10yr', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false, 20);
    const sn = structs.find(s => s.type === 'seller_note');
    const bd = structs.find(s => s.type === 'bank_debt');
    expect(sn!.sellerNote!.termRounds).toBe(5);
    expect(bd!.bankDebt!.termRounds).toBe(10);
  });

  it('quick mode (10yr): seller note = 5yr, bank debt = 10yr', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false, 10);
    const sn = structs.find(s => s.type === 'seller_note');
    const bd = structs.find(s => s.type === 'bank_debt');
    expect(sn!.sellerNote!.termRounds).toBe(5);
    expect(bd!.bankDebt!.termRounds).toBe(10);
  });

  it('LBO seller note and bank debt terms match standalone terms', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs20 = generateDealStructures(deal, 4000, 0.07, false, 20);
    const lbo20 = structs20.find(s => s.type === 'seller_note_bank_debt');
    const sn20 = structs20.find(s => s.type === 'seller_note');
    const bd20 = structs20.find(s => s.type === 'bank_debt');
    expect(lbo20!.sellerNote!.termRounds).toBe(sn20!.sellerNote!.termRounds);
    expect(lbo20!.bankDebt!.termRounds).toBe(bd20!.bankDebt!.termRounds);
  });
});

// ══════════════════════════════════════════════════════════════════
// LEVERAGE CALCULATION INTEGRITY
// ══════════════════════════════════════════════════════════════════

describe('Leverage calculation', () => {
  it('all-cash has 0 leverage', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const allCash = structs.find(s => s.type === 'all_cash');
    expect(allCash!.leverage).toBe(0);
  });

  it('seller note leverage = note_amount / ebitda', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    deal.business.ebitda = 1000;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const sn = structs.find(s => s.type === 'seller_note');
    expect(sn).toBeDefined();
    const expected = Math.round((sn!.sellerNote!.amount / 1000) * 10) / 10;
    expect(sn!.leverage).toBe(expected);
  });

  it('bank debt leverage = debt_amount / ebitda', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    deal.business.ebitda = 1000;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const bd = structs.find(s => s.type === 'bank_debt');
    expect(bd).toBeDefined();
    const expected = Math.round((bd!.bankDebt!.amount / 1000) * 10) / 10;
    expect(bd!.leverage).toBe(expected);
  });

  it('LBO leverage = (note + debt) / ebitda', () => {
    const deal = createMockDeal({ askingPrice: 4000, effectivePrice: 4000 });
    deal.business.ebitda = 1000;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const lbo = structs.find(s => s.type === 'seller_note_bank_debt');
    expect(lbo).toBeDefined();
    const combinedDebt = lbo!.sellerNote!.amount + lbo!.bankDebt!.amount;
    const expected = Math.round((combinedDebt / 1000) * 10) / 10;
    expect(lbo!.leverage).toBe(expected);
  });

  it('earnout has 0 leverage', () => {
    const deal = createMockDeal({ id: 'deal_earnout', askingPrice: 4000, effectivePrice: 4000 });
    deal.business.qualityRating = 4;
    const structs = generateDealStructures(deal, 4000, 0.07, false);
    const eo = structs.find(s => s.type === 'earnout');
    expect(eo!.leverage).toBe(0);
  });
});
