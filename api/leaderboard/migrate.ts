import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { LEADERBOARD_KEY, DIFFICULTY_MULTIPLIER } from '../_lib/leaderboard.js';
import { verifyAdminToken } from '../_lib/adminAuth.js';

const OLD_KEY = 'leaderboard:v1';
const NEW_KEY = LEADERBOARD_KEY;

/**
 * Admin endpoint for leaderboard management.
 *
 * GET /api/leaderboard/migrate                    — show diagnostics (v1 + v2)
 * GET /api/leaderboard/migrate?action=migrate_v1  — migrate v1 entries to v2
 * GET /api/leaderboard/migrate?delete=ENTRY_ID    — delete a specific entry by ID
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin session token
  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  try {
    // Delete mode
    const deleteId = req.query.delete;
    if (typeof deleteId === 'string' && deleteId.length > 0) {
      const allEntries = await kv.zrange(NEW_KEY, 0, -1);
      let deleted = false;
      for (const raw of allEntries) {
        try {
          const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (entry?.id === deleteId) {
            await kv.zrem(NEW_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
            deleted = true;
            break;
          }
        } catch { /* skip malformed */ }
      }
      return res.status(200).json({ deleted, id: deleteId });
    }

    // Migrate v1 → v2
    const action = req.query.action;
    if (action === 'migrate_v1') {
      const v1Entries = await kv.zrange(OLD_KEY, 0, -1);
      let migrated = 0;
      const skipped: string[] = [];

      for (const raw of v1Entries) {
        try {
          const entry: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!entry?.id || !entry?.holdcoName) { skipped.push('missing fields'); continue; }

          // Compute FEV for v1 entries (they only had EV)
          const fev = entry.founderEquityValue ?? entry.enterpriseValue;
          const difficulty = entry.difficulty ?? 'easy';
          const multiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0;
          const adjustedFEV = Math.round(fev * multiplier);

          // Enrich with defaults for fields v1 didn't have
          const enriched = {
            ...entry,
            founderEquityValue: fev,
            founderPersonalWealth: entry.founderPersonalWealth ?? 0,
            difficulty: difficulty,
            duration: entry.duration ?? 'standard',
          };

          await kv.zadd(NEW_KEY, { score: adjustedFEV, member: JSON.stringify(enriched) });
          migrated++;
        } catch (e) {
          skipped.push(String(e));
        }
      }

      return res.status(200).json({ migrated, skipped, v1Total: v1Entries.length });
    }

    // Audit mode — flag potentially invalid entries
    if (action === 'audit') {
      const allEntries = await kv.zrange(NEW_KEY, 0, -1);
      const flagged: { id: string; holdcoName: string; flags: string[]; fev?: number; ev?: number; difficulty?: string; duration?: string }[] = [];

      for (const raw of allEntries) {
        try {
          const entry: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!entry?.id) continue;
          const flags: string[] = [];

          if (!entry.difficulty) flags.push('missing_difficulty');
          if (!entry.duration) flags.push('missing_duration');
          if (!entry.founderEquityValue && entry.founderEquityValue !== 0) flags.push('missing_fev');
          // $200M = 200000 in thousands
          if ((entry.enterpriseValue ?? 0) > 200000) flags.push('high_ev');

          if (flags.length > 0) {
            flagged.push({
              id: entry.id,
              holdcoName: entry.holdcoName,
              flags,
              fev: entry.founderEquityValue,
              ev: entry.enterpriseValue,
              difficulty: entry.difficulty,
              duration: entry.duration,
            });
          }
        } catch { /* skip malformed */ }
      }

      return res.status(200).json({ totalEntries: allEntries.length, flaggedCount: flagged.length, flagged });
    }

    // Diagnostic mode — show both v1 and v2
    const v1Count = await kv.zcard(OLD_KEY);
    const v2Count = await kv.zcard(NEW_KEY);

    let v1Entries: unknown[] = [];
    if (v1Count > 0) {
      v1Entries = await kv.zrange(OLD_KEY, 0, 9);
      v1Entries = v1Entries.map(e => {
        try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return e; }
      }).reverse();
    }

    let v2Entries: unknown[] = [];
    if (v2Count > 0) {
      v2Entries = await kv.zrange(NEW_KEY, 0, 9);
      v2Entries = v2Entries.map(e => {
        try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return e; }
      }).reverse();
    }

    return res.status(200).json({
      'leaderboard:v1': { count: v1Count, topEntries: v1Entries },
      'leaderboard:v2': { count: v2Count, topEntries: v2Entries },
    });
  } catch (error) {
    console.error('Leaderboard admin error:', error);
    return res.status(500).json({ error: 'Failed' });
  }
}
