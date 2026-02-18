import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { verifyAdminToken } from '../_lib/adminAuth.js';

interface MonthData {
  month: string;
  started: number;
  completed: number;
  uniquePlayers: number;
  configBreakdown: Record<string, number>;
  sectorBreakdown: Record<string, number>;
  roundDistribution: Record<string, number>;
  gradeDistribution: Record<string, number>;
  fevDistribution: Record<string, number>;
  abandonByRound: Record<string, number>;
}

/**
 * Generate the last N month keys in YYYY-MM format, including the current month.
 */
function getLastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${year}-${month}`);
  }
  return keys;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check — verify session token from KV
  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  try {
    const monthKeys = getLastNMonthKeys(6);

    // Batch all monthly reads into a single pipeline
    const pipe = kv.pipeline();

    for (const mk of monthKeys) {
      pipe.get(`t:started:${mk}`);       // index 0, 9, 18, ...
      pipe.get(`t:completed:${mk}`);      // index 1, 10, 19, ...
      pipe.scard(`t:uv:${mk}`);           // index 2, 11, 20, ...
      pipe.hgetall(`t:cfg:${mk}`);        // index 3, 12, 21, ...
      pipe.hgetall(`t:sector:${mk}`);     // index 4, 13, 22, ...
      pipe.hgetall(`t:rounds:${mk}`);     // index 5, 14, 23, ...
      pipe.hgetall(`t:grades:${mk}`);     // index 6, 15, 24, ...
      pipe.hgetall(`t:fev:${mk}`);        // index 7, 16, 25, ...
      pipe.hgetall(`t:abandon:${mk}`);    // index 8, 17, 26, ...
    }

    // All-time totals
    pipe.get('t:started');                 // index: monthKeys.length * 9
    pipe.get('t:completed');               // index: monthKeys.length * 9 + 1

    const results = await pipe.exec();

    const FIELDS_PER_MONTH = 9;
    const months: MonthData[] = monthKeys.map((mk, i) => {
      const offset = i * FIELDS_PER_MONTH;
      return {
        month: mk,
        started: Number(results[offset]) || 0,
        completed: Number(results[offset + 1]) || 0,
        uniquePlayers: Number(results[offset + 2]) || 0,
        configBreakdown: toNumberRecord(results[offset + 3]),
        sectorBreakdown: toNumberRecord(results[offset + 4]),
        roundDistribution: toNumberRecord(results[offset + 5]),
        gradeDistribution: toNumberRecord(results[offset + 6]),
        fevDistribution: toNumberRecord(results[offset + 7]),
        abandonByRound: toNumberRecord(results[offset + 8]),
      };
    });

    const allTimeOffset = monthKeys.length * FIELDS_PER_MONTH;
    const allTime = {
      started: Number(results[allTimeOffset]) || 0,
      completed: Number(results[allTimeOffset + 1]) || 0,
    };

    // Fetch leaderboard top 25 (negative indices = highest scores)
    let leaderboardEntries: unknown[] = [];
    try {
      const raw = await kv.zrange(LEADERBOARD_KEY, -25, -1);
      leaderboardEntries = raw.map((entry) => {
        try {
          return typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch {
          return null;
        }
      }).filter(Boolean).reverse();
    } catch {
      // Non-critical — continue without leaderboard data
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ allTime, months, leaderboardEntries });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}

/**
 * Convert a Redis HGETALL result (possibly null) to a Record<string, number>.
 */
function toNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = Number(val) || 0;
  }
  return result;
}
