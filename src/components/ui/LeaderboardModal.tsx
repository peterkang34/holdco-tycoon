import { Fragment, useEffect, useState } from 'react';
import { LeaderboardEntry, formatMoney } from '../../engine/types';
import { loadLeaderboard } from '../../engine/scoring';
import { getGradeColor, getRankColor } from '../../utils/gradeColors';
import { Modal } from './Modal';

interface LeaderboardModalProps {
  onClose: () => void;
  hypotheticalEV?: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DIFF_MULT: Record<string, number> = { easy: 1.0, normal: 1.15 };

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

  // Determine ghost row rank (compare adjusted FEV vs adjusted FEV)
  const ghostRank = hypotheticalEV && hypotheticalEV > 0
    ? leaderboard.filter(e => {
        const raw = e.founderEquityValue ?? e.enterpriseValue;
        const adjusted = Math.round(raw * (DIFF_MULT[e.difficulty ?? 'easy'] ?? 1.0));
        return adjusted > hypotheticalEV;
      }).length
    : -1;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span>🌍</span> Global Leaderboard
          </h3>
          <p className="text-text-muted text-sm">Top 50 runs by founder equity value</p>
        </>
      }
      size="md"
    >
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
    </Modal>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`text-base sm:text-lg font-bold tabular-nums w-10 text-center inline-block ${getRankColor(rank)}`}>#{rank}</span>;
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <RankBadge rank={rank} />
        <div className="min-w-0">
          <p className="font-bold">{entry.initials}</p>
          <p className="text-xs text-text-muted truncate">{entry.holdcoName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6 text-right shrink-0">
        <div className="min-w-[4.5rem]">
          <p className="text-xs text-text-muted">{entry.founderEquityValue ? 'FEV' : 'EV'}</p>
          <p className="font-mono tabular-nums font-bold text-accent">{formatMoney(entry.founderEquityValue ?? entry.enterpriseValue)}</p>
        </div>
        <div className="min-w-[3.5rem]">
          <p className="text-xs text-text-muted">Score</p>
          <p className={`font-mono tabular-nums ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
        </div>
        <div className="w-8 flex justify-center">
          {entry.difficulty ? (
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
      <div className="flex items-center gap-4 sm:gap-6 text-right">
        <div className="min-w-[4.5rem]">
          <p className="text-xs text-text-muted">FEV</p>
          <p className="font-mono tabular-nums font-bold text-accent">{formatMoney(ev)}</p>
        </div>
        <div className="min-w-[3.5rem]" />
        <div className="w-8" />
        <div className="w-20 hidden sm:block" />
      </div>
    </div>
  );
}
