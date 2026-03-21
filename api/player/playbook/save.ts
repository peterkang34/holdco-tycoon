import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { getPlayerIdFromToken } from '../../_lib/playerAuth.js';
import { supabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { validatePlaybook } from '../../_lib/playbookValidation.js';
import { isBodyTooLarge, getClientIp } from '../../_lib/rateLimit.js';
import { kv } from '@vercel/kv';

const RATE_LIMIT_SECONDS = 60;
const MAX_SAVES_PER_MINUTE = 5;

/**
 * POST /api/player/playbook/save
 *
 * Dedicated playbook save endpoint — decoupled from leaderboard submission.
 * Used when a player signs up during game over and wants to save their playbook
 * without going through the leaderboard flow.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (isBodyTooLarge(req.body, 20000)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  // Rate limit
  const ip = getClientIp(req);
  const rateLimitKey = `ratelimit:playbook-save:${ip}`;
  const existing = await kv.incr(rateLimitKey);
  if (existing === 1) await kv.expire(rateLimitKey, RATE_LIMIT_SECONDS);
  if (existing > MAX_SAVES_PER_MINUTE) {
    return res.status(429).json({ error: 'Rate limited. Try again in a minute.' });
  }

  try {
    const { playbook, holdcoName, difficulty, duration, score, grade } = req.body || {};

    // Validate playbook
    const validPlaybook = validatePlaybook(playbook);
    if (!validPlaybook) {
      return res.status(400).json({ error: 'Invalid playbook data' });
    }

    // Validate required fields
    if (typeof holdcoName !== 'string' || holdcoName.trim().length === 0 || holdcoName.length > 50) {
      return res.status(400).json({ error: 'Invalid holdcoName' });
    }
    if (typeof difficulty !== 'string' || !['easy', 'normal'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }
    if (typeof duration !== 'string' || !['standard', 'quick'].includes(duration)) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    const playbookShareId = randomUUID().replace(/-/g, '').slice(0, 12);
    const now = new Date().toISOString();

    // Check if a game_history row already exists for this player + holdco name + recent time
    // (prevents duplicate saves from double-clicks)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existing_game } = await supabaseAdmin
      .from('game_history')
      .select('id, playbook_share_id')
      .eq('player_id', playerId)
      .eq('holdco_name', holdcoName.trim())
      .gte('completed_at', fiveMinutesAgo)
      .not('playbook', 'is', null)
      .limit(1)
      .single();

    if (existing_game?.playbook_share_id) {
      // Already saved — return existing share ID
      return res.status(200).json({
        gameId: existing_game.id,
        shareId: existing_game.playbook_share_id,
        alreadySaved: true,
      });
    }

    // If there's a game_history row without a playbook (from leaderboard submit), update it
    const { data: game_without_playbook } = await supabaseAdmin
      .from('game_history')
      .select('id')
      .eq('player_id', playerId)
      .eq('holdco_name', holdcoName.trim())
      .gte('completed_at', fiveMinutesAgo)
      .is('playbook', null)
      .limit(1)
      .single();

    if (game_without_playbook) {
      // Update existing row with playbook
      await supabaseAdmin
        .from('game_history')
        .update({ playbook: validPlaybook, playbook_share_id: playbookShareId })
        .eq('id', game_without_playbook.id);

      return res.status(200).json({
        gameId: game_without_playbook.id,
        shareId: playbookShareId,
      });
    }

    // No existing row — create a minimal game_history entry with playbook
    const { data: inserted, error } = await supabaseAdmin
      .from('game_history')
      .insert({
        player_id: playerId,
        holdco_name: holdcoName.trim(),
        initials: 'XX', // placeholder — will be updated on next leaderboard save
        difficulty,
        duration,
        score: typeof score === 'number' ? score : 0,
        grade: typeof grade === 'string' ? grade : 'F',
        enterprise_value: 0,
        founder_equity_value: 0,
        adjusted_fev: 0,
        business_count: 0,
        has_restructured: false,
        playbook: validPlaybook,
        playbook_share_id: playbookShareId,
        completed_at: now,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Playbook save failed:', error);
      return res.status(500).json({ error: 'Failed to save playbook' });
    }

    return res.status(200).json({
      gameId: inserted?.id,
      shareId: playbookShareId,
    });
  } catch (err) {
    console.error('Playbook save error:', err);
    return res.status(500).json({ error: 'Failed to save playbook' });
  }
}
