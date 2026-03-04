import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const playerId = String(req.query.playerId || '').trim();
  if (!playerId) return res.status(400).json({ error: 'playerId is required' });

  try {
    // Fetch profile, stats, recent games, and auth info in parallel
    const [profileRes, statsRes, gamesRes, authRes] = await Promise.all([
      supabaseAdmin.from('player_profiles').select('*').eq('id', playerId).single(),
      supabaseAdmin.from('player_stats').select('*').eq('player_id', playerId).single(),
      supabaseAdmin
        .from('game_history')
        .select('*')
        .eq('player_id', playerId)
        .order('completed_at', { ascending: false })
        .limit(20),
      supabaseAdmin.auth.admin.getUserById(playerId),
    ]);

    if (profileRes.error) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Build auth info
    const authUser = authRes.data?.user;
    const auth = {
      provider: authUser?.app_metadata?.provider || 'unknown',
      created_at: authUser?.created_at || profileRes.data.created_at,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      is_anonymous: authUser?.is_anonymous ?? profileRes.data.is_anonymous ?? false,
    };

    return res.status(200).json({
      profile: profileRes.data,
      stats: statsRes.error ? null : statsRes.data,
      recentGames: gamesRes.data || [],
      auth,
    });
  } catch (error) {
    console.error('Community player detail error:', error);
    return res.status(500).json({ error: 'Failed to fetch player detail' });
  }
}
