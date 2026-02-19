import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import {
  CHALLENGE_TTL,
  challengeMetaKey,
  challengeResultsKey,
  isValidChallengeCode,
  isValidToken,
  parseMeta,
} from '../_lib/challenge.js';

const RATE_LIMIT_SECONDS = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const { code, hostToken, hostPlayerToken } = req.body || {};

    if (!isValidChallengeCode(code)) {
      return res.status(400).json({ error: 'Invalid challenge code' });
    }
    if (!isValidToken(hostToken)) {
      return res.status(400).json({ error: 'Invalid host token' });
    }
    if (!isValidToken(hostPlayerToken)) {
      return res.status(400).json({ error: 'Invalid host player token' });
    }

    // Rate limit: 1 per 10s per IP
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:challenge-reveal:${ip}`;
    const existingLimit = await kv.get(rateLimitKey);
    if (existingLimit) {
      return res.status(429).json({ error: 'Rate limited. Try again shortly.' });
    }

    const metaKey = challengeMetaKey(code);
    const resultsKey = challengeResultsKey(code);

    const meta = parseMeta(await kv.get(metaKey));
    if (!meta) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Verify host token
    if (meta.hostToken !== hostToken) {
      return res.status(403).json({ error: 'Not authorized to reveal scores' });
    }

    // Already revealed — idempotent
    if (meta.revealed) {
      return res.status(200).json({ success: true, alreadyRevealed: true });
    }

    // Verify host has submitted their result
    const hostResult = await kv.hget(resultsKey, hostPlayerToken);
    if (!hostResult) {
      return res.status(400).json({ error: 'Host must submit their result before revealing' });
    }

    // Set revealed
    meta.revealed = true;
    meta.revealedAt = new Date().toISOString();
    await kv.set(metaKey, JSON.stringify(meta), { ex: CHALLENGE_TTL });

    // Set rate limit
    await kv.set(rateLimitKey, '1', { ex: RATE_LIMIT_SECONDS });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Challenge reveal error:', error);
    return res.status(500).json({ error: 'Failed to reveal scores' });
  }
}
