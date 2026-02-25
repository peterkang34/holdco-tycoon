import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp, isBodyTooLarge, sanitizeString } from '../_lib/rateLimit.js';

const VALID_TYPES = ['bug', 'feature', 'other'] as const;
const MAX_ENTRIES = 500;
const RATE_LIMIT_SECONDS = 120;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const { type, message, email, context } = req.body || {};

    // Validate type
    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      return res.status(400).json({ error: 'type must be bug, feature, or other' });
    }

    // Validate message
    const sanitizedMessage = sanitizeString(message, 1000);
    if (sanitizedMessage.length < 10) {
      return res.status(400).json({ error: 'message must be 10-1000 characters' });
    }

    // Validate email (optional)
    const sanitizedEmail = email ? sanitizeString(email, 100) : undefined;

    // Rate limit
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:feedback:${ip}`;
    const existing = await kv.get(rateLimitKey);
    if (existing) {
      return res.status(429).json({ error: 'Rate limited. One submission per 2 minutes.' });
    }
    await kv.set(rateLimitKey, '1', { ex: RATE_LIMIT_SECONDS });

    // Sanitize context (whitelist known fields)
    const safeContext = {
      screen: sanitizeString(context?.screen, 20),
      round: typeof context?.round === 'number' ? context.round : undefined,
      difficulty: sanitizeString(context?.difficulty, 20),
      duration: sanitizeString(context?.duration, 20),
      holdcoName: sanitizeString(context?.holdcoName, 50),
      device: sanitizeString(context?.device, 20),
      playerId: sanitizeString(context?.playerId, 50),
    };

    // Build entry
    const entry = {
      type,
      message: sanitizedMessage,
      email: sanitizedEmail,
      context: safeContext,
      date: new Date().toISOString(),
    };

    // Store in sorted set (score = timestamp for chronological order)
    await kv.zadd('feedback:submissions', { score: Date.now(), member: JSON.stringify(entry) });

    // Increment counters
    await kv.incr('feedback:count');
    await kv.incr(`feedback:count:${type}`);

    // Prune to max entries (remove oldest)
    const totalCount = await kv.zcard('feedback:submissions');
    if (totalCount > MAX_ENTRIES) {
      await kv.zremrangebyrank('feedback:submissions', 0, totalCount - MAX_ENTRIES - 1);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Feedback submit error:', error);
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
}
