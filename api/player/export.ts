import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  try {
    // Verify non-anonymous user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(playerId);
    if (userError || !user || user.is_anonymous) {
      return res.status(403).json({ error: 'Account required to export data' });
    }

    const [profileResult, gamesResult, statsResult] = await Promise.all([
      supabaseAdmin.from('player_profiles').select('*').eq('id', playerId).single(),
      supabaseAdmin.from('game_history').select('*').eq('player_id', playerId).order('completed_at', { ascending: false }),
      supabaseAdmin.from('player_stats').select('*').eq('player_id', playerId).single(),
    ]);

    if (profileResult.error) return res.status(500).json({ error: 'Failed to fetch profile' });

    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="holdco-tycoon-data-${date}.json"`);

    return res.status(200).json({
      profile: profileResult.data,
      games: gamesResult.data ?? [],
      stats: statsResult.data ?? null,
      exported_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Failed to export data' });
  }
}
