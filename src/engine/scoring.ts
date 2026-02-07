import {
  GameState,
  ScoreBreakdown,
  PostGameInsight,
  LeaderboardEntry,
} from './types';
import { calculateMetrics, calculateSectorFocusBonus, calculateExitValuation } from './simulation';
import { POST_GAME_INSIGHTS } from '../data/tips';

const LEADERBOARD_KEY = 'holdco-tycoon-leaderboard';
const MAX_LEADERBOARD_ENTRIES = 10;

/**
 * Calculate Enterprise Value at game end
 * EV = (Portfolio EBITDA × Blended Exit Multiple) + Cash - Total Debt
 */
export function calculateEnterpriseValue(state: GameState): number {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');

  if (activeBusinesses.length === 0) {
    // No active businesses - EV is just cash minus debt
    return Math.max(0, state.cash - state.totalDebt);
  }

  // Calculate total EBITDA and blended exit multiple using full valuation engine
  let totalEbitda = 0;
  let weightedMultiple = 0;

  for (const business of activeBusinesses) {
    const valuation = calculateExitValuation(business, 20); // End of game = round 20
    totalEbitda += business.ebitda;
    weightedMultiple += business.ebitda * valuation.totalMultiple;
  }

  const blendedMultiple = totalEbitda > 0 ? weightedMultiple / totalEbitda : 0;
  const portfolioValue = totalEbitda * blendedMultiple;

  // M-6: Distributions represent value already returned to shareholders (reduces cash, so add back)
  // Buybacks are NOT added: their benefit is captured in fewer shares outstanding → higher per-share value
  const distributionsReturned = state.totalDistributions;

  // Calculate total holdco-level debt including opco-level seller notes
  // L-13: Only include sellerNoteBalance (bank debt is tracked at holdco level in state.totalDebt)
  const opcoDebt = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoDebt;

  // EV = Portfolio Value + Cash + Distributions Returned - All Debt
  const ev = portfolioValue + state.cash + distributionsReturned - totalDebt;

  return Math.round(Math.max(0, ev));
}

export function calculateFinalScore(state: GameState): ScoreBreakdown {
  const metrics = calculateMetrics(state);
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const allBusinesses = [...state.businesses, ...state.exitedBusinesses];

  // 1. FCF/Share Growth (25 points max)
  let fcfShareGrowth = 0;
  if (state.metricsHistory.length > 1) {
    const startFcfPerShare = state.metricsHistory[0]?.metrics.fcfPerShare ?? 0;
    const endFcfPerShare = metrics.fcfPerShare;
    if (startFcfPerShare > 0) {
      const growth = (endFcfPerShare - startFcfPerShare) / startFcfPerShare;
      // 300%+ growth = 25 points, scaled down linearly
      fcfShareGrowth = Math.min(25, Math.max(0, (growth / 3) * 25));
    } else if (endFcfPerShare > 0) {
      fcfShareGrowth = 15; // Started from 0, grew to positive
    }
  }

  // 2. Portfolio ROIC (20 points max)
  let portfolioRoic = 0;
  if (metrics.portfolioRoic >= 0.25) {
    portfolioRoic = 20;
  } else if (metrics.portfolioRoic >= 0.15) {
    portfolioRoic = 15 + ((metrics.portfolioRoic - 0.15) / 0.10) * 5;
  } else if (metrics.portfolioRoic >= 0.08) {
    portfolioRoic = 8 + ((metrics.portfolioRoic - 0.08) / 0.07) * 7;
  } else {
    portfolioRoic = Math.max(0, (metrics.portfolioRoic / 0.08) * 8);
  }

  // 3. Capital Deployment - MOIC + ROIIC (20 points max)
  let capitalDeployment = 0;

  // Average MOIC across all investments
  let totalMoicWeighted = 0;
  let totalCapitalDeployed = 0;

  for (const business of allBusinesses) {
    const capital = business.acquisitionPrice;
    let returns = 0;

    if (business.status === 'sold' && business.exitPrice) {
      returns = business.exitPrice;
    } else if (business.status === 'active') {
      // Use current value estimate
      returns = business.ebitda * business.acquisitionMultiple * 1.1; // Slight premium for going concern
    }

    totalMoicWeighted += returns;
    totalCapitalDeployed += capital;
  }

  const avgMoic = totalCapitalDeployed > 0 ? totalMoicWeighted / totalCapitalDeployed : 1;

  // MOIC component (10 points)
  let moicScore = 0;
  if (avgMoic >= 2.5) {
    moicScore = 10;
  } else if (avgMoic >= 1.5) {
    moicScore = 5 + ((avgMoic - 1.5) / 1.0) * 5;
  } else {
    moicScore = Math.max(0, (avgMoic / 1.5) * 5);
  }

  // ROIIC component (10 points)
  let roiicScore = 0;
  const avgRoiic = state.metricsHistory.length > 0
    ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
    : 0;

  if (avgRoiic >= 0.20) {
    roiicScore = 10;
  } else if (avgRoiic >= 0.10) {
    roiicScore = 5 + ((avgRoiic - 0.10) / 0.10) * 5;
  } else {
    roiicScore = Math.max(0, (avgRoiic / 0.10) * 5);
  }

  capitalDeployment = moicScore + roiicScore;

  // 4. Balance Sheet Health (15 points max)
  let balanceSheetHealth = 0;

  // Net Debt/EBITDA component
  if (metrics.netDebtToEbitda < 1.0) {
    balanceSheetHealth = 15;
  } else if (metrics.netDebtToEbitda < 2.5) {
    balanceSheetHealth = 10 + ((2.5 - metrics.netDebtToEbitda) / 1.5) * 5;
  } else if (metrics.netDebtToEbitda < 3.5) {
    balanceSheetHealth = 5 + ((3.5 - metrics.netDebtToEbitda) / 1.0) * 5;
  } else {
    balanceSheetHealth = Math.max(0, 5 - (metrics.netDebtToEbitda - 3.5) * 2);
  }

  // Penalty for ever going above 4x
  const everOverLeveraged = state.metricsHistory.some(h => h.metrics.netDebtToEbitda > 4);
  if (everOverLeveraged) {
    balanceSheetHealth = Math.max(0, balanceSheetHealth - 5);
  }

  // 5. Strategic Discipline (20 points max)
  let strategicDiscipline = 0;

  // Sector focus utilization (5 points)
  const focusBonus = calculateSectorFocusBonus(activeBusinesses);
  let sectorFocusScore = 0;
  if (focusBonus) {
    sectorFocusScore = Math.min(5, focusBonus.tier * 1.5 + (focusBonus.opcoCount >= 4 ? 1 : 0));
  } else if (activeBusinesses.length >= 4) {
    // Reward diversification too
    const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId));
    sectorFocusScore = Math.min(4, uniqueSectors.size);
  }

  // Shared services ROI (5 points)
  const activeServices = state.sharedServices.filter(s => s.active);
  let sharedServicesScore = 0;
  if (activeServices.length > 0 && activeBusinesses.length >= 3) {
    sharedServicesScore = Math.min(5, activeServices.length * 1.5);
  }

  // Distribution hierarchy adherence (5 points)
  // The hierarchy: 1) Reinvest above hurdle, 2) Deleverage, 3) Buyback when cheap, 4) Distribute
  let distributionScore = 5;

  // Check if player distributed at all
  const madeDistributions = state.totalDistributions > 0;

  if (madeDistributions) {
    // Check average ROIIC during the game - did they distribute while returns were high?
    const avgRoiicDuringGame = state.metricsHistory.length > 0
      ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
      : 0;

    // Penalty for distributing while average ROIIC > 20%
    if (avgRoiicDuringGame > 0.20) {
      distributionScore -= 2;
    }

    // Penalty for distributing while ending with leverage > 2x
    // (indicates should have paid down debt instead)
    if (metrics.netDebtToEbitda > 2) {
      distributionScore -= 2;
    }

    // Bonus for only distributing when returns dropped
    if (avgRoiicDuringGame < 0.10 && metrics.netDebtToEbitda < 1.5 && state.totalDistributions > 0) {
      distributionScore = Math.min(5, distributionScore + 1);
    }
  }

  // Deal quality (5 points)
  const avgQuality = allBusinesses.length > 0
    ? allBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / allBusinesses.length
    : 3;
  const dealQualityScore = Math.min(5, (avgQuality / 5) * 5);

  strategicDiscipline = sectorFocusScore + sharedServicesScore + distributionScore + dealQualityScore;

  // Calculate total
  const total = Math.round(
    fcfShareGrowth + portfolioRoic + capitalDeployment + balanceSheetHealth + strategicDiscipline
  );

  // Determine grade
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  let title: string;

  if (total >= 90) {
    grade = 'S';
    title = "Master Allocator - You'd make Buffett proud";
  } else if (total >= 75) {
    grade = 'A';
    title = 'Skilled Compounder - Constellation-level discipline';
  } else if (total >= 60) {
    grade = 'B';
    title = 'Solid Builder - Your holdco has real potential';
  } else if (total >= 40) {
    grade = 'C';
    title = 'Emerging Operator - Room to sharpen your allocation instincts';
  } else if (total >= 20) {
    grade = 'D';
    title = 'Apprentice - Study the playbook and try again';
  } else {
    grade = 'F';
    title = 'Blown Up - Tyco sends its regards';
  }

  return {
    fcfShareGrowth: Math.round(fcfShareGrowth * 10) / 10,
    portfolioRoic: Math.round(portfolioRoic * 10) / 10,
    capitalDeployment: Math.round(capitalDeployment * 10) / 10,
    balanceSheetHealth: Math.round(balanceSheetHealth * 10) / 10,
    strategicDiscipline: Math.round(strategicDiscipline * 10) / 10,
    total,
    grade,
    title,
  };
}

export function generatePostGameInsights(state: GameState): PostGameInsight[] {
  const insights: PostGameInsight[] = [];
  const metrics = calculateMetrics(state);
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const allBusinesses = [...state.businesses, ...state.exitedBusinesses];

  // Check for patterns
  const neverAcquired = allBusinesses.length <= 1;
  const overLeveraged = metrics.netDebtToEbitda > 3;
  const singleSector = new Set(activeBusinesses.map(b => b.sectorId)).size === 1 && activeBusinesses.length >= 3;
  const highRoiicMoic = metrics.roiic > 0.20 && metrics.portfolioMoic > 2.0;
  const noReinvestment = state.sharedServices.every(s => !s.active) && allBusinesses.every(b => b.improvements.length === 0);
  const strongConversion = metrics.cashConversion > 0.80;
  const smartExits = state.exitedBusinesses.filter(b => {
    if (!b.exitPrice) return false;
    const moic = b.exitPrice / b.acquisitionPrice;
    return moic > 2.0;
  }).length >= 2;
  const heldLosers = activeBusinesses.some(b => b.ebitda < b.acquisitionEbitda * 0.5);
  const goodSharedServices = state.sharedServices.filter(s => s.active).length >= 2;
  const equityRaised = state.equityRaisesUsed > 0;
  const wellTimedBuybacks = state.totalBuybacks > 0 && metrics.portfolioRoic < 0.15;

  // Add relevant insights
  if (neverAcquired) {
    insights.push(POST_GAME_INSIGHTS.never_acquired);
  }
  if (overLeveraged) {
    insights.push(POST_GAME_INSIGHTS.over_leveraged);
  }
  if (singleSector) {
    insights.push(POST_GAME_INSIGHTS.single_sector);
  }
  if (highRoiicMoic) {
    insights.push(POST_GAME_INSIGHTS.high_roiic_moic);
  }
  if (noReinvestment) {
    insights.push(POST_GAME_INSIGHTS.ignored_reinvestment);
  }
  if (strongConversion) {
    insights.push(POST_GAME_INSIGHTS.strong_conversion);
  }
  if (smartExits) {
    insights.push(POST_GAME_INSIGHTS.smart_exits);
  }
  if (heldLosers) {
    insights.push(POST_GAME_INSIGHTS.held_losers);
  }
  if (goodSharedServices) {
    insights.push(POST_GAME_INSIGHTS.good_shared_services);
  }
  if (equityRaised) {
    if (metrics.portfolioRoic > 0.15) {
      insights.push(POST_GAME_INSIGHTS.equity_well_deployed);
    } else {
      insights.push(POST_GAME_INSIGHTS.equity_poorly_deployed);
    }
  }
  if (wellTimedBuybacks) {
    insights.push(POST_GAME_INSIGHTS.well_timed_buybacks);
  }

  // Return top 3 most relevant
  return insights.slice(0, 3);
}

/**
 * Load leaderboard from localStorage
 */
export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save a new entry to the leaderboard
 */
export function saveToLeaderboard(entry: Omit<LeaderboardEntry, 'id' | 'date'>): LeaderboardEntry {
  const leaderboard = loadLeaderboard();

  const newEntry: LeaderboardEntry = {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };

  leaderboard.push(newEntry);

  // Sort by enterprise value (highest first)
  leaderboard.sort((a, b) => b.enterpriseValue - a.enterpriseValue);

  // Keep only top entries
  const trimmed = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);

  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));

  return newEntry;
}

/**
 * Check if a score would make the leaderboard
 */
export function wouldMakeLeaderboard(enterpriseValue: number): boolean {
  const leaderboard = loadLeaderboard();
  if (leaderboard.length < MAX_LEADERBOARD_ENTRIES) return true;
  return enterpriseValue > (leaderboard[leaderboard.length - 1]?.enterpriseValue ?? 0);
}

/**
 * Get leaderboard rank for an entry
 */
export function getLeaderboardRank(enterpriseValue: number): number {
  const leaderboard = loadLeaderboard();
  let rank = 1;
  for (const entry of leaderboard) {
    if (entry.enterpriseValue > enterpriseValue) {
      rank++;
    }
  }
  return rank;
}
