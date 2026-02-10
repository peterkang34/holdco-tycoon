import { Fragment, useEffect, useState } from 'react';
import { LeaderboardEntry, formatMoney } from '../../engine/types';
import { loadLeaderboard } from '../../engine/scoring';

interface LeaderboardModalProps {
  onClose: () => void;
  hypotheticalEV?: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LeaderboardModal({ onClose, hypotheticalEV }: LeaderboardModalProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchLeaderboard = () => {
    setLoading(true);
    setError(false);
    loadLeaderboard()
      .then(entries => {
        setLeaderboard(entries);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Determine ghost row rank
  const ghostRank = hypotheticalEV && hypotheticalEV > 0
    ? leaderboard.filter(e => e.enterpriseValue > hypotheticalEV).length
    : -1;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-bg-primary border border-white/10 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span>🌍</span> Global Leaderboard
            </h3>
            <p className="text-text-muted text-sm">Top 50 runs by enterprise value</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {loading && (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="card text-center text-text-muted py-8">
            <p>Failed to load leaderboard.</p>
            <button onClick={fetchLeaderboard} className="btn-secondary text-sm mt-3">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && leaderboard.length === 0 && ghostRank === -1 ? (
          <div className="card text-center text-text-muted py-8">
            <p>No scores yet.</p>
            <p className="text-sm mt-2">Complete a game to set your first record.</p>
          </div>
        ) : null}

        {!loading && !error && (leaderboard.length > 0 || ghostRank !== -1) && (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <Fragment key={entry.id}>
                {/* Ghost row inserted before correct position */}
                {ghostRank === index && (
                  <GhostRow rank={index + 1} ev={hypotheticalEV!} />
                )}
                <LeaderboardRow
                  entry={entry}
                  rank={index < ghostRank || ghostRank === -1 ? index + 1 : index + 2}
                />
              </Fragment>
            ))}
            {/* Ghost row at end if it's after all entries */}
            {ghostRank === leaderboard.length && (
              <GhostRow rank={leaderboard.length + 1} ev={hypotheticalEV!} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? 'text-yellow-400' :
    rank === 2 ? 'text-gray-300' :
    rank === 3 ? 'text-orange-400' :
    'text-text-muted';
  return <span className={`text-lg font-bold ${color}`}>#{rank}</span>;
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
      <div className="flex items-center gap-4">
        <RankBadge rank={rank} />
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
            entry.grade === 'C' ? 'text-warning' :
            entry.grade === 'D' ? 'text-orange-500' :
            entry.grade === 'F' ? 'text-danger' :
            'text-text-secondary'
          }`}>{entry.score} ({entry.grade})</p>
        </div>
        <div className="text-xs text-text-muted">
          {formatDate(entry.date)}
        </div>
      </div>
    </div>
  );
}

function GhostRow({ rank, ev }: { rank: number; ev: number }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed border-accent/40 bg-accent/5">
      <div className="flex items-center gap-4">
        <RankBadge rank={rank} />
        <div>
          <p className="font-bold text-accent">You are here</p>
          <p className="text-xs text-text-muted">Current run</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-text-muted">EV</p>
        <p className="font-mono font-bold text-accent">{formatMoney(ev)}</p>
      </div>
    </div>
  );
}
