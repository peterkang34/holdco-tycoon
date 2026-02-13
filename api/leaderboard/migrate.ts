import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const OLD_KEY = 'leaderboard:global';
const NEW_KEY = 'leaderboard:v2';

/**
 * One-time migration: copy entries from leaderboard:global to leaderboard:v2.
 * Old entries used raw Enterprise Value; new entries use Founder Equity Value.
 * Assumes all old entries are Easy/Standard (80% ownership, 1.0x multiplier).
 *
 * GET /api/leaderboard/migrate?confirm=yes
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.confirm !== 'yes') {
    return res.status(400).json({
      error: 'Pass ?confirm=yes to run migration',
      description: 'This will copy entries from leaderboard:global to leaderboard:v2, assuming Easy/Standard mode (80% ownership).',
    });
  }

  try {
    // Read all entries from the old sorted set
    const oldEntries = await kv.zrange(OLD_KEY, 0, -1, { rev: true });

    if (!oldEntries || oldEntries.length === 0) {
      return res.status(200).json({ message: 'No entries in old leaderboard to migrate', migrated: 0 });
    }

    let migrated = 0;
    let skipped = 0;
    const results: Array<{ initials: string; holdcoName: string; oldEV: number; newFEV: number }> = [];

    for (const raw of oldEntries) {
      try {
        const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;

        // Skip if entry is malformed
        if (!entry || !entry.enterpriseValue || !entry.initials) {
          skipped++;
          continue;
        }

        // Compute FEV: assume 80% ownership for all old entries (Easy mode)
        const founderEquityValue = Math.round(entry.enterpriseValue * 0.80);

        const newEntry = {
          ...entry,
          founderEquityValue,
          founderPersonalWealth: 0,
          difficulty: 'easy',
          duration: 'standard',
        };

        // adjustedFEV = FEV * 1.0 (Easy multiplier) = FEV
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
