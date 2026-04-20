/**
 * Pure computation functions for metric drilldown breakdowns.
 * Extracted from MetricDrilldownModal.tsx to enable testing parity
 * between dashboard (calculateMetrics) and drilldown views.
 */
import {
  GameState,
  Business,
} from './types';
import {
  calculateAnnualFcf,
  calculateExitValuation,
  calculatePortfolioTax,
  calculateSharedServicesBenefits,
  calculateComplexityCost,
  TAX_RATE,
  PortfolioTaxBreakdown,
} from './simulation';
import { calculateEnterpriseValue } from './scoring';
import { calculateDistressLevel, getDistressRestrictions } from './distress';
import { getMASourcingAnnualCost } from '../data/sharedServices';
import { getTurnaroundTierAnnualCost, getProgramById } from '../data/turnaroundPrograms';
import { EARNOUT_EXPIRATION_YEARS } from '../data/gameConfig';
import { SECTORS } from '../data/sectors';
import { getAnnualMgmtFee, getCarryRate, getCommittedCapital, getHurdleReturn } from '../data/fundStructure';

// ── Shared computation context ──

export interface DrilldownContext {
  activeBusinesses: Business[];
  allDebtBusinesses: Business[];
  ssBenefits: ReturnType<typeof calculateSharedServicesBenefits>;
  sharedServicesCost: number;
  maSourcingCost: number;
  managementFee: number;
  totalDeductibleCosts: number;
  totalEbitdaTop: number;
  totalDebtTop: number;
  distressInterestPenalty: number;
  taxBreakdown: PortfolioTaxBreakdown;
}

export function buildDrilldownContext(state: GameState): DrilldownContext {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const allDebtBusinesses = state.businesses.filter(b => b.status === 'active' || b.status === 'integrated');
  const ssBenefits = calculateSharedServicesBenefits(state);

  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const maSourcingCost = state.maSourcing?.active
    ? getMASourcingAnnualCost(state.maSourcing.tier)
    : 0;
  const managementFee = state.isFundManagerMode ? getAnnualMgmtFee(state) : 0;
  const totalDeductibleCosts = sharedServicesCost + maSourcingCost + managementFee;

  const totalEbitdaTop = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const totalDebtTop = state.holdcoLoanBalance
    + allDebtBusinesses.reduce((sum, b) => sum + b.bankDebtBalance, 0)
    + allDebtBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);

  // PE fund mode: 1-year covenant holiday on newly acquired debt
  let leverageTop: number;
  if (state.isFundManagerMode && state.round > 0) {
    const graceBusinesses = allDebtBusinesses.filter(b => b.acquisitionRound === state.round);
    const graceDebt = graceBusinesses.reduce((sum, b) => sum + b.bankDebtBalance + b.sellerNoteBalance, 0);
    const adjustedDebt = totalDebtTop - graceDebt;
    const adjustedEbitda = totalEbitdaTop - graceBusinesses.reduce((sum, b) => sum + Math.max(0, b.ebitda), 0);
    leverageTop = adjustedEbitda > 0 ? (adjustedDebt - state.cash) / adjustedEbitda : 0;
  } else {
    leverageTop = totalEbitdaTop > 0 ? Math.max(0, totalDebtTop - state.cash) / totalEbitdaTop : 0;
  }

  const distressLevelTop = calculateDistressLevel(leverageTop, totalDebtTop, totalEbitdaTop, state.cash);
  const distressRestrictionsTop = getDistressRestrictions(distressLevelTop);
  const distressInterestPenalty = distressRestrictionsTop.interestPenalty;

  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, state.holdcoLoanBalance, state.holdcoLoanRate + distressInterestPenalty, totalDeductibleCosts
  );

  return {
    activeBusinesses,
    allDebtBusinesses,
    ssBenefits,
    sharedServicesCost,
    maSourcingCost,
    managementFee,
    totalDeductibleCosts,
    totalEbitdaTop,
    totalDebtTop,
    distressInterestPenalty,
    taxBreakdown,
  };
}

// ── Cash drilldown ──

export interface CashBreakdown {
  cash: number;
  initialRaiseAmount: number;
  totalExitProceeds: number;
  totalInvestedCapital: number;
  totalDistributions: number;
  totalBuybacks: number;
}

export function computeCashBreakdown(state: GameState): CashBreakdown {
  return {
    cash: state.cash,
    initialRaiseAmount: state.initialRaiseAmount,
    totalExitProceeds: state.totalExitProceeds,
    totalInvestedCapital: state.totalInvestedCapital,
    totalDistributions: state.totalDistributions,
    totalBuybacks: state.totalBuybacks,
  };
}

// ── EBITDA drilldown ──

export interface EbitdaBreakdown {
  totalEbitda: number;
  totalRevenue: number;
  avgMargin: number;
  perBusiness: Array<{
    name: string;
    revenue: number;
    margin: number;
    ebitda: number;
    pctTotal: number;
  }>;
}

export function computeEbitdaBreakdown(_state: GameState, ctx: DrilldownContext): EbitdaBreakdown {
  const { activeBusinesses } = ctx;
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const totalRevenue = activeBusinesses.reduce((sum, b) => sum + b.revenue, 0);
  const avgMargin = totalRevenue > 0 ? totalEbitda / totalRevenue : 0;

  return {
    totalEbitda,
    totalRevenue,
    avgMargin,
    perBusiness: activeBusinesses.map(b => ({
      name: b.name,
      revenue: b.revenue,
      margin: b.ebitdaMargin,
      ebitda: b.ebitda,
      pctTotal: totalEbitda > 0 ? b.ebitda / totalEbitda : 0,
    })),
  };
}

// ── FCF Waterfall (shared by netfcf, fcfshare, leverage) ──

export interface WaterfallBreakdown {
  totalEbitda: number;
  totalCapex: number;
  holdcoLoanInterest: number;
  holdcoLoanPrincipal: number;
  holdcoPI: number;
  opcoSellerNoteService: number;
  opcoBankDebtService: number;
  opcoDebtService: number;
  earnoutPayments: number;
  turnaroundCost: number;
  preTaxFcf: number;
  netFcf: number;
  complexityCostNet: number;
  managementFee: number;
  taxAmount: number;
  sharedServicesCost: number;
  maSourcingCost: number;
}

export function computeWaterfall(state: GameState, ctx: DrilldownContext): WaterfallBreakdown {
  const { activeBusinesses, allDebtBusinesses, ssBenefits, sharedServicesCost, maSourcingCost, managementFee, distressInterestPenalty, taxBreakdown } = ctx;

  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const totalCapex = activeBusinesses.reduce((sum, b) => {
    const sector = SECTORS[b.sectorId];
    const effectiveCapexRate = sector.capexRate * (1 - ssBenefits.capexReduction);
    return sum + b.ebitda * effectiveCapexRate;
  }, 0);

  // Holdco loan P&I
  const holdcoLoanInterest = Math.round(state.holdcoLoanBalance * (state.holdcoLoanRate + distressInterestPenalty));
  const holdcoLoanPrincipal = (state.holdcoLoanRoundsRemaining ?? 0) > 0
    ? Math.round(state.holdcoLoanBalance / state.holdcoLoanRoundsRemaining)
    : 0;
  const holdcoPI = holdcoLoanInterest + holdcoLoanPrincipal;

  // OpCo debt service
  let opcoSellerNoteService = 0;
  let opcoBankDebtService = 0;
  for (const b of allDebtBusinesses) {
    if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
      opcoSellerNoteService += Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      opcoSellerNoteService += Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
    }
    if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
      opcoBankDebtService += Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      opcoBankDebtService += Math.round(b.bankDebtBalance / b.bankDebtRoundsRemaining);
    }
  }
  const opcoDebtService = opcoSellerNoteService + opcoBankDebtService;

  // Earn-out payments
  let earnoutPayments = 0;
  for (const b of allDebtBusinesses) {
    if (b.earnoutRemaining <= 0 || b.earnoutTarget <= 0) continue;
    if (state.round > 0 && state.round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS) continue;
    if (b.status === 'active' && b.acquisitionEbitda > 0) {
      const growth = (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda;
      if (growth >= b.earnoutTarget) earnoutPayments += b.earnoutRemaining;
    } else if (b.status === 'integrated' && b.parentPlatformId) {
      const platform = state.businesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
      if (platform && platform.acquisitionEbitda > 0) {
        const growth = (platform.ebitda - platform.acquisitionEbitda) / platform.acquisitionEbitda;
        if (growth >= b.earnoutTarget) earnoutPayments += b.earnoutRemaining;
      }
    }
  }

  // Turnaround costs
  const turnaroundTierCost = getTurnaroundTierAnnualCost(state.turnaroundTier ?? 0);
  const turnaroundProgramCosts = (state.activeTurnarounds ?? [])
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      const prog = getProgramById(t.programId);
      return sum + (prog ? prog.annualCost : 0);
    }, 0);
  const turnaroundCost = turnaroundTierCost + turnaroundProgramCosts;

  // Complexity cost
  const totalRevenue = activeBusinesses.reduce((sum, b) => sum + b.revenue, 0);
  const complexityCost = calculateComplexityCost(
    state.businesses, state.sharedServices, totalRevenue, state.duration, state.integratedPlatforms,
  );

  const preTaxFcf = activeBusinesses.reduce(
    (sum, b) => sum + calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus), 0
  );

  const netFcf = preTaxFcf - taxBreakdown.taxAmount - holdcoPI - opcoDebtService
    - earnoutPayments - sharedServicesCost - maSourcingCost - turnaroundCost
    - complexityCost.netCost - managementFee;

  return {
    totalEbitda,
    totalCapex,
    holdcoLoanInterest,
    holdcoLoanPrincipal,
    holdcoPI,
    opcoSellerNoteService,
    opcoBankDebtService,
    opcoDebtService,
    earnoutPayments,
    turnaroundCost,
    preTaxFcf,
    netFcf,
    complexityCostNet: complexityCost.netCost,
    managementFee,
    taxAmount: taxBreakdown.taxAmount,
    sharedServicesCost,
    maSourcingCost,
  };
}

// ── FCF/Share ──

export interface FcfShareBreakdown {
  netFcf: number;
  sharesOutstanding: number;
  fcfPerShare: number;
  founderShares: number;
  ownershipPct: number;
  equityRaisesUsed: number;
  totalBuybacks: number;
}

export function computeFcfShareBreakdown(state: GameState, ctx: DrilldownContext): FcfShareBreakdown {
  const waterfall = computeWaterfall(state, ctx);
  const fcfPerShare = state.sharesOutstanding > 0 ? waterfall.netFcf / state.sharesOutstanding : 0;

  return {
    netFcf: waterfall.netFcf,
    sharesOutstanding: state.sharesOutstanding,
    fcfPerShare,
    founderShares: state.founderShares,
    ownershipPct: state.sharesOutstanding > 0 ? state.founderShares / state.sharesOutstanding : 0,
    equityRaisesUsed: state.equityRaisesUsed,
    totalBuybacks: state.totalBuybacks,
  };
}

// ── ROIC ──

export interface RoicBreakdown {
  totalEbitda: number;
  taxAmount: number;
  nopat: number;
  totalInvestedCapital: number;
  roic: number;
  totalTaxSavings: number;
  naiveTax: number;
}

export function computeRoicBreakdown(state: GameState, ctx: DrilldownContext): RoicBreakdown {
  const { activeBusinesses, taxBreakdown } = ctx;
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const nopat = totalEbitda - taxBreakdown.taxAmount;
  const roic = state.totalInvestedCapital > 0 ? nopat / state.totalInvestedCapital : 0;

  return {
    totalEbitda,
    taxAmount: taxBreakdown.taxAmount,
    nopat,
    totalInvestedCapital: state.totalInvestedCapital,
    roic,
    totalTaxSavings: taxBreakdown.totalTaxSavings,
    naiveTax: Math.round(Math.max(0, totalEbitda) * TAX_RATE),
  };
}

// ── ROIIC ──

export interface RoiicBreakdown {
  roiic: number;
  deltaNopat: number;
  deltaInvested: number;
  currentNopat: number;
  prevNopat: number;
  currentInvested: number;
  prevInvested: number;
  hasHistory: boolean;
}

export function computeRoiicBreakdown(state: GameState, ctx: DrilldownContext): RoiicBreakdown {
  const { activeBusinesses, taxBreakdown } = ctx;
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const nopat = totalEbitda - taxBreakdown.taxAmount;

  if (state.metricsHistory.length === 0) {
    return {
      roiic: 0,
      deltaNopat: 0,
      deltaInvested: 0,
      currentNopat: nopat,
      prevNopat: 0,
      currentInvested: state.totalInvestedCapital,
      prevInvested: 0,
      hasHistory: false,
    };
  }

  const prevMetrics = state.metricsHistory[state.metricsHistory.length - 1];
  const deltaNopat = nopat - prevMetrics.nopat;
  const deltaInvested = state.totalInvestedCapital - prevMetrics.investedCapital;
  const roiic = deltaInvested > 0 ? deltaNopat / deltaInvested : 0;

  return {
    roiic,
    deltaNopat,
    deltaInvested,
    currentNopat: nopat,
    prevNopat: prevMetrics.nopat,
    currentInvested: state.totalInvestedCapital,
    prevInvested: prevMetrics.investedCapital,
    hasHistory: true,
  };
}

// ── MOIC (holdco mode) ──

export interface MoicBreakdown {
  portfolioValue: number;
  totalDebt: number;
  nav: number;
  moic: number;
  cash: number;
  totalDistributions: number;
  initialRaiseAmount: number;
}

export function computeMoicBreakdown(state: GameState, ctx: DrilldownContext): MoicBreakdown {
  const { activeBusinesses } = ctx;
  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const valuation = calculateExitValuation(b, state.round, undefined, undefined, state.integratedPlatforms);
    return sum + b.ebitda * valuation.totalMultiple;
  }, 0);

  const allDebtBusinessesMoic = state.businesses.filter(b => b.status === 'active' || b.status === 'integrated');
  const opcoSellerNotes = allDebtBusinessesMoic.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
  const totalDebt = state.totalDebt + opcoSellerNotes;
  const nav = portfolioValue + state.cash - totalDebt + state.totalDistributions;
  const moic = state.initialRaiseAmount > 0 ? nav / state.initialRaiseAmount : 1;

  return {
    portfolioValue,
    totalDebt,
    nav,
    moic,
    cash: state.cash,
    totalDistributions: state.totalDistributions,
    initialRaiseAmount: state.initialRaiseAmount,
  };
}

// ── MOIC (PE fund mode) ──

export interface PEMoicBreakdown {
  nav: number;
  lpDist: number;
  fundSize: number;
  totalValue: number;
  grossMoic: number;
  portfolioValue: number;
  totalDebt: number;
  cash: number;
}

export function computePEMoicBreakdown(state: GameState, ctx: DrilldownContext): PEMoicBreakdown {
  const { activeBusinesses } = ctx;
  const nav = calculateEnterpriseValue(state);
  const lpDist = state.lpDistributions ?? 0;
  const fs = getCommittedCapital(state);
  const totalValue = nav + lpDist;
  const grossMoic = fs > 0 ? totalValue / fs : 0;

  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const valuation = calculateExitValuation(b, state.round, undefined, undefined, state.integratedPlatforms);
    return sum + b.ebitda * valuation.totalMultiple;
  }, 0);

  const opcoSellerNotesPE = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
  const totalDebtPE = state.totalDebt + opcoSellerNotesPE;

  return {
    nav,
    lpDist,
    fundSize: fs,
    totalValue,
    grossMoic,
    portfolioValue,
    totalDebt: totalDebtPE,
    cash: state.cash,
  };
}

// ── Leverage ──

export interface LeverageBreakdown {
  holdcoLoanBalance: number;
  opcoBankDebt: number;
  opcoSellerNotes: number;
  totalDebt: number;
  totalEbitda: number;
  netDebt: number;
  leverage: number;
  cash: number;
}

export function computeLeverageBreakdown(state: GameState, ctx: DrilldownContext): LeverageBreakdown {
  const { activeBusinesses, allDebtBusinesses } = ctx;
  const opcoSellerNotes = allDebtBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
  const opcoBankDebt = allDebtBusinesses.reduce((sum, b) => sum + b.bankDebtBalance, 0);
  const totalDebt = state.holdcoLoanBalance + opcoBankDebt + opcoSellerNotes;
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const netDebt = totalDebt - state.cash;
  const leverage = totalEbitda > 0 ? netDebt / totalEbitda : 0;

  return {
    holdcoLoanBalance: state.holdcoLoanBalance,
    opcoBankDebt,
    opcoSellerNotes,
    totalDebt,
    totalEbitda,
    netDebt,
    leverage,
    cash: state.cash,
  };
}

// ── Cash Conversion ──

export interface CashConvBreakdown {
  totalEbitda: number;
  preTaxFcf: number;
  postTaxFcf: number;
  cashConversion: number;
  preTaxConversion: number;
}

export function computeCashConvBreakdown(_state: GameState, ctx: DrilldownContext): CashConvBreakdown {
  const { activeBusinesses, ssBenefits, taxBreakdown } = ctx;
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  const preTaxFcf = activeBusinesses.reduce(
    (sum, b) => sum + calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus), 0
  );
  const postTaxFcf = preTaxFcf - taxBreakdown.taxAmount;
  const cashConversion = totalEbitda > 0 ? postTaxFcf / totalEbitda : 0;
  const preTaxConversion = totalEbitda > 0 ? preTaxFcf / totalEbitda : 0;

  return {
    totalEbitda,
    preTaxFcf,
    postTaxFcf,
    cashConversion,
    preTaxConversion,
  };
}

// ── NAV (PE fund) ──

export interface NavBreakdown {
  nav: number;
  portfolioValue: number;
  totalDebt: number;
  cash: number;
}

export function computeNavBreakdown(state: GameState, ctx: DrilldownContext): NavBreakdown {
  const { activeBusinesses } = ctx;
  const nav = calculateEnterpriseValue(state);
  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const valuation = calculateExitValuation(b, state.round, undefined, undefined, state.integratedPlatforms);
    return sum + b.ebitda * valuation.totalMultiple;
  }, 0);

  const opcoSellerNotesNav = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
  const totalDebtNav = state.totalDebt + opcoSellerNotesNav;

  return {
    nav,
    portfolioValue,
    totalDebt: totalDebtNav,
    cash: state.cash,
  };
}

// ── DPI (PE fund) ──

export interface DpiBreakdown {
  lpDistributions: number;
  fundSize: number;
  dpi: number;
  capitalDeployed: number;
  managementFeesCollected: number;
}

export function computeDpiBreakdown(state: GameState): DpiBreakdown {
  const lpDist = state.lpDistributions ?? 0;
  const fs = getCommittedCapital(state);
  const dpi = fs > 0 ? lpDist / fs : 0;

  return {
    lpDistributions: lpDist,
    fundSize: fs,
    dpi,
    capitalDeployed: state.totalCapitalDeployed ?? 0,
    managementFeesCollected: state.managementFeesCollected ?? 0,
  };
}

// ── Carry (PE fund) ──

export interface CarryBreakdown {
  nav: number;
  lpDistributions: number;
  fundSize: number;
  totalValue: number;
  hurdleTarget: number;
  aboveHurdle: number;
  estCarry: number;
  carryRate: number;
  managementFeesCollected: number;
}

export function computeCarryBreakdown(state: GameState): CarryBreakdown {
  const nav = calculateEnterpriseValue(state);
  const lpDist = state.lpDistributions ?? 0;
  const fs = getCommittedCapital(state);
  const totalValue = nav + lpDist;
  const hurdleTarget = getHurdleReturn(state);
  const aboveHurdle = totalValue - hurdleTarget;
  const carryRate = getCarryRate(state);
  const estCarry = aboveHurdle > 0 ? aboveHurdle * carryRate : 0;

  return {
    nav,
    lpDistributions: lpDist,
    fundSize: fs,
    totalValue,
    hurdleTarget,
    aboveHurdle,
    estCarry,
    carryRate,
    managementFeesCollected: state.managementFeesCollected ?? 0,
  };
}

// ── Deployed (PE fund) ──

export interface DeployedBreakdown {
  fundSize: number;
  capitalDeployed: number;
  deployPct: number;
  cash: number;
  activeCount: number;
  investmentPeriodActive: boolean;
}

export function computeDeployedBreakdown(state: GameState, ctx: DrilldownContext): DeployedBreakdown {
  const fs = getCommittedCapital(state);
  const deployed = state.totalCapitalDeployed ?? 0;
  const deployPct = fs > 0 ? (deployed / fs) * 100 : 0;

  return {
    fundSize: fs,
    capitalDeployed: deployed,
    deployPct,
    cash: state.cash,
    activeCount: ctx.activeBusinesses.length,
    investmentPeriodActive: state.round <= 5,
  };
}
