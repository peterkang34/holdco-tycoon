import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updatePlayerStats } from '../_lib/playerStats.js';

/**
 * POST /api/admin/sync-kv-history
 * Scan ALL KV leaderboard entries and backfill missing game_history rows.
 * Fixes the divergence where games are on the leaderboard but not in Supabase.
 *
 * Optional body: { initials?: string } to sync only entries matching specific initials.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    const { initials: filterInitials } = (req.body ?? {}) as { initials?: string };

    // Fetch ALL KV leaderboard entries
    const raw = await kv.zrange(LEADERBOARD_KEY, 0, -1);
    const entries: any[] = raw.map((item: any) => {
      if (typeof item === 'string') {
        try { return JSON.parse(item); } catch { return item; }
      }
      return item;
    });

    if (filterInitials) {
      // Only process entries matching the given initials
      const upper = filterInitials.toUpperCase();
      entries.splice(0, entries.length, ...entries.filter((e: any) => e.initials === upper));
    }

    // Get all existing leaderboard_entry_ids from game_history to detect missing ones
    const existingIds = new Set<string>();
    let offset = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('game_history')
        .select('leaderboard_entry_id')
        .not('leaderboard_entry_id', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !data) break;
      for (const row of data) {
        if (row.leaderboard_entry_id) existingIds.add(row.leaderboard_entry_id);
      }
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const affectedPlayerIds = new Set<string>();
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.id) { skipped++; continue; }

      // Already in game_history
      if (existingIds.has(entry.id)) { skipped++; continue; }

      // Need a player ID to insert — use submittedBy or playerId
      const playerId = entry.playerId || entry.submittedBy;
      if (!playerId) { skipped++; continue; }

      try {
        // Ensure player_profiles exists (don't overwrite existing)
        await supabaseAdmin.from('player_profiles').upsert({
          id: playerId,
          initials: entry.initials || 'AA',
          updated_at: entry.date || new Date().toISOString(),
          last_played_at: entry.date || new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });

        // Build strategy from KV entry
        const strategy = entry.strategy || null;

        // Insert game_history row
        const { error: insertError } = await supabaseAdmin.from('game_history').insert({
          player_id: playerId,
          holdco_name: (entry.holdcoName || 'Unknown').slice(0, 50),
          initials: entry.initials || 'AA',
          difficulty: entry.difficulty || 'easy',
          duration: entry.duration || 'standard',
          enterprise_value: Math.round(entry.enterpriseValue || 0),
          founder_equity_value: Math.round(entry.founderEquityValue || 0),
          founder_personal_wealth: Math.round(entry.founderPersonalWealth || 0),
          adjusted_fev: Math.round(
            (entry.founderEquityValue || 0) *
            (entry.submittedMultiplier || 1) *
            (entry.hasRestructured ? 0.8 : 1) *
            (entry.foMultiplier || 1)
          ),
          score: entry.score || 0,
          grade: entry.grade || 'F',
          submitted_multiplier: entry.submittedMultiplier || 1.0,
          business_count: entry.businessCount || 0,
          total_revenue: entry.totalRevenue ?? null,
          avg_ebitda_margin: entry.avgEbitdaMargin ?? null,
          has_restructured: entry.hasRestructured === true,
          family_office_completed: entry.familyOfficeCompleted === true,
          legacy_grade: entry.legacyGrade || null,
          fo_multiplier: entry.foMultiplier || 1.0,
          strategy,
          ...(strategy?.scoreBreakdown ? {
            score_value_creation: strategy.scoreBreakdown.valueCreation,
            score_fcf_share_growth: strategy.scoreBreakdown.fcfShareGrowth,
            score_portfolio_roic: strategy.scoreBreakdown.portfolioRoic,
            score_capital_deployment: strategy.scoreBreakdown.capitalDeployment,
            score_balance_sheet: strategy.scoreBreakdown.balanceSheetHealth,
            score_strategic_discipline: strategy.scoreBreakdown.strategicDiscipline,
          } : {}),
          leaderboard_entry_id: entry.id,
          completed_at: entry.date || new Date().toISOString(),
        });

        if (insertError) {
          failed++;
          errors.push(`${entry.id} (${entry.initials}): ${insertError.message}`);
        } else {
          synced++;
          affectedPlayerIds.add(playerId);
        }
      } catch (err) {
        failed++;
        errors.push(`${entry.id}: ${(err as Error).message}`);
      }
    }

    // Recompute stats for all affected players
    for (const pid of affectedPlayerIds) {
      updatePlayerStats(pid).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      totalKvEntries: entries.length,
      synced,
      skipped,
      failed,
      affectedPlayers: affectedPlayerIds.size,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('[sync-kv-history] Failed:', err);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
