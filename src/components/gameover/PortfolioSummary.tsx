import { useState } from 'react';
import { formatMoney, formatMultiple } from '../../engine/types';
import type { Metrics, Business, CarryWaterfall, IntegratedPlatform, IPOState } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { calculateExitValuation } from '../../engine/simulation';

interface PortfolioSummaryProps {
  isFundManagerMode: boolean;
  metrics: Metrics;
  carryWaterfallData: CarryWaterfall | null;
  totalInvestedCapital: number;
  maxRounds: number;
  allBusinesses: Business[];
  integratedPlatforms: IntegratedPlatform[];
  ipoState?: IPOState | null;
  fundName?: string;
}

export function PortfolioSummary({
  isFundManagerMode,
  metrics,
  carryWaterfallData,
  totalInvestedCapital,
  maxRounds,
  allBusinesses,
  integratedPlatforms,
  ipoState,
  fundName: _fundName,
}: PortfolioSummaryProps) {
  const [showBusinesses, setShowBusinesses] = useState(false);

  const activeCount = allBusinesses.filter(b => b.status === 'active').length;
  const soldCount = allBusinesses.filter(b => b.status === 'sold').length;

  return (
    <>
      {/* Metrics Summary */}
      {isFundManagerMode && carryWaterfallData ? (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-4">Fund Performance Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
            <div>
              <p className="text-text-muted text-sm">Capital Deployed</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(totalInvestedCapital)}</p>
              <p className="text-xs text-text-muted">{Math.round(totalInvestedCapital / (carryWaterfallData.returnOfCapital || 1) * 100)}% of {formatMoney(carryWaterfallData.returnOfCapital)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Fund Value Generated</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.grossTotalReturns))}</p>
              <p className="text-xs text-text-muted">Gross MOIC: {carryWaterfallData.grossMoic.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">LP Distributions</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.lpDistributions))}</p>
              <p className="text-xs text-text-muted">DPI: {carryWaterfallData.dpi.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Net IRR</p>
              <p className={`text-xl sm:text-2xl font-bold font-mono ${carryWaterfallData.netIrr >= 0.08 ? 'text-accent' : carryWaterfallData.netIrr < 0 ? 'text-danger' : ''}`}>
                {(carryWaterfallData.netIrr * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-text-muted">Hurdle: 8.0%</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Liquidation Value</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.liquidationProceeds))}</p>
              <p className="text-xs text-text-muted">At fund close</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Management Fees</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.managementFees))}</p>
              <p className="text-xs text-text-muted">2% × {maxRounds} years</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-4">Portfolio Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 text-center">
            <div>
              <p className="text-text-muted text-sm">Total Revenue</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalRevenue)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Final EBITDA <span className="text-xs">({(metrics.avgEbitdaMargin * 100).toFixed(0)}%)</span></p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalEbitda)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Portfolio MOIC</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-accent">{formatMultiple(metrics.portfolioMoic)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Total Distributed</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalDistributions)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Exit Proceeds</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalExitProceeds)}</p>
            </div>
          </div>

          {/* IPO Summary inline */}
          {ipoState?.isPublic && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-text-muted text-sm">IPO Round</p>
                  <p className="text-lg sm:text-xl font-bold font-mono">Year {ipoState.ipoRound}</p>
                </div>
                <div>
                  <p className="text-text-muted text-sm">Final Stock Price</p>
                  <p className="text-lg sm:text-xl font-bold font-mono text-accent">{formatMoney(Math.round(ipoState.stockPrice))}/sh</p>
                </div>
                <div>
                  <p className="text-text-muted text-sm">Market Sentiment</p>
                  <p className={`text-lg sm:text-xl font-bold font-mono ${ipoState.marketSentiment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {ipoState.marketSentiment >= 0 ? '+' : ''}{(ipoState.marketSentiment * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-sm">Shares Outstanding</p>
                  <p className="text-lg sm:text-xl font-bold font-mono">{ipoState.sharesOutstanding.toLocaleString()}</p>
                  <p className="text-xs text-text-muted">Pre-IPO: {ipoState.preIPOShares.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Companies (collapsed by default) */}
      <div className="card mb-6">
        <button
          onClick={() => setShowBusinesses(!showBusinesses)}
          className="w-full min-h-[44px] flex items-center justify-between"
          aria-expanded={showBusinesses}
        >
          <h2 className="text-lg font-bold">{isFundManagerMode ? 'Fund Portfolio' : 'Portfolio Companies'}</h2>
          <span className="text-sm text-text-muted">
            {showBusinesses ? '▼' : '▶'} {activeCount} active{soldCount > 0 ? `, ${soldCount} sold` : ''}
          </span>
        </button>

        {showBusinesses && (
          <>
            <p className="text-xs text-text-muted mt-2 mb-4">{isFundManagerMode ? 'Investment outcomes by portfolio company.' : 'Platforms and standalone companies. Bolt-ons are consolidated into their parent platform.'}</p>
            <div className="space-y-2">
              {allBusinesses.map(business => {
                const sector = SECTORS[business.sectorId];
                const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
                let exitValue: number;
                let exitMultiple: number | null = null;
                if (business.status === 'sold') {
                  exitValue = business.exitPrice || 0;
                } else {
                  const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, integratedPlatforms);
                  exitMultiple = valuation.totalMultiple;
                  exitValue = Math.round(business.ebitda * valuation.totalMultiple);
                }
                const moic = totalInvested > 0 ? exitValue / totalInvested : 0;

                return (
                  <div
                    key={business.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xl shrink-0">{sector.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{business.name}</p>
                        <p className="text-xs text-text-muted">{sector.name}</p>
                      </div>
                    </div>
                    {/* Mobile: compact data */}
                    <div className="flex sm:hidden items-center gap-3 text-right shrink-0">
                      <div>
                        <p className="font-mono tabular-nums text-sm">{formatMoney(exitValue)}</p>
                        <p className={`text-xs font-mono tabular-nums ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : 'text-text-muted'}`}>
                          {formatMultiple(moic)}
                        </p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        business.status === 'active' ? 'bg-accent/20 text-accent' :
                        business.status === 'sold' ? 'bg-blue-500/20 text-blue-400' :
                        business.status === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-danger/20 text-danger'
                      }`}>
                        {business.status === 'active' ? '●' :
                        business.status === 'sold' ? '✓' :
                        business.status === 'merged' ? '⇄' : '✕'}
                      </span>
                    </div>
                    {/* Desktop: full data */}
                    <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                      <div className="w-20">
                        <p className="text-xs text-text-muted">EBITDA</p>
                        <p className="font-mono tabular-nums">{formatMoney(business.ebitda)}</p>
                      </div>
                      <div className="w-24">
                        <p className="text-xs text-text-muted">Est. Exit Value</p>
                        <p className="font-mono tabular-nums font-bold">{formatMoney(exitValue)}</p>
                        {exitMultiple !== null && (
                          <p className="text-xs text-text-muted font-mono tabular-nums">({formatMultiple(exitMultiple)})</p>
                        )}
                      </div>
                      <div className="w-14">
                        <p className="text-xs text-text-muted">MOIC</p>
                        <p className={`font-mono tabular-nums ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : ''}`}>
                          {formatMultiple(moic)}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded w-20 text-center ${
                        business.status === 'active' ? 'bg-accent/20 text-accent' :
                        business.status === 'sold' ? 'bg-blue-500/20 text-blue-400' :
                        business.status === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-danger/20 text-danger'
                      }`}>
                        {business.status === 'active' ? 'Active' :
                         business.status === 'sold' ? 'Sold' :
                         business.status === 'merged' ? 'Merged' :
                         'Wound Down'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
