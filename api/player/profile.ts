import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { checkRateLimit } from '../_lib/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  // Rate limit: reads 30/min, writes 10/min
  const rlNamespace = req.method === 'PUT' ? 'player-profile-write' : 'player-profile-read';
  const rlMax = req.method === 'PUT' ? 10 : 30;
  if (await checkRateLimit(req, { namespace: rlNamespace, maxRequests: rlMax })) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('player_profiles')
      .select('id, initials, display_name, created_at, updated_at, last_played_at')
      .eq('id', playerId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Profile not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { initials } = req.body ?? {};

    if (typeof initials !== 'string' || !/^[A-Z]{2,4}$/.test(initials)) {
      return res.status(400).json({ error: 'initials must be 2-4 uppercase letters' });
    }

    const { error } = await supabaseAdmin
      .from('player_profiles')
      .update({ initials, updated_at: new Date().toISOString() })
      .eq('id', playerId);

    if (error) return res.status(500).json({ error: 'Update failed' });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
