import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';
import { formatMoney } from '../../../engine/types';

interface PlaybookExitsSectionProps {
  exits: PlaybookData['exits'];
}

function moicColor(moic: number): string {
  if (moic >= 2.0) return 'text-emerald-400';
  if (moic >= 1.0) return 'text-text-primary';
  return 'text-red-400';
}

export function PlaybookExitsSection({ exits }: PlaybookExitsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const exitCount = exits.exitedBusinesses.length;
  const best = exitCount > 0
    ? exits.exitedBusinesses.reduce((a, b) => (b.moic > a.moic ? b : a))
    : null;

  // Outcome distribution buckets
  const over2x = exits.exitedBusinesses.filter((e) => e.moic >= 2.0).length;
  const mid = exits.exitedBusinesses.filter((e) => e.moic >= 1.0 && e.moic < 2.0).length;
  const under1x = exits.exitedBusinesses.filter((e) => e.moic < 1.0).length;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">06</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Exit Strategy & Returns</span>
      </div>

      {exitCount > 0 ? (
        <>
          {/* Best exit highlight */}
          {best && (
            <div className="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/10 mb-4">
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Best Exit</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{best.name}</span>
                <span className={`text-sm font-mono font-medium ${moicColor(best.moic)}`}>
                  {best.moic.toFixed(1)}x MOIC
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Acquired for {formatMoney(best.acquisitionPrice)} / exited at {formatMoney(best.exitPrice)} after {best.holdYears}yr
              </p>
            </div>
          )}

          {/* Outcome distribution */}
          <div className="mb-4">
            <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">Outcome Distribution</p>
            <div className="flex items-center gap-2">
              {over2x > 0 && (
                <span className="px-2 py-1 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {over2x} at 2x+
                </span>
              )}
              {mid > 0 && (
                <span className="px-2 py-1 rounded text-xs font-mono bg-white/5 text-text-secondary border border-white/10">
                  {mid} at 1-2x
                </span>
              )}
              {under1x > 0 && (
                <span className="px-2 py-1 rounded text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                  {under1x} below 1x
                </span>
              )}
            </div>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Exit Proceeds</p>
              <p className="text-lg font-bold font-mono">{formatMoney(exits.totalExitProceeds)}</p>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Portfolio MOIC</p>
              <p className={`text-lg font-bold font-mono ${moicColor(exits.portfolioMoic)}`}>
                {exits.portfolioMoic.toFixed(1)}x
              </p>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Blended Multiple</p>
              <p className="text-lg font-bold font-mono">{exits.blendedMultiple.toFixed(1)}x</p>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg p-4 bg-white/[0.02] border border-white/5 mb-4">
          <p className="text-sm text-text-muted">No businesses exited. Permanent hold or early game end.</p>
        </div>
      )}

      {/* Expand toggle */}
      {exitCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      )}

      {/* Tier 3: Per-business exit table */}
      {expanded && exitCount > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">All Exits</p>
          <div className="space-y-2">
            {exits.exitedBusinesses
              .sort((a, b) => b.moic - a.moic)
              .map((biz, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{biz.name}</p>
                    <p className="text-[11px] text-text-muted">{biz.sector}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-mono font-medium ${moicColor(biz.moic)}`}>
                      {biz.moic.toFixed(1)}x
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {formatMoney(biz.acquisitionPrice)} &rarr; {formatMoney(biz.exitPrice)}
                    </p>
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0">{biz.holdYears}yr</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
