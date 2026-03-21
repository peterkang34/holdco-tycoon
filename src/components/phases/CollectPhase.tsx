import { useState } from 'react';
import { Business, LPComment, formatMoney, formatPercent } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { calculatePortfolioTax, TAX_RATE, ComplexityCostBreakdown } from '../../engine/simulation';
import { EARNOUT_EXPIRATION_YEARS, PE_FUND_CONFIG } from '../../data/gameConfig';
import { debtCountdownLabel } from '../../data/mechanicsCopy';

interface CollectPhaseProps {
  businesses: Business[];
  cash: number;
  totalDebt: number;
  holdcoLoanBalance: number;
  holdcoLoanRate: number;
  holdcoLoanRoundsRemaining: number;
  interestRate: number;
  sharedServicesCost: number;
  maSourcingCost?: number;
  turnaroundCost?: number;
  cashConversionBonus?: number;
  round: number;
  yearChronicle?: string | null;
  debtPaymentThisRound?: number;
  cashBeforeDebtPayments?: number;
  interestPenalty?: number;
  capexReduction?: number;
  complexityCost?: number | ComplexityCostBreakdown;
  isFundManagerMode?: boolean;
  managementFee?: number;
  lpCommentary?: LPComment[];
  onContinue: () => void;
}

// Calculate detailed FCF breakdown for a business (pre-tax — tax is at portfolio level)
function calculateFcfBreakdown(business: Business, _interestRate: number, capexReduction: number = 0, cashConversionBonus: number = 0, round: number = 0) {
  const sector = SECTORS[business.sectorId];
  const ebitda = business.ebitda;
  const effectiveCapexRate = sector.capexRate * (1 - capexReduction);
  const capex = Math.round(ebitda * effectiveCapexRate);

  // Pre-debt FCF with cash conversion bonus (matches engine's calculateAnnualFcf)
  const preFcf = Math.round((ebitda - capex) * (1 + cashConversionBonus));

  // OpCo-level debt service
  const sellerNoteInterest = Math.round(business.sellerNoteBalance * business.sellerNoteRate);
  const sellerNotePrincipal = business.sellerNoteRoundsRemaining > 0
    ? Math.round(business.sellerNoteBalance / business.sellerNoteRoundsRemaining)
    : 0;
  const bankDebtInterest = Math.round(business.bankDebtBalance * (business.bankDebtRate || 0));
  const bankDebtPrincipal = business.bankDebtRoundsRemaining > 0
    ? Math.round(business.bankDebtBalance / business.bankDebtRoundsRemaining)
    : 0;

  // Earn-out: triggers when cumulative EBITDA growth meets target (expires after EARNOUT_EXPIRATION_YEARS)
  let earnoutPayment = 0;
  const earnoutExpired = round > 0 && business.earnoutRemaining > 0 && round - business.acquisitionRound > EARNOUT_EXPIRATION_YEARS;
  if (!earnoutExpired && business.earnoutRemaining > 0 && business.earnoutTarget > 0 && business.acquisitionEbitda > 0) {
    const growth = (business.ebitda - business.acquisitionEbitda) / business.acquisitionEbitda;
    if (growth >= business.earnoutTarget) {
      earnoutPayment = business.earnoutRemaining;
    }
  }

  const totalDeductions = capex + sellerNoteInterest + sellerNotePrincipal + bankDebtInterest + bankDebtPrincipal + earnoutPayment;
  const fcf = preFcf - (totalDeductions - capex); // preFcf already includes capex

  return {
    ebitda,
    capex,
    capexRate: sector.capexRate,
    sellerNoteInterest,
    sellerNotePrincipal,
    sellerNoteBalance: business.sellerNoteBalance,
    bankDebtInterest,
    bankDebtPrincipal,
    bankDebtBalance: business.bankDebtBalance,
    earnoutPayment,
    fcf,
  };
}

// Calculate all debt service for integrated (tuck-in) businesses: seller notes + bank debt + earnouts
function calculateIntegratedDebtService(businesses: Business[], round: number = 0): { sellerNotes: number; bankDebt: number; earnouts: number; total: number } {
  const integrated = businesses.filter(b => b.status === 'integrated');
  let sellerNotes = 0;
  let bankDebt = 0;
  let earnouts = 0;
  for (const b of integrated) {
    // Seller note interest + principal
    if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
      sellerNotes += Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      sellerNotes += Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
    }
    // Bank debt interest + principal
    if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
      bankDebt += Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      bankDebt += Math.round(b.bankDebtBalance / b.bankDebtRoundsRemaining);
    }
    // Earn-out using platform growth as proxy (skip if expired)
    const earnoutExpired = round > 0 && b.earnoutRemaining > 0 && round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS;
    if (!earnoutExpired && b.earnoutRemaining > 0 && b.earnoutTarget > 0 && b.parentPlatformId) {
      const platform = businesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
      if (platform && platform.acquisitionEbitda > 0) {
        const growth = (platform.ebitda - platform.acquisitionEbitda) / platform.acquisitionEbitda;
        if (growth >= b.earnoutTarget) earnouts += b.earnoutRemaining;
      }
    }
  }
  return { sellerNotes, bankDebt, earnouts, total: sellerNotes + bankDebt + earnouts };
}

export function CollectPhase({
  businesses,
  cash,
  totalDebt: _totalDebt,
  holdcoLoanBalance,
  holdcoLoanRate,
  holdcoLoanRoundsRemaining,
  interestRate,
  sharedServicesCost,
  maSourcingCost = 0,
  turnaroundCost = 0,
  cashConversionBonus = 0,
  round,
  yearChronicle,
  debtPaymentThisRound: _debtPaymentThisRound,
  cashBeforeDebtPayments: _cashBeforeDebtPayments,
  interestPenalty,
  capexReduction = 0,
  complexityCost: complexityCostProp = 0,
  isFundManagerMode = false,
  managementFee = 0,
  lpCommentary,
  onContinue
}: CollectPhaseProps) {
  // Support both legacy number and full breakdown object
  const complexityBreakdown: ComplexityCostBreakdown | null =
    typeof complexityCostProp === 'object' ? complexityCostProp : null;
  const complexityCost = typeof complexityCostProp === 'object' ? complexityCostProp.netCost : complexityCostProp;
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const activeBusinesses = businesses.filter(b => b.status === 'active');

  // Calculate breakdowns for all businesses (pre-tax)
  const businessBreakdowns = activeBusinesses.map(b => ({
    business: b,
    breakdown: calculateFcfBreakdown(b, interestRate, capexReduction, cashConversionBonus, round),
  }));

  // Calculate total pre-tax FCF from all businesses (annual)
  const totalBusinessFcf = businessBreakdowns.reduce((sum, { breakdown }) => sum + breakdown.fcf, 0);
  const totalEbitda = businessBreakdowns.reduce((sum, { breakdown }) => sum + breakdown.ebitda, 0);
  const totalCapex = businessBreakdowns.reduce((sum, { breakdown }) => sum + breakdown.capex, 0);

  // Portfolio-level cash conversion (EBITDA → FCF, before and after tax)
  // Pre-tax: (EBITDA - CapEx) / EBITDA — how much EBITDA survives capex
  // Post-tax: (EBITDA - CapEx - Tax) / EBITDA — matches dashboard "Cash Conv." metric
  const preTaxPortfolioFcf = totalEbitda - totalCapex;
  const preTaxCashConversion = totalEbitda > 0 ? preTaxPortfolioFcf / totalEbitda : 0;

  // Debt service from integrated (tuck-in) businesses: seller notes + earnouts
  const integratedDebt = calculateIntegratedDebtService(businesses, round);

  // Portfolio-level tax with all deductions (uses holdco loan balance, not total debt)
  // Include interest penalty in holdco rate for accurate tax shield (matches actual interest paid)
  const taxBreakdown = calculatePortfolioTax(activeBusinesses, holdcoLoanBalance, holdcoLoanRate + (interestPenalty ?? 0), sharedServicesCost + (maSourcingCost ?? 0) + managementFee);
  const hasDeductions = taxBreakdown.totalTaxSavings > 0;
  const effectiveRatePct = Math.round(taxBreakdown.effectiveTaxRate * 100);
  const postTaxCashConversion = totalEbitda > 0 ? (preTaxPortfolioFcf - taxBreakdown.taxAmount) / totalEbitda : 0;

  // Holdco loan P&I (interest + principal)
  const holdcoLoanInterest = Math.round(holdcoLoanBalance * (holdcoLoanRate + (interestPenalty ?? 0)));
  const holdcoLoanPrincipal = holdcoLoanRoundsRemaining > 0
    ? Math.round(holdcoLoanBalance / holdcoLoanRoundsRemaining)
    : 0;
  const holdcoInterest = holdcoLoanInterest + holdcoLoanPrincipal;

  // Total earn-out payments (active businesses + tuck-ins) — uncapped
  const uncappedActiveEarnouts = businessBreakdowns.reduce((s, { breakdown }) => s + breakdown.earnoutPayment, 0);
  const uncappedTotalEarnouts = uncappedActiveEarnouts + integratedDebt.earnouts;

  // Net FCF WITHOUT earn-outs (to determine how much cash is available for earn-outs)
  const netFcfBeforeEarnouts = totalBusinessFcf + uncappedActiveEarnouts - taxBreakdown.taxAmount - holdcoInterest - sharedServicesCost - maSourcingCost - turnaroundCost - complexityCost - managementFee - integratedDebt.sellerNotes - integratedDebt.bankDebt;
  const availableForEarnouts = Math.max(0, cash + netFcfBeforeEarnouts);

  // Cap earn-outs at available cash (matches store's Math.min logic)
  const totalEarnouts = Math.min(uncappedTotalEarnouts, availableForEarnouts);
  const activeEarnouts = uncappedTotalEarnouts > 0
    ? Math.round(uncappedActiveEarnouts * (totalEarnouts / uncappedTotalEarnouts))
    : 0;

  // Net FCF after tax, holdco interest, shared services, MA sourcing, and tuck-in earnouts
  const netFcf = netFcfBeforeEarnouts - totalEarnouts;

  // What cash will be after collection
  const projectedCash = cash + netFcf;

  // OpCo debt service (seller notes + bank debt P&I, excluding earn-outs)
  const opcoDebtService = businessBreakdowns.reduce((s, { breakdown }) =>
    s + breakdown.sellerNoteInterest + breakdown.sellerNotePrincipal + breakdown.bankDebtInterest + breakdown.bankDebtPrincipal, 0)
    + integratedDebt.sellerNotes + integratedDebt.bankDebt;

  // Coverage ratios
  const totalInterestExpense = holdcoInterest +
    businessBreakdowns.reduce((s, { breakdown }) => s + breakdown.sellerNoteInterest + breakdown.bankDebtInterest, 0);
  const totalDebtService = totalInterestExpense +
    businessBreakdowns.reduce((s, { breakdown }) => s + breakdown.sellerNotePrincipal + breakdown.bankDebtPrincipal, 0);
  const interestCoverage = totalInterestExpense > 0 ? totalEbitda / totalInterestExpense : Infinity;
  const debtServiceCoverage = totalDebtService > 0 ? netFcf / totalDebtService : Infinity;
  const hasDebtObligations = totalDebtService > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Year {round} — Cash Flow Collection</h2>
        <p className="text-text-secondary">EBITDA converts to Free Cash Flow after deductions</p>
      </div>

      {/* Year Chronicle */}
      {yearChronicle && (
        <div className="card mb-6 bg-gradient-to-r from-accent/10 to-transparent border-l-4 border-accent">
          <p className="text-sm italic text-text-primary leading-relaxed">
            {yearChronicle}
          </p>
        </div>
      )}

      {/* EBITDA to FCF Summary */}
      <div className="card mb-6 bg-white/5">
        <h3 className="font-bold mb-4">Portfolio Cash Flow Waterfall</h3>
        <div className="overflow-x-auto -mx-2 sm:mx-0"><div className={`grid gap-1.5 sm:gap-3 min-w-[320px] sm:min-w-0 text-center text-xs sm:text-sm ${totalEarnouts > 0 ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4 sm:grid-cols-7'}`}>
          <div>
            <p className="text-text-muted">Revenue</p>
            <p className="font-mono font-bold text-sm sm:text-lg">{formatMoney(activeBusinesses.reduce((s, b) => s + b.revenue, 0))}</p>
          </div>
          <div>
            <p className="text-text-muted">EBITDA</p>
            <p className="font-mono font-bold text-sm sm:text-lg">{formatMoney(totalEbitda)}</p>
          </div>
          <div>
            <p className="text-text-muted">CapEx</p>
            <p className="font-mono font-bold text-sm sm:text-lg text-warning">
              -{formatMoney(businessBreakdowns.reduce((s, { breakdown }) => s + breakdown.capex, 0))}
            </p>
          </div>
          <div className="border-l border-white/20 pl-2 sm:pl-0 sm:border-0">
            <p className="text-text-muted">
              {hasDeductions ? `Tax ${effectiveRatePct}%` : 'Tax'}
            </p>
            <p className="font-mono font-bold text-sm sm:text-lg text-warning">
              -{formatMoney(taxBreakdown.taxAmount)}
            </p>
          </div>
          <div>
            <p className="text-text-muted"><span className="hidden sm:inline">OpCo </span>Debt</p>
            <p className="font-mono font-bold text-sm sm:text-lg text-danger">
              -{formatMoney(opcoDebtService)}
            </p>
          </div>
          {totalEarnouts > 0 && (
            <div>
              <p className="text-text-muted">Earn-outs</p>
              <p className="font-mono font-bold text-sm sm:text-lg text-danger">
                -{formatMoney(totalEarnouts)}
              </p>
            </div>
          )}
          <div>
            <p className="text-text-muted">HoldCo</p>
            <p className="font-mono font-bold text-sm sm:text-lg text-danger">
              -{formatMoney(holdcoInterest + sharedServicesCost + maSourcingCost + complexityCost)}
            </p>
          </div>
          <div className="border-l border-white/20 pl-2 sm:pl-4">
            <p className="text-text-muted">Net FCF</p>
            <p className={`font-mono font-bold text-sm sm:text-lg ${netFcf >= 0 ? 'text-accent' : 'text-danger'}`}>
              {formatMoney(netFcf)}
            </p>
          </div>
        </div></div>

        {/* Cash Conversion */}
        {totalEbitda > 0 && (
          <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-white/10 flex flex-col sm:flex-row gap-1.5 sm:gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Pre-Tax Cash Conversion:</span>
              <span className="font-mono font-bold text-text-primary">
                {formatPercent(preTaxCashConversion)}
              </span>
              <span className="text-xs text-text-muted hidden sm:inline">(EBITDA − CapEx) ÷ EBITDA</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Cash Conversion (After Tax):</span>
              <span className={`font-mono font-bold ${postTaxCashConversion >= 0.7 ? 'text-accent' : postTaxCashConversion >= 0.6 ? 'text-yellow-400' : 'text-text-primary'}`}>
                {formatPercent(postTaxCashConversion)}
              </span>
              <span className="text-xs text-text-muted hidden sm:inline">(EBITDA − CapEx − Tax) ÷ EBITDA</span>
            </div>
          </div>
        )}

        {/* Coverage Ratios */}
        {hasDebtObligations && (
          <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-white/10 flex flex-col sm:flex-row gap-1.5 sm:gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                interestCoverage >= 4 ? 'bg-accent' : interestCoverage >= 2 ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <span className="text-text-muted">Interest Coverage</span>
              <span className={`font-mono font-bold ${
                interestCoverage >= 4 ? 'text-accent' : interestCoverage >= 2 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {interestCoverage === Infinity ? '∞' : `${interestCoverage.toFixed(1)}x`}
              </span>
              <span className="text-xs text-text-muted hidden sm:inline">(EBITDA / Interest)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                debtServiceCoverage >= 1.5 ? 'bg-accent' : debtServiceCoverage >= 1 ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <span className="text-text-muted">Debt Service Coverage</span>
              <span className={`font-mono font-bold ${
                debtServiceCoverage >= 1.5 ? 'text-accent' : debtServiceCoverage >= 1 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {debtServiceCoverage === Infinity ? '∞' : `${debtServiceCoverage.toFixed(1)}x`}
              </span>
              <span className="text-xs text-text-muted hidden sm:inline">(Net FCF / Debt Service)</span>
            </div>
          </div>
        )}
      </div>

      {/* Negative FCF Warning Banner */}
      {netFcf < 0 && (
        <div className={`rounded-xl p-4 mb-6 ${
          projectedCash <= 0
            ? 'bg-red-900/30 border-2 border-red-500/50'
            : 'bg-red-900/20 border border-red-500/30'
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{projectedCash <= 0 ? '🚨' : '⚠️'}</span>
            <div>
              <h3 className={`font-bold ${projectedCash <= 0 ? 'text-red-400' : 'text-red-300'}`}>
                {projectedCash <= 0
                  ? 'Cash Reserves Exhausted'
                  : 'Negative Cash Flow'}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {projectedCash <= 0
                  ? `Your portfolio generated ${formatMoney(netFcf)} in negative cash flow, exceeding your ${formatMoney(cash)} reserves. Restructuring will be triggered.`
                  : `Your portfolio generated ${formatMoney(netFcf)} in negative cash flow this year. Debt service and overhead exceeded operating earnings.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tax Details (collapsible) — only shown when there are deductions */}
      {hasDeductions && (
        <div className="card mb-6 bg-white/5 border-l-4 border-accent/50">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowTaxDetails(!showTaxDetails)}
          >
            <div>
              <h3 className="font-bold text-sm">Tax Savings: {formatMoney(taxBreakdown.totalTaxSavings)}</h3>
              <p className="text-xs text-text-muted">
                Effective rate {effectiveRatePct}% vs statutory 30% — click to expand
              </p>
            </div>
            <span className="text-text-muted text-sm">{showTaxDetails ? '▼' : '▶'}</span>
          </button>

          {showTaxDetails && (
            <div className="mt-4 space-y-3">
              {/* Rate comparison */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-1 bg-white/5 rounded p-2 text-center">
                  <p className="text-text-muted text-xs">Statutory</p>
                  <p className="font-mono font-bold">30%</p>
                  <p className="text-xs text-text-muted">{formatMoney(Math.round(taxBreakdown.grossEbitda * TAX_RATE))}</p>
                </div>
                <span className="text-text-muted">→</span>
                <div className="flex-1 bg-accent/10 rounded p-2 text-center">
                  <p className="text-text-muted text-xs">Effective</p>
                  <p className="font-mono font-bold text-accent">{effectiveRatePct}%</p>
                  <p className="text-xs text-accent">{formatMoney(taxBreakdown.taxAmount)}</p>
                </div>
              </div>

              {/* Deduction breakdown */}
              <div className="space-y-2 text-sm">
                {taxBreakdown.interestTaxShield > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Interest shield ({formatMoney(taxBreakdown.totalInterest)} deducted)</span>
                    <span className="font-mono text-accent">+{formatMoney(taxBreakdown.interestTaxShield)} saved</span>
                  </div>
                )}
                {taxBreakdown.sharedServicesTaxShield > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Management fees ({formatMoney(taxBreakdown.sharedServicesCost)} deducted)</span>
                    <span className="font-mono text-accent">+{formatMoney(taxBreakdown.sharedServicesTaxShield)} saved</span>
                  </div>
                )}
                {taxBreakdown.lossOffsetTaxShield > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Loss offsets ({formatMoney(taxBreakdown.lossOffset)} offset)</span>
                    <span className="font-mono text-accent">+{formatMoney(taxBreakdown.lossOffsetTaxShield)} saved</span>
                  </div>
                )}
              </div>

              {/* Educational note */}
              <p className="text-xs text-text-muted italic mt-2 border-t border-white/10 pt-2">
                Like a real consolidated return, your holdco files taxes across all entities. Interest expense,
                management fees, and operating losses in one business reduce the overall tax base — creating
                real savings that reward smart structuring.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Business-by-Business Breakdown */}
      <div className="card mb-6">
        <h3 className="font-bold mb-4">Operating Company Cash Flows</h3>
        <p className="text-xs text-text-muted mb-4">Click a business to see detailed breakdown (pre-tax)</p>

        <div className="space-y-3">
          {businessBreakdowns.map(({ business, breakdown }) => {
            const sector = SECTORS[business.sectorId];
            const isExpanded = expandedBusiness === business.id;
            const hasDebt = breakdown.sellerNoteBalance > 0 || breakdown.bankDebtBalance > 0;

            return (
              <div key={business.id}>
                <div
                  className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${
                    isExpanded ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                  onClick={() => setExpandedBusiness(isExpanded ? null : business.id)}
                >
                  <div className="flex items-center gap-2 w-24 sm:w-48 min-w-0">
                    <span className="text-lg sm:text-xl">{sector.emoji}</span>
                    <div className="truncate">
                      <p className="font-medium truncate text-sm sm:text-base">{business.name}</p>
                      <p className="text-xs text-text-muted hidden sm:block">{sector.name}</p>
                    </div>
                  </div>

                  {/* Mini waterfall — hidden on mobile, visible on sm+ */}
                  <div className="hidden sm:flex flex-1 items-center gap-2 text-xs font-mono">
                    <span className="text-text-secondary">{formatMoney(breakdown.ebitda)}</span>
                    <span className="text-text-muted">→</span>
                    <span className={breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}>
                      {formatMoney(breakdown.fcf)}
                    </span>
                    {hasDebt && (
                      <span className="text-danger text-xs">
                        (P&I: {formatMoney(breakdown.sellerNoteInterest + breakdown.sellerNotePrincipal + breakdown.bankDebtInterest + breakdown.bankDebtPrincipal)}/yr)
                      </span>
                    )}
                  </div>

                  <div className="flex-1 sm:w-28 sm:flex-none text-right">
                    <span className={`font-mono font-bold text-sm sm:text-base ${breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {breakdown.fcf >= 0 ? '+' : ''}{formatMoney(breakdown.fcf)}
                    </span>
                    <p className="sm:hidden text-xs text-text-muted font-mono">{formatMoney(breakdown.ebitda)} EBITDA</p>
                  </div>

                  <span className="text-text-muted text-sm">{isExpanded ? '▼' : '▶'}</span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="ml-4 sm:ml-8 mr-2 sm:mr-4 mt-2 p-2 sm:p-4 bg-white/5 rounded-lg text-xs sm:text-sm">
                    <table className="w-full">
                      <tbody>
                        <tr>
                          <td className="py-1 text-text-secondary">EBITDA</td>
                          <td className="py-1 text-right font-mono">{formatMoney(breakdown.ebitda)}</td>
                          <td className="py-1 text-right text-text-muted w-20"></td>
                        </tr>
                        <tr className="text-warning">
                          <td className="py-1">(-) CapEx</td>
                          <td className="py-1 text-right font-mono">-{formatMoney(breakdown.capex)}</td>
                          <td className="py-1 text-right text-text-muted text-xs">{formatPercent(breakdown.capexRate)}</td>
                        </tr>
                        {breakdown.sellerNoteBalance > 0 && (
                          <>
                            <tr className="text-danger">
                              <td className="py-1">(-) Seller Note Interest</td>
                              <td className="py-1 text-right font-mono">-{formatMoney(breakdown.sellerNoteInterest)}</td>
                              <td className="py-1 text-right text-text-muted text-xs">{formatPercent(business.sellerNoteRate)}</td>
                            </tr>
                            <tr className="text-danger">
                              <td className="py-1">(-) Seller Note Principal</td>
                              <td className="py-1 text-right font-mono">-{formatMoney(breakdown.sellerNotePrincipal)}</td>
                              <td className="py-1 text-right text-text-muted text-xs">{debtCountdownLabel(business.sellerNoteRoundsRemaining)}</td>
                            </tr>
                          </>
                        )}
                        {breakdown.bankDebtBalance > 0 && (
                          <>
                            <tr className="text-danger">
                              <td className="py-1">(-) Bank Debt Interest</td>
                              <td className="py-1 text-right font-mono">-{formatMoney(breakdown.bankDebtInterest)}</td>
                              <td className="py-1 text-right text-text-muted text-xs">{formatPercent(business.bankDebtRate)}</td>
                            </tr>
                            <tr className="text-danger">
                              <td className="py-1">(-) Bank Debt Principal</td>
                              <td className="py-1 text-right font-mono">-{formatMoney(breakdown.bankDebtPrincipal)}</td>
                              <td className="py-1 text-right text-text-muted text-xs">{debtCountdownLabel(business.bankDebtRoundsRemaining)}</td>
                            </tr>
                          </>
                        )}
                        {breakdown.earnoutPayment > 0 && (
                          <tr className="text-danger">
                            <td className="py-1">(-) Earn-out Payment</td>
                            <td className="py-1 text-right font-mono">-{formatMoney(breakdown.earnoutPayment)}</td>
                            <td className="py-1 text-right text-text-muted text-xs">Target met</td>
                          </tr>
                        )}
                        <tr className="border-t border-white/10">
                          <td className="py-2 font-bold">= Pre-Tax Cash Flow</td>
                          <td className={`py-2 text-right font-mono font-bold ${breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {formatMoney(breakdown.fcf)}
                          </td>
                          <td className="py-2 text-right text-text-muted text-xs">
                            {formatPercent(breakdown.ebitda > 0 ? breakdown.fcf / breakdown.ebitda : 0)} pre-tax
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Holdco-Level Deductions */}
        <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wide mb-3">Holdco-Level Deductions</p>

          {/* Management Fee (Fund Mode — first deduction) */}
          {isFundManagerMode && managementFee > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏦</span>
                <span className="text-text-secondary">Management Fee</span>
                <span className="text-xs text-text-muted">
                  ({Math.round(PE_FUND_CONFIG.managementFeeRate * 100)}% of committed capital)
                </span>
              </div>
              <span className="font-mono text-warning">-{formatMoney(managementFee)}</span>
            </div>
          )}

          {/* Portfolio Tax */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span className="text-text-secondary">
                Portfolio Tax {hasDeductions ? `(eff. ${effectiveRatePct}%)` : '(30%)'}
              </span>
              {hasDeductions && (
                <span className="text-xs text-accent">saved {formatMoney(taxBreakdown.totalTaxSavings)}</span>
              )}
            </div>
            <span className="font-mono text-warning">-{formatMoney(taxBreakdown.taxAmount)}</span>
          </div>

          {/* Holdco Loan P&I (hidden in fund mode — no holdco debt) */}
          {!isFundManagerMode && holdcoInterest > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏦</span>
                <span className="text-text-secondary">Holdco Loan P&I</span>
                <span className="text-xs text-text-muted">
                  ({formatMoney(holdcoLoanBalance)} @ {formatPercent(holdcoLoanRate)}
                  {(interestPenalty ?? 0) > 0 && (
                    <span className="text-red-400"> + {formatPercent(interestPenalty!)} penalty</span>
                  )}
                  , {debtCountdownLabel(holdcoLoanRoundsRemaining)})
                </span>
              </div>
              <span className="font-mono text-danger">-{formatMoney(holdcoInterest)}</span>
            </div>
          )}

          {sharedServicesCost > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <span className="text-text-secondary">Shared Services Overhead</span>
              </div>
              <span className="font-mono text-warning">-{formatMoney(sharedServicesCost)}</span>
            </div>
          )}

          {maSourcingCost > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔍</span>
                <span className="text-text-secondary">M&A Sourcing Team</span>
              </div>
              <span className="font-mono text-warning">-{formatMoney(maSourcingCost)}</span>
            </div>
          )}

          {complexityCost > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏗️</span>
                <span className="text-text-secondary">Portfolio Complexity</span>
                {complexityBreakdown && complexityBreakdown.activeSSCount > 0 && (
                  <span className="text-xs text-accent">
                    {formatMoney(complexityBreakdown.grossCost)} − {formatMoney(complexityBreakdown.grossCost - complexityBreakdown.netCost)} offset
                  </span>
                )}
              </div>
              <span className="font-mono text-warning">-{formatMoney(complexityCost)}</span>
            </div>
          )}

          {totalEarnouts > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">📝</span>
                <span className="text-text-secondary">
                  Earn-out Payments
                  {activeEarnouts > 0 && integratedDebt.earnouts > 0
                    ? ` (${formatMoney(activeEarnouts)} standalone + ${formatMoney(integratedDebt.earnouts)} bolt-on)`
                    : ''}
                </span>
              </div>
              <span className="font-mono text-danger">-{formatMoney(totalEarnouts)}</span>
            </div>
          )}
        </div>

        {/* Net Total */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-lg font-medium">Net Cash Flow to Holdco</span>
          <span className={`text-2xl font-mono font-bold ${netFcf >= 0 ? 'text-accent' : 'text-danger'}`}>
            {netFcf >= 0 ? '+' : ''}{formatMoney(netFcf)}
          </span>
        </div>
      </div>

      {/* Fund Mode: Year 1 Orientation Card (0 businesses) */}
      {isFundManagerMode && round === 1 && activeBusinesses.length === 0 && (
        <div className="card mb-6 bg-gradient-to-r from-purple-500/10 to-transparent border-l-4 border-purple-500/50">
          <p className="text-sm text-text-secondary leading-relaxed mb-2">
            <strong className="text-purple-300">Your fund is open for business.</strong> $100M committed, no businesses yet.
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            The $2M management fee covers your team and fund operations — it deducts whether you've deployed capital or not.
            Next: Head to the Deals tab and start building your portfolio.
          </p>
        </div>
      )}

      {/* LP Commentary (Fund Mode) */}
      {isFundManagerMode && lpCommentary && lpCommentary.filter(c => c.round === round).length > 0 && (
        <div className="space-y-3 mb-6">
          {lpCommentary.filter(c => c.round === round).map((comment, i) => (
            <div key={i} className="card flex items-start gap-3 bg-white/3">
              <span className={`w-8 h-8 rounded-full flex-shrink-0 text-[10px] font-bold flex items-center justify-center ${
                comment.speaker === 'edna' ? 'bg-blue-500/30 text-blue-300' : 'bg-amber-500/30 text-amber-300'
              }`}>
                {comment.speaker === 'edna' ? 'EM' : 'CH'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm italic text-text-primary leading-relaxed">"{comment.text}"</p>
                <p className="text-xs text-text-muted mt-1">
                  — {comment.speaker === 'edna' ? 'Edna Morrison, State Pension Fund' : 'Chip Henderson, Family Office'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Holdco Cash */}
      <div className="card text-center mb-6">
        <div className="flex items-center justify-center gap-4 mb-2">
          <div>
            <p className="text-text-muted text-sm">Current Cash</p>
            <p className="text-2xl font-bold font-mono">{formatMoney(cash)}</p>
          </div>
          <span className="text-2xl text-text-muted">→</span>
          <div>
            <p className="text-text-muted text-sm">After Collection</p>
            <p className={`text-2xl font-bold font-mono ${projectedCash >= cash ? 'text-accent' : 'text-danger'}`}>{formatMoney(projectedCash)}</p>
          </div>
        </div>
      </div>

      <button onClick={onContinue} className="btn-primary w-full text-lg">
        Collect Cash & Continue →
      </button>
    </div>
  );
}
