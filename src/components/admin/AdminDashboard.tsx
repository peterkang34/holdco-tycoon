import { useState, useEffect, useMemo } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminBarChart } from './AdminBarChart';
import { FeedbackTab } from './FeedbackTab';
import { CommunityTab } from './CommunityTab';
import { OverviewTab } from './OverviewTab';
import { BalanceTab } from './BalanceTab';
import { MiniTrend, SectionHeader, HorizontalBar, DonutChart, FunnelStep } from './adminShared';
import { MetricCard } from '../ui/MetricCard';
import { SECTORS } from '../../data/sectors';
import type { AnalyticsData, Totals, DayData } from './adminTypes';

// ── Tab Configuration ────────────────────────────────────────

type TabId = 'overview' | 'funnel' | 'retention' | 'engagement' | 'balance' | 'challenge' | 'devices' | 'feedback' | 'community' | 'bschool';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'retention', label: 'Retention' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'balance', label: 'Strategy & Balance' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'devices', label: 'Devices' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'community', label: 'Community' },
  { id: 'bschool', label: 'B-School' },
];

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
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem('admin_token'));
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    const headers = { Authorization: `Bearer ${token}` };
    const handleUnauth = () => { sessionStorage.removeItem('admin_token'); setToken(null); };

    Promise.all([
      fetch('/api/admin/analytics', { headers }).then(res => {
        if (res.status === 401) { handleUnauth(); throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      }),
      fetch('/api/admin/analytics-daily', { headers }).then(res => {
        if (!res.ok) return { days: [] };
        return res.json();
      }),
    ])
      .then(([analytics, daily]) => {
        setData(analytics);
        setDailyData(daily.days || []);
      })
      .catch((err) => {
        if (err.message !== 'Unauthorized') {
          setError(err.message || 'Failed to load analytics');
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // ── Aggregation hooks (must be before early returns) ──

  const totals: Totals = useMemo(() => {
    if (!data) return {
      allConfig: EMPTY_RECORD, allSectors: EMPTY_RECORD, allGrades: EMPTY_RECORD,
      allFev: EMPTY_RECORD, allAbandon: EMPTY_RECORD, allRounds: EMPTY_RECORD,
      allDevice: EMPTY_RECORD, allDeviceComplete: EMPTY_RECORD, allDeviceAbandon: EMPTY_RECORD,
      allReturning: EMPTY_RECORD, allDuration: EMPTY_RECORD, allFeatures: EMPTY_RECORD,
      allChoices: EMPTY_RECORD, allArchetypes: EMPTY_RECORD, allAntiPatterns: EMPTY_RECORD,
      allSophistication: EMPTY_RECORD, allStructures: EMPTY_RECORD,
      allEndingSubTypes: EMPTY_RECORD, allEndingConstruction: EMPTY_RECORD, avgEndingEbitda: 0,
      allScoreDimSums: EMPTY_RECORD, allScoreDimCounts: EMPTY_RECORD,
      allAntiPatternByGrade: EMPTY_RECORD, allArchetypeByGrade: EMPTY_RECORD,
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
    // New Phase 1 aggregates
    const allScoreDimSums: Record<string, number> = {};
    const allScoreDimCounts: Record<string, number> = {};
    const allAntiPatternByGrade: Record<string, number> = {};
    const allArchetypeByGrade: Record<string, number> = {};
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
      // New Phase 1 counters
      if (m.scoreDimSums) merge(allScoreDimSums, m.scoreDimSums);
      if (m.scoreDimCounts) merge(allScoreDimCounts, m.scoreDimCounts);
      if (m.antiPatternByGrade) merge(allAntiPatternByGrade, m.antiPatternByGrade);
      if (m.archetypeByGrade) merge(allArchetypeByGrade, m.archetypeByGrade);
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
      '0-5000': 2500, '5000-10000': 7500, '10000-20000': 15000,
      '20000-50000': 35000, '50000-100000': 75000,
      '100000+': 150000,
      '100000-200000': 150000, '200000-500000': 350000, '500000+': 750000,
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

    const totalDeviceStarts = Object.values(allDevice).reduce((s, v) => s + v, 0);
    const mobileSharePct = totalDeviceStarts > 0
      ? (((allDevice['mobile'] || 0) / totalDeviceStarts) * 100).toFixed(0) + '%'
      : '0%';

    const durationMidpoints: Record<string, number> = { '<5m': 2.5, '5-15m': 10, '15-30m': 22.5, '30-60m': 45, '60m+': 75 };
    let durSum = 0, durCount = 0;
    for (const [bucket, count] of Object.entries(allDuration)) {
      durSum += (durationMidpoints[bucket] || 0) * count;
      durCount += count;
    }
    const avgSessionDuration = durCount > 0 ? `${Math.round(durSum / durCount)}m` : '—';

    const newPlayers = allReturning['new'] || 0;
    const returningPlayers = allReturning['returning'] || 0;
    const newVsReturning = (newPlayers + returningPlayers) > 0
      ? `${Math.round(newPlayers / (newPlayers + returningPlayers) * 100)}% new`
      : '—';

    const visitStartRate = totalViews > 0
      ? ((data.allTime.started / totalViews) * 100).toFixed(0) + '%'
      : '—';

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
      allScoreDimSums, allScoreDimCounts, allAntiPatternByGrade, allArchetypeByGrade,
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

  const abandonItems = useMemo(() =>
    Object.entries(totals.allAbandon).map(([round, count]) => ({
      label: `Year ${round}`,
      value: count,
      color: '#ef4444',
    })).sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1])), [totals.allAbandon]);

  const roundItems = useMemo(() =>
    Object.entries(totals.allRounds).map(([round, count]) => ({
      label: `Year ${round}`,
      value: count,
    })).sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1])), [totals.allRounds]);

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
      '0-5000', '5000-10000', '10000-20000', '20000-50000',
      '100000+', '100000-200000', '200000-500000', '500000+',
      '0-10000', '10000-50000', '50000-100000',
      '100000-250000', '250000-500000', '500000-1000000',
      '1000000-2500000', '2500000+',
    ];
    const labels: Record<string, string> = {
      '0-5000': '$0-5M (old)', '5000-10000': '$5-10M (old)', '10000-20000': '$10-20M (old)',
      '20000-50000': '$20-50M (old)', '100000+': '$100M+ (old)',
      '100000-200000': '$100-200M (old)', '200000-500000': '$200-500M (old)', '500000+': '$500M+ (old)',
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

  // ── Derived values ──
  const kFactor = totals.totalChallenge.created > 0 && totals.totalChallenge.joined > 0
    ? ((totals.totalChallenge.joined / totals.totalChallenge.created) * (totals.totalChallenge.started / Math.max(totals.totalChallenge.joined, 1))).toFixed(2)
    : '—';

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
        <OverviewTab data={data} totals={totals} avgSophistication={avgSophistication} kFactor={kFactor} dailyData={dailyData} />
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
            <div className="card p-4">
              <SectionHeader title="Session Duration Distribution" />
              <HorizontalBar
                items={['<5m', '5-15m', '15-30m', '30-60m', '60m+'].map(b => ({
                  label: b,
                  value: totals.allDuration[b] || 0,
                }))}
              />
            </div>

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

            <AdminBarChart title="Sector Popularity" items={sectorItems} />
          </div>

          {Object.keys(totals.allChoices).length > 0 && (
            <div className="card p-4">
              <SectionHeader title="Event Choice Distribution" />
              <HorizontalBar
                items={Object.entries(totals.allChoices)
                  .map(([k, v]) => ({ label: k.replace(/_/g, ' ').replace(':', ' -> '), value: v }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 20)}
              />
            </div>
          )}
        </>
      )}

      {/* ═══════ STRATEGY & BALANCE TAB ═══════ */}
      {activeTab === 'balance' && (
        <BalanceTab data={data} totals={totals} sectorItems={sectorItems} gradeItems={gradeItems} fevItems={fevItems} />
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
      {activeTab === 'feedback' && <FeedbackTab token={token!} />}

      {/* ═══════ COMMUNITY TAB ═══════ */}
      {activeTab === 'community' && <CommunityTab token={token!} />}
      {activeTab === 'bschool' && <BSchoolTab token={token!} />}
    </div>
  );
}

// ── B-School Tab ─────────────────────────────────────────────
function BSchoolTab({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/bschool-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-text-muted text-center py-8">Loading B-School data...</p>;
  if (!stats) return <p className="text-text-muted text-center py-8">No B-School data available yet.</p>;

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Business School Analytics" />

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Total Completions" value={stats.totalCompletions} />
        <MetricCard label="Full Completions (15/15)" value={stats.fullCompletions} />
        <MetricCard label="Completion Rate" value={`${stats.fullCompletionRate}%`} />
        <MetricCard label="Avg Checklist" value={`${stats.avgChecklistCompleted}/15`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Platform Forged" value={stats.platformForgedCount} />
        <MetricCard label="Platform Rate" value={`${stats.platformForgedRate}%`} />
        <MetricCard label="Partial Completions" value={stats.partialCompletions} />
        <MetricCard
          label="Device Split"
          value={Object.entries(stats.deviceBreakdown || {}).map(([d, c]) => `${d}: ${c}`).join(', ') || '--'}
        />
      </div>

      {/* Completions by day chart (simple text for now) */}
      {stats.completionsByDay?.length > 0 && (
        <div>
          <SectionHeader title="Completions by Day (Last 30d)" />
          <div className="grid grid-cols-7 gap-1">
            {stats.completionsByDay.map((d: any) => (
              <div key={d.date} className="text-center">
                <div className="text-[9px] text-text-muted">{d.date.slice(5)}</div>
                <div className="text-sm font-mono text-text-primary">{d.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent completions */}
      {stats.recentCompletions?.length > 0 && (
        <div>
          <SectionHeader title="Recent Completions" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-2 text-left text-text-muted font-medium">Holdco</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">Checklist</th>
                  <th className="py-2 px-2 text-center text-text-muted font-medium">Platform</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">FEV</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">Device</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCompletions.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 px-2 text-text-primary">{c.holdcoName}</td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">
                      <span className={c.checklistCompleted >= c.checklistTotal ? 'text-emerald-400' : ''}>
                        {c.checklistCompleted}/{c.checklistTotal}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">{c.platformForged ? '✓' : '--'}</td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">
                      {c.founderEquityValue >= 1000 ? `$${(c.founderEquityValue / 1000).toFixed(1)}M` : `$${c.founderEquityValue}K`}
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted">{c.device || '--'}</td>
                    <td className="py-2 px-2 text-right text-text-muted">{formatDate(c.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
