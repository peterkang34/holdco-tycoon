import { useState, useEffect, useMemo } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminBarChart } from './AdminBarChart';
import { MetricCard } from '../ui/MetricCard';
import { getGradeColor } from '../../utils/gradeColors';
import { SECTORS } from '../../data/sectors';
import { formatMoney } from '../../engine/types';

// Types matching the API response
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
}

interface AnalyticsData {
  allTime: { started: number; completed: number };
  months: MonthData[];
  leaderboardEntries: Array<{
    holdcoName: string;
    initials: string;
    founderEquityValue: number;
    grade: string;
    difficulty: string;
    date: string;
  }>;
}

const EMPTY_RECORD: Record<string, number> = {};

export function AdminDashboard() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('admin_token'));
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem('admin_token'));
  const [error, setError] = useState('');

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

  // ALL useMemo hooks MUST be called before any early returns (React Rules of Hooks)
  const totals = useMemo(() => {
    if (!data) return {
      allConfig: EMPTY_RECORD, allSectors: EMPTY_RECORD, allGrades: EMPTY_RECORD,
      allFev: EMPTY_RECORD, allAbandon: EMPTY_RECORD, allRounds: EMPTY_RECORD,
      totalUnique: 0, completionRate: '0%', avgFev: 0, normalPct: '0%', quickPct: '0%',
    };

    const allConfig: Record<string, number> = {};
    const allSectors: Record<string, number> = {};
    const allGrades: Record<string, number> = {};
    const allFev: Record<string, number> = {};
    const allAbandon: Record<string, number> = {};
    const allRounds: Record<string, number> = {};
    let totalUnique = 0;

    for (const m of data.months) {
      totalUnique += m.uniquePlayers;
      for (const [k, v] of Object.entries(m.configBreakdown)) allConfig[k] = (allConfig[k] || 0) + v;
      for (const [k, v] of Object.entries(m.sectorBreakdown)) allSectors[k] = (allSectors[k] || 0) + v;
      for (const [k, v] of Object.entries(m.gradeDistribution)) allGrades[k] = (allGrades[k] || 0) + v;
      for (const [k, v] of Object.entries(m.fevDistribution)) allFev[k] = (allFev[k] || 0) + v;
      for (const [k, v] of Object.entries(m.abandonByRound)) allAbandon[k] = (allAbandon[k] || 0) + v;
      for (const [k, v] of Object.entries(m.roundDistribution)) allRounds[k] = (allRounds[k] || 0) + v;
    }

    const completionRate = data.allTime.started > 0
      ? ((data.allTime.completed / data.allTime.started) * 100).toFixed(1) + '%'
      : '0%';

    const bucketMidpoints: Record<string, number> = {
      '0-5000': 2500, '5000-10000': 7500, '10000-20000': 15000,
      '20000-50000': 35000, '50000-100000': 75000, '100000+': 150000,
    };
    let fevSum = 0, fevCount = 0;
    for (const [bucket, count] of Object.entries(allFev)) {
      const mid = bucketMidpoints[bucket] || 0;
      fevSum += mid * count;
      fevCount += count;
    }
    const avgFev = fevCount > 0 ? Math.round(fevSum / fevCount) : 0;

    const normalCount = (allConfig['normal:standard'] || 0) + (allConfig['normal:quick'] || 0);
    const normalPct = data.allTime.started > 0 ? ((normalCount / data.allTime.started) * 100).toFixed(0) + '%' : '0%';

    const quickCount = (allConfig['easy:quick'] || 0) + (allConfig['normal:quick'] || 0);
    const quickPct = data.allTime.started > 0 ? ((quickCount / data.allTime.started) * 100).toFixed(0) + '%' : '0%';

    return { allConfig, allSectors, allGrades, allFev, allAbandon, allRounds, totalUnique, completionRate, avgFev, normalPct, quickPct };
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
    const order = ['0-5000', '5000-10000', '10000-20000', '20000-50000', '50000-100000', '100000+'];
    const labels: Record<string, string> = {
      '0-5000': '$0-5M', '5000-10000': '$5-10M', '10000-20000': '$10-20M',
      '20000-50000': '$20-50M', '50000-100000': '$50-100M', '100000+': '$100M+',
    };
    return order.map(k => ({
      label: labels[k] || k,
      value: totals.allFev[k] || 0,
    }));
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

  return (
    <div className="min-h-screen bg-bg-primary p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Holdco Tycoon — Admin</h1>
          <p className="text-xs text-text-muted mt-1">
            Last 6 months • All-time: {data.allTime.started} started, {data.allTime.completed} completed
          </p>
        </div>
        <div className="flex gap-2">
          <a href="#/" className="text-xs text-text-muted hover:text-accent transition-colors">← Game</a>
          <button onClick={handleLogout} className="text-xs text-text-muted hover:text-danger transition-colors">Logout</button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Games Started" value={data.allTime.started} />
        <MetricCard label="Completion Rate" value={totals.completionRate} status={parseFloat(totals.completionRate) > 50 ? 'positive' : 'warning'} />
        <MetricCard label="Avg FEV" value={formatMoney(totals.avgFev)} />
        <MetricCard label="Unique Players" value={totals.totalUnique} />
        <MetricCard label="Normal Mode" value={totals.normalPct} />
        <MetricCard label="Quick Play" value={totals.quickPct} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Left column - 60% */}
        <div className="lg:col-span-3 space-y-4">
          <AdminBarChart title="Sector Popularity" items={sectorItems} />
          <AdminBarChart title="Rounds Reached (Completed Games)" items={roundItems} />
          <AdminBarChart title="Abandonment by Round" items={abandonItems} />
        </div>

        {/* Right column - 40% */}
        <div className="lg:col-span-2 space-y-4">
          <AdminBarChart title="Difficulty / Duration" items={configItems} />

          {/* Grade distribution - special colored bar */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-text-secondary mb-3">Grade Distribution</h3>
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

      {/* Recent leaderboard */}
      {data.leaderboardEntries.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Recent Leaderboard Entries (Top 10)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-4">#</th>
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-right py-2 pr-4">FEV</th>
                  <th className="text-center py-2 pr-4">Grade</th>
                  <th className="text-center py-2 pr-4">Mode</th>
                  <th className="text-right py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboardEntries.map((entry, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 text-text-muted font-mono">{i + 1}</td>
                    <td className="py-1.5 pr-4 text-text-primary truncate max-w-[150px]">{entry.holdcoName}</td>
                    <td className="py-1.5 pr-4 text-right font-mono text-accent">{formatMoney(entry.founderEquityValue)}</td>
                    <td className={`py-1.5 pr-4 text-center font-bold ${getGradeColor(entry.grade)}`}>{entry.grade}</td>
                    <td className="py-1.5 pr-4 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-warning/20 text-warning' : 'bg-accent/20 text-accent'}`}>
                        {entry.difficulty === 'normal' ? 'Normal' : 'Easy'}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-text-muted font-mono">{new Date(entry.date).toLocaleDateString()}</td>
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
