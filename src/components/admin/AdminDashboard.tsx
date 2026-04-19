import { useState, useEffect, useMemo } from 'react';
import { AdminLogin } from './AdminLogin';
import { FeedbackTab } from './FeedbackTab';
import { CommunityTab } from './CommunityTab';
import { OverviewTab } from './OverviewTab';
import { SectionHeader } from './adminShared';
import { MetricCard } from '../ui/MetricCard';
import type { AnalyticsData, Totals, DayData } from './adminTypes';

// ── Tab Configuration ────────────────────────────────────────

type TabId = 'overview' | 'community' | 'bschool' | 'feedback';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'community', label: 'Community' },
  { id: 'bschool', label: 'B-School' },
  { id: 'feedback', label: 'Feedback' },
];

// ── Health Alerts ─────────────────────────────────────────────

function HealthAlerts({ data }: { data: AnalyticsData }) {
  const alerts: { level: 'warning' | 'danger'; message: string }[] = [];
  const months = data.months;

  // Ghost town: uniques dropped >30%
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
      allConfig: EMPTY_RECORD, allFev: EMPTY_RECORD, allAbandon: EMPTY_RECORD, allRounds: EMPTY_RECORD,
      allDevice: EMPTY_RECORD, allDeviceComplete: EMPTY_RECORD, allDeviceAbandon: EMPTY_RECORD,
      allReturning: EMPTY_RECORD, allDuration: EMPTY_RECORD, allSophistication: EMPTY_RECORD,
      totalUnique: 0, totalViews: 0, completionRate: '0%', avgFev: 0, topFev: 0,
      normalPct: '0%', quickPct: '0%', mobileSharePct: '0%',
      totalChallenge: { created: 0, shared: 0, joined: 0, started: 0, completed: 0, scoreboardViews: 0 },
      avgSessionDuration: '—', visitStartRate: '—', secondGameRate: '—',
    };

    const allConfig: Record<string, number> = {};
    const allFev: Record<string, number> = {};
    const allAbandon: Record<string, number> = {};
    const allRounds: Record<string, number> = {};
    const allDevice: Record<string, number> = {};
    const allDeviceComplete: Record<string, number> = {};
    const allDeviceAbandon: Record<string, number> = {};
    const allReturning: Record<string, number> = {};
    const allDuration: Record<string, number> = {};
    const allSophistication: Record<string, number> = {};
    let totalUnique = 0;
    let totalViews = 0;
    const totalChallenge = { created: 0, shared: 0, joined: 0, started: 0, completed: 0, scoreboardViews: 0 };

    const merge = (target: Record<string, number>, source: Record<string, number>) => {
      for (const [k, v] of Object.entries(source)) target[k] = (target[k] || 0) + v;
    };

    for (const m of data.months) {
      totalUnique += m.uniquePlayers;
      totalViews += m.pageViews;
      merge(allConfig, m.configBreakdown);
      merge(allFev, m.fevDistribution);
      merge(allAbandon, m.abandonByRound);
      merge(allRounds, m.roundDistribution);
      merge(allDevice, m.deviceBreakdown);
      merge(allDeviceComplete, m.deviceComplete);
      merge(allDeviceAbandon, m.deviceAbandon);
      merge(allReturning, m.returningBreakdown);
      merge(allDuration, m.durationDistribution);
      if (m.sophisticationDistribution) merge(allSophistication, m.sophisticationDistribution);
      if (m.challengeMetrics) {
        totalChallenge.created += m.challengeMetrics.created;
        totalChallenge.shared += m.challengeMetrics.shared;
        totalChallenge.joined += m.challengeMetrics.joined;
        totalChallenge.started += m.challengeMetrics.started;
        totalChallenge.completed += m.challengeMetrics.completed;
        totalChallenge.scoreboardViews += m.challengeMetrics.scoreboardViews;
      }
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
      fevSum += (bucketMidpoints[bucket] || 0) * count;
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

    return {
      allConfig, allFev, allAbandon, allRounds,
      allDevice, allDeviceComplete, allDeviceAbandon, allReturning, allDuration, allSophistication,
      totalUnique, totalViews, completionRate, avgFev, topFev, normalPct, quickPct,
      mobileSharePct, totalChallenge, avgSessionDuration, visitStartRate, secondGameRate,
    };
  }, [data]);

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

      {activeTab === 'overview' && (
        <OverviewTab data={data} totals={totals} avgSophistication={avgSophistication} kFactor={kFactor} dailyData={dailyData} />
      )}
      {activeTab === 'community' && <CommunityTab token={token!} />}
      {activeTab === 'bschool' && <BSchoolTab token={token!} />}
      {activeTab === 'feedback' && <FeedbackTab token={token!} />}
    </div>
  );
}

// ── B-School Tab ─────────────────────────────────────────────
function BSchoolTab({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/bschool-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setStats(data?.error ? null : data))
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
        <MetricCard label="Total Completions" value={stats.totalCompletions ?? 0} />
        <MetricCard label="Full Completions (15/15)" value={stats.fullCompletions ?? 0} />
        <MetricCard label="Completion Rate" value={`${stats.fullCompletionRate ?? 0}%`} />
        <MetricCard label="Avg Checklist" value={`${stats.avgChecklistCompleted ?? 0}/15`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Platform Forged" value={stats.platformForgedCount ?? 0} />
        <MetricCard label="Platform Rate" value={`${stats.platformForgedRate ?? 0}%`} />
        <MetricCard label="Partial Completions" value={stats.partialCompletions ?? 0} />
        <MetricCard
          label="Device Split"
          value={Object.entries(stats.deviceBreakdown || {}).map(([d, c]) => `${d}: ${c}`).join(', ') || '--'}
        />
      </div>

      {/* Signup Conversion */}
      {stats.signupConversion && (
        <div>
          <SectionHeader title="Signup Conversion (from B-School)" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Logged In at Completion" value={stats.signupConversion.loggedInAtCompletion ?? 0} />
            <MetricCard label="Anonymous at Completion" value={stats.signupConversion.anonymousAtCompletion ?? 0} />
            <MetricCard label="Signup Rate" value={`${stats.signupConversion.conversionRate ?? 0}%`} />
            <MetricCard label="Conversions Tracked" value={stats.conversions?.length ?? 0} status={stats.conversions?.length > 0 ? 'positive' : 'neutral'} />
          </div>
        </div>
      )}

      {/* B-School → Sign-Up Conversions (which session led to whose sign-up) */}
      {stats.conversions?.length > 0 && (
        <div>
          <SectionHeader title="B-School → Sign-Up Conversions" />
          <p className="text-[10px] text-text-muted mb-2">Players who were anonymous during B-School and later created an account</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-2 text-left text-text-muted font-medium">B-School Holdco</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">Checklist</th>
                  <th className="py-2 px-2 text-center text-text-muted font-medium">Platform</th>
                  <th className="py-2 px-2 text-left text-text-muted font-medium">Email</th>
                  <th className="py-2 px-2 text-center text-text-muted font-medium">Provider</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">B-School Date</th>
                  <th className="py-2 px-2 text-right text-text-muted font-medium">Sign-Up Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.conversions.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 px-2 text-text-primary">{c.holdcoName}</td>
                    <td className="py-2 px-2 text-right font-mono text-text-secondary">
                      <span className={c.checklistCompleted >= c.checklistTotal ? 'text-emerald-400' : ''}>
                        {c.checklistCompleted}/{c.checklistTotal}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">{c.platformForged ? '✓' : '--'}</td>
                    <td className="py-2 px-2 text-text-primary font-mono text-xs">{c.email}</td>
                    <td className="py-2 px-2 text-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">{c.provider}</span>
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted">{formatDate(c.bschoolDate)}</td>
                    <td className="py-2 px-2 text-right text-text-muted">{formatDate(c.signupDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* B-School Grad Engagement */}
      {stats.bsGradEngagement && stats.bsGradEngagement.playersWithRealGames > 0 && (
        <div>
          <SectionHeader title="B-School Grad Engagement (Real Games)" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Grads Playing Real Games" value={stats.bsGradEngagement.playersWithRealGames} />
            <MetricCard label="Avg Games Played" value={stats.bsGradEngagement.avgGamesPlayed ?? 0} />
            <MetricCard label="Avg Score" value={stats.bsGradEngagement.avgScore ?? 0} />
            <MetricCard label="Avg Best FEV" value={stats.bsGradEngagement.avgBestFev >= 1000 ? `$${(stats.bsGradEngagement.avgBestFev / 1000).toFixed(1)}M` : `$${stats.bsGradEngagement.avgBestFev ?? 0}K`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <MetricCard label="Score Trend" value={stats.bsGradEngagement.avgScoreTrend != null ? `${stats.bsGradEngagement.avgScoreTrend > 0 ? '+' : ''}${stats.bsGradEngagement.avgScoreTrend}` : '--'} />
            <MetricCard
              label="Grade Distribution"
              value={Object.entries(stats.bsGradEngagement.gradeDistribution || {}).filter(([, v]) => (v as number) > 0).map(([g, c]) => `${g}: ${c}`).join(', ') || '--'}
            />
          </div>
        </div>
      )}

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
                  <th className="py-2 px-2 text-center text-text-muted font-medium">Auth</th>
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
                    <td className="py-2 px-2 text-center">
                      {c.isLoggedIn === true ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">Verified</span>
                      ) : c.isLoggedIn === false ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Anon</span>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
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
