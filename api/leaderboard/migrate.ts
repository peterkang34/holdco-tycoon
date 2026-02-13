import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const OLD_KEY = 'leaderboard:global';
const NEW_KEY = 'leaderboard:v2';

/**
 * One-time migration + diagnostics for leaderboard data.
 *
 * GET /api/leaderboard/migrate              — show diagnostics (key counts)
 * GET /api/leaderboard/migrate?confirm=yes  — run migration from global to v2
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Always show diagnostics
    const oldCount = await kv.zcard(OLD_KEY);
    const newCount = await kv.zcard(NEW_KEY);

    // Also check for other possible key names
    const altKeys = ['leaderboard', 'leaderboard:scores', 'holdco-leaderboard'];
    const altCounts: Record<string, number> = {};
    for (const key of altKeys) {
      const count = await kv.zcard(key);
      if (count > 0) altCounts[key] = count;
    }

    // Scan for any keys matching 'leaderboard*'
    let allKeys: string[] = [];
    try {
      const scanResult = await kv.scan(0, { match: 'leaderboard*', count: 100 });
      allKeys = scanResult[1] as string[];
    } catch { /* scan may not be supported */ }

    if (req.query.confirm !== 'yes') {
      // Diagnostic mode — also peek at entries in new key
      let newEntries: unknown[] = [];
      if (newCount > 0) {
        newEntries = await kv.zrange(NEW_KEY, 0, 4, { rev: true });
        newEntries = newEntries.map(e => {
          try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return e; }
        });
      }

      let oldEntries: unknown[] = [];
      if (oldCount > 0) {
        oldEntries = await kv.zrange(OLD_KEY, 0, 4, { rev: true });
        oldEntries = oldEntries.map(e => {
          try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return e; }
        });
      }

      return res.status(200).json({
        diagnostics: {
          'leaderboard:global': { count: oldCount, topEntries: oldEntries },
          'leaderboard:v2': { count: newCount, topEntries: newEntries },
          otherKeysFound: altCounts,
          allLeaderboardKeys: allKeys,
        },
        action: 'Pass ?confirm=yes to migrate entries from leaderboard:global to leaderboard:v2',
      });
    }

    // Migration mode
    const oldEntries = await kv.zrange(OLD_KEY, 0, -1, { rev: true });

    if (!oldEntries || oldEntries.length === 0) {
      return res.status(200).json({
        message: 'No entries in old leaderboard to migrate',
        migrated: 0,
        diagnostics: { oldCount, newCount, allLeaderboardKeys: allKeys },
      });
    }

    let migrated = 0;
    let skipped = 0;
    const results: Array<{ initials: string; holdcoName: string; oldEV: number; newFEV: number }> = [];

    for (const raw of oldEntries) {
      try {
        const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;

        if (!entry || !entry.enterpriseValue || !entry.initials) {
          skipped++;
          continue;
        }

        const founderEquityValue = Math.round(entry.enterpriseValue * 0.80);

        const newEntry = {
          ...entry,
          founderEquityValue,
          founderPersonalWealth: 0,
          difficulty: 'easy',
          duration: 'standard',
        };

        const adjustedFEV = founderEquityValue;

        await kv.zadd(NEW_KEY, { score: adjustedFEV, member: JSON.stringify(newEntry) });
        migrated++;
        results.push({
          initials: entry.initials,
          holdcoName: entry.holdcoName,
          oldEV: entry.enterpriseValue,
          newFEV: founderEquityValue,
        });
      } catch {
        skipped++;
      }
    }

    return res.status(200).json({
      message: `Migration complete. ${migrated} entries migrated, ${skipped} skipped.`,
      migrated,
      skipped,
      results,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Migration failed' });
  }
}
