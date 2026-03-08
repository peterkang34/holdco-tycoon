import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updatePlayerStats } from '../_lib/playerStats.js';

/**
 * POST /api/admin/merge-player
 * Merges sourceId player into targetId player:
 *   1. Reassign all game_history rows from source → target
 *   2. Delete source player_stats
 *   3. Delete source player_profiles
 *   4. Recompute target player_stats
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const { sourceId, targetId } = req.body as { sourceId?: string; targetId?: string };

  if (!sourceId || !targetId) {
    return res.status(400).json({ error: 'sourceId and targetId are required' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: 'sourceId and targetId must be different' });
  }

  try {
    // Verify both profiles exist
    const [sourceRes, targetRes] = await Promise.all([
      supabaseAdmin.from('player_profiles').select('id, display_name, initials').eq('id', sourceId).single(),
      supabaseAdmin.from('player_profiles').select('id, display_name, initials').eq('id', targetId).single(),
    ]);

    if (sourceRes.error) return res.status(404).json({ error: 'Source player not found' });
    if (targetRes.error) return res.status(404).json({ error: 'Target player not found' });

    // Count source games before merge
    const { count: sourceGameCount } = await supabaseAdmin
      .from('game_history')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', sourceId);

    // 1. Reassign all game_history rows from source to target
    const { error: reassignError } = await supabaseAdmin
      .from('game_history')
      .update({ player_id: targetId })
      .eq('player_id', sourceId);

    if (reassignError) {
      console.error('Failed to reassign games:', reassignError);
      return res.status(500).json({ error: 'Failed to reassign game history' });
    }

    // 2. Delete source player_stats
    await supabaseAdmin.from('player_stats').delete().eq('player_id', sourceId);

    // 3. Delete source player_profiles
    const { error: deleteError } = await supabaseAdmin
      .from('player_profiles').delete().eq('id', sourceId);

    if (deleteError) {
      console.error('Failed to delete source profile:', deleteError);
      // Games already moved — log but don't fail
    }

    // 4. Recompute target player_stats
    await updatePlayerStats(targetId);

    return res.status(200).json({
      merged: true,
      gamesMoved: sourceGameCount ?? 0,
      source: { id: sourceId, name: sourceRes.data.display_name, initials: sourceRes.data.initials },
      target: { id: targetId, name: targetRes.data.display_name, initials: targetRes.data.initials },
    });
  } catch (error) {
    console.error('Merge player error:', error);
    return res.status(500).json({ error: 'Failed to merge players' });
  }
}
