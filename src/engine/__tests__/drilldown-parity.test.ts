/**
 * Drilldown Parity Tests
 *
 * Ensures the metric drilldown computations (shown in MetricDrilldownModal)
 * produce values consistent with calculateMetrics() in simulation.ts.
 *
 * For each of the 13 metric keys, we run both the dashboard calculation
 * and the drilldown extraction, asserting key values match.
 */
import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../simulation';
import { calculateEnterpriseValue } from '../scoring';
import {
  buildDrilldownContext,
  computeCashBreakdown,
  computeEbitdaBreakdown,
  computeWaterfall,
  computeFcfShareBreakdown,
  computeRoicBreakdown,
  computeRoiicBreakdown,
  computeMoicBreakdown,
  computePEMoicBreakdown,
  computeLeverageBreakdown,
  computeCashConvBreakdown,
  computeNavBreakdown,
  computeDpiBreakdown,
  computeCarryBreakdown,
  computeDeployedBreakdown,
} from '../drilldownComputations';
import {
  createMockGameState,
  createMockBusiness,
  createMultiBusinessState,
  createPEFundState,
  createDebtHeavyState,
  createComplexPortfolioState,
} from './helpers';
import { PE_FUND_CONFIG } from '../../data/gameConfig';

// ── Helpers ──

function metricsAndCtx(state: ReturnType<typeof createMockGameState>) {
  const metrics = calculateMetrics(state);
  const ctx = buildDrilldownContext(state);
  return { metrics, ctx };
}

// ── Cash ──

describe('cash drilldown parity', () => {
  it('matches dashboard cash for basic state', () => {
    const state = createMockGameState();
    const { metrics } = metricsAndCtx(state);
    const breakdown = computeCashBreakdown(state);
    expect(breakdown.cash).toBe(metrics.cash);
    expect(breakdown.cash).toBe(state.cash);
  });

  it('tracks cumulative sources correctly', () => {
    const state = createMockGameState({
      cash: 25000,
      totalExitProceeds: 10000,
      totalInvestedCapital: 8000,
      totalDistributions: 2000,
      totalBuybacks: 500,
    });
    const breakdown = computeCashBreakdown(state);
    expect(breakdown.totalExitProceeds).toBe(10000);
    expect(breakdown.totalInvestedCapital).toBe(8000);
    expect(breakdown.totalDistributions).toBe(2000);
    expect(breakdown.totalBuybacks).toBe(500);
  });

  it('matches with debt-heavy state', () => {
    const state = createDebtHeavyState();
    const { metrics } = metricsAndCtx(state);
    const breakdown = computeCashBreakdown(state);
    expect(breakdown.cash).toBe(metrics.cash);
  });
});

// ── EBITDA ──

describe('ebitda drilldown parity', () => {
  it('matches dashboard totalEbitda', () => {
    const state = createMultiBusinessState(4);
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeEbitdaBreakdown(state, ctx);
    expect(breakdown.totalEbitda).toBe(metrics.totalEbitda);
  });

  it('matches totalRevenue and avgMargin', () => {
    const state = createMultiBusinessState(3);
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeEbitdaBreakdown(state, ctx);
    expect(breakdown.totalRevenue).toBe(metrics.totalRevenue);
    expect(breakdown.avgMargin).toBeCloseTo(metrics.avgEbitdaMargin, 6);
  });

  it('per-business pctTotal sums to ~1.0', () => {
    const state = createMultiBusinessState(5);
    const ctx = buildDrilldownContext(state);
    const breakdown = computeEbitdaBreakdown(state, ctx);
    const sumPct = breakdown.perBusiness.reduce((s, b) => s + b.pctTotal, 0);
    expect(sumPct).toBeCloseTo(1.0, 4);
  });

  it('handles zero businesses', () => {
    const state = createMockGameState({ businesses: [], cash: 20000 });
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeEbitdaBreakdown(state, ctx);
    expect(breakdown.totalEbitda).toBe(0);
    expect(breakdown.totalEbitda).toBe(metrics.totalEbitda);
  });

  it('handles PE fund state', () => {
    const state = createPEFundState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeEbitdaBreakdown(state, ctx);
    expect(breakdown.totalEbitda).toBe(metrics.totalEbitda);
  });
});

// ── Net FCF ──

describe('netfcf drilldown parity', () => {
  it('matches dashboard totalFcf for basic state', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const waterfall = computeWaterfall(state, ctx);
    expect(waterfall.netFcf).toBe(metrics.totalFcf);
  });

  it('matches with multi-business state', () => {
    const state = createMultiBusinessState(4);
    const { metrics, ctx } = metricsAndCtx(state);
    const waterfall = computeWaterfall(state, ctx);
    expect(waterfall.netFcf).toBe(metrics.totalFcf);
  });

  it('matches with debt-heavy state', () => {
    const state = createDebtHeavyState();
    const { metrics, ctx } = metricsAndCtx(state);
    const waterfall = computeWaterfall(state, ctx);
    expect(waterfall.netFcf).toBe(metrics.totalFcf);
  });

  it('matches with complex portfolio (complexity cost)', () => {
    const state = createComplexPortfolioState();
    const { metrics, ctx } = metricsAndCtx(state);
    const waterfall = computeWaterfall(state, ctx);
    expect(waterfall.netFcf).toBe(metrics.totalFcf);
  });

  it('matches PE fund mode with management fee', () => {
    const state = createPEFundState();
    const { metrics, ctx } = metricsAndCtx(state);
    const waterfall = computeWaterfall(state, ctx);
    expect(waterfall.netFcf).toBe(metrics.totalFcf);
    expect(waterfall.managementFee).toBe(PE_FUND_CONFIG.annualManagementFee);
  });

  it('waterfall components are consistent: netFcf = preTaxFcf - tax - all deductions', () => {
    const state = createDebtHeavyState();
    const ctx = buildDrilldownContext(state);
    const w = computeWaterfall(state, ctx);
    const expected = w.preTaxFcf - w.taxAmount - w.holdcoPI - w.opcoDebtService
      - w.earnoutPayments - w.sharedServicesCost - w.maSourcingCost - w.turnaroundCost
      - w.complexityCostNet - w.managementFee;
    expect(w.netFcf).toBe(expected);
  });
});

// ── FCF/Share ──

describe('fcfshare drilldown parity', () => {
  it('matches dashboard fcfPerShare', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeFcfShareBreakdown(state, ctx);
    expect(breakdown.fcfPerShare).toBeCloseTo(metrics.fcfPerShare, 2);
  });

  it('matches with multi-business state', () => {
    const state = createMultiBusinessState(3);
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeFcfShareBreakdown(state, ctx);
    expect(breakdown.fcfPerShare).toBeCloseTo(metrics.fcfPerShare, 2);
  });

  it('handles zero shares gracefully', () => {
    const state = createMockGameState({ sharesOutstanding: 0 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeFcfShareBreakdown(state, ctx);
    expect(breakdown.fcfPerShare).toBe(0);
  });

  it('ownership pct is correct', () => {
    const state = createMockGameState({ founderShares: 800, sharesOutstanding: 1000 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeFcfShareBreakdown(state, ctx);
    expect(breakdown.ownershipPct).toBeCloseTo(0.8, 6);
  });

  it('matches PE fund mode', () => {
    const state = createPEFundState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeFcfShareBreakdown(state, ctx);
    expect(breakdown.fcfPerShare).toBeCloseTo(metrics.fcfPerShare, 2);
  });
});

// ── ROIC ──

describe('roic drilldown parity', () => {
  it('matches dashboard portfolioRoic', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeRoicBreakdown(state, ctx);
    expect(breakdown.roic).toBeCloseTo(metrics.portfolioRoic, 4);
  });

  it('nopat = totalEbitda - taxAmount', () => {
    const state = createMultiBusinessState(3);
    const ctx = buildDrilldownContext(state);
    const breakdown = computeRoicBreakdown(state, ctx);
    expect(breakdown.nopat).toBe(breakdown.totalEbitda - breakdown.taxAmount);
  });

  it('matches with debt-heavy state (tax shields)', () => {
    const state = createDebtHeavyState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeRoicBreakdown(state, ctx);
    expect(breakdown.roic).toBeCloseTo(metrics.portfolioRoic, 4);
  });

  it('handles zero invested capital', () => {
    const state = createMockGameState({ totalInvestedCapital: 0 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeRoicBreakdown(state, ctx);
    expect(breakdown.roic).toBe(0);
  });

  it('matches complex portfolio', () => {
    const state = createComplexPortfolioState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeRoicBreakdown(state, ctx);
    expect(breakdown.roic).toBeCloseTo(metrics.portfolioRoic, 4);
  });
});

// ── ROIIC ──

describe('roiic drilldown parity', () => {
  it('matches dashboard roiic with history', () => {
    const state = createMockGameState({
      metricsHistory: [{
        round: 1,
        metrics: calculateMetrics(createMockGameState({ totalInvestedCapital: 2000 })),
        fcf: 500,
        nopat: 600,
        investedCapital: 2000,
      }],
      totalInvestedCapital: 6000,
      round: 2,
    });
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeRoiicBreakdown(state, ctx);
    expect(breakdown.roiic).toBeCloseTo(metrics.roiic, 4);
    expect(breakdown.hasHistory).toBe(true);
  });

  it('returns 0 with no history', () => {
    const state = createMockGameState({ metricsHistory: [] });
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeRoiicBreakdown(state, ctx);
    expect(breakdown.roiic).toBe(0);
    expect(breakdown.hasHistory).toBe(false);
    expect(metrics.roiic).toBe(0);
  });

  it('handles zero delta invested', () => {
    const state = createMockGameState({
      metricsHistory: [{
        round: 1,
        metrics: calculateMetrics(createMockGameState()),
        fcf: 500,
        nopat: 600,
        investedCapital: 4000, // same as default
      }],
      round: 2,
    });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeRoiicBreakdown(state, ctx);
    expect(breakdown.roiic).toBe(0); // no new capital invested
  });
});

// ── MOIC (holdco mode) ──

describe('moic drilldown parity', () => {
  it('matches dashboard portfolioMoic', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeMoicBreakdown(state, ctx);
    expect(breakdown.moic).toBeCloseTo(metrics.portfolioMoic, 4);
  });

  it('nav includes distributions', () => {
    const state = createMockGameState({ totalDistributions: 5000 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeMoicBreakdown(state, ctx);
    // NAV = portfolioValue + cash - debt + distributions
    expect(breakdown.nav).toBeGreaterThan(breakdown.portfolioValue + state.cash - breakdown.totalDebt);
  });

  it('matches multi-business state', () => {
    const state = createMultiBusinessState(5);
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeMoicBreakdown(state, ctx);
    expect(breakdown.moic).toBeCloseTo(metrics.portfolioMoic, 4);
  });

  it('handles zero initial raise', () => {
    const state = createMockGameState({ initialRaiseAmount: 0 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeMoicBreakdown(state, ctx);
    expect(breakdown.moic).toBe(1); // fallback
  });

  it('matches debt-heavy state', () => {
    const state = createDebtHeavyState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeMoicBreakdown(state, ctx);
    expect(breakdown.moic).toBeCloseTo(metrics.portfolioMoic, 4);
  });
});

// ── MOIC (PE fund mode) ──

describe('pe moic drilldown parity', () => {
  it('grossMoic = (nav + lpDist) / fundSize', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computePEMoicBreakdown(state, ctx);
    const expectedNav = calculateEnterpriseValue(state);
    expect(breakdown.nav).toBeCloseTo(expectedNav, 0);
    expect(breakdown.grossMoic).toBeCloseTo(breakdown.totalValue / breakdown.fundSize, 6);
  });

  it('totalValue = nav + lpDist', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computePEMoicBreakdown(state, ctx);
    expect(breakdown.totalValue).toBeCloseTo(breakdown.nav + breakdown.lpDist, 0);
  });

  it('matches calculateEnterpriseValue for NAV', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computePEMoicBreakdown(state, ctx);
    const ev = calculateEnterpriseValue(state);
    expect(breakdown.nav).toBeCloseTo(ev, 0);
  });
});

// ── Leverage ──

describe('leverage drilldown parity', () => {
  it('matches dashboard netDebtToEbitda', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeLeverageBreakdown(state, ctx);
    expect(breakdown.leverage).toBeCloseTo(metrics.netDebtToEbitda, 4);
  });

  it('debt components add up to total', () => {
    const state = createDebtHeavyState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeLeverageBreakdown(state, ctx);
    expect(breakdown.totalDebt).toBe(
      breakdown.holdcoLoanBalance + breakdown.opcoBankDebt + breakdown.opcoSellerNotes
    );
  });

  it('netDebt = totalDebt - cash', () => {
    const state = createDebtHeavyState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeLeverageBreakdown(state, ctx);
    expect(breakdown.netDebt).toBe(breakdown.totalDebt - breakdown.cash);
  });

  it('matches multi-business state', () => {
    const state = createMultiBusinessState(4);
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeLeverageBreakdown(state, ctx);
    expect(breakdown.leverage).toBeCloseTo(metrics.netDebtToEbitda, 4);
  });

  it('handles zero ebitda', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 0, revenue: 0 })],
    });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeLeverageBreakdown(state, ctx);
    expect(breakdown.leverage).toBe(0);
  });
});

// ── Cash Conversion ──

describe('cashconv drilldown parity', () => {
  it('matches dashboard cashConversion', () => {
    const state = createMockGameState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeCashConvBreakdown(state, ctx);
    expect(breakdown.cashConversion).toBeCloseTo(metrics.cashConversion, 4);
  });

  it('preTaxConversion >= cashConversion (tax reduces conversion)', () => {
    const state = createMultiBusinessState(3);
    const ctx = buildDrilldownContext(state);
    const breakdown = computeCashConvBreakdown(state, ctx);
    expect(breakdown.preTaxConversion).toBeGreaterThanOrEqual(breakdown.cashConversion);
  });

  it('postTaxFcf = preTaxFcf - taxAmount', () => {
    const state = createMockGameState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeCashConvBreakdown(state, ctx);
    expect(breakdown.postTaxFcf).toBe(breakdown.preTaxFcf - ctx.taxBreakdown.taxAmount);
  });

  it('matches complex portfolio', () => {
    const state = createComplexPortfolioState();
    const { metrics, ctx } = metricsAndCtx(state);
    const breakdown = computeCashConvBreakdown(state, ctx);
    expect(breakdown.cashConversion).toBeCloseTo(metrics.cashConversion, 4);
  });

  it('handles zero ebitda', () => {
    const state = createMockGameState({
      businesses: [createMockBusiness({ ebitda: 0, revenue: 0 })],
    });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeCashConvBreakdown(state, ctx);
    expect(breakdown.cashConversion).toBe(0);
  });
});

// ── NAV (PE fund) ──

describe('nav drilldown parity', () => {
  it('matches calculateEnterpriseValue', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeNavBreakdown(state, ctx);
    const ev = calculateEnterpriseValue(state);
    expect(breakdown.nav).toBeCloseTo(ev, 0);
  });

  it('nav = portfolioValue + cash - totalDebt (approximately, minus rollover claims)', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeNavBreakdown(state, ctx);
    // NAV from calculateEnterpriseValue may differ due to rollover equity claims,
    // stay-private bonus, IPO adjustments. Use wide tolerance.
    const roughNav = breakdown.portfolioValue + breakdown.cash - breakdown.totalDebt;
    // Difference should be explainable by rollover claims and rounding
    expect(Math.abs(breakdown.nav - roughNav)).toBeLessThan(5000);
  });

  it('portfolioValue is non-negative', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeNavBreakdown(state, ctx);
    expect(breakdown.portfolioValue).toBeGreaterThanOrEqual(0);
  });
});

// ── DPI ──

describe('dpi drilldown parity', () => {
  it('dpi = lpDistributions / fundSize', () => {
    const state = createPEFundState();
    const breakdown = computeDpiBreakdown(state);
    expect(breakdown.dpi).toBeCloseTo(breakdown.lpDistributions / breakdown.fundSize, 6);
  });

  it('uses PE_FUND_CONFIG.fundSize as default', () => {
    const state = createPEFundState({ fundSize: undefined });
    const breakdown = computeDpiBreakdown(state);
    expect(breakdown.fundSize).toBe(PE_FUND_CONFIG.fundSize);
  });

  it('handles zero fund size', () => {
    const state = createPEFundState({ fundSize: 0 });
    const breakdown = computeDpiBreakdown(state);
    expect(breakdown.dpi).toBe(0);
  });

  it('tracks capital deployed and management fees', () => {
    const state = createPEFundState();
    const breakdown = computeDpiBreakdown(state);
    expect(breakdown.capitalDeployed).toBe(state.totalCapitalDeployed ?? 0);
    expect(breakdown.managementFeesCollected).toBe(state.managementFeesCollected ?? 0);
  });
});

// ── Carry ──

describe('carry drilldown parity', () => {
  it('estCarry = (totalValue - hurdleTarget) * carryRate when above hurdle', () => {
    const state = createPEFundState();
    const breakdown = computeCarryBreakdown(state);
    if (breakdown.aboveHurdle > 0) {
      expect(breakdown.estCarry).toBeCloseTo(
        breakdown.aboveHurdle * PE_FUND_CONFIG.carryRate, 0
      );
    }
  });

  it('estCarry = 0 when below hurdle', () => {
    // Fund with very little value
    const state = createPEFundState({
      businesses: [],
      cash: 1000,
      totalDebt: 0,
      lpDistributions: 0,
    });
    const breakdown = computeCarryBreakdown(state);
    expect(breakdown.estCarry).toBe(0);
  });

  it('totalValue = nav + lpDistributions', () => {
    const state = createPEFundState();
    const breakdown = computeCarryBreakdown(state);
    expect(breakdown.totalValue).toBeCloseTo(breakdown.nav + breakdown.lpDistributions, 0);
  });

  it('hurdleTarget matches PE_FUND_CONFIG', () => {
    const state = createPEFundState();
    const breakdown = computeCarryBreakdown(state);
    expect(breakdown.hurdleTarget).toBe(PE_FUND_CONFIG.hurdleReturn);
    expect(breakdown.carryRate).toBe(PE_FUND_CONFIG.carryRate);
  });
});

// ── Deployed ──

describe('deployed drilldown parity', () => {
  it('deployPct = (capitalDeployed / fundSize) * 100', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeDeployedBreakdown(state, ctx);
    expect(breakdown.deployPct).toBeCloseTo(
      (breakdown.capitalDeployed / breakdown.fundSize) * 100, 4
    );
  });

  it('investmentPeriodActive for round <= 5', () => {
    const state = createPEFundState({ round: 3 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeDeployedBreakdown(state, ctx);
    expect(breakdown.investmentPeriodActive).toBe(true);
  });

  it('investmentPeriodActive false for round > 5', () => {
    const state = createPEFundState({ round: 7 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeDeployedBreakdown(state, ctx);
    expect(breakdown.investmentPeriodActive).toBe(false);
  });

  it('activeCount matches active businesses', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    const breakdown = computeDeployedBreakdown(state, ctx);
    const activeCount = state.businesses.filter(b => b.status === 'active').length;
    expect(breakdown.activeCount).toBe(activeCount);
  });

  it('handles zero fund size', () => {
    const state = createPEFundState({ fundSize: 0 });
    const ctx = buildDrilldownContext(state);
    const breakdown = computeDeployedBreakdown(state, ctx);
    expect(breakdown.deployPct).toBe(0);
  });
});

// ── Cross-cutting: context consistency ──

describe('drilldown context consistency', () => {
  it('context activeBusinesses matches state filtering', () => {
    const state = createMockGameState({
      businesses: [
        createMockBusiness({ id: 'a', status: 'active' }),
        createMockBusiness({ id: 'b', status: 'sold' }),
        createMockBusiness({ id: 'c', status: 'integrated' }),
      ],
    });
    const ctx = buildDrilldownContext(state);
    expect(ctx.activeBusinesses.length).toBe(1);
    expect(ctx.allDebtBusinesses.length).toBe(2); // active + integrated
  });

  it('totalDeductibleCosts = sharedServices + maSourcing + managementFee', () => {
    const state = createPEFundState();
    const ctx = buildDrilldownContext(state);
    expect(ctx.totalDeductibleCosts).toBe(
      ctx.sharedServicesCost + ctx.maSourcingCost + ctx.managementFee
    );
  });

  it('PE fund management fee is non-zero only in fund mode', () => {
    const holdcoState = createMockGameState();
    const peState = createPEFundState();

    const holdcoCtx = buildDrilldownContext(holdcoState);
    const peCtx = buildDrilldownContext(peState);

    expect(holdcoCtx.managementFee).toBe(0);
    expect(peCtx.managementFee).toBe(PE_FUND_CONFIG.annualManagementFee);
  });
});
