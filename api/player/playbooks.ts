import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

/**
 * GET /api/player/playbooks
 *
 * Returns the authenticated player's playbook library (index only — no full playbook data).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 50);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    // Total count of playbooks
    const { count } = await supabaseAdmin
      .from('game_history')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .not('playbook', 'is', null);

    // Fetch index data (thesis-level fields only, not full playbook JSONB)
    const { data: games, error } = await supabaseAdmin
      .from('game_history')
      .select('id, holdco_name, playbook_share_id, difficulty, duration, score, grade, adjusted_fev, founder_equity_value, completed_at, playbook')
      .eq('player_id', playerId)
      .not('playbook', 'is', null)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Playbooks query failed:', error);
      return res.status(200).json({ playbooks: [], total: 0 });
    }

    // Extract index fields from playbook JSONB
    const playbooks = (games ?? []).map(g => {
      const pb = g.playbook as any;
      return {
        gameId: g.id,
        shareId: g.playbook_share_id,
        holdcoName: g.holdco_name,
        archetype: pb?.thesis?.archetype ?? 'balanced',
        grade: g.grade,
        score: g.score,
        fev: g.founder_equity_value ?? 0,
        adjustedFev: g.adjusted_fev ?? 0,
        difficulty: g.difficulty,
        duration: g.duration,
        isFundManager: pb?.thesis?.isFundManager ?? false,
        isBankrupt: pb?.thesis?.isBankrupt ?? false,
        completedAt: g.completed_at,
      };
    });

    return res.status(200).json({ playbooks, total: count ?? 0 });
  } catch (err) {
    console.error('Playbooks fetch failed:', err);
    return res.status(200).json({ playbooks: [], total: 0 });
  }
}
