import { supabaseAdmin } from './supabaseAdmin.js';

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
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' },
      );
      return;
    }

    let sumScore = 0;
    let bestScore = 0;
    let bestAdjustedFev = 0;
    const gradeDistribution: Record<string, number> = {};
    const archetypeAccum: Record<string, { count: number; totalScore: number }> = {};
    const antiPatternFrequency: Record<string, number> = {};
    const modeAccum: Record<string, { sum: number; count: number }> = {};

    for (const game of games) {
      sumScore += game.score;
      if (game.score > bestScore) bestScore = game.score;
      if (game.adjusted_fev > bestAdjustedFev) bestAdjustedFev = game.adjusted_fev;

      // Grade distribution
      if (game.grade) {
        gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;
      }

      // Archetype stats
      const archetype = (game.strategy as any)?.archetype;
      if (archetype) {
        if (!archetypeAccum[archetype]) archetypeAccum[archetype] = { count: 0, totalScore: 0 };
        archetypeAccum[archetype].count++;
        archetypeAccum[archetype].totalScore += game.score;
      }

      // Anti-pattern frequency
      const antiPatterns = (game.strategy as any)?.antiPatterns;
      if (Array.isArray(antiPatterns)) {
        for (const ap of antiPatterns) {
          antiPatternFrequency[ap] = (antiPatternFrequency[ap] ?? 0) + 1;
        }
      }

      // Mode breakdown
      const modeKey = `${game.difficulty}_${game.duration}`;
      if (!modeAccum[modeKey]) modeAccum[modeKey] = { sum: 0, count: 0 };
      modeAccum[modeKey].sum += game.score;
      modeAccum[modeKey].count++;
    }

    // Build archetype stats with avgScore
    const archetypeStats: Record<string, { count: number; avgScore: number }> = {};
    for (const [key, val] of Object.entries(archetypeAccum)) {
      archetypeStats[key] = {
        count: val.count,
        avgScore: Math.round((val.totalScore / val.count) * 10) / 10,
      };
    }

    // Mode averages and totals
    const avgScoreByMode: Record<string, number> = {};
    const totalGamesByMode: Record<string, number> = {};
    for (const [key, val] of Object.entries(modeAccum)) {
      avgScoreByMode[key] = Math.round((val.sum / val.count) * 10) / 10;
      totalGamesByMode[key] = val.count;
    }

    // Score trend: avg of last 5 minus avg of prior 5 (games ordered ASC)
    let scoreTrend: number | null = null;
    if (totalGames >= 6) {
      const recentStart = totalGames - 5;
      const priorStart = totalGames - 10 < 0 ? 0 : totalGames - 10;
      const priorEnd = recentStart;

      let recentSum = 0;
      for (let i = recentStart; i < totalGames; i++) {
        recentSum += games[i].score;
      }

      let priorSum = 0;
      const priorCount = priorEnd - priorStart;
      for (let i = priorStart; i < priorEnd; i++) {
        priorSum += games[i].score;
      }

      scoreTrend = Math.round(((recentSum / 5) - (priorSum / priorCount)) * 10) / 10;
    }

    await supabaseAdmin.from('player_stats').upsert(
      {
        player_id: playerId,
        total_games: totalGames,
        avg_score: Math.round((sumScore / totalGames) * 10) / 10,
        best_score: bestScore,
        best_adjusted_fev: bestAdjustedFev,
        grade_distribution: gradeDistribution,
        archetype_stats: archetypeStats,
        anti_pattern_frequency: antiPatternFrequency,
        avg_score_by_mode: avgScoreByMode,
        total_games_by_mode: totalGamesByMode,
        score_trend: scoreTrend,
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
    let sumAdjustedFev = 0;
    const gradeDistribution: Record<string, number> = {};
    const archetypeAccum: Record<string, { count: number; totalScore: number }> = {};

    for (const game of allGames) {
      sumScore += game.score;
      sumAdjustedFev += game.adjusted_fev ?? 0;

      // Grade distribution
      if (game.grade) {
        gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;
      }

      // Archetype distribution
      const archetype = (game.strategy as any)?.archetype;
      if (archetype) {
        if (!archetypeAccum[archetype]) archetypeAccum[archetype] = { count: 0, totalScore: 0 };
        archetypeAccum[archetype].count++;
        archetypeAccum[archetype].totalScore += game.score;
      }
    }

    // Build archetype distribution with count and avgScore
    const archetypeDistribution: Record<string, { count: number; avgScore: number }> = {};
    for (const [key, val] of Object.entries(archetypeAccum)) {
      archetypeDistribution[key] = {
        count: val.count,
        avgScore: Math.round((val.totalScore / val.count) * 10) / 10,
      };
    }

    await supabaseAdmin.from('global_stats').upsert(
      {
        id: 1,
        total_games: totalGames,
        avg_score: Math.round((sumScore / totalGames) * 10) / 10,
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
