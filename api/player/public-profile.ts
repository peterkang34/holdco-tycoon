import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getClientIp } from '../_lib/rateLimit.js';

const PUBLIC_ID_REGEX = /^[0-9a-f]{12}$/;

// Inline prestige computation (mirrors src/data/prestigeTitles.ts)
const PRESTIGE_TIERS = [
  { tier: 0, title: null, minGames: 0 },
  { tier: 1, title: 'Rookie Allocator', minGames: 3 },
  { tier: 2, title: 'Rising Allocator', minGames: 10, minAvgScore: 45 },
  { tier: 3, title: 'Skilled Allocator', minGames: 25, minAvgScore: 55, requiresGrade: 'A' },
  { tier: 4, title: 'Expert Allocator', minGames: 50, minAvgScore: 65, minAchievements: 16 },
  { tier: 5, title: 'Master Allocator', minGames: 75, minAvgScore: 70, minAchievements: 24 },
  { tier: 6, title: 'Legendary Allocator', minGames: 100, minAvgScore: 75, minAchievements: 30, requiresSGrades: 3 },
] as const;

const GRADE_RANK: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

function computePrestige(stats: { totalGames: number; avgScore: number; achievementCount: number; bestGrade: string; sGradeCount: number }) {
  let result = PRESTIGE_TIERS[0];
  for (const tier of PRESTIGE_TIERS) {
    if (stats.totalGames < tier.minGames) break;
    if ('minAvgScore' in tier && tier.minAvgScore != null && stats.avgScore < tier.minAvgScore) break;
    if ('minAchievements' in tier && tier.minAchievements != null && stats.achievementCount < tier.minAchievements) break;
    if ('requiresGrade' in tier && tier.requiresGrade != null) {
      if ((GRADE_RANK[stats.bestGrade] ?? 0) < (GRADE_RANK[tier.requiresGrade] ?? 0)) break;
    }
    if ('requiresSGrades' in tier && tier.requiresSGrades != null && stats.sGradeCount < tier.requiresSGrades) break;
    result = tier;
  }
  return { tier: result.tier, title: result.title };
}
const RATE_LIMIT_SECONDS = 60;
const RATE_LIMIT_MAX = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  const publicId = req.query.id;
  if (typeof publicId !== 'string' || !PUBLIC_ID_REGEX.test(publicId)) {
    return res.status(400).json({ error: 'Invalid profile ID' });
  }

  // Rate limiting: 30 req/min per IP
  const ip = getClientIp(req);
  const rateLimitKey = `ratelimit:public-profile:${ip}`;
  try {
    const count = await kv.incr(rateLimitKey);
    if (count === 1) {
      await kv.expire(rateLimitKey, RATE_LIMIT_SECONDS);
    }
    if (count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Rate limited' });
    }
  } catch {
    // Rate limit check failed — proceed anyway
  }

  try {
    // 1. Look up player by public_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('player_profiles')
      .select('id, initials, created_at')
      .eq('public_id', publicId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const playerId = profile.id;

    // 2. Fetch player_stats
    const { data: stats } = await supabaseAdmin
      .from('player_stats')
      .select('*')
      .eq('player_id', playerId)
      .single();

    // 3. Fetch last 10 game_history rows
    const { data: recentGames } = await supabaseAdmin
      .from('game_history')
      .select('holdco_name, grade, score, adjusted_fev, difficulty, duration, strategy, completed_at, family_office_completed, score_value_creation, score_fcf_share_growth, score_portfolio_roic, score_capital_deployment, score_balance_sheet, score_strategic_discipline')
      .eq('player_id', playerId)
      .order('completed_at', { ascending: false })
      .limit(10);

    // 4. Assemble response (strip all internal IDs)
    const totalGames = stats?.total_games ?? 0;
    const gradeDistribution = stats?.grade_distribution ?? {};
    const archetypeStats = stats?.archetype_stats ?? {};
    const earnedAchievementIds: string[] = stats?.earned_achievement_ids ?? [];

    // Compute favorite sector from sector_frequency (if available)
    const sectorFrequency: Record<string, number> = stats?.sector_frequency ?? {};
    let favoriteSector: string | null = null;
    let maxCount = 0;
    for (const [sector, count] of Object.entries(sectorFrequency)) {
      if (count > maxCount) {
        maxCount = count;
        favoriteSector = sector;
      }
    }

    // Most common archetype
    let mostCommonArchetype: string | null = null;
    let bestArchetype: string | null = null;
    let maxArchetypeCount = 0;
    let bestArchetypeScore = 0;
    for (const [archetype, data] of Object.entries(archetypeStats as Record<string, { count: number; avgScore: number }>)) {
      if (data.count > maxArchetypeCount) {
        maxArchetypeCount = data.count;
        mostCommonArchetype = archetype;
      }
      if (data.avgScore > bestArchetypeScore) {
        bestArchetypeScore = data.avgScore;
        bestArchetype = archetype;
      }
    }

    // Modes played
    const totalGamesByMode = stats?.total_games_by_mode ?? {};
    const modesPlayed = Object.keys(totalGamesByMode).filter(k => (totalGamesByMode as Record<string, number>)[k] > 0);

    // Map recent games
    const games = (recentGames ?? []).map((g: any) => ({
      holdcoName: g.holdco_name,
      grade: g.grade,
      score: g.score,
      adjustedFev: g.adjusted_fev,
      difficulty: g.difficulty,
      duration: g.duration,
      archetype: (g.strategy as any)?.archetype ?? null,
      completedAt: g.completed_at,
      isFundManager: (g.strategy as any)?.isFundManager === true,
      carryEarned: (g.strategy as any)?.carryEarned ?? null,
      scoreBreakdown: g.score_value_creation != null ? {
        valueCreation: g.score_value_creation,
        fcfShareGrowth: g.score_fcf_share_growth,
        portfolioRoic: g.score_portfolio_roic,
        capitalDeployment: g.score_capital_deployment,
        balanceSheetHealth: g.score_balance_sheet,
        strategicDiscipline: g.score_strategic_discipline,
      } : undefined,
    }));

    const response = {
      publicId,
      initials: profile.initials,
      isVerified: true,
      memberSince: profile.created_at,

      // Stats
      totalGames,
      bestAdjustedFev: stats?.best_adjusted_fev ?? 0,
      bestScore: stats?.best_score ?? 0,
      avgScore: stats?.avg_score ?? 0,
      gradeDistribution,

      // Achievement summary
      achievementCount: earnedAchievementIds.length,
      achievementIds: earnedAchievementIds,

      // Strategy profile
      bestArchetype,
      mostCommonArchetype,
      favoriteSector,
      sectorFrequency,

      // Recent games (last 10)
      recentGames: games,

      // Mode badges
      modesPlayed,
      familyOfficeCompleted: stats?.family_office_completed ?? false,

      // Prestige
      ...(() => {
        const bestGrade = Object.keys(gradeDistribution).reduce((best, g) =>
          (GRADE_RANK[g] ?? 0) > (GRADE_RANK[best] ?? 0) ? g : best, 'F');
        const sGradeCount = (gradeDistribution as Record<string, number>)['S'] ?? 0;
        const prestige = computePrestige({
          totalGames,
          avgScore: stats?.avg_score ?? 0,
          achievementCount: earnedAchievementIds.length,
          bestGrade,
          sGradeCount,
        });
        return { prestigeTier: prestige.tier, prestigeTitle: prestige.title };
      })(),
    };

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(response);
  } catch (error) {
    console.error('Public profile error:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}
