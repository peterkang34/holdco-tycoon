import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  // Try pre-computed stats first (Phase 3)
  let playerStats: Record<string, unknown> | null = null;
  try {
    const { data: cached } = await supabaseAdmin
      .from('player_stats')
      .select('*')
      .eq('player_id', playerId)
      .single();

    if (cached && cached.updated_at) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 3600_000) { // Less than 1 hour old
        playerStats = {
          total_games: cached.total_games,
          avg_score: cached.avg_score,
          best_score: cached.best_score,
          best_adjusted_fev: cached.best_adjusted_fev,
          grade_distribution: cached.grade_distribution ?? {},
          archetype_stats: cached.archetype_stats ?? {},
          anti_pattern_frequency: cached.anti_pattern_frequency ?? {},
          avg_score_by_mode: cached.avg_score_by_mode ?? {},
        };
      }
    }
  } catch {
    // Fall through to on-the-fly computation
  }

  // Fallback: compute on-the-fly from game_history
  if (!playerStats) {
    const { data: games, error } = await supabaseAdmin
      .from('game_history')
      .select('score, grade, adjusted_fev, difficulty, duration, business_count, strategy, completed_at')
      .eq('player_id', playerId)
      .order('completed_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Query failed' });

    const totalGames = games?.length ?? 0;
    if (totalGames === 0) {
      return res.status(200).json({
        total_games: 0,
        avg_score: 0,
        best_score: 0,
        best_adjusted_fev: 0,
        grade_distribution: {},
        archetype_stats: {},
        anti_pattern_frequency: {},
        avg_score_by_mode: {},
        global: null,
      });
    }

    let sumScore = 0;
    let bestScore = 0;
    let bestAdjustedFev = 0;
    const gradeDistribution: Record<string, number> = {};
    const archetypeAgg: Record<string, { count: number; totalScore: number }> = {};
    const antiPatternFrequency: Record<string, number> = {};
    const modeScores: Record<string, { sum: number; count: number }> = {};

    for (const game of games ?? []) {
      sumScore += game.score;
      if (game.score > bestScore) bestScore = game.score;
      if (game.adjusted_fev > bestAdjustedFev) bestAdjustedFev = game.adjusted_fev;

      gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;

      const archetype = (game.strategy as any)?.archetype;
      if (archetype) {
        if (!archetypeAgg[archetype]) archetypeAgg[archetype] = { count: 0, totalScore: 0 };
        archetypeAgg[archetype].count++;
        archetypeAgg[archetype].totalScore += game.score;
      }

      const antiPatterns = (game.strategy as any)?.antiPatterns;
      if (Array.isArray(antiPatterns)) {
        for (const ap of antiPatterns) {
          antiPatternFrequency[ap] = (antiPatternFrequency[ap] ?? 0) + 1;
        }
      }

      const modeKey = `${game.difficulty}_${game.duration}`;
      if (!modeScores[modeKey]) modeScores[modeKey] = { sum: 0, count: 0 };
      modeScores[modeKey].sum += game.score;
      modeScores[modeKey].count++;
    }

    const archetypeStats: Record<string, { count: number; avgScore: number }> = {};
    for (const [key, val] of Object.entries(archetypeAgg)) {
      archetypeStats[key] = { count: val.count, avgScore: Math.round((val.totalScore / val.count) * 10) / 10 };
    }

    const avgScoreByMode: Record<string, number> = {};
    for (const [key, val] of Object.entries(modeScores)) {
      avgScoreByMode[key] = Math.round((val.sum / val.count) * 10) / 10;
    }

    playerStats = {
      total_games: totalGames,
      avg_score: Math.round((sumScore / totalGames) * 10) / 10,
      best_score: bestScore,
      best_adjusted_fev: bestAdjustedFev,
      grade_distribution: gradeDistribution,
      archetype_stats: archetypeStats,
      anti_pattern_frequency: antiPatternFrequency,
      avg_score_by_mode: avgScoreByMode,
    };
  }

  // Fetch global stats for community comparison
  let global: Record<string, unknown> | null = null;
  try {
    const { data: globalRow } = await supabaseAdmin
      .from('global_stats')
      .select('total_games, avg_score, avg_adjusted_fev, grade_distribution')
      .eq('id', 1)
      .single();

    if (globalRow) {
      global = {
        total_games: globalRow.total_games,
        avg_score: globalRow.avg_score,
        avg_adjusted_fev: globalRow.avg_adjusted_fev,
        grade_distribution: globalRow.grade_distribution ?? {},
      };
    }
  } catch {
    // Global stats not available — that's fine
  }

  return res.status(200).json({ ...playerStats, global });
}
