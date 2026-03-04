import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  // Compute stats from game_history on-the-fly (Phase 3 will add pre-computed player_stats)
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
    });
  }

  let sumScore = 0;
  let bestScore = 0;
  let bestAdjustedFev = 0;
  const gradeDistribution: Record<string, number> = {};
  const archetypeStats: Record<string, { count: number; totalScore: number }> = {};
  const antiPatternFrequency: Record<string, number> = {};
  const modeScores: Record<string, { sum: number; count: number }> = {};

  for (const game of games ?? []) {
    sumScore += game.score;
    if (game.score > bestScore) bestScore = game.score;
    if (game.adjusted_fev > bestAdjustedFev) bestAdjustedFev = game.adjusted_fev;

    // Grade distribution
    gradeDistribution[game.grade] = (gradeDistribution[game.grade] ?? 0) + 1;

    // Archetype stats
    const archetype = (game.strategy as any)?.archetype;
    if (archetype) {
      if (!archetypeStats[archetype]) archetypeStats[archetype] = { count: 0, totalScore: 0 };
      archetypeStats[archetype].count++;
      archetypeStats[archetype].totalScore += game.score;
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
    if (!modeScores[modeKey]) modeScores[modeKey] = { sum: 0, count: 0 };
    modeScores[modeKey].sum += game.score;
    modeScores[modeKey].count++;
  }

  // Build final archetype stats with avgScore
  const archetypeStatsOut: Record<string, { count: number; avgScore: number }> = {};
  for (const [key, val] of Object.entries(archetypeStats)) {
    archetypeStatsOut[key] = { count: val.count, avgScore: Math.round((val.totalScore / val.count) * 10) / 10 };
  }

  // Mode averages
  const avgScoreByMode: Record<string, number> = {};
  for (const [key, val] of Object.entries(modeScores)) {
    avgScoreByMode[key] = Math.round((val.sum / val.count) * 10) / 10;
  }

  return res.status(200).json({
    total_games: totalGames,
    avg_score: Math.round((sumScore / totalGames) * 10) / 10,
    best_score: bestScore,
    best_adjusted_fev: bestAdjustedFev,
    grade_distribution: gradeDistribution,
    archetype_stats: archetypeStatsOut,
    anti_pattern_frequency: antiPatternFrequency,
    avg_score_by_mode: avgScoreByMode,
  });
}
