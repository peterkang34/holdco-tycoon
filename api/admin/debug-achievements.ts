import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { computePlayerAchievements } from '../_lib/achievementBackfill.js';

/**
 * GET /api/admin/debug-achievements?playerId=...
 * Debug endpoint: shows per-game achievement evaluation for a player.
 * Helps diagnose why specific achievements aren't triggering.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const playerId = String(req.query.playerId || '').trim();
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  try {
    // Fetch all games
    const { data: games, error } = await supabaseAdmin
      .from('game_history')
      .select('*')
      .eq('player_id', playerId)
      .order('completed_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Per-game breakdown
    const gameBreakdowns = (games || []).map((game: any) => {
      const strategy = game.strategy as Record<string, any> | null;
      return {
        holdco_name: game.holdco_name,
        grade: game.grade,
        score: game.score,
        difficulty: game.difficulty,
        duration: game.duration,
        business_count: game.business_count,
        founder_equity_value: game.founder_equity_value,
        completed_at: game.completed_at,
        has_strategy: !!strategy,
        // Key strategy fields for achievement evaluation
        strategy_fields: strategy ? {
          platformsForged: strategy.platformsForged ?? 'MISSING',
          totalAcquisitions: strategy.totalAcquisitions ?? 'MISSING',
          totalSells: strategy.totalSells ?? 'MISSING',
          totalDistributions: strategy.totalDistributions ?? 'MISSING',
          totalDebt: strategy.totalDebt ?? 'MISSING',
          activeCount: strategy.activeCount ?? 'MISSING',
          sectorIds: strategy.sectorIds ?? 'MISSING',
          antiPatterns: strategy.antiPatterns ?? 'MISSING (treated as empty)',
          dealStructureTypes: strategy.dealStructureTypes ? Object.keys(strategy.dealStructureTypes) : 'MISSING',
          turnaroundsStarted: strategy.turnaroundsStarted ?? 'MISSING',
          isFundManager: strategy.isFundManager ?? false,
          carryEarned: strategy.carryEarned ?? 'MISSING',
          lpSatisfaction: strategy.lpSatisfaction ?? 'MISSING',
          smartExitMoic: strategy.smartExitMoic ?? 'MISSING',
          earnedAchievementIds: strategy.earnedAchievementIds ?? 'MISSING',
        } : 'NO STRATEGY JSON',
        // Score breakdown columns
        score_breakdown: {
          value_creation: game.score_value_creation,
          fcf_share_growth: game.score_fcf_share_growth,
          portfolio_roic: game.score_portfolio_roic,
          capital_deployment: game.score_capital_deployment,
          balance_sheet: game.score_balance_sheet,
          strategic_discipline: game.score_strategic_discipline,
        },
      };
    });

    // Compute aggregate achievements
    const earnedIds = computePlayerAchievements(games || []);

    // Which achievements are NOT earned and why
    const ALL_ACHIEVEMENT_IDS = [
      'first_acquisition', 'portfolio_builder', 'exit_strategist', 'platform_architect',
      'debt_free', 'first_distribution', 'turnaround_artist', 'deal_architect',
      'roll_up_machine', 'sector_specialist', 'smart_exit', 'the_contrarian',
      'the_compounder', 's_tier', 'balanced_allocator', 'value_creation_machine',
      'carry_king', 'lp_whisperer', 'hard_mode_hero', 'speed_run', 'clean_sheet',
    ];

    const missingAchievements = ALL_ACHIEVEMENT_IDS.filter(id => !earnedIds.includes(id));

    // For missing achievements, explain why
    const missingReasons: Record<string, string> = {};
    for (const id of missingAchievements) {
      switch (id) {
        case 'roll_up_machine': {
          const maxPlatforms = (games || []).reduce((max: number, g: any) => {
            const pf = g.strategy?.platformsForged ?? 0;
            return Math.max(max, pf);
          }, 0);
          const gamesWithStrategy = (games || []).filter((g: any) => g.strategy).length;
          missingReasons[id] = `Need platformsForged >= 3. Best found: ${maxPlatforms}. Games with strategy data: ${gamesWithStrategy}/${(games || []).length}`;
          break;
        }
        case 'sector_specialist': {
          const qualifying = (games || []).filter((g: any) => {
            const sids = g.strategy?.sectorIds;
            const ac = g.strategy?.activeCount ?? g.business_count ?? 0;
            return Array.isArray(sids) && sids.length === 1 && ac >= 3;
          });
          const nearMisses = (games || []).filter((g: any) => {
            const sids = g.strategy?.sectorIds;
            const ac = g.strategy?.activeCount ?? g.business_count ?? 0;
            return Array.isArray(sids) && ac >= 3;
          }).map((g: any) => ({
            name: g.holdco_name,
            sectorIds: g.strategy?.sectorIds,
            activeCount: g.strategy?.activeCount ?? g.business_count,
          }));
          missingReasons[id] = `Need sectorIds.length === 1 && activeCount >= 3. Qualifying games: ${qualifying.length}. Near misses (activeCount >= 3): ${JSON.stringify(nearMisses)}`;
          break;
        }
        case 'platform_architect': {
          const maxPf = (games || []).reduce((max: number, g: any) => Math.max(max, g.strategy?.platformsForged ?? 0), 0);
          missingReasons[id] = `Need platformsForged >= 1. Best found: ${maxPf}`;
          break;
        }
        case 'lp_whisperer': {
          const bestLp = (games || []).reduce((max: number, g: any) => Math.max(max, g.strategy?.lpSatisfaction ?? 0), 0);
          const fromEarned = (games || []).some((g: any) => g.strategy?.earnedAchievementIds?.includes('lp_whisperer'));
          missingReasons[id] = `Need lpSatisfaction >= 90 OR in earnedAchievementIds. Best LP satisfaction found: ${bestLp}. In earnedAchievementIds: ${fromEarned}`;
          break;
        }
        default:
          missingReasons[id] = 'Not evaluated in detail';
      }
    }

    return res.status(200).json({
      playerId,
      totalGames: (games || []).length,
      gamesWithStrategy: (games || []).filter((g: any) => g.strategy).length,
      earnedAchievements: earnedIds,
      missingAchievements,
      missingReasons,
      games: gameBreakdowns,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
