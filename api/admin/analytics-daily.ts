import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';

/**
 * Returns the last 30 days of daily analytics data.
 * Lightweight endpoint separate from the heavy analytics.ts (228+ KV reads).
 * Pipeline: 30 days × 4 reads = 120 KV ops.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  try {
    const dayKeys = getLastNDayKeys(30);
    const pipe = kv.pipeline();

    for (const dk of dayKeys) {
      pipe.get(`t:started:d:${dk}`);    // 0
      pipe.get(`t:completed:d:${dk}`);  // 1
      pipe.get(`t:views:d:${dk}`);      // 2
      pipe.scard(`t:uv:d:${dk}`);       // 3
    }

    const results = await pipe.exec();

    const days = dayKeys.map((dk, i) => {
      const offset = i * 4;
      return {
        date: dk,
        started: Number(results[offset]) || 0,
        completed: Number(results[offset + 1]) || 0,
        pageViews: Number(results[offset + 2]) || 0,
        uniquePlayers: Number(results[offset + 3]) || 0,
      };
    });

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ days });
  } catch (error) {
    console.error('Analytics daily error:', error);
    return res.status(500).json({ error: 'Failed to fetch daily analytics' });
  }
}

/**
 * Generate the last N day keys in YYYY-MM-DD format, most recent first.
 */
function getLastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
