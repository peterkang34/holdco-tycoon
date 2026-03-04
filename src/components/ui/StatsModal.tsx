import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { fetchWithAuth } from '../../lib/supabase';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import SparklineChart from './SparklineChart';

interface GlobalStats {
  total_games: number;
  avg_score: number;
  avg_adjusted_fev: number;
  grade_distribution: Record<string, number>;
}

interface PlayerStats {
  total_games: number;
  avg_score: number;
  best_score: number;
  best_adjusted_fev: number;
  grade_distribution: Record<string, number>;
  archetype_stats: Record<string, { count: number; avgScore: number }>;
  anti_pattern_frequency: Record<string, number>;
  avg_score_by_mode: Record<string, number>;
  global: GlobalStats | null;
}

interface GameHistoryEntry {
  id: string;
  holdco_name: string;
  grade: string;
  score: number;
  adjusted_fev: number;
  difficulty: string;
  duration: string;
  business_count: number;
  completed_at: string;
  strategy?: { archetype?: string };
}

const ARCHETYPE_LABELS: Record<string, string> = {
  platform_builder: 'Platform Builder',
  turnaround_specialist: 'Turnaround Specialist',
  dividend_cow: 'Dividend Cow',
  serial_acquirer: 'Serial Acquirer',
  roll_up_machine: 'Roll-Up Machine',
  focused_operator: 'Focused Operator',
  conglomerate: 'Conglomerate',
  value_investor: 'Value Investor',
  balanced: 'Balanced',
};

const MODE_LABELS: Record<string, string> = {
  easy_standard: 'E/20',
  easy_quick: 'E/10',
  normal_standard: 'H/20',
  normal_quick: 'H/10',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function StatsModal() {
  const { showStatsModal, closeStatsModal, player } = useAuthStore();
  const isLoggedIn = useIsLoggedIn();

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!showStatsModal || !isLoggedIn) return;

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const fetchData = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          fetchWithAuth('/api/player/stats'),
          fetchWithAuth('/api/player/history?limit=20'),
        ]);

        if (cancelled) return;

        if (!statsRes.ok) {
          setErrorMsg(`Stats request failed (${statsRes.status})`);
          setLoading(false);
          return;
        }
        if (!historyRes.ok) {
          setErrorMsg(`History request failed (${historyRes.status})`);
          setLoading(false);
          return;
        }

        const statsData = await statsRes.json();
        const historyData = await historyRes.json();
        if (cancelled) return;

        setStats(statsData);
        setHistory(historyData.games ?? []);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErrorMsg('Session expired — please refresh the page and sign in again');
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [showStatsModal, isLoggedIn]);

  if (!isLoggedIn) return null;

  const memberSince = player?.createdAt
    ? new Date(player.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // Find best/most-common archetype
  const archetypeEntries = stats?.archetype_stats ? Object.entries(stats.archetype_stats) : [];
  const bestArchetype = archetypeEntries.length > 0
    ? archetypeEntries.reduce((best, [key, val]) => val.avgScore > best[1].avgScore ? [key, val] as [string, typeof val] : best)[0]
    : null;
  const mostCommonArchetype = archetypeEntries.length > 0
    ? archetypeEntries.reduce((best, [key, val]) => val.count > best[1].count ? [key, val] as [string, typeof val] : best)[0]
    : null;
  const topAntiPattern = stats?.anti_pattern_frequency
    ? Object.entries(stats.anti_pattern_frequency).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  return (
    <Modal isOpen={showStatsModal} onClose={closeStatsModal} title="My Stats" size="lg">
      {loading && (
        <div className="space-y-4 min-h-[300px]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {errorMsg && (
        <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
          <p className="text-text-muted mb-2">{errorMsg}</p>
          <button onClick={closeStatsModal} className="btn-secondary text-sm">Close</button>
        </div>
      )}

      {!loading && !errorMsg && stats && stats.total_games === 0 && (
        <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
          <span className="text-4xl block mb-3">📊</span>
          <p className="text-text-secondary font-medium mb-1">No games tracked yet</p>
          <p className="text-text-muted text-sm">Complete a game to start building your stats!</p>
        </div>
      )}

      {!loading && !errorMsg && stats && stats.total_games > 0 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/20 text-accent text-lg font-bold flex items-center justify-center">
              {player?.initials?.slice(0, 2) ?? '??'}
            </div>
            <div>
              <p className="font-bold text-lg">{stats.total_games} games played</p>
              <p className="text-text-muted text-sm">Member since {memberSince}</p>
            </div>
          </div>

          {/* Personal Records */}
          <div>
            <h3 className="text-sm font-bold text-text-muted mb-2">Personal Records</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Best FEV</p>
                <p className="font-mono font-bold text-accent">{formatMoney(stats.best_adjusted_fev)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Highest Score</p>
                <p className="font-mono font-bold">{stats.best_score}/100</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Avg Score</p>
                <p className="font-mono font-bold">{stats.avg_score.toFixed(1)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Games</p>
                <p className="font-mono font-bold">{stats.total_games}</p>
              </div>
            </div>
          </div>

          {/* vs Community */}
          {stats.global && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">vs Community</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-xs text-text-muted mb-1">Your Avg Score</p>
                  <p className={`font-mono font-bold ${stats.avg_score >= stats.global.avg_score ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.avg_score >= stats.global.avg_score ? '▲' : '▼'} {stats.avg_score.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">Community: {stats.global.avg_score.toFixed(1)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-xs text-text-muted mb-1">Your Best FEV</p>
                  <p className={`font-mono font-bold ${stats.best_adjusted_fev >= stats.global.avg_adjusted_fev ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.best_adjusted_fev >= stats.global.avg_adjusted_fev ? '▲' : '▼'} {formatMoney(stats.best_adjusted_fev)}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">Community Avg: {formatMoney(stats.global.avg_adjusted_fev)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Profile */}
          {(bestArchetype || mostCommonArchetype || topAntiPattern) && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Strategy Profile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {bestArchetype && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Best Archetype</p>
                    <p className="font-medium text-sm">{ARCHETYPE_LABELS[bestArchetype] ?? bestArchetype}</p>
                  </div>
                )}
                {mostCommonArchetype && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Most Common</p>
                    <p className="font-medium text-sm">{ARCHETYPE_LABELS[mostCommonArchetype] ?? mostCommonArchetype}</p>
                  </div>
                )}
                {topAntiPattern && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Top Anti-Pattern</p>
                    <p className="font-medium text-sm">{topAntiPattern.replace(/_/g, ' ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode Breakdown */}
          {stats.avg_score_by_mode && Object.keys(stats.avg_score_by_mode).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Mode Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(MODE_LABELS).map(([key, label]) => {
                  const avg = stats.avg_score_by_mode[key];
                  return (
                    <div key={key} className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-xs text-text-muted mb-1">{label}</p>
                      {avg != null ? (
                        <p className="font-mono text-sm font-bold">{avg.toFixed(1)} avg</p>
                      ) : (
                        <p className="text-xs text-text-muted">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grade Distribution */}
          {stats.grade_distribution && Object.keys(stats.grade_distribution).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Grade Distribution</h3>
              <div className="flex gap-2">
                {['S', 'A', 'B', 'C', 'D', 'F'].map((grade) => {
                  const count = stats.grade_distribution[grade] ?? 0;
                  return (
                    <div key={grade} className="flex-1 text-center bg-white/5 rounded-lg p-2">
                      <p className={`font-bold text-lg ${getGradeColor(grade as any)}`}>{grade}</p>
                      <p className="text-xs text-text-muted">{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance Trend */}
          {history.length >= 3 ? (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Performance Trend</h3>
              <div className="bg-white/5 rounded-lg p-4">
                <SparklineChart games={[...history].reverse()} />
              </div>
            </div>
          ) : history.length > 0 ? (
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <p className="text-text-muted text-sm">Play {3 - history.length} more game{3 - history.length > 1 ? 's' : ''} to see your trend</p>
            </div>
          ) : null}

          {/* Game History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Recent Games</h3>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {history.map((game) => (
                  <div key={game.id} className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{game.holdco_name}</p>
                      <p className="text-xs text-text-muted">
                        {formatDate(game.completed_at)}
                        {game.strategy?.archetype && <span className="ml-2">{ARCHETYPE_LABELS[game.strategy.archetype] ?? game.strategy.archetype}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className="font-mono text-sm font-bold text-accent">{formatMoney(game.adjusted_fev)}</p>
                      </div>
                      <span className={`font-mono font-bold ${getGradeColor(game.grade as any)}`}>{game.grade}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${game.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                        {game.difficulty === 'normal' ? 'H' : 'E'}{game.duration === 'quick' ? '/10' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
