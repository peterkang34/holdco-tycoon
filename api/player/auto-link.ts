import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getClientIp, isBodyTooLarge } from '../_lib/rateLimit.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';

const RATE_LIMIT_SECONDS = 300; // 5 minutes between auto-link requests
const LOCK_TTL = 30; // 30 seconds lock TTL

async function acquireLock(entryId: string): Promise<boolean> {
  try {
    const key = `lock:autolink:${entryId}`;
    const result = await kv.set(key, '1', { ex: LOCK_TTL, nx: true });
    return result === 'OK';
  } catch {
    return false;
  }
}

async function releaseLock(entryId: string): Promise<void> {
  try {
    await kv.del(`lock:autolink:${entryId}`);
  } catch { /* best effort */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isBodyTooLarge(req.body)) return res.status(413).json({ error: 'Request too large' });

  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });
  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Must be a verified (non-anonymous) user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(playerId);
    if (userError || !user || user.is_anonymous) {
      return res.status(403).json({ error: 'Account required — anonymous users cannot auto-link' });
    }

    // Rate limit: dual-key (per IP + per user)
    const ip = getClientIp(req);
    const ipRateLimitKey = `ratelimit:autolink:${ip}`;
    const userRateLimitKey = `ratelimit:autolink:user:${playerId}`;
    const [ipExisting, userExisting] = await Promise.all([kv.get(ipRateLimitKey), kv.get(userRateLimitKey)]);
    if (ipExisting || userExisting) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }

    // Set rate limit AFTER validation
    await Promise.all([
      kv.set(ipRateLimitKey, '1', { ex: RATE_LIMIT_SECONDS }),
      kv.set(userRateLimitKey, '1', { ex: RATE_LIMIT_SECONDS }),
    ]);

    // Fetch all leaderboard entries from KV
    const rawEntries = await kv.zrange(LEADERBOARD_KEY, 0, -1, { withScores: true });

    // Parse entries: zrange with withScores returns [member, score, member, score, ...]
    const kvEntries: { member: string; parsed: any; score: number }[] = [];
    for (let i = 0; i < rawEntries.length; i += 2) {
      const member = rawEntries[i];
      const score = rawEntries[i + 1] as number;
      try {
        const parsed = typeof member === 'string' ? JSON.parse(member) : member;
        kvEntries.push({ member: typeof member === 'string' ? member : JSON.stringify(member), parsed, score });
      } catch { /* skip unparseable */ }
    }

    // Find entries where submittedBy matches this player but no playerId is set
    const linkable = kvEntries.filter((e) => e.parsed.submittedBy === playerId && !e.parsed.playerId);

    let linked = 0;

    // Ensure player_profiles row exists (game_history FK requires it)
    await supabaseAdmin.from('player_profiles').upsert({
      id: playerId,
      initials: 'AA',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true });

    const gameHistoryInserts: Promise<void>[] = [];

    for (const entry of linkable) {
      const entryId = entry.parsed.id ?? entry.parsed.submittedBy;
      const locked = await acquireLock(entryId);
      if (!locked) continue; // Another process is handling this entry

      try {
        // Re-check: entry might have been claimed by claim-history in the meantime
        // (We already filtered, but the lock ensures no TOCTOU race)

        const updatedEntry = { ...entry.parsed, playerId };
        await kv.zrem(LEADERBOARD_KEY, entry.member);
        await kv.zadd(LEADERBOARD_KEY, { score: entry.score, member: JSON.stringify(updatedEntry) });

        // Queue game_history insert
        gameHistoryInserts.push(insertGameHistory(playerId, updatedEntry));

        linked++;
      } catch (err) {
        console.error('Auto-link KV error:', err);
      } finally {
        releaseLock(entryId).catch(() => {});
      }
    }

    // Wait for game_history inserts
    await Promise.allSettled(gameHistoryInserts);

    // Update pre-computed stats after successful links
    if (linked > 0) {
      updatePlayerStats(playerId).catch(console.error);
      updateGlobalStats().catch(console.error);
    }

    return res.status(200).json({ linked, total: linkable.length });
  } catch (err) {
    console.error('Auto-link handler error:', err);
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
    console.error('Failed to insert game_history for auto-linked entry:', err);
  }
}
