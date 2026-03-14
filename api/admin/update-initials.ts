import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

/**
 * POST /api/admin/update-initials
 * Update a specific player's initials.
 * Body: { playerId: string, initials: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const { playerId, initials } = (req.body ?? {}) as { playerId?: string; initials?: string };
  if (!playerId || !initials) return res.status(400).json({ error: 'playerId and initials required' });

  const clean = initials.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (clean.length < 2) return res.status(400).json({ error: 'Initials must be 2-4 letters' });

  try {
    const { error } = await supabaseAdmin
      .from('player_profiles')
      .update({ initials: clean, updated_at: new Date().toISOString() })
      .eq('id', playerId);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true, playerId, initials: clean });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
