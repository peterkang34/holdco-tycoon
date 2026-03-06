import { useState, useMemo, useRef } from 'react';
import type { DayData, MonthData } from './adminTypes';

type Granularity = 'daily' | 'weekly' | 'monthly';
type SeriesKey = 'started' | 'completed' | 'pageViews' | 'uniquePlayers';

interface SeriesConfig {
  key: SeriesKey;
  label: string;
  color: string;
  fillColor: string;
}

const SERIES: SeriesConfig[] = [
  { key: 'started', label: 'Games Started', color: '#3b82f6', fillColor: 'rgba(59,130,246,0.15)' },
  { key: 'completed', label: 'Completions', color: '#22c55e', fillColor: 'rgba(34,197,94,0.15)' },
  { key: 'uniquePlayers', label: 'Unique Players', color: '#a855f7', fillColor: 'rgba(168,85,247,0.15)' },
];

interface DataPoint {
  label: string;
  started: number;
  completed: number;
  pageViews: number;
  uniquePlayers: number;
}

interface AnalyticsChartProps {
  dailyData: DayData[];
  monthlyData: MonthData[];
}

function aggregateWeekly(daily: DayData[]): DataPoint[] {
  const weekMap = new Map<string, DataPoint>();
  // daily is most-recent-first from API; iterate in chronological order
  const sorted = [...daily].reverse();
  for (const d of sorted) {
    const date = new Date(d.date + 'T00:00:00');
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000);
    const weekNum = Math.ceil((dayOfYear + new Date(date.getFullYear(), 0, 1).getDay() + 1) / 7);
    const weekKey = `W${weekNum}`;
    const existing = weekMap.get(weekKey);
    if (existing) {
      existing.started += d.started;
      existing.completed += d.completed;
      existing.pageViews += d.pageViews;
      existing.uniquePlayers += d.uniquePlayers;
    } else {
      weekMap.set(weekKey, {
        label: weekKey,
        started: d.started,
        completed: d.completed,
        pageViews: d.pageViews,
        uniquePlayers: d.uniquePlayers,
      });
    }
  }
  return Array.from(weekMap.values());
}

function toMonthlyPoints(months: MonthData[]): DataPoint[] {
  return [...months].reverse().map(m => {
    const [, mm] = m.month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      label: monthNames[parseInt(mm, 10) - 1] || m.month,
      started: m.started,
      completed: m.completed,
      pageViews: m.pageViews,
      uniquePlayers: m.uniquePlayers,
    };
  });
}

function toDailyPoints(daily: DayData[]): DataPoint[] {
  return [...daily].reverse().map(d => {
    const date = new Date(d.date + 'T00:00:00');
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { label, ...d };
  });
}

export function AnalyticsChart({ dailyData, monthlyData }: AnalyticsChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo<DataPoint[]>(() => {
    switch (granularity) {
      case 'daily': return toDailyPoints(dailyData);
      case 'weekly': return aggregateWeekly(dailyData);
      case 'monthly': return toMonthlyPoints(monthlyData);
    }
  }, [granularity, dailyData, monthlyData]);

  const activeSeries = useMemo(() =>
    SERIES.filter(s => !hiddenSeries.has(s.key)),
  [hiddenSeries]);

  const toggleSeries = (key: SeriesKey) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Chart dimensions
  const W = 700, H = 220;
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Compute max across all visible series
  const maxVal = useMemo(() => {
    let max = 0;
    for (const pt of data) {
      for (const s of activeSeries) {
        max = Math.max(max, pt[s.key]);
      }
    }
    return max || 1;
  }, [data, activeSeries]);

  // Nice Y-axis ticks
  const yTicks = useMemo(() => {
    const step = maxVal <= 5 ? 1 : maxVal <= 20 ? 5 : maxVal <= 100 ? 20 : maxVal <= 500 ? 100 : Math.ceil(maxVal / 5 / 100) * 100;
    const ticks: number[] = [];
    for (let v = 0; v <= maxVal; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }, [maxVal]);

  const yMax = yTicks[yTicks.length - 1] || 1;

  // X positions
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;
  const getX = (i: number) => PAD.left + (data.length > 1 ? i * xStep : chartW / 2);
  const getY = (val: number) => PAD.top + chartH - (val / yMax) * chartH;

  // Build SVG paths
  const buildLinePath = (key: SeriesKey) => {
    return data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(pt[key]).toFixed(1)}`).join(' ');
  };

  const buildAreaPath = (key: SeriesKey) => {
    const baseline = PAD.top + chartH;
    const line = data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(pt[key]).toFixed(1)}`).join(' ');
    return `${line} L${getX(data.length - 1).toFixed(1)},${baseline} L${getX(0).toFixed(1)},${baseline} Z`;
  };

  // X-axis label thinning
  const maxLabels = granularity === 'daily' ? 10 : granularity === 'weekly' ? 8 : 6;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD.left;
    if (relX < -10 || relX > chartW + 10) { setHoverIndex(null); return; }
    const idx = data.length > 1 ? Math.round(relX / xStep) : 0;
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div className="card p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">Trends</h3>
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                granularity === g
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary text-text-muted hover:text-text-primary'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2">
        {SERIES.map(s => (
          <button
            key={s.key}
            onClick={() => toggleSeries(s.key)}
            className={`flex items-center gap-1.5 text-[11px] transition-opacity ${hiddenSeries.has(s.key) ? 'opacity-30' : 'opacity-100'}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-text-secondary">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-text-muted text-xs">
          No data available
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Gridlines */}
            {yTicks.map(v => (
              <line
                key={v}
                x1={PAD.left}
                y1={getY(v)}
                x2={W - PAD.right}
                y2={getY(v)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                opacity={0.4}
              />
            ))}

            {/* Y-axis labels */}
            {yTicks.map(v => (
              <text
                key={v}
                x={PAD.left - 6}
                y={getY(v) + 3}
                textAnchor="end"
                className="fill-text-muted"
                fontSize={9}
              >
                {v}
              </text>
            ))}

            {/* X-axis labels */}
            {data.map((pt, i) => {
              if (i % labelStep !== 0 && i !== data.length - 1) return null;
              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-text-muted"
                  fontSize={9}
                >
                  {pt.label}
                </text>
              );
            })}

            {/* Area fills */}
            {activeSeries.map(s => (
              <path
                key={`area-${s.key}`}
                d={buildAreaPath(s.key)}
                fill={s.fillColor}
              />
            ))}

            {/* Lines */}
            {activeSeries.map(s => (
              <path
                key={`line-${s.key}`}
                d={buildLinePath(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ))}

            {/* Hover indicator */}
            {hoverIndex !== null && (
              <>
                <line
                  x1={getX(hoverIndex)}
                  y1={PAD.top}
                  x2={getX(hoverIndex)}
                  y2={PAD.top + chartH}
                  stroke="currentColor"
                  className="text-text-muted"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
                {activeSeries.map(s => (
                  <circle
                    key={`dot-${s.key}`}
                    cx={getX(hoverIndex)}
                    cy={getY(data[hoverIndex][s.key])}
                    r={3.5}
                    fill={s.color}
                    stroke="var(--color-bg-primary)"
                    strokeWidth={1.5}
                  />
                ))}
              </>
            )}
          </svg>

          {/* Tooltip */}
          {hoverIndex !== null && (
            <div
              className="absolute pointer-events-none bg-bg-secondary border border-border rounded px-2.5 py-1.5 shadow-lg z-10"
              style={{
                left: `${(getX(hoverIndex) / W) * 100}%`,
                top: '8px',
                transform: getX(hoverIndex) > W * 0.7 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              <p className="text-[10px] text-text-muted mb-1 font-medium">{data[hoverIndex].label}</p>
              {SERIES.filter(s => !hiddenSeries.has(s.key)).map(s => (
                <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-text-muted">{s.label}:</span>
                  <span className="text-text-primary font-mono font-medium">{data[hoverIndex][s.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
