import { useMemo } from 'react';
import type { LeaderboardEntry } from '../../engine/types';
import { formatMoney } from '../../engine/types';
import { getGradeColor, getRankColor } from '../../utils/gradeColors';
import { TABS, filterAndSort, getDisplayValue } from '../ui/LeaderboardModal';
import type { LeaderboardTab } from '../ui/LeaderboardModal';
import { useAuthStore } from '../../hooks/useAuth';

interface GameOverLeaderboardProps {
  allEntries: LeaderboardEntry[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  savedEntryId: string | null;
  activeTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  showWealth: boolean;
}

export function GameOverLeaderboard({
  allEntries,
  loading,
  error,
  onRetry,
  savedEntryId,
  activeTab,
  onTabChange,
  showWealth,
}: GameOverLeaderboardProps) {
  const filtered = useMemo(() => filterAndSort(allEntries, activeTab), [allEntries, activeTab]);
  const currentPlayerId = useAuthStore((s) => s.player?.id);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <span>🌍</span> Global Leaderboard
      </h2>

      {/* Tab Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 -mx-1 px-1 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap text-sm min-h-[36px] ${
              activeTab === tab.id
                ? 'bg-accent text-bg-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <span className="sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-6">
          <p className="text-text-muted mb-3">Failed to load leaderboard</p>
          <button onClick={onRetry} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center text-text-muted py-6">
          <p>No scores yet{activeTab !== 'overall' ? ' in this category' : ''}. Be the first!</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filtered.map((entry, index) => {
            const displayValue = getDisplayValue(entry, activeTab);
            const isPE = activeTab === 'pe';
            const displayLabel = isPE ? 'Carry' : showWealth ? 'Wealth' : (entry.founderEquityValue ? 'FEV' : 'EV');
            const isYou = !!(currentPlayerId && entry.playerId && currentPlayerId === entry.playerId);
            const isVerified = entry.isVerified || !!entry.playerId;
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isYou ? 'bg-accent/15 border border-accent/30'
                    : entry.id === savedEntryId ? 'bg-accent/20 border border-accent/40'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className={`text-lg font-bold tabular-nums w-10 text-center inline-block ${getRankColor(index + 1)}`}>
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {entry.initials}
                      {isVerified && <span className="text-blue-300 ml-1 text-sm" role="img" aria-label="Verified account" title="Verified account">✓</span>}
                      {entry.familyOfficeCompleted && <span className="ml-1" title="Family Office Legacy">🦅</span>}
                      {isPE && <span className="ml-1" title="PE Fund Manager">🏦</span>}
                      {isYou && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">You</span>}
                    </p>
                    <p className="text-xs text-text-muted truncate">{isPE ? (entry.fundName || entry.holdcoName) : entry.holdcoName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 text-right shrink-0">
                  <div className="min-w-[4.5rem]">
                    <p className="text-xs text-text-muted">{displayLabel}</p>
                    <p className="font-mono tabular-nums font-bold text-accent">
                      {formatMoney(displayValue)}
                      {!isPE && entry.hasRestructured && <span className="text-red-400 text-[10px] ml-1" title="Restructured — 20% FEV penalty">(R)</span>}
                    </p>
                  </div>
                  <div className="min-w-[3.5rem]">
                    <p className="text-xs text-text-muted">Score</p>
                    <p className={`font-mono tabular-nums ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
                  </div>
                  <div className="w-8 flex justify-center">
                    {isPE ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">PE</span>
                    ) : entry.difficulty ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                        {entry.difficulty === 'normal' ? 'H' : 'E'}{entry.duration === 'quick' ? '/10' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-muted hidden sm:block w-20">
                    {formatDate(entry.date)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
