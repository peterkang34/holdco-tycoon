import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';

const RATE_LIMIT_SECONDS = 300; // 5 minutes between claim requests
const MAX_CLAIMS_PER_REQUEST = 10;
const CLAIM_LOCK_TTL = 30; // 30 seconds lock TTL

// 90-day claim window from feature launch (approximately March 2026)
const CLAIM_WINDOW_START = new Date('2026-03-01T00:00:00Z');
const CLAIM_WINDOW_DAYS = 90;

interface TokenClaim {
  type: 'token';
  claimToken: string;
}

interface HistoricalClaim {
  type: 'historical';
  initials: string;
  holdcoName: string;
  score: number;
  grade: string;
  difficulty: string;
  duration: string;
  date: string;
}

type Claim = TokenClaim | HistoricalClaim;

interface ClaimResult {
  status: 'claimed' | 'already_claimed' | 'not_found' | 'mismatch';
  holdcoName?: string;
}

/** Try to acquire a distributed lock. Returns true if acquired. */
async function acquireLock(entryId: string): Promise<boolean> {
  try {
    const key = `lock:claim:${entryId}`;
    const result = await kv.set(key, '1', { ex: CLAIM_LOCK_TTL, nx: true });
    return result === 'OK';
  } catch {
    return false;
  }
}

async function releaseLock(entryId: string): Promise<void> {
  try {
    await kv.del(`lock:claim:${entryId}`);
  } catch { /* best effort */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isBodyTooLarge(req.body)) return res.status(413).json({ error: 'Request too large' });

  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });
  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Check that user is NOT anonymous
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(playerId);
    if (userError || !user || user.is_anonymous) {
      return res.status(403).json({ error: 'Account required — anonymous users cannot claim games' });
    }

    // Rate limit: dual-key (per IP + per user)
    const ip = getClientIp(req);
    const ipRateLimitKey = `ratelimit:claim:${ip}`;
    const userRateLimitKey = `ratelimit:claim:user:${playerId}`;
    const [ipExisting, userExisting] = await Promise.all([kv.get(ipRateLimitKey), kv.get(userRateLimitKey)]);
    if (ipExisting || userExisting) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }

    const { claims } = req.body ?? {};
    if (!Array.isArray(claims) || claims.length === 0 || claims.length > MAX_CLAIMS_PER_REQUEST) {
      return res.status(400).json({ error: `claims must be an array of 1-${MAX_CLAIMS_PER_REQUEST} items` });
    }

    // Set rate limit AFTER validation passes (so validation failures don't consume the window)
    await Promise.all([
      kv.set(ipRateLimitKey, '1', { ex: RATE_LIMIT_SECONDS }),
      kv.set(userRateLimitKey, '1', { ex: RATE_LIMIT_SECONDS }),
    ]);

    // Fetch all leaderboard entries from KV
    const rawEntries = await kv.zrange(LEADERBOARD_KEY, 0, -1, { withScores: true });

    // Parse entries: zrange with withScores returns [member, score, member, score, ...]
    // @vercel/kv v3 auto-deserializes JSON, so member might be an object
    const kvEntries: { member: string; parsed: any; score: number }[] = [];
    for (let i = 0; i < rawEntries.length; i += 2) {
      const member = rawEntries[i];
      const score = rawEntries[i + 1] as number;
      try {
        const parsed = typeof member === 'string' ? JSON.parse(member) : member;
        kvEntries.push({ member: typeof member === 'string' ? member : JSON.stringify(member), parsed, score });
      } catch { /* skip unparseable */ }
    }

    const results: ClaimResult[] = [];
    const gameHistoryInserts: Promise<void>[] = []; // fire-and-forget

    for (const claim of claims as Claim[]) {
      if (claim.type === 'token') {
        // Era 2: Match by claimToken
        const match = kvEntries.find((e) => e.parsed.claimToken === claim.claimToken);
        if (!match) {
          results.push({ status: 'not_found' });
          continue;
        }
        if (match.parsed.playerId) {
          results.push({ status: 'already_claimed', holdcoName: match.parsed.holdcoName });
          continue;
        }

        // Acquire distributed lock to prevent TOCTOU race
        const entryId = match.parsed.id ?? match.parsed.claimToken;
        const locked = await acquireLock(entryId);
        if (!locked) {
          results.push({ status: 'already_claimed', holdcoName: match.parsed.holdcoName });
          continue;
        }

        try {
          // Claim: update KV entry with playerId
          const updatedEntry = { ...match.parsed, playerId };
          await kv.zrem(LEADERBOARD_KEY, match.member);
          await kv.zadd(LEADERBOARD_KEY, { score: match.score, member: JSON.stringify(updatedEntry) });

          // Queue game_history insert (non-blocking — don't await)
          gameHistoryInserts.push(insertGameHistory(playerId, updatedEntry));

          results.push({ status: 'claimed', holdcoName: match.parsed.holdcoName });
        } catch (err) {
          console.error('Token claim KV error:', err);
          results.push({ status: 'not_found' });
        } finally {
          releaseLock(entryId).catch(() => {});
        }
      } else if (claim.type === 'historical') {
        // Era 1: Composite match (within 90-day window)
        const now = new Date();
        const windowEnd = new Date(CLAIM_WINDOW_START.getTime() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        if (now > windowEnd) {
          results.push({ status: 'not_found' });
          continue;
        }

        // Find matching entry by composite key
        const match = kvEntries.find((e) => {
          const p = e.parsed;
          if (p.initials !== claim.initials) return false;
          if (p.holdcoName !== claim.holdcoName) return false;
          if (p.score !== claim.score) return false;
          if (p.grade !== claim.grade) return false;
          const pDiff = p.difficulty ?? 'easy';
          const pDur = p.duration ?? 'standard';
          if (pDiff !== claim.difficulty || pDur !== claim.duration) return false;
          // Date within ±60 seconds
          if (p.date && claim.date) {
            const diff = Math.abs(new Date(p.date).getTime() - new Date(claim.date).getTime());
            if (diff > 60_000) return false;
          }
          return true;
        });

        if (!match) {
          results.push({ status: 'not_found' });
          continue;
        }
        if (match.parsed.playerId) {
          results.push({ status: 'already_claimed', holdcoName: match.parsed.holdcoName });
          continue;
        }

        // Acquire distributed lock
        const entryId = match.parsed.id ?? `${claim.initials}:${claim.holdcoName}:${claim.score}`;
        const locked = await acquireLock(entryId);
        if (!locked) {
          results.push({ status: 'already_claimed', holdcoName: match.parsed.holdcoName });
          continue;
        }

        try {
          const updatedEntry = { ...match.parsed, playerId };
          await kv.zrem(LEADERBOARD_KEY, match.member);
          await kv.zadd(LEADERBOARD_KEY, { score: match.score, member: JSON.stringify(updatedEntry) });

          // Queue game_history insert (non-blocking)
          gameHistoryInserts.push(insertGameHistory(playerId, updatedEntry));

          results.push({ status: 'claimed', holdcoName: match.parsed.holdcoName });
        } catch (err) {
          console.error('Historical claim KV error:', err);
          results.push({ status: 'not_found' });
        } finally {
          releaseLock(entryId).catch(() => {});
        }
      } else {
        results.push({ status: 'not_found' });
      }
    }

    // Wait for game_history inserts (best-effort, don't block response if slow)
    await Promise.allSettled(gameHistoryInserts);

    // Update pre-computed stats after successful claims (non-blocking)
    if (results.some(r => r.status === 'claimed')) {
      updatePlayerStats(playerId).catch(console.error);
      updateGlobalStats().catch(console.error);
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('Claim handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

interface KvEntry {
  id?: string;
  holdcoName?: string;
  initials?: string;
  difficulty?: string;
  duration?: string;
  enterpriseValue?: number;
  founderEquityValue?: number;
  founderPersonalWealth?: number;
  score?: number;
  grade?: string;
  submittedMultiplier?: number;
  businessCount?: number;
  hasRestructured?: boolean;
  familyOfficeCompleted?: boolean;
  legacyGrade?: string;
  foMultiplier?: number;
  strategy?: Record<string, unknown>;
  date?: string;
}

async function insertGameHistory(playerId: string, entry: KvEntry): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    // Check if already exists (by leaderboard_entry_id)
    if (entry.id) {
      const { data: existing } = await supabaseAdmin
        .from('game_history')
        .select('id')
        .eq('leaderboard_entry_id', entry.id)
        .maybeSingle();

      if (existing) return; // Already in game_history
    }

    await supabaseAdmin.from('game_history').insert({
      player_id: playerId,
      holdco_name: entry.holdcoName ?? 'Unknown',
      initials: entry.initials ?? 'AA',
      difficulty: entry.difficulty ?? 'easy',
      duration: entry.duration ?? 'standard',
      enterprise_value: entry.enterpriseValue ?? 0,
      founder_equity_value: entry.founderEquityValue ?? entry.enterpriseValue ?? 0,
      founder_personal_wealth: entry.founderPersonalWealth ?? 0,
      adjusted_fev: Math.round(
        (entry.founderEquityValue ?? entry.enterpriseValue ?? 0) *
        (entry.submittedMultiplier ?? 1.0) *
        (entry.hasRestructured ? 0.80 : 1.0) *
        (entry.foMultiplier ?? 1.0)
      ),
      score: entry.score ?? 0,
      grade: entry.grade ?? 'F',
      submitted_multiplier: entry.submittedMultiplier ?? 1.0,
      business_count: entry.businessCount ?? 0,
      has_restructured: entry.hasRestructured ?? false,
      family_office_completed: entry.familyOfficeCompleted ?? false,
      legacy_grade: entry.legacyGrade ?? null,
      fo_multiplier: entry.foMultiplier ?? 1.0,
      strategy: entry.strategy ?? null,
      leaderboard_entry_id: entry.id ?? null,
      completed_at: entry.date ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to insert game_history for claimed entry:', err);
  }
}
