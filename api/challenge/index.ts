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
  type SubmittedResult,
} from '../_lib/challenge.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action ?? '');

  switch (action) {
    case 'submit':
      return handleSubmit(req, res);
    case 'status':
      return handleStatus(req, res);
    case 'reveal':
      return handleReveal(req, res);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}

// ── Submit ─────────────────────────────────────────────────────────

const SUBMIT_RATE_LIMIT = 30;

async function handleSubmit(req: VercelRequest, res: VercelResponse) {
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
    await kv.set(rateLimitKey, '1', { ex: SUBMIT_RATE_LIMIT });

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

// ── Status ─────────────────────────────────────────────────────────

const STATUS_RATE_WINDOW = 60;
const STATUS_RATE_MAX = 30;

async function handleStatus(req: VercelRequest, res: VercelResponse) {
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
      await kv.expire(rateLimitKey, STATUS_RATE_WINDOW);
    }
    if (count > STATUS_RATE_MAX) {
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
        const r: SubmittedResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { ...r, isYou: token === playerToken };
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
      const r: SubmittedResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const isYou = token === playerToken;
      return {
        name: r.name,
        isYou,
        ...(isYou ? { result: r } : {}),
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

// ── Reveal ─────────────────────────────────────────────────────────

const REVEAL_RATE_LIMIT = 10;

async function handleReveal(req: VercelRequest, res: VercelResponse) {
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
    await kv.set(rateLimitKey, '1', { ex: REVEAL_RATE_LIMIT });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Challenge reveal error:', error);
    return res.status(500).json({ error: 'Failed to reveal scores' });
  }
}
