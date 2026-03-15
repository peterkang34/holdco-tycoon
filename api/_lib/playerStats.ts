import { supabaseAdmin } from './supabaseAdmin.js';
import { computePlayerAchievements } from './achievementBackfill.js';

/**
 * Fetch all game_history rows for a player, handling pagination.
 * Returns rows ordered by completed_at ASC.
 */
async function fetchAllGames(playerId: string) {
  if (!supabaseAdmin) return [];

  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('game_history')
      .select('*')
      .eq('player_id', playerId)
      .order('completed_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Recompute and upsert player_stats for a given player.
 * Best-effort — logs errors but never throws.
 */
export async function updatePlayerStats(playerId: string): Promise<void> {
  try {
    if (!supabaseAdmin) return;

    const games = await fetchAllGames(playerId);
    const totalGames = games.length;

    if (totalGames === 0) {
      await supabaseAdmin.from('player_stats').upsert(
        {
          player_id: playerId,
          total_games: 0,
          avg_score: 0,
          best_score: 0,
          best_adjusted_fev: 0,
          grade_distribution: {},
          archetype_stats: {},
          anti_pattern_frequency: {},
          avg_score_by_mode: {},
          total_games_by_mode: {},
          score_trend: null,
          earned_achievement_ids: [],
          sector_frequency: {},
          modes_played: [],
          family_office_completed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' },
      );
      return;
    }

    let sumScore = 0;
    let scoredGames = 0;
    let bestScore = 0;
    let bestAdjustedFev = 0;
    const gradeDistribution: Record<string, number> = {};
    const archetypeAccum: Record<string, { count: number; totalScore: number; scoredCount: number }> = {};
    const antiPatternFrequency: Record<string, number> = {};
    const modeAccum: Record<string, { sum: number; count: number; scoredCount: number }> = {};

    for (const game of games) {
      const hasScore = game.score > 0;
      if (hasScore) {
        sumScore += game.score;
        scoredGames++;
        if (game.score > bestScore) bestScore = game.score;
      }
      if (game.adjusted_fev > bestAdjustedFev) bestAdjustedFev = game.adjusted_fev;

      // Grade distribution (grade is valid even without score)
      if (game.grade) {
        gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;
      }

      // Archetype stats (only count scored games for avgScore)
      const archetype = (game.strategy as any)?.archetype;
      if (archetype) {
        if (!archetypeAccum[archetype]) archetypeAccum[archetype] = { count: 0, totalScore: 0, scoredCount: 0 };
        archetypeAccum[archetype].count++;
        if (hasScore) {
          archetypeAccum[archetype].totalScore += game.score;
          archetypeAccum[archetype].scoredCount++;
        }
      }

      // Anti-pattern frequency
      const antiPatterns = (game.strategy as any)?.antiPatterns;
      if (Array.isArray(antiPatterns)) {
        for (const ap of antiPatterns) {
          antiPatternFrequency[ap] = (antiPatternFrequency[ap] ?? 0) + 1;
        }
      }

      // Mode breakdown (only count scored games for avg)
      const isPEGame = (game.strategy as any)?.isFundManager === true;
      const modeKey = isPEGame ? 'fund_manager' : `${game.difficulty}_${game.duration}`;
      if (!modeAccum[modeKey]) modeAccum[modeKey] = { sum: 0, count: 0, scoredCount: 0 };
      modeAccum[modeKey].count++;
      if (hasScore) {
        modeAccum[modeKey].sum += game.score;
        modeAccum[modeKey].scoredCount++;
      }
    }

    // Build archetype stats with avgScore (only from scored games)
    const archetypeStats: Record<string, { count: number; avgScore: number }> = {};
    for (const [key, val] of Object.entries(archetypeAccum)) {
      archetypeStats[key] = {
        count: val.count,
        avgScore: val.scoredCount > 0 ? Math.round((val.totalScore / val.scoredCount) * 10) / 10 : 0,
      };
    }

    // Mode averages and totals (avg only from scored games)
    const avgScoreByMode: Record<string, number> = {};
    const totalGamesByMode: Record<string, number> = {};
    for (const [key, val] of Object.entries(modeAccum)) {
      avgScoreByMode[key] = val.scoredCount > 0 ? Math.round((val.sum / val.scoredCount) * 10) / 10 : 0;
      totalGamesByMode[key] = val.count;
    }

    // Score trend: avg of last 5 scored games minus avg of prior 5 scored games
    let scoreTrend: number | null = null;
    const scoredOnly = games.filter(g => g.score > 0);
    if (scoredOnly.length >= 6) {
      const recentSlice = scoredOnly.slice(-5);
      const priorSlice = scoredOnly.slice(-10, -5);
      const recentSum = recentSlice.reduce((s, g) => s + g.score, 0);
      const priorSum = priorSlice.reduce((s, g) => s + g.score, 0);
      scoreTrend = Math.round(((recentSum / 5) - (priorSum / priorSlice.length)) * 10) / 10;
    }

    // Compute achievements across all games
    const earnedAchievementIds = computePlayerAchievements(games);

    // Compute sector frequency (count of acquisitions per sector across all games)
    const sectorFrequency: Record<string, number> = {};
    let familyOfficeCompleted = false;
    for (const game of games) {
      const sectorIds = (game.strategy as any)?.sectorIds;
      if (Array.isArray(sectorIds)) {
        for (const sid of sectorIds) {
          sectorFrequency[sid] = (sectorFrequency[sid] ?? 0) + 1;
        }
      }
      if (game.family_office_completed === true) {
        familyOfficeCompleted = true;
      }
    }

    // Compute modes played
    const modesPlayed = Object.keys(totalGamesByMode).filter(k => totalGamesByMode[k] > 0);

    await supabaseAdmin.from('player_stats').upsert(
      {
        player_id: playerId,
        total_games: totalGames,
        avg_score: scoredGames > 0 ? Math.round((sumScore / scoredGames) * 10) / 10 : 0,
        best_score: bestScore,
        best_adjusted_fev: bestAdjustedFev,
        grade_distribution: gradeDistribution,
        archetype_stats: archetypeStats,
        anti_pattern_frequency: antiPatternFrequency,
        avg_score_by_mode: avgScoreByMode,
        total_games_by_mode: totalGamesByMode,
        score_trend: scoreTrend,
        earned_achievement_ids: earnedAchievementIds,
        sector_frequency: sectorFrequency,
        modes_played: modesPlayed,
        family_office_completed: familyOfficeCompleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    );
  } catch (err) {
    console.error('[updatePlayerStats] Failed:', err);
  }
}

/**
 * Recompute and upsert global_stats from all game_history.
 * Best-effort — logs errors but never throws.
 */
export async function updateGlobalStats(): Promise<void> {
  try {
    if (!supabaseAdmin) return;

    // Fetch all games with pagination
    const PAGE_SIZE = 1000;
    const allGames: any[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from('game_history')
        .select('score, grade, adjusted_fev, strategy')
        .range(offset, offset + PAGE_SIZE - 1);

      if (error || !data) break;
      allGames.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const totalGames = allGames.length;
    if (totalGames === 0) {
      await supabaseAdmin.from('global_stats').upsert(
        {
          id: 1,
          total_games: 0,
          avg_score: 0,
          avg_adjusted_fev: 0,
          grade_distribution: {},
          archetype_distribution: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      return;
    }

    let sumScore = 0;
    let scoredGames = 0;
    let sumAdjustedFev = 0;
    const gradeDistribution: Record<string, number> = {};
    const archetypeAccum: Record<string, { count: number; totalScore: number; scoredCount: number }> = {};

    for (const game of allGames) {
      const hasScore = game.score > 0;
      if (hasScore) {
        sumScore += game.score;
        scoredGames++;
      }
      sumAdjustedFev += game.adjusted_fev ?? 0;

      // Grade distribution
      if (game.grade) {
        gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;
      }

      // Archetype distribution (only scored games for avgScore)
      const archetype = (game.strategy as any)?.archetype;
      if (archetype) {
        if (!archetypeAccum[archetype]) archetypeAccum[archetype] = { count: 0, totalScore: 0, scoredCount: 0 };
        archetypeAccum[archetype].count++;
        if (hasScore) {
          archetypeAccum[archetype].totalScore += game.score;
          archetypeAccum[archetype].scoredCount++;
        }
      }
    }

    // Build archetype distribution with count and avgScore
    const archetypeDistribution: Record<string, { count: number; avgScore: number }> = {};
    for (const [key, val] of Object.entries(archetypeAccum)) {
      archetypeDistribution[key] = {
        count: val.count,
        avgScore: val.scoredCount > 0 ? Math.round((val.totalScore / val.scoredCount) * 10) / 10 : 0,
      };
    }

    await supabaseAdmin.from('global_stats').upsert(
      {
        id: 1,
        total_games: totalGames,
        avg_score: scoredGames > 0 ? Math.round((sumScore / scoredGames) * 10) / 10 : 0,
        avg_adjusted_fev: Math.round((sumAdjustedFev / totalGames) * 10) / 10,
        grade_distribution: gradeDistribution,
        archetype_distribution: archetypeDistribution,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  } catch (err) {
    console.error('[updateGlobalStats] Failed:', err);
  }
}
