import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabase.js';

/**
 * GET /api/admin/bschool-stats
 * Returns Business School mode analytics: completion count, finish rate, recent completions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  try {
    // Get all B-School completions from KV (sorted set, most recent first)
    let completionsRaw: unknown[];
    try {
      completionsRaw = await kv.zrange('holdco:bschool_completions', 0, -1, { rev: true }) || [];
    } catch {
      completionsRaw = []; // Key may not exist yet
    }
    const completions = (completionsRaw || []).map((raw: unknown) => {
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { return null; }
    }).filter(Boolean);

    const totalCompletions = completions.length;

    // Completion stats
    const fullCompletions = completions.filter((c: any) => c.checklistCompleted >= c.checklistTotal).length;
    const partialCompletions = totalCompletions - fullCompletions;
    const avgChecklist = totalCompletions > 0
      ? Math.round((completions.reduce((sum: number, c: any) => sum + (c.checklistCompleted || 0), 0) / totalCompletions) * 10) / 10
      : 0;
    const platformForgedCount = completions.filter((c: any) => c.platformForged).length;

    // Device breakdown
    const deviceBreakdown: Record<string, number> = {};
    for (const c of completions) {
      const device = (c as any).device || 'unknown';
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
    }

    // Completions by day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const byDay: Record<string, number> = {};
    for (const c of completions) {
      const date = (c as any).date;
      if (!date) continue;
      const dayKey = date.slice(0, 10);
      if (new Date(dayKey) >= thirtyDaysAgo) {
        byDay[dayKey] = (byDay[dayKey] || 0) + 1;
      }
    }
    const completionsByDay = Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Recent completions (last 10)
    const recentCompletions = completions.slice(0, 10).map((c: any) => ({
      holdcoName: c.holdcoName,
      checklistCompleted: c.checklistCompleted,
      checklistTotal: c.checklistTotal,
      platformForged: c.platformForged,
      founderEquityValue: c.founderEquityValue,
      device: c.device,
      isLoggedIn: c.isLoggedIn ?? null,
      playerId: c.playerId ?? null,
      date: c.date,
    }));

    // ── Signup Conversion & Engagement Analytics ──
    const loggedInAtCompletion = completions.filter((c: any) => c.isLoggedIn === true).length;
    const anonymousAtCompletion = completions.filter((c: any) => c.isLoggedIn === false).length;
    // Some legacy records won't have isLoggedIn field
    const unknownAuthStatus = totalCompletions - loggedInAtCompletion - anonymousAtCompletion;

    // Engagement: for players with playerId, look up their stats
    const playerIds = [...new Set(completions.map((c: any) => c.playerId).filter(Boolean))] as string[];
    let bsGradEngagement = {
      playersWithRealGames: 0,
      avgGamesPlayed: 0,
      avgScore: 0,
      avgBestFev: 0,
      gradeDistribution: {} as Record<string, number>,
      avgScoreTrend: null as number | null,
    };

    if (playerIds.length > 0 && supabaseAdmin) {
      try {
        const { data: stats } = await supabaseAdmin
          .from('player_stats')
          .select('player_id, total_games, avg_score, best_adjusted_fev, grade_distribution, score_trend')
          .in('player_id', playerIds.slice(0, 200));

        if (stats && stats.length > 0) {
          const withGames = stats.filter((s: any) => s.total_games > 0);
          bsGradEngagement.playersWithRealGames = withGames.length;
          if (withGames.length > 0) {
            bsGradEngagement.avgGamesPlayed = Math.round(
              (withGames.reduce((sum: number, s: any) => sum + (s.total_games || 0), 0) / withGames.length) * 10
            ) / 10;
            const scoredPlayers = withGames.filter((s: any) => s.avg_score > 0);
            if (scoredPlayers.length > 0) {
              bsGradEngagement.avgScore = Math.round(
                scoredPlayers.reduce((sum: number, s: any) => sum + s.avg_score, 0) / scoredPlayers.length
              );
              bsGradEngagement.avgBestFev = Math.round(
                scoredPlayers.reduce((sum: number, s: any) => sum + (s.best_adjusted_fev || 0), 0) / scoredPlayers.length
              );
            }
            // Aggregate grade distribution
            const gradeDist: Record<string, number> = {};
            for (const s of withGames) {
              const gd = s.grade_distribution as Record<string, number> | null;
              if (!gd) continue;
              for (const [grade, count] of Object.entries(gd)) {
                gradeDist[grade] = (gradeDist[grade] || 0) + (count as number);
              }
            }
            bsGradEngagement.gradeDistribution = gradeDist;
            // Score trend (avg across players with trends)
            const trendPlayers = withGames.filter((s: any) => s.score_trend != null);
            if (trendPlayers.length > 0) {
              bsGradEngagement.avgScoreTrend = Math.round(
                (trendPlayers.reduce((sum: number, s: any) => sum + s.score_trend, 0) / trendPlayers.length) * 10
              ) / 10;
            }
          }
        }
      } catch { /* non-critical — engagement data is supplementary */ }
    }

    return res.status(200).json({
      totalCompletions,
      fullCompletions,
      partialCompletions,
      fullCompletionRate: totalCompletions > 0 ? Math.round((fullCompletions / totalCompletions) * 100) : 0,
      avgChecklistCompleted: avgChecklist,
      platformForgedCount,
      platformForgedRate: totalCompletions > 0 ? Math.round((platformForgedCount / totalCompletions) * 100) : 0,
      deviceBreakdown,
      completionsByDay,
      recentCompletions,
      // Signup conversion
      signupConversion: {
        loggedInAtCompletion,
        anonymousAtCompletion,
        unknownAuthStatus,
        conversionRate: anonymousAtCompletion + loggedInAtCompletion > 0
          ? Math.round((loggedInAtCompletion / (anonymousAtCompletion + loggedInAtCompletion)) * 100) : 0,
      },
      // B-School grad engagement in real games
      bsGradEngagement,
    });
  } catch (error) {
    console.error('B-School stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
