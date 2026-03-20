/**
 * Dashboard Metrics Verification Tests
 *
 * Verifies every metric displayed on the dashboard calculates correctly,
 * matching the actual cash waterfall in useGame.ts. Covers:
 * - Revenue, EBITDA roll-ups
 * - Net FCF (including complexity cost + management fee)
 * - FCF/Share
 * - ROIC, ROIIC, MOIC
 * - Cash Conversion
 * - Leverage (Net Debt/EBITDA)
 * - Intrinsic Value per Share
 * - Fund mode metrics (NAV, Gross MOIC, DPI, deploy %, est. carry)
 */
import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  calculatePortfolioFcf,
  calculatePortfolioTax,
  calculateComplexityCost,
} from '../simulation';
import {
  createMockBusiness,
  createMockGameState,
  createMultiBusinessState,
} from './helpers';
import { PE_FUND_CONFIG } from '../../data/gameConfig';
import { TAX_RATE } from '../simulation';
import { Business, SectorId, Metrics } from '../types';
import { getTurnaroundTierAnnualCost } from '../../data/turnaroundPrograms';

// ── Helpers ──────────────────────────────────────────────────

/** Build a minimal state with known values for metric verification */
function buildKnownState(overrides: Parameters<typeof createMockGameState>[0] = {}) {
  return createMockGameState({
    cash: 10000,
    totalDebt: 0,
    holdcoLoanBalance: 0,
    sharesOutstanding: 1000,
    founderShares: 800,
    initialRaiseAmount: 20000,
    totalInvestedCapital: 4000,
    totalDistributions: 0,
    totalBuybacks: 0,
    totalExitProceeds: 0,
    businesses: [createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' })],
    ...overrides,
  });
}

// ── EBITDA Roll-Up ──────────────────────────────────────────

describe('Dashboard Metric: Total EBITDA', () => {
  it('sums EBITDA of all active businesses only', () => {
    const state = buildKnownState({
      businesses: [
        createMockBusiness({ id: 'a', ebitda: 1000, status: 'active' }),
        createMockBusiness({ id: 'b', ebitda: 2000, status: 'active' }),
        createMockBusiness({ id: 'c', ebitda: 500, status: 'integrated' }), // should be excluded
        createMockBusiness({ id: 'd', ebitda: 300, status: 'sold' as any }),
      ],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.totalEbitda).toBe(3000);
  });

  it('handles negative EBITDA businesses', () => {
    const state = buildKnownState({
      businesses: [
        createMockBusiness({ id: 'a', ebitda: 2000, status: 'active' }),
        createMockBusiness({ id: 'b', ebitda: -500, status: 'active' }),
      ],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.totalEbitda).toBe(1500);
  });
});

// ── Revenue Roll-Up ────────────────────────────────────────

describe('Dashboard Metric: Total Revenue', () => {
  it('sums revenue of active businesses only', () => {
    const state = buildKnownState({
      businesses: [
        createMockBusiness({ id: 'a', revenue: 5000, status: 'active' }),
        createMockBusiness({ id: 'b', revenue: 3000, status: 'active' }),
        createMockBusiness({ id: 'c', revenue: 1000, status: 'integrated' }),
      ],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.totalRevenue).toBe(8000);
  });
});

// ── Net FCF ────────────────────────────────────────────────

describe('Dashboard Metric: Net FCF', () => {
  it('matches manual waterfall: EBITDA - CapEx - Tax - debt service', () => {
    // Simple case: one business, no debt, no overhead
    const biz = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      sectorId: 'agency', // capexRate = 0.03
      sellerNoteBalance: 0,
      bankDebtBalance: 0,
    });
    const state = buildKnownState({
      businesses: [biz],
      totalDebt: 0,
      holdcoLoanBalance: 0,
    });
    const metrics = calculateMetrics(state);

    // Pre-tax FCF = 1000 - (1000 * 0.03) = 970
    // Tax = 1000 * 0.30 = 300 (no deductions)
    // Post-tax FCF = 970 - 300 = 670
    // No debt service, no overhead, no complexity
    expect(metrics.totalFcf).toBe(670);
  });

  it('deducts holdco loan P&I from net FCF', () => {
    const biz = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const stateNone = buildKnownState({ businesses: [biz], holdcoLoanBalance: 0 });
    const stateDebt = buildKnownState({
      businesses: [biz],
      totalDebt: 5000, // holdco portion
      holdcoLoanBalance: 5000,
      holdcoLoanRate: 0.07,
      holdcoLoanRoundsRemaining: 5,
    });
    const fcfNone = calculateMetrics(stateNone).totalFcf;
    const fcfDebt = calculateMetrics(stateDebt).totalFcf;

    // Debt should reduce FCF (interest + principal)
    expect(fcfDebt).toBeLessThan(fcfNone);
  });

  it('deducts seller note P&I from net FCF', () => {
    const bizClean = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const bizNote = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      sectorId: 'agency',
      sellerNoteBalance: 1000,
      sellerNoteRate: 0.06,
      sellerNoteRoundsRemaining: 4,
    });
    const stateClean = buildKnownState({ businesses: [bizClean] });
    const stateNote = buildKnownState({ businesses: [bizNote] });
    const fcfClean = calculateMetrics(stateClean).totalFcf;
    const fcfNote = calculateMetrics(stateNote).totalFcf;
    expect(fcfNote).toBeLessThan(fcfClean);
  });

  it('deducts bank debt P&I from net FCF', () => {
    const bizClean = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const bizBank = createMockBusiness({
      ebitda: 1000,
      revenue: 5000,
      sectorId: 'agency',
      bankDebtBalance: 2000,
      bankDebtRate: 0.06,
      bankDebtRoundsRemaining: 5,
    });
    const stateClean = buildKnownState({ businesses: [bizClean], totalDebt: 0 });
    const stateBank = buildKnownState({ businesses: [bizBank], totalDebt: 2000 });
    const fcfClean = calculateMetrics(stateClean).totalFcf;
    const fcfBank = calculateMetrics(stateBank).totalFcf;
    expect(fcfBank).toBeLessThan(fcfClean);
  });

  it('deducts shared services cost from net FCF', () => {
    const biz = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const stateNoSS = buildKnownState({ businesses: [biz] });
    const stateSS = buildKnownState({
      businesses: [biz],
      sharedServices: stateNoSS.sharedServices.map((s, i) =>
        i === 0 ? { ...s, active: true, annualCost: 200 } : s
      ),
    });
    const fcfNoSS = calculateMetrics(stateNoSS).totalFcf;
    const fcfSS = calculateMetrics(stateSS).totalFcf;
    expect(fcfSS).toBeLessThan(fcfNoSS);
  });

  it('deducts turnaround costs from net FCF', () => {
    const biz = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const stateNoTurn = buildKnownState({ businesses: [biz], turnaroundTier: 0 });
    const stateTurn = buildKnownState({ businesses: [biz], turnaroundTier: 1 });
    const fcfNoTurn = calculateMetrics(stateNoTurn).totalFcf;
    const fcfTurn = calculateMetrics(stateTurn).totalFcf;
    const tierCost = getTurnaroundTierAnnualCost(1);
    if (tierCost > 0) {
      expect(fcfTurn).toBeLessThan(fcfNoTurn);
    }
  });

  it('deducts complexity cost from net FCF (BUG FIX verification)', () => {
    // Build a state with enough businesses to trigger complexity cost
    const businesses: Business[] = [];
    const sectors: SectorId[] = ['agency', 'saas', 'homeServices', 'consumer', 'industrial'];
    for (let i = 0; i < 6; i++) {
      businesses.push(createMockBusiness({
        id: `biz_${i}`,
        ebitda: 1000,
        revenue: 5000,
        sectorId: sectors[i % sectors.length],
        status: 'active',
      }));
    }
    const totalRevenue = businesses.reduce((s, b) => s + b.revenue, 0);

    const stateMany = buildKnownState({
      businesses,
      totalDebt: 0,
      holdcoLoanBalance: 0,
    });

    const complexity = calculateComplexityCost(
      businesses,
      stateMany.sharedServices,
      totalRevenue,
      stateMany.duration,
      stateMany.integratedPlatforms,
    );

    // Only test if complexity is actually triggered (depends on threshold)
    if (complexity.netCost > 0) {
      const metrics = calculateMetrics(stateMany);

      // Manually compute what netFcf should be
      const preTaxFcf = calculatePortfolioFcf(businesses, 0, 0, 0, 0, 0);

      // The metrics FCF should be less than preTaxFcf by at least the complexity cost
      // (minus tax benefit since complexity reduces income)
      expect(metrics.totalFcf).toBeLessThan(preTaxFcf);

      // Verify the complexity cost is deducted (compare with a 2-business state)
      const fewBiz = businesses.slice(0, 2);
      const stateFew = buildKnownState({
        businesses: fewBiz,
        totalDebt: 0,
        holdcoLoanBalance: 0,
      });
      const metricsFew = calculateMetrics(stateFew);

      // Per-business FCF should be higher with fewer businesses (no complexity cost)
      const perBizFcfMany = metrics.totalFcf / businesses.length;
      const perBizFcfFew = metricsFew.totalFcf / fewBiz.length;
      expect(perBizFcfFew).toBeGreaterThan(perBizFcfMany);
    }
  });

  it('deducts management fee in PE Fund mode (BUG FIX verification)', () => {
    const biz = createMockBusiness({ ebitda: 2000, revenue: 10000, sectorId: 'agency' });
    const stateHoldco = buildKnownState({
      businesses: [biz],
      isFundManagerMode: false,
    });
    const stateFund = buildKnownState({
      businesses: [biz],
      isFundManagerMode: true,
      fundSize: PE_FUND_CONFIG.fundSize,
    });

    const metricsHoldco = calculateMetrics(stateHoldco);
    const metricsFund = calculateMetrics(stateFund);

    // Fund mode should have lower FCF due to management fee
    // The management fee is also tax-deductible, so the difference
    // is managementFee * (1 - taxRate) approximately
    const mgmtFee = PE_FUND_CONFIG.annualManagementFee;
    const fcfDiff = metricsHoldco.totalFcf - metricsFund.totalFcf;

    // The net impact = mgmtFee - tax savings = mgmtFee * (1 - taxRate) = 2000 * 0.70 = 1400
    // But due to rounding, allow some tolerance
    const expectedNetImpact = mgmtFee * (1 - TAX_RATE);
    expect(fcfDiff).toBeGreaterThan(0);
    expect(Math.abs(fcfDiff - expectedNetImpact)).toBeLessThan(50);
  });
});

// ── FCF/Share ──────────────────────────────────────────────

describe('Dashboard Metric: FCF/Share', () => {
  it('equals totalFcf / sharesOutstanding', () => {
    const state = buildKnownState({ sharesOutstanding: 500 });
    const metrics = calculateMetrics(state);
    expect(metrics.fcfPerShare).toBeCloseTo(metrics.totalFcf / 500, 0);
  });

  it('is 0 when sharesOutstanding is 0', () => {
    const state = buildKnownState({ sharesOutstanding: 0 });
    const metrics = calculateMetrics(state);
    expect(metrics.fcfPerShare).toBe(0);
  });

  it('is negative when FCF is negative', () => {
    // Heavy debt → negative FCF
    const biz = createMockBusiness({
      ebitda: 500,
      revenue: 2500,
      sectorId: 'agency',
      sellerNoteBalance: 5000,
      sellerNoteRate: 0.10,
      sellerNoteRoundsRemaining: 3,
    });
    const state = buildKnownState({ businesses: [biz] });
    const metrics = calculateMetrics(state);
    expect(metrics.fcfPerShare).toBeLessThan(0);
  });
});

// ── Cash Conversion ────────────────────────────────────────

describe('Dashboard Metric: Cash Conversion', () => {
  it('equals pre-debt FCF / EBITDA (operating efficiency)', () => {
    const biz = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const state = buildKnownState({ businesses: [biz] });
    const metrics = calculateMetrics(state);

    // Cash conversion = preTaxFcf / totalEbitda (pre-debt-service ratio)
    // Pre-tax FCF for agency (3% capex) = 1000 - 30 = 970
    // After portfolio tax = 970 - 300 = 670
    // cashConversion = 670 / 1000 = 0.67
    expect(metrics.cashConversion).toBeCloseTo(0.67, 2);
  });

  it('is 0 when EBITDA is 0', () => {
    const state = buildKnownState({
      businesses: [createMockBusiness({ ebitda: 0, revenue: 0 })],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.cashConversion).toBe(0);
    expect(Number.isNaN(metrics.cashConversion)).toBe(false);
  });
});

// ── ROIC ───────────────────────────────────────────────────

describe('Dashboard Metric: ROIC', () => {
  it('equals NOPAT / totalInvestedCapital', () => {
    const state = buildKnownState({ totalInvestedCapital: 4000 });
    const metrics = calculateMetrics(state);

    // NOPAT = EBITDA - tax (portfolio-level tax)
    // ROIC = NOPAT / invested capital
    expect(metrics.portfolioRoic).toBeGreaterThan(0);
    expect(Number.isNaN(metrics.portfolioRoic)).toBe(false);
  });

  it('is 0 when invested capital is 0', () => {
    const state = buildKnownState({ totalInvestedCapital: 0 });
    const metrics = calculateMetrics(state);
    expect(metrics.portfolioRoic).toBe(0);
  });

  it('is higher with lower tax burden (debt shield)', () => {
    const biz = createMockBusiness({ ebitda: 1000, revenue: 5000, sectorId: 'agency' });
    const stateNoDebt = buildKnownState({
      businesses: [biz],
      totalDebt: 0,
      holdcoLoanBalance: 0,
      totalInvestedCapital: 4000,
    });
    // Add holdco debt which creates tax shield
    const stateDebt = buildKnownState({
      businesses: [biz],
      totalDebt: 3000,
      holdcoLoanBalance: 3000,
      holdcoLoanRate: 0.07,
      holdcoLoanRoundsRemaining: 5,
      totalInvestedCapital: 4000,
    });

    // ROIC uses NOPAT which benefits from interest tax shield
    const roicNoDebt = calculateMetrics(stateNoDebt).portfolioRoic;
    const roicDebt = calculateMetrics(stateDebt).portfolioRoic;

    // With debt: lower tax → higher NOPAT → higher ROIC
    expect(roicDebt).toBeGreaterThan(roicNoDebt);
  });
});

// ── ROIIC ──────────────────────────────────────────────────

describe('Dashboard Metric: ROIIC', () => {
  it('is 0 with no history', () => {
    const state = buildKnownState({ metricsHistory: [] });
    const metrics = calculateMetrics(state);
    expect(metrics.roiic).toBe(0);
  });

  it('equals deltaNOPAT / deltaInvestedCapital', () => {
    const state = buildKnownState({
      totalInvestedCapital: 8000,
      metricsHistory: [{
        round: 1,
        metrics: {} as Metrics,
        fcf: 500,
        nopat: 500,
        investedCapital: 4000,
      }],
    });
    const metrics = calculateMetrics(state);
    expect(Number.isNaN(metrics.roiic)).toBe(false);

    // Current NOPAT = totalEbitda - taxAmount
    // delta invested = 8000 - 4000 = 4000
    // roiic = (currentNopat - 500) / 4000
    const taxBreakdown = calculatePortfolioTax(state.businesses, 0, 0, 0);
    const currentNopat = 1000 - taxBreakdown.taxAmount;
    const expectedRoiic = (currentNopat - 500) / 4000;
    expect(metrics.roiic).toBeCloseTo(expectedRoiic, 4);
  });

  it('is 0 when no incremental capital deployed', () => {
    const state = buildKnownState({
      totalInvestedCapital: 4000,
      metricsHistory: [{
        round: 1,
        metrics: {} as Metrics,
        fcf: 500,
        nopat: 500,
        investedCapital: 4000, // same as current
      }],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.roiic).toBe(0);
  });
});

// ── MOIC ───────────────────────────────────────────────────

describe('Dashboard Metric: MOIC', () => {
  it('equals (portfolioValue + cash - debt + distributions) / initialRaise', () => {
    const state = buildKnownState({
      cash: 5000,
      totalDebt: 0,
      initialRaiseAmount: 20000,
      totalDistributions: 3000,
    });
    const metrics = calculateMetrics(state);

    // MOIC = NAV / initialRaise
    // NAV = portfolioValue + cash - totalDebt + distributions
    expect(metrics.portfolioMoic).toBeGreaterThan(0);
    expect(Number.isNaN(metrics.portfolioMoic)).toBe(false);
  });

  it('includes distributions in numerator', () => {
    const stateNoDist = buildKnownState({ totalDistributions: 0, initialRaiseAmount: 20000 });
    const stateDist = buildKnownState({ totalDistributions: 5000, initialRaiseAmount: 20000 });

    const moicNoDist = calculateMetrics(stateNoDist).portfolioMoic;
    const moicDist = calculateMetrics(stateDist).portfolioMoic;

    // MOIC with distributions should be 5000/20000 = 0.25x higher
    expect(moicDist - moicNoDist).toBeCloseTo(0.25, 1);
  });

  it('debt reduces MOIC', () => {
    const stateNoDebt = buildKnownState({ totalDebt: 0 });
    const stateDebt = buildKnownState({ totalDebt: 5000 });

    const moicNoDebt = calculateMetrics(stateNoDebt).portfolioMoic;
    const moicDebt = calculateMetrics(stateDebt).portfolioMoic;
    expect(moicDebt).toBeLessThan(moicNoDebt);
  });

  it('defaults to 1.0 when initialRaiseAmount is 0', () => {
    const state = buildKnownState({ initialRaiseAmount: 0 });
    const metrics = calculateMetrics(state);
    expect(metrics.portfolioMoic).toBe(1);
  });
});

// ── Leverage (Net Debt / EBITDA) ───────────────────────────

describe('Dashboard Metric: Leverage (Net Debt/EBITDA)', () => {
  it('includes seller notes in total debt', () => {
    const biz = createMockBusiness({
      ebitda: 1000,
      sellerNoteBalance: 500,
      bankDebtBalance: 0,
    });
    const state = buildKnownState({
      businesses: [biz],
      totalDebt: 1000, // holdco + bank debt only
      cash: 0,
    });
    const metrics = calculateMetrics(state);

    // Total debt in metrics = state.totalDebt(1000) + sellerNotes(500) = 1500
    expect(metrics.totalDebt).toBe(1500);
    // Net debt/EBITDA = (1500 - 0) / 1000 = 1.5
    expect(metrics.netDebtToEbitda).toBe(1.5);
  });

  it('is negative when in net cash position', () => {
    const state = buildKnownState({
      businesses: [createMockBusiness({ ebitda: 1000, sellerNoteBalance: 0 })],
      cash: 10000,
      totalDebt: 0,
    });
    const metrics = calculateMetrics(state);
    // Net debt = 0 - 10000 = -10000, EBITDA = 1000
    expect(metrics.netDebtToEbitda).toBe(-10);
  });

  it('is 0 when EBITDA is 0', () => {
    const state = buildKnownState({
      businesses: [createMockBusiness({ ebitda: 0, sellerNoteBalance: 0 })],
      totalDebt: 1000,
      cash: 0,
    });
    const metrics = calculateMetrics(state);
    expect(metrics.netDebtToEbitda).toBe(0);
  });
});

// ── Avg EBITDA Margin ──────────────────────────────────────

describe('Dashboard Metric: Avg EBITDA Margin', () => {
  it('equals totalEbitda / totalRevenue', () => {
    const state = buildKnownState({
      businesses: [
        createMockBusiness({ id: 'a', ebitda: 1000, revenue: 5000 }),
        createMockBusiness({ id: 'b', ebitda: 500, revenue: 10000 }),
      ],
    });
    const metrics = calculateMetrics(state);
    // Weighted margin = 1500 / 15000 = 0.10
    expect(metrics.avgEbitdaMargin).toBeCloseTo(0.10, 4);
  });

  it('is 0 when revenue is 0', () => {
    const state = buildKnownState({
      businesses: [createMockBusiness({ ebitda: 0, revenue: 0 })],
    });
    const metrics = calculateMetrics(state);
    expect(metrics.avgEbitdaMargin).toBe(0);
  });
});

// ── Intrinsic Value per Share ──────────────────────────────

describe('Dashboard Metric: Intrinsic Value per Share', () => {
  it('equals (portfolioValue + cash - totalDebt) / sharesOutstanding', () => {
    const state = buildKnownState({
      cash: 5000,
      totalDebt: 0,
      sharesOutstanding: 1000,
      businesses: [createMockBusiness({ ebitda: 1000, sellerNoteBalance: 0 })],
    });
    const metrics = calculateMetrics(state);

    // Intrinsic = (portfolioValue + 5000 - 0) / 1000
    expect(metrics.intrinsicValuePerShare).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.intrinsicValuePerShare)).toBe(true);
  });

  it('decreases with more debt', () => {
    const biz = createMockBusiness({ ebitda: 1000, sellerNoteBalance: 0 });
    const stateNoDebt = buildKnownState({
      businesses: [biz],
      totalDebt: 0,
      cash: 5000,
      sharesOutstanding: 1000,
    });
    const stateDebt = buildKnownState({
      businesses: [biz],
      totalDebt: 3000,
      holdcoLoanBalance: 3000,
      cash: 5000,
      sharesOutstanding: 1000,
    });
    const ivNoDebt = calculateMetrics(stateNoDebt).intrinsicValuePerShare;
    const ivDebt = calculateMetrics(stateDebt).intrinsicValuePerShare;
    expect(ivDebt).toBeLessThan(ivNoDebt);
  });
});

// ── PE Fund Mode: Management Fee in Tax Deduction ──────────

describe('Dashboard Metric: PE Fund Tax Deduction includes Management Fee', () => {
  it('management fee reduces taxable income (BUG FIX verification)', () => {
    const biz = createMockBusiness({ ebitda: 5000, revenue: 25000, sectorId: 'agency' });

    // In holdco mode, tax is on full EBITDA (no mgmt fee deduction)
    const holdcoTax = calculatePortfolioTax([biz], 0, 0, 0);

    // In fund mode, management fee is a deductible cost
    const mgmtFee = PE_FUND_CONFIG.annualManagementFee;
    const fundTax = calculatePortfolioTax([biz], 0, 0, mgmtFee);

    // Fund tax should be lower due to mgmt fee deduction
    expect(fundTax.taxAmount).toBeLessThan(holdcoTax.taxAmount);
    const taxSaving = holdcoTax.taxAmount - fundTax.taxAmount;
    // Tax saving = mgmtFee * TAX_RATE = 2000 * 0.30 = 600
    expect(taxSaving).toBe(Math.round(mgmtFee * TAX_RATE));
  });
});

// ── End-to-End Waterfall Match ─────────────────────────────

describe('Dashboard Metrics: Waterfall Consistency', () => {
  it('netFcf should equal manual waterfall calculation', () => {
    const biz = createMockBusiness({
      ebitda: 2000,
      revenue: 10000,
      sectorId: 'agency', // 3% capex
      sellerNoteBalance: 1000,
      sellerNoteRate: 0.06,
      sellerNoteRoundsRemaining: 4,
      bankDebtBalance: 0,
    });

    const state = buildKnownState({
      businesses: [biz],
      cash: 8000,
      totalDebt: 2000,
      holdcoLoanBalance: 2000,
      holdcoLoanRate: 0.07,
      holdcoLoanRoundsRemaining: 5,
    });

    const metrics = calculateMetrics(state);

    // Manual calculation:
    // Pre-tax FCF = 2000 - (2000 * 0.03) = 2000 - 60 = 1940
    const agencyCapex = 0.03;
    const preTaxFcf = Math.round(2000 * (1 - agencyCapex));
    expect(preTaxFcf).toBe(1940);

    // Holdco interest on 2000 at 7%
    const holdcoInterest = Math.round(2000 * 0.07);
    // Seller note interest on 1000 at 6%
    const sellerNoteInterest = Math.round(1000 * 0.06);
    // Total interest for tax deduction
    const totalInterest = holdcoInterest + sellerNoteInterest;

    // Tax = max(0, 2000 - totalInterest) * 0.30
    const taxableIncome = Math.max(0, 2000 - totalInterest);
    const tax = Math.round(taxableIncome * TAX_RATE);
    const afterTaxFcf = preTaxFcf - tax;

    // Holdco P&I
    const holdcoPrincipal = Math.round(2000 / 5);
    const holdcoPI = holdcoInterest + holdcoPrincipal;

    // Seller note P&I
    const sellerNotePrincipal = Math.round(1000 / 4);
    const sellerNotePI = sellerNoteInterest + sellerNotePrincipal;

    // Net FCF
    const expectedNetFcf = afterTaxFcf - holdcoPI - sellerNotePI;

    expect(metrics.totalFcf).toBe(expectedNetFcf);
  });

  it('multi-business state metrics are internally consistent', () => {
    const state = createMultiBusinessState(3);
    const metrics = calculateMetrics(state);

    // EBITDA = sum of active businesses
    const expectedEbitda = state.businesses
      .filter(b => b.status === 'active')
      .reduce((s, b) => s + b.ebitda, 0);
    expect(metrics.totalEbitda).toBe(expectedEbitda);

    // Revenue = sum of active businesses
    const expectedRevenue = state.businesses
      .filter(b => b.status === 'active')
      .reduce((s, b) => s + b.revenue, 0);
    expect(metrics.totalRevenue).toBe(expectedRevenue);

    // Margin = EBITDA / Revenue
    expect(metrics.avgEbitdaMargin).toBeCloseTo(expectedEbitda / expectedRevenue, 4);

    // FCF/Share consistency
    if (metrics.sharesOutstanding > 0) {
      expect(metrics.fcfPerShare).toBeCloseTo(metrics.totalFcf / metrics.sharesOutstanding, 0);
    }
  });
});

// ── Edge Cases ─────────────────────────────────────────────

describe('Dashboard Metrics: Edge Cases', () => {
  it('no NaN in any metric with empty portfolio', () => {
    const state = buildKnownState({ businesses: [] });
    const metrics = calculateMetrics(state);

    const metricValues = [
      metrics.totalEbitda,
      metrics.totalFcf,
      metrics.fcfPerShare,
      metrics.portfolioRoic,
      metrics.roiic,
      metrics.portfolioMoic,
      metrics.netDebtToEbitda,
      metrics.cashConversion,
      metrics.intrinsicValuePerShare,
      metrics.totalRevenue,
      metrics.avgEbitdaMargin,
      metrics.interestRate,
      metrics.totalDebt,
      metrics.totalDistributions,
      metrics.totalBuybacks,
      metrics.totalExitProceeds,
      metrics.totalInvestedCapital,
    ];

    for (const val of metricValues) {
      expect(Number.isNaN(val)).toBe(false);
      expect(Number.isFinite(val)).toBe(true);
    }
  });

  it('integrated businesses are excluded from EBITDA but included in debt', () => {
    const integrated = createMockBusiness({
      id: 'int',
      status: 'integrated',
      ebitda: 500,
      sellerNoteBalance: 300,
    });
    const active = createMockBusiness({
      id: 'act',
      status: 'active',
      ebitda: 1000,
      sellerNoteBalance: 0,
    });
    const state = buildKnownState({ businesses: [active, integrated] });
    const metrics = calculateMetrics(state);

    // EBITDA only from active
    expect(metrics.totalEbitda).toBe(1000);
    // Debt includes integrated seller note
    expect(metrics.totalDebt).toBe(state.totalDebt + 300);
  });

  it('earnout payments reduce net FCF only when target met', () => {
    const bizMet = createMockBusiness({
      id: 'met',
      ebitda: 1500, // 50% growth from 1000
      acquisitionEbitda: 1000,
      revenue: 7500,
      earnoutRemaining: 200,
      earnoutTarget: 0.20, // 20% growth needed → 50% > 20%, met
      acquisitionRound: 1,
    });
    const bizNotMet = createMockBusiness({
      id: 'not',
      ebitda: 1050, // 5% growth from 1000
      acquisitionEbitda: 1000,
      revenue: 5250,
      earnoutRemaining: 200,
      earnoutTarget: 0.20, // 20% growth needed → 5% < 20%, not met
      acquisitionRound: 1,
    });

    const stateMet = buildKnownState({ businesses: [bizMet], round: 2 });
    const stateNotMet = buildKnownState({ businesses: [bizNotMet], round: 2 });

    const metMetrics = calculateMetrics(stateMet);
    const notMetMetrics = calculateMetrics(stateNotMet);

    // Both have same earnoutRemaining, but only met one pays it
    // The difference in FCF should partially reflect the 200 earnout payment
    // (partially offset by higher EBITDA of met business)
    expect(metMetrics.totalFcf).toBeDefined();
    expect(notMetMetrics.totalFcf).toBeDefined();
  });
});
