/** Shared presentational components used by OverviewTab, BalanceTab, and AdminDashboard */

import type { LeaderboardEntryAdmin } from './adminTypes';
import { DIFFICULTY_CONFIG } from '../../data/gameConfig';

// ── Multiplier Helpers ──

const RESTRUCTURING_PENALTY = 0.80;

/** Compute the true Adjusted FEV including all multipliers (difficulty, restructuring, FO) */
export function computeAdjFev(entry: LeaderboardEntryAdmin): number {
  const diffMult = entry.difficulty === 'normal'
    ? DIFFICULTY_CONFIG.normal.leaderboardMultiplier
    : DIFFICULTY_CONFIG.easy.leaderboardMultiplier;
  const restructMult = entry.hasRestructured ? RESTRUCTURING_PENALTY : 1.0;
  const foMult = (entry.foMultiplier && entry.foMultiplier > 1.0) ? entry.foMultiplier : 1.0;
  return Math.round(entry.founderEquityValue * diffMult * restructMult * foMult);
}

/** Render small pill badges for active multipliers on a leaderboard entry */
export function MultiplierBadges({ entry }: { entry: LeaderboardEntryAdmin }) {
  const badges: { label: string; className: string; title: string }[] = [];

  if (entry.difficulty === 'normal') {
    badges.push({ label: `${DIFFICULTY_CONFIG.normal.leaderboardMultiplier}x`, className: 'bg-warning/20 text-warning', title: 'Hard mode multiplier' });
  } else {
    badges.push({ label: `${DIFFICULTY_CONFIG.easy.leaderboardMultiplier}x`, className: 'bg-blue-500/20 text-blue-400', title: 'Easy mode multiplier' });
  }

  if (entry.foMultiplier && entry.foMultiplier > 1.0) {
    badges.push({ label: `FO ${entry.foMultiplier.toFixed(2)}x`, className: 'bg-purple-500/20 text-purple-400', title: 'Family Office performance multiplier' });
  }

  if (entry.hasRestructured) {
    badges.push({ label: '-20%', className: 'bg-red-500/20 text-red-400', title: 'Restructuring penalty' });
  }

  if (entry.familyOfficeCompleted && !(entry.foMultiplier && entry.foMultiplier > 1.0)) {
    badges.push({ label: 'FO', className: 'bg-purple-500/20 text-purple-400', title: 'Family Office completed (1.0x — no bonus)' });
  }

  return (
    <span className="inline-flex gap-0.5 flex-wrap">
      {badges.map(b => (
        <span key={b.label} className={`text-[9px] px-1 py-0.5 rounded font-mono ${b.className}`} title={b.title}>
          {b.label}
        </span>
      ))}
    </span>
  );
}

// ── MiniTrend ──

export function MiniTrend({ label, data }: { label: string; data: { month: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="card p-3">
      <h4 className="text-xs font-semibold text-text-secondary mb-2">{label}</h4>
      <div className="flex items-end gap-1 h-10">
        {data.map(d => (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm bg-accent/70 transition-all duration-300"
              style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
              title={`${d.month}: ${d.value}`}
            />
            <span className="text-[8px] text-text-muted leading-none">{d.month.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="text-right text-[10px] text-text-muted mt-1">
        Latest: {data[data.length - 1]?.value ?? 0}
      </div>
    </div>
  );
}

// ── SectionHeader ──

export function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>;
}

// ── HorizontalBar ──

export function HorizontalBar({ items, colorFn }: { items: { label: string; value: number }[]; colorFn?: (label: string) => string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[11px] text-text-secondary w-24 truncate text-right" title={item.label}>{item.label}</span>
          <div className="flex-1 h-4 bg-bg-primary rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: colorFn ? colorFn(item.label) : 'var(--color-accent)',
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-text-muted w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── DonutChart ──

export function DonutChart({ items, size = 80 }: { items: { label: string; value: number; color: string }[]; size?: number }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <div className="text-xs text-text-muted">No data</div>;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {items.map((item) => {
          const pct = item.value / total;
          const dashLength = pct * circumference;
          const segment = (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="10"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dashLength;
          return segment;
        })}
      </svg>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[11px] text-text-secondary">{item.label}: {item.value} ({total > 0 ? Math.round(item.value / total * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FunnelStep ──

export function FunnelStep({ label, value, maxValue, color = 'var(--color-accent)' }: { label: string; value: number; maxValue: number; color?: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-secondary w-28 text-right truncate">{label}</span>
      <div className="flex-1 h-6 bg-bg-primary rounded overflow-hidden relative">
        <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-text-primary mix-blend-difference">
          {value} ({pct.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}
