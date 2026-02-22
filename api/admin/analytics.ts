import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { getWeekKey } from '../_lib/telemetry.js';

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
  // Phase 1
  deviceBreakdown: Record<string, number>;
  deviceComplete: Record<string, number>;
  deviceAbandon: Record<string, number>;
  returningBreakdown: Record<string, number>;
  durationDistribution: Record<string, number>;
  pageViews: number;
  viewsByDevice: Record<string, number>;
  startByNth: Record<string, number>;
  completeByNth: Record<string, number>;
  // Phase 2
  archetypeDistribution: Record<string, number>;
  antiPatternDistribution: Record<string, number>;
  sophisticationDistribution: Record<string, number>;
  dealStructureDistribution: Record<string, number>;
  platformsForgedDistribution: Record<string, number>;
  // Phase 5 ending business profile
  endingSubTypes: Record<string, number>;
  endingEbitdaSum: number;
  endingEbitdaCount: number;
  endingConstruction: Record<string, number>;
  // Phase 3
  challengeMetrics: {
    created: number;
    shared: number;
    joined: number;
    started: number;
    completed: number;
    scoreboardViews: number;
  };
  // Phase 4
  featureAdoption: Record<string, number>;
  eventChoices: Record<string, number>;
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

/**
 * Generate the last N week keys in YYYY-Www format.
 */
function getLastNWeekKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() - i * 7 * 86400000);
    keys.push(getWeekKey(d));
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
      // Original (0-8)
      pipe.get(`t:started:${mk}`);              // 0
      pipe.get(`t:completed:${mk}`);             // 1
      pipe.scard(`t:uv:${mk}`);                  // 2
      pipe.hgetall(`t:cfg:${mk}`);               // 3
      pipe.hgetall(`t:sector:${mk}`);            // 4
      pipe.hgetall(`t:rounds:${mk}`);            // 5
      pipe.hgetall(`t:grades:${mk}`);            // 6
      pipe.hgetall(`t:fev:${mk}`);               // 7
      pipe.hgetall(`t:abandon:${mk}`);           // 8
      // Phase 1 (9-17)
      pipe.hgetall(`t:device:${mk}`);            // 9
      pipe.hgetall(`t:device:complete:${mk}`);   // 10
      pipe.hgetall(`t:device:abandon:${mk}`);    // 11
      pipe.hgetall(`t:returning:${mk}`);         // 12
      pipe.hgetall(`t:duration:${mk}`);          // 13
      pipe.get(`t:views:${mk}`);                 // 14
      pipe.hgetall(`t:views:device:${mk}`);      // 15
      pipe.hgetall(`t:start_by_nth:${mk}`);      // 16
      pipe.hgetall(`t:complete_by_nth:${mk}`);   // 17
      // Phase 2 (18-22)
      pipe.hgetall(`t:archetype:${mk}`);         // 18
      pipe.hgetall(`t:antipattern:${mk}`);       // 19
      pipe.hgetall(`t:sophistication:${mk}`);    // 20
      pipe.hgetall(`t:structures:${mk}`);        // 21
      pipe.hgetall(`t:platforms_forged:${mk}`);  // 22
      // Phase 3 challenge (23-28)
      pipe.get(`t:challenge:${mk}:created`);     // 23
      pipe.get(`t:challenge:${mk}:shared`);      // 24
      pipe.get(`t:challenge:${mk}:joined`);      // 25
      pipe.get(`t:challenge:${mk}:started`);     // 26
      pipe.get(`t:challenge:${mk}:completed`);   // 27
      pipe.get(`t:challenge:${mk}:scoreboard_views`); // 28
      // Phase 4 (29-30)
      pipe.hgetall(`t:features:${mk}`);          // 29
      pipe.hgetall(`t:choices:${mk}`);           // 30
      // Phase 5 ending business profile (31-33)
      pipe.hgetall(`t:ending_subtypes:${mk}`);   // 31
      pipe.hgetall(`t:ending_ebitda:${mk}:sum`); // 32
      pipe.hgetall(`t:ending_construction:${mk}`); // 33
    }

    // All-time totals
    pipe.get('t:started');
    pipe.get('t:completed');

    const results = await pipe.exec();

    const FIELDS_PER_MONTH = 34;
    const months: MonthData[] = monthKeys.map((mk, i) => {
      const offset = i * FIELDS_PER_MONTH;
      // Phase 5: raw sum/count for proper weighted averaging in dashboard
      const ebitdaSumRecord = toNumberRecord(results[offset + 32]);
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
        // Phase 1
        deviceBreakdown: toNumberRecord(results[offset + 9]),
        deviceComplete: toNumberRecord(results[offset + 10]),
        deviceAbandon: toNumberRecord(results[offset + 11]),
        returningBreakdown: toNumberRecord(results[offset + 12]),
        durationDistribution: toNumberRecord(results[offset + 13]),
        pageViews: Number(results[offset + 14]) || 0,
        viewsByDevice: toNumberRecord(results[offset + 15]),
        startByNth: toNumberRecord(results[offset + 16]),
        completeByNth: toNumberRecord(results[offset + 17]),
        // Phase 2
        archetypeDistribution: toNumberRecord(results[offset + 18]),
        antiPatternDistribution: toNumberRecord(results[offset + 19]),
        sophisticationDistribution: toNumberRecord(results[offset + 20]),
        dealStructureDistribution: toNumberRecord(results[offset + 21]),
        platformsForgedDistribution: toNumberRecord(results[offset + 22]),
        // Phase 3
        challengeMetrics: {
          created: Number(results[offset + 23]) || 0,
          shared: Number(results[offset + 24]) || 0,
          joined: Number(results[offset + 25]) || 0,
          started: Number(results[offset + 26]) || 0,
          completed: Number(results[offset + 27]) || 0,
          scoreboardViews: Number(results[offset + 28]) || 0,
        },
        // Phase 4
        featureAdoption: toNumberRecord(results[offset + 29]),
        eventChoices: toNumberRecord(results[offset + 30]),
        // Phase 5
        endingSubTypes: toNumberRecord(results[offset + 31]),
        endingEbitdaSum: ebitdaSumRecord['total'] || 0,
        endingEbitdaCount: ebitdaSumRecord['count'] || 0,
        endingConstruction: toNumberRecord(results[offset + 33]),
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

    // Phase 5: Cohort retention data
    let cohortRetention: { cohortWeek: string; weekData: Record<string, number> }[] = [];
    try {
      const weekKeys = getLastNWeekKeys(8);
      const cohortPipe = kv.pipeline();
      // For each cohort week, check activity in each subsequent week
      for (const cohortWeek of weekKeys) {
        for (const activityWeek of weekKeys) {
          cohortPipe.scard(`t:cohort:${cohortWeek}:active:${activityWeek}`);
        }
      }
      const cohortResults = await cohortPipe.exec();
      let idx = 0;
      cohortRetention = weekKeys.map((cohortWeek) => {
        const weekData: Record<string, number> = {};
        for (const activityWeek of weekKeys) {
          weekData[activityWeek] = Number(cohortResults[idx]) || 0;
          idx++;
        }
        return { cohortWeek, weekData };
      });
    } catch {
      // Non-critical
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ allTime, months, leaderboardEntries, cohortRetention });
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
