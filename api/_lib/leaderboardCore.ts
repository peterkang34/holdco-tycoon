/**
 * Shared primitives for leaderboard submission endpoints.
 *
 * Consumed by:
 *   - api/leaderboard/submit.ts (global leaderboard)
 *   - api/scenario-challenges/submit.ts (per-scenario leaderboard — coming in scenario-challenges plan)
 *
 * Each helper is intentionally narrow-purpose — callers orchestrate their own validation
 * and payload shaping. The helpers own the concerns that are genuinely identical across
 * leaderboard variants: IP rate limiting, player identity resolution, profile upsert,
 * KV sorted-set write with pruning, and the game_history enrich-or-insert dance.
 */

import type { VercelRequest } from '@vercel/node';
import { randomUUID } from 'crypto';
import { kv } from '@vercel/kv';
import { getClientIp } from './rateLimit.js';
import { getPlayerIdFromToken } from './playerAuth.js';
import { supabaseAdmin } from './supabaseAdmin.js';

// Typed shim for @vercel/kv methods not surfaced in the current published types.
const kvz = kv as unknown as {
  zadd: (key: string, entry: { score: number; member: string }) => Promise<number>;
  zcard: (key: string) => Promise<number>;
  zrank: (key: string, member: string) => Promise<number | null>;
  zremrangebyrank: (key: string, min: number, max: number) => Promise<number>;
};

// ─── Rate limit ────────────────────────────────────────────────────────────

/**
 * IP-based rate limit using a per-namespace KV key with explicit TTL.
 * Returns true if caller should respond 429.
 *
 * Matches the original submit.ts behavior: one submission per window per IP.
 * Uses get/set-with-TTL (not incr/expire) so the TTL is set atomically with the first hit.
 */
export async function checkSubmitRateLimit(
  req: VercelRequest,
  opts: { namespace: string; windowSeconds: number },
): Promise<boolean> {
  const ip = getClientIp(req);
  const rateLimitKey = `ratelimit:${opts.namespace}:${ip}`;

  const existing = await kv.get(rateLimitKey);
  if (existing) return true;

  await kv.set(rateLimitKey, '1', { ex: opts.windowSeconds });
  return false;
}

// ─── Player identity ──────────────────────────────────────────────────────

export interface PlayerIdentity {
  /** Raw player ID from the JWT — present for both anonymous and verified sessions. */
  playerId: string | null;
  /** Only set for non-anonymous (verified) accounts. Used for leaderboard entry `playerId` field. */
  verifiedPlayerId: string | undefined;
  /** True if no auth token, or token belongs to an anonymous Supabase session. */
  isAnonymous: boolean;
}

/**
 * Resolve the submitting player's identity from the request's Authorization header.
 * Safe for unauthenticated requests — returns nulls rather than throwing.
 */
export async function resolvePlayerIdentity(req: VercelRequest): Promise<PlayerIdentity> {
  const playerId = await getPlayerIdFromToken(req);

  let isAnonymous = true;
  if (playerId && supabaseAdmin) {
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(playerId);
      isAnonymous = user?.is_anonymous ?? true;
    } catch (err) {
      // Treat as anonymous on error — but log so silent data-loss paths stay observable.
      console.error('resolvePlayerIdentity: getUserById failed:', err);
    }
  }

  const verifiedPlayerId = playerId && !isAnonymous ? playerId : undefined;
  return { playerId, verifiedPlayerId, isAnonymous };
}

// ─── Profile upsert ───────────────────────────────────────────────────────

export interface ProfileUpsertResult {
  publicProfileId?: string;
}

/**
 * Upsert player_profiles, sync initials, and look up / backfill public_id.
 * No-op if supabaseAdmin is null (env missing).
 *
 * Only verified (non-anonymous) players get a looked-up public_id; anonymous
 * sessions skip the lookup (their entries don't carry publicProfileId).
 */
export async function upsertPlayerProfile(opts: {
  playerId: string;
  verifiedPlayerId: string | undefined;
  initials: string;
  entryDate: string;
}): Promise<ProfileUpsertResult> {
  const result: ProfileUpsertResult = {};
  if (!supabaseAdmin) return result;

  // Ensure profile exists. onConflict + ignoreDuplicates preserves existing public_id.
  const newPublicId = randomUUID().replace(/-/g, '').slice(0, 12);
  try {
    await supabaseAdmin.from('player_profiles').upsert(
      {
        id: opts.playerId,
        initials: opts.initials,
        public_id: newPublicId,
        created_at: opts.entryDate,
        updated_at: opts.entryDate,
        last_played_at: opts.entryDate,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

    // Always sync initials + last_played_at — the upsert skips on conflict,
    // so this separate update lets user-typed initials override the 'AA' default.
    await supabaseAdmin
      .from('player_profiles')
      .update({ initials: opts.initials, last_played_at: opts.entryDate, updated_at: opts.entryDate })
      .eq('id', opts.playerId);
  } catch (err) {
    console.error('player_profiles upsert failed:', err);
  }

  // Look up public_id for verified accounts; backfill if null.
  if (opts.verifiedPlayerId) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('player_profiles')
        .select('public_id')
        .eq('id', opts.verifiedPlayerId)
        .single();
      if (profile?.public_id) {
        result.publicProfileId = profile.public_id as string;
      } else {
        // Profile exists but public_id is null — backfill.
        const backfillId = randomUUID().replace(/-/g, '').slice(0, 12);
        await supabaseAdmin
          .from('player_profiles')
          .update({ public_id: backfillId, updated_at: opts.entryDate })
          .eq('id', opts.verifiedPlayerId);
        result.publicProfileId = backfillId;
      }
    } catch (err) {
      // Best-effort — leaderboard entry still succeeds without publicProfileId.
      console.error('upsertPlayerProfile: public_id lookup/backfill failed:', err);
    }
  }

  return result;
}

// ─── KV sorted-set write ──────────────────────────────────────────────────

/**
 * Write an entry to a leaderboard sorted set, prune to maxEntries, and return
 * the entry's descending rank (1 = top).
 *
 * `sortScore` is the zset score — caller decides the metric (adjusted FEV, MOIC × N, raw FEV, etc.)
 * `entryJson` must be a pre-serialized JSON string (member value in the sorted set).
 *
 * Rank computation: `currentCount - ascRank` (ascRank is 0-indexed lowest-first).
 * When zrank returns null (entry not in set — should not happen after a successful zadd
 * but possible under concurrent prune), falls back to rank = 1.
 */
export async function writeLeaderboardEntry(opts: {
  kvKey: string;
  entryJson: string;
  sortScore: number;
  maxEntries: number;
}): Promise<{ rank: number }> {
  await kvz.zadd(opts.kvKey, { score: opts.sortScore, member: opts.entryJson });

  const totalCount = await kvz.zcard(opts.kvKey);
  if (totalCount > opts.maxEntries) {
    await kvz.zremrangebyrank(opts.kvKey, 0, totalCount - opts.maxEntries - 1);
  }

  const ascRank = await kvz.zrank(opts.kvKey, opts.entryJson);
  const currentCount = await kvz.zcard(opts.kvKey);
  const rank = ascRank !== null ? currentCount - ascRank : 1;

  return { rank };
}

// ─── game_history enrich-or-insert ────────────────────────────────────────

/**
 * Dual-write to Postgres game_history: if an auto-save row matches the submission
 * (same player, score, grade, difficulty, no leaderboard_entry_id), enrich it
 * with leaderboard fields; otherwise insert a fresh row.
 *
 * `match` is the dedup criteria (all conditions AND'd; `leaderboard_entry_id IS NULL` always added).
 * `enrichFields` is the minimal set applied to an existing row (leaderboard_entry_id, branding, playbook).
 * `insertRow` is the full row written when no existing match is found.
 *
 * All errors are caught and logged — this function NEVER throws. Leaderboard writes
 * succeed even if Postgres is unavailable (KV is the source of truth for rankings).
 */
export async function upsertGameHistoryRow(opts: {
  playerId: string;
  match: Record<string, unknown>;
  enrichFields: Record<string, unknown>;
  insertRow: Record<string, unknown>;
}): Promise<void> {
  if (!supabaseAdmin) return;

  // 1. Look for an unclaimed auto-save row.
  let existingRowId: string | null = null;
  try {
    let query = supabaseAdmin
      .from('game_history')
      .select('id')
      .eq('player_id', opts.playerId);
    for (const [col, val] of Object.entries(opts.match)) {
      query = query.eq(col, val);
    }
    const { data: existing } = await query
      .is('leaderboard_entry_id', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existingRowId = (existing as { id?: string } | null)?.id ?? null;
  } catch (err) {
    // Fall through to insert path — but log so transient DB errors that could cause
    // duplicate inserts stay observable in production logs.
    console.error('upsertGameHistoryRow: existing-row lookup failed:', err);
  }

  // 2. Enrich existing or insert fresh.
  try {
    if (existingRowId) {
      await supabaseAdmin.from('game_history').update(opts.enrichFields).eq('id', existingRowId);
    } else {
      await supabaseAdmin.from('game_history').insert(opts.insertRow);
    }
  } catch (err) {
    console.error('game_history insert/update failed:', err);
  }
}
