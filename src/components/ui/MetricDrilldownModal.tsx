import { useGameStore } from '../../hooks/useGame';
import { SECTORS } from '../../data/sectors';
import { formatMoney, formatPercent, formatMultiple } from '../../engine/types';
import {
  calculateAnnualFcf,
  calculatePortfolioTax,
  calculateSharedServicesBenefits,
  TAX_RATE,
} from '../../engine/simulation';
import { getMASourcingAnnualCost } from '../../data/sharedServices';

interface MetricDrilldownModalProps {
  metricKey: string;
  onClose: () => void;
}

export function MetricDrilldownModal({ metricKey, onClose }: MetricDrilldownModalProps) {
  const state = useGameStore();
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const ssBenefits = calculateSharedServicesBenefits(state);
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const maSourcingCost = state.maSourcing?.active
    ? getMASourcingAnnualCost(state.maSourcing.tier)
    : 0;
  const totalDeductibleCosts = sharedServicesCost + maSourcingCost;

  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, state.totalDebt, state.interestRate, totalDeductibleCosts
  );

  const renderContent = () => {
    switch (metricKey) {
      case 'cash':
        return renderCash();
      case 'ebitda':
        return renderEbitda();
      case 'netfcf':
        return renderNetFcf();
      case 'fcfshare':
        return renderFcfShare();
      case 'roic':
        return renderRoic();
      case 'roiic':
        return renderRoiic();
      case 'moic':
        return renderMoic();
      case 'leverage':
        return renderLeverage();
      case 'cashconv':
        return renderCashConv();
      default:
        return <p className="text-text-muted">Unknown metric</p>;
    }
  };

  const SectionHeader = ({ title, formula }: { title: string; formula?: string }) => (
    <div className="mb-4">
      <h3 className="text-lg font-bold">{title}</h3>
      {formula && (
        <p className="text-xs text-text-muted font-mono mt-1">{formula}</p>
      )}
    </div>
  );

  const WaterfallRow = ({ label, value, isSubtract, isTotal, indent }: {
    label: string; value: number; isSubtract?: boolean; isTotal?: boolean; indent?: boolean;
  }) => (
    <div className={`flex justify-between py-1.5 ${isTotal ? 'border-t border-white/20 font-bold mt-1 pt-2' : ''} ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${isTotal ? 'text-text-primary' : 'text-text-secondary'}`}>
        {isSubtract && !isTotal ? '− ' : ''}{label}
      </span>
      <span className={`font-mono text-sm ${isTotal ? 'text-accent' : isSubtract ? 'text-danger' : ''}`}>
        {isSubtract && value > 0 ? `(${formatMoney(value)})` : formatMoney(value)}
      </span>
    </div>
  );

  const BusinessTable = ({ headers, rows }: {
    headers: string[];
    rows: (string | number)[][];
  }) => (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h, i) => (
              <th key={i} className={`py-2 px-2 text-text-muted font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td key={j} className={`py-1.5 px-2 font-mono ${j === 0 ? 'text-left font-sans' : 'text-right'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  function renderCash() {
    return (
      <>
        <SectionHeader title="Cash" formula="Opening Cash + FCF + Exits − Acquisitions − Debt Payments" />
        <div className="bg-white/5 rounded-lg p-3 mb-4">
          <div className="text-center">
            <p className="text-text-muted text-xs">Current Balance</p>
            <p className="text-3xl font-bold font-mono text-accent">{formatMoney(state.cash)}</p>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-3 uppercase tracking-wide font-medium">Cumulative Cash Sources & Uses</p>
        <div className="bg-white/5 rounded-lg p-3 space-y-0">
          <WaterfallRow label="Initial Raise" value={state.initialRaiseAmount} />
          <WaterfallRow label="Total Exit Proceeds" value={state.totalExitProceeds} />
          <WaterfallRow label="Total Capital Invested" value={state.totalInvestedCapital} isSubtract />
          <WaterfallRow label="Total Distributions" value={state.totalDistributions} isSubtract />
          <WaterfallRow label="Total Buybacks" value={state.totalBuybacks} isSubtract />
        </div>
        <p className="text-xs text-text-muted mt-3 italic">
          Cash balance also reflects annual FCF, debt payments, shared services costs, and interest.
        </p>
      </>
    );
  }

  function renderEbitda() {
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const totalRevenue = activeBusinesses.reduce((sum, b) => sum + b.revenue, 0);
    return (
      <>
        <SectionHeader title="EBITDA" formula="Sum of all active businesses' Revenue × Margin" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-text-muted text-xs">Portfolio Total</p>
          <p className="text-3xl font-bold font-mono">{formatMoney(totalEbitda)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(totalRevenue)} revenue at {totalRevenue > 0 ? (totalEbitda / totalRevenue * 100).toFixed(1) : 0}% margin
          </p>
        </div>
        <BusinessTable
          headers={['Business', 'Revenue', 'Margin', 'EBITDA', '% Total']}
          rows={activeBusinesses.map(b => [
            b.name,
            formatMoney(b.revenue),
            `${(b.ebitdaMargin * 100).toFixed(1)}%`,
            formatMoney(b.ebitda),
            totalEbitda > 0 ? `${(b.ebitda / totalEbitda * 100).toFixed(0)}%` : '—',
          ])}
        />
      </>
    );
  }

  function renderNetFcf() {
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const totalCapex = activeBusinesses.reduce((sum, b) => {
      const sector = SECTORS[b.sectorId];
      const effectiveCapexRate = sector.capexRate * (1 - ssBenefits.capexReduction);
      return sum + b.ebitda * effectiveCapexRate;
    }, 0);

    const holdcoInterest = Math.round(state.totalDebt * state.interestRate);
    const opcoInterest = activeBusinesses.reduce(
      (sum, b) => sum + Math.round(b.sellerNoteBalance * b.sellerNoteRate), 0
    );

    const preTaxFcf = activeBusinesses.reduce(
      (sum, b) => sum + calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus), 0
    );
    const netFcf = preTaxFcf - taxBreakdown.taxAmount - holdcoInterest - opcoInterest - sharedServicesCost;

    return (
      <>
        <SectionHeader title="Net FCF" formula="EBITDA − CapEx − Taxes − Interest − Shared Services" />
        <div className="bg-white/5 rounded-lg p-3 space-y-0 mb-4">
          <WaterfallRow label="Total EBITDA" value={totalEbitda} />
          <WaterfallRow label={`CapEx${ssBenefits.capexReduction > 0 ? ' (reduced by procurement)' : ''}`} value={Math.round(totalCapex)} isSubtract />
          <WaterfallRow label={`Taxes (${(taxBreakdown.effectiveTaxRate * 100).toFixed(1)}% effective)`} value={taxBreakdown.taxAmount} isSubtract />
          {holdcoInterest > 0 && (
            <WaterfallRow label="Holdco Interest" value={holdcoInterest} isSubtract />
          )}
          {opcoInterest > 0 && (
            <WaterfallRow label="Opco Interest (seller notes)" value={opcoInterest} isSubtract />
          )}
          {sharedServicesCost > 0 && (
            <WaterfallRow label="Shared Services" value={sharedServicesCost} isSubtract />
          )}
          <WaterfallRow label="Net FCF" value={netFcf} isTotal />
        </div>

        {taxBreakdown.totalTaxSavings > 0 && (
          <div className="bg-accent/10 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-accent mb-2">Tax Shields Saving You {formatMoney(taxBreakdown.totalTaxSavings)}/yr</p>
            <div className="space-y-1 text-xs">
              {taxBreakdown.interestTaxShield > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Interest deduction</span>
                  <span className="font-mono">{formatMoney(taxBreakdown.interestTaxShield)}</span>
                </div>
              )}
              {taxBreakdown.sharedServicesTaxShield > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Shared services deduction</span>
                  <span className="font-mono">{formatMoney(taxBreakdown.sharedServicesTaxShield)}</span>
                </div>
              )}
              {taxBreakdown.lossOffsetTaxShield > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Loss offset (negative EBITDA biz)</span>
                  <span className="font-mono">{formatMoney(taxBreakdown.lossOffsetTaxShield)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Per-Business CapEx</p>
        <BusinessTable
          headers={['Business', 'EBITDA', 'CapEx Rate', 'CapEx', 'Pre-Tax FCF']}
          rows={activeBusinesses.map(b => {
            const sector = SECTORS[b.sectorId];
            const effectiveRate = sector.capexRate * (1 - ssBenefits.capexReduction);
            const capex = b.ebitda * effectiveRate;
            return [
              b.name,
              formatMoney(b.ebitda),
              `${(effectiveRate * 100).toFixed(0)}%`,
              formatMoney(Math.round(capex)),
              formatMoney(Math.round(b.ebitda - capex)),
            ];
          })}
        />
      </>
    );
  }

  function renderFcfShare() {
    const holdcoInterest = Math.round(state.totalDebt * state.interestRate);
    const opcoInterest = activeBusinesses.reduce(
      (sum, b) => sum + Math.round(b.sellerNoteBalance * b.sellerNoteRate), 0
    );
    const preTaxFcf = activeBusinesses.reduce(
      (sum, b) => sum + calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus), 0
    );
    const netFcf = preTaxFcf - taxBreakdown.taxAmount - holdcoInterest - opcoInterest - sharedServicesCost;
    const fcfPerShare = state.sharesOutstanding > 0 ? netFcf / state.sharesOutstanding : 0;

    return (
      <>
        <SectionHeader title="FCF/Share" formula="Net FCF ÷ Shares Outstanding" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-3xl font-bold font-mono">${fcfPerShare.toFixed(0)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(netFcf)} FCF ÷ {state.sharesOutstanding.toFixed(0)} shares
          </p>
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Share History</p>
        <div className="bg-white/5 rounded-lg p-3 space-y-0">
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-text-secondary">Shares Outstanding</span>
            <span className="font-mono">{state.sharesOutstanding.toFixed(0)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-text-secondary">Your Shares (Founder)</span>
            <span className="font-mono">{state.founderShares.toFixed(0)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-text-secondary">Your Ownership</span>
            <span className="font-mono">{(state.founderShares / state.sharesOutstanding * 100).toFixed(1)}%</span>
          </div>
          {state.equityRaisesUsed > 0 && (
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-text-secondary">Equity Raises Used</span>
              <span className="font-mono">{state.equityRaisesUsed}</span>
            </div>
          )}
          {state.totalBuybacks > 0 && (
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-text-secondary">Total Buybacks</span>
              <span className="font-mono">{formatMoney(state.totalBuybacks)}</span>
            </div>
          )}
        </div>

        {state.metricsHistory.length > 0 && (
          <>
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2 mt-4">FCF/Share Trend</p>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex gap-1 items-end h-16">
                {state.metricsHistory.map((h, i) => {
                  const maxFcf = Math.max(...state.metricsHistory.map(hh => Math.abs(hh.metrics.fcfPerShare)), Math.abs(fcfPerShare));
                  const height = maxFcf > 0 ? (Math.abs(h.metrics.fcfPerShare) / maxFcf) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end items-center">
                      <div
                        className={`w-full rounded-t ${h.metrics.fcfPerShare >= 0 ? 'bg-accent/60' : 'bg-danger/60'}`}
                        style={{ height: `${Math.max(2, height)}%` }}
                        title={`Y${h.round}: $${h.metrics.fcfPerShare.toFixed(0)}/share`}
                      />
                    </div>
                  );
                })}
                <div className="flex-1 flex flex-col justify-end items-center">
                  <div
                    className={`w-full rounded-t ${fcfPerShare >= 0 ? 'bg-accent' : 'bg-danger'}`}
                    style={{ height: `${Math.max(2, Math.abs(fcfPerShare) / Math.max(...state.metricsHistory.map(h => Math.abs(h.metrics.fcfPerShare)), Math.abs(fcfPerShare)) * 100)}%` }}
                    title={`Now: $${fcfPerShare.toFixed(0)}/share`}
                  />
                </div>
              </div>
              <div className="flex gap-1 mt-1">
                {state.metricsHistory.map((h, i) => (
                  <div key={i} className="flex-1 text-center text-[8px] text-text-muted">Y{h.round}</div>
                ))}
                <div className="flex-1 text-center text-[8px] text-accent">Now</div>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  function renderRoic() {
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const nopat = totalEbitda - taxBreakdown.taxAmount;
    const roic = state.totalInvestedCapital > 0 ? nopat / state.totalInvestedCapital : 0;

    return (
      <>
        <SectionHeader title="ROIC" formula="NOPAT ÷ Total Invested Capital" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-3xl font-bold font-mono">{formatPercent(roic)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(nopat)} NOPAT ÷ {formatMoney(state.totalInvestedCapital)} invested
          </p>
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">NOPAT Calculation</p>
        <div className="bg-white/5 rounded-lg p-3 space-y-0 mb-4">
          <WaterfallRow label="Total EBITDA" value={totalEbitda} />
          <WaterfallRow label={`Taxes (${(taxBreakdown.effectiveTaxRate * 100).toFixed(1)}% eff.)`} value={taxBreakdown.taxAmount} isSubtract />
          <WaterfallRow label="= NOPAT" value={nopat} isTotal />
        </div>

        {taxBreakdown.totalTaxSavings > 0 && (
          <div className="bg-accent/10 rounded-lg p-3 mb-4 text-xs">
            <p className="text-accent font-medium mb-1">Tax shields boost ROIC by {state.totalInvestedCapital > 0 ? `+${(taxBreakdown.totalTaxSavings / state.totalInvestedCapital * 100).toFixed(1)}ppt` : '—'}</p>
            <p className="text-text-muted">Without shields, naive tax = {formatMoney(Math.round(Math.max(0, totalEbitda) * TAX_RATE))}</p>
          </div>
        )}

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Per-Business Contribution</p>
        <BusinessTable
          headers={['Business', 'Invested', 'EBITDA', '% NOPAT']}
          rows={activeBusinesses.map(b => [
            b.name,
            formatMoney(b.totalAcquisitionCost || b.acquisitionPrice),
            formatMoney(b.ebitda),
            totalEbitda > 0 ? `${(b.ebitda / totalEbitda * 100).toFixed(0)}%` : '—',
          ])}
        />

        <p className="text-xs text-text-muted mt-3 italic">
          Benchmark: 15%+ ROIC = strong. 25%+ = exceptional.
        </p>
      </>
    );
  }

  function renderRoiic() {
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const nopat = totalEbitda - taxBreakdown.taxAmount;

    if (state.metricsHistory.length === 0) {
      return (
        <>
          <SectionHeader title="ROIIC" formula="(Current NOPAT − Prior NOPAT) ÷ (Current Invested − Prior Invested)" />
          <div className="bg-white/5 rounded-lg p-6 text-center">
            <p className="text-text-muted">N/A — Requires at least one prior year of data.</p>
          </div>
        </>
      );
    }

    const prevMetrics = state.metricsHistory[state.metricsHistory.length - 1];
    const deltaNopat = nopat - prevMetrics.nopat;
    const deltaInvested = state.totalInvestedCapital - prevMetrics.investedCapital;
    const roiic = deltaInvested > 0 ? deltaNopat / deltaInvested : 0;

    return (
      <>
        <SectionHeader title="ROIIC" formula="(Current NOPAT − Prior NOPAT) ÷ (Current Invested − Prior Invested)" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-3xl font-bold font-mono">{formatPercent(roiic)}</p>
          <p className="text-xs text-text-muted mt-1">
            Return on incremental invested capital
          </p>
        </div>

        <div className="bg-white/5 rounded-lg p-3 space-y-0 mb-4">
          <div className="grid grid-cols-3 text-center text-xs mb-2">
            <span className="text-text-muted">Metric</span>
            <span className="text-text-muted">Prior Year</span>
            <span className="text-text-muted">Current</span>
          </div>
          <div className="grid grid-cols-3 text-center text-sm py-1 border-t border-white/5">
            <span className="text-text-secondary">NOPAT</span>
            <span className="font-mono">{formatMoney(prevMetrics.nopat)}</span>
            <span className="font-mono">{formatMoney(nopat)}</span>
          </div>
          <div className="grid grid-cols-3 text-center text-sm py-1 border-t border-white/5">
            <span className="text-text-secondary">Invested</span>
            <span className="font-mono">{formatMoney(prevMetrics.investedCapital)}</span>
            <span className="font-mono">{formatMoney(state.totalInvestedCapital)}</span>
          </div>
          <div className="grid grid-cols-3 text-center text-sm py-1 border-t border-white/10 font-bold">
            <span className="text-text-secondary">Delta</span>
            <span></span>
            <span className="font-mono">
              {deltaInvested > 0
                ? `${formatMoney(deltaNopat)} / ${formatMoney(deltaInvested)}`
                : 'No new capital'}
            </span>
          </div>
        </div>

        <p className="text-xs text-text-muted italic">
          Benchmark: 20%+ ROIIC = excellent incremental returns. Below 10% suggests overpaying for acquisitions.
        </p>
      </>
    );
  }

  function renderMoic() {
    const portfolioValue = activeBusinesses.reduce((sum, b) => {
      const sector = SECTORS[b.sectorId];
      const avgMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
      return sum + b.ebitda * avgMultiple;
    }, 0);

    const opcoDebt = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
    const totalDebt = state.totalDebt + opcoDebt;
    const nav = portfolioValue + state.cash - totalDebt + state.totalDistributions;
    const moic = state.initialRaiseAmount > 0 ? nav / state.initialRaiseAmount : 1;

    return (
      <>
        <SectionHeader title="MOIC" formula="(Portfolio Value + Cash − Debt + Distributions) ÷ Initial Raise" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-3xl font-bold font-mono">{formatMultiple(moic)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(nav)} NAV ÷ {formatMoney(state.initialRaiseAmount)} initial raise
          </p>
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">NAV Waterfall</p>
        <div className="bg-white/5 rounded-lg p-3 space-y-0 mb-4">
          <WaterfallRow label="Portfolio Value" value={Math.round(portfolioValue)} />
          <WaterfallRow label="Cash" value={state.cash} />
          <WaterfallRow label="Total Debt" value={totalDebt} isSubtract />
          <WaterfallRow label="Cumulative Distributions" value={state.totalDistributions} />
          <WaterfallRow label="NAV" value={Math.round(nav)} isTotal />
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Per-Business Value</p>
        <BusinessTable
          headers={['Business', 'Invested', 'Current Value', 'Biz MOIC']}
          rows={activeBusinesses.map(b => {
            const sector = SECTORS[b.sectorId];
            const avgMult = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
            const currentValue = b.ebitda * avgMult;
            const invested = b.totalAcquisitionCost || b.acquisitionPrice;
            const bizMoic = invested > 0 ? currentValue / invested : 0;
            return [
              b.name,
              formatMoney(invested),
              formatMoney(Math.round(currentValue)),
              formatMultiple(bizMoic),
            ];
          })}
        />

        {state.exitedBusinesses.filter(b => b.status === 'sold' && b.exitPrice && !b.parentPlatformId).length > 0 && (
          <>
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2 mt-4">Exited Businesses</p>
            <BusinessTable
              headers={['Business', 'Invested', 'Exit Price', 'Exit MOIC']}
              rows={state.exitedBusinesses
                .filter(b => b.status === 'sold' && b.exitPrice && !b.parentPlatformId)
                .map(b => {
                  const invested = b.totalAcquisitionCost || b.acquisitionPrice;
                  const exitMoic = invested > 0 ? (b.exitPrice || 0) / invested : 0;
                  return [
                    b.name,
                    formatMoney(invested),
                    formatMoney(b.exitPrice || 0),
                    formatMultiple(exitMoic),
                  ];
                })}
            />
          </>
        )}
      </>
    );
  }

  function renderLeverage() {
    const opcoDebt = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
    const totalDebt = state.totalDebt + opcoDebt;
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const netDebt = totalDebt - state.cash;
    const leverage = totalEbitda > 0 ? netDebt / totalEbitda : 0;

    const getLeverageColor = (ratio: number) => {
      if (ratio < 2.5) return 'text-accent';
      if (ratio < 3.5) return 'text-warning';
      if (ratio < 4.5) return 'text-orange-400';
      return 'text-danger';
    };

    return (
      <>
        <SectionHeader title="Leverage" formula="(Total Debt − Cash) ÷ EBITDA" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className={`text-3xl font-bold font-mono ${getLeverageColor(leverage)}`}>
            {leverage <= 0 ? 'Net Cash' : formatMultiple(leverage)}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(netDebt)} net debt ÷ {formatMoney(totalEbitda)} EBITDA
          </p>
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Debt Composition</p>
        <div className="bg-white/5 rounded-lg p-3 space-y-0 mb-4">
          {state.totalDebt > 0 && (
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-text-secondary">Holdco Bank Debt</span>
              <span className="font-mono">{formatMoney(state.totalDebt)} @ {(state.interestRate * 100).toFixed(1)}%</span>
            </div>
          )}
          {activeBusinesses.filter(b => b.sellerNoteBalance > 0).map(b => (
            <div key={b.id} className="flex justify-between py-1.5 text-sm">
              <span className="text-text-secondary pl-2">{b.name} seller note</span>
              <span className="font-mono text-xs">
                {formatMoney(b.sellerNoteBalance)} @ {(b.sellerNoteRate * 100).toFixed(1)}% ({b.sellerNoteRoundsRemaining}yr left)
              </span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 text-sm border-t border-white/10 mt-1 pt-2">
            <span className="font-bold">Total Debt</span>
            <span className="font-mono font-bold">{formatMoney(totalDebt)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-text-secondary">Less: Cash</span>
            <span className="font-mono text-accent">({formatMoney(state.cash)})</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm border-t border-white/10 mt-1 pt-2">
            <span className="font-bold">Net Debt</span>
            <span className="font-mono font-bold">{formatMoney(netDebt)}</span>
          </div>
        </div>

        <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">Covenant Thresholds</p>
        <div className="grid grid-cols-4 gap-1 text-center text-xs">
          <div className={`p-2 rounded ${leverage < 2.5 ? 'bg-accent/20 border border-accent/40' : 'bg-white/5'}`}>
            <p className="font-bold text-accent">&lt;2.5x</p>
            <p className="text-text-muted">Comfortable</p>
          </div>
          <div className={`p-2 rounded ${leverage >= 2.5 && leverage < 3.5 ? 'bg-warning/20 border border-warning/40' : 'bg-white/5'}`}>
            <p className="font-bold text-warning">2.5-3.5x</p>
            <p className="text-text-muted">Elevated</p>
          </div>
          <div className={`p-2 rounded ${leverage >= 3.5 && leverage < 4.5 ? 'bg-orange-500/20 border border-orange-500/40' : 'bg-white/5'}`}>
            <p className="font-bold text-orange-400">3.5-4.5x</p>
            <p className="text-text-muted">Stressed</p>
          </div>
          <div className={`p-2 rounded ${leverage >= 4.5 ? 'bg-danger/20 border border-danger/40' : 'bg-white/5'}`}>
            <p className="font-bold text-danger">&gt;4.5x</p>
            <p className="text-text-muted">Breach</p>
          </div>
        </div>

        {/* Headroom & Breach Counter */}
        {leverage > 0 && (
          <div className="mt-3 space-y-1.5 text-sm">
            {leverage < 4.5 && (
              <p className="text-text-secondary">
                Headroom: <span className="font-mono font-bold">{(
                  leverage < 2.5 ? (2.5 - leverage).toFixed(1) :
                  leverage < 3.5 ? (3.5 - leverage).toFixed(1) :
                  (4.5 - leverage).toFixed(1)
                )}x</span> to {
                  leverage < 2.5 ? 'Elevated' :
                  leverage < 3.5 ? 'Stressed' :
                  'Breach'
                }
              </p>
            )}
            {leverage >= 4.5 && state.covenantBreachRounds > 0 && (
              <p className="text-red-400 font-bold">
                Consecutive breach years: {state.covenantBreachRounds} of 2
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  function renderCashConv() {
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const preTaxFcf = activeBusinesses.reduce(
      (sum, b) => sum + calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus), 0
    );
    const cashConversion = totalEbitda > 0 ? preTaxFcf / totalEbitda : 0;

    return (
      <>
        <SectionHeader title="Cash Conversion" formula="Pre-Tax FCF ÷ EBITDA" />
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-center">
          <p className="text-3xl font-bold font-mono">{formatPercent(cashConversion)}</p>
          <p className="text-xs text-text-muted mt-1">
            {formatMoney(preTaxFcf)} pre-tax FCF ÷ {formatMoney(totalEbitda)} EBITDA
          </p>
        </div>

        <BusinessTable
          headers={['Business', 'EBITDA', 'CapEx %', 'Pre-Tax FCF', 'Conv.']}
          rows={activeBusinesses.map(b => {
            const sector = SECTORS[b.sectorId];
            const effectiveRate = sector.capexRate * (1 - ssBenefits.capexReduction);
            const fcf = calculateAnnualFcf(b, ssBenefits.capexReduction, ssBenefits.cashConversionBonus);
            const conv = b.ebitda > 0 ? fcf / b.ebitda : 0;
            return [
              b.name,
              formatMoney(b.ebitda),
              `${(effectiveRate * 100).toFixed(0)}%`,
              formatMoney(fcf),
              `${(conv * 100).toFixed(0)}%`,
            ];
          })}
        />

        <p className="text-xs text-text-muted mt-3 italic">
          Benchmark: 80%+ is excellent. Low-capex sectors (agencies, consulting) naturally convert better.
          {ssBenefits.capexReduction > 0 && ` Procurement shared service reducing capex by ${(ssBenefits.capexReduction * 100).toFixed(0)}%.`}
          {ssBenefits.cashConversionBonus > 0 && ` Finance & reporting adding +${(ssBenefits.cashConversionBonus * 100).toFixed(0)}% conversion bonus.`}
        </p>
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-bg-primary border border-white/10 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-text-muted uppercase tracking-wide">Metric Breakdown</span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
