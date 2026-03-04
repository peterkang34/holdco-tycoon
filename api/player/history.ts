import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 50);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  // Get total count
  const { count } = await supabaseAdmin
    .from('game_history')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId);

  // Get paginated games
  const { data: games, error } = await supabaseAdmin
    .from('game_history')
    .select('id, holdco_name, initials, difficulty, duration, enterprise_value, founder_equity_value, adjusted_fev, score, grade, business_count, has_restructured, family_office_completed, strategy, completed_at')
    .eq('player_id', playerId)
    .order('completed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'Query failed' });

  return res.status(200).json({
    games: games ?? [],
    total: count ?? 0,
  });
}
