import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updatePlayerStats } from '../_lib/playerStats.js';

/**
 * POST /api/admin/backfill-achievements
 * Recompute player_stats (including earned_achievement_ids) for ALL players
 * with game history. This backfills achievements for legacy players whose
 * games were completed before achievement tracking was added.
 *
 * Optional body: { playerIds?: string[] } to backfill specific players only.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    const { playerIds } = (req.body ?? {}) as { playerIds?: string[] };

    let targetIds: string[];

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      // Backfill specific players
      targetIds = playerIds.filter(id => typeof id === 'string');
    } else {
      // Fetch ALL distinct player IDs from game_history
      const PAGE_SIZE = 1000;
      const allIds = new Set<string>();
      let offset = 0;

      while (true) {
        const { data, error } = await supabaseAdmin
          .from('game_history')
          .select('player_id')
          .range(offset, offset + PAGE_SIZE - 1);

        if (error || !data) break;
        for (const row of data) {
          if (row.player_id) allIds.add(row.player_id);
        }
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      targetIds = [...allIds];
    }

    // Process each player — updatePlayerStats already computes achievements
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const playerId of targetIds) {
      try {
        await updatePlayerStats(playerId);
        processed++;
      } catch (err) {
        failed++;
        errors.push(`${playerId}: ${(err as Error).message}`);
      }
    }

    return res.status(200).json({
      success: true,
      total: targetIds.length,
      processed,
      failed,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('[backfill-achievements] Failed:', err);
    return res.status(500).json({ error: 'Backfill failed' });
  }
}
