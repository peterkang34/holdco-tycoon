import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp } from '../_lib/rateLimit.js';
import {
  challengeMetaKey,
  challengeResultsKey,
  isValidChallengeCode,
  isValidToken,
  parseMeta,
  type SubmittedResult,
} from '../_lib/challenge.js';

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 30; // 30 req/min/IP

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  // Rate limit: 30 req/min per IP (#5)
  const ip = getClientIp(req);
  try {
    const rateLimitKey = `ratelimit:challenge-status:${ip}`;
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

  try {
    const code = String(req.query.code ?? '');
    const playerToken = String(req.query.playerToken ?? '');

    if (!isValidChallengeCode(code)) {
      return res.status(400).json({ error: 'Invalid challenge code' });
    }
    if (!isValidToken(playerToken)) {
      return res.status(400).json({ error: 'Invalid player token' });
    }

    const metaKey = challengeMetaKey(code);
    const resultsKey = challengeResultsKey(code);

    const [metaRaw, allResults] = await Promise.all([
      kv.get(metaKey),
      kv.hgetall(resultsKey),
    ]);

    const meta = parseMeta(metaRaw);
    if (!meta) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const resultsMap = (allResults || {}) as Record<string, string | SubmittedResult>;

    if (meta.revealed) {
      // Revealed: return full results sorted by score
      const results = Object.entries(resultsMap).map(([token, raw]) => {
        const result: SubmittedResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { ...result, isYou: token === playerToken };
      });
      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.fev + b.totalDistributions) - (a.fev + a.totalDistributions);
      });
      return res.status(200).json({
        revealed: true,
        revealedAt: meta.revealedAt,
        results,
        participantCount: results.length,
      });
    }

    // Unrevealed: names only, own result for requesting player
    const participants = Object.entries(resultsMap).map(([token, raw]) => {
      const result: SubmittedResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const isYou = token === playerToken;
      return {
        name: result.name,
        isYou,
        ...(isYou ? { result } : {}),
      };
    });

    return res.status(200).json({
      revealed: false,
      participants,
      participantCount: participants.length,
    });
  } catch (error) {
    console.error('Challenge status error:', error);
    return res.status(500).json({ error: 'Failed to get challenge status' });
  }
}
