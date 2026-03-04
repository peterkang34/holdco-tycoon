import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';

/**
 * POST /api/player/sync-claims
 * Repair endpoint: re-syncs claimed KV leaderboard entries into game_history.
 * Finds all KV entries with the authenticated player's ID and inserts any
 * that are missing from game_history. Then refreshes pre-computed stats.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Service temporarily unavailable' });

  const playerId = await getPlayerIdFromToken(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Read all KV leaderboard entries
    const rawEntries = await kv.zrange(LEADERBOARD_KEY, 0, -1, { withScores: true });

    // 2. Find entries belonging to this player
    const playerEntries: { parsed: any; score: number }[] = [];
    for (let i = 0; i < rawEntries.length; i += 2) {
      const member = rawEntries[i];
      const score = rawEntries[i + 1] as number;
      try {
        const parsed = typeof member === 'string' ? JSON.parse(member) : member;
        if (parsed.playerId === playerId) {
          playerEntries.push({ parsed, score });
        }
      } catch { /* skip */ }
    }

    if (playerEntries.length === 0) {
      return res.status(200).json({
        message: 'No claimed entries found in leaderboard for this player',
        kvEntries: 0,
        synced: 0,
        skipped: 0,
        errors: [],
      });
    }

    // 3. Check which are already in game_history
    const results: { holdcoName: string; status: string; error?: string }[] = [];
    let synced = 0;
    let skipped = 0;

    for (const { parsed: entry } of playerEntries) {
      const holdcoName = entry.holdcoName ?? 'Unknown';

      // Check if already exists
      if (entry.id) {
        const { data: existing } = await supabaseAdmin
          .from('game_history')
          .select('id')
          .eq('leaderboard_entry_id', entry.id)
          .maybeSingle();

        if (existing) {
          results.push({ holdcoName, status: 'already_exists' });
          skipped++;
          continue;
        }
      }

      // Insert into game_history
      const { error: insertError } = await supabaseAdmin.from('game_history').insert({
        player_id: playerId,
        holdco_name: holdcoName,
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

      if (insertError) {
        results.push({ holdcoName, status: 'error', error: insertError.message });
      } else {
        results.push({ holdcoName, status: 'synced' });
        synced++;
      }
    }

    // 4. Refresh pre-computed stats if anything was synced
    if (synced > 0) {
      await Promise.all([
        updatePlayerStats(playerId),
        updateGlobalStats(),
      ]);
    }

    return res.status(200).json({
      kvEntries: playerEntries.length,
      synced,
      skipped,
      errors: results.filter(r => r.status === 'error'),
      results,
    });
  } catch (err) {
    console.error('sync-claims error:', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err) });
  }
}
