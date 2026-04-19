import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { LEADERBOARD_KEY, COMPLETIONS_KEY } from '../_lib/leaderboard.js';
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
  deviceBreakdown: Record<string, number>;
  deviceComplete: Record<string, number>;
  deviceAbandon: Record<string, number>;
  returningBreakdown: Record<string, number>;
  durationDistribution: Record<string, number>;
  pageViews: number;
  startByNth: Record<string, number>;
  completeByNth: Record<string, number>;
  sophisticationDistribution: Record<string, number>;
  challengeMetrics: {
    created: number;
    shared: number;
    joined: number;
    started: number;
    completed: number;
    scoreboardViews: number;
  };
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
    // Streamlined: only reads needed by Overview, Community, B-School tabs
    const pipe = kv.pipeline();

    for (const mk of monthKeys) {
      pipe.get(`t:started:${mk}`);              // 0
      pipe.get(`t:completed:${mk}`);             // 1
      pipe.scard(`t:uv:${mk}`);                  // 2
      pipe.hgetall(`t:cfg:${mk}`);               // 3
      pipe.hgetall(`t:sector:${mk}`);            // 4
      pipe.hgetall(`t:rounds:${mk}`);            // 5
      pipe.hgetall(`t:grades:${mk}`);            // 6
      pipe.hgetall(`t:fev:${mk}`);               // 7
      pipe.hgetall(`t:abandon:${mk}`);           // 8
      pipe.hgetall(`t:device:${mk}`);            // 9
      pipe.hgetall(`t:device:complete:${mk}`);   // 10
      pipe.hgetall(`t:device:abandon:${mk}`);    // 11
      pipe.hgetall(`t:returning:${mk}`);         // 12
      pipe.hgetall(`t:duration:${mk}`);          // 13
      pipe.get(`t:views:${mk}`);                 // 14
      pipe.hgetall(`t:start_by_nth:${mk}`);      // 15
      pipe.hgetall(`t:complete_by_nth:${mk}`);   // 16
      pipe.hgetall(`t:sophistication:${mk}`);    // 17
      // Challenge metrics (for k-factor on Overview hero)
      pipe.get(`t:challenge:${mk}:created`);     // 18
      pipe.get(`t:challenge:${mk}:shared`);      // 19
      pipe.get(`t:challenge:${mk}:joined`);      // 20
      pipe.get(`t:challenge:${mk}:started`);     // 21
      pipe.get(`t:challenge:${mk}:completed`);   // 22
      pipe.get(`t:challenge:${mk}:scoreboard_views`); // 23
    }

    // All-time totals
    pipe.get('t:started');
    pipe.get('t:completed');

    const results = await pipe.exec();

    const FIELDS_PER_MONTH = 24;
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
        deviceBreakdown: toNumberRecord(results[offset + 9]),
        deviceComplete: toNumberRecord(results[offset + 10]),
        deviceAbandon: toNumberRecord(results[offset + 11]),
        returningBreakdown: toNumberRecord(results[offset + 12]),
        durationDistribution: toNumberRecord(results[offset + 13]),
        pageViews: Number(results[offset + 14]) || 0,
        startByNth: toNumberRecord(results[offset + 15]),
        completeByNth: toNumberRecord(results[offset + 16]),
        sophisticationDistribution: toNumberRecord(results[offset + 17]),
        challengeMetrics: {
          created: Number(results[offset + 18]) || 0,
          shared: Number(results[offset + 19]) || 0,
          joined: Number(results[offset + 20]) || 0,
          started: Number(results[offset + 21]) || 0,
          completed: Number(results[offset + 22]) || 0,
          scoreboardViews: Number(results[offset + 23]) || 0,
        },
      };
    });

    const allTimeOffset = monthKeys.length * FIELDS_PER_MONTH;
    const allTime = {
      started: Number(results[allTimeOffset]) || 0,
      completed: Number(results[allTimeOffset + 1]) || 0,
    };

    // Fetch leaderboard top 25 + recent 25 + game completions (in parallel)
    let leaderboardEntries: unknown[] = [];
    let recentEntries: unknown[] = [];
    let completionEntries: unknown[] = [];
    try {
      const [raw, rawCompletions] = await Promise.all([
        kv.zrange(LEADERBOARD_KEY, 0, -1).catch(() => [] as unknown[]),
        kv.zrange(COMPLETIONS_KEY, -50, -1).catch(() => [] as unknown[]),
      ]);

      const allEntries = raw.map((entry) => {
        try {
          return typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Top 25 by adjusted FEV (sorted set is ascending, so take last 25 reversed)
      leaderboardEntries = allEntries.slice(-25).reverse();

      // Recent 25 by date
      recentEntries = [...allEntries]
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 25);

      // Completions: most recent first
      completionEntries = rawCompletions.map((entry) => {
        try {
          return typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch {
          return null;
        }
      }).filter(Boolean).reverse();
    } catch {
      // Non-critical — continue without leaderboard/completion data
    }

    // Activity feed: recent starts + abandons
    let activityFeed: unknown[] = [];
    try {
      const rawActivity = await kv.lrange('t:activity:recent', 0, 49);
      activityFeed = rawActivity.map((item) => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      // Non-critical
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ allTime, months, leaderboardEntries, recentEntries, completionEntries, activityFeed });
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
