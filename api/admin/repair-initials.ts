import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

/**
 * POST /api/admin/repair-initials
 * One-shot repair: fixes player_profiles where initials are 'AA' by pulling
 * the correct initials from the player's most recent game_history entry.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    // Find all profiles with initials = 'AA'
    const { data: broken, error: fetchError } = await supabaseAdmin
      .from('player_profiles')
      .select('id')
      .eq('initials', 'AA');

    if (fetchError || !broken) {
      return res.status(500).json({ error: 'Failed to fetch profiles', detail: fetchError });
    }

    const results: { id: string; oldInitials: string; newInitials: string }[] = [];

    for (const profile of broken) {
      // Get the most recent game_history entry with non-AA initials
      const { data: game } = await supabaseAdmin
        .from('game_history')
        .select('initials')
        .eq('player_id', profile.id)
        .neq('initials', 'AA')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (game?.initials) {
        await supabaseAdmin
          .from('player_profiles')
          .update({ initials: game.initials, updated_at: new Date().toISOString() })
          .eq('id', profile.id);

        results.push({ id: profile.id, oldInitials: 'AA', newInitials: game.initials });
      }
    }

    return res.status(200).json({
      checked: broken.length,
      repaired: results.length,
      repairs: results,
    });
  } catch (error) {
    console.error('Repair initials error:', error);
    return res.status(500).json({ error: 'Repair failed' });
  }
}
