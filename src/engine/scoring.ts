import {
  GameState,
  GameDifficulty,
  ScoreBreakdown,
  PostGameInsight,
  LeaderboardEntry,
  LeaderboardStrategy,
  CarryWaterfall,
  PEScoreBreakdown,
} from './types';
import { calculateMetrics, calculateSectorFocusBonus, calculateExitValuation } from './simulation';
import { POST_GAME_INSIGHTS } from '../data/tips';
import { getAllDedupedBusinesses } from './helpers';
import { RESTRUCTURING_FEV_PENALTY, PE_FUND_CONFIG, PE_IRR_CARRY_TIERS, PE_GRADE_THRESHOLDS, PE_GRADE_TITLES } from '../data/gameConfig';
import { calculatePublicCompanyBonus } from './ipo';

const LEADERBOARD_KEY = 'holdco-tycoon-leaderboard';
const MAX_LEADERBOARD_ENTRIES = 10;

/** Compute adjusted FEV for a leaderboard entry (applies difficulty multiplier + restructuring penalty + FO multiplier) */
function getAdjustedFEV(entry: LeaderboardEntry): number {
  const raw = entry.founderEquityValue ?? entry.enterpriseValue;
  const difficulty = entry.difficulty ?? 'easy';
  // Grandfather: use stored multiplier if available, otherwise legacy defaults
  const multiplier = entry.submittedMultiplier
    ?? (difficulty === 'easy' ? 1.0 : 1.35);
  const restructuringPenalty = entry.hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
  const foMultiplier = entry.foMultiplier ?? 1.0;
  return Math.round(raw * multiplier * restructuringPenalty * foMultiplier);
}

/**
 * Calculate Enterprise Value at game end
 * EV = (Portfolio EBITDA × Blended Exit Multiple) + Cash - Total Debt
 * Note: Distributions are NOT added back — they reduce NAV.
 * Founders who distribute cash trade EV for Personal Wealth.
 */
export function calculateEnterpriseValue(state: GameState): number {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const maxRounds = state.maxRounds || 20;

  if (activeBusinesses.length === 0) {
    // No active businesses - EV is just cash minus debt
    return Math.max(0, state.cash - state.totalDebt);
  }

  // Calculate total EBITDA and blended exit multiple using full valuation engine
  let totalEbitda = 0;
  let weightedMultiple = 0;
  let rolloverClaims = 0;

  for (const business of activeBusinesses) {
    const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, state.integratedPlatforms);
    totalEbitda += business.ebitda;
    weightedMultiple += business.ebitda * valuation.totalMultiple;

    // Deduct rollover equity claims — seller's share of each business's net value
    if (business.rolloverEquityPct && business.rolloverEquityPct > 0) {
      const bizGrossValue = business.ebitda * valuation.totalMultiple;
      const bizDebt = business.sellerNoteBalance + business.bankDebtBalance;
      const bizNetValue = Math.max(0, bizGrossValue - bizDebt);
      rolloverClaims += bizNetValue * business.rolloverEquityPct;
    }
  }

  const blendedMultiple = totalEbitda > 0 ? weightedMultiple / totalEbitda : 0;
  let portfolioValue = totalEbitda * blendedMultiple;

  // Sentiment flow-through for public companies: market sentiment affects portfolio value
  if (state.ipoState?.isPublic) {
    portfolioValue *= (1 + state.ipoState.marketSentiment);
  }

  // Total debt: state.totalDebt (holdco loan + per-business bank debt) + seller notes
  const opcoSellerNotes = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoSellerNotes;

  // EV = Portfolio Value + Cash - All Debt - Rollover Claims (no distribution add-back)
  let ev = portfolioValue + state.cash - totalDebt - rolloverClaims;

  // Public company bonus: performance-based 5-18% FEV bonus
  const publicBonus = calculatePublicCompanyBonus(state);
  if (publicBonus > 0) {
    ev *= (1 + publicBonus);
  }

  return Math.round(Math.max(0, ev));
}

/**
 * Calculate Founder Equity Value = NAV × ownership%
 * This is the PRIMARY leaderboard ranking metric.
 */
export function calculateFounderEquityValue(state: GameState): number {
  if (state.sharesOutstanding <= 0) return 0;
  const ev = calculateEnterpriseValue(state);
  const ownership = state.founderShares / state.sharesOutstanding;
  return Math.round(ev * ownership);
}

/**
 * Calculate Founder Personal Wealth = cumulative founder share of distributions
 * This is the SECONDARY leaderboard metric ("Cash Kings" board).
 */
export function calculateFounderPersonalWealth(state: GameState): number {
  return state.founderDistributionsReceived || 0;
}

export function calculateFinalScore(state: GameState): ScoreBreakdown {
  if (state.isFundManagerMode) throw new Error('Use calculatePEFundScore for fund mode');

  // Bankruptcy = immediate F grade, score 0
  if (state.bankruptRound) {
    return {
      valueCreation: 0,
      fcfShareGrowth: 0,
      portfolioRoic: 0,
      capitalDeployment: 0,
      balanceSheetHealth: 0,
      strategicDiscipline: 0,
      total: 0,
      grade: 'F',
      title: `Bankrupt — Filed for bankruptcy in Year ${state.bankruptRound}`,
    };
  }

  const metrics = calculateMetrics(state);
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  // Deduplicate: exitedBusinesses wins; filter out integrated bolt-ons, merged, and child bolt-ons
  // Merged businesses' capital is already captured in the merged entity's totalAcquisitionCost
  const allBusinesses = getAllDedupedBusinesses(state.businesses, state.exitedBusinesses);
  const maxRounds = state.maxRounds || 20;

  // 1. Value Creation (20 points max) — FEV / initial raise
  let valueCreation = 0;
  if (state.initialRaiseAmount > 0) {
    const fev = calculateFounderEquityValue(state);
    const fevMultiple = fev / state.initialRaiseAmount;
    const target = maxRounds >= 20 ? 10 : 5; // 10x for 20yr, 5x for 10yr
    if (fevMultiple >= target) {
      valueCreation = 20;
    } else if (fevMultiple >= target / 2) {
      valueCreation = 10 + ((fevMultiple - target / 2) / (target / 2)) * 10;
    } else if (fevMultiple >= 1) {
      valueCreation = ((fevMultiple - 1) / (target / 2 - 1)) * 10;
    } else {
      valueCreation = 0;
    }
    valueCreation = Math.min(20, Math.max(0, valueCreation));
  }

  // 2. FCF/Share Growth (20 points max)
  let fcfShareGrowth = 0;
  const fcfGrowthTarget = maxRounds >= 20 ? 4.0 : 2.0; // 400% for 20yr, 200% for 10yr
  if (state.metricsHistory.length > 1) {
    const startFcfPerShare = state.metricsHistory[0]?.metrics.fcfPerShare ?? 0;
    const endFcfPerShare = metrics.fcfPerShare;
    if (startFcfPerShare > 0) {
      const growth = (endFcfPerShare - startFcfPerShare) / startFcfPerShare;
      fcfShareGrowth = Math.min(20, Math.max(0, (growth / fcfGrowthTarget) * 20));
    } else if (endFcfPerShare > 0) {
      fcfShareGrowth = 12; // Started from 0, grew to positive
    }
  }

  // 3. Portfolio ROIC (15 points max)
  let portfolioRoic = 0;
  const roicTarget = maxRounds >= 20 ? 0.25 : 0.20; // 25% for Standard, 20% for Quick
  if (metrics.portfolioRoic >= roicTarget) {
    portfolioRoic = 15;
  } else if (metrics.portfolioRoic >= roicTarget - 0.10) {
    portfolioRoic = 11.25 + ((metrics.portfolioRoic - (roicTarget - 0.10)) / 0.10) * 3.75;
  } else if (metrics.portfolioRoic >= 0.08) {
    const midFloor = roicTarget - 0.10;
    portfolioRoic = 6 + ((metrics.portfolioRoic - 0.08) / (midFloor - 0.08)) * 5.25;
  } else {
    portfolioRoic = Math.max(0, (metrics.portfolioRoic / 0.08) * 6);
  }

  // 4. Capital Deployment - MOIC + ROIIC (15 points max)
  let capitalDeployment = 0;

  // Average MOIC across all investments
  let totalMoicWeighted = 0;
  let totalCapitalDeployed = 0;

  for (const business of allBusinesses) {
    const capital = business.totalAcquisitionCost || business.acquisitionPrice;
    let returns = 0;

    if (business.status === 'sold' && business.exitPrice) {
      returns = business.exitPrice; // Gross exit price (EV at exit)
    } else if (business.status === 'active') {
      // Use gross EV consistent with sold businesses (exitPrice is also gross)
      const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, state.integratedPlatforms);
      returns = business.ebitda * valuation.totalMultiple;
    }

    totalMoicWeighted += returns;
    totalCapitalDeployed += capital;
  }

  const avgMoic = totalCapitalDeployed > 0 ? totalMoicWeighted / totalCapitalDeployed : 1;

  // MOIC component (7.5 points) — scale target by duration
  const moicFullMarks = maxRounds >= 20 ? 2.5 : 2.0;
  let moicScore = 0;
  if (avgMoic >= moicFullMarks) {
    moicScore = 7.5;
  } else if (avgMoic >= 1.5) {
    moicScore = 3.75 + ((avgMoic - 1.5) / (moicFullMarks - 1.5)) * 3.75;
  } else {
    moicScore = Math.max(0, (avgMoic / 1.5) * 3.75);
  }

  // ROIIC component (7.5 points)
  let roiicScore = 0;
  const avgRoiic = state.metricsHistory.length > 0
    ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
    : 0;

  if (avgRoiic >= 0.20) {
    roiicScore = 7.5;
  } else if (avgRoiic >= 0.10) {
    roiicScore = 3.75 + ((avgRoiic - 0.10) / 0.10) * 3.75;
  } else {
    roiicScore = Math.max(0, (avgRoiic / 0.10) * 3.75);
  }

  capitalDeployment = moicScore + roiicScore;

  // 5. Balance Sheet Health (15 points max)
  let balanceSheetHealth = 0;

  // Net Debt/EBITDA component — optimal leverage is 1.5-2.5x (real PE sweet spot)
  if (metrics.netDebtToEbitda < 1.0) {
    balanceSheetHealth = 12; // Too conservative — not deploying capital efficiently
  } else if (metrics.netDebtToEbitda < 1.5) {
    // Linear ramp from 12 to 15
    balanceSheetHealth = 12 + ((metrics.netDebtToEbitda - 1.0) / 0.5) * 3;
  } else if (metrics.netDebtToEbitda < 2.5) {
    balanceSheetHealth = 15; // Sweet spot
  } else if (metrics.netDebtToEbitda < 3.5) {
    // Linear decline from 15 to 7
    balanceSheetHealth = 15 - ((metrics.netDebtToEbitda - 2.5) / 1.0) * 8;
  } else {
    balanceSheetHealth = Math.max(0, 7 - (metrics.netDebtToEbitda - 3.5) * 3);
  }

  // Penalty for ever going above 4x
  const everOverLeveraged = state.metricsHistory.some(h => h.metrics.netDebtToEbitda > 4);
  if (everOverLeveraged) {
    balanceSheetHealth = Math.max(0, balanceSheetHealth - 5);
  }

  // Penalty for covenant breach
  const everBreached = state.metricsHistory.some(h => h.metrics.distressLevel === 'breach');
  if (everBreached) {
    balanceSheetHealth = Math.max(0, balanceSheetHealth - 3);
  }

  // Penalty for having used restructuring
  if (state.hasRestructured) {
    balanceSheetHealth = Math.max(0, balanceSheetHealth - 5);
  }

  // 6. Strategic Discipline (15 points max)
  let strategicDiscipline = 0;

  // Sector focus utilization (3 points)
  const focusBonus = calculateSectorFocusBonus(activeBusinesses);
  let sectorFocusScore = 0;
  if (focusBonus) {
    sectorFocusScore = Math.min(3, focusBonus.tier * 0.9 + (focusBonus.opcoCount >= 4 ? 0.6 : 0));
  } else if (activeBusinesses.length >= 4) {
    const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId));
    sectorFocusScore = Math.min(3, uniqueSectors.size >= 8 ? 3 : uniqueSectors.size >= 4 ? 2.4 : uniqueSectors.size * 0.6);
  }

  // Shared services ROI (3 points)
  const activeServices = state.sharedServices.filter(s => s.active);
  let sharedServicesScore = 0;
  if (activeServices.length > 0 && activeBusinesses.length >= 3) {
    sharedServicesScore = Math.min(3, activeServices.length * 0.9);
  }
  // MA Sourcing bonus: tier 2+ with 3+ opcos adds +0.6 (capped at 3)
  if (state.maSourcing && state.maSourcing.tier >= 2 && activeBusinesses.length >= 3) {
    sharedServicesScore = Math.min(3, sharedServicesScore + 0.6);
  }

  // Capital return discipline (4 points)
  let distributionScore = 0;

  const madeDistributions = state.totalDistributions > 0;
  const avgRoiicDuringGame = state.metricsHistory.length > 0
    ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
    : 0;

  const cashToEbitda = metrics.totalEbitda > 0 ? state.cash / metrics.totalEbitda : 0;
  const hasExcessCash = cashToEbitda > 2.0 && metrics.netDebtToEbitda < 1.0;

  if (madeDistributions) {
    if (avgRoiicDuringGame < 0.15 && metrics.netDebtToEbitda < 2.0) {
      distributionScore += 3.2;
    } else if (avgRoiicDuringGame < 0.20 && metrics.netDebtToEbitda < 2.5) {
      distributionScore += 1.6;
    }

    if (metrics.netDebtToEbitda > 2.5) {
      distributionScore = Math.max(0, distributionScore - 1.6);
    }

    const distributionPct = state.totalInvestedCapital > 0
      ? state.totalDistributions / state.totalInvestedCapital
      : 0;
    if (distributionPct > 0.10 && metrics.netDebtToEbitda < 1.5) {
      distributionScore = Math.min(4, distributionScore + 0.8);
    }
  } else {
    if (hasExcessCash) {
      distributionScore = 0.8;
    } else if (avgRoiicDuringGame > 0.15) {
      distributionScore = 3.2;
    } else {
      distributionScore = 1.6;
    }
  }

  // Deal quality (5 points — kept to amplify quality's importance)
  const avgQuality = allBusinesses.length > 0
    ? allBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / allBusinesses.length
    : 3;
  const dealQualityScore = Math.min(5, (avgQuality / 5) * 5);

  strategicDiscipline = sectorFocusScore + sharedServicesScore + distributionScore + dealQualityScore;

  // Calculate total
  const total = Math.round(
    valueCreation + fcfShareGrowth + portfolioRoic + capitalDeployment + balanceSheetHealth + strategicDiscipline
  );

  // Determine grade
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  let title: string;

  if (total >= 95) {
    grade = 'S';
    title = "Master Allocator - You'd make Buffett proud";
  } else if (total >= 82) {
    grade = 'A';
    title = 'Skilled Compounder - Constellation-level discipline';
  } else if (total >= 65) {
    grade = 'B';
    title = 'Solid Builder - Your holdco has real potential';
  } else if (total >= 45) {
    grade = 'C';
    title = 'Emerging Operator - Room to sharpen your allocation instincts';
  } else if (total >= 25) {
    grade = 'D';
    title = 'Apprentice - Study the playbook and try again';
  } else {
    grade = 'F';
    title = 'Blown Up - Tyco sends its regards';
  }

  return {
    valueCreation: Math.round(valueCreation * 10) / 10,
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
  // Deduplicate: exitedBusinesses wins; filter out integrated bolt-ons and child bolt-ons
  const allBusinesses = getAllDedupedBusinesses(state.businesses, state.exitedBusinesses);

  // PE Fund Mode: separate insight path
  if (state.isFundManagerMode) {
    const fundSize = state.fundSize || 100000;
    const dpi = fundSize > 0 ? (state.lpDistributions || 0) / fundSize : 0;
    const totalDeployed = state.totalCapitalDeployed || 0;
    const deployPct = fundSize > 0 ? totalDeployed / fundSize : 0;
    const usedDebt = allBusinesses.some(b => b.bankDebtBalance > 0);
    // Check concentration: any single platform > 40% of total deployed
    const overConcentrated = allBusinesses.some(b => {
      const dealValue = b.acquisitionPrice + (b.bankDebtBalance || 0);
      return totalDeployed > 0 && dealValue / totalDeployed > 0.40;
    });
    // Hurdle: $100M * 1.08^10 ≈ $216M → need ~$116M above cost basis
    const nav = calculateEnterpriseValue(state);
    const totalValue = nav + (state.lpDistributions || 0);
    const hurdleTarget = fundSize * Math.pow(1.08, 10);
    const missedHurdleNarrowly = totalValue < hurdleTarget && totalValue >= hurdleTarget - 10000;

    if (dpi === 0 && allBusinesses.length > 0) insights.push(POST_GAME_INSIGHTS.pe_never_distributed);
    if (overConcentrated) insights.push(POST_GAME_INSIGHTS.pe_over_concentrated);
    if (dpi >= 0.5 && (state.round || 0) <= 7) insights.push(POST_GAME_INSIGHTS.pe_strong_dpi_timing);
    if (missedHurdleNarrowly) insights.push(POST_GAME_INSIGHTS.pe_missed_hurdle_narrowly);
    if (!usedDebt && allBusinesses.length > 1) insights.push(POST_GAME_INSIGHTS.pe_zero_leverage);
    if (deployPct < 0.60 && (state.round || 0) >= 5) insights.push(POST_GAME_INSIGHTS.pe_late_deployment);

    // Also include some universal insights that apply to PE
    if (allBusinesses.length > 1) {
      const marginExpanders = activeBusinesses.filter(b => b.ebitdaMargin - b.acquisitionMargin >= 0.03);
      if (marginExpanders.length >= 2) insights.push(POST_GAME_INSIGHTS.margin_improver);
    }
    const smartExits = state.exitedBusinesses.filter(b => {
      if (!b.exitPrice) return false;
      const moic = b.acquisitionPrice > 0 ? b.exitPrice / b.acquisitionPrice : 0;
      return moic > 2.0;
    });
    if (smartExits.length >= 2) insights.push(POST_GAME_INSIGHTS.smart_exits);

    return insights.slice(0, 3);
  }

  // Check for patterns (holdco mode)
  const neverAcquired = allBusinesses.length <= 1;
  const overLeveraged = metrics.netDebtToEbitda > 3;
  const singleSector = new Set(activeBusinesses.map(b => b.sectorId)).size === 1 && activeBusinesses.length >= 3;
  const highRoiicMoic = metrics.roiic > 0.20 && metrics.portfolioMoic > 2.0;
  const noReinvestment = state.sharedServices.every(s => !s.active) && allBusinesses.every(b => b.improvements.length === 0);
  const strongConversion = metrics.cashConversion > 0.80;
  const smartExits = state.exitedBusinesses.filter(b => {
    if (!b.exitPrice) return false;
    const moic = b.acquisitionPrice > 0 ? b.exitPrice / b.acquisitionPrice : 0;
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

  // Smart distributions: returned capital when ROIIC was low and balance sheet was healthy
  const avgRoiicForInsights = state.metricsHistory.length > 0
    ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
    : 0;
  if (state.totalDistributions > 0 && avgRoiicForInsights < 0.15 && metrics.netDebtToEbitda < 2.0) {
    insights.push(POST_GAME_INSIGHTS.smart_distributions);
  }

  // Idle cash hoarding: ended with excess cash and low leverage, never distributed
  const cashToEbitdaForInsights = metrics.totalEbitda > 0 ? state.cash / metrics.totalEbitda : 0;
  if (state.totalDistributions === 0 && cashToEbitdaForInsights > 2.0 && metrics.netDebtToEbitda < 1.0) {
    insights.push(POST_GAME_INSIGHTS.hoarded_cash);
  }

  // Revenue & Margin insights
  // Margin improver: avg margin expanded >3ppt vs acquisition across active businesses
  const marginExpanders = activeBusinesses.filter(b => b.ebitdaMargin - b.acquisitionMargin >= 0.03);
  if (marginExpanders.length >= 2) {
    insights.push(POST_GAME_INSIGHTS.margin_improver);
  }

  // Margin neglector: avg margin compressed >3ppt vs acquisition
  const marginCompressors = activeBusinesses.filter(b => b.acquisitionMargin - b.ebitdaMargin >= 0.03);
  if (marginCompressors.length >= 2 && marginCompressors.length > marginExpanders.length) {
    insights.push(POST_GAME_INSIGHTS.margin_neglector);
  }

  // Revenue engine: total revenue grew >100% from first year
  if (state.metricsHistory.length > 1) {
    const startRevenue = state.metricsHistory[0]?.metrics.totalRevenue || 0;
    if (startRevenue > 0 && metrics.totalRevenue > startRevenue * 2) {
      insights.push(POST_GAME_INSIGHTS.revenue_engine);
    }
  }

  // Turnaround artist: bought low-margin businesses and expanded them
  const turnarounds = activeBusinesses.filter(b =>
    b.acquisitionMargin < 0.15 && b.ebitdaMargin >= b.acquisitionMargin + 0.05
  );
  if (turnarounds.length >= 1) {
    insights.push(POST_GAME_INSIGHTS.turnaround_artist);
  }

  // Rule of 40 master: SaaS/education businesses with growth% + margin% >= 40
  const ro40Businesses = activeBusinesses.filter(b =>
    (b.sectorId === 'saas' || b.sectorId === 'education') &&
    (b.revenueGrowthRate * 100 + b.ebitdaMargin * 100) >= 40
  );
  if (ro40Businesses.length >= 1) {
    insights.push(POST_GAME_INSIGHTS.rule_of_40_master);
  }

  // Return top 3 most relevant
  return insights.slice(0, 3);
}

// --- Local (localStorage) leaderboard functions (offline fallback) ---

/**
 * Load leaderboard from localStorage
 */
export function loadLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save a new entry to the local leaderboard
 */
export function saveToLocalLeaderboard(entry: Omit<LeaderboardEntry, 'id' | 'date'>): LeaderboardEntry {
  const leaderboard = loadLocalLeaderboard();

  const newEntry: LeaderboardEntry = {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };

  leaderboard.push(newEntry);

  // Sort by adjusted FEV (applies difficulty multiplier for fair cross-difficulty comparison)
  leaderboard.sort((a, b) => getAdjustedFEV(b) - getAdjustedFEV(a));

  // Keep only top entries
  const trimmed = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);

  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));

  return newEntry;
}

// --- Sync helpers (operate on pre-fetched arrays, used by localStorage) ---

/**
 * Check if a score would make the leaderboard (localStorage)
 */
export function wouldMakeLeaderboard(enterpriseValue: number): boolean {
  const leaderboard = loadLocalLeaderboard();
  if (leaderboard.length < MAX_LEADERBOARD_ENTRIES) return true;
  return enterpriseValue > (leaderboard[leaderboard.length - 1]?.enterpriseValue ?? 0);
}

/**
 * Get leaderboard rank for an entry (localStorage)
 */
export function getLeaderboardRank(enterpriseValue: number): number {
  const leaderboard = loadLocalLeaderboard();
  let rank = 1;
  for (const entry of leaderboard) {
    if (entry.enterpriseValue > enterpriseValue) {
      rank++;
    }
  }
  return rank;
}

// --- Sync helpers for pre-fetched arrays (used by UI with global data) ---

const GLOBAL_LEADERBOARD_SIZE = 500;

/**
 * Check if a score would make a pre-fetched leaderboard.
 * Value should be the adjusted FEV (with difficulty multiplier already applied).
 */
export function wouldMakeLeaderboardFromList(entries: LeaderboardEntry[], adjustedValue: number): boolean {
  if (entries.length < GLOBAL_LEADERBOARD_SIZE) return true;
  const lowestEntry = entries[entries.length - 1];
  const lowestAdjusted = lowestEntry ? getAdjustedFEV(lowestEntry) : 0;
  return adjustedValue > lowestAdjusted;
}

/**
 * Get rank within a pre-fetched leaderboard.
 * Value should be the adjusted FEV (with difficulty multiplier already applied).
 */
export function getLeaderboardRankFromList(entries: LeaderboardEntry[], adjustedValue: number): number {
  let rank = 1;
  for (const entry of entries) {
    if (getAdjustedFEV(entry) > adjustedValue) {
      rank++;
    }
  }
  return rank;
}

// --- Async API functions (global leaderboard) ---

/**
 * Load leaderboard from global API, with localStorage fallback
 */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard/get');
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return loadLocalLeaderboard();
  }
}

/**
 * Submit score to global leaderboard + save locally (dual-write)
 */
export async function saveToLeaderboard(
  entry: Omit<LeaderboardEntry, 'id' | 'date'>,
  extra?: { completionId?: string; totalRounds: number; totalInvestedCapital: number; totalRevenue: number; avgEbitdaMargin: number; difficulty?: GameDifficulty; duration?: string; founderEquityValue?: number; founderPersonalWealth?: number; hasRestructured?: boolean; submittedMultiplier?: number; familyOfficeCompleted?: boolean; legacyGrade?: string; foMultiplier?: number; strategy?: LeaderboardStrategy; isFundManager?: boolean; fundName?: string; netIrr?: number; grossMoic?: number; carryEarned?: number }
): Promise<LeaderboardEntry> {
  const newEntry: LeaderboardEntry = {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };

  // Generate claimToken for future ownership proof (Phase 1 — player accounts)
  const claimToken = crypto.randomUUID();

  // Get Supabase auth token if available (anonymous or authenticated)
  let accessToken: string | null = null;
  try {
    const { getAccessToken } = await import('../lib/supabase');
    accessToken = await getAccessToken();
  } catch { /* Supabase not configured — continue without auth */ }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...entry, ...extra, claimToken }),
    });
    if (res.ok) {
      const data = await res.json();
      newEntry.id = data.id;
    } else {
      console.error('Leaderboard submit failed:', res.status, await res.text().catch(() => ''));
      newEntry._submitFailed = true;
    }
  } catch (err) {
    console.error('Leaderboard submit error:', err);
    newEntry._submitFailed = true;
  }

  // Always save locally too (dual-write) — merge extra fields so local has FEV/difficulty
  const localEntry = {
    ...entry,
    ...(extra?.founderEquityValue != null ? { founderEquityValue: extra.founderEquityValue } : {}),
    ...(extra?.founderPersonalWealth != null ? { founderPersonalWealth: extra.founderPersonalWealth } : {}),
    ...(extra?.difficulty ? { difficulty: extra.difficulty as GameDifficulty } : {}),
    ...(extra?.duration ? { duration: extra.duration as 'standard' | 'quick' } : {}),
    ...(extra?.hasRestructured ? { hasRestructured: extra.hasRestructured } : {}),
    ...(extra?.submittedMultiplier != null ? { submittedMultiplier: extra.submittedMultiplier } : {}),
    ...(extra?.familyOfficeCompleted ? { familyOfficeCompleted: extra.familyOfficeCompleted } : {}),
    ...(extra?.legacyGrade ? { legacyGrade: extra.legacyGrade } : {}),
    ...(extra?.foMultiplier != null ? { foMultiplier: extra.foMultiplier } : {}),
    ...(extra?.strategy ? { strategy: extra.strategy } : {}),
    ...(extra?.isFundManager ? { isFundManager: true } : {}),
    ...(extra?.fundName ? { fundName: extra.fundName } : {}),
    ...(extra?.netIrr != null ? { netIrr: extra.netIrr } : {}),
    ...(extra?.grossMoic != null ? { grossMoic: extra.grossMoic } : {}),
    ...(extra?.carryEarned != null ? { carryEarned: extra.carryEarned } : {}),
    claimToken, // Store locally for future claiming (Phase 2)
  };
  saveToLocalLeaderboard(localEntry);
  return newEntry;
}

// ── PE Fund Scoring ──

/**
 * Linear interpolation helper for score calculations.
 * Maps `value` from [minVal, maxVal] to [minPoints, maxPoints], clamped.
 */
export function linearInterpolate(
  value: number,
  minVal: number,
  maxVal: number,
  minPoints: number,
  maxPoints: number,
): number {
  if (value <= minVal) return minPoints;
  if (value >= maxVal) return maxPoints;
  return minPoints + ((value - minVal) / (maxVal - minVal)) * (maxPoints - minPoints);
}

/**
 * Newton's method IRR calculation.
 * Cash flows are { round, amount } where negative = outflow, positive = inflow.
 */
export function calculateIRR(cashFlows: { round: number; amount: number }[]): number {
  // Guard: if total positive cash flows <= 0, return -1.0
  const totalPositive = cashFlows.reduce((sum, cf) => sum + (cf.amount > 0 ? cf.amount : 0), 0);
  if (totalPositive <= 0) return -1.0;

  let irr = 0.10;

  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dnpv = 0;

    for (const cf of cashFlows) {
      npv += cf.amount / Math.pow(1 + irr, cf.round);
      dnpv += -cf.round * cf.amount / Math.pow(1 + irr, cf.round + 1);
    }

    if (Math.abs(npv) < 0.001) break;
    if (dnpv === 0) break;

    // Clamp Newton step to ±0.5 to prevent oscillation
    const step = npv / dnpv;
    const clampedStep = Math.max(-0.5, Math.min(0.5, step));
    irr = irr - clampedStep;
  }

  return irr;
}

/**
 * Calculate the carry waterfall for PE fund mode at game end.
 * Assumes all businesses have been liquidated — portfolio = 0, debt = 0.
 */
export function calculateCarryWaterfall(state: GameState): CarryWaterfall {
  const fundSize = state.fundSize || PE_FUND_CONFIG.fundSize;
  const lpDistributed = state.lpDistributions || 0;

  // At game end, all businesses liquidated, portfolio = 0, debt = 0
  const grossTotalReturns = lpDistributed + state.cash;

  // Base carry calculation (before IRR multiplier)
  const carryRate = PE_FUND_CONFIG.carryRate;
  const baseCarry = grossTotalReturns > PE_FUND_CONFIG.hurdleReturn
    ? (grossTotalReturns - PE_FUND_CONFIG.hurdleReturn) * carryRate
    : 0;

  // Two-pass approach: compute base net IRR using base carry
  const baseNetTerminal = state.cash - baseCarry;
  const baseIrrFlows: { round: number; amount: number }[] = [
    { round: 0, amount: -fundSize },
    ...(state.fundCashFlows || []),
    { round: 10, amount: baseNetTerminal },
  ];
  const baseNetIrr = calculateIRR(baseIrrFlows);

  // Look up IRR multiplier from tiers (sorted descending by minIrr)
  let irrMultiplier = 0.70; // default for loss
  for (const tier of PE_IRR_CARRY_TIERS) {
    if (baseNetIrr >= tier.minIrr) { irrMultiplier = tier.multiplier; break; }
  }

  // Apply multiplier to get adjusted carry
  const carry = baseCarry * irrMultiplier;

  const grossMoic = fundSize > 0 ? grossTotalReturns / fundSize : 0;
  const dpi = fundSize > 0 ? lpDistributed / fundSize : 0;

  // Final net IRR with adjusted carry
  const netTerminalValue = state.cash - carry;
  const irrCashFlows: { round: number; amount: number }[] = [
    { round: 0, amount: -fundSize },
    ...(state.fundCashFlows || []),
    { round: 10, amount: netTerminalValue },
  ];
  const netIrr = calculateIRR(irrCashFlows);

  // Management fees: annual fee × 10 rounds
  const managementFees = PE_FUND_CONFIG.annualManagementFee * 10;
  const totalGpEconomics = carry + managementFees;

  return {
    grossTotalReturns,
    returnOfCapital: fundSize,
    hurdleAmount: PE_FUND_CONFIG.hurdleReturn,
    hurdleCleared: grossTotalReturns > PE_FUND_CONFIG.hurdleReturn,
    aboveHurdle: Math.max(0, grossTotalReturns - PE_FUND_CONFIG.hurdleReturn),
    carry,
    baseCarry,
    irrMultiplier,
    managementFees,
    totalGpEconomics,
    grossMoic,
    netIrr,
    dpi,
    lpDistributions: lpDistributed,
    liquidationProceeds: state.cash,
  };
}

/**
 * Calculate PE Fund score breakdown (100-point scale).
 * 6 dimensions: Return Generation (25), Capital Efficiency (20),
 * Value Creation (15), Deployment Discipline (15), Risk Management (15),
 * LP Satisfaction (10).
 */
export function calculatePEFundScore(state: GameState): PEScoreBreakdown {
  const waterfall = calculateCarryWaterfall(state);
  const allBusinesses = getAllDedupedBusinesses(state.businesses, state.exitedBusinesses);

  // ── 1. Return Generation (25 pts) — based on net IRR ──
  let returnGeneration = 0;
  const irr = waterfall.netIrr;
  if (irr >= 0.20) {
    returnGeneration = 25;
  } else if (irr >= 0.15) {
    returnGeneration = linearInterpolate(irr, 0.15, 0.20, 18, 25);
  } else if (irr >= 0.08) {
    returnGeneration = linearInterpolate(irr, 0.08, 0.15, 8, 18);
  } else if (irr >= 0.04) {
    returnGeneration = linearInterpolate(irr, 0.04, 0.08, 3, 8);
  } else if (irr >= 0) {
    returnGeneration = linearInterpolate(irr, 0, 0.04, 0, 3);
  } else {
    returnGeneration = 0;
  }

  // ── 2. Capital Efficiency (20 pts) — based on gross MOIC ──
  let capitalEfficiency = 0;
  const moic = waterfall.grossMoic;
  if (moic >= 3.5) {
    capitalEfficiency = 20;
  } else if (moic >= 3.0) {
    capitalEfficiency = linearInterpolate(moic, 3.0, 3.5, 16, 20);
  } else if (moic >= 2.5) {
    capitalEfficiency = linearInterpolate(moic, 2.5, 3.0, 12, 16);
  } else if (moic >= 2.0) {
    capitalEfficiency = linearInterpolate(moic, 2.0, 2.5, 8, 12);
  } else if (moic >= 1.5) {
    capitalEfficiency = linearInterpolate(moic, 1.5, 2.0, 4, 8);
  } else if (moic >= 1.0) {
    capitalEfficiency = linearInterpolate(moic, 1.0, 1.5, 0, 4);
  } else {
    capitalEfficiency = 0;
  }

  // ── 3. Value Creation (15 pts) — weighted avg EBITDA growth across portfolio ──
  let valueCreation = 0;
  if (allBusinesses.length > 0) {
    let totalWeight = 0;
    let weightedGrowth = 0;
    for (const biz of allBusinesses) {
      if (biz.acquisitionEbitda > 0) {
        const growth = (biz.ebitda - biz.acquisitionEbitda) / biz.acquisitionEbitda;
        totalWeight += biz.acquisitionEbitda;
        weightedGrowth += growth * biz.acquisitionEbitda;
      }
    }
    const avgEbitdaGrowth = totalWeight > 0 ? weightedGrowth / totalWeight : 0;

    if (avgEbitdaGrowth >= 1.0) {
      valueCreation = 15;
    } else if (avgEbitdaGrowth >= 0.5) {
      valueCreation = linearInterpolate(avgEbitdaGrowth, 0.5, 1.0, 8, 15);
    } else if (avgEbitdaGrowth >= 0.2) {
      valueCreation = linearInterpolate(avgEbitdaGrowth, 0.2, 0.5, 3, 8);
    } else if (avgEbitdaGrowth >= 0) {
      valueCreation = linearInterpolate(avgEbitdaGrowth, 0, 0.2, 0, 3);
    } else {
      valueCreation = 0;
    }
  }

  // ── 4. Deployment Discipline (15 pts) — Pacing (10) + Harvest (5) ──
  let deploymentDiscipline = 0;
  const totalCapitalDeployed = state.totalCapitalDeployed || 0;
  const fundSize = state.fundSize || PE_FUND_CONFIG.fundSize;

  if (totalCapitalDeployed > 0) {
    // Pacing sub-component (10 pts): % deployed by Year 5
    let pacingScore = 0;
    // Calculate capital deployed by Year 5 from round history
    let capitalByYear5 = 0;
    for (const rh of state.roundHistory) {
      if (rh.round <= 5) {
        for (const action of rh.actions) {
          if (action.type === 'acquire' || action.type === 'acquire_tuck_in') {
            // Use cashDeployed (equity check) if available, fall back to price for old saves
            capitalByYear5 += (action.details.cashDeployed as number) ?? (action.details.price as number) ?? 0;
          }
        }
      }
    }
    const deployedPct = fundSize > 0 ? capitalByYear5 / fundSize : 0;
    if (deployedPct >= 0.80) {
      pacingScore = 10;
    } else if (deployedPct >= 0.60) {
      pacingScore = 7;
    } else if (deployedPct >= 0.40) {
      pacingScore = 3;
    } else {
      pacingScore = 0;
    }

    // Harvest sub-component (5 pts): standalone acquisitions after Year 5
    let lateAcquisitions = 0;
    for (const rh of state.roundHistory) {
      if (rh.round > 5) {
        for (const action of rh.actions) {
          if (action.type === 'acquire') {
            lateAcquisitions++;
          }
        }
      }
    }
    let harvestScore = 0;
    if (lateAcquisitions === 0) {
      harvestScore = 5;
    } else if (lateAcquisitions === 1) {
      harvestScore = 3;
    } else {
      harvestScore = 0;
    }

    deploymentDiscipline = pacingScore + harvestScore;
  }

  // ── 5. Risk Management (15 pts) — leverage curve + bonuses ──
  let riskManagement = 0;

  // Portfolio-level net debt / EBITDA
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const totalDebt = state.totalDebt + activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance, 0);
  const netDebt = totalDebt - state.cash;
  const netDebtToEbitda = totalEbitda > 0
    ? netDebt / totalEbitda
    : (netDebt <= 0 ? 0 : 4.1); // 0 EBITDA 0 debt → 0; 0 EBITDA positive debt → treat as 4x+

  let leverageScore = 0;
  if (netDebtToEbitda < 0) {
    // Net cash position
    leverageScore = 3;
  } else if (netDebtToEbitda <= 1.0) {
    leverageScore = linearInterpolate(netDebtToEbitda, 0, 1.0, 4, 6);
  } else if (netDebtToEbitda <= 1.5) {
    leverageScore = linearInterpolate(netDebtToEbitda, 1.0, 1.5, 6, 8);
  } else if (netDebtToEbitda <= 3.0) {
    leverageScore = linearInterpolate(netDebtToEbitda, 1.5, 3.0, 8, 10);
  } else if (netDebtToEbitda <= 4.0) {
    leverageScore = linearInterpolate(netDebtToEbitda, 3.0, 4.0, 4, 8);
  } else {
    leverageScore = linearInterpolate(netDebtToEbitda, 4.0, 6.0, 0, 4);
  }
  // Cap leverage component at 10 before bonuses
  leverageScore = Math.min(10, leverageScore);

  // Bonus: no covenant breaches (+3)
  const everBreached = state.metricsHistory.some(h => h.metrics.distressLevel === 'breach');
  if (!everBreached) {
    riskManagement += 3;
  }

  // Bonus: no restructurings (+2)
  if (!state.hasRestructured) {
    riskManagement += 2;
  }

  riskManagement += leverageScore;

  // ── 6. LP Satisfaction (10 pts) ──
  let lpSatisfaction = 0;
  const lpScore = state.lpSatisfactionScore ?? PE_FUND_CONFIG.lpSatisfactionStart;
  if (lpScore >= 80) {
    lpSatisfaction = 10;
  } else if (lpScore >= 60) {
    lpSatisfaction = linearInterpolate(lpScore, 60, 79, 6, 9);
  } else if (lpScore >= 40) {
    lpSatisfaction = linearInterpolate(lpScore, 40, 59, 2, 5);
  } else if (lpScore >= 20) {
    lpSatisfaction = linearInterpolate(lpScore, 20, 39, 0, 1);
  } else {
    lpSatisfaction = 0;
  }

  // ── Total & Grade ──
  let total = Math.round(
    returnGeneration + capitalEfficiency + valueCreation +
    deploymentDiscipline + riskManagement + lpSatisfaction
  );

  // Determine grade from thresholds
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (total >= PE_GRADE_THRESHOLDS.S) {
    grade = 'S';
  } else if (total >= PE_GRADE_THRESHOLDS.A) {
    grade = 'A';
  } else if (total >= PE_GRADE_THRESHOLDS.B) {
    grade = 'B';
  } else if (total >= PE_GRADE_THRESHOLDS.C) {
    grade = 'C';
  } else if (total >= PE_GRADE_THRESHOLDS.D) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  // LP satisfaction grade cap: if lpSatisfactionScore < 20, cap grade at C
  if (lpScore < PE_FUND_CONFIG.lpSatisfactionGradeCap && (grade === 'S' || grade === 'A' || grade === 'B')) {
    grade = 'C';
  }

  // Bankruptcy override
  if (state.bankruptRound) {
    total = 0;
    grade = 'F';
  }

  return {
    returnGeneration: Math.round(returnGeneration * 10) / 10,
    capitalEfficiency: Math.round(capitalEfficiency * 10) / 10,
    valueCreation: Math.round(valueCreation * 10) / 10,
    deploymentDiscipline: Math.round(deploymentDiscipline * 10) / 10,
    riskManagement: Math.round(riskManagement * 10) / 10,
    lpSatisfaction: Math.round(lpSatisfaction * 10) / 10,
    total,
    grade,
    gradeTitle: PE_GRADE_TITLES[grade] || '',
  };
}
