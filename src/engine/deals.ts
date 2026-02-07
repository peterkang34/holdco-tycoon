import { Deal, DealStructure, DealStructureType, Business } from './types';

export function generateDealStructures(
  deal: Deal,
  playerCash: number,
  interestRate: number,
  creditTightening: boolean
): DealStructure[] {
  const askingPrice = deal.askingPrice;
  const structures: DealStructure[] = [];

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
  const sellerNoteCashPercent = 0.4 + Math.random() * 0.2; // 40-60%
  const sellerNoteCash = Math.round(askingPrice * sellerNoteCashPercent);
  const sellerNoteAmount = askingPrice - sellerNoteCash;
  const sellerNoteRate = 0.05 + Math.random() * 0.01; // 5-6%

  if (playerCash >= sellerNoteCash) {
    structures.push({
      type: 'seller_note',
      cashRequired: sellerNoteCash,
      sellerNote: {
        amount: sellerNoteAmount,
        rate: sellerNoteRate,
        termRounds: 3, // 3 years
      },
      leverage: Math.round((sellerNoteAmount / deal.business.ebitda) * 10) / 10,
      risk: 'medium',
    });
  }

  // Option C: Cash + Bank Debt (not available during credit tightening)
  if (!creditTightening) {
    const bankDebtCashPercent = 0.15 + Math.random() * 0.1; // 15-25%
    const bankDebtCash = Math.round(askingPrice * bankDebtCashPercent);
    const bankDebtAmount = askingPrice - bankDebtCash;

    if (playerCash >= bankDebtCash) {
      structures.push({
        type: 'bank_debt',
        cashRequired: bankDebtCash,
        bankDebt: {
          amount: bankDebtAmount,
          rate: interestRate,
          termRounds: 10, // 10 years
        },
        leverage: Math.round((bankDebtAmount / deal.business.ebitda) * 10) / 10,
        risk: 'high',
      });
    }
  }

  // Option D: Earn-out (available for some deals, especially higher quality)
  if (deal.business.qualityRating >= 3 && Math.random() > 0.4) {
    const earnoutUpfrontPercent = 0.5 + Math.random() * 0.2; // 50-70%
    const earnoutCash = Math.round(askingPrice * earnoutUpfrontPercent);
    const earnoutAmount = askingPrice - earnoutCash;

    if (playerCash >= earnoutCash) {
      structures.push({
        type: 'earnout',
        cashRequired: earnoutCash,
        earnout: {
          amount: earnoutAmount,
          targetEbitdaGrowth: 0.10 + Math.random() * 0.05, // 10-15% growth target
        },
        leverage: 0, // Earnouts don't add leverage in the traditional sense
        risk: 'medium',
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
    acquisitionPrice: deal.askingPrice,
    sellerNoteBalance: structure.sellerNote?.amount ?? 0,
    sellerNoteRate: structure.sellerNote?.rate ?? 0,
    sellerNoteRoundsRemaining: structure.sellerNote?.termRounds ?? 0,
    bankDebtBalance: structure.bankDebt?.amount ?? 0,
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
  }
}
