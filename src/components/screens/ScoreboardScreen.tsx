import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChallengeParams } from '../../utils/challenge';
import { encodeChallengeParams, getPlayerToken, buildScoreboardUrl, shareChallenge, isTied } from '../../utils/challenge';
import { getChallengeStatus, type ChallengeStatus } from '../../services/challengeApi';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { ScoreboardRow } from '../ui/ScoreboardRow';
import { DURATION_CONFIG } from '../../data/gameConfig';

interface ScoreboardScreenProps {
  challengeParams: ChallengeParams;
  onPlayChallenge: (params: ChallengeParams) => void;
  onPlayAgain: () => void;
}

const POLL_INTERVAL = 15_000;
const MAX_POLLS = 80; // ~20 minutes

export function ScoreboardScreen({ challengeParams, onPlayChallenge, onPlayAgain }: ScoreboardScreenProps) {
  const code = encodeChallengeParams(challengeParams);
  const playerToken = getPlayerToken();

  const [status, setStatus] = useState<ChallengeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollError, setPollError] = useState(false);
  const pollCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasData = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (document.hidden) return;
    const data = await getChallengeStatus(code, playerToken);
    if (data) {
      hasData.current = true;
      consecutiveFailures.current = 0;
      setStatus(data);
      setLoading(false);
    } else {
      consecutiveFailures.current += 1;
      setLoading(false);
      if (!hasData.current && consecutiveFailures.current >= 2) setExpired(true);
      if (consecutiveFailures.current >= 4) {
        setPollError(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }
  }, [code, playerToken]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollCount.current = 0;
    intervalRef.current = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }
      fetchStatus();
    }, POLL_INTERVAL);
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    startPolling();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus, startPolling]);

  // Pause/resume polling on tab visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) fetchStatus();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchStatus]);

  const handleShareScoreboard = async () => {
    const url = buildScoreboardUrl(challengeParams);
    const shared = await shareChallenge(url, 'Holdco Tycoon Challenge Scoreboard');
    if (shared) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const diffLabel = challengeParams.difficulty === 'normal' ? 'Hard' : 'Easy';
  const durLabel = DURATION_CONFIG[challengeParams.duration].label;

  // Pre-compute results (scores are always revealed now)
  const results = status?.revealed ? status.results : null;
  const winner = results?.[0] ?? null;
  const hasTie = results && results.length >= 2 ? isTied(results[0], results[1]) : false;

  // For legacy unrevealed challenges, show participant list with visible scores
  const participants = status && !status.revealed ? status.participants : null;

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-8 py-8">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <span>🏆</span> Challenge Scoreboard
          </h1>
          <p className="text-sm text-text-muted mt-1">Same deals. Who built the better holdco?</p>
          <div className="flex justify-center gap-2 mt-3">
            <span className={`text-xs px-2 py-0.5 rounded ${challengeParams.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
              {diffLabel}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
              {durLabel}
            </span>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-text-muted">
              <span className="inline-block w-4 h-4 border-2 border-accent/40 border-t-accent rounded-full animate-spin motion-reduce:animate-none" />
              <span className="text-sm">Loading scoreboard...</span>
            </div>
          </div>
        )}

        {/* Poll error */}
        {pollError && !loading && !expired && (
          <div className="card p-8 text-center">
            <p className="text-text-muted mb-4">Having trouble reaching the server.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => { consecutiveFailures.current = 0; setPollError(false); fetchStatus(); startPolling(); }}
                className="btn-primary text-sm min-h-[44px]"
              >
                Retry
              </button>
              <button onClick={onPlayAgain} className="btn-secondary text-sm min-h-[44px]">
                New Game
              </button>
            </div>
          </div>
        )}

        {/* Expired */}
        {expired && !loading && (
          <div className="card p-8 text-center">
            <p className="text-text-muted mb-4">This challenge has expired or doesn't exist. Results are kept for 30 days.</p>
            <button onClick={onPlayAgain} className="btn-primary text-sm min-h-[44px]">
              Start a New Game
            </button>
          </div>
        )}

        {/* Revealed results — full comparison table */}
        {results && (
          <div className="card p-6 border-yellow-500/20 bg-gradient-to-b from-yellow-500/5 to-transparent">
            {/* Winner banner */}
            {winner && !hasTie && results.length >= 2 && (
              <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/30 text-center">
                <span className="text-accent font-bold">
                  {winner.isYou ? 'You win!' : `${winner.name} wins!`}
                </span>
              </div>
            )}
            {hasTie && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <span className="text-yellow-400 font-bold">Tied!</span>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-text-muted font-medium">Metric</th>
                    {results.map((entry, i) => (
                      <th key={i} className={`text-right py-2 font-medium ${entry.isYou ? 'text-accent' : 'text-text-primary'}`}>
                        <span className="inline-block max-w-[120px] truncate align-bottom">
                          {entry.isYou ? 'You' : entry.name}
                        </span>
                        {i === 0 && !hasTie && results.length >= 2 && <span className="ml-1 text-yellow-400">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ScoreboardRow label="FEV" values={results.map(e => formatMoney(e.fev))} highlight />
                  <ScoreboardRow label="Total Return" values={results.map(e => formatMoney(e.fev + e.totalDistributions))} />
                  <ScoreboardRow label="Score" values={results.map(e => `${e.score}/100`)} />
                  <ScoreboardRow label="Grade" values={results.map(e => e.grade)} colorFn={(v) => getGradeColor(v as 'S' | 'A' | 'B' | 'C' | 'D' | 'F')} />
                  <ScoreboardRow label="Distributions" values={results.map(e => formatMoney(e.totalDistributions))} />
                  <ScoreboardRow label="Businesses" values={results.map(e => String(e.businesses))} />
                  <ScoreboardRow label="Sectors" values={results.map(e => String(e.sectors))} />
                  <ScoreboardRow label="Peak Leverage" values={results.map(e => `${e.peakLeverage.toFixed(1)}x`)} />
                  <ScoreboardRow label="Restructured" values={results.map(e => e.restructured ? 'Yes' : 'No')} colorFn={(v) => v === 'Yes' ? 'text-danger' : 'text-success'} />
                </tbody>
              </table>
            </div>

            {/* Participant count + auto-update note */}
            <div className="flex items-center justify-between text-xs text-text-muted mt-3 pt-2 border-t border-white/10">
              <span>{results.length} player{results.length !== 1 ? 's' : ''}</span>
              <span>Updates automatically</span>
            </div>
          </div>
        )}

        {/* Legacy unrevealed state — show participant list with scores visible */}
        {participants && (
          <div className="card p-6 border-yellow-500/20 bg-gradient-to-b from-yellow-500/5 to-transparent">
            <div className="space-y-2 mb-4">
              {participants.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    p.isYou ? 'bg-accent/10 border border-accent/30' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-accent text-sm">✓</span>
                    <span className={`font-medium text-sm ${p.isYou ? 'text-accent' : ''}`}>
                      {p.name}
                      {p.isYou && <span className="text-xs text-text-muted ml-1">(you)</span>}
                    </span>
                  </div>
                  <div className="text-right">
                    {p.result ? (
                      <span className="font-mono text-sm">{formatMoney(p.result.fev)} ({p.result.grade})</span>
                    ) : (
                      <span className="text-text-muted text-sm">Submitted</span>
                    )}
                  </div>
                </div>
              ))}

              {status && status.participantCount < 2 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-dashed border-white/10">
                  <span className="text-text-muted text-sm">◌</span>
                  <span className="text-text-muted text-sm">Waiting for more players...</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-white/10">
              <span>{status?.participantCount ?? 0} player{status?.participantCount !== 1 ? 's' : ''}</span>
              <span>Updates automatically</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!loading && !expired && !pollError && (
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => onPlayChallenge(challengeParams)}
              className="btn-primary w-full text-sm min-h-[44px]"
            >
              Play This Challenge
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleShareScoreboard}
                className="btn-secondary flex-1 text-sm min-h-[44px]"
              >
                {copied ? 'Copied!' : 'Copy Scoreboard Link'}
              </button>
              <button
                onClick={onPlayAgain}
                className="btn-secondary flex-1 text-sm min-h-[44px]"
              >
                New Game
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ScoreboardRow extracted to shared component
