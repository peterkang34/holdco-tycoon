/**
 * Builds the context object required by generateYearChronicle().
 *
 * Extracted from the Zustand store to keep the store focused on state management
 * while this module handles the data-assembly logic.
 */

import type { GameState, Business, Metrics } from '../engine/types';
import { formatMoney } from '../engine/types';
import { calculateMetrics, calculatePortfolioTax } from '../engine/simulation';
import { calculateFounderEquityValue } from '../engine/scoring';
import { SECTORS } from '../data/sectors';
import { getMASourcingAnnualCost } from '../data/sharedServices';

/** Human-readable labels for improvement type enums. */
const IMPROVEMENT_LABELS: Record<string, string> = {
  operating_playbook: 'Operating Playbook',
  pricing_model: 'Pricing Model',
  service_expansion: 'Service Expansion',
  fix_underperformance: 'Fix Underperformance',
  recurring_revenue_conversion: 'Recurring Revenue',
  management_professionalization: 'Professionalize Mgmt',
  digital_transformation: 'Digital Transformation',
};

/** Shape of the context object consumed by generateYearChronicle(). */
export interface ChronicleContext {
  holdcoName: string;
  year: number;
  totalEbitda: string;
  prevTotalEbitda?: string;
  ebitdaGrowth?: string;
  cash: string;
  portfolioCount: number;
  leverage: string;
  totalDebt: string;
  fcf: string;
  interestExpense: string;
  actions?: string;
  marketConditions?: string;
  concerns?: string;
  positives?: string;
  // Strategic context
  platformCount?: number;
  totalBoltOns?: number;
  avgQuality?: string;
  sectors?: string;
  sharedServices?: string;
  fcfPerShare?: string;
  founderEquityValue?: string;
  // Revenue/margin context
  totalRevenue?: string;
  avgMargin?: string;
  revenueGrowth?: string;
  marginChange?: string;
}

/**
 * Build the actions summary string from the round's action list.
 */
function buildActionsSummary(actionsThisRound: GameState['actionsThisRound']): string {
  const actionParts: string[] = [];

  const acquisitions = actionsThisRound.filter(a => a.type === 'acquire' || a.type === 'acquire_tuck_in');
  const sales = actionsThisRound.filter(a => a.type === 'sell');
  const improvements = actionsThisRound.filter(a => a.type === 'improve');
  const debtPaydowns = actionsThisRound.filter(a => a.type === 'pay_debt');
  const equityRaises = actionsThisRound.filter(a => a.type === 'issue_equity');
  const distributions = actionsThisRound.filter(a => a.type === 'distribute');
  const buybacks = actionsThisRound.filter(a => a.type === 'buyback');
  const merges = actionsThisRound.filter(a => a.type === 'merge_businesses');
  const platformDesignations = actionsThisRound.filter(a => a.type === 'designate_platform');
  const sharedServiceUnlocks = actionsThisRound.filter(a => a.type === 'unlock_shared_service');
  const maSourcingUpgrades = actionsThisRound.filter(a => a.type === 'upgrade_ma_sourcing');

  if (acquisitions.length > 0) {
    const acqDetails = acquisitions.map(a => {
      const name = (a.details?.businessName as string) || 'a business';
      const sector = (a.details?.sector as string) || '';
      const isTuckIn = a.type === 'acquire_tuck_in';
      return isTuckIn ? `${name} (tuck-in, ${sector})` : `${name} (${sector})`;
    });
    const totalSpent = acquisitions.reduce((sum, a) => sum + ((a.details?.cost as number) || (a.details?.askingPrice as number) || 0), 0);
    actionParts.push(`Acquired ${acqDetails.join(', ')}${totalSpent > 0 ? ` for ${formatMoney(totalSpent)} total` : ''}`);
  }
  if (merges.length > 0) {
    actionParts.push(`Merged ${merges.length} business pair${merges.length > 1 ? 's' : ''} to create scale`);
  }
  if (platformDesignations.length > 0) {
    const names = platformDesignations.map(a => (a.details?.businessName as string) || 'a business');
    actionParts.push(`Designated ${names.join(', ')} as platform${names.length > 1 ? 's' : ''}`);
  }
  if (sales.length > 0) {
    const saleDetails = sales.map(a => {
      const name = (a.details?.businessName as string) || 'a business';
      const moic = a.details?.moic as number | undefined;
      return moic ? `${name} (${moic.toFixed(1)}x MOIC)` : name;
    });
    actionParts.push(`Sold ${saleDetails.join(', ')}`);
  }
  if (improvements.length > 0) {
    const improvTypes = improvements.map(a => {
      const raw = (a.details?.improvementType as string) || 'operational';
      return IMPROVEMENT_LABELS[raw] || raw.replace(/_/g, ' ');
    }).filter((v, i, a) => a.indexOf(v) === i);
    actionParts.push(`Made ${improvements.length} improvement${improvements.length > 1 ? 's' : ''} (${improvTypes.join(', ')})`);
  }
  if (sharedServiceUnlocks.length > 0) {
    actionParts.push('Invested in shared services infrastructure');
  }
  if (maSourcingUpgrades.length > 0) {
    actionParts.push('Upgraded M&A sourcing capabilities');
  }
  if (debtPaydowns.length > 0) {
    const totalPaid = debtPaydowns.reduce((sum, a) => sum + ((a.details?.amount as number) || 0), 0);
    if (totalPaid > 0) actionParts.push(`Paid down ${formatMoney(totalPaid)} in debt`);
  }
  if (equityRaises.length > 0) {
    actionParts.push('Raised equity capital');
  }
  if (distributions.length > 0) {
    const totalDist = distributions.reduce((sum, a) => sum + ((a.details?.amount as number) || 0), 0);
    actionParts.push(`Distributed ${totalDist > 0 ? formatMoney(totalDist) : 'cash'} to owners`);
  }
  if (buybacks.length > 0) {
    actionParts.push('Bought back shares');
  }

  return actionParts.length > 0
    ? actionParts.join('. ') + '.'
    : 'Focused on organic growth and portfolio management.';
}

/**
 * Derive market-conditions label from the most recent event.
 */
function deriveMarketConditions(eventHistory: GameState['eventHistory']): string {
  const lastEvent = eventHistory[eventHistory.length - 1];
  if (!lastEvent) return 'Normal market conditions';

  switch (lastEvent.type) {
    case 'global_recession': return 'Recessionary environment';
    case 'global_bull_market': return 'Bull market conditions';
    case 'global_inflation': return 'Inflationary pressures';
    case 'global_credit_tightening': return 'Tight credit markets';
    case 'global_interest_hike': return 'Rising interest rates';
    case 'global_interest_cut': return 'Falling interest rates';
    default: return 'Normal market conditions';
  }
}

/**
 * Build concerns and positives arrays from metrics and active businesses.
 */
function buildConcernsAndPositives(
  metrics: Metrics,
  activeBusinesses: Business[],
  ebitdaGrowthPct: number | null,
  platforms: Business[],
  totalBoltOns: number,
  sectors: string[],
): { concerns: string[]; positives: string[] } {
  const concerns: string[] = [];
  const positives: string[] = [];

  const totalDebt = metrics.totalDebt;
  const interestExpense = Math.round(totalDebt * metrics.interestRate);
  const fcf = metrics.totalFcf;

  // Financial concerns
  if (fcf < 0) concerns.push(`Negative free cash flow of ${formatMoney(fcf)}`);
  if (metrics.netDebtToEbitda > 3) concerns.push(`High leverage at ${metrics.netDebtToEbitda.toFixed(1)}x net debt/EBITDA`);
  if (interestExpense > metrics.totalEbitda * 0.3) concerns.push(`Interest consuming ${Math.round(interestExpense / metrics.totalEbitda * 100)}% of EBITDA`);

  // Operational concerns
  const lowQualityBiz = activeBusinesses.filter(b => b.qualityRating <= 2);
  if (lowQualityBiz.length > 0) concerns.push(`${lowQualityBiz.length} business${lowQualityBiz.length > 1 ? 'es' : ''} rated quality 2 or below`);
  if (ebitdaGrowthPct !== null && ebitdaGrowthPct < -5) concerns.push(`Portfolio EBITDA declined ${Math.abs(ebitdaGrowthPct)}% year-over-year`);

  // Margin concerns
  const marginCompressingBiz = activeBusinesses.filter(b => b.ebitdaMargin < b.acquisitionMargin - 0.03);
  if (marginCompressingBiz.length > 0) concerns.push(`${marginCompressingBiz.length} business${marginCompressingBiz.length > 1 ? 'es' : ''} with significant margin compression`);

  // Financial positives
  if (fcf > 0 && metrics.totalEbitda > 0) positives.push(`Generating ${formatMoney(fcf)} in free cash flow`);
  if (metrics.netDebtToEbitda < 1 && metrics.netDebtToEbitda >= 0) positives.push('Conservative balance sheet');
  if (metrics.portfolioRoic > 0.15) positives.push(`Strong ${Math.round(metrics.portfolioRoic * 100)}% ROIC`);

  // Operational/strategic positives
  if (ebitdaGrowthPct !== null && ebitdaGrowthPct > 10) positives.push(`Portfolio EBITDA grew ${ebitdaGrowthPct}% year-over-year`);
  if (platforms.length > 0 && totalBoltOns > 0) positives.push(`Roll-up strategy progressing: ${platforms.length} platform${platforms.length > 1 ? 's' : ''} with ${totalBoltOns} bolt-on${totalBoltOns > 1 ? 's' : ''}`);
  // Quality rating removed from chronicle — was unhelpful ("portfolio quality of 4.0/5")
  if (sectors.length >= 4) positives.push(`Well-diversified across ${sectors.length} sectors`);

  // Margin expansion positive
  const marginExpandingBiz = activeBusinesses.filter(b => b.ebitdaMargin > b.acquisitionMargin + 0.03);
  if (marginExpandingBiz.length > 0) positives.push(`${marginExpandingBiz.length} business${marginExpandingBiz.length > 1 ? 'es' : ''} with meaningful margin expansion`);

  return { concerns, positives };
}

/**
 * Assemble the full ChronicleContext from the current game state.
 *
 * This is a pure function — it reads from state but does not modify it.
 */
export function buildChronicleContext(state: GameState): ChronicleContext {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const metrics = calculateMetrics(state);

  const actionsSummary = buildActionsSummary(state.actionsThisRound);
  const marketConditions = deriveMarketConditions(state.eventHistory);

  // Financial health signals
  const totalDebt = metrics.totalDebt;
  const interestExpense = Math.round(totalDebt * metrics.interestRate);

  // Compute FCF matching CollectPhase waterfall (includes ALL opco debt service)
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const maSourcingCost = state.maSourcing?.active
    ? getMASourcingAnnualCost(state.maSourcing.tier)
    : 0;
  const totalDeductibleCosts = sharedServicesCost + maSourcingCost;
  const totalBusinessFcf = activeBusinesses.reduce((sum, b) => {
    const sector = SECTORS[b.sectorId];
    const capex = Math.round(b.ebitda * sector.capexRate);
    const snInterest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
    const snPrincipal = b.sellerNoteRoundsRemaining > 0
      ? Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining) : 0;
    const bankInterest = Math.round(b.bankDebtBalance * state.interestRate);
    // Earn-out: triggers when cumulative EBITDA growth meets target
    let earnout = 0;
    if (b.earnoutRemaining > 0 && b.earnoutTarget > 0 && b.acquisitionEbitda > 0) {
      const growth = (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda;
      if (growth >= b.earnoutTarget) earnout = b.earnoutRemaining;
    }
    return sum + (b.ebitda - capex - snInterest - snPrincipal - bankInterest - earnout);
  }, 0);
  // Debt service from integrated (tuck-in) businesses: seller notes + earnouts
  const integratedDebtService = state.businesses
    .filter(b => b.status === 'integrated')
    .reduce((sum, b) => {
      let debt = 0;
      // Seller note interest + principal
      if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
        debt += Math.round(b.sellerNoteBalance * b.sellerNoteRate);
        debt += Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
      }
      // Earn-out using platform growth as proxy
      if (b.earnoutRemaining > 0 && b.earnoutTarget > 0 && b.parentPlatformId) {
        const platform = state.businesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
        if (platform && platform.acquisitionEbitda > 0) {
          const growth = (platform.ebitda - platform.acquisitionEbitda) / platform.acquisitionEbitda;
          if (growth >= b.earnoutTarget) debt += b.earnoutRemaining;
        }
      }
      return sum + debt;
    }, 0);
  const taxBreakdown = calculatePortfolioTax(activeBusinesses, state.totalDebt, state.interestRate, totalDeductibleCosts);
  const holdcoInterest = Math.round(state.totalDebt * state.interestRate);
  const fcf = totalBusinessFcf - taxBreakdown.taxAmount - holdcoInterest - sharedServicesCost - maSourcingCost - integratedDebtService;

  // EBITDA growth
  const prevMetrics = state.metricsHistory.length > 0
    ? state.metricsHistory[state.metricsHistory.length - 1]
    : null;
  const prevTotalEbitda = prevMetrics ? formatMoney(prevMetrics.metrics.totalEbitda) : undefined;
  const ebitdaGrowthPct = prevMetrics && prevMetrics.metrics.totalEbitda > 0
    ? Math.round(((metrics.totalEbitda - prevMetrics.metrics.totalEbitda) / prevMetrics.metrics.totalEbitda) * 100)
    : null;

  // Portfolio composition
  const platforms = activeBusinesses.filter(b => b.isPlatform);
  const totalBoltOns = platforms.reduce((sum, p) => sum + (p.boltOnIds?.length || 0), 0);
  const avgQuality = activeBusinesses.length > 0
    ? (activeBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / activeBusinesses.length).toFixed(1)
    : '0';
  const sectors = [...new Set(activeBusinesses.map(b => SECTORS[b.sectorId]?.name || b.sectorId))];
  const activeSharedServices = state.sharedServices.filter(s => s.active).map(s => s.name);

  const { concerns, positives } = buildConcernsAndPositives(
    metrics,
    activeBusinesses,
    ebitdaGrowthPct,
    platforms,
    totalBoltOns,
    sectors,
  );

  return {
    holdcoName: state.holdcoName,
    year: state.round,
    totalEbitda: formatMoney(metrics.totalEbitda),
    prevTotalEbitda,
    ebitdaGrowth: ebitdaGrowthPct !== null ? `${ebitdaGrowthPct > 0 ? '+' : ''}${ebitdaGrowthPct}%` : undefined,
    cash: formatMoney(state.cash),
    portfolioCount: activeBusinesses.length,
    leverage: metrics.netDebtToEbitda < 0 ? 'Net cash position' : `${metrics.netDebtToEbitda.toFixed(1)}x`,
    totalDebt: formatMoney(totalDebt),
    fcf: formatMoney(fcf),
    interestExpense: formatMoney(interestExpense),
    actions: actionsSummary,
    marketConditions,
    concerns: concerns.length > 0 ? concerns.join('; ') : undefined,
    positives: positives.length > 0 ? positives.join('; ') : undefined,
    // Strategic context
    platformCount: platforms.length,
    totalBoltOns,
    avgQuality,
    sectors: sectors.join(', '),
    sharedServices: activeSharedServices.length > 0 ? activeSharedServices.join(', ') : undefined,
    fcfPerShare: formatMoney(metrics.fcfPerShare),
    founderEquityValue: formatMoney(calculateFounderEquityValue(state)),
    // Revenue/margin context
    totalRevenue: formatMoney(metrics.totalRevenue),
    avgMargin: `${(metrics.avgEbitdaMargin * 100).toFixed(0)}%`,
    revenueGrowth: prevMetrics && prevMetrics.metrics.totalRevenue > 0
      ? `${Math.round(((metrics.totalRevenue - prevMetrics.metrics.totalRevenue) / prevMetrics.metrics.totalRevenue) * 100)}%`
      : undefined,
    marginChange: prevMetrics
      ? `${((metrics.avgEbitdaMargin - prevMetrics.metrics.avgEbitdaMargin) * 100) >= 0 ? '+' : ''}${((metrics.avgEbitdaMargin - prevMetrics.metrics.avgEbitdaMargin) * 100).toFixed(1)} ppt`
      : undefined,
  };
}
