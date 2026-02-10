import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

const LEADERBOARD_KEY = 'leaderboard:global';
const MAX_ENTRIES = 100;
const RATE_LIMIT_SECONDS = 60;

const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type Grade = typeof VALID_GRADES[number];

function gradeMatchesScore(grade: Grade, score: number): boolean {
  switch (grade) {
    case 'S': return score >= 90;
    case 'A': return score >= 75 && score < 90;
    case 'B': return score >= 60 && score < 75;
    case 'C': return score >= 40 && score < 60;
    case 'D': return score >= 20 && score < 40;
    case 'F': return score < 20;
  }
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // --- Validation ---
    const {
      holdcoName,
      initials,
      enterpriseValue,
      score,
      grade,
      businessCount,
      totalRounds,
      totalInvestedCapital,
      totalRevenue,
      avgEbitdaMargin,
    } = body || {};

    // initials: 2-4 uppercase alpha chars
    if (typeof initials !== 'string' || !/^[A-Z]{2,4}$/.test(initials)) {
      return res.status(400).json({ error: 'initials must be 2-4 uppercase letters' });
    }

    // holdcoName: 1-50 chars, non-empty
    if (typeof holdcoName !== 'string' || holdcoName.trim().length === 0 || holdcoName.length > 50) {
      return res.status(400).json({ error: 'holdcoName must be 1-50 non-empty characters' });
    }

    // enterpriseValue: number, 0 ≤ EV ≤ 500,000
    if (typeof enterpriseValue !== 'number' || enterpriseValue < 0 || enterpriseValue > 500000) {
      return res.status(400).json({ error: 'enterpriseValue must be between 0 and 500,000' });
    }

    // score: integer, 0 ≤ score ≤ 100
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'score must be an integer between 0 and 100' });
    }

    // grade: valid grade
    if (!VALID_GRADES.includes(grade)) {
      return res.status(400).json({ error: 'grade must be one of S, A, B, C, D, F' });
    }

    // grade must match score range
    if (!gradeMatchesScore(grade as Grade, score)) {
      return res.status(400).json({ error: 'grade does not match score range' });
    }

    // businessCount: integer, 1 ≤ count ≤ 30
    if (typeof businessCount !== 'number' || !Number.isInteger(businessCount) || businessCount < 1 || businessCount > 30) {
      return res.status(400).json({ error: 'businessCount must be an integer between 1 and 30' });
    }

    // totalRounds: must equal 20 (full game only)
    if (totalRounds !== 20) {
      return res.status(400).json({ error: 'only full 20-round games are eligible' });
    }

    // --- Rate Limiting ---
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:leaderboard:${ip}`;

    const existing = await kv.get(rateLimitKey);
    if (existing) {
      return res.status(429).json({ error: 'Rate limited. One submission per 60 seconds.' });
    }

    await kv.set(rateLimitKey, '1', { ex: RATE_LIMIT_SECONDS });

    // --- Store Entry ---
    const id = crypto.randomUUID();
    const entry = {
      id,
      holdcoName: holdcoName.trim(),
      initials,
      enterpriseValue: Math.round(enterpriseValue),
      score,
      grade,
      businessCount,
      date: new Date().toISOString(),
      totalRevenue: typeof totalRevenue === 'number' ? Math.round(totalRevenue) : undefined,
      avgEbitdaMargin: typeof avgEbitdaMargin === 'number' ? Math.round(avgEbitdaMargin * 1000) / 1000 : undefined,
    };

    // Add to sorted set with EV as the score
    await kv.zadd(LEADERBOARD_KEY, { score: entry.enterpriseValue, member: JSON.stringify(entry) });

    // Prune to max entries: remove lowest-scoring entries beyond the limit
    const totalCount = await kv.zcard(LEADERBOARD_KEY);
    if (totalCount > MAX_ENTRIES) {
      // Remove the lowest entries (indices 0 to overflow-1)
      await kv.zremrangebyrank(LEADERBOARD_KEY, 0, totalCount - MAX_ENTRIES - 1);
    }

    // Calculate rank (number of entries with higher EV + 1)
    // zrank returns 0-based ascending rank; we need descending
    const ascRank = await kv.zrank(LEADERBOARD_KEY, JSON.stringify(entry));
    const currentCount = await kv.zcard(LEADERBOARD_KEY);
    const rank = ascRank !== null ? currentCount - ascRank : 1;

    return res.status(200).json({ success: true, id, rank });
  } catch (error) {
    console.error('Leaderboard submit error:', error);
    return res.status(500).json({ error: 'Failed to submit score' });
  }
}
