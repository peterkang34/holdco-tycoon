import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const NEW_KEY = 'leaderboard:v2';

/**
 * Admin endpoint for leaderboard management.
 *
 * GET /api/leaderboard/migrate                    — show diagnostics
 * GET /api/leaderboard/migrate?delete=ENTRY_ID    — delete a specific entry by ID
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Diagnostic mode
    const count = await kv.zcard(NEW_KEY);
    let entries: unknown[] = [];
    if (count > 0) {
      entries = await kv.zrange(NEW_KEY, 0, 9, { rev: true });
      entries = entries.map(e => {
        try { return typeof e === 'string' ? JSON.parse(e) : e; } catch { return e; }
      });
    }

    return res.status(200).json({
      'leaderboard:v2': { count, topEntries: entries },
    });
  } catch (error) {
    console.error('Leaderboard admin error:', error);
    return res.status(500).json({ error: 'Failed' });
  }
}
