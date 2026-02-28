/**
 * IPO Pathway engine — 20-year mode only.
 * At round 16+ with high gates, player can take holdco public.
 * Stock price derived from EV. Built-in constraints (earnings expectations,
 * analyst pressure, dilution) make it a genuine choice vs staying private.
 */

import type { GameState, IPOState, Business } from './types';
import {
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
} from '../data/gameConfig';

/**
 * Check whether the player meets all IPO prerequisites.
 */
export function checkIPOEligibility(state: GameState): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const active = state.businesses.filter(b => b.status === 'active');
  const totalEbitda = active.reduce((sum, b) => sum + b.ebitda, 0);
  const avgQuality = active.length > 0
    ? active.reduce((sum, b) => sum + b.qualityRating, 0) / active.length
    : 0;
  const platformCount = active.filter(b => b.isPlatform).length;

  if (state.duration !== 'standard') {
    reasons.push('Only available in Full Game (20-year) mode');
  }
  if (state.round < IPO_MIN_ROUND) {
    reasons.push(`Requires round ${IPO_MIN_ROUND}+ (currently round ${state.round})`);
  }
  if (totalEbitda < IPO_MIN_EBITDA) {
    reasons.push(`Requires $${(IPO_MIN_EBITDA / 1000).toFixed(0)}M+ EBITDA (currently $${(totalEbitda / 1000).toFixed(1)}M)`);
  }
  if (active.length < IPO_MIN_BUSINESSES) {
    reasons.push(`Requires ${IPO_MIN_BUSINESSES}+ businesses (currently ${active.length})`);
  }
  if (avgQuality < IPO_MIN_AVG_QUALITY) {
    reasons.push(`Requires ${IPO_MIN_AVG_QUALITY}+ avg quality (currently ${avgQuality.toFixed(1)})`);
  }
  if (platformCount < IPO_MIN_PLATFORMS) {
    reasons.push(`Requires ${IPO_MIN_PLATFORMS}+ platforms (currently ${platformCount})`);
  }
  if (state.ipoState?.isPublic) {
    reasons.push('Already public');
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Calculate enterprise value for the holdco.
 * Uses EBITDA × quality-adjusted multiple for each business.
 */
function calculateHoldcoEV(businesses: Business[]): number {
  const active = businesses.filter(b => b.status === 'active');
  return active.reduce((sum, b) => {
    const multiple = 5.0 + (b.qualityRating - 3) * 0.5;
    return sum + b.ebitda * multiple;
  }, 0);
}

/**
 * Calculate stock price from enterprise value and shares.
 */
export function calculateStockPrice(state: GameState): number {
  if (!state.ipoState) return 0;
  const ev = calculateHoldcoEV(state.businesses);
  const totalDebt = state.totalDebt || 0;
  const equityValue = Math.max(0, ev - totalDebt + state.cash);
  const sentiment = state.ipoState.marketSentiment;
  const shares = state.ipoState.sharesOutstanding || 1;
  return Math.round((equityValue / shares) * (1 + sentiment) * 100) / 100;
}

/**
 * Execute the IPO. Returns the new IPO state and cash raised.
 * IPO sells 20% of shares at market price.
 */
export function executeIPO(state: GameState): {
  ipoState: IPOState;
  cashRaised: number;
  newSharesIssued: number;
} {
  const active = state.businesses.filter(b => b.status === 'active');
  const totalEbitda = active.reduce((sum, b) => sum + b.ebitda, 0);
  const ev = calculateHoldcoEV(state.businesses);
  const totalDebt = state.totalDebt || 0;
  const equityValue = Math.max(0, ev - totalDebt + state.cash);

  // IPO: sell 20% of company at EV
  const ipoSharePct = 0.20;
  const currentShares = state.sharesOutstanding;
  const newShares = Math.round(currentShares * ipoSharePct / (1 - ipoSharePct));
  const totalShares = currentShares + newShares;
  const pricePerShare = currentShares > 0 ? equityValue / currentShares : 0;
  const cashRaised = Math.round(newShares * pricePerShare);

  const stockPrice = Math.round(pricePerShare * 100) / 100;
  const ipoState: IPOState = {
    isPublic: true,
    stockPrice,
    sharesOutstanding: totalShares,
    preIPOShares: currentShares,
    marketSentiment: 0.05, // mild IPO pop
    earningsExpectations: Math.round(totalEbitda * 1.05), // analysts expect 5% growth
    ipoRound: state.round,
    initialStockPrice: stockPrice,
    consecutiveMisses: 0,
    shareFundedDealsThisRound: 0,
  };

  return { ipoState, cashRaised, newSharesIssued: newShares };
}

/**
 * Process end-of-round earnings vs expectations for public companies.
 */
export function processEarningsResult(
  state: GameState,
  actualEbitda: number
): IPOState | null {
  if (!state.ipoState || !state.ipoState.isPublic) {
    return state.ipoState;
  }

  const ipo = { ...state.ipoState };
  const target = ipo.earningsExpectations;

  if (actualEbitda >= target) {
    // Beat expectations
    ipo.marketSentiment = Math.min(0.3, ipo.marketSentiment + IPO_EARNINGS_BEAT_BONUS);
    ipo.consecutiveMisses = 0;
  } else {
    // Missed expectations
    ipo.marketSentiment = Math.max(-0.3, ipo.marketSentiment - IPO_EARNINGS_MISS_PENALTY);
    ipo.consecutiveMisses += 1;

    // Analyst downgrade after consecutive misses
    if (ipo.consecutiveMisses >= IPO_CONSECUTIVE_MISS_THRESHOLD) {
      ipo.marketSentiment = Math.max(-0.3, ipo.marketSentiment - 0.10); // extra penalty
    }
  }

  // Set next quarter's expectations (5% above actual, not target)
  ipo.earningsExpectations = Math.round(actualEbitda * 1.05);

  // Reset per-round counters
  ipo.shareFundedDealsThisRound = 0;

  // Update stock price
  const ev = calculateHoldcoEV(state.businesses);
  const totalDebt = state.totalDebt || 0;
  const equityValue = Math.max(0, ev - totalDebt + state.cash);
  const shares = ipo.sharesOutstanding || 1;
  ipo.stockPrice = Math.round((equityValue / shares) * (1 + ipo.marketSentiment) * 100) / 100;

  return ipo;
}

/**
 * Check if a share-funded acquisition is possible.
 */
export function canShareFundedDeal(state: GameState): boolean {
  if (!state.ipoState?.isPublic) return false;
  return state.ipoState.shareFundedDealsThisRound < IPO_SHARE_FUNDED_DEALS_PER_ROUND;
}

/**
 * Calculate terms for a share-funded acquisition.
 * Returns the number of shares to issue and dilution impact.
 */
export function calculateShareFundedTerms(
  dealPrice: number,
  ipoState: IPOState
): {
  sharesToIssue: number;
  newTotalShares: number;
  dilutionPct: number;
} {
  if (ipoState.stockPrice <= 0) return { sharesToIssue: 0, newTotalShares: ipoState.sharesOutstanding, dilutionPct: 0 };
  const sharesToIssue = Math.round(dealPrice / ipoState.stockPrice);
  const newTotalShares = ipoState.sharesOutstanding + sharesToIssue;
  const dilutionPct = newTotalShares > 0 ? sharesToIssue / newTotalShares : 0;
  return { sharesToIssue, newTotalShares, dilutionPct };
}

/**
 * Calculate performance-based FEV bonus for public companies.
 * 5% base + up to 5% stock appreciation + 3% perfect earnings + 2% positive sentiment = 15% max.
 * Index tier (IPO_FEV_BONUS_MAX - 15% = 3%) adds up to 3% more for 18% cap.
 */
export function calculatePublicCompanyBonus(state: GameState): number {
  if (!state.ipoState?.isPublic) return 0;

  let bonus = IPO_FEV_BONUS_BASE; // 5% base for being public

  // Stock appreciation: up to +5% based on price growth since IPO
  const initialPrice = state.ipoState.initialStockPrice || state.ipoState.stockPrice;
  if (initialPrice > 0) {
    const appreciation = (state.ipoState.stockPrice - initialPrice) / initialPrice;
    bonus += Math.min(0.05, Math.max(0, appreciation * 0.10)); // 10% of appreciation, capped at 5%
  }

  // Perfect earnings: +3% if no consecutive misses
  if (state.ipoState.consecutiveMisses === 0) {
    bonus += 0.03;
  }

  // Positive sentiment: up to +2% based on market sentiment
  if (state.ipoState.marketSentiment > 0) {
    bonus += Math.min(0.02, state.ipoState.marketSentiment * 0.067); // 0.3 sentiment → 2%
  }

  // Index tier: up to +3% based on number of platforms (proxy for holdco maturity)
  const active = state.businesses.filter(b => b.status === 'active');
  const platformCount = active.filter(b => b.isPlatform).length;
  if (platformCount >= 3) {
    bonus += 0.03;
  } else if (platformCount >= 2) {
    bonus += 0.02;
  } else if (platformCount >= 1) {
    bonus += 0.01;
  }

  return Math.min(IPO_FEV_BONUS_MAX, bonus);
}
