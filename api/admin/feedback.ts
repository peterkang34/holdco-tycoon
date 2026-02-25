import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  try {
    // Fetch all entries (oldest-first from zrange, then reverse for newest-first)
    const raw = await kv.zrange('feedback:submissions', 0, -1);
    const entries = raw
      .map((item: unknown) => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return null; }
      })
      .filter(Boolean)
      .reverse();

    // Read counters
    const [total, bug, feature, other] = await Promise.all([
      kv.get('feedback:count'),
      kv.get('feedback:count:bug'),
      kv.get('feedback:count:feature'),
      kv.get('feedback:count:other'),
    ]);

    return res.status(200).json({
      entries,
      counts: {
        total: Number(total) || 0,
        bug: Number(bug) || 0,
        feature: Number(feature) || 0,
        other: Number(other) || 0,
      },
    });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
}
