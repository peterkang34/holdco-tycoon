import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import {
  CHALLENGE_TTL,
  MAX_PARTICIPANTS,
  challengeMetaKey,
  challengeResultsKey,
  isValidChallengeCode,
  isValidToken,
  validateResult,
  parseMeta,
  type ChallengeMeta,
} from '../_lib/challenge.js';

const RATE_LIMIT_SECONDS = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const { code, playerToken, result, hostToken } = req.body || {};

    if (!isValidChallengeCode(code)) {
      return res.status(400).json({ error: 'Invalid challenge code' });
    }
    if (!isValidToken(playerToken)) {
      return res.status(400).json({ error: 'Invalid player token' });
    }

    const validResult = validateResult(result);
    if (!validResult) {
      return res.status(400).json({ error: 'Invalid result data' });
    }

    // Rate limit: 1 per 30s per IP — set BEFORE writes to close burst window (#7)
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:challenge-submit:${ip}`;
    const existingLimit = await kv.get(rateLimitKey);
    if (existingLimit) {
      return res.status(429).json({ error: 'Rate limited. One submission per 30 seconds.' });
    }
    await kv.set(rateLimitKey, '1', { ex: RATE_LIMIT_SECONDS });

    const metaKey = challengeMetaKey(code);
    const resultsKey = challengeResultsKey(code);

    // Lazy-create meta on first submission (nx = only set if not exists, handles races)
    const meta: ChallengeMeta = {
      hostToken: isValidToken(hostToken) ? hostToken : '',
      createdAt: new Date().toISOString(),
      revealed: false,
    };
    await kv.set(metaKey, JSON.stringify(meta), { ex: CHALLENGE_TTL, nx: true });

    // Fix #1: If a valid hostToken was provided but we weren't the first writer,
    // claim host if the existing meta has no host yet (handles non-host-submits-first race)
    if (isValidToken(hostToken)) {
      const existingMeta = parseMeta(await kv.get(metaKey));
      if (existingMeta && !existingMeta.hostToken) {
        existingMeta.hostToken = hostToken;
        await kv.set(metaKey, JSON.stringify(existingMeta), { ex: CHALLENGE_TTL });
      }
    }

    // Atomic dedup + store via HSETNX (#15 — prevents TOCTOU race on duplicate check)
    const wasSet = await kv.hsetnx(resultsKey, playerToken, JSON.stringify(validResult));
    if (!wasSet) {
      // Already submitted — idempotent
      const currentCount = await kv.hlen(resultsKey);
      return res.status(409).json({ error: 'Already submitted', participantCount: currentCount });
    }

    // Check participant cap AFTER atomic write; roll back if exceeded (#15)
    const currentCount = await kv.hlen(resultsKey);
    if (currentCount > MAX_PARTICIPANTS) {
      await kv.hdel(resultsKey, playerToken);
      return res.status(409).json({ error: 'Challenge is full (max 10 participants)' });
    }

    // Refresh TTLs on both keys
    const pipe = kv.pipeline();
    pipe.expire(metaKey, CHALLENGE_TTL);
    pipe.expire(resultsKey, CHALLENGE_TTL);
    await pipe.exec();

    const participantCount = await kv.hlen(resultsKey);
    return res.status(200).json({ success: true, participantCount });
  } catch (error) {
    console.error('Challenge submit error:', error);
    return res.status(500).json({ error: 'Failed to submit result' });
  }
}
