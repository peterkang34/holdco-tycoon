import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';
import { formatMoney } from '../../../engine/types';
import { getAntiPatternText } from '../../../utils/playbookBuilder';

interface PlaybookCapitalSectionProps {
  capital: PlaybookData['capital'];
}

const LEVERAGE_COLOR: Record<string, string> = {
  safe: 'text-emerald-400',
  moderate: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

function leverageColor(leverage: number): string {
  if (leverage <= 2.0) return LEVERAGE_COLOR.safe;
  if (leverage <= 3.0) return LEVERAGE_COLOR.moderate;
  if (leverage <= 4.0) return LEVERAGE_COLOR.high;
  return LEVERAGE_COLOR.critical;
}

const DISTRESS_LABELS: Record<string, { label: string; color: string }> = {
  comfortable: { label: 'Comfortable', color: 'text-emerald-400' },
  elevated: { label: 'Elevated', color: 'text-amber-400' },
  stressed: { label: 'Stressed', color: 'text-orange-400' },
  breach: { label: 'Breach', color: 'text-red-400' },
};

export function PlaybookCapitalSection({ capital }: PlaybookCapitalSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const totalStructures = Object.values(capital.dealStructureTypes).reduce((a, b) => a + b, 0);
  const maxStructureCount = Math.max(1, ...Object.values(capital.dealStructureTypes));

  const totalReturns = capital.totalDistributions + capital.totalBuybacks;
  const distressInfo = DISTRESS_LABELS[capital.peakDistressLevel] ?? DISTRESS_LABELS.comfortable;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">03</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Capital Structure</span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {/* Peak leverage */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Peak Leverage</p>
          <p className={`text-lg font-bold font-mono ${leverageColor(capital.peakLeverage)}`}>
            {capital.peakLeverage.toFixed(1)}x
          </p>
        </div>

        {/* Ending leverage */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Ending Leverage</p>
          <p className={`text-lg font-bold font-mono ${leverageColor(capital.endingLeverage)}`}>
            {capital.endingLeverage.toFixed(1)}x
          </p>
        </div>

        {/* Capital returns */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Capital Returns</p>
          <p className="text-lg font-bold font-mono">{formatMoney(totalReturns)}</p>
        </div>

        {/* Peak distress */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Peak Distress</p>
          <p className={`text-lg font-bold ${distressInfo.color}`}>{distressInfo.label}</p>
        </div>
      </div>

      {/* Deal structure breakdown */}
      {totalStructures > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Deal Structures</p>
          <div className="space-y-1.5">
            {Object.entries(capital.dealStructureTypes)
              .sort(([, a], [, b]) => b - a)
              .map(([structure, count]) => (
                <div key={structure} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-32 md:w-40 shrink-0 truncate capitalize">
                    {structure.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                    <div
                      className="h-full bg-white/15 rounded"
                      style={{ width: `${(count / maxStructureCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-muted w-6 text-right">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Anti-patterns */}
      {capital.antiPatterns.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Risk Flags</p>
          <div className="space-y-2">
            {capital.antiPatterns.map((pattern) => {
              const text = getAntiPatternText(pattern);
              return (
                <div key={pattern} className="rounded-lg p-3 bg-red-500/5 border border-red-500/10">
                  <p className="text-xs font-medium text-red-400 capitalize mb-1">
                    {pattern.replace(/_/g, ' ')}
                  </p>
                  {text && <p className="text-[11px] text-text-muted leading-relaxed">{text}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </button>

      {/* Tier 3: Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Distribution + buyback breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Distributions</p>
              <p className="text-sm font-mono">{formatMoney(capital.totalDistributions)}</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Buybacks</p>
              <p className="text-sm font-mono">{formatMoney(capital.totalBuybacks)}</p>
            </div>
          </div>

          {/* Structural signals */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Equity Raises</p>
              <p className="text-sm font-mono">{capital.equityRaisesUsed}</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Rollover Equity Deals</p>
              <p className="text-sm font-mono">{capital.rolloverEquityCount}</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Seller Note %</p>
              <p className="text-sm font-mono">{(capital.sellerNotePercentage * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Avg Multiple Paid</p>
              <p className="text-sm font-mono">{capital.avgMultiplePaid.toFixed(1)}x</p>
            </div>
            {capital.holdcoLoanUsed && (
              <div className="bg-white/[0.02] rounded-lg p-2.5">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Holdco Loan</p>
                <p className="text-sm text-amber-400">Used</p>
              </div>
            )}
            {capital.hasRestructured && (
              <div className="bg-red-500/5 rounded-lg p-2.5 border border-red-500/10">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Restructured</p>
                <p className="text-sm text-red-400">Yes</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
