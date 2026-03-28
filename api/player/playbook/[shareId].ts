import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { getClientIp } from '../../_lib/rateLimit.js';
import { kv } from '@vercel/kv';

const RATE_LIMIT_SECONDS = 60;
const MAX_READS_PER_MINUTE = 30;

/**
 * GET /api/player/playbook/[shareId]
 *
 * Public endpoint — returns a single playbook by share ID.
 * No authentication required (for shareable links).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });

  const { shareId } = req.query;
  if (typeof shareId !== 'string' || !/^[a-f0-9]{12}$/.test(shareId)) {
    return res.status(400).json({ error: 'Invalid share ID' });
  }

  // Rate limit by IP
  const ip = getClientIp(req);
  const rateLimitKey = `ratelimit:playbook-read:${ip}`;
  const count = await kv.incr(rateLimitKey);
  if (count === 1) await kv.expire(rateLimitKey, RATE_LIMIT_SECONDS);
  if (count > MAX_READS_PER_MINUTE) {
    return res.status(429).json({ error: 'Rate limited. Try again in a minute.' });
  }

  try {
    const { data: game, error } = await supabaseAdmin
      .from('game_history')
      .select('playbook, strategy, initials, completed_at')
      .eq('playbook_share_id', shareId)
      .not('playbook', 'is', null)
      .single();

    if (error || !game) {
      return res.status(404).json({ error: 'Playbook not found' });
    }

    // Cache immutable playbook for 24 hours
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    // Extract aiDebrief from strategy if present (PE fund debriefs)
    const aiDebrief = game.strategy?.aiDebrief ?? null;

    return res.status(200).json({
      playbook: game.playbook,
      playerInitials: game.initials,
      completedAt: game.completed_at,
      aiDebrief,
    });
  } catch (err) {
    console.error('Playbook read error:', err);
    return res.status(500).json({ error: 'Failed to load playbook' });
  }
}
