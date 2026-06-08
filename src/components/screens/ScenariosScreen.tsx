/**
 * Full-screen player-facing Scenario Challenges landing page.
 *
 * Browse active ("Live Now") + ended ("Past Challenges") scenarios, read each
 * one's briefing/duration/countdown, expand its scoreboard inline, and Play.
 * Browsing + scoreboards are open to everyone; the Play action is gated to a
 * signed-in account in PR3 (the `onPlay` handler routes through the existing
 * scenario setup flow, where the account wall fires for anonymous users).
 *
 * Reuses the scoreboard renderer (`ScenarioDetail`) and the list/format helpers
 * already built for the Leaderboard modal — no duplicate fetch logic. A clean
 * extraction of the shared components into src/components/scenarios/ is a v2
 * follow-up (see plan).
 */

import { useState, useEffect } from 'react';
import { fetchScenarioList, fetchScenarioRecords, formatRankingMetric, type ScenarioListSummary, type ScenarioRecord } from '../../services/scenarioLeaderboard';
import { ScenarioDetail } from '../ui/LeaderboardModal';
import { ProfileModal } from '../ui/ProfileModal';
import { useAuthStore } from '../../hooks/useAuth';
import { formatCountdown, formatEndedDate, isScenarioEnded } from '../../utils/scenarioCountdown';

interface ScenariosScreenProps {
  /** Start a scenario. Gated to a signed-in account in PR3 (anonymous → sign-in wall). */
  onPlay: (scenarioId: string) => void;
  onBack: () => void;
}

export function ScenariosScreen({ onPlay, onBack }: ScenariosScreenProps) {
  const [list, setList] = useState<{ active: ScenarioListSummary[]; archived: ScenarioListSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Signed-in player's per-scenario records (best rank/score), keyed by scenarioId.
  // Empty for logged-out players (the endpoint 401s → fetchScenarioRecords returns null).
  const [records, setRecords] = useState<Record<string, ScenarioRecord>>({});
  // Re-render every 60s so countdowns stay fresh.
  const [, setNowTick] = useState(0);

  // `retryToken` bump forces the fetch effect to re-run (used by the error-state Retry).
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchScenarioList()
      .then((res) => { if (!cancelled) { setList({ active: res.active, archived: res.archived }); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; }; // guard against StrictMode double-fire / unmount races
  }, [retryToken]);
  const load = () => setRetryToken((n) => n + 1);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchScenarioRecords()
      .then((recs) => { if (!cancelled && recs) setRecords(Object.fromEntries(recs.map((r) => [r.scenarioId, r]))); })
      .catch(() => { /* logged-out / transient — cards just omit "Your best" */ });
    return () => { cancelled = true; };
  }, []);

  // Account gate (Decision #1): playing a scenario requires a non-anonymous account.
  // Read auth synchronously at click (CLAUDE.md #9). Anonymous players get the account
  // wall (which resumes them into ?se={id} after sign-in); the server 401 is the real gate.
  const handlePlay = (s: ScenarioListSummary) => {
    const isAnon = useAuthStore.getState().player?.isAnonymous ?? true;
    if (isAnon) {
      useAuthStore.getState().openScenarioAccountWall({ scenarioId: s.id, name: s.name, emoji: s.theme?.emoji ?? '🎯' });
    } else {
      onPlay(s.id);
    }
  };

  const hasNone = list && list.active.length === 0 && list.archived.length === 0;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-text-muted hover:text-text-primary mb-4 flex items-center gap-1">
        ← Back
      </button>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <span aria-hidden>🎯</span> Scenario Challenges
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Themed, time-limited challenges with their own leaderboards. Pick one, climb the board.
        </p>
      </header>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div className="card text-center text-text-muted py-10 flex flex-col items-center">
          <p>Couldn't load scenarios.</p>
          <button onClick={load} className="btn-secondary text-sm mt-3">Retry</button>
        </div>
      )}

      {!loading && !error && hasNone && (
        <div className="card text-center text-text-muted py-12">
          <p className="text-lg">No live challenges right now.</p>
          <p className="text-sm mt-2">New themed challenges drop regularly — check back soon.</p>
        </div>
      )}

      {!loading && !error && list && !hasNone && (
        <div className="space-y-8">
          {list.active.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-accent uppercase tracking-wide mb-3">Live Now</h2>
              <div className="space-y-3">
                {list.active.map((s) => (
                  <ScenarioLandingCard key={s.id} summary={s} ended={false} onPlay={() => handlePlay(s)} onProfileClick={setProfileId}
                    myRank={records[s.id] ? { rank: records[s.id].bestRank, entryCount: records[s.id].entryCount ?? 0 } : undefined} />
                ))}
              </div>
            </section>
          )}
          {list.archived.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide mb-3">Past Challenges</h2>
              <div className="space-y-3">
                {list.archived.map((s) => (
                  <ScenarioLandingCard key={s.id} summary={s} ended onPlay={() => handlePlay(s)} onProfileClick={setProfileId}
                    myRank={records[s.id] ? { rank: records[s.id].bestRank, entryCount: records[s.id].entryCount ?? 0 } : undefined} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ProfileModal
        isOpen={profileId !== null}
        onClose={() => setProfileId(null)}
        publicProfileId={profileId}
      />
    </div>
  );
}

interface ScenarioLandingCardProps {
  summary: ScenarioListSummary;
  ended: boolean;
  onPlay: () => void;
  onProfileClick: (pubId: string) => void;
  /** Logged-in player's best rank on this scenario. Hydrated in PR4; null-safe shell here. */
  myRank?: { rank: number | null; entryCount: number } | null;
}

function ScenarioLandingCard({ summary, ended: endedProp, onPlay, onProfileClick, myRank }: ScenarioLandingCardProps) {
  const [showBoard, setShowBoard] = useState(false);
  // Reclassify live → ended if the window closes mid-session (the parent's 60s tick
  // re-renders this card, so an active scenario that crosses endDate hides Play).
  const ended = endedProp || isScenarioEnded(summary.endDate);
  const accent = summary.theme?.color || (ended ? '#64748b' : '#f59e0b');
  const top = formatRankingMetric(summary.rankingMetric, { sortScore: summary.topScore ?? undefined });
  const durationLabel = `${summary.maxRounds}yr · ${summary.duration === 'quick' ? 'Quick' : 'Standard'}`;

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0" aria-hidden>{summary.theme?.emoji ?? '🎯'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base" style={{ color: accent }}>{summary.name}</h3>
              {summary.isPE && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">PE</span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-muted">{durationLabel}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${ended ? 'bg-slate-500/30 text-slate-200' : 'bg-amber-500/20 text-amber-300'}`}>
                {ended ? formatEndedDate(summary.endDate) : formatCountdown(summary.endDate)}
              </span>
            </div>
            <p className="text-sm text-text-muted mt-1">{summary.tagline}</p>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-text-muted tabular-nums">
              <span>{summary.entryCount} {summary.entryCount === 1 ? 'player' : 'players'}</span>
              {summary.topScore != null && (
                <span>Top {top.label}: <span className="text-text-secondary">{top.display}</span></span>
              )}
              {/* "Your best" slot — hydrated in PR4; renders only when a rank is known. */}
              {myRank && myRank.rank != null && (
                <span className="text-accent">Your best: #{myRank.rank} of {myRank.entryCount}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {!ended ? (
            <button
              onClick={onPlay}
              className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold text-bg-primary transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Play ▶
            </button>
          ) : null}
          <button
            onClick={() => setShowBoard((v) => !v)}
            className="min-h-[44px] px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-text-secondary transition-colors"
          >
            {showBoard ? 'Hide scoreboard' : (ended ? 'View scoreboard' : 'Scoreboard')}
          </button>
        </div>
      </div>

      {showBoard && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3 bg-black/20 max-h-[420px] overflow-y-auto">
          <ScenarioDetail scenarioId={summary.id} onProfileClick={onProfileClick} />
        </div>
      )}
    </div>
  );
}
