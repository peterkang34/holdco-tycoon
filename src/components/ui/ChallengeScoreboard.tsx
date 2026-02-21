import { useState, useEffect, useCallback, useRef } from 'react';
import type { PlayerResult, ChallengeParams } from '../../utils/challenge';
import { encodeChallengeParams, getPlayerToken, getHostToken, isTied, buildScoreboardUrl, shareChallenge } from '../../utils/challenge';
import {
  submitChallengeResult,
  getChallengeStatus,
  type ChallengeStatus,
} from '../../services/challengeApi';
import { trackChallengeShare } from '../../services/telemetry';
import { formatMoney } from '../../engine/types';
import { getGradeColor } from '../../utils/gradeColors';
import { ScoreboardRow } from './ScoreboardRow';

interface ChallengeScoreboardProps {
  challengeParams: ChallengeParams;
  myResult: PlayerResult;
  onFallbackToManual: () => void;
}

const POLL_INTERVAL = 15_000; // 15 seconds
const MAX_POLLS = 40; // ~10 minutes
const MAX_CONSECUTIVE_FAILURES = 4; // Fall back after 4 failed polls (~1 min)

export function ChallengeScoreboard({ challengeParams, myResult, onFallbackToManual }: ChallengeScoreboardProps) {
  const code = encodeChallengeParams(challengeParams);
  const playerToken = getPlayerToken();

  const [status, setStatus] = useState<ChallengeStatus | null>(null);
  const [submitState, setSubmitState] = useState<'pending' | 'success' | 'error'>('pending');
  const [pollError, setPollError] = useState(false);
  const [scoreboardCopied, setScoreboardCopied] = useState(false);
  const pollCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisible = useRef(true);

  // Submit result (called on mount + retry)
  const doSubmit = useCallback(async () => {
    setSubmitState('pending');
    const hostToken = getHostToken(code);
    const res = await submitChallengeResult(code, playerToken, myResult, hostToken ?? undefined);
    if (res.success) {
      setSubmitState('success');
    } else {
      setSubmitState('error');
    }
  }, [code, playerToken, myResult]);

  // Auto-submit on mount
  useEffect(() => { doSubmit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track tab visibility to pause polling (#6)
  useEffect(() => {
    const handleVisibility = () => {
      isVisible.current = !document.hidden;
      // When tab becomes visible again, fetch immediately
      if (!document.hidden && submitState === 'success') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [submitState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for status
  const fetchStatus = useCallback(async () => {
    // Skip poll if tab is hidden (#6)
    if (document.hidden) return;

    const data = await getChallengeStatus(code, playerToken);
    if (data) {
      setStatus(data);
      consecutiveFailures.current = 0;
    } else {
      // Track consecutive failures (#4)
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
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
    // Initial fetch after submit succeeds
    if (submitState !== 'success') return;
    fetchStatus();
    startPolling();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [submitState, fetchStatus, startPolling]);

  const handleCopyScoreboardLink = async () => {
    const code = encodeChallengeParams(challengeParams);
    const url = buildScoreboardUrl(challengeParams);
    const shared = await shareChallenge(url, 'Holdco Tycoon Challenge Results');
    if (shared) {
      trackChallengeShare(code, 'share' in navigator ? 'native_share' : 'clipboard');
      setScoreboardCopied(true);
      setTimeout(() => setScoreboardCopied(false), 2000);
    }
  };

  // Error state — retry + fallback to manual
  if (submitState === 'error') {
    return (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
          <span>🏆</span> Challenge Scoreboard
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Could not connect to the scoreboard server.
        </p>
        <div className="flex gap-3">
          <button
            onClick={doSubmit}
            className="btn-primary text-sm min-h-[44px]"
          >
            Retry
          </button>
          <button
            onClick={onFallbackToManual}
            className="btn-secondary text-sm min-h-[44px]"
          >
            Use manual comparison instead
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (submitState === 'pending' || !status) {
    return (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
          <span>🏆</span> Challenge Scoreboard
        </h2>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="inline-block w-4 h-4 border-2 border-accent/40 border-t-accent rounded-full animate-spin motion-reduce:animate-none" />
          {pollError ? 'Having trouble reaching the server...' : 'Submitting your result...'}
        </div>
        {pollError && (
          <button
            onClick={onFallbackToManual}
            className="btn-secondary text-sm mt-3 min-h-[44px]"
          >
            Use manual comparison instead
          </button>
        )}
      </div>
    );
  }

  // Poll error after initial success (#4)
  if (pollError) {
    return (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
          <span>🏆</span> Challenge Scoreboard
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Having trouble reaching the server. Your result was submitted successfully.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { consecutiveFailures.current = 0; setPollError(false); fetchStatus(); startPolling(); }}
            className="btn-primary text-sm min-h-[44px]"
          >
            Retry
          </button>
          <button
            onClick={onFallbackToManual}
            className="btn-secondary text-sm min-h-[44px]"
          >
            Use manual comparison
          </button>
        </div>
      </div>
    );
  }

  // Scores are always revealed now — show the full comparison table
  // For backwards compat, handle legacy unrevealed status by showing participant list with scores
  const results = status.revealed ? status.results : null;

  if (results) {
    const winner = results[0];
    const hasTie = results.length >= 2 && isTied(results[0], results[1]);

    return (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>🏆</span> Challenge Results
        </h2>

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

        {/* Comparison table — min-width forces visible overflow on small screens (#10) */}
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

        {/* Footer with participant count + copy link */}
        <div className="mt-4 pt-3 border-t border-white/10">
          <button
            onClick={handleCopyScoreboardLink}
            className="btn-secondary w-full text-sm min-h-[44px]"
          >
            {scoreboardCopied ? 'Copied!' : 'Copy Scoreboard Link'}
          </button>
          <p className="text-xs text-text-muted mt-1 text-center">Bookmark or share — this link stays live for 30 days</p>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted pt-2">
          <span>{results.length} player{results.length !== 1 ? 's' : ''}</span>
          <span>Updates automatically</span>
        </div>
      </div>
    );
  }

  // Fallback: legacy unrevealed status (backwards compat for old challenges)
  // Still show participants with their scores visible
  if (!status.revealed) {
    const participants = status.participants;

    return (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <span>🏆</span> Challenge Scoreboard
        </h2>

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
                  <span className="font-mono text-sm">
                    {formatMoney(p.result.fev)} ({p.result.grade})
                  </span>
                ) : (
                  <span className="text-text-muted text-sm">Submitted</span>
                )}
              </div>
            </div>
          ))}

          {/* Waiting placeholder */}
          {status.participantCount < 2 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-dashed border-white/10">
              <span className="text-text-muted text-sm">◌</span>
              <span className="text-text-muted text-sm">Waiting for more players...</span>
            </div>
          )}
        </div>

        {/* Copy link */}
        <div className="mb-3">
          <button
            onClick={handleCopyScoreboardLink}
            className="btn-secondary w-full text-sm min-h-[44px]"
          >
            {scoreboardCopied ? 'Copied!' : 'Copy Scoreboard Link'}
          </button>
          <p className="text-xs text-text-muted mt-1 text-center">Bookmark or share — this link stays live for 30 days</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-white/10">
          <span>{status.participantCount} player{status.participantCount !== 1 ? 's' : ''}</span>
          <span>Updates automatically</span>
        </div>
      </div>
    );
  }

  return null;
}

// ScoreboardRow extracted to shared component
