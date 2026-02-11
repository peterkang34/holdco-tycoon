import { useState, useEffect } from 'react';
import { ScoreBreakdown, PostGameInsight, Business, Metrics, LeaderboardEntry, formatMoney, formatPercent, formatMultiple, HistoricalMetrics } from '../../engine/types';
import { SECTORS } from '../../data/sectors';
import { loadLeaderboard, saveToLeaderboard, wouldMakeLeaderboardFromList, getLeaderboardRankFromList } from '../../engine/scoring';
import { AIAnalysisSection } from '../ui/AIAnalysisSection';

interface GameOverScreenProps {
  holdcoName: string;
  score: ScoreBreakdown;
  insights: PostGameInsight[];
  businesses: Business[];
  exitedBusinesses: Business[];
  metrics: Metrics;
  enterpriseValue: number;
  metricsHistory: HistoricalMetrics[];
  totalDistributions: number;
  totalBuybacks: number;
  totalInvestedCapital: number;
  equityRaisesUsed: number;
  sharedServicesActive: number;
  bankruptRound?: number;
  onPlayAgain: () => void;
}

export function GameOverScreen({
  holdcoName,
  score,
  insights,
  businesses,
  exitedBusinesses,
  metrics,
  enterpriseValue,
  metricsHistory,
  totalDistributions,
  totalBuybacks,
  totalInvestedCapital,
  equityRaisesUsed,
  sharedServicesActive,
  bankruptRound,
  onPlayAgain,
}: GameOverScreenProps) {
  const [initials, setInitials] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Deduplicate: exitedBusinesses wins over businesses (a sold biz exists in both)
  // Filter out 'integrated' status (bolt-ons are folded into platform EBITDA)
  const exitedIds = new Set(exitedBusinesses.map(b => b.id));
  const allBusinesses = [
    ...exitedBusinesses.filter(b => b.status !== 'integrated' && b.status !== 'merged'),
    ...businesses.filter(b => !exitedIds.has(b.id) && b.status !== 'integrated' && b.status !== 'merged'),
  ];
  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const canMakeLeaderboard = wouldMakeLeaderboardFromList(leaderboard, enterpriseValue);
  const potentialRank = getLeaderboardRankFromList(leaderboard, enterpriseValue);

  // Load global leaderboard on mount
  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => {
        if (!cancelled) {
          setLeaderboard(entries);
          setLeaderboardLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderboardError(true);
          setLeaderboardLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleRetryLeaderboard = () => {
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => {
        setLeaderboard(entries);
        setLeaderboardLoading(false);
      })
      .catch(() => {
        setLeaderboardError(true);
        setLeaderboardLoading(false);
      });
  };

  const handleSaveScore = async () => {
    if (initials.length < 2 || hasSaved || saving) return;

    setSaving(true);
    try {
      const entry = await saveToLeaderboard(
        {
          holdcoName,
          initials: initials.toUpperCase(),
          enterpriseValue,
          score: score.total,
          grade: score.grade,
          businessCount: activeBusinesses.length,
        },
        {
          totalRounds: 20,
          totalInvestedCapital,
          totalRevenue: metrics.totalRevenue,
          avgEbitdaMargin: metrics.avgEbitdaMargin,
        }
      );

      setSavedEntryId(entry.id);
      setHasSaved(true);

      // Reload global leaderboard to show updated rankings
      const updated = await loadLeaderboard();
      setLeaderboard(updated);
    } finally {
      setSaving(false);
    }
  };

  const getGradeColor = () => {
    switch (score.grade) {
      case 'S': return 'text-yellow-400';
      case 'A': return 'text-accent';
      case 'B': return 'text-blue-400';
      case 'C': return 'text-warning';
      case 'D': return 'text-orange-500';
      case 'F': return 'text-danger';
      default: return 'text-text-secondary';
    }
  };

  const getGradeEmoji = () => {
    switch (score.grade) {
      case 'S': return '🏆';
      case 'A': return '🥇';
      case 'B': return '🥈';
      case 'C': return '🥉';
      case 'D': return '📚';
      case 'F': return '💥';
      default: return '📊';
    }
  };

  const ScoreBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-secondary transition-all duration-1000"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">
      {/* Bankruptcy Header (replaces normal header) */}
      {bankruptRound ? (
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">💀</span>
          <h1 className="text-3xl font-bold mb-2">{holdcoName}</h1>
          <div className="text-7xl font-bold mb-2 text-red-500">
            BANKRUPT
          </div>
          <p className="text-xl text-red-400">
            Filed for bankruptcy in Year {bankruptRound}
          </p>

          <div className="card mt-6 bg-red-900/20 border-red-500/30">
            <p className="text-text-secondary">
              Your holding company couldn't service its debt obligations and was forced into bankruptcy.
              All equity value was wiped out.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-text-muted text-sm">Final Debt</p>
                <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(metrics.totalDebt)}</p>
              </div>
              <div>
                <p className="text-text-muted text-sm">Peak Leverage</p>
                <p className="text-2xl font-bold font-mono text-red-400">
                  {formatMultiple(Math.max(...metricsHistory.map(h => h.metrics.netDebtToEbitda), metrics.netDebtToEbitda))}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
      /* Normal Header */
      <div className="text-center mb-8">
        <span className="text-6xl mb-4 block">{getGradeEmoji()}</span>
        <h1 className="text-3xl font-bold mb-2">{holdcoName}</h1>
        <div className={`text-7xl font-bold mb-2 ${getGradeColor()}`}>
          {score.grade}
        </div>
        <p className="text-xl text-text-secondary">{score.title}</p>
      </div>
      )}

      {/* Enterprise Value - Hero Display */}
      <div className="card mb-6 bg-gradient-to-r from-accent/20 to-accent-secondary/20 border-accent/30">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-1">Final Enterprise Value</p>
          <p className="text-5xl font-bold font-mono text-accent mb-2">
            {formatMoney(enterpriseValue)}
          </p>
          <p className="text-text-secondary text-sm">
            This is your high score - total value created for shareholders
          </p>
        </div>
      </div>

      {/* Save to Leaderboard */}
      {!hasSaved && !leaderboardLoading && canMakeLeaderboard && (
        <div className="card mb-6 border-yellow-400/30">
          <div className="text-center">
            <p className="text-yellow-400 font-bold mb-2">
              You made the leaderboard! (Rank #{potentialRank})
            </p>
            <p className="text-text-secondary text-sm mb-4">
              Enter your initials to save your score
            </p>
            <div className="flex items-center justify-center gap-4">
              <input
                type="text"
                value={initials}
                onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())}
                placeholder="AAA"
                maxLength={4}
                className="w-28 text-center text-2xl font-bold bg-white/10 border border-white/20 rounded-lg py-2 px-4 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSaveScore}
                disabled={initials.length < 2 || saving}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasSaved && (
        <div className="card mb-6 border-accent/30 text-center">
          <p className="text-accent font-bold">Score saved to global leaderboard!</p>
        </div>
      )}

      {/* Global Leaderboard */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>🌍</span> Global Leaderboard
        </h2>

        {leaderboardLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {leaderboardError && (
          <div className="text-center py-6">
            <p className="text-text-muted mb-3">Failed to load leaderboard</p>
            <button onClick={handleRetryLeaderboard} className="btn-secondary text-sm">
              Retry
            </button>
          </div>
        )}

        {!leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
          <div className="text-center text-text-muted py-6">
            <p>No scores yet. Be the first!</p>
          </div>
        )}

        {!leaderboardLoading && !leaderboardError && leaderboard.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  entry.id === savedEntryId
                    ? 'bg-accent/20 border border-accent/40'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-lg font-bold ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-300' :
                    index === 2 ? 'text-orange-400' :
                    'text-text-muted'
                  }`}>
                    #{index + 1}
                  </span>
                  <div>
                    <p className="font-bold">{entry.initials}</p>
                    <p className="text-xs text-text-muted">{entry.holdcoName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-text-muted">EV</p>
                    <p className="font-mono font-bold text-accent">{formatMoney(entry.enterpriseValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Score</p>
                    <p className={`font-mono ${
                      entry.grade === 'S' ? 'text-yellow-400' :
                      entry.grade === 'A' ? 'text-accent' :
                      entry.grade === 'B' ? 'text-blue-400' :
                      'text-text-secondary'
                    }`}>{entry.score} ({entry.grade})</p>
                  </div>
                  <div className="text-xs text-text-muted">
                    {formatDate(entry.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Score Breakdown */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Score Breakdown</h2>
        <ScoreBar label="FCF/Share Growth" value={score.fcfShareGrowth} max={25} />
        <ScoreBar label="Portfolio ROIC" value={score.portfolioRoic} max={20} />
        <ScoreBar label="Capital Deployment (MOIC + ROIIC)" value={score.capitalDeployment} max={20} />
        <ScoreBar label="Balance Sheet Health" value={score.balanceSheetHealth} max={15} />
        <ScoreBar label="Strategic Discipline" value={score.strategicDiscipline} max={20} />
        <div className="mt-4 pt-4 border-t border-white/10 text-center">
          <span className="text-2xl font-bold font-mono">{score.total} / 100</span>
        </div>
      </div>

      {/* Final Metrics */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Final Portfolio Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 text-center">
          <div>
            <p className="text-text-muted text-sm">Total Revenue</p>
            <p className="text-2xl font-bold font-mono">{formatMoney(metrics.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Final EBITDA <span className="text-xs">({(metrics.avgEbitdaMargin * 100).toFixed(0)}%)</span></p>
            <p className="text-2xl font-bold font-mono">{formatMoney(metrics.totalEbitda)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Portfolio MOIC</p>
            <p className="text-2xl font-bold font-mono text-accent">{formatMultiple(metrics.portfolioMoic)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Total Distributed</p>
            <p className="text-2xl font-bold font-mono">{formatMoney(metrics.totalDistributions)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Exit Proceeds</p>
            <p className="text-2xl font-bold font-mono">{formatMoney(metrics.totalExitProceeds)}</p>
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Portfolio Companies</h2>
        <div className="space-y-2">
          {allBusinesses.map(business => {
            const sector = SECTORS[business.sectorId];
            const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
            const moic = totalInvested > 0
              ? (business.exitPrice
                  ? business.exitPrice / totalInvested
                  : (business.ebitda * business.acquisitionMultiple) / totalInvested)
              : 0;

            return (
              <div
                key={business.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{sector.emoji}</span>
                  <div>
                    <p className="font-medium">{business.name}</p>
                    <p className="text-xs text-text-muted">{sector.name}</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 sm:gap-4 text-right">
                  <div>
                    <p className="text-xs text-text-muted">Revenue</p>
                    <p className="font-mono">{formatMoney(business.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">EBITDA</p>
                    <p className="font-mono">{formatMoney(business.status === 'active' ? business.ebitda : business.exitPrice || 0)}</p>
                    <p className={`text-xs font-mono ${business.ebitdaMargin > business.acquisitionMargin ? 'text-accent' : business.ebitdaMargin < business.acquisitionMargin ? 'text-danger' : 'text-text-muted'}`}>
                      {(business.ebitdaMargin * 100).toFixed(0)}%
                      {business.status === 'active' && ` (${((business.ebitdaMargin - business.acquisitionMargin) * 100) >= 0 ? '+' : ''}${((business.ebitdaMargin - business.acquisitionMargin) * 100).toFixed(1)}ppt)`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">MOIC</p>
                    <p className={`font-mono ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : ''}`}>
                      {formatMultiple(moic)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array(5).fill(0).map((_, i) => (
                      <span key={i} className={`text-xs ${i < business.qualityRating ? 'text-yellow-400' : 'text-white/20'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    business.status === 'active' ? 'bg-accent/20 text-accent' :
                    business.status === 'sold' ? 'bg-blue-500/20 text-blue-400' :
                    business.status === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-danger/20 text-danger'
                  }`}>
                    {business.status === 'active' ? 'Active' :
                     business.status === 'sold' ? 'Sold' :
                     business.status === 'merged' ? 'Merged' :
                     'Wound Down'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Analysis */}
      <AIAnalysisSection
        holdcoName={holdcoName}
        score={score}
        enterpriseValue={enterpriseValue}
        businesses={businesses}
        exitedBusinesses={exitedBusinesses}
        metricsHistory={metricsHistory}
        totalDistributions={totalDistributions}
        totalBuybacks={totalBuybacks}
        totalInvestedCapital={totalInvestedCapital}
        equityRaisesUsed={equityRaisesUsed}
        sharedServicesActive={sharedServicesActive}
      />

      {/* Actions */}
      <div className="flex flex-col gap-4">
        <button onClick={onPlayAgain} className="btn-primary text-lg py-4">
          Play Again
        </button>
        <a
          href="https://holdcoguide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-center text-lg py-4"
        >
          Get The Holdco Guide →
        </a>
      </div>

      {/* Footer */}
      <p className="text-center text-text-muted text-sm mt-8">
        Holdco Tycoon - Based on <em>The Holdco Guide</em> by Peter Kang
      </p>
    </div>
  );
}
