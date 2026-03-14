import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { LEADERBOARD_KEY, COMPLETIONS_KEY, DIFFICULTY_MULTIPLIER } from '../_lib/leaderboard.js';
import { verifyAdminToken } from '../_lib/adminAuth.js';

const OLD_KEY = 'leaderboard:v1';
const NEW_KEY = LEADERBOARD_KEY;

// Conservative FO multiplier from legacy grade (uses minimum MOIC for each tier)
// Formula: Math.min(1.50, 1.0 + moic * 0.10)
const FO_MULTIPLIER_BY_GRADE: Record<string, number> = {
  'Enduring':    1.50,  // MOIC >= 5.0 → cap 1.50 (confirmed by player screenshots)
  'Influential': 1.20,  // MOIC >= 2.0 → 1.0 + 2.0 * 0.1 = 1.20
  'Established': 1.10,  // MOIC >= 1.0 → 1.0 + 1.0 * 0.1 = 1.10
  'Fragile':     1.0,   // MOIC < 1.0  → no bonus
};

/**
 * Admin endpoint for leaderboard management.
 *
 * GET /api/leaderboard/migrate                              — show diagnostics (v1 + v2)
 * GET /api/leaderboard/migrate?action=migrate_v1            — migrate v1 entries to v2
 * GET /api/leaderboard/migrate?action=apply_fo_multiplier   — backfill foMultiplier for FO entries
 * GET /api/leaderboard/migrate?delete=ENTRY_ID              — delete a specific entry by ID
 * GET /api/leaderboard/migrate?deleteName=HOLDCO_NAME       — delete ALL entries matching holdco name
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

    // Delete by holdco name (bulk — leaderboard + completions)
    const deleteName = req.query.deleteName;
    if (typeof deleteName === 'string' && deleteName.length > 0) {
      const allEntries = await kv.zrange(NEW_KEY, 0, -1);
      const deleted: { id: string; holdcoName: string }[] = [];
      for (const raw of allEntries) {
        try {
          const entry: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (entry?.holdcoName === deleteName) {
            await kv.zrem(NEW_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
            deleted.push({ id: entry.id, holdcoName: entry.holdcoName });
          }
        } catch { /* skip malformed */ }
      }

      // Also clean completions feed
      const completionEntries = await kv.zrange(COMPLETIONS_KEY, 0, -1);
      const deletedCompletions: string[] = [];
      for (const raw of completionEntries) {
        try {
          const entry: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (entry?.holdcoName === deleteName) {
            await kv.zrem(COMPLETIONS_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
            deletedCompletions.push(entry.id ?? 'unknown');
          }
        } catch { /* skip malformed */ }
      }

      return res.status(200).json({
        leaderboard: { deletedCount: deleted.length, deleted },
        completions: { deletedCount: deletedCompletions.length, deleted: deletedCompletions },
        name: deleteName,
      });
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

    // Backfill FO multiplier for entries with familyOfficeCompleted but no foMultiplier
    if (action === 'apply_fo_multiplier') {
      const allEntries = await kv.zrange(NEW_KEY, 0, -1);
      let updated = 0;
      let alreadyHas = 0;
      let notFO = 0;
      const details: { id: string; holdcoName: string; legacyGrade: string; foMultiplier: number; oldAdjFEV: number; newAdjFEV: number }[] = [];
      const skipped: string[] = [];

      for (const raw of allEntries) {
        try {
          const entry: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!entry?.id) { skipped.push('missing id'); continue; }

          // Skip entries that aren't FO completions
          if (!entry.familyOfficeCompleted) { notFO++; continue; }

          // Skip entries that already have the correct foMultiplier
          const expectedMult = (typeof entry.legacyGrade === 'string' && FO_MULTIPLIER_BY_GRADE[entry.legacyGrade]) || 1.0;
          if (typeof entry.foMultiplier === 'number' && entry.foMultiplier >= expectedMult) { alreadyHas++; continue; }

          // Derive foMultiplier from legacyGrade
          const grade = entry.legacyGrade;
          const foMult = (typeof grade === 'string' && FO_MULTIPLIER_BY_GRADE[grade]) || 1.0;

          // Skip if multiplier would be 1.0 (no change needed)
          if (foMult <= 1.0) { notFO++; continue; }

          // Recalculate adjusted FEV with the new foMultiplier
          const fev = entry.founderEquityValue ?? entry.enterpriseValue;
          const difficulty = entry.difficulty ?? 'easy';
          const multiplier = entry.submittedMultiplier ?? (DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0);
          const restructuringPenalty = entry.hasRestructured ? 0.80 : 1.0;

          const oldAdjFEV = Math.round(fev * multiplier * restructuringPenalty);
          const newAdjFEV = Math.round(fev * multiplier * restructuringPenalty * foMult);

          // Remove old entry, add updated one with new score
          const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
          await kv.zrem(NEW_KEY, rawStr);

          const enriched = {
            ...entry,
            foMultiplier: foMult,
          };
          await kv.zadd(NEW_KEY, { score: newAdjFEV, member: JSON.stringify(enriched) });

          details.push({
            id: entry.id,
            holdcoName: entry.holdcoName,
            legacyGrade: grade ?? 'unknown',
            foMultiplier: foMult,
            oldAdjFEV,
            newAdjFEV,
          });
          updated++;
        } catch (e) {
          skipped.push(String(e));
        }
      }

      return res.status(200).json({
        totalEntries: allEntries.length,
        updated,
        alreadyHas,
        notFO,
        skipped,
        details,
      });
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
