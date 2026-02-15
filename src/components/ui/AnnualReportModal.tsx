import { useState } from 'react';
import { RoundHistoryEntry, formatMoney, formatPercent, formatMultiple } from '../../engine/types';

interface AnnualReportModalProps {
  roundHistory: RoundHistoryEntry[];
  onClose: () => void;
}

function actionTypeSummary(type: string): string {
  switch (type) {
    case 'acquire': return 'Acquisition';
    case 'acquire_tuck_in': return 'Tuck-In';
    case 'merge_businesses': return 'Merger';
    case 'designate_platform': return 'Platform Setup';
    case 'reinvest': return 'Reinvestment';
    case 'improve': return 'Improvement';
    case 'unlock_shared_service': return 'Shared Service';
    case 'deactivate_shared_service': return 'Deactivated SS';
    case 'pay_debt': return 'Debt Paydown';
    case 'issue_equity': return 'Equity Raise';
    case 'buyback': return 'Buyback';
    case 'distribute': return 'Distribution';
    case 'sell': return 'Sale';

    case 'accept_offer': return 'Accepted Offer';
    case 'decline_offer': return 'Declined Offer';
    case 'source_deals': return 'Sourced Deals';
    default: return type;
  }
}

function MetricDelta({ current, previous, format, inverted }: {
  current: number;
  previous?: number;
  format: (n: number) => string;
  inverted?: boolean;
}) {
  if (previous === undefined) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) return null;
  const positive = inverted ? delta < 0 : delta > 0;
  return (
    <span className={`text-xs ml-1 ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {delta > 0 ? '+' : ''}{format(delta)}
    </span>
  );
}

export function AnnualReportModal({ roundHistory, onClose }: AnnualReportModalProps) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold">Annual Reports</h3>
            <p className="text-text-muted text-sm">Year-by-year performance history</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {roundHistory.length === 0 ? (
          <div className="card text-center text-text-muted py-8">
            <p>No completed years yet.</p>
            <p className="text-sm mt-2">Reports will appear after your first year ends.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...roundHistory].reverse().map((entry, _idx) => {
              const prevEntry = roundHistory.find(e => e.round === entry.round - 1);
              const isExpanded = expandedRound === entry.round;

              // Action breakdown
              const actionCounts: Record<string, number> = {};
              entry.actions.forEach(a => {
                const label = actionTypeSummary(a.type);
                actionCounts[label] = (actionCounts[label] || 0) + 1;
              });

              return (
                <div
                  key={entry.round}
                  className="card hover:border-white/20 transition-colors cursor-pointer"
                  onClick={() => setExpandedRound(isExpanded ? null : entry.round)}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-accent">Year {entry.round}</span>
                      <span className="text-xs text-text-muted">
                        {entry.businessCount} business{entry.businessCount !== 1 ? 'es' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Chronicle */}
                  {entry.chronicle && (
                    <p className="text-sm text-text-secondary mb-3 italic leading-relaxed">
                      {entry.chronicle}
                    </p>
                  )}

                  {/* Key metrics row */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4 text-sm">
                    <div>
                      <p className="text-text-muted text-xs">Revenue</p>
                      <p className="font-mono font-bold">
                        {formatMoney(entry.metrics.totalRevenue)}
                        <MetricDelta
                          current={entry.metrics.totalRevenue}
                          previous={prevEntry?.metrics.totalRevenue}
                          format={formatMoney}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">EBITDA <span className="text-text-muted">({(entry.metrics.avgEbitdaMargin * 100).toFixed(0)}%)</span></p>
                      <p className="font-mono font-bold">
                        {formatMoney(entry.metrics.totalEbitda)}
                        <MetricDelta
                          current={entry.metrics.totalEbitda}
                          previous={prevEntry?.metrics.totalEbitda}
                          format={formatMoney}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">Cash</p>
                      <p className="font-mono font-bold">{formatMoney(entry.cash)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">Net FCF</p>
                      <p className={`font-mono font-bold ${entry.metrics.totalFcf < 0 ? 'text-danger' : ''}`}>
                        {formatMoney(entry.metrics.totalFcf)}
                        <MetricDelta
                          current={entry.metrics.totalFcf}
                          previous={prevEntry?.metrics.totalFcf}
                          format={formatMoney}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">Leverage</p>
                      <p className="font-mono font-bold">
                        {entry.metrics.netDebtToEbitda < 0 ? 'Net cash' : formatMultiple(entry.metrics.netDebtToEbitda)}
                        <MetricDelta
                          current={entry.metrics.netDebtToEbitda}
                          previous={prevEntry?.metrics.netDebtToEbitda}
                          format={(n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}x`}
                          inverted
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">FCF/Share</p>
                      <p className="font-mono font-bold">
                        {formatMoney(entry.metrics.fcfPerShare)}
                        <MetricDelta
                          current={entry.metrics.fcfPerShare}
                          previous={prevEntry?.metrics.fcfPerShare}
                          format={formatMoney}
                        />
                      </p>
                    </div>
                  </div>

                  {/* Action summary chips */}
                  {entry.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {Object.entries(actionCounts).map(([label, count]) => (
                        <span key={label} className="text-xs bg-white/10 text-text-secondary px-2 py-0.5 rounded">
                          {count > 1 ? `${count}x ` : ''}{label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Event */}
                  {entry.event && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-text-muted">
                      <span>Event:</span>
                      <span className="text-text-secondary">{entry.event.title}</span>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && entry.actions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-xs text-text-muted font-medium mb-2 uppercase tracking-wide">Actions Taken</p>
                      <div className="space-y-1.5">
                        {entry.actions.map((action, i) => {
                          const d = action.details;
                          const parts: string[] = [];
                          if (d?.price != null) parts.push(formatMoney(d.price as number));
                          if (d?.amount != null) parts.push(formatMoney(d.amount as number));
                          if (d?.improvementType) parts.push(`${d.improvementType}`);
                          if (d?.integrationOutcome) parts.push(`[${d.integrationOutcome}]`);
                          return (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="text-text-muted w-24 text-xs shrink-0">{actionTypeSummary(action.type)}</span>
                              <span className="text-text-secondary text-xs">{parts.join(' ')}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Extended metrics */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mt-4 text-xs">
                        <div>
                          <p className="text-text-muted">ROIC</p>
                          <p className="font-mono">{formatPercent(entry.metrics.portfolioRoic)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Cash Conversion</p>
                          <p className="font-mono">{formatPercent(entry.metrics.cashConversion)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Total Debt</p>
                          <p className="font-mono">{formatMoney(entry.totalDebt)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
