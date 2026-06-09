/**
 * GET /api/player/scenario-records
 *
 * The signed-in player's per-scenario record: for each scenario they've played,
 * { attempts, bestScore, bestRawFev, bestRankingValue, bestRank, entryCount,
 *   lastPlayedAt }. Powers the "My Scenario Record" section + the cards'
 * "Your best: #rank" badge.
 *
 * Requires a VERIFIED account (401 for anonymous) — drives the logged-out nudge,
 * and anonymous sessions have no scenario rows anyway (submit is account-gated).
 *
 * Data sources:
 *   - Postgres game_history (durable): attempts / bestScore / bestRawFev / lastPlayed.
 *     Uses idx_game_history_player_scenario (migration 007).
 *   - KV scenario leaderboard (live): rank + entryCount + the ranking-metric value,
 *     by scanning the (≤500-entry) sorted set for the player's entry. null rank for
 *     archived (KV-expired) scenarios or players outside the top-500.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { resolvePlayerIdentity, parseLeaderboardMember } from '../_lib/leaderboardCore.js';
import { scenarioLeaderboardKey } from '../_lib/leaderboard.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { checkRateLimit } from '../_lib/rateLimit.js';

interface RecordRow {
  scenarioId: string;
  attempts: number;
  bestScore: number;
  bestRawFev: number;
  bestRankingValue: number | null;
  bestRank: number | null;
  entryCount: number | null;
  lastPlayedAt: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (await checkRateLimit(req, { namespace: 'player-scenario-records', maxRequests: 30 })) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });

  // Verified account required (anonymous → 401 → "sign in to track" nudge).
  const { verifiedPlayerId } = await resolvePlayerIdentity(req);
  if (!verifiedPlayerId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('game_history')
      .select('scenario_challenge_id, score, founder_equity_value, completed_at')
      .eq('player_id', verifiedPlayerId)
      .not('scenario_challenge_id', 'is', null)
      .not('is_admin_preview', 'is', true)
      .order('completed_at', { ascending: false })
      .limit(2000);

    if (error) {
      console.error('scenario-records query failed:', error);
      return res.status(200).json({ records: [], isLoggedIn: true });
    }

    // Group by scenario: attempts + best score/FEV + last played (Postgres-durable).
    const byScenario = new Map<string, RecordRow>();
    for (const r of rows ?? []) {
      const id = r.scenario_challenge_id as string;
      if (!id) continue;
      const score = (r.score as number) ?? 0;
      const fev = (r.founder_equity_value as number) ?? 0;
      const playedAt = String(r.completed_at ?? '');
      const existing = byScenario.get(id);
      if (!existing) {
        byScenario.set(id, {
          scenarioId: id, attempts: 1, bestScore: score, bestRawFev: fev,
          bestRankingValue: null, bestRank: null, entryCount: null,
          lastPlayedAt: playedAt,
        });
      } else {
        existing.attempts += 1;
        existing.bestScore = Math.max(existing.bestScore, score);
        existing.bestRawFev = Math.max(existing.bestRawFev, fev);
        if (playedAt > existing.lastPlayedAt) existing.lastPlayedAt = playedAt;
      }
    }

    // Enrich each scenario with the player's live KV rank + metric value (parallel).
    const records = await Promise.all(
      [...byScenario.values()].map(async (rec) => {
        const live = await scanPlayerRank(rec.scenarioId, verifiedPlayerId);
        return { ...rec, ...live };
      }),
    );
    records.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ records, isLoggedIn: true });
  } catch (err) {
    console.error('scenario-records error:', err);
    return res.status(200).json({ records: [], isLoggedIn: true });
  }
}

const kvz = kv as unknown as {
  zcard: (key: string) => Promise<number>;
  zrange: (key: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) => Promise<unknown[]>;
};

/**
 * Scan a scenario's KV sorted set (≤500 entries) for the player's entry and
 * return its 1-based rank + the ranking-metric value (the ZSET score) + total
 * entry count. rank/value are null when the scenario's KV has expired (archived)
 * or the player isn't in the top-500. Admin-preview entries are skipped (parity
 * with the public leaderboard read).
 */
async function scanPlayerRank(
  scenarioId: string,
  playerId: string,
): Promise<{ bestRank: number | null; bestRankingValue: number | null; entryCount: number | null }> {
  try {
    const lbKey = scenarioLeaderboardKey(scenarioId);
    const [entryCount, raw] = await Promise.all([
      kvz.zcard(lbKey),
      kvz.zrange(lbKey, 0, -1, { rev: true, withScores: true }),
    ]);
    if (!entryCount) return { bestRank: null, bestRankingValue: null, entryCount: null };

    let rank = 0; // 1-based, counting only non-preview entries (matches leaderboard read)
    for (let i = 0; i < raw.length; i += 2) {
      const sortScore = raw[i + 1];
      // Member may be a raw string OR an auto-deserialized object (Upstash quirk).
      const parsed = parseLeaderboardMember(raw[i]);
      if (!parsed || parsed.isAdminPreview) continue;
      rank += 1;
      if (parsed.playerId === playerId) {
        return { bestRank: rank, bestRankingValue: typeof sortScore === 'number' ? sortScore : null, entryCount };
      }
    }
    return { bestRank: null, bestRankingValue: null, entryCount };
  } catch (err) {
    console.error(`scanPlayerRank(${scenarioId}) failed:`, err);
    return { bestRank: null, bestRankingValue: null, entryCount: null };
  }
}
