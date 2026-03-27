import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import { COMPLETIONS_KEY, MAX_COMPLETIONS } from '../_lib/leaderboard.js';

const RATE_LIMIT_SECONDS = 60;
const RATE_LIMIT_MAX = 5;
const DEDUP_TTL_SECONDS = 86400; // 24 hours

const HOLDCO_NAME_REGEX = /^[A-Za-z0-9 &'.,\-]+$/;
const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
const VALID_DURATIONS = ['standard', 'quick'] as const;

function sanitizeStrategy(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s: Record<string, unknown> = {};
  // Score breakdown
  if (raw.scoreBreakdown && typeof raw.scoreBreakdown === 'object') {
    const sb = raw.scoreBreakdown as Record<string, unknown>;
    s.scoreBreakdown = {
      valueCreation: Number(sb.valueCreation) || 0,
      fcfShareGrowth: Number(sb.fcfShareGrowth) || 0,
      portfolioRoic: Number(sb.portfolioRoic) || 0,
      capitalDeployment: Number(sb.capitalDeployment) || 0,
      balanceSheetHealth: Number(sb.balanceSheetHealth) || 0,
      strategicDiscipline: Number(sb.strategicDiscipline) || 0,
    };
  }
  // Sector IDs (array of strings, max 20)
  if (Array.isArray(raw.sectorIds)) {
    s.sectorIds = raw.sectorIds.filter((id): id is string => typeof id === 'string').slice(0, 20);
  }
  // Deal structure types (record of string→number)
  if (raw.dealStructureTypes && typeof raw.dealStructureTypes === 'object') {
    const dt: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.dealStructureTypes as Record<string, unknown>)) {
      if (typeof v === 'number') dt[k.slice(0, 30)] = Math.round(v);
    }
    if (Object.keys(dt).length > 0) s.dealStructureTypes = dt;
  }
  // Numeric fields
  for (const key of ['platformsForged', 'totalAcquisitions', 'totalSells', 'peakLeverage', 'turnaroundsStarted', 'turnaroundsSucceeded']) {
    if (typeof raw[key] === 'number') s[key] = Math.round((raw[key] as number) * 10) / 10;
  }
  // Anti-patterns (array of strings)
  if (Array.isArray(raw.antiPatterns)) {
    s.antiPatterns = raw.antiPatterns.filter((p): p is string => typeof p === 'string').slice(0, 10);
  }
  return Object.keys(s).length > 0 ? s : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Always return ok: true to client (fire-and-forget pattern)
  const ok = () => res.status(200).json({ ok: true });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isBodyTooLarge(req.body, 5000)) return ok(); // Silently drop oversized

  try {
    const body = req.body || {};

    // --- Business School completion (lightweight, separate tracking) ---
    if (body.isBusinessSchool === true) {
      const bsRecord = {
        holdcoName: typeof body.holdcoName === 'string' ? body.holdcoName.trim().slice(0, 50) : 'Unknown',
        founderEquityValue: typeof body.founderEquityValue === 'number' ? Math.round(body.founderEquityValue) : 0,
        checklistCompleted: typeof body.checklistCompleted === 'number' ? body.checklistCompleted : 0,
        checklistTotal: typeof body.checklistTotal === 'number' ? body.checklistTotal : 15,
        platformForged: body.platformForged === true,
        businessCount: typeof body.businessCount === 'number' ? Math.round(body.businessCount) : 0,
        device: ['desktop', 'mobile', 'tablet'].includes(body.device) ? body.device : undefined,
        isLoggedIn: body.isLoggedIn === true,
        playerId: typeof body.playerId === 'string' ? body.playerId.slice(0, 36) : null,
        date: new Date().toISOString(),
      };
      await kv.zadd('holdco:bschool_completions', { score: Date.now(), member: JSON.stringify(bsRecord) });
      // Prune to keep last 500
      try {
        const count = await kv.zcard('holdco:bschool_completions');
        if (count > 500) await kv.zremrangebyrank('holdco:bschool_completions', 0, count - 501);
      } catch { /* non-critical */ }
      return ok();
    }

    // --- Basic validation (lenient — observational data) ---
    const completionId = typeof body.completionId === 'string' ? body.completionId.slice(0, 100) : '';
    if (!completionId) return ok();

    const holdcoName = typeof body.holdcoName === 'string' ? body.holdcoName.trim().slice(0, 50) : '';
    if (!holdcoName || !HOLDCO_NAME_REGEX.test(holdcoName)) return ok();

    const score = typeof body.score === 'number' && body.score >= 0 && body.score <= 100 ? Math.round(body.score) : null;
    if (score === null) return ok();

    const grade = typeof body.grade === 'string' && (VALID_GRADES as readonly string[]).includes(body.grade) ? body.grade : null;
    if (!grade) return ok();

    const difficulty = typeof body.difficulty === 'string' && (VALID_DIFFICULTIES as readonly string[]).includes(body.difficulty) ? body.difficulty : 'easy';
    const duration = typeof body.duration === 'string' && (VALID_DURATIONS as readonly string[]).includes(body.duration) ? body.duration : 'standard';

    // --- Origin check ---
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.includes('holdcoguide.com') && !origin.includes('localhost') && !origin.includes('vercel.app')) {
      return ok();
    }

    // --- Rate limit ---
    const ip = getClientIp(req);
    const rateLimitKey = `ratelimit:completion:${ip}`;
    try {
      const count = await kv.incr(rateLimitKey);
      if (count === 1) await kv.expire(rateLimitKey, RATE_LIMIT_SECONDS);
      if (count > RATE_LIMIT_MAX) return ok();
    } catch {
      // Fail-open
    }

    // --- Dedup (setnx before zadd) ---
    const dedupKey = `completion:dedup:${completionId}`;
    try {
      const wasSet = await kv.setnx(dedupKey, '1');
      if (!wasSet) return ok(); // Already submitted
      await kv.expire(dedupKey, DEDUP_TTL_SECONDS);
    } catch {
      // Fail-open — allow the write
    }

    // --- Build record ---
    const isPE = body.isFundManager === true;
    const record = {
      completionId,
      holdcoName,
      initials: typeof body.initials === 'string' && /^[A-Z]{2,4}$/.test(body.initials) ? body.initials : undefined,
      enterpriseValue: typeof body.enterpriseValue === 'number' ? Math.round(body.enterpriseValue) : 0,
      founderEquityValue: typeof body.founderEquityValue === 'number' ? Math.round(body.founderEquityValue) : 0,
      score,
      grade,
      businessCount: typeof body.businessCount === 'number' ? Math.min(30, Math.max(0, Math.round(body.businessCount))) : 0,
      difficulty,
      duration,
      totalRounds: body.totalRounds === 10 || body.totalRounds === 20 ? body.totalRounds : 20,
      hasRestructured: body.hasRestructured === true ? true : undefined,
      date: new Date().toISOString(),
      // PE Fund
      ...(isPE ? {
        isFundManager: true,
        fundName: typeof body.fundName === 'string' ? body.fundName.trim().slice(0, 50) : undefined,
        netIrr: typeof body.netIrr === 'number' ? Math.round(body.netIrr * 10000) / 10000 : undefined,
        grossMoic: typeof body.grossMoic === 'number' ? Math.round(body.grossMoic * 100) / 100 : undefined,
        carryEarned: typeof body.carryEarned === 'number' ? Math.round(body.carryEarned) : undefined,
      } : {}),
      // Strategy summary only
      archetype: typeof body.archetype === 'string' ? body.archetype.slice(0, 50) : undefined,
      sophisticationScore: typeof body.sophisticationScore === 'number' ? Math.max(0, Math.min(100, Math.round(body.sophisticationScore))) : undefined,
      // Strategy breakdown (for admin drill-down)
      strategy: body.strategy && typeof body.strategy === 'object' ? sanitizeStrategy(body.strategy) : undefined,
      // Metadata
      device: ['desktop', 'mobile', 'tablet'].includes(body.device) ? body.device : undefined,
      isChallenge: body.isChallenge === true ? true : undefined,
    };

    // --- Store (positive timestamp score, recent = highest) ---
    await kv.zadd(COMPLETIONS_KEY, { score: Date.now(), member: JSON.stringify(record) });

    // --- Prune ---
    try {
      const totalCount = await kv.zcard(COMPLETIONS_KEY);
      if (totalCount > MAX_COMPLETIONS) {
        await kv.zremrangebyrank(COMPLETIONS_KEY, 0, totalCount - MAX_COMPLETIONS - 1);
      }
    } catch {
      // Non-critical
    }

    return ok();
  } catch (error) {
    console.error('Completion submit error:', error);
    return res.status(200).json({ ok: true }); // Never expose errors
  }
}
