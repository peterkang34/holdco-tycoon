/**
 * POST /api/admin/player-unsubscribe
 * Body: { playerId: string, unsubscribed: boolean }
 *
 * Admin toggle for a player's email opt-out (player_profiles.email_unsubscribed).
 * Excluded by the "Copy All Emails" tool. Admin-gated.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId : null;
  const unsubscribed = req.body?.unsubscribed === true;
  if (!playerId) return res.status(400).json({ error: 'playerId is required' });

  try {
    const { error } = await supabaseAdmin
      .from('player_profiles')
      .update({ email_unsubscribed: unsubscribed, updated_at: new Date().toISOString() })
      .eq('id', playerId);

    if (error) {
      console.error('player-unsubscribe update failed:', error);
      return res.status(500).json({ error: 'Failed to update unsubscribe state' });
    }
    return res.status(200).json({ success: true, playerId, unsubscribed });
  } catch (err) {
    console.error('player-unsubscribe error:', err);
    return res.status(500).json({ error: 'Failed to update unsubscribe state' });
  }
}
