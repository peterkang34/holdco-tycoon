import {
  GameState,
  GameDifficulty,
  ScoreBreakdown,
  PostGameInsight,
  LeaderboardEntry,
} from './types';
import { calculateMetrics, calculateSectorFocusBonus, calculateExitValuation } from './simulation';
import { POST_GAME_INSIGHTS } from '../data/tips';

const LEADERBOARD_KEY = 'holdco-tycoon-leaderboard';
const MAX_LEADERBOARD_ENTRIES = 10;

const DIFFICULTY_MULTIPLIER: Record<string, number> = { easy: 1.0, normal: 1.15 };

/** Compute adjusted FEV for a leaderboard entry (applies difficulty multiplier) */
function getAdjustedFEV(entry: LeaderboardEntry): number {
  const raw = entry.founderEquityValue ?? entry.enterpriseValue;
  const multiplier = DIFFICULTY_MULTIPLIER[entry.difficulty ?? 'easy'] ?? 1.0;
  return Math.round(raw * multiplier);
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

  for (const business of activeBusinesses) {
    const valuation = calculateExitValuation(business, maxRounds);
    totalEbitda += business.ebitda;
    weightedMultiple += business.ebitda * valuation.totalMultiple;
  }

  const blendedMultiple = totalEbitda > 0 ? weightedMultiple / totalEbitda : 0;
  const portfolioValue = totalEbitda * blendedMultiple;

  // Calculate total holdco-level debt including opco-level seller notes
  // L-13: Only include sellerNoteBalance (bank debt is tracked at holdco level in state.totalDebt)
  const opcoDebt = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoDebt;

  // EV = Portfolio Value + Cash - All Debt (no distribution add-back)
  const ev = portfolioValue + state.cash - totalDebt;

  return Math.round(Math.max(0, ev));
}

/**
 * Calculate Founder Equity Value = NAV × ownership%
 * This is the PRIMARY leaderboard ranking metric.
 */
export function calculateFounderEquityValue(state: GameState): number {
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
  // Bankruptcy = immediate F grade, score 0
  if (state.bankruptRound) {
    return {
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
  const exitedIds = new Set(state.exitedBusinesses.map(b => b.id));
  const allBusinesses = [
    ...state.exitedBusinesses.filter(b => b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
    ...state.businesses.filter(b => !exitedIds.has(b.id) && b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
  ];

  // 1. FCF/Share Growth (25 points max)
  let fcfShareGrowth = 0;
  const maxRounds = state.maxRounds || 20;
  const fcfGrowthTarget = maxRounds >= 20 ? 3.0 : 1.5; // 300% for 20yr, 150% for 10yr
  if (state.metricsHistory.length > 1) {
    const startFcfPerShare = state.metricsHistory[0]?.metrics.fcfPerShare ?? 0;
    const endFcfPerShare = metrics.fcfPerShare;
    if (startFcfPerShare > 0) {
      const growth = (endFcfPerShare - startFcfPerShare) / startFcfPerShare;
      fcfShareGrowth = Math.min(25, Math.max(0, (growth / fcfGrowthTarget) * 25));
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
    const capital = business.totalAcquisitionCost || business.acquisitionPrice;
    let returns = 0;

    if (business.status === 'sold' && business.exitPrice) {
      returns = business.exitPrice;
    } else if (business.status === 'active') {
      // Use full valuation engine for current value
      const valuation = calculateExitValuation(business, maxRounds);
      returns = business.ebitda * valuation.totalMultiple;
    }

    totalMoicWeighted += returns;
    totalCapitalDeployed += capital;
  }

  const avgMoic = totalCapitalDeployed > 0 ? totalMoicWeighted / totalCapitalDeployed : 1;

  // MOIC component (10 points) — scale target by duration
  const moicFullMarks = maxRounds >= 20 ? 2.5 : 2.0;
  let moicScore = 0;
  if (avgMoic >= moicFullMarks) {
    moicScore = 10;
  } else if (avgMoic >= 1.5) {
    moicScore = 5 + ((avgMoic - 1.5) / (moicFullMarks - 1.5)) * 5;
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

  // Penalty for covenant breach
  const everBreached = state.metricsHistory.some(h => h.metrics.distressLevel === 'breach');
  if (everBreached) {
    balanceSheetHealth = Math.max(0, balanceSheetHealth - 3);
  }

  // Penalty for having used restructuring
  if (state.hasRestructured) {
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
    // Reward diversification — now competitive with focus scoring
    const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId));
    sectorFocusScore = Math.min(5, uniqueSectors.size >= 8 ? 5 : uniqueSectors.size >= 4 ? 4 : uniqueSectors.size);
  }

  // Shared services ROI (5 points)
  const activeServices = state.sharedServices.filter(s => s.active);
  let sharedServicesScore = 0;
  if (activeServices.length > 0 && activeBusinesses.length >= 3) {
    sharedServicesScore = Math.min(5, activeServices.length * 1.5);
  }
  // MA Sourcing bonus: tier 2+ with 3+ opcos adds +1 (capped at 5)
  if (state.maSourcing && state.maSourcing.tier >= 2 && activeBusinesses.length >= 3) {
    sharedServicesScore = Math.min(5, sharedServicesScore + 1);
  }

  // Capital return discipline (5 points)
  // The hierarchy: 1) Reinvest above hurdle, 2) Deleverage, 3) Buyback when cheap, 4) Distribute
  // Both hoarding cash AND distributing at the wrong time are penalized.
  let distributionScore = 0;

  const madeDistributions = state.totalDistributions > 0;
  const avgRoiicDuringGame = state.metricsHistory.length > 0
    ? state.metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / state.metricsHistory.length
    : 0;

  // Idle cash penalty: ending with excess cash and low leverage means you should have returned capital
  const cashToEbitda = metrics.totalEbitda > 0 ? state.cash / metrics.totalEbitda : 0;
  const hasExcessCash = cashToEbitda > 2.0 && metrics.netDebtToEbitda < 1.0;

  if (madeDistributions) {
    // Base: well-timed distributions earn points
    if (avgRoiicDuringGame < 0.15 && metrics.netDebtToEbitda < 2.0) {
      // Distributed when reinvestment returns were modest and balance sheet was healthy — good discipline
      distributionScore += 4;
    } else if (avgRoiicDuringGame < 0.20 && metrics.netDebtToEbitda < 2.5) {
      // Acceptable — returns were decent but not great, leverage manageable
      distributionScore += 2;
    } else {
      // Distributed while ROIIC was high (should have reinvested) or leverage was high (should have deleveraged)
      distributionScore += 0;
    }

    // Penalty for distributing while ending with leverage > 2.5x
    if (metrics.netDebtToEbitda > 2.5) {
      distributionScore = Math.max(0, distributionScore - 2);
    }

    // Bonus for meaningful capital return (not token amounts)
    const distributionPct = state.totalInvestedCapital > 0
      ? state.totalDistributions / state.totalInvestedCapital
      : 0;
    if (distributionPct > 0.10 && metrics.netDebtToEbitda < 1.5) {
      distributionScore = Math.min(5, distributionScore + 1);
    }
  } else {
    // Never distributed — fine if capital was well-deployed, penalized if hoarding
    if (hasExcessCash) {
      // Sitting on excess cash with low leverage = idle capital = bad allocation
      distributionScore = 1;
    } else if (avgRoiicDuringGame > 0.15) {
      // High ROIIC and no excess cash — reinvested everything productively
      distributionScore = 4;
    } else {
      // Mediocre returns and didn't distribute — neutral
      distributionScore = 2;
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
  // Deduplicate: exitedBusinesses wins; filter out integrated bolt-ons and child bolt-ons
  const exitedIdsInsights = new Set(state.exitedBusinesses.map(b => b.id));
  const allBusinesses = [
    ...state.exitedBusinesses.filter(b => b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
    ...state.businesses.filter(b => !exitedIdsInsights.has(b.id) && b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
  ];

  // Check for patterns
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

const GLOBAL_LEADERBOARD_SIZE = 50;

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
  extra?: { totalRounds: number; totalInvestedCapital: number; totalRevenue: number; avgEbitdaMargin: number; difficulty?: GameDifficulty; duration?: string; founderEquityValue?: number; founderPersonalWealth?: number }
): Promise<LeaderboardEntry> {
  const newEntry: LeaderboardEntry = {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, ...extra }),
    });
    if (res.ok) {
      const data = await res.json();
      newEntry.id = data.id;
    }
  } catch { /* silent fallback */ }

  // Always save locally too (dual-write) — merge extra fields so local has FEV/difficulty
  const localEntry = {
    ...entry,
    ...(extra?.founderEquityValue != null ? { founderEquityValue: extra.founderEquityValue } : {}),
    ...(extra?.founderPersonalWealth != null ? { founderPersonalWealth: extra.founderPersonalWealth } : {}),
    ...(extra?.difficulty ? { difficulty: extra.difficulty as GameDifficulty } : {}),
    ...(extra?.duration ? { duration: extra.duration as 'standard' | 'quick' } : {}),
  };
  saveToLocalLeaderboard(localEntry);
  return newEntry;
}
