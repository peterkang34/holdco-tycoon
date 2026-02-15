import { Deal, DealStructure, DealStructureType, Business } from './types';

export function generateDealStructures(
  deal: Deal,
  playerCash: number,
  interestRate: number,
  creditTightening: boolean,
  maxRounds: number = 20,
  noNewDebt: boolean = false,
): DealStructure[] {
  const askingPrice = deal.effectivePrice;
  const structures: DealStructure[] = [];

  // Scale debt terms by game duration
  const sellerNoteTerms = Math.max(4, Math.ceil(maxRounds * 0.25)); // 5 for 20yr, 4 for 10yr
  const bankDebtTerms = Math.max(4, Math.ceil(maxRounds * 0.50));   // 10 for 20yr, 5 for 10yr

  // Seed pseudo-random from deal ID for deterministic structures per deal
  // (prevents structures from changing on re-render)
  const seed = deal.id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const seededRandom = (min: number, max: number) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min);

  // Option A: All Cash (always available if player has enough)
  if (playerCash >= askingPrice) {
    structures.push({
      type: 'all_cash',
      cashRequired: askingPrice,
      leverage: 0,
      risk: 'low',
    });
  }

  // Option B: Cash + Seller Note (usually available)
  const sellerNoteCashPercent = 0.40; // 40% equity
  const sellerNoteCash = Math.round(askingPrice * sellerNoteCashPercent);
  const sellerNoteAmount = askingPrice - sellerNoteCash;
  const sellerNoteRate = 0.05 + seededRandom(0, 0.01); // 5-6%

  if (playerCash >= sellerNoteCash && !noNewDebt) {
    structures.push({
      type: 'seller_note',
      cashRequired: sellerNoteCash,
      sellerNote: {
        amount: sellerNoteAmount,
        rate: sellerNoteRate,
        termRounds: sellerNoteTerms,
      },
      leverage: Math.round((sellerNoteAmount / deal.business.ebitda) * 10) / 10,
      risk: 'medium',
    });
  }

  // Option C: Cash + Bank Debt (not available during credit tightening or covenant breach)
  if (!creditTightening && !noNewDebt) {
    const bankDebtCashPercent = 0.35; // 35% equity
    const bankDebtCash = Math.round(askingPrice * bankDebtCashPercent);
    const bankDebtAmount = askingPrice - bankDebtCash;

    if (playerCash >= bankDebtCash) {
      structures.push({
        type: 'bank_debt',
        cashRequired: bankDebtCash,
        bankDebt: {
          amount: bankDebtAmount,
          rate: interestRate,
          termRounds: bankDebtTerms,
        },
        leverage: Math.round((bankDebtAmount / deal.business.ebitda) * 10) / 10,
        risk: 'high',
      });
    }
  }

  // Option D: Earn-out (available for quality 3+ deals)
  if (deal.business.qualityRating >= 3 && (seed % 10) >= 4) {
    const earnoutUpfrontPercent = 0.55; // 55% upfront
    const earnoutCash = Math.round(askingPrice * earnoutUpfrontPercent);
    const earnoutAmount = askingPrice - earnoutCash;

    if (playerCash >= earnoutCash) {
      structures.push({
        type: 'earnout',
        cashRequired: earnoutCash,
        earnout: {
          amount: earnoutAmount,
          targetEbitdaGrowth: 0.07 + seededRandom(0, 0.05), // 7-12% growth target
        },
        leverage: 0, // Earnouts don't add leverage in the traditional sense
        risk: 'medium',
      });
    }
  }

  // Option E: LBO Combo — Cash + Seller Note + Bank Debt (not available during credit tightening or covenant breach)
  if (!creditTightening && !noNewDebt) {
    const lboCashPercent = 0.25; // 25% equity
    const lboNotePercent = 0.35; // 35% seller note
    const lboCash = Math.round(askingPrice * lboCashPercent);
    const lboNoteAmount = Math.round(askingPrice * lboNotePercent);
    const lboBankAmount = askingPrice - lboCash - lboNoteAmount; // remainder as bank debt
    const lboNoteRate = 0.05 + seededRandom(0, 0.01); // 5-6%

    if (playerCash >= lboCash && lboBankAmount > 0) {
      const combinedDebt = lboNoteAmount + lboBankAmount;
      structures.push({
        type: 'seller_note_bank_debt',
        cashRequired: lboCash,
        sellerNote: {
          amount: lboNoteAmount,
          rate: lboNoteRate,
          termRounds: sellerNoteTerms,
        },
        bankDebt: {
          amount: lboBankAmount,
          rate: interestRate,
          termRounds: bankDebtTerms,
        },
        leverage: Math.round((combinedDebt / deal.business.ebitda) * 10) / 10,
        risk: 'high',
      });
    }
  }

  return structures;
}

export function executeDealStructure(
  deal: Deal,
  structure: DealStructure,
  round: number
): Business {
  const business: Business = {
    ...deal.business,
    id: deal.id.replace('deal_', ''),
    acquisitionRound: round,
    improvements: [],
    status: 'active',
    acquisitionPrice: deal.effectivePrice,
    sellerNoteBalance: structure.sellerNote?.amount ?? 0,
    sellerNoteRate: structure.sellerNote?.rate ?? 0,
    sellerNoteRoundsRemaining: structure.sellerNote?.termRounds ?? 0,
    bankDebtBalance: structure.bankDebt?.amount ?? 0,
    bankDebtRate: structure.bankDebt?.rate ?? 0,
    bankDebtRoundsRemaining: structure.bankDebt?.termRounds ?? 0,
    earnoutRemaining: structure.earnout?.amount ?? 0,
    earnoutTarget: structure.earnout?.targetEbitdaGrowth ?? 0,
  };

  // Adjust for operator quality - weak operators mean longer integration
  if (deal.business.dueDiligence.operatorQuality === 'weak') {
    business.integrationRoundsRemaining = 3;
  } else if (deal.business.dueDiligence.operatorQuality === 'strong') {
    business.integrationRoundsRemaining = 1;
  }

  return business;
}

export function getStructureLabel(type: DealStructureType): string {
  switch (type) {
    case 'all_cash':
      return 'All Cash';
    case 'seller_note':
      return 'Seller Note';
    case 'bank_debt':
      return 'Bank Debt';
    case 'earnout':
      return 'Earn-out';
    case 'seller_note_bank_debt':
      return 'LBO (Note + Debt)';
  }
}

export function getStructureDescription(structure: DealStructure): string {
  switch (structure.type) {
    case 'all_cash':
      return 'Pay full price upfront. No debt, no ongoing obligations. Best MOIC potential.';
    case 'seller_note':
      return `Pay ${Math.round((structure.cashRequired / (structure.cashRequired + (structure.sellerNote?.amount ?? 0))) * 100)}% upfront, remainder as seller note at ${((structure.sellerNote?.rate ?? 0) * 100).toFixed(1)}%. Seller has skin in the game.`;
    case 'bank_debt':
      return `Pay ${Math.round((structure.cashRequired / (structure.cashRequired + (structure.bankDebt?.amount ?? 0))) * 100)}% equity, ${Math.round(((structure.bankDebt?.amount ?? 0) / (structure.cashRequired + (structure.bankDebt?.amount ?? 0))) * 100)}% financed. Higher leverage, higher risk, recourse to holdco.`;
    case 'earnout':
      return `Pay ${Math.round((structure.cashRequired / (structure.cashRequired + (structure.earnout?.amount ?? 0))) * 100)}% upfront, remainder contingent on hitting growth targets. Aligned incentives but seller may disengage.`;
    case 'seller_note_bank_debt': {
      const total = structure.cashRequired + (structure.sellerNote?.amount ?? 0) + (structure.bankDebt?.amount ?? 0);
      const equityPct = Math.round((structure.cashRequired / total) * 100);
      const notePct = Math.round(((structure.sellerNote?.amount ?? 0) / total) * 100);
      const debtPct = 100 - equityPct - notePct;
      return `${equityPct}% equity, ${notePct}% seller note at ${((structure.sellerNote?.rate ?? 0) * 100).toFixed(1)}%, ${debtPct}% bank debt. Classic LBO structure — maximum leverage, holdco guarantees bank debt.`;
    }
  }
}
