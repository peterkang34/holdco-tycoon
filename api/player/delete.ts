import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getClientIp } from '../_lib/rateLimit.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';

const RATE_LIMIT_SECONDS = 3600; // 1 hour

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });

  // Verify non-anonymous
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(playerId);
    if (error || !user) return res.status(401).json({ error: 'User not found' });
    if (user.is_anonymous) return res.status(403).json({ error: 'Anonymous accounts cannot be deleted' });
  } catch {
    return res.status(500).json({ error: 'Failed to verify account' });
  }

  // Rate limit: 1 per hour per IP + per user (dual-key)
  const ip = getClientIp(req);
  const ipRateLimitKey = `ratelimit:delete:${ip}`;
  const userRateLimitKey = `ratelimit:delete:user:${playerId}`;
  try {
    const [ipCount, userCount] = await Promise.all([
      kv.incr(ipRateLimitKey),
      kv.incr(userRateLimitKey),
    ]);
    if (ipCount === 1) await kv.expire(ipRateLimitKey, RATE_LIMIT_SECONDS);
    if (userCount === 1) await kv.expire(userRateLimitKey, RATE_LIMIT_SECONDS);
    if (ipCount > 1 || userCount > 1) {
      return res.status(429).json({ error: 'Please wait before trying again' });
    }
  } catch {
    // Fail-open on rate limit errors
  }

  try {
    // Anonymize leaderboard entries in KV
    const rawEntries = await kv.zrange(LEADERBOARD_KEY, 0, -1, { withScores: true });

    // rawEntries comes back as [member, score, member, score, ...]
    for (let i = 0; i < rawEntries.length; i += 2) {
      const member = rawEntries[i];
      const score = rawEntries[i + 1] as number;

      let entry: Record<string, unknown>;
      try {
        entry = typeof member === 'string' ? JSON.parse(member) : (member as Record<string, unknown>);
      } catch {
        continue;
      }

      if (entry.playerId === playerId) {
        const memberStr = typeof member === 'string' ? member : JSON.stringify(member);
        await kv.zrem(LEADERBOARD_KEY, memberStr);

        delete entry.playerId;
        delete entry.claimToken;

        await kv.zadd(LEADERBOARD_KEY, { score, member: JSON.stringify(entry) });
      }
    }

    // Delete the user from Supabase Auth (cascades to player_profiles, game_history via FK)
    await supabaseAdmin.auth.admin.deleteUser(playerId);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
}
