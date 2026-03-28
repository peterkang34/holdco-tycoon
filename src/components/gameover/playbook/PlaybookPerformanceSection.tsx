import { useState } from 'react';
import type { PlaybookData } from '../../../engine/types';
import { formatMoney } from '../../../engine/types';

interface PlaybookPerformanceSectionProps {
  performance: PlaybookData['performance'];
  thesis: PlaybookData['thesis'];
  peFund?: PlaybookData['peFund'];
}

// Pure SVG line chart — no external dependencies
function FEVChart({ data, isPE }: { data: PlaybookData['performance']['metricsTimeline']; isPE: boolean }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length < 2) return null;

  const fevValues = data.map((d) => d.fev);
  const minFev = Math.min(...fevValues);
  const maxFev = Math.max(...fevValues);
  const range = maxFev - minFev || 1;

  // Chart dimensions
  const W = 100; // viewBox width (percentage-based)
  const H = 50;
  const padX = 2;
  const padY = 4;
  const chartW = W - padX * 2;
  const chartH = H - padY * 2;

  // Generate points
  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padY + chartH - ((d.fev - minFev) / range) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${padY + chartH} L ${points[0].x} ${padY + chartH} Z`;

  const fmtAxis = (v: number): string => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}B`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}M`;
    return `$${v.toFixed(0)}K`;
  };

  const hovered = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-48 md:h-56"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="pbFevLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="pbFevArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={padX}
            y1={padY + chartH * (1 - pct)}
            x2={padX + chartW}
            y2={padY + chartH * (1 - pct)}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.2"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#pbFevArea)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="url(#pbFevLine)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover targets (invisible wider hit areas) */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - chartW / (data.length * 2)}
            y={0}
            width={chartW / data.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {/* Hovered dot */}
        {hovered && (
          <circle cx={hovered.x} cy={hovered.y} r="1.2" fill="#10b981" />
        )}
      </svg>

      {/* Y-axis labels */}
      <div className="absolute top-0 left-0 h-full flex flex-col justify-between py-1 pointer-events-none">
        <span className="text-[9px] font-mono text-text-muted/40">{fmtAxis(maxFev)}</span>
        <span className="text-[9px] font-mono text-text-muted/40">{fmtAxis(minFev)}</span>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between px-1 -mt-1">
        <span className="text-[9px] font-mono text-text-muted/40">Y{data[0].round}</span>
        <span className="text-[9px] font-mono text-text-muted/40">Y{data[data.length - 1].round}</span>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute top-2 right-2 bg-bg-primary border border-white/10 rounded-lg p-2 text-xs shadow-xl pointer-events-none">
          <p className="font-bold mb-0.5">Year {hovered.round}</p>
          <p className="font-mono">{isPE ? 'Fund Value' : 'FEV'}: {formatMoney(hovered.fev)}</p>
          <p className="font-mono text-text-muted">EBITDA: {formatMoney(hovered.totalEbitda)}</p>
          {hovered.eventType && (
            <p className="text-amber-400 mt-0.5 capitalize">{hovered.eventType.replace(/_/g, ' ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Score dimension bar (reused for holdco and PE)
function DimensionBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-secondary rounded-full transition-all duration-700"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function PlaybookPerformanceSection({ performance, thesis, peFund }: PlaybookPerformanceSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const isPE = thesis.isFundManager;

  // Holdco score dimensions
  const holdcoDimensions = [
    { key: 'valueCreation', label: 'Value Creation', max: 20 },
    { key: 'fcfShareGrowth', label: 'FCF/Share Growth', max: 20 },
    { key: 'portfolioRoic', label: 'Portfolio ROIC', max: 15 },
    { key: 'capitalDeployment', label: 'Capital Deployment', max: 15 },
    { key: 'balanceSheetHealth', label: 'Balance Sheet Health', max: 15 },
    { key: 'strategicDiscipline', label: 'Strategic Discipline', max: 15 },
  ] as const;

  // PE score dimensions
  const peDimensions = [
    { key: 'returnGeneration', label: 'Return Generation', max: 25 },
    { key: 'capitalEfficiency', label: 'Capital Efficiency', max: 20 },
    { key: 'valueCreation', label: 'Value Creation', max: 15 },
    { key: 'deployment', label: 'Deployment Discipline', max: 15 },
    { key: 'riskManagement', label: 'Risk Management', max: 15 },
    { key: 'lpSatisfaction', label: 'LP Satisfaction', max: 10 },
  ] as const;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-text-muted">07</span>
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs font-bold tracking-widest text-text-muted uppercase">Financial Performance</span>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Total Shareholder Return</p>
          <p className="text-lg font-bold font-mono">{formatMoney(performance.totalShareholderReturn)}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">ROIIC</p>
          <p className="text-lg font-bold font-mono">
            {performance.roiic > 0 ? `${(performance.roiic * 100).toFixed(0)}%` : 'N/A'}
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">FCF Conversion</p>
          <p className="text-lg font-bold font-mono">
            {performance.fcfConversionRate > 0 ? `${(performance.fcfConversionRate * 100).toFixed(0)}%` : 'N/A'}
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-[11px] text-text-muted mb-1 uppercase tracking-wider">Capital Invested</p>
          <p className="text-lg font-bold font-mono">{formatMoney(performance.totalInvestedCapital)}</p>
        </div>
      </div>

      {/* FEV Growth Chart */}
      {performance.metricsTimeline.length > 1 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            {isPE ? 'Fund Value Over Time' : 'FEV Growth'}
          </p>
          <FEVChart data={performance.metricsTimeline} isPE={isPE} />
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </button>

      {/* Tier 3: Score breakdown */}
      {expanded && (
        <div className="mt-4">
          <p className="text-xs font-bold text-text-muted mb-3 uppercase tracking-wider">Score Breakdown</p>
          {isPE && peFund ? (
            // PE dimensions
            peDimensions.map((dim) => (
              <DimensionBar
                key={dim.key}
                label={dim.label}
                value={peFund.peScoreBreakdown[dim.key]}
                max={dim.max}
              />
            ))
          ) : (
            // Holdco dimensions
            holdcoDimensions.map((dim) => (
              <DimensionBar
                key={dim.key}
                label={dim.label}
                value={performance.scoreBreakdown[dim.key]}
                max={dim.max}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
