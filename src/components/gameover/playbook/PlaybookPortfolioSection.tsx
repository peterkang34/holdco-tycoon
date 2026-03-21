import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';

interface PlaybookPortfolioSectionProps {
  portfolio: PlaybookData['portfolio'];
}

const CONSTRUCTION_LABELS: Record<string, string> = {
  standalone: 'Standalone',
  roll_up: 'Roll-Up',
  integrated_platform: 'Integrated Platform',
};

export function PlaybookPortfolioSection({ portfolio }: PlaybookPortfolioSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">04</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Portfolio Construction</span>
      </div>

      {/* Construction badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(portfolio.endingConstruction)
          .filter(([, count]) => count > 0)
          .map(([type, count]) => (
            <span
              key={type}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-text-secondary border border-white/10"
            >
              {count} {CONSTRUCTION_LABELS[type] ?? type}
            </span>
          ))}
        {Object.values(portfolio.endingConstruction).every((c) => c === 0) && (
          <span className="text-xs text-text-muted">No active businesses at game end.</span>
        )}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Total Acquisitions</p>
          <p className="text-lg font-bold font-mono">{portfolio.totalAcquisitions}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Total Exits</p>
          <p className="text-lg font-bold font-mono">{portfolio.totalSells}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Platforms Forged</p>
          <p className="text-lg font-bold font-mono">{portfolio.platformsForged}</p>
        </div>
      </div>

      {/* Permanent capital signal */}
      {portfolio.neverSoldCount > 0 && (
        <div className="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/10 mb-4">
          <p className="text-xs text-emerald-400 font-medium">
            {portfolio.neverSoldCount} business{portfolio.neverSoldCount !== 1 ? 'es' : ''} never sold
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Permanent capital philosophy — held from acquisition through game end.
          </p>
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
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Tuck-Ins</p>
            <p className="text-sm font-mono">{portfolio.tuckInCount}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Active Platforms</p>
            <p className="text-sm font-mono">{portfolio.platformCount}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Peak Active</p>
            <p className="text-sm font-mono">{portfolio.peakActiveCount}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Avg Hold Years</p>
            <p className="text-sm font-mono">{portfolio.avgHoldYears.toFixed(1)}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Avg Acq Quality</p>
            <p className="text-sm font-mono">Q{portfolio.avgAcquisitionQuality.toFixed(1)}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Ownership</p>
            <p className="text-sm font-mono">{(portfolio.ownershipPercentage * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
