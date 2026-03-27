import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

/**
 * GET /api/admin/bschool-stats
 * Returns Business School mode analytics: completion count, finish rate, recent completions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Simple admin auth check
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all B-School completions from KV (sorted set, most recent first)
    const completionsRaw = await kv.zrange('holdco:bschool_completions', 0, -1, { rev: true });
    const completions = (completionsRaw || []).map((raw: unknown) => {
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { return null; }
    }).filter(Boolean);

    const totalCompletions = completions.length;

    // Completion stats
    const fullCompletions = completions.filter((c: any) => c.checklistCompleted >= c.checklistTotal).length;
    const partialCompletions = totalCompletions - fullCompletions;
    const avgChecklist = totalCompletions > 0
      ? Math.round((completions.reduce((sum: number, c: any) => sum + (c.checklistCompleted || 0), 0) / totalCompletions) * 10) / 10
      : 0;
    const platformForgedCount = completions.filter((c: any) => c.platformForged).length;

    // Device breakdown
    const deviceBreakdown: Record<string, number> = {};
    for (const c of completions) {
      const device = (c as any).device || 'unknown';
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
    }

    // Completions by day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const byDay: Record<string, number> = {};
    for (const c of completions) {
      const date = (c as any).date;
      if (!date) continue;
      const dayKey = date.slice(0, 10);
      if (new Date(dayKey) >= thirtyDaysAgo) {
        byDay[dayKey] = (byDay[dayKey] || 0) + 1;
      }
    }
    const completionsByDay = Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Recent completions (last 10)
    const recentCompletions = completions.slice(0, 10).map((c: any) => ({
      holdcoName: c.holdcoName,
      checklistCompleted: c.checklistCompleted,
      checklistTotal: c.checklistTotal,
      platformForged: c.platformForged,
      founderEquityValue: c.founderEquityValue,
      device: c.device,
      date: c.date,
    }));

    return res.status(200).json({
      totalCompletions,
      fullCompletions,
      partialCompletions,
      fullCompletionRate: totalCompletions > 0 ? Math.round((fullCompletions / totalCompletions) * 100) : 0,
      avgChecklistCompleted: avgChecklist,
      platformForgedCount,
      platformForgedRate: totalCompletions > 0 ? Math.round((platformForgedCount / totalCompletions) * 100) : 0,
      deviceBreakdown,
      completionsByDay,
      recentCompletions,
    });
  } catch (error) {
    console.error('B-School stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
