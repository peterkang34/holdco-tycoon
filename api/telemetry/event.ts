import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp } from '../_lib/rateLimit.js';
import { getMonthKey, validateTelemetryPayload, getFevBucket } from '../_lib/telemetry.js';

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);

  // Rate limit: 30 req/min/IP
  try {
    const rateLimitKey = `ratelimit:telemetry:${ip}`;
    const count = await kv.incr(rateLimitKey);
    if (count === 1) {
      await kv.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Rate limited' });
    }
  } catch {
    // Fail-open on rate limit errors
  }

  // Validate payload
  const payload = validateTelemetryPayload(req.body);
  if (!payload.valid) {
    // Don't leak validation details — always return ok
    return res.status(200).json({ ok: true });
  }

  const { event, difficulty, duration, sector, round, grade, fev, sessionId } = payload;
  const monthKey = getMonthKey();

  try {
    if (event === 'game_start') {
      // Session dedup: skip if we've already seen this sessionId
      const seenKey = `t:seen:${sessionId}`;
      const alreadySeen = await kv.get(seenKey);
      if (alreadySeen) {
        return res.status(200).json({ ok: true });
      }

      const pipe = kv.pipeline();
      pipe.set(seenKey, 1, { ex: 86400 });
      pipe.incr('t:started');
      pipe.incr(`t:started:${monthKey}`);
      pipe.hincrby(`t:cfg:${monthKey}`, `${difficulty}:${duration}`, 1);
      pipe.hincrby(`t:sector:${monthKey}`, sector!, 1);
      pipe.sadd(`t:uv:${monthKey}`, ip);
      await pipe.exec();
    } else if (event === 'game_complete') {
      const pipe = kv.pipeline();
      pipe.incr('t:completed');
      pipe.incr(`t:completed:${monthKey}`);
      pipe.hincrby(`t:rounds:${monthKey}`, String(round), 1);
      pipe.hincrby(`t:grades:${monthKey}`, grade!, 1);
      pipe.hincrby(`t:fev:${monthKey}`, getFevBucket(fev!), 1);
      await pipe.exec();
    } else if (event === 'game_abandon') {
      const pipe = kv.pipeline();
      pipe.hincrby(`t:abandon:${monthKey}`, String(round), 1);
      await pipe.exec();
    }
  } catch {
    // Silent failure — telemetry should never block the client
  }

  return res.status(200).json({ ok: true });
}
