import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const LEADERBOARD_KEY = 'leaderboard:global';
const MAX_ENTRIES = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch top entries from sorted set (descending by EV score)
    const entries = await kv.zrange(LEADERBOARD_KEY, 0, MAX_ENTRIES - 1, { rev: true });

    // entries are stored as JSON strings in the sorted set
    // Wrap each parse in try/catch so one bad entry doesn't break the whole endpoint
    const parsed = entries.map((entry) => {
      try {
        return typeof entry === 'string' ? JSON.parse(entry) : entry;
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
}
