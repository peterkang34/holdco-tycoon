import { useState, useEffect, useMemo } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminBarChart } from './AdminBarChart';
import { MetricCard } from '../ui/MetricCard';
import { getGradeColor } from '../../utils/gradeColors';
import { SECTORS } from '../../data/sectors';
import { formatMoney } from '../../engine/types';
import { DIFFICULTY_CONFIG } from '../../data/gameConfig';

// ── Types ────────────────────────────────────────────────────────

interface ChallengeMetrics {
  created: number;
  shared: number;
  joined: number;
  started: number;
  completed: number;
  scoreboardViews: number;
}

interface MonthData {
  month: string;
  started: number;
  completed: number;
  uniquePlayers: number;
  configBreakdown: Record<string, number>;
  sectorBreakdown: Record<string, number>;
  roundDistribution: Record<string, number>;
  gradeDistribution: Record<string, number>;
  fevDistribution: Record<string, number>;
  abandonByRound: Record<string, number>;
  deviceBreakdown: Record<string, number>;
  deviceComplete: Record<string, number>;
  deviceAbandon: Record<string, number>;
  returningBreakdown: Record<string, number>;
  durationDistribution: Record<string, number>;
  pageViews: number;
  viewsByDevice: Record<string, number>;
  startByNth: Record<string, number>;
  completeByNth: Record<string, number>;
  archetypeDistribution: Record<string, number>;
  antiPatternDistribution: Record<string, number>;
  sophisticationDistribution: Record<string, number>;
  dealStructureDistribution: Record<string, number>;
  platformsForgedDistribution: Record<string, number>;
  endingSubTypes: Record<string, number>;
  endingEbitdaSum: number;
  endingEbitdaCount: number;
  endingConstruction: Record<string, number>;
  challengeMetrics: ChallengeMetrics;
  featureAdoption: Record<string, number>;
  eventChoices: Record<string, number>;
}

interface CohortRow {
  cohortWeek: string;
  weekData: Record<string, number>;
}

interface LeaderboardEntry {
  holdcoName: string;
  initials: string;
  founderEquityValue: number;
  grade: string;
  difficulty: string;
  duration?: string;
  businessCount?: number;
  score?: number;
  date: string;
}

interface AnalyticsData {
  allTime: { started: number; completed: number };
  months: MonthData[];
  leaderboardEntries: LeaderboardEntry[];
  cohortRetention: CohortRow[];
}

type TabId = 'overview' | 'funnel' | 'retention' | 'engagement' | 'balance' | 'challenge' | 'devices' | 'feedback';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'retention', label: 'Retention' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'balance', label: 'Balance' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'devices', label: 'Devices' },
  { id: 'feedback', label: 'Feedback' },
];

interface FeedbackEntry {
  type: 'bug' | 'feature' | 'other';
  message: string;
  email?: string;
  context: {
    screen?: string;
    round?: number;
    difficulty?: string;
    duration?: string;
    holdcoName?: string;
    device?: string;
    playerId?: string;
  };
  date: string;
}

interface FeedbackData {
  entries: FeedbackEntry[];
  counts: { total: number; bug: number; feature: number; other: number };
}

// ── Shared Components ─────────────────────────────────────────

function MiniTrend({ label, data }: { label: string; data: { month: string; value: number }[] }) {
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

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>;
}

function HorizontalBar({ items, colorFn }: { items: { label: string; value: number }[]; colorFn?: (label: string) => string }) {
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

function DonutChart({ items, size = 80 }: { items: { label: string; value: number; color: string }[]; size?: number }) {
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

function FunnelStep({ label, value, maxValue, color = 'var(--color-accent)' }: { label: string; value: number; maxValue: number; color?: string }) {
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

// ── Health Alerts ─────────────────────────────────────────────

function HealthAlerts({ data }: { data: AnalyticsData }) {
  const alerts: { level: 'warning' | 'danger'; message: string }[] = [];
  const months = data.months;

  // Ghost town: weekly uniques dropped >30%
  if (months.length >= 2 && months[1].uniquePlayers > 0) {
    const dropPct = ((months[1].uniquePlayers - months[0].uniquePlayers) / months[1].uniquePlayers) * 100;
    if (dropPct > 30) {
      alerts.push({ level: 'warning', message: `Unique players dropped ${dropPct.toFixed(0)}% vs last month` });
    }
  }

  // Low completion rate
  const currentMonth = months[0];
  if (currentMonth && currentMonth.started > 10) {
    const completionRate = currentMonth.completed / currentMonth.started;
    if (completionRate < 0.4) {
      alerts.push({ level: 'warning', message: `Completion rate is ${(completionRate * 100).toFixed(0)}% — below 40% threshold` });
    }
  }

  // Mobile divergence
  if (currentMonth) {
    const mobileStarts = currentMonth.deviceBreakdown['mobile'] || 0;
    const mobileCompletes = currentMonth.deviceComplete['mobile'] || 0;
    const desktopStarts = currentMonth.deviceBreakdown['desktop'] || 0;
    const desktopCompletes = currentMonth.deviceComplete['desktop'] || 0;
    if (mobileStarts > 5 && desktopStarts > 5) {
      const mobileRate = mobileCompletes / mobileStarts;
      const desktopRate = desktopCompletes / desktopStarts;
      const diff = Math.abs(mobileRate - desktopRate) * 100;
      if (diff > 20) {
        alerts.push({ level: 'warning', message: `Mobile/desktop completion rate differs by ${diff.toFixed(0)}ppt` });
      }
    }
  }

  // Dominant strategy
  if (currentMonth) {
    const archetypes = currentMonth.archetypeDistribution;
    const total = Object.values(archetypes).reduce((s, v) => s + v, 0);
    if (total > 10) {
      const topPct = Math.max(...Object.values(archetypes)) / total;
      if (topPct > 0.6) {
        const topArchetype = Object.entries(archetypes).sort((a, b) => b[1] - a[1])[0]?.[0];
        alerts.push({ level: 'danger', message: `"${topArchetype}" is ${(topPct * 100).toFixed(0)}% of completed games — dominant strategy` });
      }
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {alerts.map((alert, i) => (
        <div key={i} className={`px-3 py-2 rounded text-xs ${alert.level === 'danger' ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
          {alert.message}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

const EMPTY_RECORD: Record<string, number> = {};

export function AdminDashboard() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('admin_token'));
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem('admin_token'));
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'bug' | 'feature' | 'other'>('all');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    fetch('/api/admin/analytics', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.status === 401) {
          sessionStorage.removeItem('admin_token');
          setToken(null);
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => { setData(d); })
      .catch((err) => {
        if (err.message !== 'Unauthorized') {
          setError(err.message || 'Failed to load analytics');
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Lazy-fetch feedback data only when tab first clicked
  useEffect(() => {
    if (activeTab !== 'feedback' || feedbackData || feedbackLoading || !token) return;
    setFeedbackLoading(true);
    fetch('/api/admin/feedback', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => setFeedbackData(d))
      .catch(() => {/* swallow — empty state is fine */})
      .finally(() => setFeedbackLoading(false));
  }, [activeTab, feedbackData, feedbackLoading, token]);

  // ── Aggregation hooks (must be before early returns) ──

  const totals = useMemo(() => {
    if (!data) return {
      allConfig: EMPTY_RECORD, allSectors: EMPTY_RECORD, allGrades: EMPTY_RECORD,
      allFev: EMPTY_RECORD, allAbandon: EMPTY_RECORD, allRounds: EMPTY_RECORD,
      allDevice: EMPTY_RECORD, allDeviceComplete: EMPTY_RECORD, allDeviceAbandon: EMPTY_RECORD,
      allReturning: EMPTY_RECORD, allDuration: EMPTY_RECORD, allFeatures: EMPTY_RECORD,
      allChoices: EMPTY_RECORD, allArchetypes: EMPTY_RECORD, allAntiPatterns: EMPTY_RECORD,
      allSophistication: EMPTY_RECORD, allStructures: EMPTY_RECORD,
      allEndingSubTypes: EMPTY_RECORD, allEndingConstruction: EMPTY_RECORD, avgEndingEbitda: 0,
      totalUnique: 0, totalViews: 0, completionRate: '0%', avgFev: 0, topFev: 0,
      normalPct: '0%', quickPct: '0%', mobileSharePct: '0%',
      totalChallenge: { created: 0, shared: 0, joined: 0, started: 0, completed: 0, scoreboardViews: 0 },
      avgSessionDuration: '—', newVsReturning: '—', visitStartRate: '—', secondGameRate: '—',
    };

    const allConfig: Record<string, number> = {};
    const allSectors: Record<string, number> = {};
    const allGrades: Record<string, number> = {};
    const allFev: Record<string, number> = {};
    const allAbandon: Record<string, number> = {};
    const allRounds: Record<string, number> = {};
    const allDevice: Record<string, number> = {};
    const allDeviceComplete: Record<string, number> = {};
    const allDeviceAbandon: Record<string, number> = {};
    const allReturning: Record<string, number> = {};
    const allDuration: Record<string, number> = {};
    const allFeatures: Record<string, number> = {};
    const allChoices: Record<string, number> = {};
    const allArchetypes: Record<string, number> = {};
    const allAntiPatterns: Record<string, number> = {};
    const allSophistication: Record<string, number> = {};
    const allStructures: Record<string, number> = {};
    const allEndingSubTypes: Record<string, number> = {};
    const allEndingConstruction: Record<string, number> = {};
    let totalUnique = 0;
    let totalViews = 0;
    let ebitdaTotalSum = 0;
    let ebitdaTotalCount = 0;
    const totalChallenge = { created: 0, shared: 0, joined: 0, started: 0, completed: 0, scoreboardViews: 0 };

    const merge = (target: Record<string, number>, source: Record<string, number>) => {
      for (const [k, v] of Object.entries(source)) target[k] = (target[k] || 0) + v;
    };

    for (const m of data.months) {
      totalUnique += m.uniquePlayers;
      totalViews += m.pageViews;
      merge(allConfig, m.configBreakdown);
      merge(allSectors, m.sectorBreakdown);
      merge(allGrades, m.gradeDistribution);
      merge(allFev, m.fevDistribution);
      merge(allAbandon, m.abandonByRound);
      merge(allRounds, m.roundDistribution);
      merge(allDevice, m.deviceBreakdown);
      merge(allDeviceComplete, m.deviceComplete);
      merge(allDeviceAbandon, m.deviceAbandon);
      merge(allReturning, m.returningBreakdown);
      merge(allDuration, m.durationDistribution);
      merge(allFeatures, m.featureAdoption);
      merge(allChoices, m.eventChoices);
      merge(allArchetypes, m.archetypeDistribution);
      merge(allAntiPatterns, m.antiPatternDistribution);
      merge(allSophistication, m.sophisticationDistribution);
      merge(allStructures, m.dealStructureDistribution);
      merge(allEndingSubTypes, m.endingSubTypes);
      merge(allEndingConstruction, m.endingConstruction);
      ebitdaTotalSum += m.endingEbitdaSum;
      ebitdaTotalCount += m.endingEbitdaCount;
      totalChallenge.created += m.challengeMetrics.created;
      totalChallenge.shared += m.challengeMetrics.shared;
      totalChallenge.joined += m.challengeMetrics.joined;
      totalChallenge.started += m.challengeMetrics.started;
      totalChallenge.completed += m.challengeMetrics.completed;
      totalChallenge.scoreboardViews += m.challengeMetrics.scoreboardViews;
    }

    const completionRate = data.allTime.started > 0
      ? ((data.allTime.completed / data.allTime.started) * 100).toFixed(1) + '%'
      : '0%';

    const bucketMidpoints: Record<string, number> = {
      // Legacy buckets
      '0-5000': 2500, '5000-10000': 7500, '10000-20000': 15000,
      '20000-50000': 35000, '50000-100000': 75000,
      '100000+': 150000,
      '100000-200000': 150000, '200000-500000': 350000, '500000+': 750000,
      // New wider buckets
      '0-10000': 5000, '10000-50000': 30000,
      '100000-250000': 175000, '250000-500000': 375000,
      '500000-1000000': 750000, '1000000-2500000': 1750000, '2500000+': 3750000,
    };
    let fevSum = 0, fevCount = 0;
    for (const [bucket, count] of Object.entries(allFev)) {
      const mid = bucketMidpoints[bucket] || 0;
      fevSum += mid * count;
      fevCount += count;
    }
    const avgFev = fevCount > 0 ? Math.round(fevSum / fevCount) : 0;

    const topFev = data.leaderboardEntries.length > 0
      ? Math.max(...data.leaderboardEntries.map(e => e.founderEquityValue))
      : 0;

    const normalCount = (allConfig['normal:standard'] || 0) + (allConfig['normal:quick'] || 0);
    const normalPct = data.allTime.started > 0 ? ((normalCount / data.allTime.started) * 100).toFixed(0) + '%' : '0%';

    const quickCount = (allConfig['easy:quick'] || 0) + (allConfig['normal:quick'] || 0);
    const quickPct = data.allTime.started > 0 ? ((quickCount / data.allTime.started) * 100).toFixed(0) + '%' : '0%';

    // Mobile share
    const totalDeviceStarts = Object.values(allDevice).reduce((s, v) => s + v, 0);
    const mobileSharePct = totalDeviceStarts > 0
      ? (((allDevice['mobile'] || 0) / totalDeviceStarts) * 100).toFixed(0) + '%'
      : '0%';

    // Average session duration
    const durationMidpoints: Record<string, number> = { '<5m': 2.5, '5-15m': 10, '15-30m': 22.5, '30-60m': 45, '60m+': 75 };
    let durSum = 0, durCount = 0;
    for (const [bucket, count] of Object.entries(allDuration)) {
      durSum += (durationMidpoints[bucket] || 0) * count;
      durCount += count;
    }
    const avgSessionDuration = durCount > 0 ? `${Math.round(durSum / durCount)}m` : '—';

    // New vs Returning
    const newPlayers = allReturning['new'] || 0;
    const returningPlayers = allReturning['returning'] || 0;
    const newVsReturning = (newPlayers + returningPlayers) > 0
      ? `${Math.round(newPlayers / (newPlayers + returningPlayers) * 100)}% new`
      : '—';

    // Visit → Start rate
    const visitStartRate = totalViews > 0
      ? ((data.allTime.started / totalViews) * 100).toFixed(0) + '%'
      : '—';

    // Second game rate
    const allStartByNth: Record<string, number> = {};
    for (const m of data.months) merge(allStartByNth, m.startByNth);
    const firstGameStarts = allStartByNth['1'] || 0;
    const secondGameStarts = allStartByNth['2'] || 0;
    const secondGameRate = firstGameStarts > 0
      ? ((secondGameStarts / firstGameStarts) * 100).toFixed(0) + '%'
      : '—';

    const avgEndingEbitda = ebitdaTotalCount > 0 ? Math.round(ebitdaTotalSum / ebitdaTotalCount) : 0;

    return {
      allConfig, allSectors, allGrades, allFev, allAbandon, allRounds,
      allDevice, allDeviceComplete, allDeviceAbandon, allReturning, allDuration,
      allFeatures, allChoices, allArchetypes, allAntiPatterns, allSophistication, allStructures,
      allEndingSubTypes, allEndingConstruction, avgEndingEbitda,
      totalUnique, totalViews, completionRate, avgFev, topFev, normalPct, quickPct,
      mobileSharePct, totalChallenge, avgSessionDuration, newVsReturning, visitStartRate, secondGameRate,
    };
  }, [data]);

  const sectorItems = useMemo(() =>
    Object.entries(totals.allSectors).map(([id, count]) => ({
      label: SECTORS[id]?.name || id,
      value: count,
      color: SECTORS[id]?.color,
      emoji: SECTORS[id]?.emoji,
    })), [totals.allSectors]);

  const roundItems = useMemo(() =>
    Object.entries(totals.allRounds).map(([round, count]) => ({
      label: `Year ${round}`,
      value: count,
    })).sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1])), [totals.allRounds]);

  const abandonItems = useMemo(() =>
    Object.entries(totals.allAbandon).map(([round, count]) => ({
      label: `Year ${round}`,
      value: count,
      color: '#ef4444',
    })).sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1])), [totals.allAbandon]);

  const configItems = useMemo(() =>
    Object.entries(totals.allConfig).map(([key, count]) => {
      const [diff, dur] = key.split(':');
      return {
        label: `${diff === 'normal' ? 'Normal' : 'Easy'} / ${dur === 'quick' ? '10yr' : '20yr'}`,
        value: count,
        color: diff === 'normal' ? '#f59e0b' : 'var(--color-accent)',
      };
    }), [totals.allConfig]);

  const gradeItems = useMemo(() =>
    ['S', 'A', 'B', 'C', 'D', 'F'].map(g => ({
      label: g,
      value: totals.allGrades[g] || 0,
    })), [totals.allGrades]);

  const fevItems = useMemo(() => {
    const order = [
      // Legacy buckets (shown only if data exists)
      '0-5000', '5000-10000', '10000-20000', '20000-50000',
      '100000+', '100000-200000', '200000-500000', '500000+',
      // Current buckets
      '0-10000', '10000-50000', '50000-100000',
      '100000-250000', '250000-500000', '500000-1000000',
      '1000000-2500000', '2500000+',
    ];
    const labels: Record<string, string> = {
      // Legacy
      '0-5000': '$0-5M (old)', '5000-10000': '$5-10M (old)', '10000-20000': '$10-20M (old)',
      '20000-50000': '$20-50M (old)', '100000+': '$100M+ (old)',
      '100000-200000': '$100-200M (old)', '200000-500000': '$200-500M (old)', '500000+': '$500M+ (old)',
      // Current
      '0-10000': '$0-10M', '10000-50000': '$10-50M', '50000-100000': '$50-100M',
      '100000-250000': '$100-250M', '250000-500000': '$250-500M', '500000-1000000': '$500M-1B',
      '1000000-2500000': '$1-2.5B', '2500000+': '$2.5B+',
    };
    return order
      .map(k => ({ label: labels[k] || k, value: totals.allFev[k] || 0 }))
      .filter(item => item.value > 0 || !item.label.includes('(old)'));
  }, [totals.allFev]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    setToken(null);
  };

  // Early returns AFTER all hooks
  if (!token) return <AdminLogin onLogin={(t) => { setLoading(true); setToken(t); }} />;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="text-text-muted animate-pulse">Loading analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="card p-6 text-center">
          <p className="text-danger mb-2">{error || 'No data available'}</p>
          <button onClick={() => { sessionStorage.removeItem('admin_token'); setToken(null); }} className="text-sm text-accent hover:underline">
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  // ── k-factor calculation ──
  const kFactor = totals.totalChallenge.created > 0 && totals.totalChallenge.joined > 0
    ? ((totals.totalChallenge.joined / totals.totalChallenge.created) * (totals.totalChallenge.started / Math.max(totals.totalChallenge.joined, 1))).toFixed(2)
    : '—';

  // ── Avg sophistication ──
  const sophMidpoints: Record<string, number> = { '0-19': 10, '20-39': 30, '40-59': 50, '60-79': 70, '80-100': 90 };
  let sophSum = 0, sophCount = 0;
  for (const [b, c] of Object.entries(totals.allSophistication)) { sophSum += (sophMidpoints[b] || 0) * c; sophCount += c; }
  const avgSophistication = sophCount > 0 ? Math.round(sophSum / sophCount) : 0;

  return (
    <div className="min-h-screen bg-bg-primary p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Holdco Tycoon — Admin</h1>
          <p className="text-xs text-text-muted mt-1">
            Last 6 months &bull; All-time: {data.allTime.started} started, {data.allTime.completed} completed
          </p>
        </div>
        <div className="flex gap-2">
          <a href="#/" className="text-xs text-text-muted hover:text-accent transition-colors">&larr; Game</a>
          <button onClick={handleLogout} className="text-xs text-text-muted hover:text-danger transition-colors">Logout</button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Health Alerts (shown on overview) */}
      {activeTab === 'overview' && <HealthAlerts data={data} />}

      {/* ═══════ OVERVIEW TAB ═══════ */}
      {activeTab === 'overview' && (
        <>
          {/* Hero metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <MetricCard label="Games Started" value={data.allTime.started} />
            <MetricCard label="Completion Rate" value={totals.completionRate} status={parseFloat(totals.completionRate) > 50 ? 'positive' : 'warning'} />
            <MetricCard label="2nd Game Rate" value={totals.secondGameRate} />
            <MetricCard label="Avg Session" value={totals.avgSessionDuration} />
            <MetricCard label="k-factor" value={kFactor} status={Number(kFactor) > 1 ? 'positive' : 'neutral'} />
            <MetricCard label="Mobile Share" value={totals.mobileSharePct} />
            <MetricCard label="Avg Sophistication" value={avgSophistication} />
          </div>

          {/* Trend sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <MiniTrend
              label="Games Started / mo"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.started }))}
            />
            <MiniTrend
              label="Completions / mo"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.completed }))}
            />
            <MiniTrend
              label="Page Views / mo"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.pageViews }))}
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Unique Players" value={totals.totalUnique} />
            <MetricCard label="Avg FEV (est)" value={formatMoney(totals.avgFev)} />
            <MetricCard label="Top FEV" value={formatMoney(totals.topFev)} status="positive" />
            <MetricCard label="Normal Mode" value={totals.normalPct} />
            <MetricCard label="Quick Play" value={totals.quickPct} />
            <MetricCard label="Visit→Start" value={totals.visitStartRate} />
          </div>

          {/* Leaderboard */}
          {data.leaderboardEntries.length > 0 && (
            <div className="card p-4">
              <SectionHeader title="Top Leaderboard Entries" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted border-b border-border">
                      <th className="text-left py-2 pr-3">#</th>
                      <th className="text-left py-2 pr-3">Name</th>
                      <th className="text-right py-2 pr-3">Adj FEV</th>
                      <th className="text-right py-2 pr-3">Raw FEV</th>
                      <th className="text-center py-2 pr-3">Score</th>
                      <th className="text-center py-2 pr-3">Grade</th>
                      <th className="text-center py-2 pr-3">Mode</th>
                      <th className="text-center py-2 pr-3">Biz</th>
                      <th className="text-right py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaderboardEntries.map((entry, i) => {
                      const multiplier = entry.difficulty === 'normal'
                        ? DIFFICULTY_CONFIG.normal.leaderboardMultiplier
                        : DIFFICULTY_CONFIG.easy.leaderboardMultiplier;
                      const adjFev = Math.round(entry.founderEquityValue * multiplier);
                      const durationLabel = entry.duration === 'quick' ? '10' : '20';
                      const diffLabel = entry.difficulty === 'normal' ? 'H' : 'E';
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 text-text-muted font-mono">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-text-primary truncate max-w-[150px]">{entry.holdcoName}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-accent">{formatMoney(adjFev)}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-text-secondary">{formatMoney(entry.founderEquityValue)}</td>
                          <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.score ?? '—'}</td>
                          <td className={`py-1.5 pr-3 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                          <td className="py-1.5 pr-3 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                              {diffLabel}/{durationLabel}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-center font-mono text-text-secondary">{entry.businessCount ?? '—'}</td>
                          <td className="py-1.5 text-right text-text-muted font-mono">{new Date(entry.date).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════ FUNNEL TAB ═══════ */}
      {activeTab === 'funnel' && (
        <>
          <div className="card p-4 mb-4">
            <SectionHeader title="Player Funnel (All Time)" />
            <div className="space-y-2">
              <FunnelStep label="Page Views" value={totals.totalViews} maxValue={totals.totalViews} />
              <FunnelStep label="Games Started" value={data.allTime.started} maxValue={totals.totalViews || data.allTime.started} />
              <FunnelStep label="Reached Year 3" value={Object.entries(totals.allRounds).filter(([r]) => parseInt(r) >= 3).reduce((s, [, v]) => s + v, 0) + Object.entries(totals.allAbandon).filter(([r]) => parseInt(r) >= 3).reduce((s, [, v]) => s + v, 0)} maxValue={data.allTime.started} color="#60a5fa" />
              <FunnelStep label="Reached Year 5" value={Object.entries(totals.allRounds).filter(([r]) => parseInt(r) >= 5).reduce((s, [, v]) => s + v, 0) + Object.entries(totals.allAbandon).filter(([r]) => parseInt(r) >= 5).reduce((s, [, v]) => s + v, 0)} maxValue={data.allTime.started} color="#a78bfa" />
              <FunnelStep label="Completed" value={data.allTime.completed} maxValue={data.allTime.started} color="#34d399" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <AdminBarChart title="Abandonment by Round" items={abandonItems} />
            <div className="card p-4">
              <SectionHeader title="New vs Returning" />
              <DonutChart items={[
                { label: 'New', value: totals.allReturning['new'] || 0, color: 'var(--color-accent)' },
                { label: 'Returning', value: totals.allReturning['returning'] || 0, color: '#f59e0b' },
              ]} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AdminBarChart title="Rounds Reached (Completed Games)" items={roundItems} />
            <AdminBarChart title="Difficulty / Duration" items={configItems} />
          </div>
        </>
      )}

      {/* ═══════ RETENTION TAB ═══════ */}
      {activeTab === 'retention' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <MetricCard label="New vs Returning" value={totals.newVsReturning} />
            <MetricCard label="2nd Game Rate" value={totals.secondGameRate} />
            <MetricCard label="Unique Players" value={totals.totalUnique} />
            <MetricCard label="Avg Session" value={totals.avgSessionDuration} />
          </div>

          {/* Cohort Retention Table */}
          {data.cohortRetention && data.cohortRetention.length > 0 && (
            <div className="card p-4 mb-4 overflow-x-auto">
              <SectionHeader title="Weekly Cohort Retention" />
              <table className="w-full text-[11px] min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-2 text-text-muted">Cohort</th>
                    {data.cohortRetention.map(row => (
                      <th key={row.cohortWeek} className="text-center py-1.5 px-1 text-text-muted">{row.cohortWeek.slice(5)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohortRetention.map(row => {
                    const cohortSize = row.weekData[row.cohortWeek] || 0;
                    return (
                      <tr key={row.cohortWeek} className="border-b border-border/30">
                        <td className="py-1 pr-2 font-mono text-text-secondary">{row.cohortWeek.slice(5)}</td>
                        {data.cohortRetention.map(col => {
                          const active = row.weekData[col.cohortWeek] || 0;
                          const pct = cohortSize > 0 ? (active / cohortSize) * 100 : 0;
                          const bg = pct >= 60 ? 'bg-success/30' : pct >= 30 ? 'bg-warning/20' : pct > 0 ? 'bg-danger/10' : '';
                          return (
                            <td key={col.cohortWeek} className={`text-center py-1 px-1 font-mono ${bg}`}>
                              {active > 0 ? `${active}` : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-text-muted mt-2">Cell values = unique players active in that week from that cohort</p>
            </div>
          )}

          <div className="card p-4">
            <SectionHeader title="New vs Returning (Monthly)" />
            <MiniTrend
              label="Returning Players"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.returningBreakdown['returning'] || 0 }))}
            />
          </div>
        </>
      )}

      {/* ═══════ ENGAGEMENT TAB ═══════ */}
      {activeTab === 'engagement' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Session Duration */}
            <div className="card p-4">
              <SectionHeader title="Session Duration Distribution" />
              <HorizontalBar
                items={['<5m', '5-15m', '15-30m', '30-60m', '60m+'].map(b => ({
                  label: b,
                  value: totals.allDuration[b] || 0,
                }))}
              />
            </div>

            {/* Feature Adoption */}
            <div className="card p-4">
              <SectionHeader title="Feature Adoption (sorted ascending)" />
              <HorizontalBar
                items={Object.entries(totals.allFeatures)
                  .map(([f, v]) => ({ label: f.replace(/_/g, ' '), value: v }))
                  .sort((a, b) => a.value - b.value)}
                colorFn={() => '#60a5fa'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Sophistication */}
            <div className="card p-4">
              <SectionHeader title="Sophistication Score Distribution" />
              <HorizontalBar
                items={['0-19', '20-39', '40-59', '60-79', '80-100'].map(b => ({
                  label: b,
                  value: totals.allSophistication[b] || 0,
                }))}
                colorFn={(l) => l === '80-100' ? '#facc15' : l.startsWith('6') ? '#34d399' : 'var(--color-accent)'}
              />
            </div>

            {/* Sector Popularity */}
            <AdminBarChart title="Sector Popularity" items={sectorItems} />
          </div>

          {/* Event Choices */}
          {Object.keys(totals.allChoices).length > 0 && (
            <div className="card p-4">
              <SectionHeader title="Event Choice Distribution" />
              <HorizontalBar
                items={Object.entries(totals.allChoices)
                  .map(([k, v]) => ({ label: k.replace(/_/g, ' ').replace(':', ' → '), value: v }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 20)}
              />
            </div>
          )}
        </>
      )}

      {/* ═══════ BALANCE TAB ═══════ */}
      {activeTab === 'balance' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Archetype Distribution */}
            <div className="card p-4">
              <SectionHeader title="Strategy Archetype Distribution" />
              <HorizontalBar
                items={Object.entries(totals.allArchetypes)
                  .map(([a, v]) => ({ label: a.replace(/_/g, ' '), value: v }))
                  .sort((a, b) => b.value - a.value)}
                colorFn={() => '#a78bfa'}
              />
            </div>

            {/* Anti-Pattern Prevalence */}
            <div className="card p-4">
              <SectionHeader title="Anti-Pattern Prevalence" />
              <HorizontalBar
                items={Object.entries(totals.allAntiPatterns)
                  .map(([a, v]) => ({ label: a.replace(/_/g, ' '), value: v }))
                  .sort((a, b) => b.value - a.value)}
                colorFn={() => '#ef4444'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Deal Structure Histogram */}
            <div className="card p-4">
              <SectionHeader title="Deal Structure Histogram" />
              <HorizontalBar
                items={Object.entries(totals.allStructures)
                  .map(([s, v]) => ({ label: s.replace(/_/g, ' '), value: v }))
                  .sort((a, b) => b.value - a.value)}
                colorFn={() => '#f59e0b'}
              />
            </div>

            {/* Grade + FEV */}
            <div className="space-y-4">
              <div className="card p-4">
                <SectionHeader title="Grade Distribution" />
                <div className="space-y-2">
                  {gradeItems.map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className={`text-sm font-bold w-6 ${getGradeColor(item.label)}`}>{item.label}</span>
                      <div className="flex-1 h-5 bg-bg-primary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max((item.value / Math.max(...gradeItems.map(g => g.value), 1)) * 100, 2)}%`,
                            backgroundColor: item.label === 'S' ? '#facc15' : item.label === 'A' ? 'var(--color-accent)' : item.label === 'B' ? '#60a5fa' : item.label === 'C' ? '#f59e0b' : item.label === 'D' ? '#f97316' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-text-secondary w-8 text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <AdminBarChart title="FEV Distribution" items={fevItems} />
            </div>
          </div>

          {/* Completion Profile: Ending Businesses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Portfolio Construction */}
            <div className="card p-4 min-w-0">
              <SectionHeader title="Portfolio Construction" />
              {Object.keys(totals.allEndingConstruction).length > 0 ? (
                <>
                  <DonutChart items={[
                    { label: 'Standalone', value: totals.allEndingConstruction['standalone'] || 0, color: 'var(--color-accent)' },
                    { label: 'Roll-Up', value: totals.allEndingConstruction['roll_up'] || 0, color: '#a78bfa' },
                    { label: 'Integrated Platform', value: totals.allEndingConstruction['integrated_platform'] || 0, color: '#facc15' },
                  ].filter(i => i.value > 0)} />
                  <p className="text-[10px] text-text-muted mt-2">Distribution of ending business types across completions</p>
                </>
              ) : <p className="text-xs text-text-muted">No data yet</p>}
            </div>

            {/* Avg Ending Business Size */}
            <div className="card p-4 min-w-0 flex flex-col justify-center">
              <SectionHeader title="Avg Ending Business EBITDA" />
              <div className="text-center py-4">
                <p className="text-3xl font-bold text-accent">{totals.avgEndingEbitda > 0 ? formatMoney(totals.avgEndingEbitda) : '—'}</p>
                <p className="text-xs text-text-muted mt-1">Average EBITDA of active businesses at game end</p>
              </div>
            </div>

            {/* Top Ending Sub-Sectors */}
            <div className="card p-4 min-w-0">
              <SectionHeader title="Top Ending Sub-Sectors" />
              {Object.keys(totals.allEndingSubTypes).length > 0 ? (
                <HorizontalBar
                  items={Object.entries(totals.allEndingSubTypes)
                    .map(([k, v]) => {
                      const parts = k.split(':');
                      const sectorEmoji = SECTORS[parts[0]]?.emoji || '';
                      return { label: `${sectorEmoji} ${(parts[1] || k).replace(/_/g, ' ')}`, value: v };
                    })
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 12)}
                  colorFn={() => '#34d399'}
                />
              ) : <p className="text-xs text-text-muted">No data yet</p>}
            </div>
          </div>
        </>
      )}

      {/* ═══════ CHALLENGE TAB ═══════ */}
      {activeTab === 'challenge' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <MetricCard label="Created" value={totals.totalChallenge.created} />
            <MetricCard label="Shared" value={totals.totalChallenge.shared} />
            <MetricCard label="Joined" value={totals.totalChallenge.joined} />
            <MetricCard label="Started" value={totals.totalChallenge.started} />
            <MetricCard label="Completed" value={totals.totalChallenge.completed} />
            <MetricCard label="k-factor" value={kFactor} status={Number(kFactor) > 1 ? 'positive' : 'neutral'} />
          </div>

          {/* Challenge Funnel */}
          <div className="card p-4 mb-4">
            <SectionHeader title="Challenge Viral Funnel" />
            <div className="space-y-2">
              <FunnelStep label="Created" value={totals.totalChallenge.created} maxValue={totals.totalChallenge.created} />
              <FunnelStep label="Shared" value={totals.totalChallenge.shared} maxValue={totals.totalChallenge.created || 1} color="#60a5fa" />
              <FunnelStep label="Joined (page view)" value={totals.totalChallenge.joined} maxValue={totals.totalChallenge.created || 1} color="#a78bfa" />
              <FunnelStep label="Started" value={totals.totalChallenge.started} maxValue={totals.totalChallenge.created || 1} color="#f59e0b" />
              <FunnelStep label="Completed" value={totals.totalChallenge.completed} maxValue={totals.totalChallenge.created || 1} color="#34d399" />
              <FunnelStep label="Scoreboard Views" value={totals.totalChallenge.scoreboardViews} maxValue={totals.totalChallenge.created || 1} color="#facc15" />
            </div>
          </div>

          {/* Monthly Challenge Trends */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MiniTrend
              label="Challenges Created / mo"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.challengeMetrics.created }))}
            />
            <MiniTrend
              label="Challenge Completions / mo"
              data={[...data.months].reverse().map(m => ({ month: m.month, value: m.challengeMetrics.completed }))}
            />
          </div>
        </>
      )}

      {/* ═══════ DEVICES TAB ═══════ */}
      {activeTab === 'devices' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="card p-4">
              <SectionHeader title="Starts by Device" />
              <DonutChart items={[
                { label: 'Desktop', value: totals.allDevice['desktop'] || 0, color: 'var(--color-accent)' },
                { label: 'Mobile', value: totals.allDevice['mobile'] || 0, color: '#f59e0b' },
                { label: 'Tablet', value: totals.allDevice['tablet'] || 0, color: '#a78bfa' },
              ]} />
            </div>
            <div className="card p-4">
              <SectionHeader title="Completions by Device" />
              <DonutChart items={[
                { label: 'Desktop', value: totals.allDeviceComplete['desktop'] || 0, color: 'var(--color-accent)' },
                { label: 'Mobile', value: totals.allDeviceComplete['mobile'] || 0, color: '#f59e0b' },
                { label: 'Tablet', value: totals.allDeviceComplete['tablet'] || 0, color: '#a78bfa' },
              ]} />
            </div>
            <div className="card p-4">
              <SectionHeader title="Abandons by Device" />
              <DonutChart items={[
                { label: 'Desktop', value: totals.allDeviceAbandon['desktop'] || 0, color: 'var(--color-accent)' },
                { label: 'Mobile', value: totals.allDeviceAbandon['mobile'] || 0, color: '#f59e0b' },
                { label: 'Tablet', value: totals.allDeviceAbandon['tablet'] || 0, color: '#a78bfa' },
              ]} />
            </div>
          </div>

          {/* Completion rate by device */}
          <div className="card p-4 mb-4">
            <SectionHeader title="Completion Rate by Device" />
            <div className="grid grid-cols-3 gap-4">
              {['desktop', 'mobile', 'tablet'].map(d => {
                const starts = totals.allDevice[d] || 0;
                const completes = totals.allDeviceComplete[d] || 0;
                const rate = starts > 0 ? ((completes / starts) * 100).toFixed(1) + '%' : '—';
                return (
                  <div key={d} className="text-center">
                    <p className="text-2xl font-bold text-text-primary">{rate}</p>
                    <p className="text-xs text-text-muted capitalize">{d}</p>
                    <p className="text-[10px] text-text-muted">{completes}/{starts}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Page views by device */}
          <div className="card p-4">
            <SectionHeader title="Page Views by Device (Monthly)" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['desktop', 'mobile', 'tablet'].map(d => (
                <MiniTrend
                  key={d}
                  label={`${d} views`}
                  data={[...data.months].reverse().map(m => ({ month: m.month, value: m.viewsByDevice[d] || 0 }))}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══════ FEEDBACK TAB ═══════ */}
      {activeTab === 'feedback' && (
        <>
          {feedbackLoading && (
            <div className="text-center text-text-muted py-12">Loading feedback...</div>
          )}
          {!feedbackLoading && feedbackData && (
            <>
              {/* Counts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <MetricCard label="Total" value={feedbackData.counts.total} />
                <MetricCard label="Bugs" value={feedbackData.counts.bug} />
                <MetricCard label="Features" value={feedbackData.counts.feature} />
                <MetricCard label="Other" value={feedbackData.counts.other} />
              </div>

              {/* Filter pills */}
              <div className="flex gap-2 mb-4">
                {(['all', 'bug', 'feature', 'other'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFeedbackFilter(f)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      feedbackFilter === f
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {/* Entries */}
              <div className="space-y-3">
                {feedbackData.entries
                  .filter(e => feedbackFilter === 'all' || e.type === feedbackFilter)
                  .map((entry, i) => (
                    <div key={i} className="card p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          entry.type === 'bug' ? 'bg-danger/20 text-danger' :
                          entry.type === 'feature' ? 'bg-accent/20 text-accent' :
                          'bg-white/10 text-text-secondary'
                        }`}>
                          {entry.type}
                        </span>
                        <span className="text-[10px] text-text-muted shrink-0">
                          {new Date(entry.date).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary whitespace-pre-wrap mb-2">{entry.message}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.context?.screen && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.screen}</span>
                        )}
                        {entry.context?.round != null && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">R{entry.context.round}</span>
                        )}
                        {entry.context?.difficulty && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.difficulty}</span>
                        )}
                        {entry.context?.duration && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.duration}</span>
                        )}
                        {entry.context?.holdcoName && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.holdcoName}</span>
                        )}
                        {entry.context?.device && (
                          <span className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded">{entry.context.device}</span>
                        )}
                        {entry.email && (
                          <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">{entry.email}</span>
                        )}
                      </div>
                    </div>
                  ))}
                {feedbackData.entries.filter(e => feedbackFilter === 'all' || e.type === feedbackFilter).length === 0 && (
                  <div className="text-center text-text-muted py-8 text-sm">No feedback entries yet</div>
                )}
              </div>
            </>
          )}
          {!feedbackLoading && !feedbackData && (
            <div className="text-center text-text-muted py-12">Failed to load feedback</div>
          )}
        </>
      )}
    </div>
  );
}
