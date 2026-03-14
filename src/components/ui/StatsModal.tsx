import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Modal } from './Modal';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { fetchWithAuth } from '../../lib/supabase';
import { useToastStore } from '../../hooks/useToast';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import SparklineChart from './SparklineChart';
import { ScoreRadar } from '../admin/ScoreRadar';
import { ACHIEVEMENT_PREVIEW } from '../../data/achievementPreview';
import { getEarnedAchievementIds } from '../../hooks/useUnlocks';

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

interface ScoreBreakdown {
  valueCreation: number;
  fcfShareGrowth: number;
  portfolioRoic: number;
  capitalDeployment: number;
  balanceSheetHealth: number;
  strategicDiscipline: number;
}

interface GameStrategy {
  scoreBreakdown?: ScoreBreakdown;
  archetype?: string;
  sophisticationScore?: number;
  antiPatterns?: string[];
  sectorIds?: string[];
  dealStructureTypes?: Record<string, number>;
  platformsForged?: number;
  totalAcquisitions?: number;
  totalSells?: number;
  totalDistributions?: number;
  totalBuybacks?: number;
  equityRaisesUsed?: number;
  peakLeverage?: number;
  turnaroundsStarted?: number;
  turnaroundsSucceeded?: number;
  turnaroundsFailed?: number;
  isFundManager?: boolean;
  fundName?: string;
  carryEarned?: number;
  netIrr?: number;
  grossMoic?: number;
  earnedAchievementIds?: string[];
}

interface GameHistoryEntry {
  id: string;
  holdco_name: string;
  grade: string;
  score: number;
  adjusted_fev: number;
  founder_equity_value?: number;
  enterprise_value?: number;
  difficulty: string;
  duration: string;
  business_count: number;
  has_restructured?: boolean;
  family_office_completed?: boolean;
  completed_at: string;
  strategy?: GameStrategy;
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
  fund_manager: 'PE',
};

const RADAR_LABELS: Record<string, string> = {
  valueCreation: 'Value',
  fcfShareGrowth: 'FCF/Share',
  portfolioRoic: 'ROIC',
  capitalDeployment: 'Deploy',
  balanceSheetHealth: 'Balance',
  strategicDiscipline: 'Discipline',
};

const RADAR_MAX: Record<string, number> = {
  valueCreation: 20,
  fcfShareGrowth: 20,
  portfolioRoic: 15,
  capitalDeployment: 15,
  balanceSheetHealth: 15,
  strategicDiscipline: 15,
};

const RADAR_DIMENSION_ORDER = ['valueCreation', 'fcfShareGrowth', 'portfolioRoic', 'capitalDeployment', 'balanceSheetHealth', 'strategicDiscipline'];

const PAGE_SIZE = 50;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function GameRow({ game }: { game: GameHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = game.strategy?.scoreBreakdown;

  const radarDimensions = breakdown
    ? RADAR_DIMENSION_ORDER
        .filter(key => key in breakdown)
        .map(key => ({
          label: RADAR_LABELS[key] ?? key,
          value: breakdown[key as keyof ScoreBreakdown],
          max: RADAR_MAX[key] ?? 20,
        }))
    : [];

  const s = game.strategy;

  return (
    <div className="bg-white/5 rounded-lg overflow-hidden">
      {(() => {
        const rowContent = (
          <>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{game.holdco_name}</p>
              <p className="text-xs text-text-muted">
                {formatDate(game.completed_at)}
                {s?.archetype && <span className="ml-2">{ARCHETYPE_LABELS[s.archetype] ?? s.archetype}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-right">
              <div>
                {game.strategy?.isFundManager && game.strategy.carryEarned != null ? (
                  <p className="font-mono text-sm font-bold text-purple-300">{formatMoney(Math.round(game.strategy.carryEarned))}</p>
                ) : (
                  <p className="font-mono text-sm font-bold text-accent">{formatMoney(game.adjusted_fev)}</p>
                )}
              </div>
              <span className={`font-mono font-bold ${getGradeColor(game.grade as any)}`}>{game.grade}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${game.strategy?.isFundManager ? 'bg-purple-500/20 text-purple-400' : game.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                {game.strategy?.isFundManager ? 'PE' : `${game.difficulty === 'normal' ? 'H' : 'E'}${game.duration === 'quick' ? '/10' : ''}`}
              </span>
              {breakdown && (
                <span className={`text-text-muted text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
              )}
            </div>
          </>
        );
        return breakdown ? (
          <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center justify-between p-2.5 w-full text-left cursor-pointer hover:bg-white/[0.03]">
            {rowContent}
          </button>
        ) : (
          <div className="flex items-center justify-between p-2.5">
            {rowContent}
          </div>
        );
      })()}

      {expanded && breakdown && s && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Radar */}
            <div className="flex justify-center sm:justify-start shrink-0">
              <ScoreRadar dimensions={radarDimensions} size={140} />
            </div>

            {/* Details */}
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {game.score > 0 && (
                <div>
                  <span className="text-text-muted">Score</span>
                  <span className="ml-1 font-mono font-bold">{game.score}/100</span>
                </div>
              )}
              {s.sophisticationScore != null && (
                <div>
                  <span className="text-text-muted">Sophistication</span>
                  <span className="ml-1 font-mono">{s.sophisticationScore}</span>
                </div>
              )}
              <div>
                <span className="text-text-muted">Businesses</span>
                <span className="ml-1 font-mono">{game.business_count}</span>
              </div>

              {/* Deal activity */}
              {(s.totalAcquisitions != null || s.totalSells != null) && (
                <>
                  {s.totalAcquisitions != null && (
                    <div>
                      <span className="text-text-muted">Acquisitions</span>
                      <span className="ml-1 font-mono">{s.totalAcquisitions}</span>
                    </div>
                  )}
                  {s.totalSells != null && (
                    <div>
                      <span className="text-text-muted">Sells</span>
                      <span className="ml-1 font-mono">{s.totalSells}</span>
                    </div>
                  )}
                </>
              )}
              {s.platformsForged != null && s.platformsForged > 0 && (
                <div>
                  <span className="text-text-muted">Platforms</span>
                  <span className="ml-1 font-mono">{s.platformsForged}</span>
                </div>
              )}
              {s.peakLeverage != null && (
                <div>
                  <span className="text-text-muted">Peak Leverage</span>
                  <span className="ml-1 font-mono">{s.peakLeverage.toFixed(1)}x</span>
                </div>
              )}

              {/* Capital */}
              {s.totalDistributions != null && s.totalDistributions > 0 && (
                <div>
                  <span className="text-text-muted">Distributions</span>
                  <span className="ml-1 font-mono">{formatMoney(s.totalDistributions)}</span>
                </div>
              )}
              {s.totalBuybacks != null && s.totalBuybacks > 0 && (
                <div>
                  <span className="text-text-muted">Buybacks</span>
                  <span className="ml-1 font-mono">{formatMoney(s.totalBuybacks)}</span>
                </div>
              )}
              {s.equityRaisesUsed != null && s.equityRaisesUsed > 0 && (
                <div>
                  <span className="text-text-muted">Equity Raises</span>
                  <span className="ml-1 font-mono">{s.equityRaisesUsed}</span>
                </div>
              )}
              {(s.turnaroundsStarted != null && s.turnaroundsStarted > 0) && (
                <div>
                  <span className="text-text-muted">Turnarounds</span>
                  <span className="ml-1 font-mono">{s.turnaroundsSucceeded ?? 0}/{s.turnaroundsStarted}</span>
                </div>
              )}

              {/* Flags */}
              {game.family_office_completed && (
                <div className="col-span-2">
                  <span className="text-yellow-400/80">Family Office completed</span>
                </div>
              )}
              {game.has_restructured && (
                <div className="col-span-2">
                  <span className="text-orange-400/80">Restructured</span>
                </div>
              )}

              {/* PE Fund metrics */}
              {s.isFundManager && s.grossMoic != null && (
                <div>
                  <span className="text-text-muted">MOIC</span>
                  <span className="ml-1 font-mono">{s.grossMoic.toFixed(2)}x</span>
                </div>
              )}
              {s.isFundManager && s.netIrr != null && (
                <div>
                  <span className="text-text-muted">Net IRR</span>
                  <span className="ml-1 font-mono">{(s.netIrr * 100).toFixed(1)}%</span>
                </div>
              )}
              {s.isFundManager && s.carryEarned != null && (
                <div>
                  <span className="text-text-muted">Carry</span>
                  <span className="ml-1 font-mono text-purple-300">{formatMoney(Math.round(s.carryEarned))}</span>
                </div>
              )}

              {/* Anti-patterns */}
              {s.antiPatterns && s.antiPatterns.length > 0 && (
                <div className="col-span-2 mt-1">
                  <span className="text-text-muted">Anti-patterns: </span>
                  <span className="text-red-400/80">{s.antiPatterns.map(ap => ap.replace(/_/g, ' ')).join(', ')}</span>
                </div>
              )}

              {/* Achievements earned this game */}
              {s.earnedAchievementIds && s.earnedAchievementIds.length > 0 && (
                <div className="col-span-2 mt-1">
                  <span className="text-text-muted">Achievements: </span>
                  <span className="text-amber-400/90">
                    {s.earnedAchievementIds.map(id => {
                      const a = ACHIEVEMENT_PREVIEW.find(ach => ach.id === id);
                      return a ? `${a.emoji} ${a.name}` : id;
                    }).join('  ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatsModal() {
  const { showStatsModal, closeStatsModal, player } = useAuthStore();
  const isLoggedIn = useIsLoggedIn();

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  const handleLinkGames = useCallback(async () => {
    setLinking(true);
    try {
      const res = await fetchWithAuth('/api/player/auto-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const msg = res.status === 429 ? 'Try again in a few minutes' : 'Link failed';
        useToastStore.getState().addToast({ message: msg, type: 'warning' });
        return;
      }
      const data = await res.json();
      if (data.linked > 0) {
        useToastStore.getState().addToast({
          message: `${data.linked} game${data.linked > 1 ? 's' : ''} linked!`,
          type: 'success',
        });
        setRefetchKey((k) => k + 1); // trigger stats re-fetch
      } else {
        useToastStore.getState().addToast({ message: 'No unlinked games found', type: 'info' });
      }
    } catch {
      useToastStore.getState().addToast({ message: 'Link request failed', type: 'warning' });
    } finally {
      setLinking(false);
    }
  }, []);

  const loadingMoreRef = useRef(false);
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const offset = history.length;
      const res = await fetchWithAuth(`/api/player/history?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return;
      const data = await res.json();
      setHistory(prev => [...prev, ...(data.games ?? [])]);
      setHistoryTotal(prev => data.total ?? prev);
    } catch {
      // silent — user can retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [history.length]);

  useEffect(() => {
    if (!showStatsModal || !isLoggedIn) return;

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const fetchData = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          fetchWithAuth('/api/player/stats'),
          fetchWithAuth(`/api/player/history?limit=${PAGE_SIZE}`),
        ]);

        if (cancelled) return;

        if (!statsRes.ok) {
          const msg = statsRes.status === 401
            ? 'Session expired — please sign out and sign back in'
            : `Stats request failed (${statsRes.status})`;
          setErrorMsg(msg);
          setHistoryTotal(0);
          setLoading(false);
          return;
        }
        if (!historyRes.ok) {
          setErrorMsg(`History request failed (${historyRes.status})`);
          setHistoryTotal(0);
          setLoading(false);
          return;
        }

        const statsData = await statsRes.json();
        const historyData = await historyRes.json();
        if (cancelled) return;

        setStats(statsData);
        setHistory(historyData.games ?? []);
        setHistoryTotal(historyData.total ?? 0);
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
  }, [showStatsModal, isLoggedIn, player?.id, refetchKey]);

  if (!isLoggedIn) return null;

  const memberSince = player?.createdAt
    ? new Date(player.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // Find best/most-common archetype (only consider archetypes with actual scored games)
  const archetypeEntries = stats?.archetype_stats ? Object.entries(stats.archetype_stats) : [];
  const scoredArchetypes = archetypeEntries.filter(([, val]) => val.avgScore > 0);
  const bestArchetype = scoredArchetypes.length > 0
    ? scoredArchetypes.reduce((best, [key, val]) => val.avgScore > best[1].avgScore ? [key, val] as [string, typeof val] : best)[0]
    : null;
  const mostCommonArchetype = archetypeEntries.length > 0
    ? archetypeEntries.reduce((best, [key, val]) => val.count > best[1].count ? [key, val] as [string, typeof val] : best)[0]
    : null;
  const topAntiPattern = stats?.anti_pattern_frequency
    ? Object.entries(stats.anti_pattern_frequency).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  const chronologicalHistory = useMemo(() => [...history].reverse(), [history]);

  const hasMoreHistory = historyTotal > history.length;

  // Achievements from localStorage (cross-game, no API needed)
  const earnedIds = useMemo(() => new Set(getEarnedAchievementIds()), [showStatsModal]);
  const earnedAchievements = ACHIEVEMENT_PREVIEW.filter(a => earnedIds.has(a.id));
  const unearnedAchievements = ACHIEVEMENT_PREVIEW.filter(a => !earnedIds.has(a.id));

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
          <p className="text-text-muted text-sm mb-4">Complete a game to start building your stats!</p>
          <button
            onClick={handleLinkGames}
            disabled={linking}
            className="btn-secondary text-sm"
          >
            {linking ? 'Linking...' : 'Link Past Games'}
          </button>
          {player?.id && (
            <p className="text-[10px] text-text-muted/50 mt-4 font-mono select-all" title="Player UUID — share with admin if stats are missing">
              {player.id}
            </p>
          )}
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(MODE_LABELS).map(([key, label]) => {
                  const avg = stats.avg_score_by_mode[key];
                  const isPEMode = key === 'fund_manager';
                  return (
                    <div key={key} className={`rounded-lg p-3 text-center ${isPEMode ? 'bg-purple-500/10' : 'bg-white/5'}`}>
                      <p className={`text-xs mb-1 ${isPEMode ? 'text-purple-400' : 'text-text-muted'}`}>{label}</p>
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

          {/* Achievements */}
          <div>
            <h3 className="text-sm font-bold text-text-muted mb-2">
              Achievements
              <span className="font-normal ml-1">({earnedAchievements.length}/{ACHIEVEMENT_PREVIEW.length})</span>
            </h3>
            {earnedAchievements.length > 0 ? (
              <div className="space-y-1.5">
                {earnedAchievements.map(a => (
                  <div key={a.id} className="flex items-start gap-2 bg-green-500/5 border border-green-500/10 rounded-lg p-2.5">
                    <span className="text-base shrink-0">{a.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{a.name}</p>
                      <p className="text-xs text-text-muted">{a.description}</p>
                      {a.unlocks && (
                        <p className="text-[10px] text-emerald-400/80 mt-0.5">Unlocked: {a.unlocks}</p>
                      )}
                    </div>
                    <span className="text-green-400 text-xs shrink-0 mt-0.5">✓</span>
                  </div>
                ))}
                {unearnedAchievements.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
                    {unearnedAchievements.map(a => (
                      <div key={a.id} className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 rounded-lg p-2">
                        <span className="text-sm opacity-40 grayscale shrink-0">{a.emoji}</span>
                        <p className="text-[11px] text-text-muted/60 truncate">{a.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <p className="text-text-muted text-sm">Complete games to earn achievements and unlock new content.</p>
              </div>
            )}
          </div>

          {/* Performance Trend */}
          {history.length >= 3 ? (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Performance Trend</h3>
              <div className="bg-white/5 rounded-lg p-4">
                <SparklineChart games={chronologicalHistory} />
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
              <h3 className="text-sm font-bold text-text-muted mb-2">
                Game History
                <span className="font-normal ml-1">({history.length}{hasMoreHistory ? `/${historyTotal}` : ''})</span>
              </h3>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {history.map((game) => (
                  <GameRow key={game.id} game={game} />
                ))}
              </div>
              {hasMoreHistory && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full mt-2 py-2 text-sm text-text-muted hover:text-text-secondary bg-white/5 hover:bg-white/[0.08] rounded-lg transition-colors"
                >
                  {loadingMore ? 'Loading...' : `Load More (${historyTotal - history.length} remaining)`}
                </button>
              )}
            </div>
          )}

          {/* Link Past Games */}
          <div className="text-center pt-2">
            <button
              onClick={handleLinkGames}
              disabled={linking}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {linking ? 'Linking...' : 'Link Past Games'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
