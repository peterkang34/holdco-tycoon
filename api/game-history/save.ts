import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { getClientIp, isBodyTooLarge, sanitizeString } from '../_lib/rateLimit.js';
import { DIFFICULTY_MULTIPLIER } from '../_lib/leaderboard.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updatePlayerStats } from '../_lib/playerStats.js';
import { validatePlaybook } from '../_lib/playbookValidation.js';

const RATE_LIMIT_SECONDS = 60;
const RATE_LIMIT_MAX = 5;
const RESTRUCTURING_FEV_PENALTY = 0.80;

const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
const VALID_DURATIONS = ['standard', 'quick'] as const;

/**
 * POST /api/game-history/save
 * Auto-save game to game_history for authenticated players.
 * Fire-and-forget — always returns { ok: true }.
 * Dedup via completion_id UNIQUE index (ON CONFLICT DO NOTHING for core,
 * ON CONFLICT DO UPDATE for playbook attachment).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ok = () => res.status(200).json({ ok: true });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isBodyTooLarge(req.body, 100_000)) return ok(); // 100KB max (playbook can be large)

  try {
    // --- Auth: must have a valid JWT ---
    const playerId = await getPlayerIdFromToken(req);
    if (!playerId) return ok(); // Not authenticated — silent no-op

    if (!supabaseAdmin) return ok(); // DB not configured

    const body = req.body || {};

    // --- Rate limit ---
    const ip = getClientIp(req);
    try {
      const { kv } = await import('@vercel/kv');
      const key = `ratelimit:gamesave:${ip}`;
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, RATE_LIMIT_SECONDS);
      if (count > RATE_LIMIT_MAX) return ok();
    } catch { /* fail-open */ }

    // --- Validate core fields ---
    const holdcoName = sanitizeString(typeof body.holdcoName === 'string' ? body.holdcoName : '', 50);
    if (!holdcoName) return ok();

    const score = typeof body.score === 'number' && body.score >= 0 && body.score <= 100 ? Math.round(body.score) : null;
    if (score === null) return ok();

    const grade = typeof body.grade === 'string' && (VALID_GRADES as readonly string[]).includes(body.grade) ? body.grade : null;
    if (!grade) return ok();

    const difficulty = typeof body.difficulty === 'string' && (VALID_DIFFICULTIES as readonly string[]).includes(body.difficulty) ? body.difficulty as 'easy' | 'normal' : 'easy';
    const duration = typeof body.duration === 'string' && (VALID_DURATIONS as readonly string[]).includes(body.duration) ? body.duration : 'standard';
    const seed = typeof body.seed === 'number' ? body.seed : null;

    // --- Compute completion_id for dedup (server-side, not client-provided) ---
    const completionId = `${playerId}-${seed ?? 0}-${difficulty}-${duration}-${score}-${grade}`;

    // --- Compute adjusted FEV ---
    const FEV_CAP = 10_000_000_000; // $10T in thousands
    const rawFev = typeof body.founderEquityValue === 'number' ? Math.round(body.founderEquityValue) : 0;
    const fev = Math.min(Math.max(rawFev, 0), FEV_CAP);
    const multiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0;
    const hasRestructured = body.hasRestructured === true;
    const foMultiplier = typeof body.foMultiplier === 'number' && body.foMultiplier >= 1.0 && body.foMultiplier <= 1.5 ? body.foMultiplier : 1.0;
    const adjustedFEV = Math.round(fev * multiplier * (hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0) * foMultiplier);

    // --- Extract optional fields ---
    const enterpriseValue = typeof body.enterpriseValue === 'number' ? Math.min(Math.round(body.enterpriseValue), 20_000_000_000) : 0;
    const personalWealth = typeof body.founderPersonalWealth === 'number' ? Math.round(body.founderPersonalWealth) : null;
    const businessCount = typeof body.businessCount === 'number' ? Math.min(30, Math.max(0, Math.round(body.businessCount))) : 0;
    const totalRevenue = typeof body.totalRevenue === 'number' ? Math.round(body.totalRevenue) : null;
    const avgEbitdaMargin = typeof body.avgEbitdaMargin === 'number' ? Math.round(body.avgEbitdaMargin * 1000) / 1000 : null;
    const familyOfficeCompleted = body.familyOfficeCompleted === true;
    const legacyGrade = typeof body.legacyGrade === 'string' && ['Enduring', 'Influential', 'Established', 'Fragile'].includes(body.legacyGrade) ? body.legacyGrade : null;
    const maxRounds = body.totalRounds === 10 || body.totalRounds === 20 ? body.totalRounds : (duration === 'quick' ? 10 : 20);

    // --- Strategy object (sanitize) ---
    let validStrategy: Record<string, unknown> | null = null;
    if (body.strategy && typeof body.strategy === 'object') {
      const s = body.strategy as Record<string, unknown>;
      validStrategy = {};
      // Copy safe fields
      for (const key of ['scoreBreakdown', 'archetype', 'sophisticationScore', 'antiPatterns', 'sectorIds',
        'dealStructureTypes', 'platformsForged', 'totalAcquisitions', 'totalSells', 'totalDistributions',
        'totalBuybacks', 'equityRaisesUsed', 'peakLeverage', 'turnaroundsStarted', 'turnaroundsSucceeded',
        'turnaroundsFailed', 'maSourcingTier', 'sharedServicesActive', 'rolloverEquityCount', 'totalDebt',
        'activeCount', 'peakActiveCount', 'recessionAcquisitionCount', 'lpSatisfaction', 'isBankrupt',
        'sellerNotesTotal', 'earnedAchievementIds', 'isFundManager', 'fundName', 'carryEarned', 'netIrr',
        'grossMoic', 'smartExitMoic', 'aiDebrief']) {
        if (s[key] !== undefined) validStrategy[key] = s[key];
      }
    }

    // --- Playbook (optional, step 2) ---
    const validPlaybook = body.playbook ? validatePlaybook(body.playbook) : null;
    const playbookShareId = validPlaybook ? randomUUID().replace(/-/g, '').slice(0, 12) : undefined;

    // --- Extract score breakdown dimensions ---
    const scoreBreakdown = validStrategy?.scoreBreakdown as Record<string, number> | undefined;

    // --- Ensure player_profiles row exists (defensive — trigger was dropped) ---
    const now = new Date().toISOString();
    try {
      const publicId = randomUUID().replace(/-/g, '').slice(0, 12);
      await supabaseAdmin.from('player_profiles').upsert({
        id: playerId,
        initials: 'AA',
        public_id: publicId,
        created_at: now,
        updated_at: now,
      }, { onConflict: 'id', ignoreDuplicates: true });
    } catch (err) { console.error('game-history profile upsert failed:', err); }

    // --- Initials: prefer client-sent, fallback to profile, then 'AA' ---
    const clientInitials = typeof body.initials === 'string'
      && /^[A-Z]{2,4}$/.test(body.initials) ? body.initials : null;
    let initials = clientInitials || 'AA';
    if (!clientInitials) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('player_profiles')
          .select('initials')
          .eq('id', playerId)
          .single();
        if (profile?.initials && profile.initials !== 'AA') initials = profile.initials;
      } catch { /* use default */ }
    }

    // --- Insert game_history row ---
    const row: Record<string, unknown> = {
      player_id: playerId,
      holdco_name: holdcoName,
      initials,
      difficulty,
      duration,
      seed,
      enterprise_value: enterpriseValue,
      founder_equity_value: fev,
      founder_personal_wealth: personalWealth,
      adjusted_fev: adjustedFEV,
      score,
      grade,
      submitted_multiplier: multiplier,
      business_count: businessCount,
      total_revenue: totalRevenue,
      avg_ebitda_margin: avgEbitdaMargin,
      has_restructured: hasRestructured,
      family_office_completed: familyOfficeCompleted,
      legacy_grade: legacyGrade,
      fo_multiplier: foMultiplier > 1.0 ? foMultiplier : null,
      strategy: validStrategy,
      completion_id: completionId,
      completed_at: new Date().toISOString(),
      ...(scoreBreakdown ? {
        score_value_creation: scoreBreakdown.valueCreation,
        score_fcf_share_growth: scoreBreakdown.fcfShareGrowth,
        score_portfolio_roic: scoreBreakdown.portfolioRoic,
        score_capital_deployment: scoreBreakdown.capitalDeployment,
        score_balance_sheet: scoreBreakdown.balanceSheetHealth,
        score_strategic_discipline: scoreBreakdown.strategicDiscipline,
      } : {}),
    };

    // Add playbook if present (step 2 call)
    if (validPlaybook) {
      row.playbook = validPlaybook;
      row.playbook_share_id = playbookShareId;
    }

    if (validPlaybook) {
      // Step 2: upsert with playbook (ON CONFLICT DO UPDATE)
      await supabaseAdmin
        .from('game_history')
        .upsert(row, { onConflict: 'completion_id' });
    } else {
      // Step 1: insert core data (ON CONFLICT DO NOTHING — dedup)
      await supabaseAdmin
        .from('game_history')
        .upsert(row, { onConflict: 'completion_id', ignoreDuplicates: true });
    }

    // --- Update profile last_played_at ---
    supabaseAdmin
      .from('player_profiles')
      .update({ last_played_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', playerId)
      .then(() => {})
      .catch(() => {});

    // --- Update player stats (non-blocking) ---
    updatePlayerStats(playerId).catch(() => {});

    return ok();
  } catch (error) {
    console.error('Game history save error:', error);
    return ok(); // Always return ok — fire-and-forget
  }
}
