/**
 * Drop-in replacement for <LeaderboardSaveInput> + <GameOverLeaderboard> shown
 * on GameOverScreen when `isScenarioChallengeMode`. Handles:
 *
 *   1. Submitting the completion to /api/scenario-challenges/submit (honoring
 *      admin preview + grace period — both enforced server-side, reflected here).
 *   2. Rendering the player's rank vs the scenario-configured ranking metric
 *      (fev, moic, irr, gpCarry, cashOnCash) — not the global 0–100 game score.
 *   3. Showing the scenario top-10 entries, refetched after save.
 *
 * Does NOT call the global leaderboard endpoints. Guarded at the GameOverScreen
 * callsite so the global save input is suppressed (plan Section 4 isolation).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameDifficulty,
  GameDuration,
  LeaderboardStrategy,
  ScenarioChallengeConfig,
} from '../../engine/types';
import { useAuthStore } from '../../hooks/useAuth';
import { getRankColor, getGradeColor } from '../../utils/gradeColors';
import {
  fetchScenarioLeaderboard,
  formatRankingMetric,
  submitScenarioChallenge,
  type ScenarioLeaderboardEntry,
} from '../../services/scenarioLeaderboard';

interface ScenarioChallengeResultSectionProps {
  config: ScenarioChallengeConfig;
  holdcoName: string;
  isAdminPreview: boolean;
  // Metrics — what we submit + what we display against `rankingMetric`
  enterpriseValue: number;
  founderEquityValue: number;
  founderPersonalWealth: number;
  score: number;
  grade: string;
  businessCount: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  grossMoic?: number;
  netIrr?: number;
  carryEarned?: number;
  strategy?: Partial<LeaderboardStrategy>;
  isLoggedIn: boolean;
  onSignUp: () => void;
  /** Phase 4 — round each trigger first fired. Empty / missing for scenarios
   * without triggers or when no triggers fired. */
  triggerFireRounds?: Record<string, number>;
}

const TOP_N = 10;

export function ScenarioChallengeResultSection({
  config,
  holdcoName,
  isAdminPreview,
  enterpriseValue,
  founderEquityValue,
  founderPersonalWealth,
  score,
  grade,
  businessCount,
  difficulty,
  duration,
  grossMoic,
  netIrr,
  carryEarned,
  strategy,
  isLoggedIn,
  onSignUp,
  triggerFireRounds,
}: ScenarioChallengeResultSectionProps) {
  const [initials, setInitials] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [savedRank, setSavedRank] = useState<number | null>(null);

  const [entries, setEntries] = useState<ScenarioLeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const currentPlayerId = useAuthStore(s => s.player?.id);

  // Tick every 60s so a user idle on GameOverScreen across the 24h grace boundary
  // sees the SaveInput → ClosedBanner transition without needing to refresh. Dara M6.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const endMs = Date.parse(config.endDate);
  const GRACE_MS = 24 * 60 * 60 * 1000;
  const isArchived = Number.isFinite(endMs) && nowTick > endMs;
  // Mirror server's `endDate + 24h grace` — UI shows "submissions closed" once over.
  const submissionsClosed = Number.isFinite(endMs) && nowTick > endMs + GRACE_MS;

  // Phase 5 — apply milestone FEV multiplier to the displayed value when the
  // ranking metric is FEV. Server re-computes the same multiplier from the
  // submitted triggeredTriggerIds (commit 3) so leaderboard + display agree.
  // Other ranking metrics (moic, irr, gpCarry, cashOnCash) are PE-only and
  // not affected — applyFevMultiplier specifically targets FEV.
  const fevMultiplier = config.rankingMetric === 'fev'
    ? computeFevMultiplier(config, triggerFireRounds)
    : 1;
  const adjustedFEV = Math.round(founderEquityValue * fevMultiplier);

  const playerMetric = formatRankingMetric(config.rankingMetric, {
    founderEquityValue: adjustedFEV,
    grossMoic,
    netIrr,
    carryEarned,
  });

  // Track mount so post-save refetch (fired from event handler) doesn't setState on
  // an unmounted component when the user clicks Play Again mid-fetch. Dara H1.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadEntries = useCallback(() => {
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    fetchScenarioLeaderboard(config.id, TOP_N)
      .then(res => {
        if (!mountedRef.current) return;
        setEntries(res.entries);
        setLeaderboardLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLeaderboardError(true);
        setLeaderboardLoading(false);
      });
  }, [config.id]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSave = async () => {
    if (initials.length < 2 || hasSaved || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await submitScenarioChallenge({
        scenarioChallengeId: config.id,
        holdcoName,
        initials: initials.toUpperCase(),
        enterpriseValue: Math.round(enterpriseValue),
        // Phase 5: send RAW founderEquityValue + triggeredTriggerIds. Server
        // applies the milestone FEV multiplier (server-authoritative) before
        // storing in the leaderboard so player can't spoof the multiplier.
        founderEquityValue: Math.round(founderEquityValue),
        founderPersonalWealth: Math.round(founderPersonalWealth),
        score,
        grade,
        businessCount,
        totalRounds: config.maxRounds,
        difficulty,
        duration,
        isAdminPreview: isAdminPreview || undefined,
        grossMoic,
        netIrr,
        carryEarned,
        strategy,
        triggeredTriggerIds: triggerFireRounds ? Object.keys(triggerFireRounds) : undefined,
      });
      setHasSaved(true);
      setSavedRank(typeof res.rank === 'number' ? res.rank : null);
      // Refresh — save bumps the ranking; admin preview never lands an entry.
      if (!res.previewed) loadEntries();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  // Header color accent comes from the scenario theme — fall back to amber if unset.
  const accent = config.theme.color || '#f59e0b';

  return (
    <div className="card mb-6" style={{ borderColor: `${accent}40` }}>
      {/* ── Header ── */}
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-white/10">
        <span className="text-3xl" aria-hidden>{config.theme.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold" style={{ color: accent }}>
              {config.name}
            </h3>
            {isAdminPreview && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/30 text-amber-200">
                PREVIEW
              </span>
            )}
            {isArchived && !isAdminPreview && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-500/30 text-slate-200">
                ARCHIVED
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm mt-0.5">{config.tagline}</p>
        </div>
      </div>

      {/* ── Your Result ── */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide">Your {playerMetric.label}</p>
            <p className="font-mono tabular-nums text-2xl font-bold" style={{ color: accent }}>
              {playerMetric.display}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-muted uppercase tracking-wide">Score</p>
            <p className={`font-mono tabular-nums text-lg font-bold ${getGradeColor(grade)}`}>
              {score} ({grade})
            </p>
          </div>
        </div>
      </div>

      {/* ── Save / Saved / Preview / Closed ── */}
      {isAdminPreview ? (
        <PreviewBanner />
      ) : submissionsClosed ? (
        <ClosedBanner />
      ) : hasSaved ? (
        <SavedBanner rank={savedRank} isLoggedIn={isLoggedIn} onSignUp={onSignUp} />
      ) : (
        <SaveInput
          initials={initials}
          onInitialsChange={setInitials}
          onSave={handleSave}
          saving={saving}
          saveError={saveError}
          isArchived={isArchived}
        />
      )}

      {/* ── Phase 4: Scenario Milestones (triggers fired) ── */}
      <ScenarioMilestones config={config} triggerFireRounds={triggerFireRounds} />

      {/* ── Top 10 ── */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-sm font-bold text-text-secondary mb-3">
          Top {TOP_N}
          <span className="text-xs text-text-muted font-normal ml-2">
            · ranked by {playerMetric.label}
          </span>
        </p>

        {leaderboardLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {leaderboardError && !leaderboardLoading && (
          <div className="text-center text-text-muted py-4">
            <p className="text-sm">Failed to load scenario leaderboard.</p>
            <button onClick={loadEntries} className="btn-secondary text-sm mt-2">
              Retry
            </button>
          </div>
        )}

        {!leaderboardLoading && !leaderboardError && entries.length === 0 && (
          <p className="text-sm text-text-muted text-center py-4">
            No entries yet — you could be first.
          </p>
        )}

        {!leaderboardLoading && !leaderboardError && entries.length > 0 && (
          <div className="space-y-1.5">
            {entries.slice(0, TOP_N).map(entry => (
              <ScenarioEntryRow
                key={entry.id}
                entry={entry}
                rankingMetric={config.rankingMetric}
                isYou={!!currentPlayerId && entry.playerId === currentPlayerId}
                accent={accent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioEntryRow({
  entry,
  rankingMetric,
  isYou,
  accent,
}: {
  entry: ScenarioLeaderboardEntry;
  rankingMetric: ScenarioChallengeConfig['rankingMetric'];
  isYou: boolean;
  accent: string;
}) {
  const metric = formatRankingMetric(rankingMetric, {
    founderEquityValue: entry.founderEquityValue,
    grossMoic: entry.grossMoic,
    netIrr: entry.netIrr,
    carryEarned: entry.carryEarned,
    sortScore: entry.sortScore,
  });

  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
        isYou ? 'border' : 'bg-white/5'
      }`}
      style={isYou ? { backgroundColor: `${accent}20`, borderColor: `${accent}55` } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className={`text-sm font-bold tabular-nums w-8 text-center shrink-0 ${getRankColor(entry.rank)}`}
        >
          #{entry.rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">
            {entry.initials}
            {entry.playerId && (
              <span className="text-blue-300 ml-1 text-xs" title="Verified">✓</span>
            )}
            {isYou && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: `${accent}33`, color: accent }}
              >
                You
              </span>
            )}
          </p>
          <p className="text-[11px] text-text-muted truncate">{entry.holdcoName}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <div className="min-w-[4.5rem]">
          <p className="text-[10px] text-text-muted uppercase">{metric.label}</p>
          <p className="font-mono tabular-nums text-sm font-bold" style={{ color: accent }}>
            {metric.display}
          </p>
        </div>
        <div className="min-w-[3rem]">
          <p className="text-[10px] text-text-muted uppercase">Score</p>
          <p className={`font-mono tabular-nums text-sm ${getGradeColor(entry.grade)}`}>
            {entry.score} ({entry.grade})
          </p>
        </div>
      </div>
    </div>
  );
}

function SaveInput({
  initials,
  onInitialsChange,
  onSave,
  saving,
  saveError,
  isArchived,
}: {
  initials: string;
  onInitialsChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  isArchived: boolean;
}) {
  return (
    <div className="text-center">
      {isArchived && (
        <p className="text-xs text-amber-400/80 mb-2">
          Scenario has ended — submissions still open during the 24h grace period.
        </p>
      )}
      <p className="text-sm text-text-secondary mb-3">Enter your initials to submit to the scenario leaderboard.</p>
      <div className="flex items-center justify-center gap-3">
        <input
          type="text"
          value={initials}
          onChange={e => onInitialsChange(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())}
          placeholder="AAA"
          maxLength={4}
          className="w-20 sm:w-28 text-center text-2xl font-bold bg-white/10 border border-white/20 rounded-lg py-2 px-4 focus:outline-none focus:border-accent"
        />
        <button
          onClick={onSave}
          disabled={initials.length < 2 || saving}
          className="btn-primary text-sm sm:text-base min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : saveError ? 'Retry' : 'Submit Score'}
        </button>
      </div>
      {saveError && (
        <p className="text-red-400 text-sm mt-2">{saveError}</p>
      )}
    </div>
  );
}

function SavedBanner({
  rank,
  isLoggedIn,
  onSignUp,
}: {
  rank: number | null;
  isLoggedIn: boolean;
  onSignUp: () => void;
}) {
  return (
    <div className="text-center" role="status" aria-live="polite">
      <p className="text-accent font-bold text-lg mb-1">Saved to scenario leaderboard!</p>
      {rank != null && <p className="text-text-muted text-sm">Rank #{rank}</p>}
      {!isLoggedIn && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-sm text-text-secondary mb-3">
            Create a free account to track your scenario history and unlock achievements.
          </p>
          <button onClick={onSignUp} className="btn-primary w-full min-h-[44px] text-sm font-medium">
            Create Account (Free)
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="text-center py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <p className="text-amber-300 font-bold text-sm">Preview run — not submitted</p>
      <p className="text-xs text-amber-400/70 mt-1">
        Admin preview drops the completion server-side. Only the leaderboard preview below is live.
      </p>
    </div>
  );
}

/**
 * Phase 5 — compute the cumulative FEV multiplier from fired-trigger IDs and the
 * scenario config. Mirrors `resolveFevMultiplier` in scenarioRules.ts but takes
 * the simpler (config, triggerFireRounds) shape since this component already
 * has those props. Capped at 5× — same as MAX_FEV_MULTIPLIER.
 */
function computeFevMultiplier(
  config: ScenarioChallengeConfig,
  triggerFireRounds: Record<string, number> | undefined,
): number {
  if (!config.triggers || !triggerFireRounds) return 1;
  const MAX = 5;
  const fired = new Set(Object.keys(triggerFireRounds));
  let mult = 1;
  for (const t of config.triggers) {
    if (!fired.has(t.id)) continue;
    for (const a of t.actions) {
      if (a.type === 'applyFevMultiplier' && Number.isFinite(a.value) && a.value > 0) {
        mult *= a.value;
      }
    }
  }
  return Math.min(mult, MAX);
}

function ClosedBanner() {
  return (
    <div className="text-center py-3 rounded-lg bg-slate-500/10 border border-slate-500/30">
      <p className="text-slate-300 font-bold text-sm">Submissions closed</p>
      <p className="text-xs text-text-muted mt-1">
        This scenario ended more than 24 hours ago.
      </p>
    </div>
  );
}

/**
 * Phase 4 + 5 — Scenario Milestones timeline. Renders the triggers the player
 * fired during the run, in chronological order, with the round each fired.
 * Hidden when the scenario has no triggers OR none fired.
 *
 * Phase 5 enrichment: per-trigger FEV multiplier badge + cumulative-multiplier
 * footer showing the total bonus applied to the player's final FEV. Cap at 5×
 * mirrors MAX_FEV_MULTIPLIER in scenarioRules.ts.
 */
function ScenarioMilestones({
  config,
  triggerFireRounds,
}: {
  config: ScenarioChallengeConfig;
  triggerFireRounds?: Record<string, number>;
}) {
  if (!config.triggers || config.triggers.length === 0) return null;
  if (!triggerFireRounds || Object.keys(triggerFireRounds).length === 0) return null;

  // Pull narrative for each fired trigger by id; sort by round, then by config order.
  const fired = config.triggers
    .filter(t => triggerFireRounds[t.id] !== undefined)
    .map(t => ({ trigger: t, round: triggerFireRounds[t.id] }))
    .sort((a, b) => a.round - b.round);

  if (fired.length === 0) return null;

  // Compute per-trigger multiplier value + cumulative total (capped at 5×).
  const MAX_MULT = 5;
  const multiplierByTriggerId: Record<string, number> = {};
  let cumulative = 1;
  for (const t of config.triggers) {
    const mult = t.actions
      .filter(a => a.type === 'applyFevMultiplier')
      .reduce((p, a) => p * (a as { type: 'applyFevMultiplier'; value: number }).value, 1);
    if (mult !== 1) multiplierByTriggerId[t.id] = mult;
    if (triggerFireRounds[t.id] !== undefined && mult !== 1) cumulative *= mult;
  }
  const totalMultiplier = Math.min(cumulative, MAX_MULT);
  const showTotal = totalMultiplier !== 1;

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <p className="text-sm font-bold text-text-secondary mb-3">
        Scenario Milestones
        <span className="text-xs text-text-muted font-normal ml-2">
          · {fired.length} of {config.triggers.length} triggered
        </span>
      </p>
      <div className="space-y-2">
        {fired.map(({ trigger, round }) => {
          const mult = multiplierByTriggerId[trigger.id];
          return (
            <div
              key={trigger.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/5"
            >
              <span className="text-xs font-mono tabular-nums text-amber-400 shrink-0 mt-0.5">
                Y{round}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-text-primary">{trigger.narrative.title}</p>
                  {mult !== undefined && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 font-mono">
                      {mult.toFixed(2)}× FEV
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">{trigger.narrative.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      {showTotal && (
        <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-baseline justify-between text-sm">
          <span className="text-text-secondary">Total milestone bonus applied to FEV</span>
          <span className="font-mono font-bold text-amber-300 tabular-nums">
            {totalMultiplier.toFixed(2)}×
            {cumulative > MAX_MULT && <span className="text-[10px] text-text-muted ml-1">(capped at {MAX_MULT}×)</span>}
          </span>
        </div>
      )}
    </div>
  );
}
