import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import { LEADERBOARD_KEY, DIFFICULTY_MULTIPLIER } from '../_lib/leaderboard.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';

const MAX_ENTRIES = 500;
const RATE_LIMIT_SECONDS = 60;

const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type Grade = typeof VALID_GRADES[number];
const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
const VALID_DURATIONS = ['standard', 'quick'] as const;

// Allowlist: alphanumeric, spaces, and common business name chars
const HOLDCO_NAME_REGEX = /^[A-Za-z0-9 &'.,\-]+$/;

function gradeMatchesScore(grade: Grade, score: number): boolean {
  switch (grade) {
    case 'S': return score >= 95;
    case 'A': return score >= 82 && score < 95;
    case 'B': return score >= 65 && score < 82;
    case 'C': return score >= 45 && score < 65;
    case 'D': return score >= 25 && score < 45;
    case 'F': return score < 25;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const body = req.body;

    // --- Validation ---
    const {
      holdcoName,
      initials,
      enterpriseValue,
      score,
      grade,
      businessCount,
      totalRounds,
      totalInvestedCapital,
      totalRevenue,
      avgEbitdaMargin,
      difficulty,
      duration,
      founderEquityValue,
      founderPersonalWealth,
      hasRestructured,
      familyOfficeCompleted,
      legacyGrade,
      foMultiplier,
      strategy,
      isFundManager,
      fundName,
      netIrr,
      grossMoic,
      carryEarned,
    } = body || {};

    const isPE = isFundManager === true;

    // initials: 2-4 uppercase alpha chars
    if (typeof initials !== 'string' || !/^[A-Z]{2,4}$/.test(initials)) {
      return res.status(400).json({ error: 'initials must be 2-4 uppercase letters' });
    }

    // holdcoName: 1-50 chars, non-empty, safe characters only
    if (typeof holdcoName !== 'string' || holdcoName.trim().length === 0 || holdcoName.length > 50) {
      return res.status(400).json({ error: 'holdcoName must be 1-50 non-empty characters' });
    }
    if (!HOLDCO_NAME_REGEX.test(holdcoName.trim())) {
      return res.status(400).json({ error: 'holdcoName contains invalid characters' });
    }

    // enterpriseValue: number, 0 ≤ EV ≤ 100,000,000,000 ($100T)
    if (typeof enterpriseValue !== 'number' || enterpriseValue < 0 || enterpriseValue > 100000000000) {
      return res.status(400).json({ error: 'enterpriseValue must be between 0 and 100,000,000,000' });
    }

    // score: integer, 0 ≤ score ≤ 100
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'score must be an integer between 0 and 100' });
    }

    // grade: valid grade
    if (!VALID_GRADES.includes(grade)) {
      return res.status(400).json({ error: 'grade must be one of S, A, B, C, D, F' });
    }

    // grade must match score range
    // PE uses different grade thresholds (S:90, A:75, B:60, C:40, D:20) — skip holdco validation
    if (!isPE && !gradeMatchesScore(grade as Grade, score)) {
      return res.status(400).json({ error: 'grade does not match score range' });
    }

    // businessCount: integer, 0 ≤ count ≤ 30
    if (typeof businessCount !== 'number' || !Number.isInteger(businessCount) || businessCount < 0 || businessCount > 30) {
      return res.status(400).json({ error: 'businessCount must be an integer between 0 and 30' });
    }

    // totalRounds: 10 or 20
    if (typeof totalRounds !== 'number' || (totalRounds !== 10 && totalRounds !== 20)) {
      return res.status(400).json({ error: 'totalRounds must be 10 or 20' });
    }

    // difficulty: valid difficulty
    const validDifficulty = typeof difficulty === 'string' && (VALID_DIFFICULTIES as readonly string[]).includes(difficulty) ? difficulty : 'easy';

    // duration: valid duration
    const validDuration = typeof duration === 'string' && (VALID_DURATIONS as readonly string[]).includes(duration) ? duration : 'standard';

    // founderEquityValue: number, 0 ≤ FEV ≤ 100,000,000,000 ($100T)
    const validFEV = typeof founderEquityValue === 'number' && founderEquityValue >= 0 && founderEquityValue <= 100000000000
      ? Math.round(founderEquityValue) : Math.round(enterpriseValue);

    // founderPersonalWealth: number, 0 ≤ PW ≤ 100,000,000,000 ($100T)
    const validPersonalWealth = typeof founderPersonalWealth === 'number' && founderPersonalWealth >= 0 && founderPersonalWealth <= 100000000000
      ? Math.round(founderPersonalWealth) : 0;

    // --- Plausibility Checks (holdco mode only — PE uses different scoring) ---
    if (!isPE) {
      // S-grade (score >= 95) requires at least 3 active businesses
      if (score >= 95 && businessCount < 3) {
        return res.status(400).json({ error: 'Implausible: S-grade with fewer than 3 businesses' });
      }

      // FEV cannot exceed EV × 1.2 (buffer for rounding)
      if (typeof founderEquityValue === 'number' && founderEquityValue > enterpriseValue * 1.2) {
        return res.status(400).json({ error: 'Implausible: FEV exceeds EV × 1.2' });
      }

      // Score > 0 but all 6 breakdown dimensions are 0 → reject
      if (score > 0 && strategy?.scoreBreakdown) {
        const sb = strategy.scoreBreakdown;
        if (sb.valueCreation === 0 && sb.fcfShareGrowth === 0 && sb.portfolioRoic === 0 &&
            sb.capitalDeployment === 0 && sb.balanceSheetHealth === 0 && sb.strategicDiscipline === 0) {
          return res.status(400).json({ error: 'Implausible: score > 0 but all dimensions are 0' });
        }
      }

      // Zero acquisitions (totalAcquisitions === 0) with 5+ businesses → reject
      if (strategy?.totalAcquisitions === 0 && businessCount >= 5) {
        return res.status(400).json({ error: 'Implausible: no acquisitions with 5+ businesses' });
      }
    }

    // --- Rate Limiting (uses x-real-ip, not spoofable x-forwarded-for) ---
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:leaderboard:${ip}`;

    const existing = await kv.get(rateLimitKey);
    if (existing) {
      return res.status(429).json({ error: 'Rate limited. One submission per 60 seconds.' });
    }

    await kv.set(rateLimitKey, '1', { ex: RATE_LIMIT_SECONDS });

    // Validate strategy (optional enrichment data)
    let validStrategy = undefined;
    if (strategy && typeof strategy === 'object' && !Array.isArray(strategy)) {
      const s = strategy as any;
      if (
        s.scoreBreakdown && typeof s.scoreBreakdown === 'object' &&
        typeof s.archetype === 'string' &&
        typeof s.sophisticationScore === 'number' &&
        Array.isArray(s.sectorIds)
      ) {
        validStrategy = {
          scoreBreakdown: s.scoreBreakdown,
          archetype: String(s.archetype).slice(0, 50),
          sophisticationScore: Math.max(0, Math.min(100, Math.round(s.sophisticationScore))),
          antiPatterns: Array.isArray(s.antiPatterns) ? s.antiPatterns.map((p: any) => String(p).slice(0, 50)).slice(0, 10) : undefined,
          sectorIds: s.sectorIds.map((sid: any) => String(sid).slice(0, 30)).slice(0, 16),
          dealStructureTypes: typeof s.dealStructureTypes === 'object' ? s.dealStructureTypes : {},
          platformsForged: typeof s.platformsForged === 'number' ? s.platformsForged : 0,
          totalAcquisitions: typeof s.totalAcquisitions === 'number' ? s.totalAcquisitions : 0,
          totalSells: typeof s.totalSells === 'number' ? s.totalSells : 0,
          totalDistributions: typeof s.totalDistributions === 'number' ? s.totalDistributions : 0,
          totalBuybacks: typeof s.totalBuybacks === 'number' ? s.totalBuybacks : 0,
          equityRaisesUsed: typeof s.equityRaisesUsed === 'number' ? s.equityRaisesUsed : 0,
          peakLeverage: typeof s.peakLeverage === 'number' ? Math.round(s.peakLeverage * 10) / 10 : 0,
          turnaroundsStarted: typeof s.turnaroundsStarted === 'number' ? s.turnaroundsStarted : 0,
          turnaroundsSucceeded: typeof s.turnaroundsSucceeded === 'number' ? s.turnaroundsSucceeded : 0,
          turnaroundsFailed: typeof s.turnaroundsFailed === 'number' ? s.turnaroundsFailed : 0,
          maSourcingTier: typeof s.maSourcingTier === 'number' ? s.maSourcingTier : 0,
          sharedServicesActive: typeof s.sharedServicesActive === 'number' ? s.sharedServicesActive : 0,
          rolloverEquityCount: typeof s.rolloverEquityCount === 'number' ? s.rolloverEquityCount : 0,
          // Additional fields for server-side achievement backfill
          ...(typeof s.totalDebt === 'number' ? { totalDebt: Math.round(s.totalDebt) } : {}),
          ...(typeof s.activeCount === 'number' ? { activeCount: Math.max(0, Math.min(30, Math.round(s.activeCount))) } : {}),
          ...(typeof s.recessionAcquisitionCount === 'number' && s.recessionAcquisitionCount > 0 ? { recessionAcquisitionCount: Math.round(s.recessionAcquisitionCount) } : {}),
          ...(typeof s.lpSatisfaction === 'number' ? { lpSatisfaction: Math.max(0, Math.min(100, Math.round(s.lpSatisfaction))) } : {}),
          ...(typeof s.smartExitMoic === 'number' ? { smartExitMoic: Math.round(s.smartExitMoic * 100) / 100 } : {}),
          ...(typeof s.isBankrupt === 'boolean' && s.isBankrupt ? { isBankrupt: true } : {}),
          ...(typeof s.sellerNotesTotal === 'number' ? { sellerNotesTotal: Math.round(s.sellerNotesTotal) } : {}),
          // Achievement IDs (for server-side backfill)
          ...(Array.isArray(s.earnedAchievementIds) ? {
            earnedAchievementIds: s.earnedAchievementIds.map((id: any) => String(id).slice(0, 50)).slice(0, 50),
          } : {}),
          // PE Fund Manager fields (pass through for game_history)
          ...(s.isFundManager === true ? {
            isFundManager: true,
            ...(typeof s.fundName === 'string' ? { fundName: String(s.fundName).slice(0, 50) } : {}),
            ...(typeof s.carryEarned === 'number' ? { carryEarned: Math.round(s.carryEarned) } : {}),
            ...(typeof s.netIrr === 'number' ? { netIrr: Math.round(s.netIrr * 10000) / 10000 } : {}),
            ...(typeof s.grossMoic === 'number' ? { grossMoic: Math.round(s.grossMoic * 100) / 100 } : {}),
          } : {}),
        };
      }
    }

    // --- Player Identity (optional — silent if unauthenticated) ---
    const playerId = await getPlayerIdFromToken(req);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const claimToken = typeof body?.claimToken === 'string' && UUID_REGEX.test(body.claimToken)
      ? body.claimToken : undefined;

    // Check if player is anonymous — anonymous users don't get verified badge
    let isAnonymous = true;
    if (playerId && supabaseAdmin) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(playerId);
        isAnonymous = user?.is_anonymous ?? true;
      } catch { /* treat as anonymous */ }
    }
    // Only real (non-anonymous) accounts get playerId on leaderboard entries
    const verifiedPlayerId = playerId && !isAnonymous ? playerId : undefined;

    // --- Early profile upsert + public_id lookup (needed for KV entry) ---
    let publicProfileId: string | undefined;
    let achievementCount: number | undefined;
    const entryDate = new Date().toISOString();

    if (playerId && supabaseAdmin) {
      // Ensure player_profile exists (create if new, never overwrite existing initials/public_id)
      const publicId = randomUUID().replace(/-/g, '').slice(0, 12);
      try {
        await supabaseAdmin.from('player_profiles').upsert({
          id: playerId,
          initials,
          public_id: publicId,
          updated_at: entryDate,
          last_played_at: entryDate,
        }, { onConflict: 'id', ignoreDuplicates: true });

        // Always update last_played_at (never touch initials or public_id)
        await supabaseAdmin.from('player_profiles')
          .update({ last_played_at: entryDate, updated_at: entryDate })
          .eq('id', playerId);
      } catch (err) {
        console.error('player_profiles upsert failed:', err);
      }

      // Look up the public_id (may be newly created or existing)
      if (verifiedPlayerId) {
        try {
          const { data: profile } = await supabaseAdmin
            .from('player_profiles')
            .select('public_id')
            .eq('id', verifiedPlayerId)
            .single();
          publicProfileId = profile?.public_id ?? undefined;
        } catch { /* best effort */ }
      }

      // Achievement count from strategy data
      if (validStrategy && Array.isArray((validStrategy as any).earnedAchievementIds)) {
        achievementCount = (validStrategy as any).earnedAchievementIds.length;
      }
    }

    // --- Store Entry ---
    const id = randomUUID();
    const multiplier = DIFFICULTY_MULTIPLIER[validDifficulty] ?? 1.0;
    const restructuringPenalty = hasRestructured === true ? 0.80 : 1.0;
    const validFoMultiplier = typeof foMultiplier === 'number' && foMultiplier >= 1.0 && foMultiplier <= 1.5 ? foMultiplier : 1.0;
    const adjustedFEV = Math.round(validFEV * multiplier * restructuringPenalty * validFoMultiplier);

    const entry = {
      id,
      holdcoName: holdcoName.trim(),
      initials,
      enterpriseValue: Math.round(enterpriseValue),
      founderEquityValue: validFEV,
      founderPersonalWealth: validPersonalWealth,
      difficulty: validDifficulty,
      duration: validDuration,
      submittedMultiplier: multiplier,
      hasRestructured: hasRestructured === true ? true : undefined,
      foMultiplier: validFoMultiplier > 1.0 ? validFoMultiplier : undefined,
      score,
      grade,
      businessCount,
      date: entryDate,
      totalRevenue: typeof totalRevenue === 'number' ? Math.round(totalRevenue) : undefined,
      avgEbitdaMargin: typeof avgEbitdaMargin === 'number' ? Math.round(avgEbitdaMargin * 1000) / 1000 : undefined,
      familyOfficeCompleted: familyOfficeCompleted === true ? true : undefined,
      legacyGrade: typeof legacyGrade === 'string' && ['Enduring','Influential','Established','Fragile'].includes(legacyGrade) ? legacyGrade : undefined,
      // PE Fund Manager fields
      ...(isPE ? {
        isFundManager: true,
        fundName: typeof fundName === 'string' ? fundName.trim().slice(0, 50) : undefined,
        netIrr: typeof netIrr === 'number' ? Math.round(netIrr * 10000) / 10000 : undefined,
        grossMoic: typeof grossMoic === 'number' ? Math.round(grossMoic * 100) / 100 : undefined,
        carryEarned: typeof carryEarned === 'number' ? Math.round(carryEarned) : undefined,
      } : {}),
      strategy: validStrategy,
      // Player accounts fields — only verified (non-anonymous) accounts get playerId on leaderboard
      ...(verifiedPlayerId ? { playerId: verifiedPlayerId } : {}),
      ...(playerId ? { submittedBy: playerId } : {}),  // Always store submitter UUID (anon + verified)
      ...(claimToken ? { claimToken } : {}),
      ...(typeof body?.completionId === 'string' ? { completionId: body.completionId.slice(0, 100) } : {}),
      // Profile & achievement fields (Phase 3)
      ...(publicProfileId ? { publicProfileId } : {}),
      ...(achievementCount != null ? { achievementCount } : {}),
    };

    // Add to sorted set — PE entries use grossMoic × fundSize as proxy score, holdco uses adjusted FEV
    const sortScore = isPE && typeof grossMoic === 'number' ? Math.round(grossMoic * 100000) : adjustedFEV;
    await kv.zadd(LEADERBOARD_KEY, { score: sortScore, member: JSON.stringify(entry) });

    // Prune to max entries: remove lowest-scoring entries beyond the limit
    const totalCount = await kv.zcard(LEADERBOARD_KEY);
    if (totalCount > MAX_ENTRIES) {
      await kv.zremrangebyrank(LEADERBOARD_KEY, 0, totalCount - MAX_ENTRIES - 1);
    }

    // Calculate rank (number of entries with higher EV + 1)
    const ascRank = await kv.zrank(LEADERBOARD_KEY, JSON.stringify(entry));
    const currentCount = await kv.zcard(LEADERBOARD_KEY);
    const rank = ascRank !== null ? currentCount - ascRank : 1;

    // --- Dual-write to Postgres (game_history + stats) ---
    if (playerId && supabaseAdmin) {
      // Insert game_history row
      try {
        await supabaseAdmin.from('game_history').insert({
          player_id: playerId,
          holdco_name: holdcoName.trim(),
          initials,
          difficulty: validDifficulty,
          duration: validDuration,
          enterprise_value: Math.round(enterpriseValue),
          founder_equity_value: validFEV,
          founder_personal_wealth: validPersonalWealth,
          adjusted_fev: adjustedFEV,
          score,
          grade,
          submitted_multiplier: multiplier,
          business_count: businessCount,
          total_revenue: typeof totalRevenue === 'number' ? Math.round(totalRevenue) : null,
          avg_ebitda_margin: typeof avgEbitdaMargin === 'number' ? Math.round(avgEbitdaMargin * 1000) / 1000 : null,
          has_restructured: hasRestructured === true,
          family_office_completed: familyOfficeCompleted === true,
          legacy_grade: typeof legacyGrade === 'string' && ['Enduring','Influential','Established','Fragile'].includes(legacyGrade) ? legacyGrade : null,
          fo_multiplier: validFoMultiplier,
          strategy: validStrategy || null,
          ...(validStrategy?.scoreBreakdown ? {
            score_value_creation: validStrategy.scoreBreakdown.valueCreation,
            score_fcf_share_growth: validStrategy.scoreBreakdown.fcfShareGrowth,
            score_portfolio_roic: validStrategy.scoreBreakdown.portfolioRoic,
            score_capital_deployment: validStrategy.scoreBreakdown.capitalDeployment,
            score_balance_sheet: validStrategy.scoreBreakdown.balanceSheetHealth,
            score_strategic_discipline: validStrategy.scoreBreakdown.strategicDiscipline,
          } : {}),
          leaderboard_entry_id: id,
          completed_at: entryDate,
        });
      } catch (err) {
        console.error('game_history insert failed:', err);
      }

      // Update pre-computed stats (non-blocking)
      updatePlayerStats(playerId).catch(console.error);
      updateGlobalStats().catch(console.error);
    }

    return res.status(200).json({ success: true, id, rank });
  } catch (error) {
    console.error('Leaderboard submit error:', error);
    return res.status(500).json({ error: 'Failed to submit score' });
  }
}
