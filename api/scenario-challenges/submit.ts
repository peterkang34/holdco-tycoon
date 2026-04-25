/**
 * POST /api/scenario-challenges/submit
 *
 * Player scenario-completion submit — writes to `scenario:{id}:leaderboard`
 * ONLY. Never touches the global `leaderboard:v2` KV key. That isolation is
 * load-bearing per plan Section 4.
 *
 * Scope (what this endpoint owns):
 *   - Validate the payload (required + bounds)
 *   - Resolve the submitter identity (anon vs verified) via leaderboardCore
 *   - Compute the sort score from the scenario's configured `rankingMetric`
 *   - Write to the scenario sorted set (with prune) via leaderboardCore
 *   - Dual-write to game_history with `scenario_challenge_id` tag
 *   - Drop admin-preview submissions entirely (no KV/Postgres write)
 *   - Honor the `endDate + 24h` grace period
 *
 * Scope (what this endpoint does NOT own):
 *   - Global leaderboard submission (see api/leaderboard/submit.ts)
 *   - Auto-save pathway (see api/game-history/save.ts)
 *   - Auto-attaching playbooks (deferred; playbook is written via save.ts)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { kv } from '@vercel/kv';
import { isBodyTooLarge } from '../_lib/rateLimit.js';
import {
  scenarioConfigKey,
  scenarioLeaderboardKey,
  MAX_SCENARIO_ENTRIES,
} from '../_lib/leaderboard.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';
import {
  checkSubmitRateLimit,
  resolvePlayerIdentity,
  upsertPlayerProfile,
  writeLeaderboardEntry,
  upsertGameHistoryRow,
} from '../_lib/leaderboardCore.js';

const RATE_LIMIT_SECONDS = 60;
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24h after endDate per plan Section 3.11

const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
const VALID_DURATIONS = ['standard', 'quick'] as const;
const HOLDCO_NAME_REGEX = /^[A-Za-z0-9 &'.,\-]+$/;
// Lowercase-only — matches admin CRUD regex; KV keys are case-sensitive.
const SCENARIO_ID_REGEX = /^[a-z0-9-]{1,60}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBodyTooLarge(req.body, 25000)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const body = req.body || {};

    // ── Validation ──────────────────────────────────────────────────

    const scenarioChallengeId = typeof body.scenarioChallengeId === 'string' && SCENARIO_ID_REGEX.test(body.scenarioChallengeId)
      ? body.scenarioChallengeId.trim() : null;
    if (!scenarioChallengeId) {
      return res.status(400).json({ error: 'scenarioChallengeId is required (valid slug format)' });
    }

    const { holdcoName, initials, enterpriseValue, score, grade, businessCount,
      totalRounds, difficulty, duration, founderEquityValue, founderPersonalWealth,
      strategy, grossMoic, netIrr, carryEarned } = body;

    if (typeof initials !== 'string' || !/^[A-Z]{2,4}$/.test(initials)) {
      return res.status(400).json({ error: 'initials must be 2-4 uppercase letters' });
    }
    if (typeof holdcoName !== 'string' || holdcoName.trim().length === 0 || holdcoName.length > 50) {
      return res.status(400).json({ error: 'holdcoName must be 1-50 non-empty characters' });
    }
    if (!HOLDCO_NAME_REGEX.test(holdcoName.trim())) {
      return res.status(400).json({ error: 'holdcoName contains invalid characters' });
    }
    if (typeof enterpriseValue !== 'number' || enterpriseValue < 0 || enterpriseValue > 20_000_000_000) {
      return res.status(400).json({ error: 'enterpriseValue must be between 0 and 20,000,000,000' });
    }
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'score must be an integer between 0 and 100' });
    }
    if (!VALID_GRADES.includes(grade)) {
      return res.status(400).json({ error: 'grade must be one of S, A, B, C, D, F' });
    }
    if (typeof businessCount !== 'number' || !Number.isInteger(businessCount) || businessCount < 0 || businessCount > 30) {
      return res.status(400).json({ error: 'businessCount must be an integer between 0 and 30' });
    }
    // Scenarios accept any positive integer in [3, 30] for totalRounds — that's the
    // whole point of having scenarios (vs global leaderboard's hard 10/20 gate).
    if (typeof totalRounds !== 'number' || !Number.isInteger(totalRounds) || totalRounds < 3 || totalRounds > 30) {
      return res.status(400).json({ error: 'totalRounds must be an integer in [3, 30]' });
    }

    const validDifficulty = typeof difficulty === 'string' && (VALID_DIFFICULTIES as readonly string[]).includes(difficulty)
      ? difficulty : 'easy';
    const validDuration = typeof duration === 'string' && (VALID_DURATIONS as readonly string[]).includes(duration)
      ? duration : 'standard';

    const FEV_CAP = 10_000_000_000;
    const validFEV = typeof founderEquityValue === 'number' && founderEquityValue >= 0 && founderEquityValue <= FEV_CAP
      ? Math.round(founderEquityValue) : Math.round(Math.min(enterpriseValue, FEV_CAP));
    const validPersonalWealth = typeof founderPersonalWealth === 'number' && founderPersonalWealth >= 0 && founderPersonalWealth <= FEV_CAP
      ? Math.round(founderPersonalWealth) : 0;

    // ── Admin preview: drop ALL server work (plan Section 7.3) ───────
    //
    // Preview clicks happen during admin wizard iteration — possibly before the
    // scenario is even saved to KV. Hoisting above the config lookup means:
    //   - zero KV reads
    //   - zero Supabase profile writes (no `last_played_at` mutation)
    //   - zero rate-limit slot consumption
    // Dara H1 from Phase 3A review. Client still validates scenarioChallengeId
    // regex above so we aren't accepting total garbage.

    if (body.isAdminPreview === true) {
      return res.status(200).json({ success: true, previewed: true });
    }

    // ── Scenario existence + grace-period check ──────────────────────

    const rawConfig = await kv.get<unknown>(scenarioConfigKey(scenarioChallengeId));
    if (!rawConfig) {
      return res.status(410).json({ error: 'Scenario no longer available' });
    }
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(410).json({ error: 'Scenario config invalid' });
    }
    const c = config as Record<string, unknown>;

    // Fail closed on malformed endDate: a missing/unparseable endDate would otherwise let
    // a scenario accept submissions indefinitely (Dara H2). Phase 3B admin CRUD enforces
    // endDate at config-write time, but defense-in-depth catches config corruption.
    const endMs = typeof c.endDate === 'string' ? Date.parse(c.endDate) : NaN;
    if (!Number.isFinite(endMs)) {
      return res.status(410).json({ error: 'Scenario config missing valid endDate' });
    }
    if (Date.now() > endMs + GRACE_PERIOD_MS) {
      return res.status(410).json({ error: 'Scenario ended more than 24h ago — submissions closed' });
    }

    // ── Rate limit ───────────────────────────────────────────────────

    if (await checkSubmitRateLimit(req, { namespace: 'scenario-challenges', windowSeconds: RATE_LIMIT_SECONDS })) {
      return res.status(429).json({ error: 'Rate limited. One submission per 60 seconds.' });
    }

    // ── Player identity ──────────────────────────────────────────────

    const { playerId, verifiedPlayerId } = await resolvePlayerIdentity(req);
    const entryDate = new Date().toISOString();
    const { publicProfileId } = playerId
      ? await upsertPlayerProfile({ playerId, verifiedPlayerId, initials, entryDate })
      : { publicProfileId: undefined };

    // ── Phase 5: milestone FEV multiplier (server-authoritative) ─────
    // Client sends raw founderEquityValue + triggeredTriggerIds. Server reads
    // the scenario config (already loaded above as `c`), looks up each fired
    // trigger ID's applyFevMultiplier action, multiplies them together, caps
    // at MAX_FEV_MULTIPLIER (5×), and applies to the FEV used for both the
    // leaderboard entry AND the sort score. Client-side display is informational.
    //
    // Security: bogus trigger IDs in the client payload are silently ignored
    // (lookup misses → no multiplier). Player can only claim multipliers that
    // (a) exist in the scenario config and (b) have an applyFevMultiplier action.
    // Whether they actually EARNED them is trusted at the same level as the
    // raw FEV / grossMoic / etc. fields above — there's no anti-cheat snapshot
    // verification in v1.

    const submittedTriggerIds = Array.isArray(body.triggeredTriggerIds)
      ? body.triggeredTriggerIds.filter((t: unknown): t is string => typeof t === 'string')
      : [];
    const fevMultiplier = computeFevMultiplier(c, submittedTriggerIds);
    const adjustedFEV = Math.round(validFEV * fevMultiplier);

    // ── Compute sort score from rankingMetric ────────────────────────

    const rankingMetric = String(c.rankingMetric ?? 'fev');
    const sortScore = computeSortScore(
      rankingMetric,
      {
        founderEquityValue: adjustedFEV,
        grossMoic: typeof grossMoic === 'number' ? grossMoic : null,
        netIrr: typeof netIrr === 'number' ? netIrr : null,
        carryEarned: typeof carryEarned === 'number' ? carryEarned : null,
      },
      scenarioChallengeId,
    );

    // ── Build entry + write to scenario KV sorted set ────────────────

    const id = randomUUID();
    const entry = {
      id,
      scenarioChallengeId,
      holdcoName: holdcoName.trim(),
      initials,
      enterpriseValue: Math.round(enterpriseValue),
      // Phase 5: store the ADJUSTED FEV (raw × milestone multiplier, capped 5×)
      // so leaderboard reads + UI display agree. `rawFounderEquityValue` keeps
      // the pre-multiplier value for analytics + game-history dual-write.
      founderEquityValue: adjustedFEV,
      rawFounderEquityValue: validFEV,
      fevMultiplier,
      triggeredTriggerIds: submittedTriggerIds.length > 0 ? submittedTriggerIds : undefined,
      founderPersonalWealth: validPersonalWealth,
      difficulty: validDifficulty,
      duration: validDuration,
      totalRounds,
      score,
      grade,
      businessCount,
      date: entryDate,
      rankingMetric,
      ...(typeof grossMoic === 'number' ? { grossMoic: Math.round(grossMoic * 100) / 100 } : {}),
      ...(typeof netIrr === 'number' ? { netIrr: Math.round(netIrr * 10000) / 10000 } : {}),
      ...(typeof carryEarned === 'number' ? { carryEarned: Math.round(carryEarned) } : {}),
      ...(verifiedPlayerId ? { playerId: verifiedPlayerId } : {}),
      ...(playerId ? { submittedBy: playerId } : {}),
      ...(publicProfileId ? { publicProfileId } : {}),
    };

    const entryJson = JSON.stringify(entry);
    const { rank } = await writeLeaderboardEntry({
      kvKey: scenarioLeaderboardKey(scenarioChallengeId),
      entryJson,
      sortScore,
      maxEntries: MAX_SCENARIO_ENTRIES,
    });

    // ── Dual-write to game_history (if authenticated) ────────────────

    if (playerId) {
      await upsertGameHistoryRow({
        playerId,
        match: { score, grade, difficulty: validDifficulty, scenario_challenge_id: scenarioChallengeId },
        enrichFields: {
          leaderboard_entry_id: id,
          initials,
          holdco_name: holdcoName.trim(),
          scenario_challenge_id: scenarioChallengeId,
        },
        insertRow: {
          player_id: playerId,
          holdco_name: holdcoName.trim(),
          initials,
          difficulty: validDifficulty,
          duration: validDuration,
          enterprise_value: Math.round(enterpriseValue),
          founder_equity_value: validFEV,
          founder_personal_wealth: validPersonalWealth,
          adjusted_fev: validFEV, // no difficulty multiplier — all scenario players face identical conditions
          score,
          grade,
          submitted_multiplier: 1.0,
          business_count: businessCount,
          strategy: sanitizeStrategy(strategy),
          scenario_challenge_id: scenarioChallengeId,
          is_admin_preview: false,
          leaderboard_entry_id: id,
          completed_at: entryDate,
        },
      });

      // Pre-computed stats refresh (non-blocking)
      updatePlayerStats(playerId).catch(console.error);
      updateGlobalStats().catch(console.error);
    }

    return res.status(200).json({ success: true, id, rank });
  } catch (err) {
    console.error('scenario-challenges/submit error:', err);
    return res.status(500).json({ error: 'Failed to submit scenario score' });
  }
}

/**
 * Map a ranking metric to the numeric sort score written to the KV sorted set.
 * Ordering: higher is better (leaderboard reads via `zrange ... rev`).
 *
 *   fev         → raw founder equity value (in $K, already integer)
 *   moic        → gross MOIC × 100000 (match global PE proxy: 2.5x → 250_000)
 *   irr         → net IRR × 1_000_000 (0.22 IRR → 220_000)
 *   gpCarry     → raw carry captured ($K)
 *   cashOnCash  → same shape as MOIC for now. Realized-vs-realized+NAV distinction
 *                 is deferred — Phase 3B admin CRUD should NOT expose cashOnCash
 *                 as a selectable metric until the payload distinguishes the two
 *                 (add a realizedMoic field). See Dara H3 from Phase 3A review.
 *
 * Unknown metrics log a warning and fall back to FEV — a scenario config
 * typo in the metric name would otherwise produce a "working" leaderboard
 * scoring on the wrong axis.
 */
function computeSortScore(
  metric: string,
  inputs: { founderEquityValue: number; grossMoic: number | null; netIrr: number | null; carryEarned: number | null },
  scenarioId: string,
): number {
  switch (metric) {
    case 'fev':
      return inputs.founderEquityValue;
    case 'moic':
    case 'cashOnCash':
      return inputs.grossMoic != null ? Math.round(inputs.grossMoic * 100_000) : 0;
    case 'irr':
      return inputs.netIrr != null ? Math.round(inputs.netIrr * 1_000_000) : 0;
    case 'gpCarry':
      return inputs.carryEarned != null ? Math.round(inputs.carryEarned) : 0;
    default:
      console.warn(
        `scenario-challenges/submit: scenario '${scenarioId}' has unknown rankingMetric '${metric}'; falling back to FEV. Fix the scenario config.`,
      );
      return inputs.founderEquityValue;
  }
}

/**
 * Phase 5 — server-authoritative FEV multiplier. Walks the scenario config's
 * triggers, finds those whose IDs are in the submitted `triggeredTriggerIds`
 * list, sums their applyFevMultiplier action values multiplicatively, caps at
 * MAX_FEV_MULTIPLIER. Bogus IDs are silently ignored (lookup miss = 1×).
 *
 * Mirrors `resolveFevMultiplier` in src/engine/scenarioRules.ts. Two impls
 * because api/ can't import src/ values without ESM extension cascades — kept
 * in lockstep manually + the structural test in scenario-rules.test.ts (client)
 * + this endpoint's test suite (server).
 */
const MAX_FEV_MULTIPLIER = 5;
function computeFevMultiplier(
  config: Record<string, unknown>,
  submittedTriggerIds: string[],
): number {
  const triggers = config.triggers;
  if (!Array.isArray(triggers) || triggers.length === 0) return 1;
  if (submittedTriggerIds.length === 0) return 1;
  const fired = new Set(submittedTriggerIds);
  let mult = 1;
  for (const t of triggers) {
    if (!t || typeof t !== 'object') continue;
    const trigger = t as { id?: unknown; actions?: unknown };
    if (typeof trigger.id !== 'string' || !fired.has(trigger.id)) continue;
    if (!Array.isArray(trigger.actions)) continue;
    for (const a of trigger.actions) {
      if (!a || typeof a !== 'object') continue;
      const action = a as { type?: unknown; value?: unknown };
      if (action.type === 'applyFevMultiplier' && typeof action.value === 'number'
          && Number.isFinite(action.value) && action.value > 0) {
        mult *= action.value;
      }
    }
  }
  return Math.min(mult, MAX_FEV_MULTIPLIER);
}

/**
 * Minimal strategy sanitizer — matches the shape global submit accepts but
 * only keeps fields useful for scenario analytics. Heavy fields (playbook,
 * earnedAchievementIds) are intentionally dropped since scenarios don't
 * contribute to global achievements per plan Section 0.
 */
function sanitizeStrategy(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const passthrough = [
    'scoreBreakdown', 'archetype', 'sophisticationScore', 'sectorIds',
    'platformsForged', 'totalAcquisitions', 'totalSells', 'totalDistributions',
    'totalBuybacks', 'peakLeverage', 'activeCount', 'peakActiveCount',
    'sharedServicesActive', 'isBankrupt', 'lpSatisfaction', 'grossMoic', 'netIrr',
  ];
  for (const k of passthrough) {
    if (s[k] !== undefined) out[k] = s[k];
  }
  return Object.keys(out).length > 0 ? out : null;
}
