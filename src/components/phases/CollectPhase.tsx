import { useState } from 'react';
import { Business, formatMoney, formatPercent } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { calculatePortfolioTax, TAX_RATE } from '../../engine/simulation';

interface CollectPhaseProps {
  businesses: Business[];
  cash: number;
  totalDebt: number;
  interestRate: number;
  sharedServicesCost: number;
  maSourcingCost?: number;
  round: number;
  yearChronicle?: string | null;
  debtPaymentThisRound?: number;
  cashBeforeDebtPayments?: number;
  holdcoAmortization?: number;
  interestPenalty?: number;
  onContinue: () => void;
}

// Calculate detailed FCF breakdown for a business (pre-tax — tax is at portfolio level)
function calculateFcfBreakdown(business: Business, interestRate: number) {
  const sector = SECTORS[business.sectorId];
  const ebitda = business.ebitda;
  const capex = Math.round(ebitda * sector.capexRate);

  // OpCo-level debt service
  const sellerNoteInterest = Math.round(business.sellerNoteBalance * business.sellerNoteRate);
  const sellerNotePrincipal = business.sellerNoteRoundsRemaining > 0
    ? Math.round(business.sellerNoteBalance / business.sellerNoteRoundsRemaining)
    : 0;
  const bankDebtInterest = Math.round(business.bankDebtBalance * interestRate);

  const totalDeductions = capex + sellerNoteInterest + sellerNotePrincipal + bankDebtInterest;
  const fcf = ebitda - totalDeductions;

  return {
    ebitda,
    capex,
    capexRate: sector.capexRate,
    sellerNoteInterest,
    sellerNotePrincipal,
    sellerNoteBalance: business.sellerNoteBalance,
    bankDebtInterest,
    bankDebtBalance: business.bankDebtBalance,
    fcf,
  };
}

export function CollectPhase({
  businesses,
  cash,
  totalDebt,
  interestRate,
  sharedServicesCost,
  maSourcingCost = 0,
  round,
  yearChronicle,
  debtPaymentThisRound,
  cashBeforeDebtPayments,
  holdcoAmortization,
  interestPenalty,
  onContinue
}: CollectPhaseProps) {
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const activeBusinesses = businesses.filter(b => b.status === 'active');

  // Calculate breakdowns for all businesses (pre-tax)
  const businessBreakdowns = activeBusinesses.map(b => ({
    business: b,
    breakdown: calculateFcfBreakdown(b, interestRate),
  }));

  // Calculate total pre-tax FCF from all businesses (annual)
  const totalBusinessFcf = businessBreakdowns.reduce((sum, { breakdown }) => sum + breakdown.fcf, 0);
  const totalEbitda = businessBreakdowns.reduce((sum, { breakdown }) => sum + breakdown.ebitda, 0);

  // Portfolio-level tax with all deductions
  const taxBreakdown = calculatePortfolioTax(activeBusinesses, totalDebt, interestRate, sharedServicesCost);
  const hasDeductions = taxBreakdown.totalTaxSavings > 0;
  const effectiveRatePct = Math.round(taxBreakdown.effectiveTaxRate * 100);

  // Calculate annual interest expense (holdco level)
  const holdcoInterest = Math.round(totalDebt * interestRate);

  // Net FCF after tax, holdco interest, shared services, and MA sourcing
  const netFcf = totalBusinessFcf - taxBreakdown.taxAmount - holdcoInterest - sharedServicesCost - maSourcingCost;

  // What cash will be after collection
  const projectedCash = cash + netFcf;

  return (
    <div className="max-w-4xl mx-auto p-6">
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center text-sm">
          <div>
            <p className="text-text-muted">EBITDA</p>
            <p className="font-mono font-bold text-lg">{formatMoney(totalEbitda)}</p>
          </div>
          <div>
            <p className="text-text-muted">CapEx</p>
            <p className="font-mono font-bold text-lg text-warning">
              -{formatMoney(businessBreakdowns.reduce((s, { breakdown }) => s + breakdown.capex, 0))}
            </p>
          </div>
          <div>
            <p className="text-text-muted">
              {hasDeductions ? `Taxes (eff. ${effectiveRatePct}%)` : 'Taxes (30%)'}
            </p>
            <p className="font-mono font-bold text-lg text-warning">
              -{formatMoney(taxBreakdown.taxAmount)}
            </p>
          </div>
          <div>
            <p className="text-text-muted">OpCo Debt</p>
            <p className="font-mono font-bold text-lg text-danger">
              -{formatMoney(businessBreakdowns.reduce((s, { breakdown }) =>
                s + breakdown.sellerNoteInterest + breakdown.sellerNotePrincipal + breakdown.bankDebtInterest, 0))}
            </p>
          </div>
          <div>
            <p className="text-text-muted">HoldCo Costs</p>
            <p className="font-mono font-bold text-lg text-danger">
              -{formatMoney(holdcoInterest + sharedServicesCost + maSourcingCost)}
            </p>
          </div>
          <div className="border-l border-white/20 pl-4">
            <p className="text-text-muted">Net FCF</p>
            <p className={`font-mono font-bold text-lg ${netFcf >= 0 ? 'text-accent' : 'text-danger'}`}>
              {formatMoney(netFcf)}
            </p>
          </div>
        </div>
      </div>

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
                  <div className="flex items-center gap-2 w-48">
                    <span className="text-xl">{sector.emoji}</span>
                    <div className="truncate">
                      <p className="font-medium truncate">{business.name}</p>
                      <p className="text-xs text-text-muted">{sector.name}</p>
                    </div>
                  </div>

                  {/* Mini waterfall */}
                  <div className="flex-1 flex items-center gap-2 text-xs font-mono">
                    <span className="text-text-secondary">{formatMoney(breakdown.ebitda)}</span>
                    <span className="text-text-muted">→</span>
                    <span className={breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}>
                      {formatMoney(breakdown.fcf)}
                    </span>
                    {hasDebt && (
                      <span className="text-danger text-xs">(debt: {formatMoney(breakdown.sellerNoteBalance + breakdown.bankDebtBalance)})</span>
                    )}
                  </div>

                  <div className="w-28 text-right">
                    <span className={`font-mono font-bold ${breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {breakdown.fcf >= 0 ? '+' : ''}{formatMoney(breakdown.fcf)}
                    </span>
                  </div>

                  <span className="text-text-muted text-sm">{isExpanded ? '▼' : '▶'}</span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="ml-8 mr-4 mt-2 p-4 bg-white/5 rounded-lg text-sm">
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
                              <td className="py-1 text-right text-text-muted text-xs">{business.sellerNoteRoundsRemaining}y left</td>
                            </tr>
                          </>
                        )}
                        {breakdown.bankDebtBalance > 0 && (
                          <tr className="text-danger">
                            <td className="py-1">(-) Bank Debt Interest</td>
                            <td className="py-1 text-right font-mono">-{formatMoney(breakdown.bankDebtInterest)}</td>
                            <td className="py-1 text-right text-text-muted text-xs">{formatPercent(interestRate)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-white/10">
                          <td className="py-2 font-bold">= Pre-Tax Cash Flow</td>
                          <td className={`py-2 text-right font-mono font-bold ${breakdown.fcf >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {formatMoney(breakdown.fcf)}
                          </td>
                          <td className="py-2 text-right text-text-muted text-xs">
                            {formatPercent(breakdown.ebitda > 0 ? breakdown.fcf / breakdown.ebitda : 0)} conv.
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

          {holdcoInterest > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏦</span>
                <span className="text-text-secondary">Holdco Debt Interest</span>
                <span className="text-xs text-text-muted">
                  ({formatMoney(totalDebt)} @ {formatPercent(interestRate)}
                  {(interestPenalty ?? 0) > 0 && (
                    <span className="text-red-400"> + {formatPercent(interestPenalty!)} penalty</span>
                  )}
                  )
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
        </div>

        {/* Net Total */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-lg font-medium">Net Cash Flow to Holdco</span>
          <span className={`text-2xl font-mono font-bold ${netFcf >= 0 ? 'text-accent' : 'text-danger'}`}>
            {netFcf >= 0 ? '+' : ''}{formatMoney(netFcf)}
          </span>
        </div>
      </div>

      {/* Year-Start Debt Payments (between years) */}
      {(debtPaymentThisRound ?? 0) > 0 && (
        <div className="card mb-6 bg-white/5 border-l-4 border-warning/50">
          <h3 className="font-bold text-sm mb-3">Year-Start Adjustments</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Last Year's Ending Cash</span>
              <span className="font-mono">{formatMoney(cashBeforeDebtPayments ?? 0)}</span>
            </div>
            {((debtPaymentThisRound ?? 0) - (holdcoAmortization ?? 0)) > 0 && (
              <div className="flex justify-between text-warning">
                <span>OpCo Debt (seller notes & earnouts)</span>
                <span className="font-mono">-{formatMoney((debtPaymentThisRound ?? 0) - (holdcoAmortization ?? 0))}</span>
              </div>
            )}
            {(holdcoAmortization ?? 0) > 0 && (
              <div className="flex justify-between text-warning">
                <span>Holdco Debt Amortization (10% mandatory)</span>
                <span className="font-mono">-{formatMoney(holdcoAmortization ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
              <span>Starting Cash</span>
              <span className="font-mono">{formatMoney(cash)}</span>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-3 italic">
            Seller notes, earnouts, and holdco debt amortization are paid automatically before cash collection each year.
          </p>
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
            <p className="text-2xl font-bold font-mono text-accent">{formatMoney(projectedCash)}</p>
          </div>
        </div>
      </div>

      <button onClick={onContinue} className="btn-primary w-full text-lg">
        Collect Cash & Continue →
      </button>
    </div>
  );
}
