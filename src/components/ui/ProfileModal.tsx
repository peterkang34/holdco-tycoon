import { useEffect, useState, useMemo } from 'react';
import { Modal } from './Modal';
import { useAuthStore } from '../../hooks/useAuth';
import { fetchWithAuth } from '../../lib/supabase';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { ACHIEVEMENT_PREVIEW } from '../../data/achievementPreview';
import { getEarnedAchievementIds } from '../../hooks/useUnlocks';
import { SECTORS } from '../../data/sectors';
import SparklineChart from './SparklineChart';

// --- Types ---

interface PublicProfileData {
  publicId: string;
  initials: string;
  memberSince: string;
  totalGames: number;
  bestAdjustedFev: number;
  bestScore: number;
  avgScore: number;
  gradeDistribution: Record<string, number>;
  achievementCount: number;
  achievementIds: string[];
  bestArchetype: string | null;
  mostCommonArchetype: string | null;
  favoriteSector: string | null;
  sectorFrequency: Record<string, number>;
  recentGames: PublicGame[];
  modesPlayed: string[];
  familyOfficeCompleted: boolean;
}

interface PublicGame {
  holdcoName: string;
  grade: string;
  score: number;
  adjustedFev: number;
  difficulty: string;
  duration: string;
  archetype: string | null;
  completedAt: string;
  isFundManager: boolean;
  carryEarned: number | null;
  scoreBreakdown?: {
    valueCreation: number;
    fcfShareGrowth: number;
    portfolioRoic: number;
    capitalDeployment: number;
    balanceSheetHealth: number;
    strategicDiscipline: number;
  };
}

interface SelfProfileData {
  totalGames: number;
  bestScore: number;
  bestAdjustedFev: number;
  avgScore: number;
  gradeDistribution: Record<string, number>;
  archetypeStats: Record<string, { count: number; avgScore: number }>;
  avgScoreByMode: Record<string, number>;
  sectorFrequency: Record<string, number>;
  familyOfficeCompleted: boolean;
}

interface SelfGame {
  holdco_name: string;
  grade: string;
  score: number;
  adjusted_fev: number;
  difficulty: string;
  duration: string;
  completed_at: string;
  strategy?: {
    archetype?: string;
    isFundManager?: boolean;
    carryEarned?: number;
  };
}

// --- Constants ---

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

const MODE_TOOLTIPS: Record<string, string> = {
  easy_standard: 'Easy / 20-year',
  easy_quick: 'Easy / 10-year',
  normal_standard: 'Hard / 20-year',
  normal_quick: 'Hard / 10-year',
  fund_manager: 'PE Fund Manager',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMemberSince(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getSectorName(sectorId: string): string {
  const sector = SECTORS[sectorId];
  return sector ? `${sector.emoji} ${sector.name}` : sectorId;
}

function getSectorEmoji(sectorId: string): string {
  return SECTORS[sectorId]?.emoji ?? '📊';
}

// --- Profile Modal ---

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicProfileId: string | null; // null = self mode
  onBackToLeaderboard?: () => void;
}

export function ProfileModal({ isOpen, onClose, publicProfileId, onBackToLeaderboard }: ProfileModalProps) {
  const isSelf = publicProfileId === null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicProfileData | null>(null);
  const [selfData, setSelfData] = useState<SelfProfileData | null>(null);
  const [selfGames, setSelfGames] = useState<SelfGame[]>([]);

  const player = useAuthStore((s) => s.player);

  // Fetch data
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfileData(null);
    setSelfData(null);
    setSelfGames([]);

    if (isSelf) {
      // Self mode: use authenticated endpoints
      Promise.all([
        fetchWithAuth('/api/player/stats'),
        fetchWithAuth('/api/player/history?limit=10'),
      ]).then(async ([statsRes, historyRes]) => {
        if (cancelled) return;
        if (!statsRes.ok || !historyRes.ok) {
          setError('Failed to load profile');
          setLoading(false);
          return;
        }
        const stats = await statsRes.json();
        const history = await historyRes.json();
        if (cancelled) return;
        setSelfData({
          totalGames: stats.total_games ?? 0,
          bestScore: stats.best_score ?? 0,
          bestAdjustedFev: stats.best_adjusted_fev ?? 0,
          avgScore: stats.avg_score ?? 0,
          gradeDistribution: stats.grade_distribution ?? {},
          archetypeStats: stats.archetype_stats ?? {},
          avgScoreByMode: stats.avg_score_by_mode ?? {},
          sectorFrequency: stats.sector_frequency ?? {},
          familyOfficeCompleted: stats.family_office_completed ?? false,
        });
        setSelfGames(history.games ?? []);
        setLoading(false);
      }).catch(() => {
        if (!cancelled) {
          setError('Failed to load profile');
          setLoading(false);
        }
      });
    } else {
      // Other mode: public endpoint
      fetch(`/api/player/public-profile?id=${publicProfileId}`)
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            setError(res.status === 404 ? 'Profile not found' : 'Failed to load profile');
            setLoading(false);
            return;
          }
          const data = await res.json();
          if (cancelled) return;
          setProfileData(data);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setError('Failed to load profile');
            setLoading(false);
          }
        });
    }

    return () => { cancelled = true; };
  }, [isOpen, isSelf, publicProfileId]);

  // Normalized data for rendering
  const normalized = useMemo(() => {
    if (isSelf && selfData) {
      const archetypeEntries = Object.entries(selfData.archetypeStats);
      const scoredArchetypes = archetypeEntries.filter(([, v]) => v.avgScore > 0);
      const bestArchetype = scoredArchetypes.length > 0
        ? scoredArchetypes.reduce((best, cur) => cur[1].avgScore > best[1].avgScore ? cur : best)[0]
        : null;
      const mostCommonArchetype = archetypeEntries.length > 0
        ? archetypeEntries.reduce((best, cur) => cur[1].count > best[1].count ? cur : best)[0]
        : null;

      // Favorite sector
      const sectorEntries = Object.entries(selfData.sectorFrequency);
      const favoriteSector = sectorEntries.length > 0
        ? sectorEntries.reduce((best, cur) => cur[1] > best[1] ? cur : best)[0]
        : null;

      const modesPlayed = Object.keys(selfData.avgScoreByMode).filter(k => selfData.avgScoreByMode[k] != null);

      return {
        initials: player?.initials?.slice(0, 2) ?? '??',
        memberSince: player?.createdAt ?? '',
        totalGames: selfData.totalGames,
        bestAdjustedFev: selfData.bestAdjustedFev,
        bestScore: selfData.bestScore,
        avgScore: selfData.avgScore,
        gradeDistribution: selfData.gradeDistribution,
        achievementIds: getEarnedAchievementIds(),
        bestArchetype,
        mostCommonArchetype,
        favoriteSector,
        sectorFrequency: selfData.sectorFrequency,
        modesPlayed,
        familyOfficeCompleted: selfData.familyOfficeCompleted,
        recentGames: selfGames.map(g => ({
          holdcoName: g.holdco_name,
          grade: g.grade,
          score: g.score,
          adjustedFev: g.adjusted_fev,
          difficulty: g.difficulty,
          duration: g.duration,
          archetype: g.strategy?.archetype ?? null,
          completedAt: g.completed_at,
          isFundManager: g.strategy?.isFundManager === true,
          carryEarned: g.strategy?.carryEarned ?? null,
        })),
      };
    }

    if (!isSelf && profileData) {
      return {
        initials: profileData.initials,
        memberSince: profileData.memberSince,
        totalGames: profileData.totalGames,
        bestAdjustedFev: profileData.bestAdjustedFev,
        bestScore: profileData.bestScore,
        avgScore: profileData.avgScore,
        gradeDistribution: profileData.gradeDistribution,
        achievementIds: profileData.achievementIds,
        bestArchetype: profileData.bestArchetype,
        mostCommonArchetype: profileData.mostCommonArchetype,
        favoriteSector: profileData.favoriteSector,
        sectorFrequency: profileData.sectorFrequency,
        modesPlayed: profileData.modesPlayed,
        familyOfficeCompleted: profileData.familyOfficeCompleted,
        recentGames: profileData.recentGames,
      };
    }

    return null;
  }, [isSelf, selfData, selfGames, profileData, player]);

  // Viewer's own achievements (for comparison when viewing another player)
  const viewerAchievementIds = useMemo(() => {
    if (isSelf) return [];
    return getEarnedAchievementIds();
  }, [isSelf, isOpen]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      header={
        <>
          <h3 className="text-xl font-bold">
            {isSelf ? 'My Profile' : 'Player Profile'}
          </h3>
          {onBackToLeaderboard && (
            <button
              onClick={() => { handleClose(); onBackToLeaderboard(); }}
              className="text-sm text-accent hover:text-accent/80 transition-colors min-h-[44px] flex items-center"
            >
              ← Back to Leaderboard
            </button>
          )}
        </>
      }
      size="md"
    >
      {loading && (
        <div className="space-y-4 min-h-[300px]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
          <p className="text-text-muted mb-2">{error === 'Failed to load profile' ? "Couldn't load this profile right now. Try again in a moment." : error}</p>
          <button onClick={handleClose} className="btn-secondary text-sm">Close</button>
        </div>
      )}

      {!loading && !error && normalized && normalized.totalGames === 0 && (
        <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
          <span className="text-4xl block mb-3">📊</span>
          <p className="text-text-secondary font-medium">No games on record yet</p>
          <p className="text-text-muted text-sm mt-1">Complete a game to start building your profile.</p>
        </div>
      )}

      {!loading && !error && normalized && normalized.totalGames > 0 && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent/20 text-accent text-xl font-bold flex items-center justify-center">
              {normalized.initials}
            </div>
            <div>
              <p className="font-bold text-lg flex items-center gap-2">
                {normalized.initials}
                {(!isSelf || (player && !player.isAnonymous)) && (
                  <span className="text-blue-300 text-sm" title="Verified account">✓</span>
                )}
                {normalized.familyOfficeCompleted && <span title="Family Office Legacy">🦅</span>}
              </p>
              <p className="text-text-muted text-sm">
                {normalized.totalGames} games played · Member since {formatMemberSince(normalized.memberSince)}
              </p>
              {/* Mode badges */}
              {normalized.modesPlayed.length > 0 && (
                <div className="flex gap-1.5 mt-1">
                  {normalized.modesPlayed.map(mode => {
                    const isPE = mode === 'fund_manager';
                    const label = MODE_LABELS[mode] ?? mode;
                    return (
                      <span
                        key={mode}
                        title={MODE_TOOLTIPS[mode] ?? mode}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${isPE ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-text-secondary'}`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Personal Records */}
          <div>
            <h3 className="text-sm font-bold text-text-muted mb-2">Personal Records</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Best Adj. FEV</p>
                <p className="font-mono font-bold text-accent">{formatMoney(normalized.bestAdjustedFev)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Best Score</p>
                <p className="font-mono font-bold">{normalized.bestScore}/100</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Avg Score</p>
                <p className="font-mono font-bold">{(normalized.avgScore ?? 0).toFixed(1)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted">Games</p>
                <p className="font-mono font-bold">{normalized.totalGames}</p>
              </div>
            </div>
          </div>

          {/* Achievements */}
          <AchievementsSection
            achievementIds={normalized.achievementIds}
            viewerAchievementIds={viewerAchievementIds}
            isSelf={isSelf}
          />

          {/* Strategy Profile */}
          {(normalized.bestArchetype || normalized.mostCommonArchetype || normalized.favoriteSector) && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Strategy Profile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {normalized.bestArchetype && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Best Archetype</p>
                    <p className="font-medium text-sm">{ARCHETYPE_LABELS[normalized.bestArchetype] ?? normalized.bestArchetype}</p>
                  </div>
                )}
                {normalized.mostCommonArchetype && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Most Common</p>
                    <p className="font-medium text-sm">{ARCHETYPE_LABELS[normalized.mostCommonArchetype] ?? normalized.mostCommonArchetype}</p>
                  </div>
                )}
                {normalized.favoriteSector && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-text-muted">Favorite Sector</p>
                    <p className="font-medium text-sm">{getSectorName(normalized.favoriteSector)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sector Frequency (top 5) */}
          {Object.keys(normalized.sectorFrequency).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Top Sectors</h3>
              <div className="space-y-1.5">
                {Object.entries(normalized.sectorFrequency)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([sectorId, count]) => {
                    const maxCount = Math.max(...Object.values(normalized.sectorFrequency));
                    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                      <div key={sectorId} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">{getSectorEmoji(sectorId)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-text-secondary truncate">{SECTORS[sectorId]?.name ?? sectorId}</span>
                            <span className="text-xs text-text-muted ml-2 shrink-0">{count}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-accent/40 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Grade Distribution */}
          {Object.keys(normalized.gradeDistribution).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Grade Distribution</h3>
              <div className="flex gap-1.5 sm:gap-2">
                {['S', 'A', 'B', 'C', 'D', 'F'].map((grade) => {
                  const count = normalized.gradeDistribution[grade] ?? 0;
                  return (
                    <div key={grade} className="flex-1 text-center bg-white/5 rounded-lg p-1.5 sm:p-2">
                      <p className={`font-bold text-lg ${getGradeColor(grade)}`}>{grade}</p>
                      <p className="text-xs text-text-muted">{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance Trend (sparkline from recent games) */}
          {normalized.recentGames.length >= 3 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">Recent Performance</h3>
              <div className="bg-white/5 rounded-lg p-4">
                <SparklineChart
                  games={[...normalized.recentGames].reverse().map(g => ({ score: g.score, grade: g.grade }))}
                />
              </div>
            </div>
          )}

          {/* Recent Games */}
          {normalized.recentGames.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-text-muted mb-2">
                Recent Games
                <span className="font-normal ml-1">({normalized.recentGames.length})</span>
              </h3>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {normalized.recentGames.map((game, i) => (
                  <ProfileGameRow key={i} game={game} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// --- Sub-components ---

function AchievementsSection({
  achievementIds,
  viewerAchievementIds,
  isSelf,
}: {
  achievementIds: string[];
  viewerAchievementIds: string[];
  isSelf: boolean;
}) {
  const earnedSet = new Set(achievementIds);
  const earned = ACHIEVEMENT_PREVIEW.filter(a => earnedSet.has(a.id));
  const unearned = ACHIEVEMENT_PREVIEW.filter(a => !earnedSet.has(a.id));

  // "Achievements to Chase" — ones the profile has that the viewer doesn't
  const viewerSet = new Set(viewerAchievementIds);
  const toChase = !isSelf
    ? earned.filter(a => !viewerSet.has(a.id))
    : [];

  return (
    <div>
      <h3 className="text-sm font-bold text-text-muted mb-2">
        Achievements
        <span className="font-normal ml-1">({earned.length}/{ACHIEVEMENT_PREVIEW.length})</span>
      </h3>

      {earned.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {earned.map(a => (
            <div
              key={a.id}
              className="flex flex-col items-center gap-1 bg-green-500/5 border border-green-500/10 rounded-lg p-2 text-center"
              title={a.description}
            >
              <span className="text-lg">{a.emoji}</span>
              <span className="text-[10px] text-text-secondary leading-tight">{a.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <p className="text-text-muted text-sm">No achievements earned yet. Play more games to start earning them.</p>
        </div>
      )}

      {/* Unearned (dimmed, 3-col grid) */}
      {unearned.length > 0 && earned.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-2">
          {unearned.map(a => (
            <div
              key={a.id}
              className="flex flex-col items-center gap-1 bg-white/[0.02] border border-white/5 rounded-lg p-2 text-center"
              title={a.description}
            >
              <span className="text-lg opacity-30 grayscale">{a.emoji}</span>
              <span className="text-[10px] text-text-muted/50 leading-tight">{a.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Achievements to Chase (other-player mode only, when they have ones you don't) */}
      {toChase.length > 0 && (
        <div className="mt-3 bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-400/80 mb-2">Achievements to Chase</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {toChase.slice(0, 8).map(a => (
              <div
                key={a.id}
                className="flex flex-col items-center gap-1 text-center"
                title={a.description}
              >
                <span className="text-lg">{a.emoji}</span>
                <span className="text-[10px] text-amber-400/70 leading-tight">{a.name}</span>
              </div>
            ))}
          </div>
          {toChase.length > 8 && (
            <p className="text-[10px] text-text-muted mt-1.5 text-center">+{toChase.length - 8} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileGameRow({ game }: { game: PublicGame }) {
  return (
    <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{game.holdcoName}</p>
        <p className="text-xs text-text-muted">
          {formatDate(game.completedAt)}
          {game.archetype && <span className="ml-2">{ARCHETYPE_LABELS[game.archetype] ?? game.archetype}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <div>
          {game.isFundManager && game.carryEarned != null ? (
            <p className="font-mono text-sm font-bold text-purple-300">{formatMoney(Math.round(game.carryEarned))}</p>
          ) : (
            <p className="font-mono text-sm font-bold text-accent">{formatMoney(game.adjustedFev)}</p>
          )}
        </div>
        <span className={`font-mono font-bold ${getGradeColor(game.grade)}`}>{game.grade}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${game.isFundManager ? 'bg-purple-500/20 text-purple-400' : game.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
          {game.isFundManager ? 'PE' : `${game.difficulty === 'normal' ? 'H' : 'E'}${game.duration === 'quick' ? '/10' : ''}`}
        </span>
      </div>
    </div>
  );
}
