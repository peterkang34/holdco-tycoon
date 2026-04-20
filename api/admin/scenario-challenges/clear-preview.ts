/**
 * POST /api/admin/scenario-challenges/clear-preview?id={scenarioId}
 *
 * Bulk-deletes `game_history` rows flagged as admin-preview for a given scenario.
 * Admin-only. Safe to call multiple times — idempotent.
 *
 * Plan reference: scenario-challenges.md §7.3. Admin previews don't hit the
 * scenario leaderboard KV (submit.ts short-circuits before any write) but they
 * DO land in Postgres `game_history` with `is_admin_preview: true` for debug
 * observability. This endpoint cleans them up when the admin finishes iterating.
 *
 * Response:
 *   { success: true, deletedCount: number }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../../_lib/adminAuth.js';
import { supabaseAdmin } from '../../_lib/supabaseAdmin.js';

const SCENARIO_ID_REGEX = /^[a-z0-9-]{1,60}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id || !SCENARIO_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'invalid scenario id' });
  }

  try {
    // Atomic delete + count: Supabase `.delete().select('id')` returns the deleted
    // rows in one round-trip, so the count reflects the actual delete (no race
    // with concurrent admin-preview inserts). Dara M6.
    const { data, error } = await supabaseAdmin
      .from('game_history')
      .delete()
      .eq('scenario_challenge_id', id)
      .eq('is_admin_preview', true)
      .select('id');

    if (error) {
      console.error('clear-preview delete failed:', error);
      return res.status(500).json({ error: 'Failed to delete preview rows' });
    }

    const deletedCount = Array.isArray(data) ? data.length : 0;
    return res.status(200).json({ success: true, deletedCount });
  } catch (err) {
    console.error('clear-preview error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
