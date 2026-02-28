import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';

const VALID_STATUSES = ['new', 'acknowledged', 'in-progress', 'done', 'deployed'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  // ── PATCH: update status/priority/note for an entry ──
  if (req.method === 'PATCH') {
    try {
      const { id, status, priority, note } = req.body || {};

      // Validate id (13-digit numeric string)
      if (!id || typeof id !== 'string' || !/^\d{13,14}$/.test(id)) {
        return res.status(400).json({ error: 'id must be a 13-14 digit numeric string' });
      }

      // Validate status
      if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      // Validate optional priority
      if (priority !== undefined && !(VALID_PRIORITIES as readonly string[]).includes(priority)) {
        return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }

      // Sanitize optional note
      const sanitizedNote = note
        ? String(note).slice(0, 500).replace(/[<>]/g, '')
        : undefined;

      const statusObj: Record<string, unknown> = {
        status,
        updatedAt: new Date().toISOString(),
      };
      if (priority !== undefined) statusObj.priority = priority;
      if (sanitizedNote !== undefined) statusObj.note = sanitizedNote;

      await kv.hset('feedback:status', { [id]: JSON.stringify(statusObj) });

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Feedback status update error:', error);
      return res.status(500).json({ error: 'Failed to update feedback status' });
    }
  }

  // ── GET: fetch entries with status ──
  try {
    // Fetch entries and status hash in parallel
    const [raw, statusHash] = await Promise.all([
      kv.zrange('feedback:submissions', 0, -1),
      kv.hgetall('feedback:status') as Promise<Record<string, string> | null>,
    ]);

    const statuses = statusHash || {};

    // Track which status IDs are actually used
    const usedIds = new Set<string>();

    const entries = raw
      .map((item: unknown) => {
        try {
          const entry = typeof item === 'string' ? JSON.parse(item) : item;
          if (!entry) return null;

          // Compute entry ID from timestamp
          const id = String(new Date(entry.date).getTime());
          usedIds.add(id);

          // Look up status from hash, default to { status: 'new' }
          let entryStatus = { status: 'new' as string };
          if (statuses[id]) {
            try {
              const parsed = typeof statuses[id] === 'string'
                ? JSON.parse(statuses[id])
                : statuses[id];
              entryStatus = parsed;
            } catch { /* default */ }
          }

          return { ...entry, id, ...entryStatus };
        } catch { return null; }
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

    // Compute status counts from entries
    const statusCounts: Record<string, number> = {
      new: 0, acknowledged: 0, 'in-progress': 0, done: 0, deployed: 0,
    };
    for (const entry of entries) {
      const s = (entry as Record<string, unknown>).status as string;
      if (s in statusCounts) statusCounts[s]++;
    }

    // Clean up orphaned status hash entries (pruned from sorted set)
    const orphanedIds = Object.keys(statuses).filter(id => !usedIds.has(id));
    if (orphanedIds.length > 0) {
      await kv.hdel('feedback:status', ...orphanedIds);
    }

    return res.status(200).json({
      entries,
      counts: {
        total: Number(total) || 0,
        bug: Number(bug) || 0,
        feature: Number(feature) || 0,
        other: Number(other) || 0,
      },
      statusCounts,
    });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
}
